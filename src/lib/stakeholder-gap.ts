// src/lib/stakeholder-gap.ts
// ステークホルダ間ギャップ行列: 同じ文書から作った複数のレポートを並べ、
// GSNノード・リスクごとに「どの読者に、どの深さで伝わっているか」を比較する
// - 行 = 全レポートのヒートマップブロックを統合したGSNノード・リスク（ID単位）
// - 列 = レポート（ステークホルダ）
// - セル = そのレポートでの記載の深さ（詳述／言及のみ／なし）＋その読者への関連度（必須／関連／参考）
// 記載の深さは各レポートのブロックの値を使わず、統合した項目を各レポートの本文に当て直して判定する
// （あるレポートのブロックに無い項目でも、本文で触れていれば「言及あり」と数えるため）

import {
  GsnHeatmapItem,
  GSN_STATUS_LABELS,
  extractGsnHeatmapBlocks,
  isGsnNodeMentioned,
  mergeGsnNodes,
} from './gsn-heatmap';
import {
  ReportCoverage,
  RiskHeatmapItem,
  extractHeatmapBlocks,
  getReportBody,
  getReportHeadings,
  isRiskMentioned,
  mergeRisks,
  reportCoverage,
  riskScore,
} from './risk-heatmap';
import { GsnRelevance, StakeholderProfile, gsnRelevance, toStakeholderProfile } from './gsn-categories';
import { hasRiskCategories, riskRelevance } from './risk-relevance';
import { mitigationState } from './safety-verdict';

// 比較できるレポート数（列が多すぎると表が読めなくなる）
export const MIN_COMPARE_REPORTS = 2;
export const MAX_COMPARE_REPORTS = 6;

export interface GapReportInput {
  reportId: string;
  // 列見出し（ステークホルダ名など）
  label: string;
  content: string;
  createdAt?: string;
  // 入力ファイル名（全レポートで一致するか＝比較の前提が揃っているかの確認に使う）
  fileNames?: string[];
}

export interface GapColumn {
  reportId: string;
  label: string;
  createdAt?: string;
  gsnProfile: StakeholderProfile | null;
  riskProfile: StakeholderProfile | null;
}

export type GapItemKind = 'gsn' | 'risk';

export interface GapCell {
  coverage: ReportCoverage;
  // 読者の要求が保存されていない旧データは null
  relevance: GsnRelevance | null;
  reason?: string;
}

// missed = 読者に必須なのにそのレポートで触れていない
// silent = 未解決なのにどのレポートでも触れていない
// asymmetric = あるレポートでは詳述、別のレポートでは触れていない
// depth = 上記以外で記載の深さがレポートによって違う（詳述 vs 言及のみ、言及のみ vs なし）
export type GapFlag = 'missed' | 'silent' | 'asymmetric' | 'depth';

export interface GapRow {
  kind: GapItemKind;
  id: string;
  text?: string;
  // 達成状況（GSN）またはスコアと対策状況（リスク）の表示
  statusText: string;
  // 未解決: GSNは達成以外（記載なしを除く）、リスクはスコア8以上で対策未完了（総合判定の「黄」以上と同じ基準）
  unresolved: boolean;
  cells: GapCell[];
  flags: GapFlag[];
}

export interface GapPair {
  // from の読者には詳述されているが、to の読者には触れられていない項目
  ids: string[];
  unresolvedIds: string[];
  // それ以外で from の方が深く書かれている項目（詳述 vs 言及のみ、言及のみ vs なし）
  shallowerIds: string[];
}

export interface GapMatrix {
  columns: GapColumn[];
  rows: GapRow[];
  // pairs[from][to]（from === to は空）
  pairs: GapPair[][];
  // 全レポートの入力ファイルが一致するか（ファイル名が不明なレポートは判定から除く）
  sameInputs: boolean;
}

export const GAP_FLAG_LABELS: Record<'ja' | 'en', Record<GapFlag, string>> = {
  ja: { missed: '必須なのに未記載', silent: '誰にも未記載', asymmetric: '伝達の偏り', depth: '深さの差' },
  en: { missed: 'Required but missing', silent: 'Missing everywhere', asymmetric: 'Uneven coverage', depth: 'Depth differs' },
};

