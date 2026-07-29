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
import type { GSNView, GSNNode } from '../gsn/types';

// ============================================================
// 設定
// ============================================================

const DEBUG_LOGGING = process.env.DEBUG_LOGGING;
const DEFAULT_RRF_CONSTANT = 60;
const DEFAULT_SEARCH_K_MULTIPLIER = 1.5;
const MIN_SEARCH_K = 20;

// ============================================================
// Mandatory Safety Core フォールバック固定クエリ
// GSNから該当カテゴリのノードが取得できなかった場合に使用する
// ============================================================

const MANDATORY_CORE_FALLBACK_QUERIES = {
  highSeverityHazards:
    '高Severityハザード Critical High リスク 対策状況 残存リスク hazard critical high severity countermeasure residual risk',
  asilDItems:
    'ASIL-D ASIL-C 最高安全整合性レベル 機能安全要件 検証状況 safety integrity level highest requirement verification',
  unverifiedRequirements:
    '未検証安全要件 検証未完了 検証pending 安全要件ステータス unverified safety requirement verification incomplete pending',
  openIssues:
    '未解決事項 未解決課題 open issue 対応計画 未対処 未クローズ pending action plan unresolved',
  failedVerifications:
    'テスト失敗 検証失敗 FAIL FAILED 不合格 再試験条件 是正措置 test failure verification failed retest corrective action',
  criticalAssumptions:
    'Safety Case 前提条件 Assumption Context 成立条件 重要仮定 前提崩壊 critical assumption precondition validity',
} as const;

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
    if (DEBUG_LOGGING) {
      console.log(`🎯 Adaptive RRF Search ${enableHybridSearch ? '(Hybrid)' : '(Dense only)'}:`);
      console.log(`  - Stakeholder: ${stakeholder.id} (${stakeholder.role})`);
      console.log(`  - Namespace: ${namespace}`);
      console.log(`  - Total chunks: ${totalChunks}`);
      console.log(`  - Dynamic K (topK): ${dynamicK}`);
      console.log(`  - Search K: ${actualSearchK}`);
      console.log(`  - Queries: ${queries.length}`);
      console.log(`  - Weights: [${weights.map(w => w.toFixed(1)).join(', ')}]`);
    }
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
    if (DEBUG_LOGGING) {
      console.log(`✅ RRF completed in ${searchDuration}ms: ${documents.length} documents returned`);
    }

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
    if (DEBUG_LOGGING) {
      console.log(`  Query ${queryIndex + 1}: "${query.substring(0, 50)}..." (weight: ${weight.toFixed(1)})`);
    }
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

// ============================================================
// GSN Subtree-Aware 検索
// ============================================================

/**
 * GSNビューを活用したSubtree-aware RRF検索
 *
 * system_design.md の実装案:
 * 1. stakeholderごとにtraversal depth・node type・必須ノード種別を定義
 * 2. 選択されたGSN viewからlinked evidenceを取得
 * 3. GSN viewをreport outlineに変換
 *
 * 従来のflat RAGとの違い:
 * - GSNノード記述からクエリを生成（構造を活用）
 * - Mandatory Safety Coreをクエリセットに優先追加
 * - RRFウェイトをGSN達成状況で調整
 */
