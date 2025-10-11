// src/app/api/pdf-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH, PREVIEW_LENGTH } from '@/lib/config/constants';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'ファイルがアップロードされていません' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // まず埋め込みテキストの抽出を試みる
    const pdf = await import('pdf-parse-new');
    const data = await pdf.default(buffer);
    
    console.log(`PDF解析: ${file.name}, 埋め込みテキスト: ${data.text?.length || 0}文字`);
    
    // 十分なテキストがある場合はそのまま返す
    if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
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
      }
      
      const averageConfidence = confidenceCount > 0 
        ? Math.round((totalConfidence / confidenceCount) * 100)
        : 0;
      
      // テキストが抽出できなかった場合
      if (!fullText.trim()) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          method: 'ocr-no-text',
          fileName: file.name,
          message: 'OCRでテキストを検出できませんでした。画像の品質を確認してください。',
          confidence: 0
        });
      }
      
      const processedText = fullText.trim();  // processGSNTextを削除
      
      // OCR結果をログ
      console.log(`OCR完了: ${file.name}, 信頼度: ${averageConfidence}%, 文字数: ${processedText.length}`);

      // プレビュー表示
      if (processedText.length > 0) {
        console.log(`抽出されたテキスト（最初の${PREVIEW_LENGTH}文字）:`);
        console.log(processedText.substring(0, PREVIEW_LENGTH));
        if (processedText.length > PREVIEW_LENGTH) {
          console.log('...(以下省略)');
        }
      }
      
      return NextResponse.json({ 
        text: processedText,
        success: true,
        method: 'google-cloud-vision',
        fileName: file.name,
        textLength: processedText.length,
        confidence: averageConfidence
      });
      
    } catch (visionError: any) {
      // 共通のエラーハンドラーを使用
      const errorResponse = handleVisionAPIError(visionError, file.name, data.text || '');
      
      // 特殊なエラーケースの処理
      
      // API使用制限エラー
      if (visionError.code === 8 || visionError.message?.includes('quota')) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          error: 'quota-exceeded',
          method: 'quota-exceeded',
          fileName: file.name,
          message: 'APIの使用制限に達しました。しばらく待ってから再試行してください。',
        });
      }
      
      // ページ数制限エラー
      if (visionError.message?.includes('pages') || visionError.message?.includes('exceeds') || 
          (visionError.code === 3 && visionError.message?.includes('pages'))) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          error: 'too-many-pages',
          method: 'too-many-pages',
          fileName: file.name,
          message: `PDFが${PDF_OCR_MAX_PAGES}ページを超えています。各ページを画像 (PNGやJPGなど)として保存してアップロードしてください。`,
          requiresOcr: true
        });
      }
      
      // 認証エラー
      if (visionError.code === 7 || visionError.message?.includes('UNAUTHENTICATED')) {
        console.error('Google Cloud認証エラー: APIキーまたは認証情報を確認してください');
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          error: 'auth-failed',
          method: 'auth-failed',
          fileName: file.name,
          message: 'Google Cloud Vision APIの認証に失敗しました。管理者にお問い合わせください。',
        });
      }
      
      // ファイルサイズエラー
      if (visionError.message?.includes('size') && visionError.code === 3) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          error: 'file-too-large',
          method: 'file-too-large',
          fileName: file.name,
          message: 'ファイルサイズが大きすぎます（10MB以下にしてください）。',
        });
      }
      
      // 共通エラーハンドラーの結果を使用
      return NextResponse.json(errorResponse);
    }
    
  } catch (error) {
    console.error('PDF処理エラー:', error);
    
    return NextResponse.json({ 
      text: '', 
      success: false,
      error: 'PDF処理に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}