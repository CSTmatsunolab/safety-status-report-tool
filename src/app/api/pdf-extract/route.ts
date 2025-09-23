import { NextRequest, NextResponse } from 'next/server';
import { getVisionClient } from '@/lib/google-cloud-auth';

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
    if (data.text && data.text.trim().length > 100) {
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
          pages: [1, 2, 3, 4, 5] // 最大5ページまで処理
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
        });
      }
      
      // GSNファイルの場合は整形
      const processedText = file.name.includes('GSN') 
        ? processGSNText(fullText) 
        : fullText.trim();
      
      return NextResponse.json({ 
        text: processedText,
        success: true,
        method: 'google-cloud-vision',
        fileName: file.name,
        textLength: processedText.length
      });
      
    } catch (visionError: any) {
      console.error('Vision API エラー:', visionError);
      
      // API使用制限エラー
      if (visionError.code === 8 || visionError.message?.includes('quota')) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          method: 'quota-exceeded',
          fileName: file.name,
          message: 'APIの使用制限に達しました。しばらく待ってから再試行してください。',
        });
      }
      
      // ページ数制限エラーの場合
      if (visionError.message?.includes('pages') || visionError.message?.includes('exceeds') || visionError.code === 3) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          method: 'too-many-pages',
          fileName: file.name,
          message: 'PDFが5ページを超えています。各ページを画像 (PNGやJPGなど)として保存してアップロードしてください。',
          requiresOcr: true
        });
      }
      
      // 認証エラーの場合
      if (visionError.code === 7 || visionError.message?.includes('UNAUTHENTICATED')) {
        console.error('Google Cloud認証エラー: APIキーまたは認証情報を確認してください');
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          method: 'auth-failed',
          fileName: file.name,
          message: 'Google Cloud Vision APIの認証に失敗しました。管理者にお問い合わせください。',
        });
      }
      
      // ファイルサイズエラー
      if (visionError.message?.includes('size') || visionError.code === 3) {
        return NextResponse.json({ 
          text: data.text || '', 
          success: false,
          method: 'file-too-large',
          fileName: file.name,
          message: 'ファイルサイズが大きすぎます（10MB以下にしてください）。',
        });
      }
      
      // その他のエラーはフォールバック
      return NextResponse.json({ 
        text: data.text || '', 
        success: false,
        method: 'ocr-failed',
        fileName: file.name,
        message: `OCR処理に失敗しました: ${visionError.message || 'Unknown error'}`,
        details: visionError.message
      });
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

// GSNテキストの整形
function processGSNText(text: string): string {
  let processed = text;
  
  // GSN要素の整形
  processed = processed.replace(/([GCSJH]\d+)\s*[:：]\s*/g, '\n\n$1: ');
  processed = processed.replace(/[-－ー→]/g, '→');
  processed = processed.replace(/\s+/g, ' ');
  processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return processed.trim();
}