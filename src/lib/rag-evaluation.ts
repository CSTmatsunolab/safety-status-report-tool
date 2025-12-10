// src/lib/rag-evaluation.ts
// ステークホルダーベースのRAG検索精度評価スクリプト

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 型定義
// ============================================

/**
 * ステークホルダー情報
 */
interface StakeholderConfig {
  id: string;
  role: string;
  concerns: string[];
}

/**
 * 正解チャンク情報
 */
interface RelevantChunk {
  fileName: string;
  chunkIndex: number;
  relevanceScore: number;  // 0-3
  category?: string;       // 情報カテゴリ
  reason?: string;         // 正解とする理由
}

/**
 * Ground Truth評価項目
 */
interface GroundTruthItem {
  evaluationId: string;
  stakeholder: StakeholderConfig;
  expectedInformation: string[];  // このステークホルダーが必要とする情報（参考用）
  relevantChunks: RelevantChunk[];
}

/**
 * Ground Truthデータセット
 */
interface GroundTruthDataset {
  version: string;
  createdAt: string;
  createdBy?: string;
  documentSet: {
    description: string;
    totalDocuments: number;
    totalChunks: number;
  };
  items: GroundTruthItem[];
}

/**
 * RAGログから取得したドキュメント情報
 */
interface RetrievedDocument {
  fileName: string;
  chunkIndex: number;
  rrfScore?: number;
  rrfQueryCount?: number;
  rank: number;
}

/**
 * RAGログファイルの構造
 */
interface RAGLogFile {
  timestamp: string;
  stakeholder: {
    id: string;
    role: string;
    concerns: string[];
  };
  searchParams: {
    query: string;
    enhancedQueries?: string[];
    k: number;
    totalChunks: number;
    vectorStoreType: string;
  };
  statistics: {
    documentsFound: number;
    totalCharacters: number;
    contextLength: number;
    rrfStatistics?: {
      averageRRFScore: number;
      averageQueryCoverage: number;
      documentsByFile?: Record<string, number>;
    };
  };
  fileBreakdown?: Record<string, {
    count: number;
    characters: number;
    chunks: number[];
  }>;
  documents: Array<{
    index: number;
    metadata: {
      fileName: string;
      chunkIndex?: number;
      rrfScore?: number;
      rrfQueryCount?: number;
    };
    contentPreview?: string;
  }>;
}

/**
 * 単一評価の結果
 */
interface EvaluationResult {
  evaluationId: string;
  stakeholder: StakeholderConfig;
  timestamp: string;
  
  metrics: {
    precisionAtK: number;
    recallAtK: number;
    f1AtK: number;
    mrr: number;
    ndcg: number;
    coverage: number;
    kAchievementRate: number;
  };
  
  details: {
    targetK: number;
    retrievedCount: number;
    relevantCount: number;
    relevantRetrievedCount: number;
    firstRelevantRank: number | null;
    uniqueFilesRetrieved: number;
    uniqueFilesRelevant: number;
  };
  
  // 追加分析
  analysis: {
    missedHighRelevance: RelevantChunk[];  // 取得できなかった高関連度チャンク
    falsePositives: RetrievedDocument[];   // 正解でないのに取得されたチャンク（上位10件）
    categoryBreakdown: Record<string, {
      total: number;
      retrieved: number;
      rate: number;
    }>;
  };
}

/**
 * 集計結果
 */
interface AggregatedResults {
  evaluatedAt: string;
  totalEvaluations: number;
  
  overallMetrics: {
    precisionAtK: number;
    recallAtK: number;
    f1AtK: number;
    mrr: number;
    ndcg: number;
    coverage: number;
    kAchievementRate: number;
  };
  
  byStakeholder: Record<string, {
    count: number;
    metrics: EvaluationResult['metrics'];
  }>;
  
  recommendations: string[];
}

// ============================================
// 評価指標の計算関数
// ============================================

/**
 * Precision@K
 */
