// src/app/components/FileUpload/FileProcessor.ts

import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { PREVIEW_LENGTH } from '@/lib/config/constants';

// ファイルサイズの閾値
export const S3_THRESHOLD = 18 * 1024 * 1024; // 18MB - これ以上はS3経由

type FileType = 'excel' | 'word' | 'pdf' | 'image' | 'text' | 'other';

/**
 * タイムアウトエラーメッセージを生成する関数
 */
export function getTimeoutErrorMessage(fileType: FileType, language: string): string {
  const baseMessage = language === 'en'
    ? 'Processing timed out because the file is too large.'
    : 'ファイルが大きすぎるため、処理がタイムアウトしました。';
  
  const splitRecommendation = language === 'en'
    ? 'Please try splitting the file into smaller parts.'
    : 'ファイルを分割してお試しください。';
  
  let specificRecommendation = '';
  
  switch (fileType) {
    case 'excel':
      specificRecommendation = language === 'en'
        ? 'Converting to CSV format is also recommended.'
        : 'CSV形式への変換もおすすめです。';
      break;
    case 'word':
      specificRecommendation = language === 'en'
        ? 'Converting to plain text format is also recommended.'
        : 'テキスト形式への変換もおすすめです。';
      break;
    case 'pdf':
      specificRecommendation = language === 'en'
        ? 'Extracting specific pages or converting to text is also recommended.'
        : '特定のページを抽出するか、テキスト形式への変換もおすすめです。';
      break;
    case 'image':
      specificRecommendation = language === 'en'
        ? 'Reducing image resolution or splitting into multiple images is also recommended.'
        : '画像の解像度を下げるか、複数の画像に分割することもおすすめです。';
      break;
    case 'text':
      specificRecommendation = ''; // テキストファイルは分割のみ推奨
      break;
    default:
      specificRecommendation = '';
  }
  
  return specificRecommendation
    ? `${baseMessage}\n${splitRecommendation}\n${specificRecommendation}`
    : `${baseMessage}\n${splitRecommendation}`;
}

/**
 * S3アップロード用の関数
 */
export async function uploadToS3(file: File): Promise<string> {
  const urlResponse = await fetch('/api/s3-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }),
  });

  if (!urlResponse.ok) {
    const error = await urlResponse.json();
    throw new Error(error.error || 'Failed to get upload URL');
  }

  const { uploadUrl, key } = await urlResponse.json();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file to S3');
  }

  return key;
}

/**
 * S3からファイルを処理
 */
export async function processFileFromS3(
  key: string,
  fileName: string,
  fileType: string
): Promise<{ text: string; confidence?: number; method?: string }> {
  const response = await fetch('/api/s3-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      fileName,
      fileType,
      deleteAfterProcess: false,
    }),
  });

  if (!response.ok) {
    // 504 Gateway Timeout の検出
    if (response.status === 504) {
      const error = new Error('TIMEOUT');
      error.name = 'TimeoutError';
      throw error;
    }
    
    let errorMessage = 'Failed to process file';
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // JSONパースに失敗した場合はデフォルトメッセージを使用
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}

export interface ImageExtractionResult {
  text: string;
  confidence?: number;
  error?: string;
}

/**
 * 画像からテキストを抽出
 */
export async function extractTextFromImage(file: File, language: 'ja' | 'en'): Promise<ImageExtractionResult> {
  try {
    console.log(`Processing Image: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < S3_THRESHOLD) {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/google-vision-ocr', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        let errorMessage: string;
        
        if (result.error?.includes('quota') || result.error?.includes('RESOURCE_EXHAUSTED')) {
          errorMessage = language === 'en'
            ? 'OCR quota limit reached. Please try again later or convert the image to text manually.'
            : 'OCRのクォータ制限に達しました。時間をおいて再試行するか、手動でテキストに変換してください。';
        } else if (result.error?.includes('auth') || result.error?.includes('UNAUTHENTICATED')) {
          errorMessage = language === 'en'
            ? 'OCR service authentication failed. Please contact support.'
            : 'OCRサービスの認証に失敗しました。サポートにお問い合わせください。';
        } else if (result.error?.includes('INVALID_ARGUMENT')) {
          errorMessage = language === 'en'
            ? 'Image format is not supported. Please use PNG, JPEG, or GIF.'
            : '画像形式がサポートされていません。PNG、JPEG、GIFを使用してください。';
        } else {
          errorMessage = result.error || (language === 'en'
            ? `Image OCR failed: ${response.status}`
            : `画像のOCR処理に失敗しました: ${response.status}`);
        }
        
        return { text: '', confidence: 0, error: errorMessage };
      }
      
      // OCR結果が空の場合
      if (!result.text || result.text.trim() === '') {
        return { 
          text: '', 
          confidence: 0, 
          error: language === 'en'
            ? 'No text could be detected in the image. The image may not contain readable text, or the text may be too small/blurry.'
            : '画像からテキストを検出できませんでした。画像にテキストが含まれていないか、文字が小さすぎる/不鮮明な可能性があります。'
        };
      }
      
      return {
        text: result.text,
        confidence: result.confidence
      };
    } 
    // S3_THRESHOLD以上はS3経由
    else {
      const s3Key = await uploadToS3(file);
      const result = await processFileFromS3(s3Key, file.name, file.type);
      
      // OCR結果が空の場合
      if (!result.text || result.text.trim() === '') {
        return { 
          text: '', 
          confidence: 0, 
          error: language === 'en'
            ? 'No text could be detected in the image. The image may not contain readable text, or the text may be too small/blurry.'
            : '画像からテキストを検出できませんでした。画像にテキストが含まれていないか、文字が小さすぎる/不鮮明な可能性があります。'
        };
      }
      
      return {
        text: result.text,
        confidence: result.confidence
      };
    }
  } catch (error) {
    console.error('Image OCR error:', error);
    
    // タイムアウトエラーの検出
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { text: '', confidence: 0, error: getTimeoutErrorMessage('image', language) };
    }
    
    // その他のエラー
    if (error instanceof Error) {
      return { 
        text: '', 
        confidence: 0, 
        error: language === 'en' 
          ? `Image processing failed: ${error.message}`
          : `画像処理に失敗しました: ${error.message}`
      };
    }
    
    return { text: '', confidence: 0 };
  }
}

export interface PDFExtractionResult {
  text: string;
  method: string;
  confidence?: number;
  s3Key?: string;
  error?: string;
}

/**
 * PDFからテキストを抽出
 */
export async function extractTextFromPDF(file: File, language: 'ja' | 'en'): Promise<PDFExtractionResult> {
  try {
    console.log(`Processing PDF: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < S3_THRESHOLD) {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/pdf-extract', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || (language === 'en' 
          ? `PDF processing failed: ${response.status}`
          : `PDF処理に失敗しました: ${response.status}`);
        
        return { 
          text: '', 
          method: 'failed', 
          error: errorMessage 
        };
      }
      return {
        text: result.text || '',
        method: result.method || 'embedded-text',
        confidence: result.confidence
      };
    } 
    else {
      const s3Key = await uploadToS3(file);
      const result = await processFileFromS3(s3Key, file.name, file.type || 'application/pdf');
      return {
        text: result.text || '',
        method: result.method || 's3',
        confidence: result.confidence,
        s3Key: result.method === 'embedded-text' ? s3Key : undefined
      };
    }
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    
    // タイムアウトエラーの検出
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { text: '', method: 'failed', error: getTimeoutErrorMessage('pdf', language) };
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        alert(language === 'en' ? 'PDF processing timed out.' : 'PDFの処理がタイムアウトしました。');
      } else {
        alert(language === 'en' 
          ? `PDF processing failed: ${error.message}`
          : `PDFの処理に失敗しました: ${error.message}`);
      }
    }
    
    return { text: '', method: 'failed', confidence: 0 };
  }
}

