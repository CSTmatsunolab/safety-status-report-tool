// src/hooks/useSectionGeneration.ts
// セクション分割生成用のReactフック
// Lambda Function URL（ストリーミング対応）を使用

import { useState, useCallback, useRef } from 'react';
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';

// Lambda Function URL (環境変数から取得)
const LAMBDA_FUNCTION_URL = process.env.NEXT_PUBLIC_LAMBDA_FUNCTION_URL || '';

// 進捗状態の型定義
interface SectionProgress {
  currentSection: number;
  totalSections: number;
  sectionName: string;
  status: 'idle' | 'preparing' | 'generating' | 'complete' | 'error';
  completedSections: string[];
  contextPrepared: boolean;
  contextMetadata?: {
    fullTextFileCount: number;
    ragResultCount: number;
    gsnFileCount: number;
    totalCharacters: number;
  };
  lambdaProgress?: {
    status: string;
    message: string;
    percent: number;
  };
}

interface UseSectionGenerationOptions {
  onProgress?: (progress: SectionProgress) => void;
  onSectionComplete?: (sectionName: string, content: string) => void;
  onError?: (error: string, sectionName: string) => void;
  onContextPrepared?: (metadata: SectionProgress['contextMetadata']) => void;
  // ストリーミング用：テキストチャンク受信時のコールバック
  onStreamChunk?: (chunk: string, fullContent: string) => void;
}

interface GenerateReportParams {
  files: UploadedFile[];
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  userIdentifier: string;
  language: 'ja' | 'en';
}

interface LambdaStreamMessage {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  status?: string;
  message?: string;
  percent?: number;
  text?: string;
  report?: {
    title: string;
    content: string;
    stakeholder: Stakeholder;
    rhetoricStrategy: string;
    createdAt: string;
  };
  error?: string;
  details?: string;
  totalDuration?: number;
}

/**
 * Lambda生成が利用可能かチェック
 */
export function isLambdaGenerationAvailable(): boolean {
  return !!LAMBDA_FUNCTION_URL;
}

