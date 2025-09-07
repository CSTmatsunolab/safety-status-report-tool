'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX } from 'react-icons/fi';
import { UploadedFile } from '@/types';

interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
}

// PDFをテキストに変換する関数
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/pdf-extract', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('PDF extraction failed:', errorData);
      throw new Error(`PDF extraction failed: ${response.status}`);
    }
    
    const { text } = await response.json();
    return text || '';
  } catch (error) {
    console.error('PDF extraction error:', error);
    return '';
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

export default function FileUpload({ files, onUpload, onRemove }: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    try {
      const newFiles: UploadedFile[] = await Promise.all(
        acceptedFiles.map(async (file) => {
          let content = '';
          
          // ファイルタイプに応じて適切な処理を行う
          if (file.type === 'application/pdf') {
            // PDFファイルの場合
            console.log(`Extracting text from PDF: ${file.name}`);
            content = await extractTextFromPDF(file);
          } else if (
            file.type === 'application/vnd.ms-excel' || 
            file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.name.endsWith('.xls') || 
            file.name.endsWith('.xlsx')
          ) {
            // Excelファイルの場合
            console.log(`Extracting text from Excel: ${file.name}`);
            content = await extractTextFromExcel(file);
          } else {
            // テキスト・CSVファイルは直接読み込む
            try {
              content = await file.text();
            } catch (error) {
              console.log(`Could not read file ${file.name} as text, using empty content`);
              content = '';
            }
          }
          
          console.log(`File: ${file.name}, Type: ${file.type}, Content length: ${content.length}`);
          if (content.length > 0) {
            console.log('First 500 chars:', content.substring(0, 500));
          }
          
          // ファイル名からタイプを判定
          const type = file.name.includes('GSN') ? 'gsn' : 
                       file.name.includes('議事録') ? 'minutes' : 'other';
          
          return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type,
            content,
            uploadedAt: new Date(),
          };
        })
      );
      
      onUpload(newFiles);
    } catch (error) {
      console.error('File processing error:', error);
      alert('ファイルの処理中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: true,
  });

  const removeFile = (id: string) => {
    onRemove(id);
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
            <p className="text-sm text-gray-500">
              PDFやExcelファイルの場合、処理に時間がかかることがあります
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
              対応形式: GSNファイル、議事録 (txt, csv, pdf, xls, xlsx)
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
                <FiFile className="text-gray-500" />
                <div>
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
                        (読み込みエラー)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
              >
                <FiX size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}