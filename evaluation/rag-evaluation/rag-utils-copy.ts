// rag-utils-copy.ts
// SSRツールのsrc/lib/rag-utils.tsから動的K値計算ロジックをコピー
// ※評価スクリプト用にimport文のみ修正

import { Stakeholder } from './types';

// ========================================
// 動的K値計算（ステークホルダー別設定方式）
// ========================================

/**
 * ステークホルダー別のK値設定
 * - ratio: ターゲット比率（総チャンク数に対する取得割合）
 * - minK: 最小取得数（チャンク数が少なくてもこの数は確保）
 * - maxK: 最大取得数（チャンク数が多くてもこの数まで）
 */
interface StakeholderKConfig {
  ratio: number;
  minK: number;
  maxK: number;
}

const STAKEHOLDER_K_CONFIG: Record<string, StakeholderKConfig> = {
  // 経営系：要点重視、最低15は確保
  'cxo':               { ratio: 0.25, minK: 15, maxK: 50 },
  'business':          { ratio: 0.30, minK: 15, maxK: 60 },
  
  // プロダクト：中間
  'product':           { ratio: 0.40, minK: 18, maxK: 80 },
  
  // 技術系：詳細必要、最低22〜25を確保
  'technical-fellows': { ratio: 0.55, minK: 22, maxK: 120 },
  'architect':         { ratio: 0.55, minK: 22, maxK: 120 },
  'r-and-d':           { ratio: 0.60, minK: 25, maxK: 120 },
};

// メモリストア用の上限係数（Pineconeの半分程度）
const MEMORY_STORE_MAX_FACTOR = 0.4;

/**
 * 動的K値計算関数（ステークホルダー別設定方式）
 * 
 * 戦略:
 * - 少ないチャンク数でも最小値により差がつく
 * - 技術系は高比率（55%〜60%）で十分な情報量
 * - 経営系は低比率（25%〜30%）で要点のみ
 * - 大規模時は最大値で制御（コスト抑制）
 */
export function getDynamicK(
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string = 'pinecone'
): number {
  // ステークホルダー設定を取得
  const config = STAKEHOLDER_K_CONFIG[stakeholder.id] 
    ?? getCustomStakeholderKConfig(stakeholder);

  // ストアタイプによる上限調整
  let effectiveMaxK = config.maxK;
  if (storeType === 'memory') {
    effectiveMaxK = Math.ceil(config.maxK * MEMORY_STORE_MAX_FACTOR);
  }

  // K値計算
  const targetK = Math.ceil(totalChunks * config.ratio);
  return Math.min(effectiveMaxK, Math.max(config.minK, targetK));
}

/**
 * カスタムステークホルダーのK値設定を取得
 */
function getCustomStakeholderKConfig(stakeholder: Stakeholder): StakeholderKConfig {
  const role = stakeholder.role.toLowerCase();
  
  // 技術系 → 技術系設定
  if (role.includes('技術') || role.includes('開発') || 
      role.includes('エンジニア') || role.includes('アーキテクト') ||
      role.includes('engineer') || role.includes('developer') ||
      role.includes('architect') || role.includes('technical') ||
      role.includes('研究') || role.includes('research')) {
    return { ratio: 0.55, minK: 22, maxK: 120 };
  }
  
  // 経営系 → 経営系設定
  if (role.includes('経営') || role.includes('社長') || 
      role.includes('cxo') || role.includes('役員') ||
      role.includes('executive') || role.includes('director') ||
      role.includes('ceo') || role.includes('cto') || role.includes('cfo')) {
    return { ratio: 0.25, minK: 15, maxK: 50 };
  }
  
  // リスク/セキュリティ/品質系 → やや技術寄り
  if (role.includes('リスク') || role.includes('セキュリティ') ||
      role.includes('品質') || role.includes('qa') ||
      role.includes('risk') || role.includes('security') ||
      role.includes('quality')) {
    return { ratio: 0.45, minK: 20, maxK: 100 };
  }
  
  // デフォルト → プロダクト相当
  return { ratio: 0.40, minK: 18, maxK: 80 };
}

