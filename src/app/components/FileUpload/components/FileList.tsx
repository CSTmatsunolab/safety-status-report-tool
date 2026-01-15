// src/app/components/FileUpload/components/FileList.tsx
'use client';

import { useState } from 'react';
import { FiFile, FiX, FiImage, FiAlertCircle } from 'react-icons/fi';
import { UploadedFile } from '@/types';
import { isPdfFile } from '../FileValidation';
import { MAX_FILES } from '../hooks/useFileUpload';

interface FileListProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
  onToggleGSN?: (id: string, isGSN: boolean) => void;
  language: string;
}

export function FileList({
  files,
  onRemove,
  onToggleFullText,
  onToggleGSN,
  language,
}: FileListProps) {
  if (files.length === 0) return null;

  return (
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
        <FileItem
          key={file.id}
          file={file}
          onRemove={onRemove}
          onToggleFullText={onToggleFullText}
          onToggleGSN={onToggleGSN}
          language={language}
        />
      ))}
    </div>
  );
}

interface FileItemProps {
  file: UploadedFile;
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
  onToggleGSN?: (id: string, isGSN: boolean) => void;
  language: string;
}

function FileItem({
  file,
  onRemove,
  onToggleFullText,
  onToggleGSN,
  language,
}: FileItemProps) {
  return (
    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md dark:hover:shadow-lg">
      <div className="flex items-center space-x-3">
        <FileIcon file={file} />
        <div className="flex-1">
          <p className="text-base font-medium text-gray-900 dark:text-white flex items-center">
            {file.name}
            {isPdfFile(file.name) && <PdfWarningTooltip language={language} />}
          </p>
          <FileTypeLabel file={file} language={language} />
        </div>
        <ExtractionBadge file={file} />
      </div>
      <div className="flex items-center justify-end space-x-4">
        {/* チェックボックス・グループ */}
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

        {/* 削除ボタン */}
        <button
          onClick={() => onRemove(file.id)}
          className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <FiX size={18} />
        </button>
      </div>
    </div>
  );
}

function FileIcon({ file }: { file: UploadedFile }) {
  const metadata = file.metadata as { originalType?: string };
  if (metadata?.originalType?.startsWith('image/')) {
    return <FiImage className="text-purple-500 dark:text-purple-400" />;
  }
  return <FiFile className="text-gray-500 dark:text-gray-400" />;
}

function FileTypeLabel({ file, language }: { file: UploadedFile; language: string }) {
  return (
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
      <FileSizeInfo file={file} language={language} />
    </p>
  );
}

function FileSizeInfo({ file, language }: { file: UploadedFile; language: string }) {
  if (file.metadata?.s3Key) {
    return (
      <span className="ml-2">
        ({language === 'en' ? 'Large file' : '大きいファイル'} - {file.metadata?.originalContentLength 
          ? `${file.metadata.originalContentLength.toLocaleString()} ${language === 'en' ? 'chars' : '文字'}` 
          : (language === 'en' ? 'char count unknown' : '文字数不明')})
      </span>
    );
  }
  
  if (file.content.length > 0) {
    return (
      <span className="ml-2">
        ({(file.metadata?.originalContentLength || file.content.length).toLocaleString()} {language === 'en' ? 'chars' : '文字'})
      </span>
    );
  }
  
  return (
    <span className="ml-2 text-red-500 dark:text-red-400">
      ({language === 'en' ? 'Text extraction failed' : 'テキスト抽出失敗'})
    </span>
  );
}

function ExtractionBadge({ file }: { file: UploadedFile }) {
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
}

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
