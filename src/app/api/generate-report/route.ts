// src/app/api/generate-report/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Document } from '@langchain/core/documents'; 
import { VectorStore } from "@langchain/core/vectorstores";
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
import { createEmbeddings } from '@/lib/embeddings';
import { getRecommendedStructure, buildFinalReportStructure } from '@/lib/report-structures';
import { determineAdvancedRhetoricStrategy, getRhetoricStrategyDisplayName } from '@/lib/rhetoric-strategies';
import { getDynamicK, saveRAGLog, type RAGLogData, type RRFStatistics } from '@/lib/rag-utils';
import { buildCompleteUserPrompt } from '@/lib/report-prompts';
import { CustomStakeholderQueryEnhancer, debugQueryEnhancement } from '@/lib/query-enhancer';
import { processGSNText } from '@/lib/text-processing';
import { generateNamespace } from '@/lib/browser-id';
import { performAdaptiveRRFSearch, debugRRFResults, getRRFStatistics } from '@/lib/rrf-fusion';

function isVectorStore(obj: unknown): obj is VectorStore {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as VectorStore).similaritySearch === 'function' &&
    typeof (obj as VectorStore)._vectorstoreType === 'string'
  );
}

const globalStores: Map<string, unknown> = 
  (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
(global as { vectorStores?: Map<string, unknown> }).vectorStores = globalStores;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 適応的なRAG検索関数
async function performRAGSearch(
  stakeholder: Stakeholder,
  vectorStoreType: string,
  fullTextFiles: UploadedFile[],
  browserId?: string
): Promise<{ contextContent: string; relevantDocs: Document[] }> {
  let contextContent = '';
  let relevantDocs: Document[] = [];

  const embeddings = createEmbeddings();
  if (vectorStoreType === 'pinecone') {
    try {
      const vectorStore = await VectorStoreFactory.getExistingStore(
        embeddings,
        stakeholder.id,
        browserId
      );
      
      if (vectorStore) {
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore,
          stakeholder.id,
          browserId
        );
        
        console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          // ===== 動的K値の計算 =====
          const dynamicK = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const realisticK = Math.min(dynamicK, Math.floor(stats.totalDocuments * 0.8));
          
          console.log(`📊 Dynamic K: ${dynamicK}, Realistic K: ${realisticK}`);
          
          let rrfStats: RRFStatistics | undefined = undefined;
          const queryEnhancer = new CustomStakeholderQueryEnhancer();
          const enhancedQueries = queryEnhancer.enhanceQuery(stakeholder, {
            maxQueries: 5,
            includeEnglish: true,
            includeSynonyms: true,
            includeRoleTerms: true
          });
          
          if (process.env.DEBUG_LOGGING === 'true') {
            debugQueryEnhancement(stakeholder, {
              maxQueries: 5,
              includeEnglish: true,
              includeSynonyms: true,
              includeRoleTerms: true
            });
          }

          console.log('Enhanced queries:', enhancedQueries);
          console.log('Using Adaptive RRF Search');
          
          relevantDocs = await performAdaptiveRRFSearch(
            vectorStore,
            embeddings,
            enhancedQueries,
            realisticK,
            stakeholder
          );
            
          const enableRRFDebug = process.env.DEBUG_LOGGING === 'true';

          // デバッグ情報の出力
          if (enableRRFDebug && relevantDocs.length > 0) {
            console.log('RRF Debugging Enabled...');
            debugRRFResults(relevantDocs); 
            rrfStats = getRRFStatistics(relevantDocs);
          }
          
          const achievementRate = (relevantDocs.length / dynamicK) * 100;
          console.log(`K値達成率: ${achievementRate.toFixed(1)}% (${relevantDocs.length}/${dynamicK})`);
          
          if (relevantDocs.length > 0) {
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: Document) => doc.pageContent)
                .join('\n\n---\n\n');

            if (process.env.DEBUG_LOGGING === 'true') {
              // ログ保存
              const logData: RAGLogData = {
                stakeholder,
                searchQuery: enhancedQueries.join(' | '),
                enhancedQueries,
                k: dynamicK,
                totalChunks: stats.totalDocuments,
                vectorStoreType: stats.storeType,
                relevantDocs,
                contextLength: contextContent.length,
                fullTextFiles,
                timestamp: new Date(),
                rrfStatistics: rrfStats
              };
              saveRAGLog(logData);
            }
          }
        }
      }
    } catch (error) {
      console.error('Vector store error:', error);
    }
  } else {
    // メモリストアの場合
    const namespace = generateNamespace(stakeholder.id, browserId);
    const storeKey = `ssr_${namespace}`; 
    const vectorStoreCandidate = globalStores.get(storeKey);
    
    if (isVectorStore(vectorStoreCandidate)) {
      const vectorStore = vectorStoreCandidate;
      console.log('Found memory store, searching...');
      
      try {
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore,
          stakeholder.id,
          browserId
        );
        console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          const targetK = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const realisticK = Math.min(targetK, Math.floor(stats.totalDocuments * 0.8));
          
          const queryEnhancer = new CustomStakeholderQueryEnhancer();
          const enhancedQueries = queryEnhancer.enhanceQuery(stakeholder);

          if (process.env.DEBUG_LOGGING === 'true') {
            debugQueryEnhancement(stakeholder);
          }

          console.log('Enhanced queries for memory store:', enhancedQueries);

          // RRF検索を呼び出す
          console.log('Using Adaptive RRF Search (Memory)');
          relevantDocs = await performAdaptiveRRFSearch(
              vectorStore,
              embeddings,
              enhancedQueries,
              realisticK,
              stakeholder
          );
          if (relevantDocs.length > 0) {
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: Document) => doc.pageContent)
                .join('\n\n---\n\n');

            if (process.env.DEBUG_LOGGING === 'true') {
              // ログ保存
              const rrfStats = getRRFStatistics(relevantDocs);
              const logData: RAGLogData = {
                stakeholder,
                searchQuery: enhancedQueries.join(' | '),
                enhancedQueries: enhancedQueries,
                k: targetK,
                totalChunks: stats.totalDocuments,
                vectorStoreType: stats.storeType,
                relevantDocs,
                contextLength: contextContent.length,
                fullTextFiles,
                timestamp: new Date(),
                rrfStatistics: rrfStats
              };
              saveRAGLog(logData);
            }
          }
        }
      } catch (error) {
        console.error('Error during vector search:', error);
      }
    }
  }

  return { contextContent, relevantDocs };
}

