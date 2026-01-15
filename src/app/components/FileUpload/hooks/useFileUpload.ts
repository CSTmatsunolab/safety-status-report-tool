// src/app/components/FileUpload/hooks/useFileUpload.ts
'use client';

import { useCallback, useState } from 'react';
import { useDropzone, Accept } from 'react-dropzone';
import { UploadedFile } from '@/types';
import { PREVIEW_LENGTH } from '@/lib/config/constants';
import { validateFile, isDirectlyReadable } from '../FileValidation';
import {
  S3_THRESHOLD,
  extractTextFromPDF,
  extractTextFromImage,
  extractTextFromExcel,
  extractTextFromDocx,
  processTextFile,
} from '../FileProcessor';

const DEBUG_LOGGING = process.env.DEBUG_LOGGING;
// ファイル数制限（Gateway Timeout対策）
const MAX_FILES = 10;
// 最大ファイルサイズ
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// 受け入れるファイルタイプ
const ACCEPTED_FILE_TYPES: Accept = {
  'text/*': ['.txt', '.csv', '.tsv', '.md', '.xml', '.html', '.htm'],
  'application/json': ['.json'],
  'application/xml': ['.xml'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
};

interface UseFileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  language: string;
}

interface UseFileUploadReturn {
  isProcessing: boolean;
  processingStatus: string;
  getRootProps: ReturnType<typeof useDropzone>['getRootProps'];
  getInputProps: ReturnType<typeof useDropzone>['getInputProps'];
  isDragActive: boolean;
}

export function useFileUpload({ files, onUpload, language }: UseFileUploadProps): UseFileUploadReturn {
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
        if (file.size > MAX_FILE_SIZE) {
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
          let isBase64 = false;

          // PDFファイル
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            const result = await extractTextFromPDF(file, language as 'ja' | 'en');
            
            if (result.error) {
              alert(`${file.name}:\n${result.error}`);
              continue;
            }
            
            content = result.text;
            extractionMethod = result.confidence ? 'ocr' : result.method === 'embedded-text' ? 'pdf' : 'failed';
            ocrConfidence = result.confidence;
          } 
          // 画像ファイル
          else if (file.type.startsWith('image/')) {
            console.log(`Extracting text from image: ${file.name}`);
            const result = await extractTextFromImage(file, language as 'ja' | 'en');
            
            if (result.error) {
              alert(`${file.name}:\n${result.error}`);
              continue;
            }
            
            content = result.text;
            extractionMethod = 'ocr';
            ocrConfidence = result.confidence;
          } 
          // Excelファイル
          else if (
            file.type === 'application/vnd.ms-excel' ||
            file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.name.endsWith('.xls') ||
            file.name.endsWith('.xlsx')
          ) {
            console.log(`Extracting binary from Excel: ${file.name}`);
            const excelResult = await extractTextFromExcel(file, language);
            
            if (excelResult.error) {
              alert(`${file.name}:\n${excelResult.error}`);
              continue;
            }
            
            content = excelResult.text;
            if (excelResult.s3Key) s3Key = excelResult.s3Key;
            if (excelResult.originalContentLength) originalContentLength = excelResult.originalContentLength;
            if (excelResult.isBase64) isBase64 = true;
            extractionMethod = 'excel';
          } 
          // Word (DOCX)ファイル
          else if (
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
          ) {
            console.log(`Extracting binary from DOCX: ${file.name}`);
            const docxResult = await extractTextFromDocx(file, language);
            
            if (docxResult.error) {
              alert(`${file.name}:\n${docxResult.error}`);
              continue;
            }
            
            content = docxResult.text;
            if (docxResult.s3Key) s3Key = docxResult.s3Key;
            if (docxResult.originalContentLength) originalContentLength = docxResult.originalContentLength;
            if (docxResult.isBase64) isBase64 = true;
            extractionMethod = 'docx';
          } 
          // テキスト系ファイル
          else if (isTextFile(file)) {
            const textResult = await processTextFile(file);
            content = textResult.content;
            s3Key = textResult.s3Key;
            originalContentLength = textResult.originalContentLength;
            extractionMethod = 'text';
          } 
          // その他のファイル
          else {
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
              if (originalContentLength && originalContentLength > PREVIEW_LENGTH) {
                console.log(`...(truncated from ${originalContentLength.toLocaleString()} chars)`);
              }
            }
          }
          const type = lowerFileName.includes('議事録') || lowerFileName.includes('minutes') ? 'minutes' : 'other';

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
              isBase64: isBase64
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
    accept: ACCEPTED_FILE_TYPES,
    disabled: isProcessing,
  });

  return {
    isProcessing,
    processingStatus,
    getRootProps,
    getInputProps,
    isDragActive,
  };
}

/**
 * テキスト系ファイルかどうかを判定
 */
function isTextFile(file: File): boolean {
  const textTypes = [
    'text/csv',
    'text/tab-separated-values',
    'text/plain',
    'text/markdown',
    'text/xml',
    'text/html',
    'application/json',
    'application/xml',
  ];
  
  const textExtensions = ['.csv', '.tsv', '.txt', '.json', '.md', '.xml', '.html', '.htm'];
  
  return textTypes.includes(file.type) ||
         textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
}

export { MAX_FILES };
