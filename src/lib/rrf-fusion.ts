// src/lib/rrf-fusion.ts
import { Document } from '@langchain/core/documents';
import { VectorStore } from '@langchain/core/vectorstores';
import { PineconeStore } from '@langchain/pinecone';
import { Embeddings } from '@langchain/core/embeddings';
import { createSparseVector } from './sparse-vector-utils';
import { type ScoredPineconeRecord } from '@pinecone-database/pinecone';

/**
 * RRF設定インターフェース（シンプル化）
 * 
 * @param searchK - 各クエリで検索するドキュメント数（デフォルト: dynamicK * 1.5）
 * @param rrfConstant - RRFアルゴリズムの定数K（デフォルト: 60）
 */
export interface RRFConfig {
  searchK?: number;      
  rrfConstant?: number;  
}

interface DocumentWithScore {
  document: Document;
  rrfScore: number;
  queryScores: Map<string, number>;
  ranks: Map<string, number>;
}

interface HybridSearchMetadata extends Record<string, unknown> {
  pageContent?: string;
  fileName?: string;
  chunkIndex?: number;
}

/**
 * Adaptive RRF検索（統一版）
 * ステークホルダーに応じて自動的に重みを調整
 * Pineconeの場合はハイブリッド検索、それ以外は密ベクトル検索を使用
 * 
 * @param vectorStore - ベクトルストア
 * @param embeddings - エンベディングモデル
 * @param queries - クエリ配列
 * @param dynamicK - getDynamicK()で計算された動的K値
 * @param stakeholderType - ステークホルダータイプ
 * @returns ランク付けされたドキュメント
 */
export async function performAdaptiveRRFSearch(
  vectorStore: VectorStore,
  embeddings: Embeddings,
  queries: string[],
  dynamicK: number,
  stakeholderType: string
): Promise<Document[]> {
  
  // ステークホルダーに応じた重み設定
  const weights = getWeightsForStakeholder(stakeholderType, queries.length);
  
  // 動的K値に基づいて検索数を計算
  const searchK = Math.max(20, Math.ceil(dynamicK * 1.5));
  const rrfConstant = 60;  // 固定値
  
  // PineconeStoreかどうかを判定
  const isPinecone = vectorStore instanceof PineconeStore;
  
  console.log(`🎯 Adaptive RRF Search ${isPinecone ? '(Hybrid)' : '(Dense only)'}:`);
  console.log(`  - Stakeholder: ${stakeholderType}`);
  console.log(`  - Queries: ${queries.length}`);
  console.log(`  - Dynamic K (topK): ${dynamicK}`);
  console.log(`  - Search K: ${searchK}`);
  console.log(`  - Weights: [${weights.map(w => w.toFixed(1)).join(', ')}]`);
  
  // RRF検索の実行
  return executeRRFSearch(
    vectorStore,
    embeddings,
    queries,
    dynamicK,
    searchK,
    rrfConstant,
    weights,
    stakeholderType
  );
}

/**
 * ステークホルダー別の重みを取得
 */
function getWeightsForStakeholder(stakeholderType: string, queryCount: number): number[] {
  switch(stakeholderType) {
    case 'technical-fellows':
    case 'architect':
    case 'r-and-d':
      // 技術系：最初のクエリ（完全な専門用語）を重視
      return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.5 : 1.0);
    
    case 'cxo':
    case 'business':
      // ビジネス系：シンプルなクエリを重視
      return Array(queryCount).fill(1.0).map((_, idx) => idx < 2 ? 1.2 : 0.8);
    
    case 'product':
      // プロダクト：バランス型だが最初を少し重視
      return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.2 : 1.0);
    
    default:
      // カスタムステークホルダーの処理
      if (stakeholderType.startsWith('custom_')) {
        return getCustomStakeholderWeights(stakeholderType, queryCount);
      }
      // デフォルト：均等な重み
      return Array(queryCount).fill(1.0);
  }
}

/**
 * カスタムステークホルダーの重み推定
 */
function getCustomStakeholderWeights(stakeholderId: string, queryCount: number): number[] {
  const lower = stakeholderId.toLowerCase();
  
  // 技術系のキーワード
  if (lower.includes('tech') || lower.includes('engineer') || 
      lower.includes('開発') || lower.includes('技術')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.4 : 1.0);
  }
  
  // ビジネス系のキーワード
  if (lower.includes('business') || lower.includes('経営') || 
      lower.includes('exec') || lower.includes('営業')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx < 2 ? 1.2 : 0.9);
  }
  
  // デフォルト：均等
  return Array(queryCount).fill(1.0);
}

