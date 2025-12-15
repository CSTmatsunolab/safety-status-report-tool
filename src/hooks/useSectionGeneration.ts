// src/hooks/useSectionGeneration.ts
// セクション分割生成用のReactフック
// Lambda Function URL（ストリーミング対応）またはNext.js APIを使用

import { useState, useCallback, useRef } from 'react';
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { getRhetoricStrategyDisplayName, determineAdvancedRhetoricStrategy } from '@/lib/rhetoric-strategies';

// Lambda Function URL (環境変数から取得)
const LAMBDA_FUNCTION_URL = process.env.NEXT_PUBLIC_LAMBDA_FUNCTION_URL || '';

// デバッグログ
console.log('=== useSectionGeneration.ts loaded ===');
console.log('LAMBDA_FUNCTION_URL:', LAMBDA_FUNCTION_URL);
console.log('isLambdaAvailable:', !!LAMBDA_FUNCTION_URL);

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
  // Lambda用
  usingLambda?: boolean;
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
  forceLambda?: boolean;
}

interface GenerateReportParams {
  files: UploadedFile[];
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  userIdentifier: string;
  language: 'ja' | 'en';
}

interface PrepareContextResponse {
  success: boolean;
  context: {
    fullTextContent: string;
    ragContent: string;
    gsnContent: string;
    combinedContext: string;
  };
  metadata: {
    fullTextFileCount: number;
    ragResultCount: number;
    gsnFileCount: number;
    totalCharacters: number;
    hasContent: boolean;
  };
  error?: string;
  duration: number;
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

    console.log('🚀 [generateReportWithLambda] Starting streaming Lambda generation');
    console.log('🚀 [generateReportWithLambda] URL:', LAMBDA_FUNCTION_URL);

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
      usingLambda: true,
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

    console.log('🚀 [generateReportWithLambda] Sending streaming request to Lambda...');

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

    console.log('🚀 [generateReportWithLambda] Response status:', response.status);

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
                usingLambda: true,
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
              // 完了
              console.log('🚀 [generateReportWithLambda] Complete!', message.totalDuration, 'ms');
              
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
                usingLambda: true,
                lambdaProgress: {
                  status: 'complete',
                  message: message.message || 'Complete!',
                  percent: 100
                }
              });

            } else if (message.type === 'error') {
              throw new Error(message.error || message.details || 'Unknown error');
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE message:', line, parseError);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!report) {
      throw new Error('No report received from Lambda');
    }

    return report;
  }, [options]);

  /**
   * Next.js APIを使用してレポートを生成（既存のセクション分割方式）
   */
  const generateReportWithNextJS = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {
    const { files, stakeholder, reportStructure, userIdentifier, language } = params;
    
    console.log('📦 [generateReportWithNextJS] Starting Next.js API generation');

    const sections = reportStructure.sections;
    const totalSections = sections.length;
    const generatedSections: Record<string, string> = {};
    const completedSections: string[] = [];

    // Phase 1: コンテキスト準備
    console.log('Phase 1: Preparing context...');
    
    const preparingProgress: SectionProgress = {
      currentSection: 0,
      totalSections,
      sectionName: language === 'ja' ? 'コンテキスト準備中...' : 'Preparing context...',
      status: 'preparing',
      completedSections: [],
      contextPrepared: false,
      usingLambda: false,
    };
    setProgress(preparingProgress);
    options.onProgress?.(preparingProgress);

    const prepareResponse = await fetch('/api/prepare-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files,
        stakeholder,
        reportStructure,
        userIdentifier,
        language,
      }),
    });

    const prepareResult: PrepareContextResponse = await prepareResponse.json();

    if (!prepareResult.success || !prepareResult.metadata.hasContent) {
      const errorMessage = prepareResult.error || 
        (language === 'ja' 
          ? 'レポート生成に必要な文書コンテンツがありません。'
          : 'No document content available for report generation.');
      throw new Error(errorMessage);
    }

    console.log(`Context prepared: ${prepareResult.metadata.totalCharacters} chars in ${prepareResult.duration}ms`);
    options.onContextPrepared?.(prepareResult.metadata);

    const preparedContext = prepareResult.context.combinedContext;
    const hasGSNFile = prepareResult.metadata.gsnFileCount > 0;

    // Phase 2: セクション生成
    console.log('Phase 2: Generating sections...');

    for (let i = 0; i < sections.length; i++) {
      const sectionName = sections[i];
      
      const currentProgress: SectionProgress = {
        currentSection: i + 1,
        totalSections,
        sectionName,
        status: 'generating',
        completedSections: [...completedSections],
        contextPrepared: true,
        contextMetadata: prepareResult.metadata,
        usingLambda: false,
      };
      setProgress(currentProgress);
      options.onProgress?.(currentProgress);

      const response = await fetch('/api/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionName,
          sectionIndex: i,
          totalSections,
          allSections: sections,
          previousSectionsContent: generatedSections,
          stakeholder,
          reportStructure,
          preparedContext,
          hasGSNFile,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || `Failed to generate section: ${sectionName}`);
      }

      const result = await response.json();
      generatedSections[sectionName] = result.content;
      completedSections.push(sectionName);
      options.onSectionComplete?.(sectionName, result.content);
      
      console.log(`Section ${i + 1}/${totalSections} completed: ${sectionName}`);
    }

    // Phase 3: レポート組み立て
    const reportContent = sections
      .map(section => `【${section}】\n${generatedSections[section]}`)
      .join('\n\n');

    const strategy = determineAdvancedRhetoricStrategy(stakeholder);
    
    const report: Report = {
      id: Math.random().toString(36).substring(2, 11),
      title: language === 'en'
        ? `Safety Status Report for ${stakeholder.role}`
        : `${stakeholder.role}向け Safety Status Report`,
      stakeholder,
      content: reportContent,
      rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder, language),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setProgress({
      currentSection: totalSections,
      totalSections,
      sectionName: sections[sections.length - 1],
      status: 'complete',
      completedSections,
      contextPrepared: true,
      contextMetadata: prepareResult.metadata,
      usingLambda: false,
    });

    console.log('Report generation complete!');
    return report;
  }, [options]);

  /**
   * メインのレポート生成関数
   */
  const generateReport = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {
    console.log('=== [generateReport] called ===');
    console.log('isLambdaGenerationAvailable():', isLambdaGenerationAvailable());

    setIsGenerating(true);
    setError(null);
    setStreamingContent('');
    streamingContentRef.current = '';

    try {
      if (options.forceLambda) {
        if (!isLambdaGenerationAvailable()) {
          throw new Error('Lambda Function URLが設定されていません。');
        }
        return await generateReportWithLambda(params);
      }

      if (isLambdaGenerationAvailable()) {
        console.log('[generateReport] Lambda is available, using Lambda...');
        try {
          return await generateReportWithLambda(params);
        } catch (lambdaError) {
          console.warn('Lambda generation failed, falling back to Next.js API:', lambdaError);
          return await generateReportWithNextJS(params);
        }
      }

      console.log('[generateReport] Lambda not available, using Next.js API...');
      return await generateReportWithNextJS(params);

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
  }, [options, progress.sectionName, generateReportWithLambda, generateReportWithNextJS]);

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