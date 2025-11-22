// src/app/api/s3-process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFileFromS3, deleteFileFromS3 } from '@/lib/s3-utils';
import { getVisionClient } from '@/lib/google-cloud-auth';
import { handleVisionAPIError } from '@/lib/vision-api-utils';
import { MIN_EMBEDDED_TEXT_LENGTH } from '@/lib/config/constants';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import pdf from 'pdf-parse-new';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ProcessResult {
  text: string;
  method: string;
  confidence?: number;
  pdfBuffer?: Buffer;
}

// PDFのOCR処理
async function processPDFWithOCR(buffer: Buffer, fileName: string) {
  try {
    // まず埋め込みテキストを抽出
    const pdfData = await pdf(buffer, {
    });

    const embeddedText = pdfData.text.trim();
    const hasEmbeddedText = embeddedText.length > MIN_EMBEDDED_TEXT_LENGTH;

    if (hasEmbeddedText) {
      console.log(`PDF ${fileName} has embedded text (${embeddedText.length} chars)`);
      return {
        text: embeddedText,
        method: 'embedded-text',
        pdfBuffer: buffer
      };
    }

    // 埋め込みテキストがない場合はOCR
    console.log(`PDF ${fileName} needs OCR processing`);
    const visionClient = await getVisionClient();
    
    if (!visionClient) {
      throw new Error('Vision API client initialization failed');
    }

    const base64Content = buffer.toString('base64');
    const [result] = await visionClient.documentTextDetection({
      image: {
        content: base64Content
      }
    });

    const fullText = result.fullTextAnnotation?.text || '';
    const pages = result.fullTextAnnotation?.pages || [];
    
    let totalConfidence = 0;
    let blockCount = 0;

    pages.forEach(page => {
      if (page.blocks) {
        page.blocks.forEach(block => {
          if (block.confidence !== null && block.confidence !== undefined) {
            totalConfidence += block.confidence;
            blockCount++;
          }
        });
      }
    });

    const averageConfidence = blockCount > 0 ? totalConfidence / blockCount : 0;

    return {
      text: fullText,
      method: 'vision-ocr',
      confidence: averageConfidence,
      pdfBuffer: buffer
    };

  } catch (error) {
    console.error('PDF processing error:', error);
    throw error;
  }
}

// 画像のOCR処理
async function processImageWithOCR(buffer: Buffer) {
  try {
    const visionClient = await getVisionClient();
    
    if (!visionClient) {
      throw new Error('Vision API client initialization failed');
    }

    const base64Content = buffer.toString('base64');
    const [result] = await visionClient.textDetection({
      image: {
        content: base64Content
      }
    });

    const detections = result.textAnnotations || [];
    const fullText = detections[0]?.description || '';

    return {
      text: fullText,
      method: 'vision-ocr'
    };

  } catch (error) {
    console.error('Image OCR error:', error);
    throw error;
  }
}

// Excel処理
async function processExcel(buffer: Buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let fullText = '';

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);
      fullText += `\n--- Sheet: ${sheetName} ---\n${csvContent}`;
    });

    return {
      text: fullText.trim(),
      method: 'xlsx-parse'
    };
  } catch (error) {
    console.error('Excel processing error:', error);
    throw error;
  }
}

// Word処理
async function processWord(buffer: Buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      method: 'mammoth-parse'
    };
  } catch (error) {
    console.error('Word processing error:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  let s3Key: string | undefined;
  let fileName: string | undefined;
  
  try {
    const requestData = await request.json();
    const { key, fileType } = requestData;
    fileName = requestData.fileName;
    const deleteAfterProcess = requestData.deleteAfterProcess !== false; // デフォルトはtrue

    if (!key || !fileName || !fileType) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    s3Key = key;

    // S3からファイルを取得
    console.log(`Fetching file from S3: ${key}`);
    const fileBuffer = await getFileFromS3(key);
    console.log(`File fetched: ${fileName} (${fileBuffer.length} bytes)`);

    // ファイルタイプに応じた処理
    let result: ProcessResult;
    
    switch (fileType) {
      case 'application/pdf':
        result = await processPDFWithOCR(fileBuffer, fileName);
        break;
      
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
        result = await processImageWithOCR(fileBuffer);
        break;
      
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        result = await processExcel(fileBuffer);
        break;
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        result = await processWord(fileBuffer);
        break;
      
      case 'text/plain':
      case 'text/csv':
        result = {
          text: fileBuffer.toString('utf-8'),
          method: 'text-decode'
        };
        break;
      
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    // 処理後にS3から削除
    if (deleteAfterProcess && s3Key) {
      try {
        await deleteFileFromS3(s3Key);
        console.log(`File deleted from S3: ${s3Key}`);
      } catch (deleteError) {
        console.error(`Failed to delete file from S3: ${s3Key}`, deleteError);
        // 削除失敗はエラーにしない（後でクリーンアップジョブで削除される）
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      fileName,
      processedAt: new Date().toISOString(),
      // PDFの場合はBase64エンコードして送信
      ...(result.pdfBuffer ? {
        pdfBufferBase64: result.pdfBuffer.toString('base64'),
        hasPdfBuffer: true
      } : {})
    });

  } catch (error) {
    console.error('File processing error:', error);
    
    // エラー発生時もS3からファイルを削除
    if (s3Key) {
      try {
        await deleteFileFromS3(s3Key);
        console.log(`File deleted from S3 after error: ${s3Key}`);
      } catch (deleteError) {
        console.error(`Failed to delete file from S3 after error: ${s3Key}`, deleteError);
      }
    }

    if (error instanceof Error) {
      const handledError = handleVisionAPIError(error, fileName || 'unknown');
      return NextResponse.json(
        { error: handledError.error, message: handledError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'File processing failed' },
      { status: 500 }
    );
  }
}