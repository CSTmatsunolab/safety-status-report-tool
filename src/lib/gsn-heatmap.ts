// src/lib/gsn-heatmap.ts
// GSNノードヒートマップ（GSNの深さ × 必要情報カテゴリー、色＝達成状況）用の共通ロジック
// LLMがレポート中に出力する ```gsn-heatmap フェンスブロック（JSON）と、生成前の抽出結果を扱う

import {
  ReportCoverage,
  RiskBand,
  RiskHeatmapItem,
  coverageText,
  detectLanguage,
  extractHeatmapBlocks,
  markReportMentions,
  mergeRisks,
  escapeRegExp,
  escapeTableCell,
  getReportBody,
  getReportHeadings,
  heatmapExportRegex,
  replaceHeatmapBlocksWithTable,
  reportCoverage,
} from './risk-heatmap';
import {
  GSN_RELEVANCES,
  GSN_RELEVANCE_LABELS,
  GsnRelevance,
  StakeholderProfile,
  gsnCategoryLabel,
  gsnLayerLabel,
  gsnNodeLayer,
  gsnRelevance,
  normalizeCategoryIds,
  normalizeLayerIds,
  toStakeholderProfile,
} from './gsn-categories';

export type GsnSeverity = 1 | 2 | 3 | 4;
export type GsnStatus = 'achieved' | 'partial' | 'unachieved' | 'undeveloped';
export type GsnNodeKind = 'goal' | 'strategy' | 'solution' | 'other';

export interface GsnHeatmapItem {
  id: string;
  // 文書記載の種別（Goal / Sub-Goal / Strategy / Solution 等）
  type?: string;
  kind: GsnNodeKind;
  text?: string;
  status: GsnStatus | null;
  severity: GsnSeverity | null;
  // 文書に記載されていた元の値（表示用）
  rawStatus?: string;
  rawSeverity?: string;
  // 重大度の出典（例: "H-101, H-103 (Serious)"）
  severitySource?: string;
  // 親ノードのID（[] = トップゴール、undefined = 記載なし）。深さの計算に使う
  parentIds?: string[];
  // 該当する必要情報カテゴリーのID（src/lib/gsn-categories.ts の GSN_INFO_CATEGORIES）
  categories?: string[];
  // Strategy の達成状況を配下ノードから集約したか（文書記載値は rawStatus に残る）
  statusAggregated?: boolean;
  // このレポートの本文で言及されているか（markGsnReportMentions で判定。未判定は undefined）
  inReport?: boolean;
  // 本文での扱いの深さ（詳述／言及のみ／なし）。未判定は undefined
  coverage?: ReportCoverage;
}

export interface GsnHeatmapData {
  title?: string;
  // レポート対象のステークホルダの要求（関連度の算出に使う）: 必要とするカテゴリーのID・重視する論証レイヤー
  stakeholderCategories?: string[];
  stakeholderLayers?: string[];
  nodes: GsnHeatmapItem[];
}

export const GSN_HEATMAP_LANG = 'gsn-heatmap';
export const GSN_STATUSES: GsnStatus[] = ['achieved', 'partial', 'unachieved', 'undeveloped'];

const GSN_HEATMAP_BLOCK_REGEX = /```gsn-heatmap[^\n]*\n([\s\S]*?)```/g;

// 判定順が重要（「部分達成」は「達成」を含む、「未達成」も同様）
const STATUS_PATTERNS: [GsnStatus, RegExp][] = [
  ['undeveloped', /未展開|未着手|未開発|undeveloped|to be developed|\btbd\b/],
  ['partial', /部分|一部|進行中|対策中|検証中|実施中|partial|in progress/],
  ['unachieved', /未達|未完了|未実施|無効|不十分|不足|insufficient|not achieved|unachieved|not supported|unsupported|not satisfied|invalid|failed/],
  ['achieved', /達成|完了|有効|充足|十分|sufficient|achieved|supported|satisfied|complete|valid|done/],
];

/**
 * 文書記載の達成状況を正規化する（括弧内の補足は無視）
 * - 記載なし・判別不能は null
 */
