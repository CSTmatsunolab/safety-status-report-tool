// src/lib/rag/rrf-fusion.ts
// RRF (Reciprocal Rank Fusion) 実装 - Next.jsと同等

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { 
  Stakeholder, 
  DocumentWithScore, 
  RRFConfig, 
  RRFStatistics
} from './types';
import { CustomStakeholderQueryEnhancer } from './query-enhancer';
import { 
  getDynamicK, 
  getWeightsForStakeholder, 
  getRRFStatistics,
  debugRRFResults,
  formatSearchResults,
  logKAchievementRate
} from './rag-utils';
import { createSparseVectorAuto } from './sparse-vector-utils';

// ============================================================
// 設定
// ============================================================

const DEFAULT_RRF_CONSTANT = 60;
const DEFAULT_SEARCH_K_MULTIPLIER = 1.5;
const MIN_SEARCH_K = 20;

// ============================================================
// メインのRRF検索関数
// ============================================================

/**
 * Adaptive RRF検索
 * ステークホルダーに応じて自動的に重みを調整
 * オプションでハイブリッド検索（Dense + Sparse）も実行
 */
export async function performAdaptiveRRFSearch(
  openai: OpenAI,
  pinecone: Pinecone,
  stakeholder: Stakeholder,
  namespace: string,
  indexName: string = 'safety-status-report-tool',
  options: {
    enableHybridSearch?: boolean;
    config?: RRFConfig;
    debug?: boolean;
  } = {}
): Promise<{
  content: string | null;
  documents: DocumentWithScore[];
  statistics: RRFStatistics;
  metadata: {
    dynamicK: number;
    queriesUsed: string[];
    totalChunks: number;
    searchDuration: number;
    hybridSearchEnabled: boolean;
  };
}> {
  const startTime = Date.now();
  const { enableHybridSearch = false, config = {}, debug = false } = options;
  
  try {
    const index = pinecone.index(indexName);
    
    // namespace統計を取得
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    
    if (!namespaceStats || namespaceStats.recordCount === 0) {
      console.log(`No vectors found in namespace: ${namespace}`);
      return {
        content: null,
        documents: [],
        statistics: getRRFStatistics([]),
        metadata: {
          dynamicK: 0,
          queriesUsed: [],
          totalChunks: 0,
          searchDuration: Date.now() - startTime,
          hybridSearchEnabled: enableHybridSearch
        }
      };
    }
    
    const totalChunks = namespaceStats.recordCount;
    const dynamicK = getDynamicK(totalChunks, stakeholder, 'pinecone');
    
    // クエリ拡張
    const queryEnhancer = new CustomStakeholderQueryEnhancer();
    const queries = queryEnhancer.enhanceQuery(stakeholder, {
      maxQueries: 5,
      includeEnglish: true,
      includeSynonyms: true,
      includeRoleTerms: true
    });
    
    // 重み取得
    const weights = getWeightsForStakeholder(stakeholder, queries.length);
    
    // 検索K値
    const { rrfConstant = DEFAULT_RRF_CONSTANT, searchK } = config;
    const actualSearchK = searchK || Math.max(MIN_SEARCH_K, Math.ceil(dynamicK * DEFAULT_SEARCH_K_MULTIPLIER));
    
    console.log(`🎯 Adaptive RRF Search ${enableHybridSearch ? '(Hybrid)' : '(Dense only)'}:`);
    console.log(`  - Stakeholder: ${stakeholder.id} (${stakeholder.role})`);
    console.log(`  - Namespace: ${namespace}`);
    console.log(`  - Total chunks: ${totalChunks}`);
    console.log(`  - Dynamic K (topK): ${dynamicK}`);
    console.log(`  - Search K: ${actualSearchK}`);
    console.log(`  - Queries: ${queries.length}`);
    console.log(`  - Weights: [${weights.map(w => w.toFixed(1)).join(', ')}]`);
    
    // RRF検索の実行
    const documents = await executeRRFSearch(
      openai,
      index,
      namespace,
      queries,
      weights,
      dynamicK,
      actualSearchK,
      rrfConstant,
      enableHybridSearch
    );
    
    const searchDuration = Date.now() - startTime;
    
    // デバッグ出力
    if (debug && documents.length > 0) {
      debugRRFResults(documents, queries);
    }
    
    // K値達成率のログ
    logKAchievementRate(documents.length, dynamicK, stakeholder);
    
    console.log(`✅ RRF completed in ${searchDuration}ms: ${documents.length} documents returned`);
    
    return {
      content: documents.length > 0 ? formatSearchResults(documents) : null,
      documents,
      statistics: getRRFStatistics(documents),
      metadata: {
        dynamicK,
        queriesUsed: queries,
        totalChunks,
        searchDuration,
        hybridSearchEnabled: enableHybridSearch
      }
    };
    
  } catch (error) {
    console.error('RRF search error:', error);
    return {
      content: null,
      documents: [],
      statistics: getRRFStatistics([]),
      metadata: {
        dynamicK: 0,
        queriesUsed: [],
        totalChunks: 0,
        searchDuration: Date.now() - startTime,
        hybridSearchEnabled: enableHybridSearch
      }
    };
  }
}

/**
 * RRF検索の実行処理
 */
