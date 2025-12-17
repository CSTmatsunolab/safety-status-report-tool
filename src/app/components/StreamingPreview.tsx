// src/app/components/StreamingPreview.tsx
// レポート生成中のストリーミングプレビューコンポーネント

'use client';

import { FC } from 'react';

interface StreamingPreviewProps {
  content: string;
  language: 'ja' | 'en';
}

export const StreamingPreview: FC<StreamingPreviewProps> = ({
  content,
  language,
}) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {language === 'en' ? 'Generating...' : '生成中...'}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          {content.length.toLocaleString()} {language === 'en' ? 'chars' : '文字'}
        </span>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
          {content}
          <span className="inline-block w-0.5 h-4 bg-green-500 animate-pulse ml-0.5 align-middle"></span>
        </pre>
      </div>
    </div>
  );
};

export default StreamingPreview;