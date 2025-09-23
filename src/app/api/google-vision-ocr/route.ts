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

    console.log(`画像処理開始: ${file.name}`);
    
    // ファイルをBufferに変換
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Vision APIクライアントを取得
    const client = getVisionClient();
    
    // Google Cloud Vision APIでOCR実行
    const [result] = await client.documentTextDetection({
      image: { content: buffer },
      imageContext: {
        languageHints: ['ja', 'en'], // 日本語と英語
      },
    });

    // 抽出されたテキスト
    const fullText = result.fullTextAnnotation?.text || '';
    
    // 信頼度の計算
    const pages = result.fullTextAnnotation?.pages || [];
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    pages.forEach((page: any) => {
      page.blocks?.forEach((block: any) => {
        if (block.confidence) {
          totalConfidence += block.confidence;
          confidenceCount++;
        }
      });
    });
    
    const averageConfidence = confidenceCount > 0 
      ? Math.round((totalConfidence / confidenceCount) * 100)
      : 0;
    
    console.log(`OCR完了: ${file.name}, 信頼度: ${averageConfidence}%, 文字数: ${fullText.length}`);
    
    // 最初の500文字を表示
    if (fullText.length > 0) {
      console.log(`抽出されたテキスト（最初の500文字）: ${file.name}`);
      console.log(fullText.substring(0, 500));
      if (fullText.length > 500) {
        console.log('...(以下省略)');
      }
    }
    
    // テキストが抽出できなかった場合
    if (!fullText.trim()) {
      return NextResponse.json({ 
        text: '',
        success: false,
        confidence: 0,
        fileName: file.name,
        message: 'テキストを検出できませんでした。画像にテキストが含まれているか確認してください。'
      });
    }
    
    // GSNファイルの場合は特別な処理
    let processedText = fullText;
    if (file.name.includes('GSN')) {
      processedText = processGSNText(fullText);
    }
    
    return NextResponse.json({ 
      text: processedText,
      success: true,
      confidence: averageConfidence,
      fileName: file.name,
      textLength: processedText.length
    });
    
  } catch (error: any) {
    console.error('OCRエラー:', error);
    
    // エラーの種類に応じたメッセージ
    let errorMessage = 'OCR処理中にエラーが発生しました';
    
    if (error.code === 7 || error.message?.includes('UNAUTHENTICATED')) {
      errorMessage = 'Google Cloud Vision APIの認証エラー。APIキーを確認してください。';
    } else if (error.code === 8 || error.message?.includes('quota')) {
      errorMessage = 'APIの利用制限に達しました。しばらく待ってから再試行してください。';
    } else if (error.code === 3 && error.message?.includes('size')) {
      errorMessage = 'ファイルサイズが大きすぎます（10MB以下にしてください）。';
    } else if (error.code === 3) {
      errorMessage = '画像フォーマットがサポートされていません。JPG、PNG、GIF、BMPを使用してください。';
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error.message,
        success: false
      },
      { status: 500 }
    );
  }
}

// GSNテキストの後処理
function processGSNText(text: string): string {
  let processed = text;
  
  // GSN要素の整形
  processed = processed.replace(/([GCSJH]\d+)\s*[:：]\s*/g, '\n\n$1: ');
  
  // 矢印の正規化
  processed = processed.replace(/[-－ー→]/g, '→');
  
  // 余分な空白の除去
  processed = processed.replace(/\s+/g, ' ');
  processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return processed.trim();
}