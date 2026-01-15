// src/app/api/pdf-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH } from '@/lib/config/constants';

interface IVisionBlock {
  confidence?: number | null;
}

interface IVisionPage {
  blocks?: IVisionBlock[] | null;
}

/**
 * PDFから抽出されたテキストの不要な改行を除去
 * 日本語の文中で不自然に分割された改行を結合
 */
function cleanPDFText(text: string): string {
  // 文末記号のパターン
  const sentenceEnders = /[。！？.!?\n]/;
  
  // 行ごとに処理
  const lines = text.split('\n');
  const mergedLines: string[] = [];
  let currentParagraph = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 空行は段落の区切りとして保持
    if (!line) {
      if (currentParagraph) {
        mergedLines.push(currentParagraph);
        currentParagraph = '';
      }
      continue;
    }
    
    // 現在の段落が空、または前の行が文末記号で終わっている場合
    if (!currentParagraph || currentParagraph.match(/[。！？.!?]$/)) {
      if (currentParagraph) {
        mergedLines.push(currentParagraph);
      }
      currentParagraph = line;
    } else {
      // 文中の改行は結合（日本語の場合はスペースなし、英語の場合はスペースあり）
      const needsSpace = /[a-zA-Z]$/.test(currentParagraph) && /^[a-zA-Z]/.test(line);
      currentParagraph += needsSpace ? ' ' + line : line;
    }
  }
  
  // 最後の段落を追加
  if (currentParagraph) {
    mergedLines.push(currentParagraph);
  }
  
  // 段落間は改行2つで区切る
  return mergedLines.join('\n\n').trim();
}

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

    console.log(`Processing PDF: ${file.name}, Size: ${file.size} bytes`);

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // まず埋め込みテキストの抽出を試みる
    const pdf = await import('pdf-parse-new');
    const data = await pdf.default(buffer);
    
    console.log(`PDF解析: ${file.name}, 埋め込みテキスト: ${data.text?.length || 0}文字`);
    
    // 十分なテキストがある場合はクリーニング後に返す
    if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
      const cleanedText = cleanPDFText(data.text);
      console.log(`テキストクリーニング: ${data.text.length}文字 → ${cleanedText.length}文字`);
      
      return NextResponse.json({ 
        text: cleanedText,
        success: true,
        method: 'embedded-text',
        fileName: file.name,
        textLength: cleanedText.length,
        originalLength: data.text.length
      });
    }
    
    // 画像ベースPDFの場合、Google Cloud Vision APIを使用
    console.log('画像ベースPDFを検出。Google Cloud Vision APIでOCR実行中...');
    
    try {
      // Vision APIクライアントを取得
      const client = getVisionClient();
      
      // ページ配列を動的に生成
      const pages = Array.from({ 
        length: Math.min(data.numpages || PDF_OCR_MAX_PAGES, PDF_OCR_MAX_PAGES) 
      }, (_, i) => i + 1);
      
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
      const visionClient = await client;
      const [result] = await visionClient.batchAnnotateFiles(request);
      
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
      
      // OCRテキストもクリーニング
      const cleanedText = cleanPDFText(fullText);
      console.log(`OCRテキストクリーニング: ${fullText.length}文字 → ${cleanedText.length}文字`);
      
      return NextResponse.json({
        text: cleanedText,
        success: true,
        method: 'google-cloud-vision',
        fileName: file.name,
        textLength: cleanedText.length,
        originalLength: fullText.length,
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
      
      // フォールバックテキストもクリーニング
      const fallbackText = data.text ? cleanPDFText(data.text) : '';
      
      return NextResponse.json({
        text: fallbackText,
        success: false,
        method: 'embedded-text-fallback',
        fileName: file.name,
        requiresOcr: true,
        error: errorInfo.message,
        message: errorInfo.message,
        textLength: fallbackText.length
      });
    }
    
 } catch (pdfError: unknown) {
  const errorMessage = pdfError instanceof Error ? pdfError.message : String(pdfError);
  console.error('PDF Parse Error:', errorMessage);

  // パスワード保護PDFの検出
  if (
    errorMessage.toLowerCase().includes('encrypted') ||
    errorMessage.toLowerCase().includes('password')
  ) {
    return NextResponse.json(
      { error: 'パスワードで保護されたPDFです。パスワードを解除してから再度アップロードしてください。' },
      { status: 400 }
    );
  }

  // 破損PDFの検出
  if (
    errorMessage.includes('Invalid PDF') ||
    errorMessage.includes('PDF header not found') ||
    errorMessage.includes('Bad') ||
    errorMessage.includes('Missing')
  ) {
    return NextResponse.json(
      { error: 'PDFファイルが破損しているか、無効な形式です。ファイルを確認してください。' },
      { status: 400 }
    );
  }

  // その他のエラー
  return NextResponse.json(
    { error: 'PDFの解析に失敗しました。ファイルが正しいPDF形式か確認してください。' },
    { status: 400 }
  );
}
}