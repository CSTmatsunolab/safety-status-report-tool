// src/app/api/pdf-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH, PREVIEW_LENGTH } from '@/lib/config/constants';

interface IVisionBlock {
  confidence?: number | null;
}

interface IVisionPage {
  blocks?: IVisionBlock[] | null;
}

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'ファイルがアップロードされていません' },
        { status: 400 }
      );
    }

    console.log(`Processing PDF: ${file.name}, Size: ${file.size} bytes`);

    // ファイルサイズチェック（4MB以上の場合はBlob経由）
    const USE_BLOB_THRESHOLD = 4 * 1024 * 1024; // 4MB
    let buffer: Buffer;

    if (file.size > USE_BLOB_THRESHOLD) {
      console.log('Large file detected, using Vercel Blob storage');
      
      // Vercel Blobにアップロード
      const blob = await put(`temp/pdf-${Date.now()}-${file.name}`, file, {
        access: 'public',
        addRandomSuffix: true,
      });
      
      blobUrl = blob.url;
      console.log(`File uploaded to Blob: ${blobUrl}`);
      
      // BlobからBufferを取得
      const response = await fetch(blobUrl);
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      // 小さいファイルは直接処理
      buffer = Buffer.from(await file.arrayBuffer());
    }
    
    // まず埋め込みテキストの抽出を試みる
    const pdf = await import('pdf-parse-new');
    const data = await pdf.default(buffer);
    
    console.log(`PDF解析: ${file.name}, 埋め込みテキスト: ${data.text?.length || 0}文字`);
    
    // 十分なテキストがある場合はそのまま返す
    if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
      // Blobを使用した場合はクリーンアップ
      if (blobUrl) {
        await del(blobUrl).catch(err => 
          console.error('Blob deletion failed:', err)
        );
      }
      
      return NextResponse.json({ 
        text: data.text,
        success: true,
        method: 'embedded-text',
        fileName: file.name,
        textLength: data.text.length
      });
    }
    
    // 画像ベースPDFの場合、Google Cloud Vision APIを使用
    console.log('画像ベースPDFを検出。Google Cloud Vision APIでOCR実行中...');
    
    try {
      // Vision APIクライアントを取得
      const client = getVisionClient();
      
      // ページ配列を動的に生成
      const pages = Array.from({ length: PDF_OCR_MAX_PAGES }, (_, i) => i + 1);
      
      // PDFをGoogle Cloud Vision APIで処理
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
      
      // テキストを結合し、信頼度を計算
      let fullText = '';
      let totalConfidence = 0;
      let confidenceCount = 0;
      
      if (result.responses && result.responses[0]) {
        const fileResponse = result.responses[0];
        if (fileResponse.responses) {
          for (const response of fileResponse.responses) {
            if (response.fullTextAnnotation?.text) {
              fullText += response.fullTextAnnotation.text + '\n';
              
              // 信頼度の計算
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
      
      // Blobクリーンアップ
      if (blobUrl) {
        await del(blobUrl).catch(err => 
          console.error('Blob deletion failed:', err)
        );
      }
      
      if (!fullText || fullText.trim().length === 0) {
        return NextResponse.json({
          text: '',
          success: false,
          method: 'google-cloud-vision',
          fileName: file.name,
          requiresOcr: true,
          message: 'OCR処理に失敗しました。画像が不鮮明な可能性があります。'
        });
      }
      
      return NextResponse.json({
        text: fullText,
        success: true,
        method: 'google-cloud-vision',
        fileName: file.name,
        textLength: fullText.length,
        confidence: averageConfidence,
        ocrPages: pages.length
      });
      
    } catch (visionError) {
      console.error('Vision API error:', visionError);
      const errorInfo = handleVisionAPIError(
        visionError,
        file.name,
        data.text || ''
      );
      
      // Blobクリーンアップ
      if (blobUrl) {
        await del(blobUrl).catch(err => 
          console.error('Blob deletion failed:', err)
        );
      }
      
      return NextResponse.json({
        text: data.text || '',
        success: false,
        method: 'embedded-text-fallback',
        fileName: file.name,
        requiresOcr: true,
        error: errorInfo.message,
        message: errorInfo.message,
        textLength: data.text?.length || 0
      });
    }
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    
    // エラー時もBlobをクリーンアップ
    if (blobUrl) {
      await del(blobUrl).catch(err => 
        console.error('Blob deletion failed during error handling:', err)
      );
    }
    
    return NextResponse.json(
      { 
        error: 'PDFの処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}