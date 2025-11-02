// src/app/api/process-chunks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { PDF_OCR_MAX_PAGES, MIN_EMBEDDED_TEXT_LENGTH } from '@/lib/config/constants';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 60;

declare global {
  var uploadChunks: Map<string, Map<number, Buffer>> | undefined;
  var uploadMetadata: Map<string, any> | undefined;
}

interface IBlock {
  confidence?: number | null;
}

interface IPage {
  blocks?: IBlock[] | null;
}

export async function POST(request: NextRequest) {
  try {
    const { uploadId, fileName, fileType } = await request.json();
    
    if (!uploadId || !fileName || !fileType) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    
    if (!global.uploadChunks || !global.uploadMetadata) {
      console.error('Upload storage not initialized');
      return NextResponse.json(
        { error: 'Upload storage not available' },
        { status: 500 }
      );
    }
    
    if (!global.uploadChunks.has(uploadId)) {
      console.error(`Upload ${uploadId} not found in memory`);
      return NextResponse.json(
        { error: 'Upload not found. It may have expired or this is a different server instance.' },
        { status: 404 }
      );
    }
    
    const chunksMap = global.uploadChunks.get(uploadId)!;
    const metadata = global.uploadMetadata.get(uploadId);
    
    if (!metadata) {
      console.error(`Metadata for ${uploadId} not found`);
      return NextResponse.json(
        { error: 'Upload metadata not found' },
        { status: 404 }
      );
    }
    
    console.log(`Processing ${chunksMap.size} chunks for ${fileName}`);
    
    const totalChunks = metadata.totalChunks;
    if (chunksMap.size !== totalChunks) {
      console.error(`Expected ${totalChunks} chunks, but got ${chunksMap.size}`);
      return NextResponse.json(
        { error: `Incomplete upload. Expected ${totalChunks} chunks, received ${chunksMap.size}` },
        { status: 400 }
      );
    }
    
    const chunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunksMap.get(i);
      if (!chunk) {
        console.error(`Missing chunk ${i} for upload ${uploadId}`);
        return NextResponse.json(
          { error: `Missing chunk ${i}` },
          { status: 400 }
        );
      }
      chunks.push(chunk);
    }
    
    const completeBuffer = Buffer.concat(chunks);
    console.log(`Reconstructed file: ${fileName} (${completeBuffer.length} bytes)`);
    
    global.uploadChunks.delete(uploadId);
    global.uploadMetadata.delete(uploadId);
    console.log(`Cleaned up upload: ${uploadId}`);
    
    let result;
    switch (fileType) {
      case 'pdf':
      case 'application/pdf':
        result = await processPDF(completeBuffer, fileName);
        break;
      case 'excel':
      case 'application/vnd.ms-excel':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        result = await processExcel(completeBuffer);
        break;
      case 'docx':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        result = await processWord(completeBuffer);
        break;
      case 'image':
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
        result = await processImage(completeBuffer);
        break;
      default:
        result = { text: completeBuffer.toString('utf-8') };
    }
    
    return NextResponse.json({
      ...result,
      success: true,
      fileName: fileName,
      method: `chunked-${fileType}`
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// 処理関数
async function processPDF(buffer: Buffer, fileName: string) {
  const pdf = await import('pdf-parse-new');
  const data = await pdf.default(buffer);
  
  console.log(`PDF parsed: ${data.numpages} pages, ${data.text?.length || 0} characters`);
  
  if (data.text && data.text.trim().length > MIN_EMBEDDED_TEXT_LENGTH) {
    return {
      text: data.text,
      method: 'embedded-text',
      textLength: data.text.length
    };
  }
  
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