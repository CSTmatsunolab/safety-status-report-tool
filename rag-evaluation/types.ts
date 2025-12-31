// types.ts - RAG評価用の型定義

/**
 * ステークホルダー情報
 */
export interface Stakeholder {
  id: string;
  role: string;
  concerns: string[];
}

/**
 * クエリ拡張設定
 */
export interface QueryEnhancementConfig {
  maxQueries?: number;
  includeEnglish?: boolean;
  includeSynonyms?: boolean;
  includeRoleTerms?: boolean;
}

/**
 * Ground Truth の各エントリ
 */
export interface GroundTruthEntry {
  queryId: string;
  query: string;
  stakeholderId: string;
  relevantChunks: RelevantChunk[];
}

/**
 * 正解チャンク情報
 */
export interface RelevantChunk {
  chunkId: string;
  fileName: string;
  relevanceScore: number; // 0-3: 0=無関係, 1=低, 2=中, 3=高
}

/**
 * Ground Truth 全体
 */
export interface GroundTruth {
  version: string;
  createdAt: string;
  description: string;
  entries: GroundTruthEntry[];
}

/**
 * 検索で取得したチャンク
 */
export interface RetrievedChunk {
  chunkId: string;
  fileName: string;
  content: string;
  rank: number;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * 各クエリの評価結果
 */
export interface QueryEvaluationResult {
  queryId: string;
  query: string;
  stakeholderId: string;
  metrics: {
    precisionAtK: number;
    recallAtK: number;
    f1AtK: number;
    reciprocalRank: number;
    ndcgAtK: number;
  };
  retrievedChunks: RetrievedChunk[];
  relevantChunks: RelevantChunk[];
  hits: string[]; // ヒットしたchunkId一覧
}

/**
 * 評価レポート全体
 */
export interface EvaluationReport {
  timestamp: string;
  config: {
    k: number;
    namespace: string;
    groundTruthVersion: string;
  };
  summary: {
    totalQueries: number;
    avgPrecisionAtK: number;
    avgRecallAtK: number;
    avgF1AtK: number;
    mrr: number;
    avgNdcgAtK: number;
    coverage: number;
    kAchievementRate: number;
  };
  queryResults: QueryEvaluationResult[];
}

/**
 * ラベリング用のチャンク情報（TSV出力用）
 */
export interface ChunkForLabeling {
  queryId: string;
  query: string;
  stakeholderId: string;
  chunkId: string;
  fileName: string;
  chunkIndex: number;
  rank: number;
  score: number;
  contentPreview: string;
  relevanceScore?: number; // ラベリング時に入力
}

/**
 * 評価設定
 */
export interface EvaluationConfig {
  k: number;
  namespace: string;
  indexName: string;
  groundTruthPath?: string;
  outputDir: string;
  enableHybridSearch?: boolean;
}