export function useSectionGeneration(options: UseSectionGenerationOptions = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<SectionProgress>({
    currentSection: 0,
    totalSections: 0,
    sectionName: '',
    status: 'idle',
    completedSections: [],
    contextPrepared: false,
  });
  const [error, setError] = useState<string | null>(null);
  
  // ストリーミング中のレポートコンテンツを保持
  const [streamingContent, setStreamingContent] = useState<string>('');
  const streamingContentRef = useRef<string>('');

  /**
   * Lambda Function URL（ストリーミング）を使用してレポートを生成
   */
  const generateReportWithLambda = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {
    const { files, stakeholder, reportStructure, userIdentifier, language } = params;

    // ストリーミングコンテンツをリセット
    streamingContentRef.current = '';
    setStreamingContent('');

    // 初期進捗
    const initialProgress: SectionProgress = {
      currentSection: 0,
      totalSections: reportStructure.sections.length,
      sectionName: language === 'ja' ? 'Lambda関数で生成中...' : 'Generating with Lambda...',
      status: 'generating',
      completedSections: [],
      contextPrepared: false,
      lambdaProgress: {
        status: 'starting',
        message: language === 'ja' ? '処理を開始しています...' : 'Starting process...',
        percent: 0
      }
    };
    setProgress(initialProgress);
    options.onProgress?.(initialProgress);

    // ファイルデータをLambda用に変換
    const filesForLambda = files.map(f => ({
      name: f.name,
      content: f.content || '',
      type: f.type,
      size: f.metadata?.size || 0,
      isGSN: f.metadata?.isGSN || f.metadata?.userDesignatedGSN || f.type === 'gsn',
      useFullText: f.includeFullText || false,
      s3Key: f.metadata?.s3Key,
    }));

    const fullTextFileIds = files
      .filter(f => f.includeFullText)
      .map(f => f.name);

    const response = await fetch(LAMBDA_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stakeholder,
        reportStructure,
        files: filesForLambda,
        fullTextFileIds,
        language,
        userIdentifier,
      }),
    });

    if (!response.ok) {
      throw new Error(`Lambda error: ${response.status}`);
    }

    // ストリーミングレスポンスを処理
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let report: Report | null = null;
    let buffer = '';
    let lambdaError: string | null = null; // Lambdaからのエラーメッセージを保持

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('🚀 [generateReportWithLambda] Stream ended');
          break;
        }

        // チャンクをデコード
        buffer += decoder.decode(value, { stream: true });
        
        // SSE形式のメッセージを解析
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // 不完全な行を保持

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const jsonStr = line.substring(6); // 'data: ' を削除
            const message: LambdaStreamMessage = JSON.parse(jsonStr);

            if (message.type === 'progress') {
              // 進捗更新
              const updatedProgress: SectionProgress = {
                currentSection: 0,
                totalSections: reportStructure.sections.length,
                sectionName: message.message || '',
                status: 'generating',
                completedSections: [],
                contextPrepared: message.status === 'generating' || message.status === 'finalizing',
                lambdaProgress: {
                  status: message.status || 'processing',
                  message: message.message || '',
                  percent: message.percent || 0
                }
              };
              setProgress(updatedProgress);
              options.onProgress?.(updatedProgress);

            } else if (message.type === 'chunk' && message.text) {
              // テキストチャンクを追加
              streamingContentRef.current += message.text;
              setStreamingContent(streamingContentRef.current);
              
              // コールバックを呼び出し
              options.onStreamChunk?.(message.text, streamingContentRef.current);

            } else if (message.type === 'complete' && message.report) {

              report = {
                id: Math.random().toString(36).substring(2, 11),
                title: message.report.title,
                content: message.report.content,
                stakeholder: message.report.stakeholder,
                rhetoricStrategy: message.report.rhetoricStrategy,
                createdAt: new Date(message.report.createdAt),
                updatedAt: new Date(),
              };

              setProgress({
                currentSection: reportStructure.sections.length,
                totalSections: reportStructure.sections.length,
                sectionName: reportStructure.sections[reportStructure.sections.length - 1],
                status: 'complete',
                completedSections: reportStructure.sections,
                contextPrepared: true,
                lambdaProgress: {
                  status: 'complete',
                  message: message.message || 'Complete!',
                  percent: 100
                }
              });

            } else if (message.type === 'error') {
              // エラーメッセージを保存してループを抜ける
              lambdaError = message.error || message.details || 'Unknown error from Lambda';
              console.error('Lambda error received:', lambdaError);
              break;
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE message:', line, parseError);
          }
        }
        
        // エラーが発生した場合はループを抜ける
        if (lambdaError) {
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Lambdaからのエラーをチェック
    if (lambdaError) {
      throw new Error(lambdaError);
    }

    if (!report) {
      throw new Error('No report received from Lambda');
    }

    return report;
  }, [options]);

  /**
   * メインのレポート生成関数
   */
  const generateReport = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {

    setIsGenerating(true);
    setError(null);
    setStreamingContent('');
    streamingContentRef.current = '';

    try {
      if (!isLambdaGenerationAvailable()) {
        throw new Error('Lambda Function URLが設定されていません。環境変数 NEXT_PUBLIC_LAMBDA_FUNCTION_URL を確認してください。');
      }

      return await generateReportWithLambda(params);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Report generation failed:', errorMessage);
      
      setError(errorMessage);
      options.onError?.(errorMessage, progress.sectionName);
      
      setProgress(prev => ({
        ...prev,
        status: 'error',
      }));
      
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [options, progress.sectionName, generateReportWithLambda]);

  const reset = useCallback(() => {
    setIsGenerating(false);
    setError(null);
    setStreamingContent('');
    streamingContentRef.current = '';
    setProgress({
      currentSection: 0,
      totalSections: 0,
      sectionName: '',
      status: 'idle',
      completedSections: [],
      contextPrepared: false,
    });
  }, []);

  return {
    generateReport,
    isGenerating,
    progress,
    error,
    reset,
    isLambdaAvailable: isLambdaGenerationAvailable(),
    // ストリーミング中のコンテンツ
    streamingContent,
  };
}