export function normalizeGsnStatus(value: unknown): GsnStatus | null {
  if (typeof value !== 'string') return null;
  const text = value.split(/[（(]/)[0].trim().toLowerCase();
  if (!text) return null;
  for (const [status, pattern] of STATUS_PATTERNS) {
    if (pattern.test(text)) return status;
  }
  return null;
}

const SEVERITY_WORDS: Record<string, GsnSeverity> = {
  '重大': 4,
  '致命的': 4,
  '極高': 4,
  '非常に高い': 4,
  'critical': 4,
  'catastrophic': 4,
  'very high': 4,
  'very-high': 4,
  '高': 3,
  '高い': 3,
  '大': 3,
  'high': 3,
  'serious': 3,
  'major': 3,
  '中': 2,
  '中程度': 2,
  'medium': 2,
  'moderate': 2,
  'marginal': 2,
  '低': 1,
  '低い': 1,
  '小': 1,
  '軽微': 1,
  'low': 1,
  'minor': 1,
  'negligible': 1,
};

/**
 * 文書記載の重大度を 1〜4（低/中/高/重大）に正規化する
 * - Critical/Catastrophic/重大/ASIL D/S3 → 4, High/Serious/高/ASIL C/S2 → 3,
 *   Medium/Marginal/中/ASIL B/S1 → 2, Low/Minor/Negligible/低/ASIL A/QM/S0 → 1
 * - 1〜4 の数値（文字列含む）はそのまま
 * - それ以外（記載なし・不明）は null
 */
export function normalizeGsnSeverity(value: unknown): GsnSeverity | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 4 ? (value as GsnSeverity) : null;
  }
  if (typeof value !== 'string') return null;

  const text = value.split(/[（(]/)[0].trim().toLowerCase();
  if (!text) return null;

  if (/^[1-4]$/.test(text)) return Number(text) as GsnSeverity;

  const asil = text.match(/^asil\s*-?\s*([a-d])$/);
  if (asil) return ({ a: 1, b: 2, c: 3, d: 4 } as const)[asil[1] as 'a' | 'b' | 'c' | 'd'];
  if (text === 'qm') return 1;

  const sClass = text.match(/^s([0-3])$/);
  if (sClass) return (Number(sClass[1]) + 1) as GsnSeverity;

  return SEVERITY_WORDS[text] ?? null;
}

/**
 * ノード種別を正規化する（種別の記載が無ければIDの接頭辞から判定）
 */
export function gsnNodeKind(type: string | undefined, id: string): GsnNodeKind {
  const t = (type ?? '').toLowerCase();
  if (/solution|evidence|証拠|ソリューション/.test(t)) return 'solution';
  if (/strategy|戦略/.test(t)) return 'strategy';
  if (/goal|ゴール/.test(t)) return 'goal';
  if (t) return 'other';
  if (/^(sn|e)\d/i.test(id)) return 'solution';
  if (/^s\d/i.test(id)) return 'strategy';
  if (/^g\d/i.test(id)) return 'goal';
  return 'other';
}

/**
 * 親ノードIDを読む（配列、または "S1, G2" のような区切り文字列を許容）
 * - [] はトップゴール、null/未記載は undefined（深さ不明）
 */
function toIdList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,、，\s]+/).map((v) => v.trim()).filter(Boolean);
  }
  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

/**
 * gsn-heatmap ブロック（または抽出API結果）のJSON文字列をパースする
 * ストリーミング途中などで不完全なJSONの場合は null を返す
 */
export function parseGsnHeatmapBlock(json: string): GsnHeatmapData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  // 配列のみが出力された場合も許容する
  const root = Array.isArray(parsed) ? { nodes: parsed } : parsed;
  if (!root || typeof root !== 'object') return null;

  const { title, nodes, stakeholderCategories, stakeholderLayers } = root as {
    title?: unknown;
    nodes?: unknown;
    stakeholderCategories?: unknown;
    stakeholderLayers?: unknown;
  };
  if (!Array.isArray(nodes)) return null;

  const items: GsnHeatmapItem[] = [];
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const id = toOptionalString(n.id) ?? `#${index + 1}`;
    const type = toOptionalString(n.type);
    items.push({
      id,
      type,
      kind: gsnNodeKind(type, id),
      text: toOptionalString(n.text ?? n.description ?? n.name),
      status: normalizeGsnStatus(toOptionalString(n.status)),
      severity: normalizeGsnSeverity(n.severity),
      rawStatus: toOptionalString(n.status),
      rawSeverity: toOptionalString(n.severity),
      severitySource: toOptionalString(n.severitySource),
      parentIds: toIdList(n.parentIds ?? n.parents ?? n.parent),
      categories: normalizeCategoryIds(n.categories),
    });
  });

  return {
    title: toOptionalString(title),
    stakeholderCategories: normalizeCategoryIds(stakeholderCategories),
    stakeholderLayers: normalizeLayerIds(stakeholderLayers),
    nodes: aggregateStrategyStatuses(items),
  };
}