export interface ExcelExtractionResult {
  text: string;
  preview?: string;
  s3Key?: string;
  originalContentLength?: number;
  isBase64?: boolean;
  error?: string;
}

/**
 * Excelからテキストを抽出（Base64で保存し、プレビュー用テキストも抽出）
 */
export async function extractTextFromExcel(file: File, language: string = 'ja'): Promise<ExcelExtractionResult> {
  try {
    console.log(`Processing Excel (binary): ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < S3_THRESHOLD) {
      const arrayBuffer = await file.arrayBuffer();
      
      // Base64エンコード
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);
      
      // プレビュー用テキスト抽出
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let previewText = '';
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        previewText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
      });
      
      return { 
        text: base64,
        preview: previewText.substring(0, PREVIEW_LENGTH),
        originalContentLength: previewText.length,
        isBase64: true
      };
    } else {
      console.log('Large Excel file, uploading to S3 as binary...');
      const s3Key = await uploadToS3(file);
      
      // プレビュー用にテキスト抽出
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let previewText = '';
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        previewText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
      });
      
      return {
        text: '',
        preview: previewText.substring(0, PREVIEW_LENGTH),
        s3Key: s3Key,
        originalContentLength: previewText.length,
        isBase64: false
      };
    }
  } catch (error) {
    console.error('Excel extraction error:', error);
    
    // タイムアウトエラーの検出
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { text: '', error: getTimeoutErrorMessage('excel', language) };
    }
    
    return { text: '' };
  }
}

export interface DocxExtractionResult {
  text: string;
  preview?: string;
  s3Key?: string;
  originalContentLength?: number;
  isBase64?: boolean;
  error?: string;
}

/**
 * Word (DOCX)からテキストを抽出（Base64で保存し、プレビュー用テキストも抽出）
 */
export async function extractTextFromDocx(file: File, language: string = 'ja'): Promise<DocxExtractionResult> {
  try {
    console.log(`Processing Word (binary): ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < S3_THRESHOLD) {
      const arrayBuffer = await file.arrayBuffer();
      
      // Base64エンコード
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);
      
      // プレビュー用テキスト抽出（extractRawTextはプレビュー専用）
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      return { 
        text: base64,
        preview: result.value.substring(0, PREVIEW_LENGTH),
        originalContentLength: result.value.length,
        isBase64: true
      };
    } else {
      console.log('Large Word file, uploading to S3 as binary...');
      const s3Key = await uploadToS3(file);
      
      // プレビュー用にテキスト抽出
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      return {
        text: '',
        preview: result.value.substring(0, PREVIEW_LENGTH),
        s3Key: s3Key,
        originalContentLength: result.value.length,
        isBase64: false
      };
    }
  } catch (error) {
    console.error('Word extraction error:', error);
    
    // タイムアウトエラーの検出
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { text: '', error: getTimeoutErrorMessage('word', language) };
    }
    
    return { text: '' };
  }
}

/**
 * テキストファイルを処理
 */
export async function processTextFile(file: File): Promise<{
  content: string;
  s3Key?: string;
  originalContentLength: number;
}> {
  if (file.size < S3_THRESHOLD) {
    const content = await file.text();
    return {
      content,
      originalContentLength: content.length
    };
  } else {
    // 大きなCSV/TXTファイルはS3に保存
    console.log(`Large text file (${file.name}), using S3...`);
    const s3Key = await uploadToS3(file);
    
    // プレビュー用に最初の部分だけ取得  
    const fullText = await file.text();
    return {
      content: fullText.substring(0, PREVIEW_LENGTH),
      s3Key,
      originalContentLength: fullText.length
    };
  }
}
