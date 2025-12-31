// metrics.ts - RAG評価指標の計算ロジック
// PDF「SSRツール評価方法.pdf」で定義された指標を実装

import {
  QueryEvaluationResult,
  EvaluationReport,
  RetrievedChunk,
  RelevantChunk,
} from './types';

/**
 * Precision@K: 取得したK件のうち、正解だった割合
 * 数式: |Hit(K)| / |Retrieved(K)|
 */
export function calculatePrecisionAtK(
  retrievedChunks: RetrievedChunk[],
  relevantChunkIds: Set<string>,
  k: number
): number {
  const topK = retrievedChunks.slice(0, k);
  if (topK.length === 0) return 0;

  const hits = topK.filter(chunk => relevantChunkIds.has(chunk.chunkId)).length;
  return hits / topK.length;
}

/**
 * Recall@K: 正解チャンクのうち、K件以内に取得できた割合
 * 数式: |Hit(K)| / |Relevant|
 */
export function calculateRecallAtK(
  retrievedChunks: RetrievedChunk[],
  relevantChunkIds: Set<string>,
  k: number
): number {
  if (relevantChunkIds.size === 0) return 0;

  const topK = retrievedChunks.slice(0, k);
  const hits = topK.filter(chunk => relevantChunkIds.has(chunk.chunkId)).length;
  return hits / relevantChunkIds.size;
}

/**
 * F1@K: PrecisionとRecallの調和平均
 * 数式: 2 * P * R / (P + R)
 */
export function calculateF1AtK(precisionAtK: number, recallAtK: number): number {
  if (precisionAtK + recallAtK === 0) return 0;
  return (2 * precisionAtK * recallAtK) / (precisionAtK + recallAtK);
}

/**
 * Reciprocal Rank: 最初の正解が出現した順位の逆数
 * 数式: 1 / rank(first_correct)
 */
