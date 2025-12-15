// src/hooks/useSectionGeneration.ts
// セクション分割生成用のReactフック（2段階処理：コンテキスト準備→セクション生成）

import { useState, useCallback } from 'react';
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { getRhetoricStrategyDisplayName, determineAdvancedRhetoricStrategy } from '@/lib/rhetoric-strategies';

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
}

interface UseSectionGenerationOptions {
  onProgress?: (progress: SectionProgress) => void;
  onSectionComplete?: (sectionName: string, content: string) => void;
  onError?: (error: string, sectionName: string) => void;
  onContextPrepared?: (metadata: SectionProgress['contextMetadata']) => void;
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

  const generateReport = useCallback(async (params: GenerateReportParams): Promise<Report | null> => {
    const { files, stakeholder, reportStructure, userIdentifier, language } = params;
    
    setIsGenerating(true);
    setError(null);
    
    const sections = reportStructure.sections;
    const totalSections = sections.length;
    const generatedSections: Record<string, string> = {};
    const completedSections: string[] = [];

    try {
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
      });

      console.log('Report generation complete!');
      return report;

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
  }, [options, progress.sectionName]);

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
  };
}