// 未解決とするリスクスコア（総合判定の「黄」と同じ）
const UNRESOLVED_RISK_SCORE = 8;

function isUnresolvedNode(node: GsnHeatmapItem): boolean {
  return node.status !== null && node.status !== 'achieved';
}

function isUnresolvedRisk(risk: RiskHeatmapItem): boolean {
  if (risk.likelihood === null || risk.impact === null) return false;
  return riskScore(risk.likelihood, risk.impact) >= UNRESOLVED_RISK_SCORE && mitigationState(risk.status) !== 'done';
}

function gsnStatusText(node: GsnHeatmapItem, lang: 'ja' | 'en'): string {
  if (node.status) return GSN_STATUS_LABELS[lang][node.status];
  return node.rawStatus ?? (lang === 'ja' ? '記載なし' : 'Not documented');
}

function riskStatusText(risk: RiskHeatmapItem, lang: 'ja' | 'en'): string {
  const score =
    risk.likelihood !== null && risk.impact !== null
      ? `${lang === 'ja' ? 'スコア' : 'Score'} ${riskScore(risk.likelihood, risk.impact)}`
      : null;
  return [score, risk.status].filter(Boolean).join(' / ') || (lang === 'ja' ? '記載なし' : 'Not documented');
}

function rowFlags(cells: GapCell[], unresolved: boolean): GapFlag[] {
  const flags: GapFlag[] = [];
  if (cells.some((c) => c.relevance === 'required' && c.coverage === 'none')) flags.push('missed');
  if (unresolved && cells.every((c) => c.coverage === 'none')) flags.push('silent');
  if (cells.some((c) => c.coverage === 'detailed') && cells.some((c) => c.coverage === 'none')) flags.push('asymmetric');
  else if (new Set(cells.map((c) => c.coverage)).size > 1) flags.push('depth');
  return flags;
}

const COVERAGE_RANK: Record<ReportCoverage, number> = { none: 0, mentioned: 1, detailed: 2 };

// 並び順: 未解決を先に、その中はギャップの重い順（必須なのに未記載 > 誰にも未記載 > 偏り）
const FLAG_WEIGHT: Record<GapFlag, number> = { missed: 8, silent: 4, asymmetric: 2, depth: 1 };
function rowPriority(row: GapRow): number {
  return (row.unresolved ? 100 : 0) + row.flags.reduce((sum, f) => sum + FLAG_WEIGHT[f], 0);
}

function sameFileSets(reports: GapReportInput[]): boolean {
  const keys = reports
    .filter((r) => r.fileNames && r.fileNames.length > 0)
    .map((r) => [...new Set(r.fileNames)].sort().join('\n'));
  return keys.every((k) => k === keys[0]);
}

/**
 * 複数レポートからステークホルダ間ギャップ行列を作る
 */
