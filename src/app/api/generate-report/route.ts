// src/app/api/generate-report/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
import { createEmbeddings } from '@/lib/embeddings';
import { 
  getRecommendedStructure, 
  buildFinalReportStructure 
} from '@/lib/report-structures';
import { 
  determineAdvancedRhetoricStrategy, 
  getRhetoricStrategyDisplayName 
} from '@/lib/rhetoric-strategies';
import { 
  getDynamicK, 
  saveRAGLog,
  type RAGLogData 
} from '@/lib/rag-utils';
import { buildCompleteUserPrompt } from '@/lib/report-prompts';

// グローバルストレージ（メモリストアの参照を保持）
const globalStores = (global as any).vectorStores || new Map();
(global as any).vectorStores = globalStores;

// Anthropic APIクライアントの初期化
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

//RAG処理を実行してコンテキストを取得

async function performRAGSearch(
  stakeholder: Stakeholder,
  vectorStoreType: string,
  fullTextFiles: UploadedFile[]
): Promise<{ contextContent: string; relevantDocs: any[] }> {
  let contextContent = '';
  let relevantDocs: any[] = [];

  if (vectorStoreType === 'pinecone' || vectorStoreType === 'chromadb') {
    // 永続ストア（Pinecone/ChromaDB）の場合
    try {
      const embeddings = createEmbeddings();
      const vectorStore = await VectorStoreFactory.getExistingStore(
        embeddings,
        stakeholder.id
      );
      
      if (vectorStore) {
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore, 
          stakeholder.id
        );
        
        console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          const k = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const searchQuery = `${stakeholder.role} ${stakeholder.concerns.join(' ')}`;
          console.log(`Searching with query: "${searchQuery}" and k=${k}`);
          
          relevantDocs = await vectorStore.similaritySearch(searchQuery, k);
          
          if (relevantDocs.length > 0) {
            console.log(`Found ${relevantDocs.length} relevant documents from RAG`);
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: any) => doc.pageContent)
                .join('\n\n---\n\n');

            // ログ保存
            const logData: RAGLogData = {
              stakeholder,
              searchQuery,
              k,
              totalChunks: stats.totalDocuments,
              vectorStoreType: stats.storeType,
              relevantDocs,
              contextLength: contextContent.length,
              fullTextFiles,
              timestamp: new Date()
            };
            saveRAGLog(logData);
          }
        }
      }
    } catch (error) {
      console.error('Vector store error:', error);
    }
  } else {
    // メモリストアの場合
    const storeKey = `ssr_${stakeholder.id.replace(/-/g, '_')}`;
    const vectorStore = globalStores.get(storeKey);
    
    if (vectorStore && typeof vectorStore.similaritySearch === 'function') {
      console.log('Found memory store, searching...');
      
      try {
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore, 
          stakeholder.id
        );
        console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          const k = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const searchQuery = `${stakeholder.role} ${stakeholder.concerns.join(' ')}`;
          console.log(`Searching with query: "${searchQuery}" and k=${k}`);
          
          relevantDocs = await vectorStore.similaritySearch(searchQuery, k);
          
          if (relevantDocs.length > 0) {
            console.log(`Found ${relevantDocs.length} relevant documents from RAG`);
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: any) => doc.pageContent)
                .join('\n\n---\n\n');

            // ログ保存
            const logData: RAGLogData = {
              stakeholder,
              searchQuery,
              k,
              totalChunks: stats.totalDocuments,
              vectorStoreType: stats.storeType,
              relevantDocs,
              contextLength: contextContent.length,
              fullTextFiles,
              timestamp: new Date()
            };
            saveRAGLog(logData);
          }
        }
      } catch (error) {
        console.error('Error during vector search:', error);
      }
    }
  }

  return { contextContent, relevantDocs };
}

/**
 * 全文使用ファイルをコンテキストに追加
 */
function addFullTextToContext(
  contextContent: string,
  fullTextFiles: UploadedFile[]
): string {
  if (fullTextFiles.length === 0) {
    return contextContent;
  }

  console.log(`Adding ${fullTextFiles.length} full-text files to context`);
  
  const fullTextContent = fullTextFiles
    .map(file => `=== ファイル: ${file.name} (全文) ===\n\n${file.content}`)
    .join('\n\n---\n\n');
  
  if (contextContent) {
    return contextContent + '\n\n\n' + fullTextContent;
  } else {
    return fullTextContent;
  }
}

/**
 * コンテキストのサイズを制限
 */
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

/**
 * Claude APIを使用してレポートを生成
 */
async function generateReportWithClaude(
  promptContent: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
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
    const { files, stakeholder, fullTextFileIds, reportStructure }: { 
      files: UploadedFile[]; 
      stakeholder: Stakeholder;
      fullTextFileIds?: string[];
      reportStructure?: ReportStructureTemplate;
    } = await request.json();
    
    if (!stakeholder) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    const safeFiles = files || [];
    console.log('Generating report for:', stakeholder.role);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'memory');

    // ファイルの分類
    const fullTextFiles = safeFiles.filter(f => f.includeFullText);
    const ragTargetFiles = safeFiles.filter(f => !f.includeFullText);
    console.log(`Files breakdown: ${fullTextFiles.length} full-text, ${ragTargetFiles.length} RAG target`);

    // RAG検索の実行
    const vectorStoreType = process.env.VECTOR_STORE || 'memory';
    const { contextContent: ragContent } = await performRAGSearch(
      stakeholder,
      vectorStoreType,
      fullTextFiles
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
      f.type === 'gsn' || (f.metadata as any)?.isGSN
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