export async function performGSNSubtreeAwareSearch(
  openai: OpenAI,
  pinecone: Pinecone,
  stakeholder: Stakeholder,
  gsnView: GSNView,
  namespace: string,
  indexName: string = 'safety-status-report-tool',
  options: {
    enableHybridSearch?: boolean;
    config?: RRFConfig;
    debug?: boolean;
    outlineNodes?: GSNNode[];
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
    gsnNodesUsed: number;
    mandatoryCoreItemsFound: number;
  };
}> {
  const startTime = Date.now();
  const { enableHybridSearch = false, config = {}, debug = false, outlineNodes = [] } = options;

  try {
    const index = pinecone.index(indexName);
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];

    if (!namespaceStats || namespaceStats.recordCount === 0) {
      return {
        content: null,
        documents: [],
        statistics: getRRFStatistics([]),
        metadata: {
          dynamicK: 0, queriesUsed: [], totalChunks: 0,
          searchDuration: Date.now() - startTime,
          hybridSearchEnabled: enableHybridSearch,
          gsnNodesUsed: 0, mandatoryCoreItemsFound: 0,
        }
      };
    }

    const totalChunks = namespaceStats.recordCount;
    const dynamicK = getDynamicK(totalChunks, stakeholder, 'pinecone');

    // ============================================================
    // GSNビューからクエリを構築
    // ============================================================

    // 1. GSNノード記述から直接クエリを生成
    const gsnNodeQueries: string[] = [];

    // アウトライン（見出し）になるノード全てに対してクエリを生成（必須）
    // 未達成・部分達成を先頭に置き、達成済みノードも含める
    const outlineNodeIds = new Set(outlineNodes.map(n => n.id));
    const outlineUnachieved = outlineNodes.filter(
      n => n.status !== 'achieved' && n.description.trim().length > 0
    );
    const outlineAchieved = outlineNodes.filter(
      n => n.status === 'achieved' && n.description.trim().length > 0
    );
    for (const node of [...outlineUnachieved, ...outlineAchieved]) {
      gsnNodeQueries.push(`${node.id} ${node.description}`);
    }

    // アウトラインにない未達成・部分達成ノードを補完（最大2件）
    const extraPriorityNodes = gsnView.selectedNodes
      .filter(n => n.status !== 'achieved' && !outlineNodeIds.has(n.id) && n.description.trim().length > 0)
      .slice(0, 2);
    for (const node of extraPriorityNodes) {
      gsnNodeQueries.push(`${node.id} ${node.description}`);
    }

    // Mandatory Safety Core からのクエリ
    // ノードが取得できたカテゴリはノード記述をクエリ化し、
    // 取得できなかったカテゴリは固定フォールバッククエリを適用する
    const mc = gsnView.mandatoryCore;
    const mandatoryCoreCategories: Array<{
      nodes: typeof mc.highSeverityHazards;
      fallback: string;
    }> = [
      { nodes: mc.highSeverityHazards,     fallback: MANDATORY_CORE_FALLBACK_QUERIES.highSeverityHazards },
      { nodes: mc.asilDItems,              fallback: MANDATORY_CORE_FALLBACK_QUERIES.asilDItems },
      { nodes: mc.unverifiedRequirements,  fallback: MANDATORY_CORE_FALLBACK_QUERIES.unverifiedRequirements },
      { nodes: mc.openIssues,              fallback: MANDATORY_CORE_FALLBACK_QUERIES.openIssues },
      { nodes: mc.failedVerifications,     fallback: MANDATORY_CORE_FALLBACK_QUERIES.failedVerifications },
      { nodes: mc.criticalAssumptions,     fallback: MANDATORY_CORE_FALLBACK_QUERIES.criticalAssumptions },
    ];

    for (const category of mandatoryCoreCategories) {
      // アウトラインに未収録のノードだけ抽出
      const availableNodes = category.nodes.filter(
        n => !outlineNodeIds.has(n.id) && n.description.trim().length > 0
      );

      if (availableNodes.length > 0) {
        // ノードが取得できた場合: 先頭1件のノード記述をクエリ化
        gsnNodeQueries.push(`${availableNodes[0].id} ${availableNodes[0].description}`);
      } else if (category.nodes.length === 0) {
        // ノードが一件も取得できなかった場合: フォールバック固定クエリを適用
        gsnNodeQueries.push(category.fallback);
      }
      // アウトライン収録済みのみでフィルタ後ゼロの場合はスキップ（アウトラインで既にカバー済み）
    }

    // 2. GSNビューのクエリヒントを追加
    const hintQueries = gsnView.queryHints.slice(0, 2);

    // 3. 従来のステークホルダークエリ拡張も組み合わせる
    const queryEnhancer = new CustomStakeholderQueryEnhancer();
    const stakeholderQueries = queryEnhancer.enhanceQuery(stakeholder, {
      maxQueries: 3,
      includeEnglish: false,
      includeSynonyms: true,
      includeRoleTerms: true
    });

    // クエリを統合（GSNクエリを先頭に置いてRRFで重み付け）
    // アウトラインノード数に応じて上限を動的に設定
    const queryLimit = Math.max(15, outlineNodes.length + 5);
    const allQueries = [
      ...new Set([...gsnNodeQueries, ...hintQueries, ...stakeholderQueries])
    ].filter(q => q.trim().length > 0).slice(0, queryLimit);

    // 重みを設定: アウトライン未達成 > アウトライン達成済み > 補完ノード > ヒント > ステークホルダー
    const outlineQueryCount = outlineUnachieved.length + outlineAchieved.length;
    const weights = allQueries.map((_, idx) => {
      if (idx < outlineUnachieved.length) return 1.5;          // アウトライン未達成: 最高重み
      if (idx < outlineQueryCount) return 1.3;                  // アウトライン達成済み: 高重み
      if (idx < gsnNodeQueries.length) return 1.2;              // 補完・Core: 中重み
      if (idx < gsnNodeQueries.length + hintQueries.length) return 1.1; // ヒント
      return 1.0;                                               // ステークホルダークエリ: 通常
    });

    const { rrfConstant = 60, searchK } = config;
    const actualSearchK = searchK || Math.max(20, Math.ceil(dynamicK * 1.5));

    const documents = await executeRRFSearch(
      openai,
      index,
      namespace,
      allQueries,
      weights,
      dynamicK,
      actualSearchK,
      rrfConstant,
      enableHybridSearch
    );

    const searchDuration = Date.now() - startTime;

    if (debug) {
      debugRRFResults(documents, allQueries);
    }

    logKAchievementRate(documents.length, dynamicK, stakeholder);

    const allCoreNodes = [
      ...mc.highSeverityHazards,
      ...mc.asilDItems,
      ...mc.unverifiedRequirements,
      ...mc.openIssues,
      ...mc.failedVerifications,
      ...mc.criticalAssumptions,
    ];
    const mandatoryCoreItemsFound = allCoreNodes.filter(cn =>
      documents.some(doc =>
        doc.content.includes(cn.id) || doc.content.includes(cn.description.slice(0, 20))
      )
    ).length;

    return {
      content: documents.length > 0 ? formatSearchResults(documents) : null,
      documents,
      statistics: getRRFStatistics(documents),
      metadata: {
        dynamicK,
        queriesUsed: allQueries,
        totalChunks,
        searchDuration,
        hybridSearchEnabled: enableHybridSearch,
        gsnNodesUsed: gsnNodeQueries.length,
        mandatoryCoreItemsFound,
      }
    };

  } catch (error) {
    console.error('GSN subtree-aware search error:', error);
    return {
      content: null,
      documents: [],
      statistics: getRRFStatistics([]),
      metadata: {
        dynamicK: 0, queriesUsed: [], totalChunks: 0,
        searchDuration: Date.now() - startTime,
        hybridSearchEnabled: enableHybridSearch,
        gsnNodesUsed: 0, mandatoryCoreItemsFound: 0,
      }
    };
  }
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
