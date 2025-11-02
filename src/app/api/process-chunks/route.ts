// src/app/api/process-chunks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH } from '@/lib/config/constants';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TEMP_DIR = '/tmp/file-chunks';

interface IBlock {
  confidence?: number | null;
}

interface IPage {
  blocks?: IBlock[] | null;
}

export async function POST(request: NextRequest) {
  let uploadDir: string | null = null;
  
  try {
    const { uploadId, fileName, fileType } = await request.json();
    
    if (!uploadId || !fileName || !fileType) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    
    uploadDir = path.join(TEMP_DIR, uploadId);
    
    // チャンク一覧取得
    const files = await fs.readdir(uploadDir);
    const chunkFiles = files
      .filter(f => f.startsWith('chunk_'))
      .sort();
    
    console.log(`Processing ${chunkFiles.length} chunks for ${fileName}`);
    
    // すべてのチャンクを結合
    const chunks: Buffer[] = [];
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(uploadDir, chunkFile);
      const chunkBuffer = await fs.readFile(chunkPath);
      chunks.push(chunkBuffer);
    }
    
    const completeBuffer = Buffer.concat(chunks);
    console.log(`Reconstructed file: ${fileName} (${completeBuffer.length} bytes)`);
    
    // ファイルタイプに応じた処理
    let result;
    switch (fileType) {
      case 'pdf':
        result = await processPDF(completeBuffer, fileName);
        break;
      case 'excel':
        result = await processExcel(completeBuffer);
        break;
      case 'docx':
        result = await processWord(completeBuffer);
        break;
      case 'image':
        result = await processImage(completeBuffer);
        break;
      default:
        result = { text: completeBuffer.toString('utf-8') };
    }
    
    // クリーンアップ
    await fs.rm(uploadDir, { recursive: true, force: true });
    console.log(`Cleaned up: ${uploadId}`);
    
    return NextResponse.json({
      ...result,
      success: true,
      fileName: fileName,
      method: `chunked-${fileType}`
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    
    // クリーンアップ
    if (uploadDir) {
      await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    }
    
    return NextResponse.json(
      { error: 'Processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================
// 処理関数
// ============================================

async function processPDF(buffer: Buffer, fileName: string) {
  const pdf = await import('pdf-parse-new');
  const data = await pdf.default(buffer);
  
  console.log(`PDF parsed: ${data.numpages} pages, ${data.text?.length || 0} characters`);
  
  // 埋め込みテキストが十分な場合
  if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
    return {
      text: data.text,
      method: 'embedded-text',
      textLength: data.text.length
    };
  }
  
  // OCR処理が必要な場合
  console.log('Starting OCR for image-based PDF...');
  
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
          pages.forEach((page: IPage) => {
            if (page.blocks && Array.isArray(page.blocks)) {
              page.blocks.forEach((block: IBlock) => {
                if (block.confidence !== null && block.confidence !== undefined) {
                  totalConfidence += block.confidence;
                  confidenceCount++;
                }
              });
            }
          });
        }
      }
    }
    
    const averageConfidence = confidenceCount > 0 
      ? totalConfidence / confidenceCount 
      : 0;
    
    return {
      text: fullText || data.text || '',
      method: 'ocr',
      textLength: fullText.length || data.text?.length || 0,
      confidence: averageConfidence
    };
    
  } catch (ocrError) {
    console.error('OCR error:', ocrError);
    const errorInfo = handleVisionAPIError(ocrError as Error, fileName, data.text || '');
    
    return {
      text: errorInfo.text || data.text || '',
      method: 'fallback',
      textLength: data.text?.length || 0,
      error: errorInfo.message
    };
  }
}

async function processExcel(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let fullText = '';
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const csvData = XLSX.utils.sheet_to_csv(sheet);
    fullText += `\n--- シート: ${sheetName} ---\n${csvData}\n`;
  });
  
  console.log(`Excel extracted: ${fullText.length} characters, ${workbook.SheetNames.length} sheets`);
  
  return {
    text: fullText,
    textLength: fullText.length,
    sheetCount: workbook.SheetNames.length
  };
}

async function processWord(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  
  console.log(`Word extracted: ${result.value.length} characters`);
  
  return {
    text: result.value,
    textLength: result.value.length,
    messages: result.messages
  };
}

async function processImage(buffer: Buffer) {
  const client = getVisionClient();
  
  const [result] = await client.documentTextDetection({
    image: { content: buffer },
    imageContext: {
      languageHints: ['ja', 'en']
    }
  });
  
  const fullText = result.fullTextAnnotation?.text || '';
  
  // 信頼度計算
  const pages = result.fullTextAnnotation?.pages || [];
  let totalConfidence = 0;
  let confidenceCount = 0;
  
  pages.forEach((page: IPage) => {
    if (page.blocks && Array.isArray(page.blocks)) {
      page.blocks.forEach((block: IBlock) => {
        if (block.confidence !== null && block.confidence !== undefined) {
          totalConfidence += block.confidence;
          confidenceCount++;
        }
      });
    }
  });
  
  const averageConfidence = confidenceCount > 0 
    ? totalConfidence / confidenceCount 
    : 0;
  
  console.log(`OCR completed: ${fullText.length} characters, confidence ${(averageConfidence * 100).toFixed(1)}%`);
  
  return {
    text: fullText,
    textLength: fullText.length,
    confidence: averageConfidence
  };
}