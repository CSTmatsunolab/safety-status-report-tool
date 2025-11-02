// src/app/components/FileUpload.tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX, FiImage } from 'react-icons/fi';
import { UploadedFile } from '@/types';
import { PREVIEW_LENGTH } from '@/lib/config/constants';

interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
  onToggleGSN?: (id: string, isGSN: boolean) => void;
}

const CHUNK_THRESHOLD = 4 * 1024 * 1024; // 4MB

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
      deleteAfterProcess: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to process file');
  }

  return await response.json();
}

async function extractTextFromImage(file: File): Promise<{ text: string; confidence?: number }> {
  try {
    console.log(`Processing Image: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (file.size < CHUNK_THRESHOLD) {
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
    if (file.size < CHUNK_THRESHOLD) {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/pdf-extract', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`PDF処理に失敗しました: ${response.status}`);
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
        method: result.method || 'vision-ocr',
        confidence: result.confidence
      };
    }
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        alert('PDFの処理がタイムアウトしました。');
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
    if (file.size < CHUNK_THRESHOLD) {
      // S3にアップロード
      const s3Key = await uploadToS3(file);
      
      // S3から処理
      const result = await processFileFromS3(s3Key, file.name, file.type);
      
      console.log('Excel file processed');
      
    return result.text || '';
    } else {
      // 4MB未満は通常処理
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
        throw new Error(`Excel extraction failed: ${response.status}`);
      }
      
      const result = await response.json();
      return result.text || '';
    }
  } catch (error) {
    console.error('Excel extraction error:', error);
    if (error instanceof Error) {
      alert(`Excelの処理に失敗しました: ${error.message}`);
    }
    return '';
  }
}

// Word処理
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    if (file.size < CHUNK_THRESHOLD) {
      console.log(`Processing Word: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/excel-extract', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Excel extraction failed: ${response.status}`);
        }
        
        const result = await response.json();
        return result.text || '';
      } 
      // 4MB以上はS3経由
      else {
        const s3Key = await uploadToS3(file);
        const result = await processFileFromS3(s3Key, file.name, file.type);
        return result.text || '';
      }
    } catch (error) {
      console.error('Word extraction error:', error);
      if (error instanceof Error) {
        alert(`Wordファイルの処理に失敗しました: ${error.message}`);
      }
    return '';
  }
}

export function FileUpload({ files, onUpload, onRemove, onToggleFullText, onToggleGSN }: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    try {
      setIsProcessing(true);
      const newFiles: UploadedFile[] = [];
      
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        setProcessingStatus(`処理中: ${file.name} (${i + 1}/${acceptedFiles.length})`);
        
        // ファイルサイズチェック（100MBまで）
        if (file.size > 100 * 1024 * 1024) {
          alert(`${file.name}のサイズが大きすぎます。100MB以下のファイルをアップロードしてください。`);
          continue;
        }

        try {
          let content = '';
          let extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed' = 'text';
          let ocrConfidence: number | undefined;

          // PDFファイル
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
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
            id: crypto.randomUUID(),
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

        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
          alert(`${file.name}の処理に失敗しました。`);
        }
      }
      
    if (newFiles.length > 0) {  
      onUpload(newFiles);
    }
      
      setProcessingStatus('');
    } catch (error) {
      console.error('File processing error:', error);
      alert('ファイルの処理中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [files, onUpload]);

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
            <p className="text-gray-600 dark:text-gray-300 mb-2">ファイルを処理中...</p>
            {processingStatus && (
              <p className="text-sm text-blue-600 dark:text-blue-400">{processingStatus}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              4MB以上のファイルサイズまたは画像やPDFのOCR処理には時間がかかる場合があります<br/>
            </p>
          </div>
        ) : isDragActive ? (
          <p className="text-blue-600 dark:text-blue-400">ここにドロップ...</p>
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