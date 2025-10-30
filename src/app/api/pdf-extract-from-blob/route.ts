// src/app/api/pdf-extract-from-blob/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH } from '@/lib/config/constants';

interface IVisionBlock {
  confidence?: number | null;
}

interface IVisionPage {
  blocks?: IVisionBlock[] | null;
}

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null;
  let fileName: string = 'unknown';
  
  try {
    const formData = await request.formData();
    blobUrl = formData.get('blobUrl') as string;
    fileName = formData.get('fileName') as string;

    if (!blobUrl) {
      return NextResponse.json(
        { error: 'Blob URLが提供されていません' },
        { status: 400 }
      );
    }

    // ✅ Blobアップロード成功の確認ログ（見やすい形式）
    console.log('=====================================');
    console.log('✅ Blob Upload Successful');
    console.log(`📁 File: ${fileName}`);
    console.log(`🔗 URL: ${blobUrl}`);
    console.log(`📅 Time: ${new Date().toLocaleString('ja-JP')}`);
    console.log('=====================================');

    // BlobからPDFを取得
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch from Blob: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // PDFテキスト抽出
    const pdf = await import('pdf-parse-new');
    const data = await pdf.default(buffer);
    
    console.log(`📄 PDF処理中: ${fileName} (${data.numpages}ページ, ${data.text?.length || 0}文字)`);
    
    // 十分なテキストがある場合はそのまま返す
    if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
      return NextResponse.json({ 
        text: data.text,
        success: true,
        method: 'embedded-text-from-blob',
        fileName: fileName,
        textLength: data.text.length
      });
    }
    
    // 画像ベースPDFの場合、OCR処理
    console.log(`🔍 OCR処理開始: ${fileName}`);
    
    try {
      const client = getVisionClient();
      const pages = Array.from({ length: Math.min(data.numpages || PDF_OCR_MAX_PAGES, PDF_OCR_MAX_PAGES) }, (_, i) => i + 1);
      
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
      
      if (result.responses && result.responses[0]) {
        const fileResponse = result.responses[0];
        if (fileResponse.responses) {
          for (const response of fileResponse.responses) {
            if (response.fullTextAnnotation?.text) {
              fullText += response.fullTextAnnotation.text + '\n';
              
              const pages = response.fullTextAnnotation?.pages || [];
              pages.forEach((page: IVisionPage) => {
                page.blocks?.forEach((block: IVisionBlock) => {
                  if (block.confidence) {
                    totalConfidence += block.confidence;
                    confidenceCount++;
                  }
                });
              });
            }
          }
        }
      }
      
      const averageConfidence = confidenceCount > 0 
        ? totalConfidence / confidenceCount 
        : 0;
      
      if (!fullText || fullText.trim().length === 0) {
        return NextResponse.json({
          text: '',
          success: false,
          method: 'google-cloud-vision-from-blob',
          fileName: fileName,
          requiresOcr: true,
          message: 'OCR処理に失敗しました。画像が不鮮明な可能性があります。'
        });
      }
      
      console.log(`✅ OCR完了: ${fileName} (${fullText.length}文字, 信頼度${(averageConfidence * 100).toFixed(1)}%)`);
      
      return NextResponse.json({
        text: fullText,
        success: true,
        method: 'google-cloud-vision-from-blob',
        fileName: fileName,
        textLength: fullText.length,
        confidence: averageConfidence,
        ocrPages: pages.length
      });
      
    } catch (visionError) {
      console.error('Vision API error:', visionError);
      const errorInfo = handleVisionAPIError(visionError, fileName, data.text || '');
      
      return NextResponse.json({
        text: errorInfo.text,
        success: errorInfo.success,
        method: 'embedded-text-fallback-from-blob',
        fileName: fileName,
        requiresOcr: errorInfo.requiresOcr,
        error: errorInfo.error,
        message: errorInfo.message,
        details: errorInfo.details,
        textLength: errorInfo.text?.length || 0
      });
    }

  } catch (error) {
    console.error('PDF extraction error:', error);
    
    return NextResponse.json(
      { 
        error: 'PDFの処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
        fileName: fileName
      },
      { status: 500 }
    );
    
  } finally {
    // Blobの即時削除（シンプルな実装）
    if (blobUrl) {
      try {
        await del(blobUrl);
        console.log(`🗑️ Blob削除完了: ${fileName}`);
      } catch (delError) {
        console.error(`⚠️ Blob削除失敗: ${fileName}`, delError);
      }
    }
  }
}