export function buildGapMatrix(reports: GapReportInput[], lang: 'ja' | 'en'): GapMatrix {
  const parsed = reports.map((report) => {
    const gsnBlocks = extractGsnHeatmapBlocks(report.content);
    const riskBlocks = extractHeatmapBlocks(report.content);
    const gsnProfileBlock = gsnBlocks.find(
      (b) => (b.stakeholderCategories?.length ?? 0) > 0 || (b.stakeholderLayers?.length ?? 0) > 0
    );
    const riskCategories = riskBlocks.find((b) => (b.stakeholderCategories?.length ?? 0) > 0)?.stakeholderCategories;
    const body = getReportBody(report.content);
    return {
      gsnBlocks,
      riskBlocks,
      gsnProfile: gsnProfileBlock
        ? toStakeholderProfile(gsnProfileBlock.stakeholderCategories, gsnProfileBlock.stakeholderLayers)
        : null,
      riskCategories,
      body,
      headings: getReportHeadings(body),
    };
  });

  const nodes = mergeGsnNodes(parsed.flatMap((p) => p.gsnBlocks));
  const risks = mergeRisks(parsed.flatMap((p) => p.riskBlocks));
  // リスクの関連度はカテゴリーが付与されている場合のみ（旧データは出さない）
  const riskRelevanceAvailable = hasRiskCategories(risks);

  const columns: GapColumn[] = reports.map((report, i) => ({
    reportId: report.reportId,
    label: report.label,
    createdAt: report.createdAt,
    gsnProfile: parsed[i].gsnProfile,
    riskProfile: riskRelevanceAvailable ? toStakeholderProfile(parsed[i].riskCategories, []) : null,
  }));

  const gsnRows: GapRow[] = nodes.map((node) => {
    const cells = parsed.map((p, i): GapCell => {
      const coverage = reportCoverage((text) => isGsnNodeMentioned(node, text), p.body, p.headings);
      const profile = columns[i].gsnProfile;
      if (!profile) return { coverage, relevance: null };
      const r = gsnRelevance(node, profile, lang);
      return { coverage, relevance: r.relevance, reason: r.reason };
    });
    const unresolved = isUnresolvedNode(node);
    return {
      kind: 'gsn',
      id: node.id,
      text: node.text,
      statusText: gsnStatusText(node, lang),
      unresolved,
      cells,
      flags: rowFlags(cells, unresolved),
    };
  });

  const riskRows: GapRow[] = risks.map((risk) => {
    const cells = parsed.map((p, i): GapCell => {
      const coverage = reportCoverage((text) => isRiskMentioned(risk, text), p.body, p.headings);
      const profile = columns[i].riskProfile;
      if (!profile) return { coverage, relevance: null };
      const r = riskRelevance(risk, profile, lang);
      return { coverage, relevance: r.relevance, reason: r.reason };
    });
    const unresolved = isUnresolvedRisk(risk);
    return {
      kind: 'risk',
      id: risk.id,
      text: risk.name,
      statusText: riskStatusText(risk, lang),
      unresolved,
      cells,
      flags: rowFlags(cells, unresolved),
    };
  });

  // 同順位は元の順（GSN → リスク、文書の順）を保つ
  const rows = [...gsnRows, ...riskRows]
    .map((row, index) => ({ row, index, priority: rowPriority(row) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map(({ row }) => row);

  const pairs: GapPair[][] = columns.map((_, from) =>
    columns.map((__, to) => {
      if (from === to) return { ids: [], unresolvedIds: [], shallowerIds: [] };
      const gapRows = rows.filter((r) => r.cells[from].coverage === 'detailed' && r.cells[to].coverage === 'none');
      const shallowerRows = rows.filter(
        (r) =>
          COVERAGE_RANK[r.cells[from].coverage] > COVERAGE_RANK[r.cells[to].coverage] && !gapRows.includes(r)
      );
      return {
        ids: gapRows.map((r) => r.id),
        unresolvedIds: gapRows.filter((r) => r.unresolved).map((r) => r.id),
        shallowerIds: shallowerRows.map((r) => r.id),
      };
    })
  );

  return { columns, rows, pairs, sameInputs: sameFileSets(reports) };
}

export interface GapColumnSummary {
  // 読者に必須の項目の数と、そのうち詳述／言及のみ／なしの数
  required: number;
  requiredByCoverage: Record<ReportCoverage, number>;
  // 未解決の項目の数と、そのうちこのレポートで触れているものの数
  unresolved: number;
  unresolvedCovered: number;
}

/**
 * 列（レポート）ごとの伝達状況の要約
 */
export function summarizeGapColumn(matrix: GapMatrix, columnIndex: number): GapColumnSummary {
  const summary: GapColumnSummary = {
    required: 0,
    requiredByCoverage: { detailed: 0, mentioned: 0, none: 0 },
    unresolved: 0,
    unresolvedCovered: 0,
  };
  for (const row of matrix.rows) {
    const cell = row.cells[columnIndex];
    if (cell.relevance === 'required') {
      summary.required++;
      summary.requiredByCoverage[cell.coverage]++;
    }
    if (row.unresolved) {
      summary.unresolved++;
      if (cell.coverage !== 'none') summary.unresolvedCovered++;
    }
  }
  return summary;
}
