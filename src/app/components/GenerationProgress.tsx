// src/app/components/GenerationProgress.tsx
// レポート生成の進捗表示コンポーネント

'use client';

import { FC } from 'react';

interface LambdaProgress {
  status: string;
  message: string;
  percent: number;
}

interface SectionProgress {
  currentSection: number;
  totalSections: number;
  sectionName: string;
  status: 'idle' | 'preparing' | 'generating' | 'complete' | 'error';
  completedSections: string[];
  contextPrepared: boolean;
  lambdaProgress?: LambdaProgress;
}

interface GenerationProgressProps {
  progress: SectionProgress;
  language: 'ja' | 'en';
}

export const GenerationProgress: FC<GenerationProgressProps> = ({
  progress,
  language,
}) => {
  if (progress.status !== 'generating') return null;

  return (
    <div className="space-y-3">
      {/* スピナーとメッセージ */}
      <div className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
        <div className="relative">
          <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-700 rounded-full"></div>
          <div className="w-8 h-8 border-4 border-blue-600 dark:border-blue-400 rounded-full animate-spin absolute top-0 left-0 border-t-transparent"></div>
        </div>
        <div>
          <p className="font-medium">
            {progress.lambdaProgress?.message || 
              (language === 'en' ? 'Processing...' : '処理中...')
            }
          </p>
        </div>
      </div>
      
      {/* リアルタイム進捗バー */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
          <span>
            {progress.lambdaProgress?.status === 'searching' && (language === 'en' ? 'Searching...' : '検索中...')}
            {progress.lambdaProgress?.status === 'preparing' && (language === 'en' ? 'Preparing...' : '準備中...')}
            {progress.lambdaProgress?.status === 'building' && (language === 'en' ? 'Building...' : '構築中...')}
            {progress.lambdaProgress?.status === 'generating' && (language === 'en' ? 'Generating...' : '生成中...')}
            {progress.lambdaProgress?.status === 'finalizing' && (language === 'en' ? 'Finalizing...' : '仕上げ中...')}
            {!progress.lambdaProgress?.status && (language === 'en' ? 'Starting...' : '開始中...')}
          </span>
          <span>{progress.lambdaProgress?.percent || 0}%</span>
        </div>
        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress.lambdaProgress?.percent || 0}%` }}
          />
        </div>
      </div>
      
      {/* 処理ステップ */}
      <div className="text-sm text-blue-600 dark:text-blue-400 space-y-1 pt-2">
        <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 10 ? 'opacity-100' : 'opacity-40'}>
          {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 10 ? '✓' : '○'} {language === 'en' ? 'Search knowledge base' : '知識ベースを検索'}
        </p>
        <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 30 ? 'opacity-100' : 'opacity-40'}>
          {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 30 ? '✓' : '○'} {language === 'en' ? 'Prepare context' : 'コンテキスト準備'}
        </p>
        <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 50 ? 'opacity-100' : 'opacity-40'}>
          {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 50 ? '✓' : '○'} {language === 'en' ? 'Build prompt' : 'プロンプト構築'}
        </p>
        <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 60 ? 'opacity-100' : 'opacity-40'}>
          {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 60 ? '✓' : '○'} {language === 'en' ? 'Generate report with AI' : 'AIでレポート生成'}
        </p>
        <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 90 ? 'opacity-100' : 'opacity-40'}>
          {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 90 ? '✓' : '○'} {language === 'en' ? 'Finalize report' : 'レポート仕上げ'}
        </p>
      </div>
    </div>
  );
};

export default GenerationProgress;