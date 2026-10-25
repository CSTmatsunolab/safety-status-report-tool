// src/lib/stakeholder-risk-rules.ts
// ステークホルダごとに「レポートで記述すべきリスク」を初期選択するルール
// （ヒートマップ上でユーザーが追加・除外して調整する前提の既定値）

import { Stakeholder } from '@/types';
import { RiskHeatmapItem, riskScore } from '@/lib/risk-heatmap';
import { GSN_RELEVANCE_LABELS, StakeholderProfile } from '@/lib/gsn-categories';
import { hasRiskCategories, riskRelevance } from '@/lib/risk-relevance';

type RuleType = 'executive' | 'product' | 'all';

const EXECUTIVE_IDS = ['cxo', 'business'];
const PRODUCT_IDS = ['product'];
const ALL_IDS = ['architect', 'technical-fellows', 'r-and-d'];

const EXECUTIVE_KEYWORDS = ['経営', '役員', '社長', 'cxo', 'ceo', 'cto', 'executive', 'board', '事業'];
const ALL_KEYWORDS = [
  '技術', '開発', '研究', 'エンジニア', 'アーキテクト', '設計', 'リスク', '安全', '品質', 'セキュリティ', '危険',
  'tech', 'engineer', 'dev', 'research', 'architect', 'risk', 'safety', 'quality', 'security', 'qa', 'hazard',
];

function getRuleType(stakeholder: Stakeholder): RuleType {
  if (EXECUTIVE_IDS.includes(stakeholder.id)) return 'executive';
  if (PRODUCT_IDS.includes(stakeholder.id)) return 'product';
  if (ALL_IDS.includes(stakeholder.id)) return 'all';

  // カスタムステークホルダは id / role のキーワードで判定
  const text = `${stakeholder.id} ${stakeholder.role}`.toLowerCase();
  if (EXECUTIVE_KEYWORDS.some((k) => text.includes(k))) return 'executive';
  if (ALL_KEYWORDS.some((k) => text.includes(k))) return 'all';
  return 'product';
}

/**
 * 対策が完了しているか（対策状況の記載から判定。記載なしは未完了扱い）
 */
export function isMitigated(status?: string): boolean {
  if (!status) return false;
  return /完了|対策済|解決|completed|closed|resolved|mitigated/i.test(status);
}

const REASONS = {
  ja: {
    high: 'スコア15以上（高）',
    openMedium: '対策未完了・スコア8以上',
    medium: 'スコア8以上',
    open: '対策未完了',
    all: '全件（技術・品質系）',
  },
  en: {
    high: 'Score 15+ (high)',
    openMedium: 'Open, score 8+',
    medium: 'Score 8+',
    open: 'Not yet mitigated',
    all: 'All risks (technical/quality roles)',
  },
};

/**
 * ステークホルダのレポートで記述すべきリスクを選ぶ
 * 戻り値: リスクID → 選定理由
 *
 * | ルール | 対象 | 選定条件 |
 * | executive | cxo, business | スコア15以上 または（未完了 かつ 8以上） |
 * | product   | product       | スコア8以上 または 未完了 |
 * | all       | architect, technical-fellows, r-and-d | 全件（評価なしも含む） |
 */
export function selectFocusRisks(
  risks: RiskHeatmapItem[],
  stakeholder: Stakeholder,
  language: 'ja' | 'en' = 'ja'
): Map<string, string> {
  const reasons = REASONS[language];
  const ruleType = getRuleType(stakeholder);
  const selected = new Map<string, string>();

  for (const risk of risks) {
    if (ruleType === 'all') {
      selected.set(risk.id, reasons.all);
      continue;
    }

    const open = !isMitigated(risk.status);
    const score =
      risk.likelihood !== null && risk.impact !== null ? riskScore(risk.likelihood, risk.impact) : null;

    if (ruleType === 'executive') {
      if (score !== null && score >= 15) selected.set(risk.id, reasons.high);
      else if (open && score !== null && score >= 8) selected.set(risk.id, reasons.openMedium);
    } else {
      if (score !== null && score >= 8) selected.set(risk.id, reasons.medium);
      else if (open) selected.set(risk.id, reasons.open);
    }
  }

  return selected;
}

const RELEVANCE_REASONS = {
  ja: { openMedium: '対策未完了・スコア8以上', openHigh: '対策未完了・スコア15以上（高）' },
  en: { openMedium: 'open, score 8+', openHigh: 'open, score 15+ (high)' },
};

/**
 * 読者への関連度に基づいて、レポートで記述すべきリスクを選ぶ
 * - 必須: 全件
 * - 関連: 対策未完了かつスコア8以上
 * - 参考: 対策未完了かつスコア15以上（高）。読者の関心外でも、高リスクの未対策は全読者に示す
 * - 読者の要求が無い、またはリスクにカテゴリーが無い（旧データ・抽出失敗）場合は selectFocusRisks に戻す
 * 戻り値: リスクID → 選定理由（「必須（中心カテゴリー一致: …）」）
 */
export function selectFocusRisksByRelevance(
  risks: RiskHeatmapItem[],
  stakeholder: Stakeholder,
  profile: StakeholderProfile | null,
  language: 'ja' | 'en' = 'ja'
): Map<string, string> {
  if (!profile || !hasRiskCategories(risks)) return selectFocusRisks(risks, stakeholder, language);

  const labels = GSN_RELEVANCE_LABELS[language];
  const reasons = RELEVANCE_REASONS[language];
  const selected = new Map<string, string>();
  for (const risk of risks) {
    const r = riskRelevance(risk, profile, language);
    const open = !isMitigated(risk.status);
    const score =
      risk.likelihood !== null && risk.impact !== null ? riskScore(risk.likelihood, risk.impact) : null;
    const base = `${labels[r.relevance]}（${r.reason}）`;
    if (r.relevance === 'required') selected.set(risk.id, base);
    else if (r.relevance === 'related' && open && score !== null && score >= 8)
      selected.set(risk.id, `${base}・${reasons.openMedium}`);
    else if (open && score !== null && score >= 15) selected.set(risk.id, `${base}・${reasons.openHigh}`);
  }
  return selected;
}
