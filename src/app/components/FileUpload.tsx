'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiFile, FiX } from 'react-icons/fi';
import { UploadedFile } from '@/types';

interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
}

export default function FileUpload({ files, onUpload }: FileUploadProps) {
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = await Promise.all(
      acceptedFiles.map(async (file) => {
        const content = await file.text();
        const type = file.name.includes('GSN') ? 'gsn' : 
                     file.name.includes('議事録') ? 'minutes' : 'other';
        
        return {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type,
          content,
          uploadedAt: new Date(),
        };
      })
    );
    
    onUpload(newFiles);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/*': ['.txt', '.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls', '.xlsx'],
    },
  });

  const removeFile = (id: string) => {
    const updatedFiles = files.filter(f => f.id !== id);
    onUpload(updatedFiles);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
      >
        <input {...getInputProps()} />
        <FiUpload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        {isDragActive ? (
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
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    タイプ: {file.type === 'gsn' ? 'GSNファイル' : 
                            file.type === 'minutes' ? '議事録' : 'その他'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="text-red-500 hover:text-red-700"
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}