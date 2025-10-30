// src/app/api/pdf-extract-from-blob/route.ts
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH } from '@/lib/config/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// CDN伝搬待ち関数
async function waitUntilBlobReady(
  url: string,
  { maxAttempts = 8, baseDelayMs = 500, expectedBytes }: { 
    maxAttempts?: number;
    baseDelayMs?: number;
    expectedBytes?: number;
  } = {},
) {
  if (expectedBytes && expectedBytes > 4 * 1024 * 1024) maxAttempts += 2;
  if (expectedBytes && expectedBytes > 32 * 1024 * 1024) maxAttempts += 4;

  let lastStatus = 0;
  let lastLength = -1;

  for (let i = 1; i <= maxAttempts; i++) {
    const head = await fetch(url, { 
      method: 'HEAD', 
      cache: 'no-store', 
      next: { revalidate: 0 } 
    }).catch(() => null);
    
    if (head) {
      lastStatus = head.status;
      if (head.ok) {
        const lenStr = head.headers.get('content-length');
        lastLength = lenStr ? Number(lenStr) : -1;

        if (!expectedBytes || (lastLength >= expectedBytes)) {
          const get = await fetch(url, { 
            method: 'GET', 
            cache: 'no-store', 
            next: { revalidate: 0 } 
          }).catch(() => null);
          
          if (get?.ok) return get;
          lastStatus = get?.status ?? 0;
        }
      }
    }

    const wait = baseDelayMs * Math.pow(2, i - 1);
    console.log(`Blob待機中 (${i}/${maxAttempts}, status=${lastStatus}, size=${lastLength}). ${wait}ms後に再試行`);
    await new Promise(r => setTimeout(r, wait));
  }

  throw new Error(`Blob準備タイムアウト (${maxAttempts}回試行, 最終ステータス: ${lastStatus})`);
}

export async function POST(req: Request) {
  let blobUrl: string | null = null;
  
  try {
    const formData = await req.formData();
    blobUrl = String(formData.get('blobUrl') || '');
    const fileName = String(formData.get('fileName') || 'unknown');
    const expectedBytes = formData.get('expectedBytes') ? Number(formData.get('expectedBytes')) : undefined;

    if (!blobUrl || !/^https:\/\//.test(blobUrl)) {
      return NextResponse.json({ error: 'Invalid blobUrl' }, { status: 400 });
    }

    console.log(`Processing: ${fileName} from Blob (${expectedBytes} bytes expected)`);

    // CDN伝搬を待ってから取得
    const response = await waitUntilBlobReady(blobUrl, { expectedBytes });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`✅ Blob取得成功: ${buffer.byteLength} bytes`);

    // PDF解析
    const pdf = await import('pdf-parse-new');
    const data = await pdf.default(buffer);
    
    console.log(`PDF解析完了: ${data.numpages}ページ, ${data.text?.length || 0}文字`);
    
    // 埋め込みテキストが十分な場合
    if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
      return NextResponse.json({ 
        text: data.text,
        success: true,
        method: 'embedded-text-from-blob',
        fileName: fileName,
        textLength: data.text.length
      });
    }
    
    // OCR処理が必要な場合
    console.log('画像ベースPDF検出、OCR処理開始...');
    
    try {
      const client = getVisionClient();
      const pages = Array.from({ 
        length: Math.min(data.numpages || PDF_OCR_MAX_PAGES, PDF_OCR_MAX_PAGES) 
      }, (_, i) => i + 1);
      
      const request = {
        requests: [{
          inputConfig: {
            content: buffer,
            mimeType: 'application/pdf'
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION' as const,
            maxResults: 50
          }],
          imageContext: {
            languageHints: ['ja', 'en']
          },
          pages
        }]
      };
      
      const [result] = await client.batchAnnotateFiles(request);
      
      let fullText = '';
      let totalConfidence = 0;
      let confidenceCount = 0;
      
      if (result.responses?.[0]?.responses) {
        for (const response of result.responses[0].responses) {
          if (response.fullTextAnnotation?.text) {
            fullText += response.fullTextAnnotation.text + '\n';
            
            const pages = response.fullTextAnnotation?.pages || [];
            pages.forEach((page: any) => {
              page.blocks?.forEach((block: any) => {
                if (block.confidence) {
                  totalConfidence += block.confidence;
                  confidenceCount++;
                }
              });
            });
          }
        }
      }
      
      const averageConfidence = confidenceCount > 0 
        ? totalConfidence / confidenceCount 
        : 0;
      
      console.log(`OCR完了: ${fullText.length}文字, 信頼度${(averageConfidence * 100).toFixed(1)}%`);
      
      return NextResponse.json({
        text: fullText || data.text || '',
        success: true,
        method: fullText ? 'google-cloud-vision-from-blob' : 'embedded-text-fallback',
        fileName: fileName,
        textLength: fullText.length || data.text?.length || 0,
        confidence: averageConfidence
      });
      
    } catch (visionError: any) {
      console.error('Vision API error:', visionError);
      const errorInfo = handleVisionAPIError(visionError, fileName, data.text || '');
      
      return NextResponse.json({
        text: errorInfo.text || data.text || '',
        success: !!errorInfo.text,
        method: 'fallback-from-blob',
        fileName: fileName,
        error: errorInfo.error,
        message: errorInfo.message
      });
    }
    
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    
    return NextResponse.json({ 
      error: 'PDFの処理に失敗しました',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
    
  } finally {
    // Blob削除
    if (blobUrl) {
      try {
        await del(blobUrl);
        console.log('✅ Blob削除完了');
      } catch (err) {
        console.error('Blob削除失敗:', err);
      }
    }
  }
}