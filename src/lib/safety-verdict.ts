// src/lib/safety-verdict.ts
// 総合判定（安全性ステータス判定）を、生成前に抽出したGSNノード・リスクからルールで算出する
// - 同じ文書から作るレポートは、ステークホルダが違っても同じ判定になる（LLMに判定させない）
// - LLMには判定と該当事項を渡し、読者に合わせて変えてよいのは説明の仕方だけとする

import { GSN_SEVERITY_LABELS, GSN_STATUS_LABELS, GsnHeatmapItem } from './gsn-heatmap';
import { RiskHeatmapItem, riskScore } from './risk-heatmap';

export type SafetyVerdictLevel = 'red' | 'yellow' | 'green';

export interface SafetyVerdict {
  level: SafetyVerdictLevel;
  // 判定の根拠になった事項（ID併記。判定の段階に該当するもののみ）
  reasons: string[];
}

// 赤とするリスクスコア（リスクヒートマップの「高」帯）、黄とするスコア（「中」帯以上）
const RED_RISK_SCORE = 15;
const YELLOW_RISK_SCORE = 8;
// 赤とするGSNノードの重大度（重大 = Catastrophic / Critical / ASIL D 等）
const RED_SEVERITY = 4;
// 根拠として並べる最大件数（多すぎるとLLMが要約・取捨選択してしまう）
const MAX_REASONS = 8;

export const SAFETY_VERDICT_LABELS: Record<'ja' | 'en', Record<SafetyVerdictLevel, string>> = {
  ja: { red: '赤（リリース判断保留）', yellow: '黄（条件付き許容）', green: '緑（許容）' },
  en: { red: 'Red (release decision on hold)', yellow: 'Yellow (conditionally acceptable)', green: 'Green (acceptable)' },
};

export const SAFETY_VERDICT_RULES: Record<'ja' | 'en', string[]> = {
  ja: [
    '赤: 重大度が「重大」のGSNノードが未達成・未展開、トップゴールが未達成・未展開、またはスコア15以上（高）のリスクの対策が未着手・計画中',
    '黄: 赤に該当せず、達成していないGSNノード、またはスコア8以上（中以上）で対策が完了していないリスクがある',
    '緑: いずれにも該当しない',
  ],
  en: [
    'Red: a GSN node with Critical severity is not achieved/undeveloped, the top goal is not achieved/undeveloped, or a risk with score 15+ (High) has mitigation not started/only planned',
    'Yellow: not Red, but some GSN node is not achieved, or a risk with score 8+ (Medium or above) has mitigation not completed',
    'Green: none of the above',
  ],
};

type MitigationState = 'done' | 'inProgress' | 'notStarted';

/**
 * リスクの対策状況（文書記載値）を 完了／実施中／未着手 に分類する
 * - 記載なし・判別不能は未着手として扱う（安全側）
 */
export function mitigationState(status: string | undefined): MitigationState {
  const text = (status ?? '').toLowerCase();
  if (/未完了|not (?:yet )?(?:complete|done)/.test(text)) return 'inProgress';
  if (/完了|実施済|対策済|済み|クローズ|closed|done|mitigated|resolved|complete/.test(text)) return 'done';
  if (/実施中|対応中|進行中|対策中|監視中|in progress|ongoing|monitor/.test(text)) return 'inProgress';
  return 'notStarted';
}

const isUnresolved = (node: GsnHeatmapItem) => node.status === 'unachieved' || node.status === 'undeveloped';
const isTopGoal = (node: GsnHeatmapItem) => node.kind === 'goal' && node.parentIds?.length === 0;

/**
 * 総合判定を算出する（GSNノードもリスクも無ければ null = 判定しない）
 */
export function computeSafetyVerdict(
  gsnNodes: GsnHeatmapItem[] | undefined,
  risks: RiskHeatmapItem[] | undefined,
  lang: 'ja' | 'en'
): SafetyVerdict | null {
  const nodes = gsnNodes ?? [];
  const riskItems = risks ?? [];
  if (nodes.length === 0 && riskItems.length === 0) return null;

  const ja = lang === 'ja';
  const statusLabel = (node: GsnHeatmapItem) => (node.status ? GSN_STATUS_LABELS[lang][node.status] : '');
  const named = (id: string, name?: string) => (name ? (ja ? `${id}（${name}）` : `${id} (${name})`) : id);
  const nodeName = (node: GsnHeatmapItem) => named(node.id, node.text);
  const riskName = (risk: RiskHeatmapItem) => named(risk.id, risk.name);
  const riskStatus = (risk: RiskHeatmapItem) => risk.status ?? (ja ? '対策状況の記載なし' : 'mitigation status not documented');

  const red: string[] = [];
  const yellow: string[] = [];

  for (const node of nodes) {
    if (isUnresolved(node) && (node.severity ?? 0) >= RED_SEVERITY) {
      const severity = `${GSN_SEVERITY_LABELS[lang][node.severity!]}${node.rawSeverity ? ` / ${node.rawSeverity}` : ''}`;
      red.push(
        ja
          ? `${nodeName(node)}が${statusLabel(node)}（重大度: ${severity}）`
          : `${nodeName(node)} is ${statusLabel(node).toLowerCase()} (severity: ${severity})`
      );
    } else if (isUnresolved(node) && isTopGoal(node)) {
      red.push(ja ? `トップゴール${nodeName(node)}が${statusLabel(node)}` : `Top goal ${nodeName(node)} is ${statusLabel(node).toLowerCase()}`);
    } else if (node.status && node.status !== 'achieved' && node.kind !== 'strategy') {
      // Strategy は配下ノードから集約した状況のため、根拠には配下のノードを挙げる
      yellow.push(ja ? `${nodeName(node)}が${statusLabel(node)}` : `${nodeName(node)} is ${statusLabel(node).toLowerCase()}`);
    }
  }

  for (const risk of riskItems) {
    if (risk.likelihood === null || risk.impact === null) continue;
    const score = riskScore(risk.likelihood, risk.impact);
    const state = mitigationState(risk.status);
    const text = ja
      ? `${riskName(risk)}がスコア${score}で${riskStatus(risk)}`
      : `${riskName(risk)} has score ${score} and is ${riskStatus(risk)}`;
    if (score >= RED_RISK_SCORE && state === 'notStarted') red.push(text);
    else if (score >= YELLOW_RISK_SCORE && state !== 'done') yellow.push(text);
  }

  if (red.length > 0) return { level: 'red', reasons: red.slice(0, MAX_REASONS) };
  if (yellow.length > 0) return { level: 'yellow', reasons: yellow.slice(0, MAX_REASONS) };
  return { level: 'green', reasons: [] };
}
