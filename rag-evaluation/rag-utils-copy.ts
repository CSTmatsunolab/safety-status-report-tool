// rag-utils-copy.ts
// SSRツールのsrc/lib/rag-utils.tsから動的K値計算ロジックをコピー
// ※評価スクリプト用にimport文のみ修正

import { Stakeholder } from './types';

/**
 * 動的K値計算関数（比率ベース）
 */
export function getDynamicK(
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string = 'pinecone'
): number {
  // 定数
  const RATIO_MIN = 0.08;
  const RATIO_MAX = 0.15;
  const ABSOLUTE_MIN = 15;
  const ABSOLUTE_MAX: Record<string, number> = { 'pinecone': 50, 'memory': 20 };

  // ステークホルダー別ターゲット比率
  const targetRatios: Record<string, number> = {
    'cxo': 0.08,
    'business': 0.09,
    'product': 0.11,
    'technical-fellows': 0.14,
    'architect': 0.14,
    'r-and-d': 0.15,
  };

  // 比率取得（カスタムはフォールバック）
  const ratio = targetRatios[stakeholder.id] ?? getCustomStakeholderRatio(stakeholder);

  // 範囲計算（逆転ガード付き）
  const absoluteMax = ABSOLUTE_MAX[storeType] || 50;
  const minK = Math.max(ABSOLUTE_MIN, Math.ceil(totalChunks * RATIO_MIN));
  const maxK = Math.max(minK, Math.min(absoluteMax, Math.ceil(totalChunks * RATIO_MAX)));

  // 最終K値
  const targetK = Math.ceil(totalChunks * ratio);
  return Math.min(maxK, Math.max(minK, targetK));
}

/**
 * カスタムステークホルダーの比率判定
 */
function getCustomStakeholderRatio(stakeholder: Stakeholder): number {
  const role = stakeholder.role.toLowerCase();
  
  if (role.includes('技術') || role.includes('開発') || role.includes('エンジニア') ||
      role.includes('engineer') || role.includes('developer') || role.includes('architect')) {
    return 0.14;
  }
  if (role.includes('経営') || role.includes('cxo') || role.includes('executive') ||
      role.includes('ceo') || role.includes('cto') || role.includes('cfo')) {
    return 0.08;
  }
  if (role.includes('リスク') || role.includes('品質') || role.includes('risk') || role.includes('qa')) {
    return 0.12;
  }
  return 0.11;
}