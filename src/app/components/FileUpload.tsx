// src/app/components/FileUpload.tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX, FiImage } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { UploadedFile } from '@/types';
import { PREVIEW_LENGTH } from '@/lib/config/constants';
import { useI18n } from './I18nProvider';

// ファイルサイズの閾値
const S3_THRESHOLD = 4 * 1024 * 1024; // 4MB - これ以上はS3経由

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
      
      if (!response.ok) {
        throw new Error(`Image OCR failed: ${response.status}`);
      }
      
      const result = await response.json();
      return {
        text: result.text || '',
        confidence: result.confidence
      };
    } 
    // 4MB以上はS3経由
    else {
      const s3Key = await uploadToS3(file);
      const result = await processFileFromS3(s3Key, file.name, file.type);
      return {
        text: result.text || '',
        confidence: result.confidence
      };
    }
  } catch (error) {
    console.error('Image OCR error:', error);
    
    // タイムアウトエラーの検出
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { text: '', confidence: 0, error: getTimeoutErrorMessage('image', language) };
    }
    
    if (error instanceof Error && error.name === 'AbortError') {
      alert(language === 'en' ? 'Image OCR processing timed out.' : '画像のOCR処理がタイムアウトしました。');
    } else if (error instanceof Error) {
      alert(language === 'en' 
        ? `Image OCR processing failed: ${error.message}` 
        : `画像のOCR処理に失敗しました: ${error.message}`);
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
      
      if (!response.ok) {
        throw new Error(language === 'en' 
          ? `PDF processing failed: ${response.status}`
          : `PDF処理に失敗しました: ${response.status}`);
      }
      
      const result = await response.json();
      return {
        text: result.text || '',
        method: result.method || 'embedded-text',
        confidence: result.confidence
      };
    } 
    // 4MB以上はS3経由
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