export function calculateReciprocalRank(
  retrievedChunks: RetrievedChunk[],
  relevantChunkIds: Set<string>
): number {
  for (let i = 0; i < retrievedChunks.length; i++) {
    if (relevantChunkIds.has(retrievedChunks[i].chunkId)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * DCG@K: Discounted Cumulative Gain
 * 数式: Σ (rel_i / log2(i + 1))
 */
export function calculateDCGAtK(
  retrievedChunks: RetrievedChunk[],
  relevanceScores: Map<string, number>,
  k: number
): number {
  const topK = retrievedChunks.slice(0, k);
  let dcg = 0;

  for (let i = 0; i < topK.length; i++) {
    const rel = relevanceScores.get(topK[i].chunkId) || 0;
    dcg += rel / Math.log2(i + 2); // log2(i+2) because i is 0-indexed
  }

  return dcg;
}

/**
 * IDCG@K: Ideal DCG（理想的な並び順でのDCG）
 */
export function calculateIDCGAtK(
  relevanceScores: Map<string, number>,
  k: number
): number {
  // 関連度スコアを降順にソート
  const sortedScores = Array.from(relevanceScores.values()).sort((a, b) => b - a);
  const topK = sortedScores.slice(0, k);

  let idcg = 0;
  for (let i = 0; i < topK.length; i++) {
    idcg += topK[i] / Math.log2(i + 2);
  }

  return idcg;
}

/**
 * nDCG@K: Normalized DCG
 * 数式: DCG@K / IDCG@K
 */
export function calculateNDCGAtK(
  retrievedChunks: RetrievedChunk[],
  relevanceScores: Map<string, number>,
  k: number
): number {
  const dcg = calculateDCGAtK(retrievedChunks, relevanceScores, k);
  const idcg = calculateIDCGAtK(relevanceScores, k);

  if (idcg === 0) return 0;
  return dcg / idcg;
}

/**
 * Coverage: どれだけ多様なファイルから情報を取得できたか
 * 数式: |Files_hit| / |Files_all|
 */
export function calculateCoverage(
  allRetrievedChunks: RetrievedChunk[][],
  allFiles: string[]
): number {
  if (allFiles.length === 0) return 0;

  const hitFiles = new Set<string>();
  for (const chunks of allRetrievedChunks) {
    for (const chunk of chunks) {
      hitFiles.add(chunk.fileName);
    }
  }

  return hitFiles.size / allFiles.length;
}

/**
 * K値達成率: 目標のK件を取得できたクエリの割合
 * 数式: Success_count / |Queries|
 */
export function calculateKAchievementRate(
  allRetrievedChunks: RetrievedChunk[][],
  k: number
): number {
  if (allRetrievedChunks.length === 0) return 0;

  const successCount = allRetrievedChunks.filter(chunks => chunks.length >= k).length;
  return successCount / allRetrievedChunks.length;
}

/**
 * 単一クエリの評価を実行
 */
export function evaluateQuery(
  queryId: string,
  query: string,
  stakeholderId: string,
  retrievedChunks: RetrievedChunk[],
  relevantChunks: RelevantChunk[],
  k: number
): QueryEvaluationResult {
  // 正解チャンクIDのセットを作成
  const relevantChunkIds = new Set(relevantChunks.map(c => c.chunkId));

  // 関連度スコアのマップを作成
  const relevanceScores = new Map<string, number>();
  for (const chunk of relevantChunks) {
    relevanceScores.set(chunk.chunkId, chunk.relevanceScore);
  }

  // 各指標を計算
  const precisionAtK = calculatePrecisionAtK(retrievedChunks, relevantChunkIds, k);
  const recallAtK = calculateRecallAtK(retrievedChunks, relevantChunkIds, k);
  const f1AtK = calculateF1AtK(precisionAtK, recallAtK);
  const reciprocalRank = calculateReciprocalRank(retrievedChunks, relevantChunkIds);
  const ndcgAtK = calculateNDCGAtK(retrievedChunks, relevanceScores, k);

  // ヒットしたチャンクを特定
  const hits = retrievedChunks
    .slice(0, k)
    .filter(c => relevantChunkIds.has(c.chunkId))
    .map(c => c.chunkId);

  return {
    queryId,
    query,
    stakeholderId,
    metrics: {
      precisionAtK,
      recallAtK,
      f1AtK,
      reciprocalRank,
      ndcgAtK,
    },
    retrievedChunks,
    relevantChunks,
    hits,
  };
}

/**
 * 全体の評価レポートを生成
 */
export function generateEvaluationReport(
  queryResults: QueryEvaluationResult[],
  allRetrievedChunks: RetrievedChunk[][],
  allFiles: string[],
  groundTruthVersion: string,
  k: number,
  namespace: string
): EvaluationReport {
  const totalQueries = queryResults.length;

  // 各指標の平均を計算
  const avgPrecisionAtK = queryResults.reduce((sum, r) => sum + r.metrics.precisionAtK, 0) / totalQueries;
  const avgRecallAtK = queryResults.reduce((sum, r) => sum + r.metrics.recallAtK, 0) / totalQueries;
  const avgF1AtK = queryResults.reduce((sum, r) => sum + r.metrics.f1AtK, 0) / totalQueries;
  const mrr = queryResults.reduce((sum, r) => sum + r.metrics.reciprocalRank, 0) / totalQueries;
  const avgNdcgAtK = queryResults.reduce((sum, r) => sum + r.metrics.ndcgAtK, 0) / totalQueries;

  // Coverage と K値達成率
  const coverage = calculateCoverage(allRetrievedChunks, allFiles);
  const kAchievementRate = calculateKAchievementRate(allRetrievedChunks, k);

  return {
    timestamp: new Date().toISOString(),
    config: {
      k,
      namespace,
      groundTruthVersion,
    },
    summary: {
      totalQueries,
      avgPrecisionAtK,
      avgRecallAtK,
      avgF1AtK,
      mrr,
      avgNdcgAtK,
      coverage,
      kAchievementRate,
    },
    queryResults,
  };
}

/**
 * 評価レポートをフォーマットして文字列として出力
 */
export function formatEvaluationReport(report: EvaluationReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║                    RAG 評価結果レポート                          ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`📅 評価日時: ${report.timestamp}`);
  lines.push(`📊 K値: ${report.config.k}`);
  lines.push(`📁 Namespace: ${report.config.namespace}`);
  lines.push(`📋 Ground Truth Version: ${report.config.groundTruthVersion}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                         📈 全体サマリー');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('┌─────────────────────┬─────────────┬───────────────────────────────┐');
  lines.push('│ 指標                │ スコア      │ 説明                          │');
  lines.push('├─────────────────────┼─────────────┼───────────────────────────────┤');
  lines.push(`│ Precision@${report.config.k.toString().padEnd(2)}       │ ${(report.summary.avgPrecisionAtK * 100).toFixed(2).padStart(6)}%     │ 取得チャンクの正解率          │`);
  lines.push(`│ Recall@${report.config.k.toString().padEnd(2)}          │ ${(report.summary.avgRecallAtK * 100).toFixed(2).padStart(6)}%     │ 正解チャンクの取得率          │`);
  lines.push(`│ F1@${report.config.k.toString().padEnd(2)}              │ ${(report.summary.avgF1AtK * 100).toFixed(2).padStart(6)}%     │ Precision/Recallのバランス    │`);
  lines.push(`│ MRR                 │ ${report.summary.mrr.toFixed(4).padStart(6)}      │ 最初の正解の上位出現度        │`);
  lines.push(`│ nDCG@${report.config.k.toString().padEnd(2)}            │ ${report.summary.avgNdcgAtK.toFixed(4).padStart(6)}      │ 順位付き正解品質              │`);
  lines.push('├─────────────────────┼─────────────┼───────────────────────────────┤');
  lines.push(`│ Coverage            │ ${(report.summary.coverage * 100).toFixed(2).padStart(6)}%     │ ファイルの網羅率              │`);
  lines.push(`│ K値達成率           │ ${(report.summary.kAchievementRate * 100).toFixed(2).padStart(6)}%     │ 目標K件取得の成功率           │`);
  lines.push('└─────────────────────┴─────────────┴───────────────────────────────┘');
  lines.push('');
  lines.push(`📊 評価クエリ数: ${report.summary.totalQueries}`);
  lines.push('');

  // クエリ別の詳細
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                         📝 クエリ別詳細');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const result of report.queryResults) {
    lines.push(`🔍 ${result.queryId} (${result.stakeholderId})`);
    lines.push(`   Query: ${result.query.substring(0, 60)}${result.query.length > 60 ? '...' : ''}`);
    lines.push(`   P@K: ${(result.metrics.precisionAtK * 100).toFixed(1)}% | R@K: ${(result.metrics.recallAtK * 100).toFixed(1)}% | F1: ${(result.metrics.f1AtK * 100).toFixed(1)}%`);
    lines.push(`   RR: ${result.metrics.reciprocalRank.toFixed(4)} | nDCG: ${result.metrics.ndcgAtK.toFixed(4)}`);
    lines.push(`   Hits: ${result.hits.length}/${result.relevantChunks.length} (${result.hits.join(', ') || 'none'})`);
    lines.push('');
  }

  return lines.join('\n');
}