async function executeRRFSearch(
  openai: OpenAI,
  index: ReturnType<Pinecone['index']>,
  namespace: string,
  queries: string[],
  weights: number[],
  topK: number,
  searchK: number,
  rrfConstant: number,
  enableHybridSearch: boolean
): Promise<DocumentWithScore[]> {
  
  const documentScores = new Map<string, DocumentWithScore>();
  
  // 各クエリで検索を実行
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
    const query = queries[queryIndex];
    const weight = weights[queryIndex] || 1.0;
    
    console.log(`  Query ${queryIndex + 1}: "${query.substring(0, 50)}..." (weight: ${weight.toFixed(1)})`);
    
    try {
      let matches: Array<{
        id: string;
        score?: number;
        metadata?: Record<string, unknown>;
      }> = [];
      
      if (enableHybridSearch) {
        // ハイブリッド検索（Dense + Sparse）
        matches = await performHybridSearch(openai, index, namespace, query, searchK);
      } else {
        // Dense検索のみ
        matches = await performDenseSearch(openai, index, namespace, query, searchK);
      }
      
      console.log(`    Found ${matches.length} documents`);
      
      // 各ドキュメントにRRFスコアを計算
      matches.forEach((match, rank) => {
        const docId = match.id;
        const content = (match.metadata?.pageContent as string) || '';
        const originalScore = match.score || 0;
        
        if (!documentScores.has(docId)) {
          documentScores.set(docId, {
            id: docId,
            content,
            rrfScore: 0,
            queryScores: new Map(),
            ranks: new Map(),
            metadata: match.metadata
          });
        }
        
        const docData = documentScores.get(docId)!;
        
        // クエリ毎の情報を保存
        docData.queryScores.set(query, originalScore);
        docData.ranks.set(query, rank + 1); // ランクは1から開始
        
        // RRFスコアを計算して加算
        // 公式: weight / (k + rank)
        const rrfContribution = weight / (rrfConstant + rank + 1);
        docData.rrfScore += rrfContribution;
      });
      
    } catch (error) {
      console.error(`  Search failed for query "${query}":`, error);
    }
  }
  
  // RRFスコアでソートして上位topK件を取得
  const sortedDocs = Array.from(documentScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);
  
  console.log(`  Total unique documents: ${documentScores.size}`);
  console.log(`  Returning top ${sortedDocs.length} documents`);
  
  return sortedDocs;
}

/**
 * Dense検索（密ベクトル検索）
 */
async function performDenseSearch(
  openai: OpenAI,
  index: ReturnType<Pinecone['index']>,
  namespace: string,
  query: string,
  searchK: number
): Promise<Array<{
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
}>> {
  // エンベディング生成
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVector = embeddingResponse.data[0].embedding;
  
  // Pinecone検索
  const searchResults = await index.namespace(namespace).query({
    vector: queryVector,
    topK: searchK,
    includeMetadata: true,
  });
  
  return searchResults.matches || [];
}

/**
 * ハイブリッド検索（Dense + Sparse）
 */
async function performHybridSearch(
  openai: OpenAI,
  index: ReturnType<Pinecone['index']>,
  namespace: string,
  query: string,
  searchK: number
): Promise<Array<{
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
}>> {
  try {
    // Dense ベクトル生成
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const denseVector = embeddingResponse.data[0].embedding;
    
    // Sparse ベクトル生成
    const sparseVector = await createSparseVectorAuto(query);
    
    // ハイブリッド検索
    const searchResults = await index.namespace(namespace).query({
      vector: denseVector,
      sparseVector: {
        indices: sparseVector.indices,
        values: sparseVector.values
      },
      topK: searchK,
      includeMetadata: true,
    });
    
    return searchResults.matches || [];
    
  } catch (error) {
    console.warn('Hybrid search failed, falling back to dense search:', error);
    // フォールバック: Dense検索のみ
    return performDenseSearch(openai, index, namespace, query, searchK);
  }
}

// ============================================================
// シンプルなRAG検索関数（後方互換性用）
// ============================================================

/**
 * シンプルなRAG検索（既存のperformRAGSearchを置き換え）
 */
export async function performRAGSearch(
  openai: OpenAI,
  pinecone: Pinecone,
  stakeholder: Stakeholder,
  namespace: string,
  indexName: string = 'safety-status-report-tool'
): Promise<string | null> {
  const result = await performAdaptiveRRFSearch(
    openai,
    pinecone,
    stakeholder,
    namespace,
    indexName,
    {
      enableHybridSearch: false,
      debug: process.env.DEBUG_LOGGING === 'true'
    }
  );
  
  return result.content;
}

/**
 * ハイブリッド検索付きのRAG検索
 */
export async function performRAGSearchWithHybrid(
  openai: OpenAI,
  pinecone: Pinecone,
  stakeholder: Stakeholder,
  namespace: string,
  indexName: string = 'safety-status-report-tool'
): Promise<string | null> {
  const result = await performAdaptiveRRFSearch(
    openai,
    pinecone,
    stakeholder,
    namespace,
    indexName,
    {
      enableHybridSearch: true,
      debug: process.env.DEBUG_LOGGING === 'true'
    }
  );
  
  return result.content;
}
