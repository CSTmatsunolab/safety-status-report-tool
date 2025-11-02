// src/app/components/FileUpload.tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX, FiImage, FiInfo } from 'react-icons/fi';
import { UploadedFile } from '@/types';
import { PREVIEW_LENGTH } from '@/lib/config/constants';

interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
  onToggleGSN?: (id: string, isGSN: boolean) => void;
}

// チャンクアップロード設定
const CHUNK_THRESHOLD = 4 * 1024 * 1024; // 4MB
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MBチャンク
const PARALLEL_LIMIT = 3; // 並列アップロード数

// チャンクアップロード共通関数
async function uploadInChunks(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const uploadId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  console.log(`Chunked upload starting: ${file.name} (${totalChunks} chunks)`);
  
  // 並列アップロード
  for (let i = 0; i < totalChunks; i += PARALLEL_LIMIT) {
    const promises = [];
    
    for (let j = 0; j < PARALLEL_LIMIT && (i + j) < totalChunks; j++) {
      const chunkIndex = i + j;
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('fileName', file.name);
      formData.append('fileType', file.type);
      formData.append('totalChunks', totalChunks.toString());
      
      promises.push(
        fetch('/api/chunk-upload', {
          method: 'POST',
          body: formData
        }).then(res => {
          if (!res.ok) throw new Error(`Chunk ${chunkIndex} upload failed`);
          return res.json();
        })
      );
    }
    
    await Promise.all(promises);
    
    // プログレス更新
    if (onProgress) {
      const progress = Math.min(100, ((i + PARALLEL_LIMIT) / totalChunks) * 100);
      onProgress(progress);
    }
  }
  
  console.log(`Chunked upload complete: ${uploadId}`);
  return uploadId;
}

// 画像OCR処理
async function extractTextFromImage(file: File): Promise<{ text: string; confidence?: number }> {
  try {
    console.log(`Uploading Image for OCR: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size >= CHUNK_THRESHOLD) {
      // チャンク分割アップロード
      console.log('Using chunked upload for large image...');
      const uploadId = await uploadInChunks(file);
      
      // 処理実行
      const response = await fetch('/api/process-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          fileType: 'image'
        })
      });
      
      if (!response.ok) throw new Error(`Image OCR failed: ${response.status}`);
      
      const result = await response.json();
      return {
        text: result.text || '',
        confidence: result.confidence
      };
      
    } else {
      // 通常のアップロード（4MB未満）
      const formData = new FormData();
      formData.append('file', file);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch('/api/google-vision-ocr', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('画像ファイルが大きすぎます。10MB以下のファイルをアップロードしてください。');
        }
        throw new Error(`Image OCR failed: ${response.status}`);
      }
      
      const result = await response.json();
      return {
        text: result.text || '',
        confidence: result.confidence
      };
    }
  } catch (error) {
    console.error('Image OCR error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      alert('画像のOCR処理がタイムアウトしました。');
    } else if (error instanceof Error) {
      alert(`画像のOCR処理に失敗しました: ${error.message}`);
    }
    return { text: '', confidence: 0 };
  }
}

// PDF処理
async function extractTextFromPDF(file: File): Promise<{ text: string; method: string; confidence?: number }> {
  try {
    console.log(`Processing PDF: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size >= CHUNK_THRESHOLD) {
      // チャンク分割アップロード
      console.log('File >= 4MB, using chunked upload...');
      const uploadId = await uploadInChunks(file, (progress) => {
        console.log(`Upload progress: ${progress.toFixed(0)}%`);
      });
      
      // 処理実行
      console.log('Processing uploaded chunks...');
      const response = await fetch('/api/process-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          fileType: 'pdf'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('PDF processing failed:', errorData);
        throw new Error(`PDF処理に失敗しました: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`PDF processed successfully: ${result.method}`);
      
      return {
        text: result.text || '',
        method: result.method || 'chunked',
        confidence: result.confidence
      };
      
    } else {
      // 通常のアップロード（4MB未満）
      const formData = new FormData();
      formData.append('file', file);
      
      const controller = new AbortController();
      const timeoutMs = 180000; // 3分に延長
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch('/api/pdf-extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('PDF extraction failed:', errorData);
        
        if (response.status === 413) {
          throw new Error('ファイルサイズが大きすぎます。10MB以下のファイルをアップロードしてください。');
        } else if (response.status === 504) {
          throw new Error('処理がタイムアウトしました。ファイルサイズを小さくしてから再試行してください。');
        }
        throw new Error(`PDF処理に失敗しました: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`PDF extracted successfully using method: ${result.method}`);
      
      // 処理結果に応じたメッセージ
      if (result.method === 'google-cloud-vision' && result.success) {
        console.log(`OCR完了: 信頼度 ${result.confidence ? (result.confidence * 100).toFixed(1) : 'N/A'}%`);
      } else if (result.requiresOcr && result.message) {
        setTimeout(() => {
          alert(`${file.name}:\n\n${result.message}`);
        }, 100);
      }
      
      return { 
        text: result.text || '', 
        method: result.method || 'unknown',
        confidence: result.confidence 
      };
    }
  } catch (error) {
    console.error('PDF extraction error:', error);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        alert('PDFの処理がタイムアウトしました。ファイルサイズを小さくしてから再試行してください。');
      } else {
        alert(`PDFの処理に失敗しました: ${error.message}`);
      }
    }
    
    return { text: '', method: 'failed', confidence: 0 };
  }
}