function calculatePrecisionAtK(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[],
  k: number
): number {
  const topK = retrieved.slice(0, k);
  const relevantSet = new Set(
    relevant.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  
  const relevantInTopK = topK.filter(doc =>
    relevantSet.has(`${doc.fileName}::${doc.chunkIndex}`)
  ).length;
  
  return topK.length > 0 ? relevantInTopK / topK.length : 0;
}

/**
 * Recall@K
 */
function calculateRecallAtK(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[],
  k: number
): number {
  if (relevant.length === 0) return 1; // 正解がない場合は1とする
  
  const topK = retrieved.slice(0, k);
  const retrievedSet = new Set(
    topK.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  
  const relevantRetrieved = relevant.filter(doc =>
    retrievedSet.has(`${doc.fileName}::${doc.chunkIndex}`)
  ).length;
  
  return relevantRetrieved / relevant.length;
}

/**
 * F1@K
 */
function calculateF1AtK(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * MRR (Mean Reciprocal Rank)
 */
function calculateMRR(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[]
): { mrr: number; firstRank: number | null } {
  const relevantSet = new Set(
    relevant.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  
  for (let i = 0; i < retrieved.length; i++) {
    const doc = retrieved[i];
    if (relevantSet.has(`${doc.fileName}::${doc.chunkIndex}`)) {
      return { mrr: 1 / (i + 1), firstRank: i + 1 };
    }
  }
  
  return { mrr: 0, firstRank: null };
}

/**
 * nDCG (Normalized Discounted Cumulative Gain)
 */
function calculateNDCG(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[],
  k: number
): number {
  const relevanceMap = new Map<string, number>();
  relevant.forEach(r => {
    relevanceMap.set(`${r.fileName}::${r.chunkIndex}`, r.relevanceScore);
  });
  
  // DCG計算
  let dcg = 0;
  const topK = retrieved.slice(0, k);
  
  topK.forEach((doc, i) => {
    const key = `${doc.fileName}::${doc.chunkIndex}`;
    const rel = relevanceMap.get(key) || 0;
    dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  });
  
  // IDCG計算（理想的な順序）
  const sortedRelevant = [...relevant]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, k);
  
  let idcg = 0;
  sortedRelevant.forEach((doc, i) => {
    idcg += (Math.pow(2, doc.relevanceScore) - 1) / Math.log2(i + 2);
  });
  
  return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Coverage（ファイル単位）
 */
function calculateCoverage(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[]
): { coverage: number; retrievedFiles: number; relevantFiles: number } {
  const retrievedFiles = new Set(retrieved.map(d => d.fileName));
  const relevantFiles = new Set(relevant.map(r => r.fileName));
  
  const intersection = [...relevantFiles].filter(f => retrievedFiles.has(f));
  
  return {
    coverage: relevantFiles.size > 0 ? intersection.length / relevantFiles.size : 0,
    retrievedFiles: retrievedFiles.size,
    relevantFiles: relevantFiles.size
  };
}

/**
 * K値達成率
 */
function calculateKAchievementRate(
  retrievedCount: number,
  targetK: number
): number {
  return targetK > 0 ? Math.min(1, retrievedCount / targetK) : 0;
}

// ============================================
// 分析関数
// ============================================

/**
 * 取得できなかった高関連度チャンクを特定
 */
function findMissedHighRelevance(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[],
  k: number
): RelevantChunk[] {
  const topK = retrieved.slice(0, k);
  const retrievedSet = new Set(
    topK.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  
  return relevant
    .filter(r => r.relevanceScore >= 2)  // 関連度2以上
    .filter(r => !retrievedSet.has(`${r.fileName}::${r.chunkIndex}`));
}

/**
 * False Positives（正解でないのに取得されたチャンク）を特定
 */
function findFalsePositives(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[],
  k: number,
  limit: number = 10
): RetrievedDocument[] {
  const topK = retrieved.slice(0, k);
  const relevantSet = new Set(
    relevant.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  
  return topK
    .filter(doc => !relevantSet.has(`${doc.fileName}::${doc.chunkIndex}`))
    .slice(0, limit);
}

/**
 * カテゴリ別の取得率を計算
 */
function calculateCategoryBreakdown(
  retrieved: RetrievedDocument[],
  relevant: RelevantChunk[],
  k: number
): Record<string, { total: number; retrieved: number; rate: number }> {
  const topK = retrieved.slice(0, k);
  const retrievedSet = new Set(
    topK.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  
  const categoryStats: Record<string, { total: number; retrieved: number }> = {};
  
  relevant.forEach(r => {
    const category = r.category || 'その他';
    if (!categoryStats[category]) {
      categoryStats[category] = { total: 0, retrieved: 0 };
    }
    categoryStats[category].total++;
    
    if (retrievedSet.has(`${r.fileName}::${r.chunkIndex}`)) {
      categoryStats[category].retrieved++;
    }
  });
  
  const result: Record<string, { total: number; retrieved: number; rate: number }> = {};
  Object.entries(categoryStats).forEach(([cat, stats]) => {
    result[cat] = {
      ...stats,
      rate: stats.total > 0 ? stats.retrieved / stats.total : 0
    };
  });
  
  return result;
}

// ============================================
// メイン評価ロジック
// ============================================

/**
 * 単一ステークホルダーの評価を実行
 */
function evaluateStakeholder(
  ragLog: RAGLogFile,
  groundTruth: GroundTruthItem
): EvaluationResult {
  // RAGログから取得ドキュメントを変換
  const retrieved: RetrievedDocument[] = ragLog.documents.map((doc, idx) => ({
    fileName: doc.metadata.fileName,
    chunkIndex: doc.metadata.chunkIndex ?? idx,
    rrfScore: doc.metadata.rrfScore,
    rrfQueryCount: doc.metadata.rrfQueryCount,
    rank: idx + 1
  }));
  
  const k = ragLog.searchParams.k;
  const relevant = groundTruth.relevantChunks;
  
  // 各指標を計算
  const precisionAtK = calculatePrecisionAtK(retrieved, relevant, k);
  const recallAtK = calculateRecallAtK(retrieved, relevant, k);
  const f1AtK = calculateF1AtK(precisionAtK, recallAtK);
  const { mrr, firstRank } = calculateMRR(retrieved, relevant);
  const ndcg = calculateNDCG(retrieved, relevant, k);
  const { coverage, retrievedFiles, relevantFiles } = calculateCoverage(retrieved, relevant);
  const kAchievementRate = calculateKAchievementRate(retrieved.length, k);
  
  // 関連ドキュメントのうち取得できた数
  const topK = retrieved.slice(0, k);
  const retrievedSet = new Set(
    topK.map(r => `${r.fileName}::${r.chunkIndex}`)
  );
  const relevantRetrievedCount = relevant.filter(r =>
    retrievedSet.has(`${r.fileName}::${r.chunkIndex}`)
  ).length;
  
  // 分析
  const missedHighRelevance = findMissedHighRelevance(retrieved, relevant, k);
  const falsePositives = findFalsePositives(retrieved, relevant, k);
  const categoryBreakdown = calculateCategoryBreakdown(retrieved, relevant, k);
  
  return {
    evaluationId: groundTruth.evaluationId,
    stakeholder: groundTruth.stakeholder,
    timestamp: ragLog.timestamp,
    
    metrics: {
      precisionAtK,
      recallAtK,
      f1AtK,
      mrr,
      ndcg,
      coverage,
      kAchievementRate
    },
    
    details: {
      targetK: k,
      retrievedCount: retrieved.length,
      relevantCount: relevant.length,
      relevantRetrievedCount,
      firstRelevantRank: firstRank,
      uniqueFilesRetrieved: retrievedFiles,
      uniqueFilesRelevant: relevantFiles
    },
    
    analysis: {
      missedHighRelevance,
      falsePositives,
      categoryBreakdown
    }
  };
}

/**
 * 全評価結果を集計
 */
function aggregateResults(results: EvaluationResult[]): AggregatedResults {
  if (results.length === 0) {
    return {
      evaluatedAt: new Date().toISOString(),
      totalEvaluations: 0,
      overallMetrics: {
        precisionAtK: 0, recallAtK: 0, f1AtK: 0,
        mrr: 0, ndcg: 0, coverage: 0, kAchievementRate: 0
      },
      byStakeholder: {},
      recommendations: []
    };
  }
  
  // 全体平均
  const sum = results.reduce(
    (acc, r) => ({
      precisionAtK: acc.precisionAtK + r.metrics.precisionAtK,
      recallAtK: acc.recallAtK + r.metrics.recallAtK,
      f1AtK: acc.f1AtK + r.metrics.f1AtK,
      mrr: acc.mrr + r.metrics.mrr,
      ndcg: acc.ndcg + r.metrics.ndcg,
      coverage: acc.coverage + r.metrics.coverage,
      kAchievementRate: acc.kAchievementRate + r.metrics.kAchievementRate
    }),
    { precisionAtK: 0, recallAtK: 0, f1AtK: 0, mrr: 0, ndcg: 0, coverage: 0, kAchievementRate: 0 }
  );
  
  const n = results.length;
  const overallMetrics = {
    precisionAtK: sum.precisionAtK / n,
    recallAtK: sum.recallAtK / n,
    f1AtK: sum.f1AtK / n,
    mrr: sum.mrr / n,
    ndcg: sum.ndcg / n,
    coverage: sum.coverage / n,
    kAchievementRate: sum.kAchievementRate / n
  };
  
  // ステークホルダー別集計
  const byStakeholder: AggregatedResults['byStakeholder'] = {};
  
  results.forEach(r => {
    const sid = r.stakeholder.id;
    if (!byStakeholder[sid]) {
      byStakeholder[sid] = {
        count: 0,
        metrics: {
          precisionAtK: 0, recallAtK: 0, f1AtK: 0,
          mrr: 0, ndcg: 0, coverage: 0, kAchievementRate: 0
        }
      };
    }
    byStakeholder[sid].count++;
    Object.keys(r.metrics).forEach(key => {
      const k = key as keyof EvaluationResult['metrics'];
      byStakeholder[sid].metrics[k] += r.metrics[k];
    });
  });
  
  // ステークホルダー別平均
  Object.keys(byStakeholder).forEach(sid => {
    const count = byStakeholder[sid].count;
    Object.keys(byStakeholder[sid].metrics).forEach(key => {
      const k = key as keyof EvaluationResult['metrics'];
      byStakeholder[sid].metrics[k] /= count;
    });
  });
  
  // 改善推奨事項の生成
  const recommendations = generateRecommendations(results, overallMetrics, byStakeholder);
  
  return {
    evaluatedAt: new Date().toISOString(),
    totalEvaluations: n,
    overallMetrics,
    byStakeholder,
    recommendations
  };
}

/**
 * 改善推奨事項を生成
 */
function generateRecommendations(
  results: EvaluationResult[],
  overall: AggregatedResults['overallMetrics'],
  byStakeholder: AggregatedResults['byStakeholder']
): string[] {
  const recommendations: string[] = [];
  
  // Precision低い場合
  if (overall.precisionAtK < 0.5) {
    recommendations.push(
      `⚠️ Precision@K (${(overall.precisionAtK * 100).toFixed(1)}%) が低いです。` +
      `クエリ拡張の精度向上やチャンキング戦略の見直しを検討してください。`
    );
  }
  
  // Recall低い場合
  if (overall.recallAtK < 0.5) {
    recommendations.push(
      `⚠️ Recall@K (${(overall.recallAtK * 100).toFixed(1)}%) が低いです。` +
      `K値の増加や同義語展開の強化を検討してください。`
    );
  }
  
  // nDCG低い場合
  if (overall.ndcg < 0.5) {
    recommendations.push(
      `⚠️ nDCG (${overall.ndcg.toFixed(3)}) が低いです。` +
      `RRFの重み調整やステークホルダー別クエリの最適化を検討してください。`
    );
  }
  
  // Coverage低い場合
  if (overall.coverage < 0.6) {
    recommendations.push(
      `⚠️ Coverage (${(overall.coverage * 100).toFixed(1)}%) が低いです。` +
      `クエリの多様化やRRFのクエリ数増加を検討してください。`
    );
  }
  
  // K値達成率低い場合
  if (overall.kAchievementRate < 0.8) {
    recommendations.push(
      `⚠️ K値達成率 (${(overall.kAchievementRate * 100).toFixed(1)}%) が低いです。` +
      `ベクトルストアのドキュメント数やチャンキング設定を確認してください。`
    );
  }
  
  // ステークホルダー別の問題を特定
  Object.entries(byStakeholder).forEach(([sid, data]) => {
    if (data.metrics.recallAtK < overall.recallAtK * 0.8) {
      recommendations.push(
        `📋 ${sid} のRecallが全体平均より低いです。` +
        `このステークホルダー向けの関心事設定を見直してください。`
      );
    }
  });
  
  // よく見逃されるカテゴリを特定
  const categoryMisses: Record<string, number> = {};
  results.forEach(r => {
    r.analysis.missedHighRelevance.forEach(chunk => {
      const cat = chunk.category || 'その他';
      categoryMisses[cat] = (categoryMisses[cat] || 0) + 1;
    });
  });
  
  const topMissedCategories = Object.entries(categoryMisses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  if (topMissedCategories.length > 0 && topMissedCategories[0][1] >= 3) {
    recommendations.push(
      `📂 よく見逃されるカテゴリ: ${topMissedCategories.map(([c, n]) => `${c}(${n}件)`).join(', ')}。` +
      `これらのカテゴリに関連するクエリ生成を強化してください。`
    );
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ 全体的に良好な検索精度です。');
  }
  
  return recommendations;
}

// ============================================
// 出力関数
// ============================================

/**
 * コンソール出力
 */
function printResults(
  results: EvaluationResult[],
  aggregated: AggregatedResults
): void {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RAG Evaluation Results (Stakeholder-based)');
  console.log('═'.repeat(70));
  
  console.log(`\n📅 Evaluated at: ${aggregated.evaluatedAt}`);
  console.log(`📝 Total evaluations: ${aggregated.totalEvaluations}`);
  
  console.log('\n' + '─'.repeat(70));
  console.log('📈 Overall Metrics');
  console.log('─'.repeat(70));
  
  const m = aggregated.overallMetrics;
  console.log(`  Precision@K:      ${(m.precisionAtK * 100).toFixed(2)}%`);
  console.log(`  Recall@K:         ${(m.recallAtK * 100).toFixed(2)}%`);
  console.log(`  F1@K:             ${(m.f1AtK * 100).toFixed(2)}%`);
  console.log(`  MRR:              ${m.mrr.toFixed(4)}`);
  console.log(`  nDCG:             ${m.ndcg.toFixed(4)}`);
  console.log(`  Coverage:         ${(m.coverage * 100).toFixed(2)}%`);
  console.log(`  K Achievement:    ${(m.kAchievementRate * 100).toFixed(2)}%`);
  
  console.log('\n' + '─'.repeat(70));
  console.log('👥 By Stakeholder');
  console.log('─'.repeat(70));
  
  Object.entries(aggregated.byStakeholder).forEach(([sid, data]) => {
    console.log(`\n  📌 ${sid} (${data.count} evaluation${data.count > 1 ? 's' : ''}):`);
    console.log(`     Precision: ${(data.metrics.precisionAtK * 100).toFixed(1)}%  |  ` +
                `Recall: ${(data.metrics.recallAtK * 100).toFixed(1)}%  |  ` +
                `F1: ${(data.metrics.f1AtK * 100).toFixed(1)}%`);
    console.log(`     MRR: ${data.metrics.mrr.toFixed(3)}  |  ` +
                `nDCG: ${data.metrics.ndcg.toFixed(3)}  |  ` +
                `Coverage: ${(data.metrics.coverage * 100).toFixed(1)}%`);
  });
  
  console.log('\n' + '─'.repeat(70));
  console.log('💡 Recommendations');
  console.log('─'.repeat(70));
  
  aggregated.recommendations.forEach(rec => {
    console.log(`  ${rec}`);
  });
  
  console.log('\n' + '═'.repeat(70) + '\n');
}

/**
 * 詳細レポートを生成
 */
function generateDetailedReport(
  results: EvaluationResult[],
  aggregated: AggregatedResults
): string {
  let report = `# RAG評価レポート\n\n`;
  report += `生成日時: ${aggregated.evaluatedAt}\n\n`;
  
  report += `## 1. 概要\n\n`;
  report += `| 指標 | 値 | 判定 |\n`;
  report += `|------|-----|------|\n`;
  
  const m = aggregated.overallMetrics;
  report += `| Precision@K | ${(m.precisionAtK * 100).toFixed(2)}% | ${m.precisionAtK >= 0.7 ? '✅' : m.precisionAtK >= 0.5 ? '⚠️' : '❌'} |\n`;
  report += `| Recall@K | ${(m.recallAtK * 100).toFixed(2)}% | ${m.recallAtK >= 0.7 ? '✅' : m.recallAtK >= 0.5 ? '⚠️' : '❌'} |\n`;
  report += `| F1@K | ${(m.f1AtK * 100).toFixed(2)}% | ${m.f1AtK >= 0.7 ? '✅' : m.f1AtK >= 0.5 ? '⚠️' : '❌'} |\n`;
  report += `| MRR | ${m.mrr.toFixed(4)} | ${m.mrr >= 0.7 ? '✅' : m.mrr >= 0.5 ? '⚠️' : '❌'} |\n`;
  report += `| nDCG | ${m.ndcg.toFixed(4)} | ${m.ndcg >= 0.7 ? '✅' : m.ndcg >= 0.5 ? '⚠️' : '❌'} |\n`;
  report += `| Coverage | ${(m.coverage * 100).toFixed(2)}% | ${m.coverage >= 0.8 ? '✅' : m.coverage >= 0.6 ? '⚠️' : '❌'} |\n`;
  report += `| K値達成率 | ${(m.kAchievementRate * 100).toFixed(2)}% | ${m.kAchievementRate >= 0.9 ? '✅' : m.kAchievementRate >= 0.7 ? '⚠️' : '❌'} |\n`;
  
  report += `\n## 2. ステークホルダー別結果\n\n`;
  
  Object.entries(aggregated.byStakeholder).forEach(([sid, data]) => {
    report += `### ${sid}\n\n`;
    report += `- 評価数: ${data.count}\n`;
    report += `- Precision@K: ${(data.metrics.precisionAtK * 100).toFixed(2)}%\n`;
    report += `- Recall@K: ${(data.metrics.recallAtK * 100).toFixed(2)}%\n`;
    report += `- nDCG: ${data.metrics.ndcg.toFixed(4)}\n\n`;
  });
  
  report += `## 3. 改善推奨事項\n\n`;
  aggregated.recommendations.forEach(rec => {
    report += `- ${rec}\n`;
  });
  
  report += `\n## 4. 詳細結果\n\n`;
  
  results.forEach(r => {
    report += `### ${r.evaluationId}\n\n`;
    report += `- ステークホルダー: ${r.stakeholder.role}\n`;
    report += `- 取得数: ${r.details.retrievedCount} / 目標K: ${r.details.targetK}\n`;
    report += `- 正解取得数: ${r.details.relevantRetrievedCount} / ${r.details.relevantCount}\n`;
    
    if (r.analysis.missedHighRelevance.length > 0) {
      report += `- 見逃した重要チャンク:\n`;
      r.analysis.missedHighRelevance.slice(0, 5).forEach(chunk => {
        report += `  - ${chunk.fileName} (chunk ${chunk.chunkIndex}): ${chunk.reason || ''}\n`;
      });
    }
    report += `\n`;
  });
  
  return report;
}

// ============================================
// ファイル入出力
// ============================================

function loadGroundTruth(filePath: string): GroundTruthDataset {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function loadRAGLog(filePath: string): RAGLogFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function saveResults(
  results: EvaluationResult[],
  aggregated: AggregatedResults,
  outputPath: string
): void {
  const output = {
    summary: aggregated,
    details: results
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
}

// ============================================
// メイン実行関数
// ============================================

/**
 * 評価を実行
 */
export function runEvaluation(
  groundTruthPath: string,
  ragLogsDir: string,
  outputPath?: string
): AggregatedResults {
  console.log('🔍 Loading ground truth dataset...');
  const groundTruth = loadGroundTruth(groundTruthPath);
  console.log(`   Found ${groundTruth.items.length} evaluation items`);
  console.log(`   Document set: ${groundTruth.documentSet.description}`);
  
  console.log('\n📂 Loading RAG logs...');
  const ragLogFiles = fs.readdirSync(ragLogsDir)
    .filter(f => f.startsWith('rag_') && f.endsWith('.json') && !f.includes('summary'));
  console.log(`   Found ${ragLogFiles.length} RAG log files`);
  
  // RAGログをステークホルダーIDでインデックス化（最新のものを使用）
  const ragLogsByStakeholder = new Map<string, RAGLogFile>();
  
  ragLogFiles
    .sort()  // ファイル名でソート（タイムスタンプ順）
    .forEach(file => {
      const log = loadRAGLog(path.join(ragLogsDir, file));
      ragLogsByStakeholder.set(log.stakeholder.id, log);  // 後勝ち（最新）
    });
  
  console.log(`   Unique stakeholders in logs: ${ragLogsByStakeholder.size}`);
  
  console.log('\n⚙️  Running evaluation...');
  const results: EvaluationResult[] = [];
  
  groundTruth.items.forEach(item => {
    const log = ragLogsByStakeholder.get(item.stakeholder.id);
    
    if (!log) {
      console.warn(`   ⚠️  No RAG log found for: ${item.stakeholder.id}`);
      return;
    }
    
    const result = evaluateStakeholder(log, item);
    results.push(result);
    console.log(`   ✓ Evaluated: ${item.evaluationId} (${item.stakeholder.id})`);
  });
  
  // 集計
  const aggregated = aggregateResults(results);
  
  // コンソール出力
  printResults(results, aggregated);
  
  // ファイル保存
  if (outputPath) {
    saveResults(results, aggregated, outputPath);
    console.log(`💾 Results saved to: ${outputPath}`);
    
    // Markdownレポートも生成
    const reportPath = outputPath.replace('.json', '.md');
    const report = generateDetailedReport(results, aggregated);
    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`📄 Report saved to: ${reportPath}`);
  }
  
  return aggregated;
}

/**
 * Ground Truthテンプレートを生成
 */
export function generateGroundTruthTemplate(outputPath: string): void {
  const template: GroundTruthDataset = {
    version: "2.0",
    createdAt: new Date().toISOString(),
    createdBy: "評価者名を入力",
    documentSet: {
      description: "評価用文書セットの説明",
      totalDocuments: 30,
      totalChunks: 200
    },
    items: [
      {
        evaluationId: "eval_cxo_001",
        stakeholder: {
          id: "cxo",
          role: "経営層（CxO）",
          concerns: ["リスク管理", "プロジェクト進捗", "意思決定支援"]
        },
        expectedInformation: [
          "主要リスクとその対策状況",
          "安全性目標の達成度",
          "重要な意思決定ポイント"
        ],
        relevantChunks: [
          {
            fileName: "Risk_Analysis_Report.pdf",
            chunkIndex: 2,
            relevanceScore: 3,
            category: "リスク管理",
            reason: "主要リスク一覧と対策状況が記載"
          },
          {
            fileName: "Project_Status_Report.pdf",
            chunkIndex: 0,
            relevanceScore: 2,
            category: "進捗管理",
            reason: "プロジェクト全体の進捗サマリー"
          }
        ]
      },
      {
        evaluationId: "eval_tech_001",
        stakeholder: {
          id: "technical-fellows",
          role: "技術フェロー",
          concerns: ["技術的リスク", "GSN分析", "Evidence検証"]
        },
        expectedInformation: [
          "未検証のEvidence一覧",
          "GSNノードの詳細分析",
          "技術的ギャップ"
        ],
        relevantChunks: [
          {
            fileName: "GSN_Evidence_List.pdf",
            chunkIndex: 5,
            relevanceScore: 3,
            category: "GSN",
            reason: "Evidence検証状況の詳細リスト"
          },
          {
            fileName: "GSN_Goals_Detail.pdf",
            chunkIndex: 3,
            relevanceScore: 3,
            category: "GSN",
            reason: "Goal達成状況の詳細"
          }
        ]
      }
    ]
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`📝 Ground truth template (v2) generated: ${outputPath}`);
}

// ============================================
// CLI
// ============================================

const args = process.argv.slice(2);

if (args[0] === 'generate-template') {
  const outputPath = args[1] || './ground-truth-v2.json';
  generateGroundTruthTemplate(outputPath);
} else if (args[0] === 'evaluate') {
  const groundTruthPath = args[1];
  const ragLogsDir = args[2] || './logs/rag';
  const outputPath = args[3] || './evaluation-results-v2.json';
  
  if (!groundTruthPath) {
    console.error('Usage: npx ts-node rag-evaluation-v2.ts evaluate <ground-truth.json> [rag-logs-dir] [output.json]');
    process.exit(1);
  }
  
  runEvaluation(groundTruthPath, ragLogsDir, outputPath);
} else {
  console.log('RAG Evaluation Script v2 (Stakeholder-based)');
  console.log('=============================================\n');
  console.log('Usage:');
  console.log('  Generate template:  npx ts-node rag-evaluation-v2.ts generate-template [output.json]');
  console.log('  Run evaluation:     npx ts-node rag-evaluation-v2.ts evaluate <ground-truth.json> [rag-logs-dir] [output.json]');
}