/**
 * Strategy の達成状況を配下ノードの最悪の状況に揃える
 * - 文書の Strategy の状況は「論証方針として有効か」で、配下ゴールの達成状況とは別の概念のため、
 *   そのままだと「S1=達成（緑）なのに配下の G1.2 は部分達成（黄）」のように見えてしまう
 * - 自身の記載値と子ノード（子が Strategy なら再帰的に集約した値）のうち最悪のものを使う
 * - 記載値より悪化した場合のみ statusAggregated を立てる（文書記載値は rawStatus に残る）
 */
export function aggregateStrategyStatuses(nodes: GsnHeatmapItem[]): GsnHeatmapItem[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, GsnHeatmapItem[]>();
  for (const node of nodes) {
    for (const parentId of node.parentIds ?? []) {
      if (!byId.has(parentId)) continue;
      children.set(parentId, [...(children.get(parentId) ?? []), node]);
    }
  }

  const memo = new Map<string, GsnStatus | null>();
  const visiting = new Set<string>();
  const effective = (node: GsnHeatmapItem): GsnStatus | null => {
    if (node.kind !== 'strategy') return node.status;
    if (memo.has(node.id)) return memo.get(node.id)!;
    if (visiting.has(node.id)) return node.status;
    visiting.add(node.id);
    let worst = node.status;
    for (const child of children.get(node.id) ?? []) {
      const status = effective(child);
      if (gsnStatusRank(status) > gsnStatusRank(worst)) worst = status;
    }
    visiting.delete(node.id);
    memo.set(node.id, worst);
    return worst;
  };

  return nodes.map((node) => {
    const status = effective(node);
    return status === node.status ? node : { ...node, status, statusAggregated: true };
  });
}

/**
 * Markdown中のすべての gsn-heatmap ブロックを抽出・パースする
 */
export function extractGsnHeatmapBlocks(markdown: string): GsnHeatmapData[] {
  const results: GsnHeatmapData[] = [];
  for (const match of markdown.matchAll(GSN_HEATMAP_BLOCK_REGEX)) {
    const data = parseGsnHeatmapBlock(match[1]);
    if (data) results.push(data);
  }
  return results;
}

// 「G1〜G1.5」「Sn1～Sn5」のような記号の範囲表記（読み方の説明であってノードへの言及ではない）
const GSN_ID_RANGE_REGEX = /[A-Za-z]+\d+(?:\.\d+)*\s*[〜～~–]\s*[A-Za-z]+\d+(?:\.\d+)*/g;
// ノードの記載文そのものの出現で言及ありとみなす最小文字数（短い語の偶然の一致を避ける）
const MIN_NODE_TEXT_MATCH = 6;

/**
 * ノードがレポート本文で言及されているかを判定する
 * - G1 と G1.1、S1 と Sn1 は区別する
 * - 範囲表記（G1〜G1.5 等）は言及に数えない
 * - IDが無くても、ノードの記載文（例: 「検証結果サマリー」）がそのまま出現すれば言及あり
 * - body は getReportBody で読み方ガイド・用語集を除いたものを渡す
 */
