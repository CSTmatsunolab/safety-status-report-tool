// src/app/components/FileUpload.tsx
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX, FiImage } from 'react-icons/fi';
import { UploadedFile } from '@/types';
import { PREVIEW_LENGTH, IMAGE_FILE_EXTENSIONS } from '@/lib/config/constants';
import { processGSNText, validateGSNText } from '@/lib/text-processing';

interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
}

function isGSNFile(fileName: string, content: string): boolean {
  // ファイル名にGSNが含まれる
  if (fileName.toLowerCase().includes('gsn')) {
    return true;
  }
  
  // 内容にGSN要素が含まれる（G1, S1などのパターン）
  const gsnPattern = /\b[GgSsCcEe]\d+\b/;
  if (gsnPattern.test(content)) {
    // GSN要素が3つ以上含まれる場合はGSNファイルと判定
    const matches = content.match(/\b[GgSsCcEe]\d+\b/g);
    return matches ? matches.length >= 3 : false;
  }
  
  return false;
}

function needsGSNFormatting(content: string): boolean {
  // すでに整形済みフォーマット（[Goal G1]: など）があるかチェック
  if (content.includes('[Goal') || content.includes('[Strategy')) {
    return false;
  }
  
  // GSN要素があるが整形されていない場合
  const hasGSNElements = /\b[GgSsCcEe]\d+\b/.test(content);
  return hasGSNElements;
}

// 画像ファイルからテキストを抽出する関数（Google Cloud Vision使用）
async function extractTextFromImage(file: File): Promise<{ text: string; confidence?: number }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/google-vision-ocr', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`OCR failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`Google Cloud Vision OCR completed: ${file.name}`);
      return { 
        text: result.text || '', 
        confidence: result.confidence 
      };
    }
    
    // エラーメッセージがある場合
    if (result.message) {
      console.error('OCR error:', result.message);
    }
    
    return { text: '', confidence: 0 };
  } catch (error) {
    console.error('Image OCR error:', error);
    return { text: '', confidence: 0 };
  }
}

// PDFをテキストに変換する関数（Google Cloud Vision OCR対応）
async function extractTextFromPDF(file: File): Promise<{ text: string; method: string; confidence?: number }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    // Google Cloud Vision対応のPDF処理
    const response = await fetch('/api/pdf-extract', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('PDF extraction failed:', errorData);
      throw new Error(`PDF extraction failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`PDF extracted using method: ${result.method}`);
    
    // 処理結果に応じたメッセージ
    if (result.method === 'google-cloud-vision' && result.success) {
      console.log('Google Cloud Vision APIでOCR処理完了');
    } else if (result.requiresOcr && result.message) {
      // 非同期でアラートを表示（処理をブロックしない）
      setTimeout(() => {
        alert(`${file.name}:\n\n${result.message}`);
      }, 100);
    }
    
    return { 
      text: result.text || '', 
      method: result.method || 'unknown',
      confidence: result.confidence 
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    return { text: '', method: 'failed', confidence: 0 };
  }
}

// Excelをテキストに変換する関数
async function extractTextFromExcel(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/excel-extract', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Excel extraction failed: ${response.status}`);
    }
    
    const { text } = await response.json();
    return text || '';
  } catch (error) {
    console.error('Excel extraction error:', error);
    return '';
  }
}

// Wordをテキストに変換する関数
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/docx-extract', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`DOCX extraction failed: ${response.status}`);
    }
    
    const { text, messages } = await response.json();
    
    // 警告メッセージがある場合はコンソールに表示
    if (messages && messages.length > 0) {
      console.log(`DOCX extraction warnings for ${file.name}:`, messages);
    }
    
    return text || '';
  } catch (error) {
    console.error('DOCX extraction error:', error);
    return '';
  }
}

