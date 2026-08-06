// src/lib/gsn/serialize.ts
// 編集済みのGSNノード集合を、parser.tsが確実に再パースできる正規Markdownテーブルへ
// シリアライズする。severity / ASIL / open issue / 検証失敗は専用列を持たないため
// 「内容」セルへブラケット付きタグとして埋め込み、detectSeverity等のキーワード走査で
// 再パース時に復元できるようにしている（parser.ts側は変更しない）。
//
// ⚠️ ここで生成する見出し語（ノードID/種別/内容/達成状況/親ノード/根拠）は
// parser.ts の parseTableRows の列判定ロジックと衝突しないことを確認済み。
// 変更する場合は必ず parseTableRows の列判定条件と整合させること。

import { GSNNode, GSNNodeStatus, GSNNodeType, RiskSeverity } from './types';
import { compareNodeIds } from './analyze';

/** シリアライズ時に空セルの代わりに埋める目印。読み込み時にこの値は空欄として扱うこと。 */
export const EMPTY_CELL_PLACEHOLDER = '-';

const STATUS_LABELS: Record<GSNNodeStatus, string> = {
  achieved: '達成',
  partial: '部分達成',
  unachieved: '未達成',
  unknown: '',
};

const SEVERITY_LABELS: Record<RiskSeverity, string | null> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: null,
};

/** テーブル行を壊す文字（`|`と改行）を除去する */
function sanitizeCell(text: string): string {
  return text.replace(/\|/g, '／').replace(/\r?\n/g, ' ').trim();
}

/**
 * parseTableRowsは `cells.filter(c => c.length > 0)` で空セルを行ごと除去してしまうため
 * （列がずれて別の列の値として誤読される）、空になり得るセルは必ず埋める。
 * "-" は「値なし」の目印として扱い、GSNStructureEditor側で読み込み時に空欄に戻す。
 */
function nonEmptyCell(text: string): string {
  return text.length > 0 ? text : EMPTY_CELL_PLACEHOLDER;
}

function buildContentCell(node: GSNNode): string {
  const tags: string[] = [];
  const severityLabel = SEVERITY_LABELS[node.severity];
  if (severityLabel) tags.push(`[Severity:${severityLabel}]`);
  if (node.asilLevel) tags.push(`[${node.asilLevel}]`);
  if (node.isOpenIssue) tags.push('[未解決]');
  if (node.hasFailedVerification) tags.push('[検証失敗]');

  const description = sanitizeCell(node.description);
  return tags.length > 0 ? `${description} ${tags.join('')}`.trim() : description;
}

/** 編集済みノード集合から、parser.tsが再パースできる正規Markdownテーブルを生成する */
export function serializeGSNToMarkdown(nodes: GSNNode[]): string {
  const header = '| ノードID | 種別 | 内容 | 達成状況 | 親ノード | 根拠 |';
  const separator = '|---|---|---|---|---|---|';

  const rows = [...nodes]
    .sort((a, b) => compareNodeIds(a.id, b.id))
    .map(node => {
      const cells = [
        nonEmptyCell(sanitizeCell(node.id)),
        nonEmptyCell(sanitizeCell(node.type)),
        nonEmptyCell(buildContentCell(node)),
        nonEmptyCell(STATUS_LABELS[node.status]),
        nonEmptyCell(node.parentIds.map(sanitizeCell).join(', ')),
        nonEmptyCell(sanitizeCell(node.evidenceRefs[0] || '')),
      ];
      return `| ${cells.join(' | ')} |`;
    });

  return [header, separator, ...rows].join('\n');
}

const SIMPLE_ID_PREFIX: Partial<Record<GSNNodeType, string>> = {
  Goal: 'G',
  Strategy: 'S',
  Context: 'C',
  Assumption: 'A',
  Solution: 'Sn',
  Evidence: 'E',
  Justification: 'J',
  Undeveloped: 'U',
};

/**
 * 新規ノード追加時のID候補を提案する。
 * SubGoal（`G1.1`のようなドット付きID）は親ノードに依存するため、
 * ここでは提案せず呼び出し側（エディタUI）で親ノード選択後に組み立てる。
 */
export function suggestNextNodeId(existingNodes: GSNNode[], type: GSNNodeType): string {
  const prefix = SIMPLE_ID_PREFIX[type];
  if (!prefix) return '';

  const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i');
  let max = -1;
  for (const node of existingNodes) {
    const m = node.id.match(pattern);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}
