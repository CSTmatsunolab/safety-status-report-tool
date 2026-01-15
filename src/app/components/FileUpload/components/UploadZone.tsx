// src/app/components/FileUpload/components/UploadZone.tsx
'use client';

import { FiUpload } from 'react-icons/fi';
import { useI18n } from '../../I18nProvider';

interface UploadZoneProps {
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  isDragActive: boolean;
  isProcessing: boolean;
  processingStatus: string;
}

export function UploadZone({
  getRootProps,
  getInputProps,
  isDragActive,
  isProcessing,
  processingStatus,
}: UploadZoneProps) {
  const { t, language } = useI18n();

  return (
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
      <input {...(getInputProps() as React.InputHTMLAttributes<HTMLInputElement>)} disabled={isProcessing} />
      <FiUpload className={`
          mx-auto h-12 w-12 mb-4 transition-colors
          ${isDragActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}
      `} />

      {isProcessing ? (
        <ProcessingState 
          processingStatus={processingStatus} 
          language={language} 
        />
      ) : isDragActive ? (
        <p className="text-blue-600 dark:text-blue-400">
          {language === 'en' ? 'Drop here...' : 'ここにドロップ...'}
        </p>
      ) : (
        <DefaultState language={language} t={t} />
      )}
    </div>
  );
}

function ProcessingState({ 
  processingStatus, 
  language 
}: { 
  processingStatus: string; 
  language: string;
}) {
  return (
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
  );
}

function DefaultState({ 
  language, 
  t 
}: { 
  language: string; 
  t: (key: string) => string;
}) {
  return (
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
  );
}