/**
 * RRF検索の実行処理
 */
async function executeRRFSearch(
  vectorStore: VectorStore,
  embeddings: Embeddings,
  queries: string[],
  topK: number,
  searchK: number,
  rrfConstant: number,
  weights: number[],
  stakeholderType: string
): Promise<Document[]> {
  
  const documentScores = new Map<string, DocumentWithScore>();
  
  // PineconeStoreの場合のハイブリッド検索設定を取得
  let pineconeIndex = null;
  let namespace = '';
  
  if (vectorStore instanceof PineconeStore) {
    try {
      pineconeIndex = vectorStore.pineconeIndex;
      namespace = vectorStore.namespace || '';
      
      if (!pineconeIndex) {
        console.warn('⚠️ PineconeIndex not available, falling back to dense search');
      }
    } catch (error) {
      console.warn('⚠️ Could not access Pinecone properties:', error);
    }
  }

  // 各クエリで検索を実行
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
    const query = queries[queryIndex];
    const weight = weights[queryIndex] || 1.0;
    
    console.log(`  Query ${queryIndex + 1}: "${query.substring(0, 50)}..." (weight: ${weight.toFixed(1)})`);
    
    try {
      let results: Array<[Document, number]> = [];
      
      if (pineconeIndex) {
        // ===== Pineconeハイブリッド検索 =====
        try {
          // 1. クエリの密ベクトルと疎ベクトルを生成
          const denseVector = await embeddings.embedQuery(query);
          const sparseVector = await createSparseVector(query);

          // 2. Pineconeのハイブリッド検索を実行
          const namespacedIndex = pineconeIndex.namespace(namespace);
          const queryResponse = await namespacedIndex.query({
            vector: denseVector,
            sparseVector: sparseVector,
            topK: searchK,
            includeMetadata: true,
          });
          if (queryResponse.matches) {
            queryResponse.matches.forEach((match: ScoredPineconeRecord) => {
              const metadata = match.metadata as HybridSearchMetadata | undefined;
              const pageContent = (metadata?.pageContent as string) || '';
              
              // メタデータのコピーを作成
              const cleanMetadata = { ...metadata };
              delete cleanMetadata.pageContent;

              results.push([
                new Document({
                  pageContent: pageContent,
                  metadata: cleanMetadata,
                }),
                match.score || 0
              ]);
            });
            
            console.log(`    Hybrid search found ${results.length} documents`);
          }
        } catch (hybridError) {
          console.warn(`    ⚠️ Hybrid search failed, falling back to dense search:`, hybridError);
          // Pinecone経由でも密ベクトルのみの検索にフォールバック
          results = await performDenseSearch(vectorStore, query, searchK);
        }
      } else {
        // ===== 通常の密ベクトル検索（メモリストアなど） =====
        results = await performDenseSearch(vectorStore, query, searchK);
      }
      
      // 各ドキュメントにRRFスコアを計算
      results.forEach(([doc, originalScore], rank) => {
        const docId = generateDocumentId(doc);
        
        if (!documentScores.has(docId)) {
          documentScores.set(docId, {
            document: doc,
            rrfScore: 0,
            queryScores: new Map(),
            ranks: new Map()
          });
        }
        
        const docData = documentScores.get(docId)!;
        
        // クエリ毎の情報を保存
        docData.queryScores.set(query, originalScore);
        docData.ranks.set(query, rank + 1); // ランクは1から開始
        
        // RRFスコアを計算して加算
        // RRF formula: weight * (1 / (rrfConstant + rank))
        const rrfContribution = weight / (rrfConstant + rank + 1);
        docData.rrfScore += rrfContribution;
      });
      
      console.log(`    Total unique documents so far: ${documentScores.size}`);
      
    } catch (error) {
      console.error(`  ❌ Search failed for query "${query}":`, error);
    }
  }
  
  // RRFスコアでソートして上位topK件を返す
  const sortedDocs = Array.from(documentScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);
  
  console.log(`✅ RRF completed: ${sortedDocs.length} documents returned from ${documentScores.size} unique documents`);
  
  // メタデータにRRF情報を追加して返す
  return sortedDocs.map(({ document, rrfScore, queryScores, ranks }) => {
    return new Document({
      pageContent: document.pageContent,
      metadata: {
        ...document.metadata,
        rrfScore: rrfScore,
        rrfRanks: Array.from(ranks.entries()).map(([q, r]) => ({ 
          query: q.substring(0, 30) + '...', 
          rank: r 
        })),
        rrfQueryCount: queryScores.size
      }
    });
  });
}