//全文使用ファイルをコンテキストに追加
function addFullTextToContext(
  contextContent: string,
  fullTextFiles: UploadedFile[]
): string {
  if (fullTextFiles.length === 0) {
    return contextContent;
  }

  console.log(`Adding ${fullTextFiles.length} full-text files to context`);
  
const fullTextContent = fullTextFiles
    .map(file => {
      let content = file.content;

      const metadata = file.metadata as { 
        isGSN?: boolean; 
        extractionMethod?: string;
        userDesignatedGSN?: boolean;
      };

      const isGSN = file.type === 'gsn' || metadata?.isGSN || metadata?.userDesignatedGSN;
      const isOCR = metadata?.extractionMethod === 'ocr';

      if (isGSN && isOCR) {
        console.log(`Applying GSN auto-formatting to (OCR): ${file.name}`);
        content = processGSNText(content);
      }
      return `=== ファイル: ${file.name} (全文) ===\n\n${content}`;
    })
    .join('\n\n---\n\n');
  
  if (contextContent) {
    return contextContent + '\n\n\n' + fullTextContent;
  } else {
    return fullTextContent;
  }
}

//コンテキストのサイズを制限

function limitContextSize(
  contextContent: string,
  stakeholder: Stakeholder,
  maxSize?: number
): string {
  const MAX_CONTEXT = maxSize || (stakeholder.role.includes('技術') ? 80000 : 50000);
  
  if (contextContent.length > MAX_CONTEXT) {
    return contextContent.substring(0, MAX_CONTEXT) + '\n\n...(文字数制限により省略)';
  }
  
  return contextContent;
}

// Claude APIを使用してレポートを生成
async function generateReportWithClaude(
  promptContent: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: promptContent
      }
    ]
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

//メインのPOSTハンドラ
export async function POST(request: NextRequest) {
  try {
    const { files, stakeholder, reportStructure, browserId }: { 
      files: UploadedFile[]; 
      stakeholder: Stakeholder;
      fullTextFileIds?: string[];
      reportStructure?: ReportStructureTemplate;
      browserId?: string;
    } = await request.json();
    
    if (!stakeholder) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    const safeFiles = files || [];
    console.log('Generating report for:', stakeholder.role);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'pinecone');

    // ファイルの分類
    const fullTextFiles = safeFiles.filter(f => f.includeFullText);
    const ragTargetFiles = safeFiles.filter(f => !f.includeFullText);
    console.log(`Files breakdown: ${fullTextFiles.length} full-text, ${ragTargetFiles.length} RAG target`);

    // RAG検索の実行
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    const { contextContent: ragContent } = await performRAGSearch(
      stakeholder,
      vectorStoreType,
      fullTextFiles,
      browserId
    );

    // 全文使用ファイルの追加
    let contextContent = addFullTextToContext(ragContent, fullTextFiles);

    // フォールバック処理
    if (!contextContent) {
      console.log('No content found, using fallback');
      contextContent = safeFiles.map(f => f.content.substring(0, 10000)).join('\n\n');
    }

    // コンテキストサイズの制限
    contextContent = limitContextSize(contextContent, stakeholder);

    // レトリック戦略の決定
    const strategy = determineAdvancedRhetoricStrategy(stakeholder);

    // レポート構成の決定
    const baseStructure = reportStructure || getRecommendedStructure(
      stakeholder,
      strategy,
      safeFiles
    );
    const reportSections = buildFinalReportStructure(baseStructure, safeFiles);
    const structureDescription = baseStructure.description?.slice(0, 500);
    
    console.log(`Using report structure: ${baseStructure.name}`);
    console.log(`Final sections: ${reportSections.join(', ')}`);

    // GSNファイルの有無を確認
    const hasGSN = safeFiles.some(f => 
      f.type === 'gsn' || (f.metadata as { isGSN?: boolean })?.isGSN
    );

    // プロンプトの構築
    const promptContent = buildCompleteUserPrompt({
      stakeholder,
      strategy,
      contextContent,
      reportSections,
      hasGSN,
      structureDescription
    });

    // Claude APIでレポート生成
    const reportContent = await generateReportWithClaude(promptContent);

    // レポートオブジェクトの作成
    const report: Report = {
      id: Math.random().toString(36).substr(2, 9),
      title: `${stakeholder.role}向け Safety Status Report`,
      stakeholder,
      content: reportContent,
      rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return NextResponse.json(report);
    
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { 
        error: 'Report generation failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}