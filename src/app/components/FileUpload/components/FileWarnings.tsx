// src/app/components/FileUpload/components/FileWarnings.tsx
'use client';

import { UploadedFile } from '@/types';

interface FileWarningsProps {
  files: UploadedFile[];
  language: string;
}

export function FileWarnings({ files, language }: FileWarningsProps) {
  return (
    <>
      <GSNRecommendation files={files} language={language} />
      <ImageBasedPDFWarning files={files} language={language} />
    </>
  );
}

/**
 * GSNファイル推奨案内
 */
function GSNRecommendation({ files, language }: FileWarningsProps) {
  if (!files.some(f => f.type === 'gsn')) return null;

  return (
    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
      <p className="text-lg text-amber-800 dark:text-amber-200 font-medium mb-2">
        {language === 'en' ? 'Recommended settings for GSN documents' : 'GSNドキュメントの推奨設定'}
      </p>
      <div className="text-base text-amber-700 dark:text-amber-300 space-y-1">
        <p>
          {language === 'en' 
            ? '• Checking GSN adds a GSN section to the report structure.'
            : '・GSNにチェックを入れると，レポート構成にGSNセクションが追加されます'}
        </p>
        <p>
          {language === 'en' 
            ? '• Since structure is important for GSN documents, we recommend enabling "Full Text".'
            : '・GSNドキュメントは構造が重要なため，「全文使用」をONにすることを推奨します'}
        </p>
        <p>
          {language === 'en' 
            ? '• We recommend creating GSN files with '
            : '・GSNファイルは'}
          <a 
            href="https://www.matsulab.org/dcase/login.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-amber-900 dark:hover:text-amber-100"
          >
            D-Case Communicator
          </a>
          {language === 'en' 
            ? ' and using text files exported via "Export LLM Input Text" feature.'
            : 'で作成し，「Export LLM Input Text」機能で出力されるテキストファイルを使用することをお勧めします'}
        </p>
      </div>
    </div>
  );
}

/**
 * 画像ベースPDFの警告メッセージ
 */
function ImageBasedPDFWarning({ files, language }: FileWarningsProps) {
  const hasImageBasedFiles = files.some(f => !f.metadata?.s3Key && f.content.length === 0);
  if (!hasImageBasedFiles) return null;

  const hasGSNWithNoText = files.some(f => f.name.includes('GSN') && f.content.length === 0);

  return (
    <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
      <p className="text-lg text-yellow-800 dark:text-yellow-200 font-medium mb-2">
        {language === 'en' 
          ? 'Could not extract text from some files'
          : '一部のファイルからテキストを抽出できませんでした'}
      </p>
      <p className="text-base text-yellow-700 dark:text-yellow-300 mb-2">
        {language === 'en'
          ? 'These may be image-based files. Try the following:'
          : '画像ベースのファイルの可能性があります。以下の方法をお試しください：'}
      </p>
      <ul className="text-base text-yellow-700 dark:text-yellow-300 list-disc list-inside space-y-1">
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
      {hasGSNWithNoText && (
        <GSNSpecificGuidance language={language} />
      )}
    </div>
  );
}

/**
 * GSN図のテキスト化ガイダンス
 */
function GSNSpecificGuidance({ language }: { language: string }) {
  const handleShowDetailedGuide = (e: React.MouseEvent) => {
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
  };

  return (
    <div className="mt-3 pt-3 border-t border-yellow-300 dark:border-yellow-700">
      <p className="text-base text-yellow-800 dark:text-yellow-200 font-medium mb-2">
        {language === 'en' ? 'Recommended method for GSN diagrams:' : 'GSN図の場合の推奨方法：'}
      </p>
      <ol className="text-base text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-1">
        <li>{language === 'en'
          ? 'Manually enter GSN elements (G1, S1, C1, etc.) into a text file'
          : 'GSNの要素（G1, S1, C1など）をテキストファイルに手動で入力'}</li>
        <li>
          {language === 'en' ? 'Format example:' : 'フォーマット例：'}
          <pre className="mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-base overflow-x-auto">
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
        onClick={handleShowDetailedGuide}
        className="text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
      >
        {language === 'en' ? 'View detailed format guide' : '詳細なフォーマットガイドを見る'}
      </a>
    </div>
  );
}