/**
 * 通常の密ベクトル検索を実行
 */
async function performDenseSearch(
  vectorStore: VectorStore,
  query: string,
  searchK: number
): Promise<Array<[Document, number]>> {
  
  // similaritySearchWithScoreが利用可能な場合
  if ('similaritySearchWithScore' in vectorStore && 
      typeof vectorStore.similaritySearchWithScore === 'function') {
    try {
      const results = await vectorStore.similaritySearchWithScore(query, searchK);
      console.log(`    Dense search found ${results.length} documents`);
      return results;
    } catch (error) {
      console.warn(`    Dense search with score failed:`, error);
    }
  }
  
  // similaritySearchのみの場合（スコアなし）
  if ('similaritySearch' in vectorStore && 
      typeof vectorStore.similaritySearch === 'function') {
    try {
      const docs = await vectorStore.similaritySearch(query, searchK);
      console.log(`    Dense search (no score) found ${docs.length} documents`);
      // 順位ベースの疑似スコアを生成
      return docs.map((doc, idx) => [doc, 1.0 - (idx / searchK)]);
    } catch (error) {
      console.error(`    Dense search failed:`, error);
    }
  }
  
  console.error('    No search method available on vectorStore');
  return [];
}

/**
 * ドキュメントの一意なIDを生成
 */
function generateDocumentId(doc: Document): string {
  const fileName = doc.metadata?.fileName || 'unknown';
  const chunkIndex = doc.metadata?.chunkIndex ?? -1;
  
  if (chunkIndex >= 0) {
    return `${fileName}_chunk_${chunkIndex}`;
  }
  
  // チャンクインデックスがない場合は、コンテンツの先頭部分をハッシュ化
  const contentHash = hashString(doc.pageContent.substring(0, 100));
  return `${fileName}_${contentHash}`;
}

/**
 * 簡易ハッシュ関数
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * RRF結果の統計情報を取得
 */
export function getRRFStatistics(documents: Document[]): {
  averageRRFScore: number;
  averageQueryCoverage: number;
  documentsByFile: Map<string, number>;
} {
  if (documents.length === 0) {
    return {
      averageRRFScore: 0,
      averageQueryCoverage: 0,
      documentsByFile: new Map()
    };
  }
  
  const documentsByFile = new Map<string, number>();
  let totalRRFScore = 0;
  let totalQueryCoverage = 0;
  
  documents.forEach(doc => {
    totalRRFScore += doc.metadata?.rrfScore || 0;
    totalQueryCoverage += doc.metadata?.rrfQueryCount || 0;
    
    const fileName = doc.metadata?.fileName || 'unknown';
    documentsByFile.set(fileName, (documentsByFile.get(fileName) || 0) + 1);
  });
  
  return {
    averageRRFScore: totalRRFScore / documents.length,
    averageQueryCoverage: totalQueryCoverage / documents.length,
    documentsByFile
  };
}

/**
 * デバッグ用：RRF結果の詳細を表示
 */
export function debugRRFResults(documents: Document[]): void {
  console.log('\n' + '='.repeat(50));
  console.log('📊 RRF Debug Information');
  console.log('='.repeat(50));
  
  const stats = getRRFStatistics(documents);
  
  console.log('\n📈 Statistics:');
  console.log(`  - Total documents: ${documents.length}`);
  console.log(`  - Average RRF Score: ${stats.averageRRFScore.toFixed(4)}`);
  console.log(`  - Average Query Coverage: ${stats.averageQueryCoverage.toFixed(2)}`);
  
  console.log('\n📁 Documents by file:');
  stats.documentsByFile.forEach((count, file) => {
    console.log(`  - ${file}: ${count} chunks`);
  });
  
  console.log('\n🏆 Top 5 documents:');
  documents.slice(0, 5).forEach((doc, idx) => {
    console.log(`\n  ${idx + 1}. ${doc.metadata?.fileName} (chunk ${doc.metadata?.chunkIndex})`);
    console.log(`     RRF Score: ${doc.metadata?.rrfScore?.toFixed(4)}`);
    console.log(`     Query Coverage: ${doc.metadata?.rrfQueryCount} queries`);
    
    if (doc.metadata?.rrfRanks && doc.metadata.rrfRanks.length > 0) {
      console.log('     Top ranks:');
      doc.metadata.rrfRanks.slice(0, 2).forEach((rankInfo: { query: string; rank: number }) => {
        console.log(`       - "${rankInfo.query}": rank ${rankInfo.rank}`);
      });
    }
  });
  
  console.log('\n' + '='.repeat(50) + '\n');
}