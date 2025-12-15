// src/hooks/useSectionGeneration.ts
// セクション分割生成用のReactフック（2段階処理：コンテキスト準備→セクション生成）
// Lambda Function URLが設定されている場合はLambdaを使用、なければNext.js APIを使用

import { useState, useCallback } from 'react';
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { getRhetoricStrategyDisplayName, determineAdvancedRhetoricStrategy } from '@/lib/rhetoric-strategies';

// Lambda Function URL (環境変数から取得)
const LAMBDA_FUNCTION_URL = process.env.NEXT_PUBLIC_LAMBDA_FUNCTION_URL || '';

// ===== デバッグログ =====
console.log('=== useSectionGeneration.ts loaded ===');
console.log('LAMBDA_FUNCTION_URL:', LAMBDA_FUNCTION_URL);
console.log('isLambdaAvailable:', !!LAMBDA_FUNCTION_URL);
// ========================

// 進捗状態の型定義
interface SectionProgress {
  currentSection: number;
  totalSections: number;
  sectionName: string;
  status: 'idle' | 'preparing' | 'generating' | 'complete' | 'error';
  completedSections: string[];
  // コンテキスト準備の情報
  contextPrepared: boolean;
  contextMetadata?: {
    fullTextFileCount: number;
    ragResultCount: number;
    gsnFileCount: number;
    totalCharacters: number;
  };
  // Lambda使用フラグ
  usingLambda?: boolean;
}

interface UseSectionGenerationOptions {
  onProgress?: (progress: SectionProgress) => void;
  onSectionComplete?: (sectionName: string, content: string) => void;
  onError?: (error: string, sectionName: string) => void;
  onContextPrepared?: (metadata: SectionProgress['contextMetadata']) => void;
  // Lambda使用を強制するかどうか（trueの場合、Lambda URLがなければエラー）
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

interface LambdaResponse {
  success: boolean;
  report?: {
    title: string;
    content: string;
    stakeholder: Stakeholder;
    rhetoricStrategy: string;
    createdAt: string;
  };
  totalDuration?: number;
  error?: string;
  details?: string;
}

/**
 * Lambda生成が利用可能かチェック
 */
export function isLambdaGenerationAvailable(): boolean {
  const available = !!LAMBDA_FUNCTION_URL;
  console.log('[isLambdaGenerationAvailable] called, returning:', available);
  return available;
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

  /**
   * Lambda Function URLを使用してレポートを生成
   */
  const generateReportWithLambda = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {
    const { files, stakeholder, reportStructure, userIdentifier, language } = params;

    console.log('🚀 [generateReportWithLambda] Starting Lambda generation');
    console.log('🚀 [generateReportWithLambda] URL:', LAMBDA_FUNCTION_URL);

    const preparingProgress: SectionProgress = {
      currentSection: 0,
      totalSections: reportStructure.sections.length,
      sectionName: language === 'ja' ? 'Lambda関数で生成中...' : 'Generating with Lambda...',
      status: 'generating',
      completedSections: [],
      contextPrepared: false,
      usingLambda: true,
    };
    setProgress(preparingProgress);
    options.onProgress?.(preparingProgress);

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

    console.log('🚀 [generateReportWithLambda] Sending request to Lambda...');

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

    const data: LambdaResponse = await response.json();

    console.log('🚀 [generateReportWithLambda] Response data:', data);

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.details || `Lambda error: ${response.status}`);
    }

    if (!data.report) {
      throw new Error('No report in Lambda response');
    }

    const report: Report = {
      id: Math.random().toString(36).substring(2, 11),
      title: data.report.title,
      content: data.report.content,
      stakeholder: data.report.stakeholder,
      rhetoricStrategy: data.report.rhetoricStrategy,
      createdAt: new Date(data.report.createdAt),
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
    });

    console.log(`🚀 [generateReportWithLambda] Complete in ${data.totalDuration}ms`);
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

    // ========================================
    // Phase 1: コンテキスト準備（RAG検索+S3取得）
    // ========================================
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

    // コンテキスト準備失敗
    if (!prepareResult.success || !prepareResult.metadata.hasContent) {
      const errorMessage = prepareResult.error || 
        (language === 'ja' 
          ? 'レポート生成に必要な文書コンテンツがありません。ファイルをアップロードするか、「全文使用」を有効にしてください。'
          : 'No document content available for report generation. Please upload files or enable "Use Full Text".');
      
      throw new Error(errorMessage);
    }

    console.log(`Context prepared: ${prepareResult.metadata.totalCharacters} chars in ${prepareResult.duration}ms`);
    console.log(`  Full text files: ${prepareResult.metadata.fullTextFileCount}`);
    console.log(`  RAG results: ${prepareResult.metadata.ragResultCount}`);
    console.log(`  GSN files: ${prepareResult.metadata.gsnFileCount}`);

    // コンテキスト準備完了を通知
    options.onContextPrepared?.(prepareResult.metadata);

    const preparedContext = prepareResult.context.combinedContext;
    const hasGSNFile = prepareResult.metadata.gsnFileCount > 0;

    // ========================================
    // Phase 2: セクション生成（Claude API呼び出し）
    // ========================================
    console.log('Phase 2: Generating sections...');

    for (let i = 0; i < sections.length; i++) {
      const sectionName = sections[i];
      
      // 進捗を更新
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

      // セクション生成APIを呼び出し（コンテキストを渡す）
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
          preparedContext,  // 事前準備したコンテキストを渡す
          hasGSNFile,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || `Failed to generate section: ${sectionName}`);
      }

      const result = await response.json();
      
      // 生成されたセクションを保存
      generatedSections[sectionName] = result.content;
      completedSections.push(sectionName);
      
      options.onSectionComplete?.(sectionName, result.content);
      
      console.log(`Section ${i + 1}/${totalSections} completed: ${sectionName} (${result.duration}ms)`);
    }

    // ========================================
    // Phase 3: レポート組み立て
    // ========================================
    console.log('Phase 3: Assembling report...');

    // 全セクションを結合してレポートを作成
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
   * Lambda URLが設定されていればLambdaを使用、なければNext.js APIを使用
   */
  const generateReport = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {
    console.log('=== [generateReport] called ===');
    console.log('forceLambda:', options.forceLambda);
    console.log('isLambdaGenerationAvailable():', isLambdaGenerationAvailable());
    console.log('LAMBDA_FUNCTION_URL:', LAMBDA_FUNCTION_URL);

    setIsGenerating(true);
    setError(null);

    try {
      // Lambda使用を強制している場合
      if (options.forceLambda) {
        console.log('[generateReport] forceLambda is true');
        if (!isLambdaGenerationAvailable()) {
          throw new Error('Lambda Function URLが設定されていません。環境変数 NEXT_PUBLIC_LAMBDA_FUNCTION_URL を確認してください。');
        }
        return await generateReportWithLambda(params);
      }

      // Lambda URLが設定されていればLambdaを使用
      if (isLambdaGenerationAvailable()) {
        console.log('[generateReport] Lambda is available, using Lambda...');
        try {
          return await generateReportWithLambda(params);
        } catch (lambdaError) {
          console.warn('Lambda generation failed, falling back to Next.js API:', lambdaError);
          // Lambdaが失敗した場合はNext.js APIにフォールバック
          return await generateReportWithNextJS(params);
        }
      }

      // Lambda URLがなければNext.js APIを使用
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
    // Lambda利用可能かどうかを公開
    isLambdaAvailable: isLambdaGenerationAvailable(),
  };
}