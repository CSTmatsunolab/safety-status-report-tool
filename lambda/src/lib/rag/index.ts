// src/lib/rag/index.ts
// RAG関連モジュールの統合エクスポート

// 型定義
export * from './types';

// クエリ拡張
export { 
  QueryEnhancer, 
  CustomStakeholderQueryEnhancer,
  debugQueryEnhancement 
} from './query-enhancer';

// RAGユーティリティ
export {
  getDynamicK,
  getWeightsForStakeholder,
  extractGSNElements,
  getRRFStatistics,
  debugRRFResults,
  truncateContent,
  generateNamespace,
  formatSearchResults,
  logKAchievementRate
} from './rag-utils';

// スパースベクトル
export {
  createSparseVector,
  createSparseVectorLite,
  createSparseVectorAuto,
  debugSparseVector
} from './sparse-vector-utils';

// RRF検索
export {
  performAdaptiveRRFSearch,
  performRAGSearch,
  performRAGSearchWithHybrid
} from './rrf-fusion';
