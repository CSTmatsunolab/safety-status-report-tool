// src/app/components/FileUpload/index.tsx
'use client';

import { UploadedFile } from '@/types';
import { useI18n } from '../I18nProvider';
import { useFileUpload } from './hooks/useFileUpload';
import { UploadZone } from './components/UploadZone';
import { FileList } from './components/FileList';
import { FileWarnings } from './components/FileWarnings';

export interface FileUploadProps {
  files: UploadedFile[];
  onUpload: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
  onToggleFullText: (id: string, includeFullText: boolean) => void;
  onToggleGSN?: (id: string, isGSN: boolean) => void;
}

export function FileUpload({ 
  files, 
  onUpload, 
  onRemove, 
  onToggleFullText, 
  onToggleGSN 
}: FileUploadProps) {
  const { language } = useI18n();
  
  const {
    isProcessing,
    processingStatus,
    getRootProps,
    getInputProps,
    isDragActive,
  } = useFileUpload({ files, onUpload, language });

  return (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      <UploadZone
        getRootProps={getRootProps}
        getInputProps={getInputProps}
        isDragActive={isDragActive}
        isProcessing={isProcessing}
        processingStatus={processingStatus}
      />

      {/* アップロード済みファイルリスト */}
      {files.length > 0 && (
        <div className="space-y-2">
          <FileList
            files={files}
            onRemove={onRemove}
            onToggleFullText={onToggleFullText}
            onToggleGSN={onToggleGSN}
            language={language}
          />
          
          {/* 警告メッセージ */}
          <FileWarnings files={files} language={language} />
        </div>
      )}
    </div>
  );
}

// Re-export for convenience
export { validateFile, isPdfFile, isDirectlyReadable } from './FileValidation';
export { 
  S3_THRESHOLD,
  uploadToS3,
  processFileFromS3,
  extractTextFromPDF,
  extractTextFromImage,
  extractTextFromExcel,
  extractTextFromDocx,
  processTextFile,
} from './FileProcessor';
export { useFileUpload, MAX_FILES } from './hooks/useFileUpload';
