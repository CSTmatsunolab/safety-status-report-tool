// src/app/components/FileUpload.tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX, FiImage, FiAlertCircle } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { UploadedFile } from '@/types';
import { PREVIEW_LENGTH } from '@/lib/config/constants';
import { useI18n } from './I18nProvider';

// ファイルサイズの閾値
const S3_THRESHOLD = 18 * 1024 * 1024; // 18MB - これ以上はS3経由
const DEBUG_LOGGING = process.env.DEBUG_LOGGING;
// ファイル数制限（Gateway Timeout対策）
const MAX_FILES = 10;

// タイムアウトエラーメッセージを生成する関数
function getTimeoutErrorMessage(fileType: 'excel' | 'word' | 'pdf' | 'image' | 'text' | 'other', language: string): string {
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

// ファイル破損チェック用の共通関数（マジックバイトで検証）
async function validateFile(file: File, language: string): Promise<{ valid: boolean; error?: string }> {
  // 0バイトファイルのチェック
  if (file.size === 0) {
    return { 
      valid: false, 
      error: language === 'en' 
        ? 'File is empty (0 bytes).'
        : 'ファイルが空です（0バイト）。'
    };
  }

  const buffer = await file.slice(0, 8).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  // マジックバイトの定義
  const signatures = {
    pdf: [0x25, 0x50, 0x44, 0x46],        // %PDF
    zip: [0x50, 0x4B],                     // PK (xlsx, docx, pptx)
    xls: [0xD0, 0xCF, 0x11, 0xE0],        // OLE2 (xls, doc)
    png: [0x89, 0x50, 0x4E, 0x47],        // PNG
    jpg: [0xFF, 0xD8, 0xFF],              // JPEG
    gif: [0x47, 0x49, 0x46],              // GIF
    webp: [0x52, 0x49, 0x46, 0x46],       // RIFF (WebP)
  };

  const matchSignature = (expected: number[]) => 
    expected.every((byte, i) => bytes[i] === byte);

  // PDF
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    if (!matchSignature(signatures.pdf)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'PDF file is corrupted or invalid. Please check the file.'
          : 'PDFファイルが破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // Excel xlsx
  else if (fileName.endsWith('.xlsx') || fileType.includes('spreadsheetml')) {
    if (!matchSignature(signatures.zip)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'Excel file (.xlsx) is corrupted or invalid. Please check the file.'
          : 'Excelファイル（.xlsx）が破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // Excel xls (OLE2形式)
  else if (fileName.endsWith('.xls') || fileType === 'application/vnd.ms-excel') {
    if (!matchSignature(signatures.xls) && !matchSignature(signatures.zip)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'Excel file (.xls) is corrupted or invalid. Please check the file.'
          : 'Excelファイル（.xls）が破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // Word docx
  else if (fileName.endsWith('.docx') || fileType.includes('wordprocessingml')) {
    if (!matchSignature(signatures.zip)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'Word file (.docx) is corrupted or invalid. Please check the file.'
          : 'Wordファイル（.docx）が破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // Word doc (OLE2形式)
  else if (fileName.endsWith('.doc')) {
    if (!matchSignature(signatures.xls)) {  // doc も OLE2形式
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'Word file (.doc) is corrupted or invalid. Please check the file.'
          : 'Wordファイル（.doc）が破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // PNG
  else if (fileName.endsWith('.png') || fileType === 'image/png') {
    if (!matchSignature(signatures.png)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'PNG file is corrupted or invalid. Please check the file.'
          : 'PNGファイルが破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // JPEG
  else if (fileName.match(/\.(jpg|jpeg)$/) || fileType === 'image/jpeg') {
    if (!matchSignature(signatures.jpg)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'JPEG file is corrupted or invalid. Please check the file.'
          : 'JPEGファイルが破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // GIF
  else if (fileName.endsWith('.gif') || fileType === 'image/gif') {
    if (!matchSignature(signatures.gif)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'GIF file is corrupted or invalid. Please check the file.'
          : 'GIFファイルが破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }
  // WebP
  else if (fileName.endsWith('.webp') || fileType === 'image/webp') {
    if (!matchSignature(signatures.webp)) {
      return { 
        valid: false, 
        error: language === 'en' 
          ? 'WebP file is corrupted or invalid. Please check the file.'
          : 'WebPファイルが破損しているか、無効な形式です。ファイルを確認してください。'
      };
    }
  }

  return { valid: true };
}

// PDFファイルかどうかを判定
function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

// PDF警告ツールチップコンポーネント
function PdfWarningTooltip({ language }: { language: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <span className="relative inline-flex items-center ml-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 focus:outline-none"
        aria-label={language === 'en' ? 'PDF format warning' : 'PDF形式の警告'}
      >
        <FiAlertCircle size={18} />
      </button>
      
      {isOpen && (
        <>
          {/* 背景オーバーレイ（クリックで閉じる） */}
          <span 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <span className="absolute left-0 top-full mt-2 z-50 w-72 p-4 bg-amber-50 dark:bg-amber-900/95 border border-amber-300 dark:border-amber-700 rounded-lg shadow-lg block">
            <span className="text-sm text-amber-800 dark:text-amber-100 block">
              <span className="font-bold mb-2 flex items-center">
                <FiAlertCircle className="mr-1" />
                {language === 'en' ? 'PDF Format Notice' : 'PDF形式について'}
              </span>
              <span className="block mb-3 text-amber-700 dark:text-amber-200">
                {language === 'en' 
                  ? 'PDF format may lose structural information (tables, headings, lists), which can reduce report accuracy.'
                  : 'PDF形式は構造情報（表・見出し・リスト）が失われやすく、レポート精度が低下する可能性があります。'}
              </span>
              <span className="block font-semibold mb-2 text-amber-800 dark:text-amber-100">
                {language === 'en' ? '📌 Recommended: Convert to DOCX or MD' : '📌 推奨: DOCX または MD に変換'}
              </span>
              <a
                href={language === 'en' ? '/upload-guide.html#pdf-conversion-en' : '/upload-guide.html#pdf-conversion-ja'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
              >
                {language === 'en' ? 'View details →' : '詳細はこちら →'}
              </a>
            </span>
            {/* 矢印 */}
            <span className="absolute -top-2 left-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-amber-300 dark:border-b-amber-700 block"></span>
          </span>
        </>
      )}
    </span>
  );
}

interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
  onToggleGSN?: (id: string, isGSN: boolean) => void;
}

// S3アップロード用の関数
async function uploadToS3(file: File): Promise<string> {
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

// S3からファイルを処理
async function processFileFromS3(
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

async function extractTextFromImage(file: File, language: 'ja' | 'en'): Promise<{ text: string; confidence?: number; error?: string }> {
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
        // APIからの詳細なエラーメッセージを使用
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
      
      // OCR結果が空の場合（テキストが読み取れない）
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

async function extractTextFromPDF(file: File, language: 'ja' | 'en'): Promise<{ text: string; method: string; confidence?: number; s3Key?: string; error?: string }> {
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
        // APIからの詳細なエラーメッセージを使用
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

// ★ 修正: Base64で保存し、プレビュー用テキストも抽出
async function extractTextFromExcel(file: File, language: string = 'ja'): Promise<{ 
  text: string; 
  preview?: string;
  s3Key?: string; 
  originalContentLength?: number; 
  isBase64?: boolean;
  error?: string 
}> {
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

async function extractTextFromDocx(file: File, language: string = 'ja'): Promise<{ 
  text: string; 
  preview?: string;
  s3Key?: string; 
  originalContentLength?: number;
  isBase64?: boolean;
  error?: string 
}> {
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

export function FileUpload({ files, onUpload, onRemove, onToggleFullText, onToggleGSN }: FileUploadProps) {
  const { t, language } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const totalFiles = files.length + acceptedFiles.length;
    if (totalFiles > MAX_FILES) {
      const remainingSlots = MAX_FILES - files.length;
      if (remainingSlots <= 0) {
        alert(language === 'en'
          ? `Maximum ${MAX_FILES} files allowed. Please remove some files before uploading new ones.`
          : `ファイル数は最大${MAX_FILES}個までです。新しいファイルをアップロードする前に、既存のファイルを削除してください。`);
        return;
      }
      alert(language === 'en'
        ? `You can only upload ${remainingSlots} more file(s). The first ${remainingSlots} file(s) will be uploaded.`
        : `あと${remainingSlots}個のファイルのみアップロードできます。最初の${remainingSlots}個のファイルがアップロードされます。`);
      acceptedFiles = acceptedFiles.slice(0, remainingSlots);
    }
    try {
      setIsProcessing(true);
      const newFiles: UploadedFile[] = [];
      
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        setProcessingStatus(
          language === 'en' 
            ? `Processing: ${file.name} (${i + 1}/${acceptedFiles.length})`
            : `処理中: ${file.name} (${i + 1}/${acceptedFiles.length})`
        );
        
        // ファイルサイズチェック（100MBまで）
        if (file.size > 100 * 1024 * 1024) {
          alert(language === 'en'
            ? `${file.name} is too large. Please upload files under 100MB.`
            : `${file.name}のサイズが大きすぎます。100MB以下のファイルをアップロードしてください。`);
          continue;
        }

        try {
          // ファイル破損チェック（マジックバイト検証）
          const validation = await validateFile(file, language);
          if (!validation.valid) {
            alert(`${file.name}:\n${validation.error}`);
            continue;
          }

          let content = '';
          let extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed' = 'text';
          let ocrConfidence: number | undefined;
          let s3Key: string | undefined;
          let originalContentLength: number | undefined;
          let isBase64 = false;  // バイナリ保存フラグ

          // PDFファイル
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            const result = await extractTextFromPDF(file, language);
            
            // タイムアウトエラーの場合はアラートを表示してスキップ
            if (result.error) {
              alert(`${file.name}:\n${result.error}`);
              continue;
            }
            
            content = result.text;
            extractionMethod = result.confidence ? 'ocr' : result.method === 'embedded-text' ? 'pdf' : 'failed';
            ocrConfidence = result.confidence;
        } else if (file.type.startsWith('image/')) {
            console.log(`Extracting text from image: ${file.name}`);
            const result = await extractTextFromImage(file, language);
            
            // タイムアウトエラーの場合はアラートを表示してスキップ
            if (result.error) {
              alert(`${file.name}:\n${result.error}`);
              continue;
            }
            
            content = result.text;
            extractionMethod = 'ocr';
            ocrConfidence = result.confidence;
        } else if (
            file.type === 'application/vnd.ms-excel' ||
            file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.name.endsWith('.xls') ||
            file.name.endsWith('.xlsx')
          ) {
            console.log(`Extracting binary from Excel: ${file.name}`);
            const excelResult = await extractTextFromExcel(file, language);
            
            // タイムアウトエラーの場合はアラートを表示してスキップ
            if (excelResult.error) {
              alert(`${file.name}:\n${excelResult.error}`);
              continue;
            }
            
            content = excelResult.text;  // Base64 または 空文字
            if (excelResult.s3Key) {
              s3Key = excelResult.s3Key;
            }
            if (excelResult.originalContentLength) {
              originalContentLength = excelResult.originalContentLength;
            }
            if (excelResult.isBase64) {
              isBase64 = true;  // フラグを設定
            }
            extractionMethod = 'excel';
        } else if (
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
          ) {
            console.log(`Extracting binary from DOCX: ${file.name}`);
            const docxResult = await extractTextFromDocx(file, language);
            
            // タイムアウトエラーの場合はアラートを表示してスキップ
            if (docxResult.error) {
              alert(`${file.name}:\n${docxResult.error}`);
              continue;
            }
            
            content = docxResult.text;  // Base64 または 空文字
            if (docxResult.s3Key) {
              s3Key = docxResult.s3Key;
            }
            if (docxResult.originalContentLength) {
              originalContentLength = docxResult.originalContentLength;
            }
            if (docxResult.isBase64) {
              isBase64 = true;  // フラグを設定
            }
            extractionMethod = 'docx';
        } else if (
            // テキスト系ファイル（CSV, TSV, TXT, JSON, Markdown, XML, HTML）
            file.type === 'text/csv' || 
            file.type === 'text/tab-separated-values' ||
            file.type === 'text/plain' || 
            file.type === 'text/markdown' ||
            file.type === 'text/xml' ||
            file.type === 'text/html' ||
            file.type === 'application/json' ||
            file.type === 'application/xml' ||
            file.name.endsWith('.csv') || 
            file.name.endsWith('.tsv') ||
            file.name.endsWith('.txt') ||
            file.name.endsWith('.json') ||
            file.name.endsWith('.md') ||
            file.name.endsWith('.xml') ||
            file.name.endsWith('.html') ||
            file.name.endsWith('.htm')
          ) {
            if (file.size < S3_THRESHOLD) {
              content = await file.text();
              originalContentLength = content.length;
            } else {
              // 大きなCSV/TXTファイルはS3に保存
              console.log(`Large text file (${file.name}), using S3...`);
              s3Key = await uploadToS3(file);
              
              // プレビュー用に最初の部分だけ取得  
              const fullText = await file.text();
              originalContentLength = fullText.length;
              content = fullText.substring(0, PREVIEW_LENGTH);
            }
            extractionMethod = 'text';
        } else {
            content = await file.text();
            originalContentLength = content.length;
            extractionMethod = 'text';
          }

          // ファイルタイプの判定（議事録やGSNの自動検出）
          const lowerFileName = file.name.toLowerCase();
          console.log(`File: ${file.name}, Method: ${extractionMethod}, Content length: ${content.length}${originalContentLength ? `, Original length: ${originalContentLength}` : ''}`);
          if (DEBUG_LOGGING) {
            if (content.length > 0) {
              console.log(`Extracted text (first ${PREVIEW_LENGTH} chars): ${file.name}`);
              console.log(content.substring(0, PREVIEW_LENGTH));
              if (originalContentLength && originalContentLength > PREVIEW_LENGTH) console.log(`...(truncated from ${originalContentLength.toLocaleString()} chars)`);
            }
          }
          const type = lowerFileName.includes('議事録') || lowerFileName.includes('minutes') ? 'minutes' : 'other';
          
          // S3参照ファイルはcontentを空にする判定
          const isDirectlyReadable = (file: File): boolean => {
            const readableTypes = [
              'text/plain',
              'text/csv',
              'text/tab-separated-values',
              'text/markdown',
              'text/xml',
              'text/html',
              'application/json',
              'application/xml',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ];
            
            const readableExtensions = ['.txt', '.csv', '.tsv', '.json', '.md', '.xml', '.html', '.htm', '.xlsx', '.xls', '.docx'];
            
            return readableTypes.includes(file.type) || 
                   readableExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
          };

          newFiles.push({
            id: crypto.randomUUID(),
            name: file.name,
            type,
            content: s3Key && isDirectlyReadable(file) ? '' : content,
            uploadedAt: new Date(),
            includeFullText: false,
            metadata: {
              originalType: file.type,
              extractionMethod,
              size: file.size,
              confidence: ocrConfidence,
              gsnValidation: null,
              isGSN: false,
              userDesignatedGSN: false,
              s3Key: s3Key,
              contentPreview: s3Key ? content : undefined,
              originalContentLength: originalContentLength,
              isBase64: isBase64  // ★ 追加: バイナリ保存フラグ
            }
          });

        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
          alert(language === 'en'
            ? `Failed to process ${file.name}.`
            : `${file.name}の処理に失敗しました。`);
        }
      }
      
    if (newFiles.length > 0) {  
      onUpload(newFiles);
    }
      
      setProcessingStatus('');
    } catch (error) {
      console.error('File processing error:', error);
      alert(language === 'en'
        ? 'An error occurred while processing files.'
        : 'ファイルの処理中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [onUpload, language, files.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.csv', '.tsv', '.md', '.xml', '.html', '.htm'],
      'application/json': ['.json'],
      'application/xml': ['.xml'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    disabled: isProcessing,
  });

  const getFileIcon = (file: UploadedFile) => {
    const metadata = file.metadata as { originalType?: string };
    if (metadata?.originalType?.startsWith('image/')) {
      return <FiImage className="text-purple-500 dark:text-purple-400" />;
    }
    return <FiFile className="text-gray-500 dark:text-gray-400" />;
  };

  const getExtractionBadge = (file: UploadedFile) => {
    const metadata = file.metadata as { extractionMethod?: string };
    const method = metadata?.extractionMethod;
    
    if (method === 'ocr') {
      return <span className="text-sm bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">OCR</span>;
    } else if (method === 'pdf') {
      return <span className="text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">PDF</span>;
    } else if (method === 'excel') {
      return <span className="text-sm bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-1 rounded">Excel</span>;
    } else if (method === 'docx') {
      return <span className="text-sm bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded">Word</span>;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer 
          transition-all duration-200
          ${isDragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800/50'
          }
          ${isProcessing ? 'opacity-50 cursor-wait' : ''}
        `}
      >
        <input {...getInputProps()} disabled={isProcessing} />
        <FiUpload className={`
            mx-auto h-12 w-12 mb-4 transition-colors
            ${isDragActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}
        `} />

        {isProcessing ? (
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              {language === 'en' ? 'Processing files...' : 'ファイルを処理中...'}
            </p>
            {processingStatus && (
              <p className="text-base text-blue-600 dark:text-blue-400">{processingStatus}</p>
            )}
            <p className="text-base text-gray-500 dark:text-gray-400 mt-2">
              {language === 'en' 
                ? 'Large files (>4MB) or OCR processing for images/PDFs may take time'
                : '4MB以上のファイルサイズまたは画像やPDFのOCR処理には時間がかかる場合があります'}
              <br/>
            </p>
          </div>
        ) : isDragActive ? (
          <p className="text-blue-600 dark:text-blue-400">
            {language === 'en' ? 'Drop here...' : 'ここにドロップ...'}
          </p>
        ) : (
          <div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">
              {t('fileUpload.dropzone')}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {language === 'en' 
                ? 'Supported: Text, CSV, PDF, Excel, Word (DOCX), Images (JPG, PNG, etc.)'
                : '対応形式: テキスト、CSV、PDF、Excel、Word (DOCX)、画像 (JPG, PNGなど)'}
            </p>
            <p className="text-sm text-red-400 dark:text-red-400 mt-1">
              {language === 'en'
                ? '※ We recommend enabling "Use Full Text" for GSN files'
                : '※ GSNファイルは全文使用をONにすることを推奨します'}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {language === 'en'
                ? '※ Image-based PDFs and image files use OCR for text extraction'
                : '※ 画像ベースのPDFや画像ファイルはOCRで文字を抽出します'}
              <br/>
              {language === 'en'
                ? '※ For images, image files may have higher accuracy than PDFs'
                : '※ 画像の場合はPDFよりも画像ファイルの方が精度が高くなる可能性があります'}
            </p>
          </div>
        )}
      </div>

      {/* アップロード済みファイルリスト */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700 dark:text-gray-300">
              {language === 'en' ? 'Uploaded files:' : 'アップロード済みファイル:'}
            </h3>
            <span className={`text-sm ${files.length >= MAX_FILES ? 'text-red-500 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {files.length}/{MAX_FILES} {language === 'en' ? 'files' : 'ファイル'}
            </span>
          </div>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md dark:hover:shadow-lg"
            >
              <div className="flex items-center space-x-3">
                {getFileIcon(file)}
                <div className="flex-1">
                  <p className="text-base font-medium text-gray-900 dark:text-white flex items-center">
                      {file.name}
                      {isPdfFile(file.name) && <PdfWarningTooltip language={language} />}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {language === 'en' ? 'Type: ' : 'タイプ: '}
                    {file.type === 'gsn' 
                      ? (language === 'en' ? 'GSN File' : 'GSNファイル')
                      : file.type === 'minutes' 
                        ? (language === 'en' ? 'Minutes' : '議事録')
                        : (language === 'en' ? 'Other' : 'その他')}
                    {file.metadata?.userDesignatedGSN && (
                      <span className="ml-2 text-sm bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        {language === 'en' ? 'User specified' : 'ユーザー指定'}
                      </span>
                    )}
                    {file.metadata?.s3Key ? (
                      <span className="ml-2">
                        ({language === 'en' ? 'Large file' : '大きいファイル'} - {file.metadata?.originalContentLength 
                          ? `${file.metadata.originalContentLength.toLocaleString()} ${language === 'en' ? 'chars' : '文字'}` 
                          : (language === 'en' ? 'char count unknown' : '文字数不明')})
                      </span>
                    ) : file.content.length > 0 ? (
                      <span className="ml-2">
                        ({(file.metadata?.originalContentLength || file.content.length).toLocaleString()} {language === 'en' ? 'chars' : '文字'})
                      </span>
                    ) : (
                      <span className="ml-2 text-red-500 dark:text-red-400">
                        ({language === 'en' ? 'Text extraction failed' : 'テキスト抽出失敗'})
                      </span>
                    )}
                  </p>
                </div>
                {getExtractionBadge(file)}
              </div>
              <div className="flex items-center justify-end space-x-4">

                {/* 1. チェックボックス・グループ (縦並び) */}
                <div className="flex flex-col items-start space-y-1">
                  
                  {/* GSNチェックボックス */}
                  {onToggleGSN && (
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={file.type === 'gsn'}
                        onChange={(e) => onToggleGSN(file.id, e.target.checked)}
                        className="w-4 h-4 text-orange-600 dark:text-orange-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-orange-500 dark:focus:ring-orange-400"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        GSN
                      </span>
                    </label>
                  )}
                  
                  {/* 全文使用チェックボックス */}
                  {(file.content.length > 0 || file.metadata?.s3Key) && (
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={file.includeFullText || false}
                        onChange={(e) => onToggleFullText(file.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 dark:text-blue-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        {language === 'en' ? 'Full Text' : '全文使用'}
                      </span>
                    </label>
                  )}
                </div>

                {/* 2. 削除ボタン */}
                <button
                  onClick={() => onRemove(file.id)}
                  className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <FiX size={18} />
                </button>
                
              </div>
            </div>
          ))}

          {/* GSNファイル推奨案内 */}
          {files.some(f => f.type === 'gsn') && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
                {language === 'en' ? 'Recommended settings for GSN documents' : 'GSNドキュメントの推奨設定'}
              </p>
              <div className="text-base text-amber-700 dark:text-amber-300 space-y-1">
                <p>
                  {language === 'en' 
                    ? '• Checking GSN adds a GSN section to the report structure.'
                    : '・GSNにチェックを入れると，レポート構成にGSNセクションが追加されます'}
                </p>
                <p>
                  {language === 'en' 
                    ? '• Since structure is important for GSN documents, we recommend enabling "Full Text".'
                    : '・GSNドキュメントは構造が重要なため，「全文使用」をONにすることを推奨します'}
                </p>
                <p>
                  {language === 'en' 
                    ? '• We recommend creating GSN files with '
                    : '・GSNファイルは'}
                  <a 
                    href="https://www.matsulab.org/dcase/login.html" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-900 dark:hover:text-amber-100"
                  >
                    D-Case Communicator
                  </a>
                  {language === 'en' 
                    ? ' and using text files exported via "Export LLM Input Text" feature.'
                    : 'で作成し，「Export LLM Input Text」機能で出力されるテキストファイルを使用することをお勧めします'}
                </p>
              </div>
            </div>
          )}

          {/* 画像ベースPDFの警告メッセージ */}
          {files.some(f => !f.metadata?.s3Key && f.content.length === 0) && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-lg text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                {language === 'en' 
                  ? 'Could not extract text from some files'
                  : '一部のファイルからテキストを抽出できませんでした'}
              </p>
              <p className="text-base text-yellow-700 dark:text-yellow-300 mb-2">
                {language === 'en'
                  ? 'These may be image-based files. Try the following:'
                  : '画像ベースのファイルの可能性があります。以下の方法をお試しください：'}
              </p>
              <ul className="text-base text-yellow-700 dark:text-yellow-300 list-disc list-inside space-y-1">
                <li>{language === 'en' 
                  ? 'Save PDF as image (PNG/JPG) and re-upload'
                  : 'PDFを画像（PNG/JPG）として保存し、再アップロード'}</li>
                <li>{language === 'en'
                  ? 'Open PDF in Google Drive and convert to Google Docs'
                  : 'Google DriveでPDFを開き、Googleドキュメントに変換'}</li>
                <li>{language === 'en'
                  ? 'Use Adobe Acrobat to OCR and save as text PDF'
                  : 'Adobe AcrobatなどでOCR処理後、テキストPDFとして保存'}</li>
              </ul>
              
              {/* GSNファイル専用の案内 */}
              {files.some(f => f.name.includes('GSN') && f.content.length === 0) && (
                <div className="mt-3 pt-3 border-t border-yellow-300 dark:border-yellow-700">
                  <p className="text-base text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                    {language === 'en' ? 'Recommended method for GSN diagrams:' : 'GSN図の場合の推奨方法：'}
                  </p>
                  <ol className="text-base text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-1">
                    <li>{language === 'en'
                      ? 'Manually enter GSN elements (G1, S1, C1, etc.) into a text file'
                      : 'GSNの要素（G1, S1, C1など）をテキストファイルに手動で入力'}</li>
                    <li>
                      {language === 'en' ? 'Format example:' : 'フォーマット例：'}
                      <pre className="mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-base overflow-x-auto">
{language === 'en' 
  ? `G1: System can operate safely during demonstration period
→ S1

S1: Discussion divided into system safety and operational risk control
→ G2, G3`
  : `G1: 実証実験期間中、安全に特定運行ができる
→ S1

S1: システム安全と運行時の残存リスク制御に分けた議論
→ G2, G3`}
                      </pre>
                    </li>
                    <li>{language === 'en'
                      ? 'Upload the created text file'
                      : '作成したテキストファイルをアップロード'}</li>
                  </ol>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert(language === 'en'
                        ? 'GSN text format details:\n\n' +
                          '1. Write each element as "ID: content"\n' +
                          '2. Express connections as "→ target ID"\n' +
                          '3. Multiple connections: "→ ID1, ID2"\n\n' +
                          'Element types:\n' +
                          'G: Goal\n' +
                          'S: Strategy\n' +
                          'C: Context\n' +
                          'Sn: Solution'
                        : 'GSNテキスト形式の詳細ガイド:\n\n' +
                          '1. 各要素を「ID: 内容」の形式で記述\n' +
                          '2. 接続は「→ 接続先ID」で表現\n' +
                          '3. 複数接続は「→ ID1, ID2」\n\n' +
                          '要素タイプ:\n' +
                          'G: Goal（ゴール）\n' +
                          'S: Strategy（戦略）\n' +
                          'C: Context（コンテキスト）\n' +
                          'Sn: Solution（ソリューション）'
                      );
                    }}
                    className="text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                  >
                    {language === 'en' ? 'View detailed format guide' : '詳細なフォーマットガイドを見る'}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}