// src/lib/rag/types.ts
// RAG関連の型定義

// Stakeholderを再エクスポート（便利のため）
export type { Stakeholder } from '../../types';

// RRF関連の型
export interface DocumentWithScore {
  id: string;
  content: string;
  rrfScore: number;
  queryScores: Map<string, number>;
  ranks: Map<string, number>;
  metadata?: Record<string, unknown>;
}

export interface RRFConfig {
  rrfConstant?: number;  // デフォルト: 60
  searchK?: number;      // 各クエリで検索するドキュメント数
}

export interface RRFStatistics {
  averageRRFScore: number;
  averageQueryCoverage: number;
  documentsByFile: Map<string, number>;
  totalUniqueDocuments: number;
}

// クエリ拡張関連の型
export interface QueryEnhancementConfig {
  maxQueries?: number;           // 生成するクエリの最大数（デフォルト: 5）
  includeEnglish?: boolean;       // 英語クエリを含むか（デフォルト: true）
  includeSynonyms?: boolean;      // 同義語展開を行うか（デフォルト: true）
  includeRoleTerms?: boolean;     // ロール固有の用語を含むか（デフォルト: true）
}

// スパースベクトル関連の型
export interface SparseValues {
  indices: number[];
  values: number[];
}

// RAG検索結果の型
export interface RAGSearchResult {
  content: string;
  documents: DocumentWithScore[];
  statistics: RRFStatistics;
  searchMetadata: {
    dynamicK: number;
    queriesUsed: string[];
    totalChunks: number;
    searchDuration: number;
  };
}
