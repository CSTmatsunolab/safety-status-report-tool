// src/lib/risk-relevance.ts
// リスクの、ステークホルダに対する関連度（必須/関連/参考）をルールで算出する
// - リスクヒートマップの軸（影響度×発生確率）は読者によらない客観評価のため変えず、関連度はチップの表示で重ねる
// - GSNノードの関連度（カテゴリー×論証レイヤー）と同じ3段階・同じカテゴリーを使う。リスクには論証レイヤーが無いため、
//   2つ目の観点として「リスクの中心カテゴリー（primaryCategory）が一致するか」を使う
// - 「ハザード・リスクと対策」はすべてのリスクに当てはまり読者を区別しないため、リスクの一致判定には使わない

import type { RiskHeatmapItem } from './risk-heatmap';
import {
  GsnCategoryId,
  GsnRelevance,
  StakeholderProfile,
  gsnCategoryLabel,
} from './gsn-categories';

// リスクの関連度の判定に使わないカテゴリー
const NON_DISCRIMINATING_CATEGORY: GsnCategoryId = 'hazard-risk';

export interface RiskRelevanceResult {
  relevance: GsnRelevance;
  matchedCategories: GsnCategoryId[];
  primaryMatched: boolean;
  // 根拠（例: 「中心カテゴリー一致: 事業・製品への影響」）
  reason: string;
}

/**
 * 読者が必要とするカテゴリーのうち、リスクの関連度の判定に使うもの
 */
export function riskWantedCategories(profile: StakeholderProfile): GsnCategoryId[] {
  return profile.categories.filter((c) => c !== NON_DISCRIMINATING_CATEGORY);
}

/**
 * リスクの関連度
 * - 必須: リスクの中心カテゴリーが、読者が必要とするカテゴリーに一致
 * - 関連: 中心以外のカテゴリーだけが一致
 * - 参考: 一致なし（カテゴリー未付与を含む）
 * - 読者が「ハザード・リスクと対策」以外を必要としない場合は、全リスクを関連とする（区別できないため）
 * - 発生確率・影響度・対策状況は使わない（軸・初期選択で別に扱うため）
 */
export function riskRelevance(
  risk: Pick<RiskHeatmapItem, 'categories' | 'primaryCategory'>,
  profile: StakeholderProfile,
  language: 'ja' | 'en'
): RiskRelevanceResult {
  const ja = language === 'ja';
  const wanted = new Set<string>(riskWantedCategories(profile));
  if (wanted.size === 0) {
    return {
      relevance: 'related',
      matchedCategories: [],
      primaryMatched: false,
      reason: ja ? '読者の必要カテゴリーがハザード・リスクのみ' : 'Reader needs hazards/risks only',
    };
  }

  const matchedCategories = (risk.categories ?? []).filter((c): c is GsnCategoryId => wanted.has(c));
  const primaryMatched = !!risk.primaryCategory && wanted.has(risk.primaryCategory);
  const relevance: GsnRelevance = primaryMatched ? 'required' : matchedCategories.length > 0 ? 'related' : 'reference';

  const labels = (ids: string[]) => ids.map((c) => gsnCategoryLabel(c, language)).join(ja ? '、' : ', ');
  const others = matchedCategories.filter((c) => c !== risk.primaryCategory);
  const parts: string[] = [];
  if (primaryMatched) parts.push(`${ja ? '中心カテゴリー一致: ' : 'Primary category match: '}${labels([risk.primaryCategory!])}`);
  if (others.length > 0) parts.push(`${ja ? 'カテゴリー一致: ' : 'Category match: '}${labels(others)}`);
  const reason = parts.length > 0 ? parts.join(ja ? '／' : ' / ') : ja ? '一致なし' : 'No match';

  return { relevance, matchedCategories, primaryMatched, reason };
}

/**
 * リスクにカテゴリーが付与されているか（旧データ・抽出失敗時は関連度を出さない）
 */
export function hasRiskCategories(risks: Pick<RiskHeatmapItem, 'categories'>[]): boolean {
  return risks.some((r) => (r.categories?.length ?? 0) > 0);
}