export function isGsnNodeMentioned(item: GsnHeatmapItem, body: string): boolean {
  const text = item.text?.trim();
  if (text && text.length >= MIN_NODE_TEXT_MATCH && body.includes(text)) return true;
  if (item.id.startsWith('#')) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9.])${escapeRegExp(item.id)}(?![0-9A-Za-z]|\\.\\d)`);
  return pattern.test(body.replace(GSN_ID_RANGE_REGEX, ''));
}

/**
 * 各ノードに「このレポートに記載されているか」(inReport) を付与する
 */
export function markGsnReportMentions(nodes: GsnHeatmapItem[], markdown: string): GsnHeatmapItem[] {
  const body = getReportBody(markdown);
  const headings = getReportHeadings(body);
  return nodes.map((item) => {
    const coverage = reportCoverage((text) => isGsnNodeMentioned(item, text), body, headings);
    return { ...item, inReport: coverage !== 'none', coverage };
  });
}

function isRated(item: GsnHeatmapItem): boolean {
  return item.status !== null && item.severity !== null;
}

/**
 * 複数ブロックのノードをID単位で統合する（後勝ち。ただし評価ありを評価なしで上書きしない）
 */
export function mergeGsnNodes(datas: GsnHeatmapData[]): GsnHeatmapItem[] {
  const merged = new Map<string, GsnHeatmapItem>();
  for (const data of datas) {
    for (const item of data.nodes) {
      const existing = merged.get(item.id);
      if (!existing || isRated(item) || !isRated(existing)) {
        merged.set(item.id, {
          ...item,
          text: item.text ?? existing?.text,
          severitySource: item.severitySource ?? existing?.severitySource,
          parentIds: item.parentIds ?? existing?.parentIds,
          categories: item.categories ?? existing?.categories,
        });
      }
    }
  }
  return Array.from(merged.values());
}

// 達成状況の深刻さ（達成1 → 未展開4）
const STATUS_RANK: Record<GsnStatus, number> = {
  achieved: 1,
  partial: 2,
  unachieved: 3,
  undeveloped: 4,
};

export function gsnStatusRank(status: GsnStatus | null): number {
  return status ? STATUS_RANK[status] : 0;
}

/**
 * セル内で最も悪い達成状況（記載なしのみなら null）
 */
export function worstStatus(nodes: GsnHeatmapItem[]): GsnStatus | null {
  let worst: GsnStatus | null = null;
  for (const node of nodes) {
    if (gsnStatusRank(node.status) > gsnStatusRank(worst)) worst = node.status;
  }
  return worst;
}

/**
 * 達成状況をセルの色の段階に変換する（未展開=赤 → 達成=緑。記載なしは undefined）
 */
export function gsnStatusBand(status: GsnStatus | null): RiskBand | undefined {
  switch (status) {
    case 'undeveloped':
      return 'high';
    case 'unachieved':
      return 'medium';
    case 'partial':
      return 'low';
    case 'achieved':
      return 'minimal';
    default:
      return undefined;
  }
}

/**
 * 親子関係からGSNの深さを求める（トップゴール=0、ツリーの段数をそのまま数える）
 * - parentIds が [] のノードを根とし、幅優先で数える（複数の親を持つ場合は最小の深さ）
 * - 親が記載されていない、または親が一覧に無く根に辿り着けないノードは null（深さ不明）
 * - 循環があっても停止する（訪問済みは再訪しない）
 */
export function computeGsnDepths(nodes: GsnHeatmapItem[]): Record<string, number | null> {
  const depths: Record<string, number | null> = Object.fromEntries(nodes.map((n) => [n.id, null]));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    for (const parentId of node.parentIds ?? []) {
      if (!(parentId in depths)) continue;
      children.set(parentId, [...(children.get(parentId) ?? []), node.id]);
    }
  }

  const queue = nodes.filter((n) => n.parentIds && n.parentIds.length === 0).map((n) => n.id);
  for (const id of queue) depths[id] = 0;
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const depth = depths[id] as number;
    for (const childId of children.get(id) ?? []) {
      if (depths[childId] !== null) continue;
      depths[childId] = depth + 1;
      queue.push(childId);
    }
  }
  return depths;
}

// 関連度と達成状況の組み合わせによるセルの優先度（リスクヒートマップの帯と同じ色）
// 必須×未達成・未展開＝高、必須×部分・関連×未達成＝中、…、達成＝極低、記載なし＝undefined
export function gsnPriorityBand(relevance: GsnRelevance, status: GsnStatus | null): RiskBand | undefined {
  if (status === null) return undefined;
  if (status === 'achieved') return 'minimal';
  const unresolved = status === 'unachieved' || status === 'undeveloped';
  if (relevance === 'required') return unresolved ? 'high' : 'medium';
  if (relevance === 'related') return unresolved ? 'medium' : 'low';
  return 'low';
}

export const GSN_STATUS_LABELS: Record<'ja' | 'en', Record<GsnStatus, string>> = {
  ja: { achieved: '達成', partial: '部分達成', unachieved: '未達成', undeveloped: '未展開' },
  en: { achieved: 'Achieved', partial: 'Partial', unachieved: 'Not achieved', undeveloped: 'Undeveloped' },
};

export const GSN_SEVERITY_LABELS: Record<'ja' | 'en', Record<GsnSeverity, string>> = {
  ja: { 1: '低', 2: '中', 3: '高', 4: '重大' },
  en: { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' },
};

function gsnHeatmapToMarkdownTable(data: GsnHeatmapData, lang: 'ja' | 'en'): string {
  const ja = lang === 'ja';
  const profile = toStakeholderProfile(data.stakeholderCategories, data.stakeholderLayers);
  // 読者の要求があれば関連度、無ければ論証レイヤーを示す
  const header = profile
    ? ja
      ? '| ノードID | 種別 | 内容 | 関連度（根拠） | 達成状況 | カテゴリー | 重大度 | 本レポートでの記載 |'
      : '| Node ID | Type | Description | Relevance (basis) | Status | Categories | Severity | Covered in this report |'
    : ja
      ? '| ノードID | 種別 | 内容 | 論証レイヤー | 達成状況 | カテゴリー | 重大度 | 本レポートでの記載 |'
      : '| Node ID | Type | Description | Argument layer | Status | Categories | Severity | Covered in this report |';
  const categoryText = (item: GsnHeatmapItem) => {
    const names = (item.categories ?? []).map((c) => gsnCategoryLabel(c, lang));
    return names.length > 0 ? escapeTableCell(names.join(ja ? '、' : ', ')) : '-';
  };
  const unrated = ja ? '記載なし' : 'Not documented';
  const cell = (text?: string) => (text ? escapeTableCell(text) : '-');

  const aggregatedNote = (item: GsnHeatmapItem) =>
    item.statusAggregated
      ? ja
        ? `（配下から集約${item.rawStatus ? `。文書記載: ${escapeTableCell(item.rawStatus)}` : ''}）`
        : ` (from child nodes${item.rawStatus ? `; documented: ${escapeTableCell(item.rawStatus)}` : ''})`
      : '';

  const entries = data.nodes.map((item) => ({
    item,
    relevance: profile ? gsnRelevance(item, profile, lang) : null,
  }));
  // 関連度の高い順、その中は達成状況の悪い順（要求が無ければ文書の順）
  if (profile) {
    entries.sort(
      (a, b) =>
        GSN_RELEVANCES.indexOf(a.relevance!.relevance) - GSN_RELEVANCES.indexOf(b.relevance!.relevance) ||
        gsnStatusRank(b.item.status) - gsnStatusRank(a.item.status)
    );
  }

  const rows = entries.map(({ item, relevance }) => {
    const status = item.status
      ? `${GSN_STATUS_LABELS[lang][item.status]}${aggregatedNote(item)}`
      : item.rawStatus
        ? escapeTableCell(item.rawStatus)
        : unrated;
    const severity = item.severity
      ? `${GSN_SEVERITY_LABELS[lang][item.severity]}${item.rawSeverity ? ` (${escapeTableCell(item.rawSeverity)})` : ''}`
      : item.rawSeverity
        ? escapeTableCell(item.rawSeverity)
        : unrated;
    const position = relevance
      ? `${GSN_RELEVANCE_LABELS[lang][relevance.relevance]}（${escapeTableCell(relevance.reason)}）`
      : gsnLayerLabel(gsnNodeLayer(item), lang);
    return `| ${escapeTableCell(item.id)} | ${cell(item.type)} | ${cell(item.text)} | ${position} | ${status} | ${categoryText(item)} | ${severity} | ${coverageText(item, lang)} |`;
  });

  const lines = [header, '|---|---|---|---|---|---|---|---|', ...rows];
  if (data.title) lines.unshift(`**${data.title}**`, '');
  lines.push('', gsnTableNote(profile, lang));
  return lines.join('\n');
}

const COVERAGE_NOTE = {
  ja: '「本レポートでの記載」は本文での扱い（詳述＝見出しで個別に取り上げた、言及のみ＝本文・表で触れた、なし）。',
  en: '"Covered in this report" shows how the node is covered in the body (Detailed = has its own heading, Mentioned = referred to in text or tables, No).',
};

function gsnTableNote(profile: StakeholderProfile | null, lang: 'ja' | 'en'): string {
  const ja = lang === 'ja';
  if (!profile) {
    return ja
      ? `※ GSNノードヒートマップ（論証レイヤー×達成状況）の内容を表形式で示したもの。${COVERAGE_NOTE.ja}`
      : `Note: The GSN node heatmap (argument layer x status) shown as a table. ${COVERAGE_NOTE.en}`;
  }
  const cats = profile.categories.map((c) => gsnCategoryLabel(c, lang)).join(ja ? '、' : ', ') || '-';
  const layers = profile.layers.map((l) => gsnLayerLabel(l, lang)).join(ja ? '、' : ', ') || '-';
  return ja
    ? `※ GSNノードヒートマップ（読者への関連度×達成状況）の内容を表形式で示したもの。関連度は、読者が必要とするカテゴリー（${cats}）と重視する論証レイヤー（${layers}）への一致から算出した。${COVERAGE_NOTE.ja}`
    : `Note: The GSN node heatmap (relevance to the reader x status) shown as a table. Relevance is computed from matches with the categories the reader needs (${cats}) and the argument layers they focus on (${layers}). ${COVERAGE_NOTE.en}`;
}

/**
 * エクスポート・印刷用に gsn-heatmap ブロックをMarkdown表へ置き換える
 * （パースできないブロックは削除する）
 */
export function replaceGsnHeatmapBlocksWithTable(markdown: string, lang?: 'ja' | 'en'): string {
  const language = lang ?? detectLanguage(markdown);
  return markdown.replace(heatmapExportRegex(GSN_HEATMAP_LANG), (_whole, json: string) => {
    const data = parseGsnHeatmapBlock(json);
    if (!data || data.nodes.length === 0) return '';
    data.nodes = markGsnReportMentions(data.nodes, markdown);
    // 直後の行が表の行として扱われないよう空行を入れる
    return `${gsnHeatmapToMarkdownTable(data, language)}\n`;
  });
}

/**
 * エクスポート・印刷用に risk-heatmap / gsn-heatmap の両ブロックを表へ置き換える
 */
export function replaceAllHeatmapBlocksWithTables(markdown: string, lang?: 'ja' | 'en'): string {
  const language = lang ?? detectLanguage(markdown);
  // 言及判定は元の全文で行う（先に置き換えた表の文字列を本文として扱わない）
  const gsnReplaced = replaceGsnHeatmapBlocksWithTable(markdown, language);
  return replaceHeatmapBlocksWithTable(gsnReplaced, language, markdown);
}

/**
 * レポート全体の risk-heatmap / gsn-heatmap ブロックを集約し、本文での言及を付与して返す
 */
export function collectReportHeatmaps(markdown: string): {
  risks: RiskHeatmapItem[];
  gsnNodes: GsnHeatmapItem[];
  gsnStakeholderProfile: StakeholderProfile | null;
} {
  const gsnBlocks = extractGsnHeatmapBlocks(markdown);
  const profileBlock = gsnBlocks.find(
    (b) => (b.stakeholderCategories?.length ?? 0) > 0 || (b.stakeholderLayers?.length ?? 0) > 0
  );
  return {
    risks: markReportMentions(mergeRisks(extractHeatmapBlocks(markdown)), markdown),
    gsnNodes: markGsnReportMentions(mergeGsnNodes(gsnBlocks), markdown),
    gsnStakeholderProfile: profileBlock
      ? toStakeholderProfile(profileBlock.stakeholderCategories, profileBlock.stakeholderLayers)
      : null,
  };
}