/**
 * 現在のK値設定を取得（デバッグ用）
 */
export function getKConfigForStakeholder(stakeholder: Stakeholder): StakeholderKConfig {
  return STAKEHOLDER_K_CONFIG[stakeholder.id] 
    ?? getCustomStakeholderKConfig(stakeholder);
}

/**
 * 全ステークホルダーのK値設定を取得（デバッグ用）
 */
export function getAllKConfigs(): Record<string, StakeholderKConfig> {
  return { ...STAKEHOLDER_K_CONFIG };
}

// ========================================
// ステークホルダー別RRF重み（本番 rag-utils.ts と同一）
// ========================================

/**
 * ステークホルダー別のRRFクエリ重みを取得
 * 本番の src/lib/rag/rag-utils.ts getWeightsForStakeholder と完全に同一
 */
export function getWeightsForStakeholder(stakeholder: Stakeholder, queryCount: number): number[] {
  switch(stakeholder.id) {
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
      if (stakeholder.id.startsWith('custom_')) {
        return getCustomStakeholderWeights(stakeholder, queryCount);
      }
      // デフォルト：均等な重み
      return Array(queryCount).fill(1.0);
  }
}

/**
 * カスタムステークホルダーの重み推定
 * 本番の src/lib/rag/rag-utils.ts getCustomStakeholderWeights と完全に同一
 */
function getCustomStakeholderWeights(stakeholder: Stakeholder, queryCount: number): number[] {
  const idLower = stakeholder.id.toLowerCase();
  const roleLower = stakeholder.role.toLowerCase();
  
  // 技術系のキーワード
  if (idLower.includes('tech') || roleLower.includes('技術') ||
      idLower.includes('engineer') || roleLower.includes('エンジニア') ||
      idLower.includes('dev') || roleLower.includes('開発') ||
      idLower.includes('r-and-d') || roleLower.includes('研究')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.4 : 1.0);
  }
  
  // リスク関連 (Risk/Security/QA)
  if (idLower.includes('risk') || roleLower.includes('リスク') ||
      idLower.includes('security') || roleLower.includes('セキュリティ') ||
      idLower.includes('qa') || roleLower.includes('品質')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.4 : 1.0);
  }

  // ビジネス関連 (Business)
  if (idLower.includes('business') || roleLower.includes('経営') || 
      idLower.includes('exec') || roleLower.includes('営業')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx < 2 ? 1.2 : 0.9);
  }
  
  // デフォルト：均等
  return Array(queryCount).fill(1.0);
}

// ========================================
// Non-Adaptive ベースライン用
// ========================================

/** Non-Adaptive ベースラインの固定比率 r_base */
export const NON_ADAPTIVE_BASE_RATIO = 0.40;
export const NON_ADAPTIVE_MIN_K = 15;
export const NON_ADAPTIVE_MAX_K = 120;

/**
 * Non-Adaptive ベースラインのK値を計算
 * 固定比率 r_base=0.40 を使用（ステークホルダーに依存しない）
 * K = min(K_max, max(K_min, ceil(N × r_base)))
 */
export function getNonAdaptiveK(totalChunks: number): number {
  const targetK = Math.ceil(totalChunks * NON_ADAPTIVE_BASE_RATIO);
  return Math.min(NON_ADAPTIVE_MAX_K, Math.max(NON_ADAPTIVE_MIN_K, targetK));
}

/**
 * Non-Adaptive ベースライン用の汎用クエリを生成
 * ステークホルダーの concerns を使わず、安全関連の一般的なクエリを返す
 */
export function generateGenericQueries(): string[] {
  return [
    '安全 リスク ハザード 課題 対策',
    '安全性 品質 検証 テスト 評価',
    '設計 アーキテクチャ 構成 要件',
    'コスト スケジュール 進捗 計画',
    '問題 課題 対応 改善',
    'safety risk hazard quality verification',
  ];
}