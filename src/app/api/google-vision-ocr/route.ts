// src/app/api/google-vision-ocr/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PREVIEW_LENGTH } from '@/lib/config/constants';

interface IVisionBlock {
  confidence?: number | null;
}
interface IVisionPage {
  blocks?: IVisionBlock[] | null;
}

export async function POST(request: NextRequest) {
  let fileName: string = 'unknown'; 
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'ファイルがアップロードされていません' },
        { status: 400 }
      );
    }

    fileName = file.name;
    console.log(`画像処理開始: ${file.name}, Size: ${file.size} bytes`);
    
    // 4MB以上のファイルはクライアント側でチャンク分割されるため、ここでは4MB未満のみ処理
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Vision APIクライアントを取得（非同期）
    const client = await getVisionClient();
    
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
    
    pages.forEach((page: IVisionPage) => {
      page.blocks?.forEach((block: IVisionBlock) => {
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
    
    // プレビューの表示
    if (fullText.length > 0) {
      console.log(`抽出されたテキスト（最初の${PREVIEW_LENGTH}文字）: ${file.name}`);
      console.log(fullText.substring(0, PREVIEW_LENGTH));
      if (fullText.length > PREVIEW_LENGTH) {
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
    
    return NextResponse.json({ 
      text: fullText,
      success: true,
      confidence: averageConfidence,
      fileName: file.name,
      textLength: fullText.length
    });
  } 
  catch (error: unknown) {
    console.error('Vision API error:', error);
    
    // handleVisionAPIErrorを使用
    const errorResponse = handleVisionAPIError(
      error, 
      fileName || request.headers.get('x-filename') || 'unknown',
      ''  // fallbackText
    );

    // 日本語メッセージへの変換マッピング
    const messageMap: { [key: string]: string } = {
      'OCR quota exceeded': 'APIの利用制限に達しました。しばらく待ってから再試行してください。',
      'Authentication failed': 'Google Cloud Vision APIの認証エラー。APIキーを確認してください。',
      'Invalid file format': '画像フォーマットがサポートされていません。JPG、PNG、GIF、BMPを使用してください。',
      'Vision API error': 'OCR処理中にエラーが発生しました'
    };
    
    let errorCode: number | undefined = undefined;
    let errorMessage: string | undefined = undefined;

    if (typeof error === 'object' && error !== null) {
      if ('code' in error && typeof (error as {code: unknown}).code === 'number') {
        errorCode = (error as { code: number }).code;
      }
      if ('message' in error && typeof (error as {message: unknown}).message === 'string') {
        errorMessage = (error as { message: string }).message;
      }
    }

    // サイズエラーの特別な処理
    if (errorCode === 3 && errorMessage?.includes('size')) {
      return NextResponse.json(
        { 
          error: 'ファイルサイズが大きすぎます（10MB以下にしてください）。',
          details: errorMessage,
          success: false
        },
        { status: 500 }
      );
    }
    
    const japaneseMessage = messageMap[errorResponse.error] || errorResponse.error;
    
    return NextResponse.json(
      { 
        error: japaneseMessage,
        details: errorResponse.details || errorMessage || 'Unknown error',
        success: false
      },
      { status: 500 }
    );
  }
}