// Excel処理
async function extractTextFromExcel(file: File): Promise<string> {
  try {
    console.log(`Processing Excel: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size >= CHUNK_THRESHOLD) {
      // チャンク分割アップロード
      console.log('Using chunked upload for large Excel file...');
      const uploadId = await uploadInChunks(file);
      
      // 処理実行
      const response = await fetch('/api/process-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          fileType: 'excel'
        })
      });
      
      if (!response.ok) throw new Error('Excel processing failed');
      
      const result = await response.json();
      console.log(`Excel processed successfully: ${result.textLength} characters`);
      return result.text || '';
      
    } else {
      // 通常のアップロード
      const formData = new FormData();
      formData.append('file', file);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch('/api/excel-extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Excelファイルが大きすぎます。10MB以下のファイルをアップロードしてください。');
        }
        throw new Error(`Excel extraction failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`Excel extracted successfully: ${result.textLength} characters, ${result.sheetCount} sheets`);
      return result.text || '';
    }
  } catch (error) {
    console.error('Excel extraction error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      alert('Excelの処理がタイムアウトしました。');
    } else if (error instanceof Error) {
      alert(`Excelの処理に失敗しました: ${error.message}`);
    }
    return '';
  }
}

// Word処理
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    console.log(`Processing Word: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size >= CHUNK_THRESHOLD) {
      // チャンク分割アップロード
      console.log('Using chunked upload for large Word file...');
      const uploadId = await uploadInChunks(file);
      
      // 処理実行
      const response = await fetch('/api/process-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          fileType: 'docx'
        })
      });
      
      if (!response.ok) throw new Error('Word processing failed');
      
      const result = await response.json();
      console.log(`Word processed successfully: ${result.textLength} characters`);
      return result.text || '';
      
    } else {
      // 通常のアップロード
      const formData = new FormData();
      formData.append('file', file);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch('/api/docx-extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Wordファイルが大きすぎます。10MB以下のファイルをアップロードしてください。');
        }
        throw new Error(`Word extraction failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`Word extracted successfully: ${result.textLength} characters`);
      return result.text || '';
    }
  } catch (error) {
    console.error('Word extraction error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      alert('Wordの処理がタイムアウトしました。');
    } else if (error instanceof Error) {
      alert(`Wordの処理に失敗しました: ${error.message}`);
    }
    return '';
  }
}