export default function FileUpload({ files, onUpload, onRemove, onToggleFullText}: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  
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
        let gsnValidation: any = null;  
        
        // ファイルタイプに応じて適切な処理を行う
        if (file.type === 'application/pdf') {
          console.log(`Extracting text from PDF: ${file.name}`);
          const result = await extractTextFromPDF(file);
          content = result.text;
          extractionMethod = content.length > 0 ? 'pdf' : 'failed';
          ocrConfidence = result.confidence;
        } else if (file.type.startsWith('image/')) {
          // 画像ファイルの場合
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
          // テキスト・CSVファイルは直接読み込む
          try {
            content = await file.text();
            extractionMethod = 'text';
          } catch (error) {
            console.log(`Could not read file ${file.name} as text`);
            extractionMethod = 'failed';
          }
        }
        
        console.log(`File: ${file.name}, Method: ${extractionMethod}, Content length: ${content.length}`);

        const isGSN = isGSNFile(file.name, content);
      
        if (isGSN && content.length > 0) {
          console.log(`GSN file detected: ${file.name}`);
          
          // GSNテキストの整形が必要か判定
          if (extractionMethod === 'ocr' || needsGSNFormatting(content)) {
            console.log('Applying GSN formatting...');
            const originalLength = content.length;
            content = processGSNText(content);
            console.log(`GSN formatting applied: ${originalLength} -> ${content.length} characters`);
          }
          
          // GSN構造の妥当性チェック
          gsnValidation = validateGSNText(content);
          console.log('GSN validation:', gsnValidation);
          
          if (!gsnValidation.isValid) {
            console.warn(`GSN validation issues for ${file.name}:`, gsnValidation.issues);
          }
        }

        // Show preview of extracted text
        if (content.length > 0) {
          console.log(`Extracted text (first ${PREVIEW_LENGTH} chars): ${file.name}`);
          console.log(content.substring(0, PREVIEW_LENGTH));
          if (content.length > PREVIEW_LENGTH) {
            console.log('...(truncated)');
          }
        }

        // ファイル名からタイプを判定
        const type = isGSN ? 'gsn' :
                     file.name.includes('議事録') ? 'minutes' : 'other';
        
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
            gsnValidation: gsnValidation,
            isGSN: isGSN
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
    const metadata = file.metadata as any;
    if (metadata?.originalType?.startsWith('image/')) {
      return <FiImage className="text-purple-500" />;
    }
    return <FiFile className="text-gray-500" />;
  };

  const getExtractionBadge = (file: UploadedFile) => {
    const metadata = file.metadata as any;
    const method = metadata?.extractionMethod;
    
    if (method === 'ocr') {
      return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">OCR</span>;
    } else if (method === 'pdf') {
      return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">PDF</span>;
    } else if (method === 'excel') {
      return <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Excel</span>;
    }else if (method === 'docx') {
    return <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Word</span>;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}
      >
        <input {...getInputProps()} disabled={isProcessing} />
        <FiUpload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        {isProcessing ? (
          <div>
            <p className="text-gray-600 mb-2">ファイルを処理中...</p>
            {processingStatus && (
              <p className="text-sm text-blue-600">{processingStatus}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              画像やPDFのOCR処理には時間がかかる場合があります
            </p>
          </div>
        ) : isDragActive ? (
          <p className="text-blue-600">ファイルをドロップしてください</p>
        ) : (
          <div>
            <p className="text-gray-600">
              ファイルをドラッグ＆ドロップ、またはクリックして選択
            </p>
            <p className="text-sm text-gray-500 mt-2">
              対応形式: テキスト、CSV、PDF、Excel、Word (DOCX)、画像 (JPG, PNG等)
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ※ 画像ベースのPDFや画像ファイルはOCRで文字を抽出します<br/>
              ※ 画像の場合はPDFよりも画像ファイルの方が精度が高くなる可能性があります
            </p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700">アップロード済みファイル:</h3>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between bg-gray-50 p-3 rounded-md"
            >
              <div className="flex items-center space-x-3">
                {getFileIcon(file)}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    タイプ: {file.type === 'gsn' ? 'GSNファイル' : 
                            file.type === 'minutes' ? '議事録' : 'その他'}
                    {file.content.length > 0 ? (
                      <span className="ml-2">
                        ({file.content.length.toLocaleString()} 文字)
                      </span>
                    ) : (
                      <span className="ml-2 text-red-500">
                        (テキスト抽出不可 - 画像形式での再アップロードを推奨)
                      </span>
                    )}
                  </p>
                </div>
                {getExtractionBadge(file)}
              </div>
                <div className="flex items-center space-x-2">
                  {file.content.length > 0 && (
                    <label className="flex items-center cursor-pointer mr-2">
                      <input
                        type="checkbox"
                        checked={file.includeFullText || false}
                        onChange={(e) => onToggleFullText(file.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">全文使用</span>
                    </label>
                  )}
                  
                  <button
                    onClick={() => onRemove(file.id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                  >
                    <FiX size={18} />
                  </button>
              </div>
            </div>
          ))}
          
          {/* 画像ベースPDFの警告メッセージ */}
          {files.some(f => f.content.length === 0) && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800 font-medium mb-2">
                ⚠️ 一部のファイルからテキストを抽出できませんでした
              </p>
              <p className="text-xs text-yellow-700 mb-2">
                画像ベースのファイルの可能性があります。以下の方法をお試しください：
              </p>
              <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1">
                <li>PDFを画像（PNG/JPG）として保存し、再アップロード</li>
                <li>Google DriveでPDFを開き、Googleドキュメントに変換</li>
                <li>Adobe AcrobatなどでOCR処理後、テキストPDFとして保存</li>
              </ul>
              
              {/* GSNファイル専用の案内 */}
              {files.some(f => f.name.includes('GSN') && f.content.length === 0) && (
                <div className="mt-3 pt-3 border-t border-yellow-300">
                  <p className="text-sm text-yellow-800 font-medium mb-2">
                    📋 GSN図の場合の推奨方法：
                  </p>
                  <ol className="text-xs text-yellow-700 list-decimal list-inside space-y-1">
                    <li>GSNの要素（G1, S1, C1など）をテキストファイルに手動で入力</li>
                    <li>
                      フォーマット例：
                      <pre className="mt-1 p-2 bg-yellow-100 rounded text-xs overflow-x-auto">
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
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
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