async function extractTextFromExcel(file: File, language: string = 'ja'): Promise<{ text: string; s3Key?: string; originalContentLength?: number; error?: string }> {
  try {
    console.log(`Processing Excel: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < S3_THRESHOLD) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      let allText = '';
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        allText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
      });
      
      return { text: allText, originalContentLength: allText.length };
    } else {
      console.log('Large Excel file, using S3...');
      const s3Key = await uploadToS3(file);
      
      // プレビュー用に最初の部分だけ取得
      const result = await processFileFromS3(s3Key, file.name, file.type);
      const fullText = result.text || '';
      
      return {
        text: fullText.substring(0, PREVIEW_LENGTH),
        s3Key: s3Key,
        originalContentLength: fullText.length
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

async function extractTextFromDocx(file: File, language: string = 'ja'): Promise<{ text: string; s3Key?: string; originalContentLength?: number; error?: string }> {
  try {
    console.log(`Processing Word: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < S3_THRESHOLD) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { text: result.value, originalContentLength: result.value.length };
    } else {
      console.log('Large Word file, using S3...');
      const s3Key = await uploadToS3(file);
      
      // プレビュー用に最初の部分だけ取得
      const result = await processFileFromS3(s3Key, file.name, file.type);
      const fullText = result.text || '';
      
      return {
        text: fullText.substring(0, PREVIEW_LENGTH),
        s3Key: s3Key,
        originalContentLength: fullText.length
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
          let content = '';
          let extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed' = 'text';
          let ocrConfidence: number | undefined;
          let s3Key: string | undefined;
          let originalContentLength: number | undefined;

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
            console.log(`Extracting text from Excel: ${file.name}`);
            const excelResult = await extractTextFromExcel(file, language);
            
            // タイムアウトエラーの場合はアラートを表示してスキップ
            if (excelResult.error) {
              alert(`${file.name}:\n${excelResult.error}`);
              continue;
            }
            
            content = excelResult.text;
            if (excelResult.s3Key) {
              s3Key = excelResult.s3Key;
            }
            if (excelResult.originalContentLength) {
              originalContentLength = excelResult.originalContentLength;
            }
            extractionMethod = 'excel';
        } else if (
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
          ) {
            console.log(`Extracting text from DOCX: ${file.name}`);
            const docxResult = await extractTextFromDocx(file, language);
            
            // タイムアウトエラーの場合はアラートを表示してスキップ
            if (docxResult.error) {
              alert(`${file.name}:\n${docxResult.error}`);
              continue;
            }
            
            content = docxResult.text;
            if (docxResult.s3Key) {
              s3Key = docxResult.s3Key;
            }
            if (docxResult.originalContentLength) {
              originalContentLength = docxResult.originalContentLength;
            }
            extractionMethod = 'docx';
        } else if (
            file.type === 'text/csv' || 
            file.type === 'text/plain' || 
            file.name.endsWith('.csv') || 
            file.name.endsWith('.txt')
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
          if (content.length > 0) {
            console.log(`Extracted text (first ${PREVIEW_LENGTH} chars): ${file.name}`);
            console.log(content.substring(0, PREVIEW_LENGTH));
            if (originalContentLength && originalContentLength > PREVIEW_LENGTH) console.log(`...(truncated from ${originalContentLength.toLocaleString()} chars)`);
          }
          const type = lowerFileName.includes('議事録') || lowerFileName.includes('minutes') ? 'minutes' : 'other';
          
          // S3参照ファイルはcontentを空にする判定
          const isDirectlyReadable = (file: File): boolean => {
            const readableTypes = [
              'text/plain',
              'text/csv', 
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ];
            
            const readableExtensions = ['.txt', '.csv', '.xlsx', '.xls', '.docx'];
            
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
              originalContentLength: originalContentLength
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
  }, [onUpload, language]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.csv'],
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
      return <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">OCR</span>;
    } else if (method === 'pdf') {
      return <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">PDF</span>;
    } else if (method === 'excel') {
      return <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-1 rounded">Excel</span>;
    } else if (method === 'docx') {
      return <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded">Word</span>;
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
              <p className="text-sm text-blue-600 dark:text-blue-400">{processingStatus}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
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
            <p className="text-xs text-red-400 dark:text-red-400 mt-1">
              {language === 'en'
                ? '※ We recommend enabling "Use Full Text" for GSN files'
                : '※ GSNファイルは全文使用をONにすることを推奨します'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
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
          <h3 className="font-medium text-gray-700 dark:text-gray-300">
            {language === 'en' ? 'Uploaded files:' : 'アップロード済みファイル:'}
          </h3>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md dark:hover:shadow-lg"
            >
              <div className="flex items-center space-x-3">
                {getFileIcon(file)}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {language === 'en' ? 'Type: ' : 'タイプ: '}
                    {file.type === 'gsn' 
                      ? (language === 'en' ? 'GSN File' : 'GSNファイル')
                      : file.type === 'minutes' 
                        ? (language === 'en' ? 'Minutes' : '議事録')
                        : (language === 'en' ? 'Other' : 'その他')}
                    {file.metadata?.userDesignatedGSN && (
                      <span className="ml-2 text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
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
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
                {language === 'en' ? 'Recommended settings for GSN documents' : 'GSNドキュメントの推奨設定'}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {language === 'en' 
                  ? '• Checking GSN adds a GSN section to the report structure.\n• Since structure is important for GSN documents, we recommend enabling "Full Text".'
                  : '・GSNにチェックを入れると，レポート構成にGSNセクションが追加されます．\n・GSNドキュメントは構造が重要なため，「全文使用」をONにすることを推奨します．'}
              </p>
            </div>
          )}

          {/* 画像ベースPDFの警告メッセージ */}
          {files.some(f => !f.metadata?.s3Key && f.content.length === 0) && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                {language === 'en' 
                  ? 'Could not extract text from some files'
                  : '一部のファイルからテキストを抽出できませんでした'}
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                {language === 'en'
                  ? 'These may be image-based files. Try the following:'
                  : '画像ベースのファイルの可能性があります。以下の方法をお試しください：'}
              </p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 list-disc list-inside space-y-1">
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
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                    {language === 'en' ? 'Recommended method for GSN diagrams:' : 'GSN図の場合の推奨方法：'}
                  </p>
                  <ol className="text-xs text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-1">
                    <li>{language === 'en'
                      ? 'Manually enter GSN elements (G1, S1, C1, etc.) into a text file'
                      : 'GSNの要素（G1, S1, C1など）をテキストファイルに手動で入力'}</li>
                    <li>
                      {language === 'en' ? 'Format example:' : 'フォーマット例：'}
                      <pre className="mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs overflow-x-auto">
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
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
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