// メインコンポーネント
export function FileUpload({ files, onUpload, onRemove, onToggleFullText, onToggleGSN }: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    try {
    const newFiles: UploadedFile[] = [];

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        setProcessingStatus(`処理中: ${file.name} (${i + 1}/${acceptedFiles.length})`);
        
        let content = '';
        let extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed' = 'text';
        let ocrConfidence: number | undefined;

        // PDFファイル
        if (file.type === 'application/pdf') {
          const result = await extractTextFromPDF(file);
          content = result.text;
          extractionMethod = result.confidence ? 'ocr' : result.method === 'embedded-text' ? 'pdf' : 'failed';
          ocrConfidence = result.confidence;
        } else if (file.type.startsWith('image/')) {
          console.log(`Extracting text from image: ${file.name}`);
          const result = await extractTextFromImage(file);
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
          content = await extractTextFromExcel(file);
          extractionMethod = 'excel';
        } else if (
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.name.endsWith('.docx')
        ) {
          console.log(`Extracting text from DOCX: ${file.name}`);
          content = await extractTextFromDocx(file);
          extractionMethod = 'docx';
        } else {
          content = await file.text();
          extractionMethod = 'text';
        }

        // ファイルタイプの判定（議事録やGSNの自動検出）
        const lowerFileName = file.name.toLowerCase();
        console.log(`File: ${file.name}, Method: ${extractionMethod}, Content length: ${content.length}`);
        if (content.length > 0) {
          console.log(`Extracted text (first ${PREVIEW_LENGTH} chars): ${file.name}`);
          console.log(content.substring(0, PREVIEW_LENGTH));
          if (content.length > PREVIEW_LENGTH) console.log('...(truncated)');
        }
        const type = lowerFileName.includes('議事録') || lowerFileName.includes('minutes') ? 'minutes' : 'other';

        newFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type,
          content,
          uploadedAt: new Date(),
          includeFullText: false,
          metadata: {
            originalType: file.type,
            extractionMethod,
            size: file.size,
            confidence: ocrConfidence,
            gsnValidation: null,
            isGSN: false,
            userDesignatedGSN: false
          }
        });
      }
      
      onUpload(newFiles);
      setProcessingStatus('');
    } catch (error) {
      console.error('File processing error:', error);
      alert('ファイルの処理中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']
    },
    multiple: true,
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
            <p className="text-gray-600 dark:text-gray-300 mb-2">ファイルを処理中...</p>
            {processingStatus && (
              <p className="text-sm text-blue-600 dark:text-blue-400">{processingStatus}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              4MB以上のファイルサイズまたは画像やPDFのOCR処理には時間がかかる場合があります<br/>
            </p>
          </div>
        ) : isDragActive ? (
          <p className="text-blue-600 dark:text-blue-400 font-medium">
            ファイルをドロップしてください
          </p>
        ) : (
          <div>
            <p className="text-gray-600 dark:text-gray-300 font-medium">
              ファイルをドラッグ＆ドロップ、またはクリックして選択
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              対応形式: テキスト、CSV、PDF、Excel、Word (DOCX)、画像 (JPG, PNG等)
            </p>
            <p className="text-xs text-red-400 dark:text-red-400 mt-1">
              ※ GSNファイルは全文使用をONにすることを推奨します
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              ※ 画像ベースのPDFや画像ファイルはOCRで文字を抽出します<br/>
              ※ 画像の場合はPDFよりも画像ファイルの方が精度が高くなる可能性があります
            </p>
          </div>
        )}
      </div>

      {/* アップロード済みファイルリスト */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 dark:text-gray-300">
            アップロード済みファイル:
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
                    タイプ: {file.type === 'gsn' ? 'GSNファイル' : 
                            file.type === 'minutes' ? '議事録' : 'その他'}
                    {file.metadata?.userDesignatedGSN && (
                      <span className="ml-2 text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        ユーザー指定
                      </span>
                    )}
                    {file.content.length > 0 ? (
                      <span className="ml-2">
                        ({file.content.length.toLocaleString()} 文字)
                      </span>
                    ) : (
                      <span className="ml-2 text-red-500 dark:text-red-400">
                        (テキスト抽出失敗)
                      </span>
                    )}
                  </p>
                </div>
                {getExtractionBadge(file)}
              </div>
              <div className="flex items-center justify-end space-x-4">

                {/* 1. チェックボックス・グループ (縦並び) */}
                <div className="flex flex-col items-start space-y-1">
                  
                  {/* GSNチェックボックス (mr-2を削除) */}
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
                  {file.content.length > 0 && (
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={file.includeFullText || false}
                        onChange={(e) => onToggleFullText(file.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 dark:text-blue-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        全文使用
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
                GSNドキュメントの推奨設定
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                ・GSNにチェックを入れると，レポート構成にGSNセクションが追加されます．<br/>
                ・GSNドキュメントは構造が重要なため，「全文使用」をONにすることを推奨します．
              </p>
            </div>
          )}

          {/* 画像ベースPDFの警告メッセージ */}
          {files.some(f => f.content.length === 0) && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                一部のファイルからテキストを抽出できませんでした
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                画像ベースのファイルの可能性があります。以下の方法をお試しください：
              </p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 list-disc list-inside space-y-1">
                <li>PDFを画像（PNG/JPG）として保存し、再アップロード</li>
                <li>Google DriveでPDFを開き、Googleドキュメントに変換</li>
                <li>Adobe AcrobatなどでOCR処理後、テキストPDFとして保存</li>
              </ul>
              
              {/* GSNファイル専用の案内 */}
              {files.some(f => f.name.includes('GSN') && f.content.length === 0) && (
                <div className="mt-3 pt-3 border-t border-yellow-300 dark:border-yellow-700">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                    GSN図の場合の推奨方法：
                  </p>
                  <ol className="text-xs text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-1">
                    <li>GSNの要素（G1, S1, C1など）をテキストファイルに手動で入力</li>
                    <li>
                      フォーマット例：
                      <pre className="mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs overflow-x-auto">
{`G1: 実証実験期間中、安全に特定運行ができる
→ S1

S1: システム安全と運行時の残存リスク制御に分けた議論
→ G2, G3`}
                      </pre>
                    </li>
                    <li>作成したテキストファイルをアップロード</li>
                  </ol>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('GSNテキスト形式の詳細ガイド:\n\n' +
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
                    詳細なフォーマットガイドを見る
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