// src/lib/risk-heatmap.ts
// リスクヒートマップ（発生確率 × 影響度 の 5×5 マトリクス）用の共通ロジック
// LLMがレポート中に出力する ```risk-heatmap フェンスブロック（JSON）を扱う

export type RiskLevel = 1 | 2 | 3 | 4 | 5;

export interface RiskHeatmapItem {
  id: string;
  name?: string;
  likelihood: RiskLevel | null;
  impact: RiskLevel | null;
  status?: string;
  // 文書に記載されていた元の値（表示用）
  rawLikelihood?: string;
  rawImpact?: string;
  // このレポートの本文で言及されているか（markReportMentions で判定。未判定は undefined）
  inReport?: boolean;
}

export interface RiskHeatmapData {
  title?: string;
  risks: RiskHeatmapItem[];
}

export type RiskBand = 'high' | 'medium' | 'low' | 'minimal';

export const RISK_HEATMAP_LANG = 'risk-heatmap';

const HEATMAP_BLOCK_REGEX = /```risk-heatmap[^\n]*\n([\s\S]*?)```/g;

const LEVEL_WORDS: Record<string, RiskLevel> = {
  'very high': 5,
  'very-high': 5,
  'veryhigh': 5,
  'critical': 5,
  '極高': 5,
  '非常に高い': 5,
  'high': 5,
  '高': 5,
  '高い': 5,
  '大': 5,
  'medium': 3,
  'med': 3,
  'mid': 3,
  'moderate': 3,
  '中': 3,
  '中程度': 3,
  'low': 1,
  '低': 1,
  '低い': 1,
  '小': 1,
  'very low': 1,
  'very-low': 1,
  'verylow': 1,
  '極低': 1,
  '非常に低い': 1,
};

/**
 * 文書記載の評価値を 1〜5 に正規化する
 * - High/高 → 5, Medium/中 → 3, Low/低 → 1（3段階値を5段階の両端と中央に配置）
 * - 1〜5 の数値（文字列含む）はそのまま
 * - それ以外（記載なし・不明）は null
 */
export function normalizeLevel(value: unknown): RiskLevel | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 5 ? (value as RiskLevel) : null;
  }

  if (typeof value !== 'string') return null;

  const text = value.trim().toLowerCase();
  if (!text) return null;

  if (/^[1-5]$/.test(text)) return Number(text) as RiskLevel;

  // "4/5" や "3（中）" のような表記
  const leadingNumber = text.match(/^([1-5])\s*(?:\/\s*5|[（(])/);
  if (leadingNumber) return Number(leadingNumber[1]) as RiskLevel;

  return LEVEL_WORDS[text] ?? null;
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

/**
 * risk-heatmap ブロックのJSON文字列をパースする
 * ストリーミング途中などで不完全なJSONの場合は null を返す
 */
export function parseHeatmapBlock(json: string): RiskHeatmapData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  // 配列のみが出力された場合も許容する
  const root = Array.isArray(parsed) ? { risks: parsed } : parsed;
  if (!root || typeof root !== 'object') return null;

  const { title, risks } = root as { title?: unknown; risks?: unknown };
  if (!Array.isArray(risks)) return null;

  const items: RiskHeatmapItem[] = [];
  risks.forEach((risk, index) => {
    if (!risk || typeof risk !== 'object') return;
    const r = risk as Record<string, unknown>;
    const rawLikelihood = toOptionalString(r.likelihood ?? r.probability);
    const rawImpact = toOptionalString(r.impact ?? r.severity);
    items.push({
      id: toOptionalString(r.id) ?? `#${index + 1}`,
      name: toOptionalString(r.name),
      likelihood: normalizeLevel(r.likelihood ?? r.probability),
      impact: normalizeLevel(r.impact ?? r.severity),
      status: toOptionalString(r.status),
      rawLikelihood,
      rawImpact,
    });
  });

  return { title: toOptionalString(title), risks: items };
}

/**
 * Markdown中のすべての risk-heatmap ブロックを抽出・パースする
 */
export function extractHeatmapBlocks(markdown: string): RiskHeatmapData[] {
  const results: RiskHeatmapData[] = [];
  for (const match of markdown.matchAll(HEATMAP_BLOCK_REGEX)) {
    const data = parseHeatmapBlock(match[1]);
    if (data) results.push(data);
  }
  return results;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * レポート本文（risk-heatmap ブロックを除いた部分）を返す
 */
export function getReportBody(markdown: string): string {
  return markdown.replace(HEATMAP_BLOCK_REGEX, '');
}

/**
 * リスクがレポート本文で言及されているかを判定する
 * - リスクID（R-101 等）が本文に出現すれば言及あり（R-1 と R-10 は区別する）
 * - IDが文書に無く自動採番（#1 等）の場合のみ、リスク名の出現で判定する
 */
export function isRiskMentioned(item: RiskHeatmapItem, body: string): boolean {
  if (!item.id.startsWith('#')) {
    const idPattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(item.id)}(?![0-9A-Za-z])`, 'i');
    return idPattern.test(body);
  }
  return !!item.name && item.name.length >= 3 && body.includes(item.name);
}

/**
 * 各リスクに「このレポートに記載されているか」(inReport) を付与する
 */
export function markReportMentions(risks: RiskHeatmapItem[], markdown: string): RiskHeatmapItem[] {
  const body = getReportBody(markdown);
  return risks.map((item) => ({ ...item, inReport: isRiskMentioned(item, body) }));
}

function isRated(item: RiskHeatmapItem): boolean {
  return item.likelihood !== null && item.impact !== null;
}

/**
 * 複数ブロックのリスクをID単位で統合する（後勝ち。ただし評価ありを評価なしで上書きしない）
 */
export function mergeRisks(datas: RiskHeatmapData[]): RiskHeatmapItem[] {
  const merged = new Map<string, RiskHeatmapItem>();
  for (const data of datas) {
    for (const item of data.risks) {
      const existing = merged.get(item.id);
      if (!existing || isRated(item) || !isRated(existing)) {
        merged.set(item.id, {
          ...item,
          name: item.name ?? existing?.name,
          status: item.status ?? existing?.status,
        });
      }
    }
  }
  return Array.from(merged.values());
}

export function riskScore(likelihood: RiskLevel, impact: RiskLevel): number {
  return likelihood * impact;
}

export function scoreBand(score: number): RiskBand {
  if (score >= 15) return 'high';
  if (score >= 8) return 'medium';
  if (score >= 4) return 'low';
  return 'minimal';
}

function detectLanguage(text: string): 'ja' | 'en' {
  return /[぀-ヿ一-鿿]/.test(text) ? 'ja' : 'en';
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const BAND_LABELS: Record<'ja' | 'en', Record<RiskBand, string>> = {
  ja: { high: '高', medium: '中', low: '低', minimal: '極低' },
  en: { high: 'High', medium: 'Medium', low: 'Low', minimal: 'Minimal' },
};

function heatmapToMarkdownTable(data: RiskHeatmapData, lang: 'ja' | 'en'): string {
  const ja = lang === 'ja';
  const header = ja
    ? '| リスクID | リスク名 | 発生確率 | 影響度 | スコア | 対策状況 | 本レポートでの記載 |'
    : '| Risk ID | Risk | Likelihood | Impact | Score | Status | Covered in this report |';
  const mentionText = (item: RiskHeatmapItem) =>
    item.inReport === undefined ? '-' : item.inReport ? (ja ? 'あり' : 'Yes') : (ja ? 'なし' : 'No');
  const unrated = ja ? '記載なし' : 'Not documented';

  const formatLevel = (level: RiskLevel | null, raw?: string) => {
    if (level === null) return raw ? escapeTableCell(raw) : unrated;
    return raw && raw !== String(level) ? `${level} (${escapeTableCell(raw)})` : String(level);
  };

  const rows = data.risks.map((item) => {
    const score =
      item.likelihood !== null && item.impact !== null
        ? riskScore(item.likelihood, item.impact)
        : null;
    const scoreText =
      score === null ? '-' : `${score} (${BAND_LABELS[lang][scoreBand(score)]})`;
    return `| ${escapeTableCell(item.id)} | ${escapeTableCell(item.name ?? '-')} | ${formatLevel(item.likelihood, item.rawLikelihood)} | ${formatLevel(item.impact, item.rawImpact)} | ${scoreText} | ${escapeTableCell(item.status ?? '-')} | ${mentionText(item)} |`;
  });

  const lines = [header, '|---|---|---|---|---|---|---|', ...rows];
  if (data.title) lines.unshift(`**${data.title}**`, '');
  return lines.join('\n');
}

/**
 * エクスポート・印刷用に risk-heatmap ブロックをMarkdown表へ置き換える
 * （パースできないブロックは削除する）
 */
export function replaceHeatmapBlocksWithTable(markdown: string, lang?: 'ja' | 'en'): string {
  const language = lang ?? detectLanguage(markdown);
  return markdown.replace(HEATMAP_BLOCK_REGEX, (_whole, json: string) => {
    const data = parseHeatmapBlock(json);
    if (!data || data.risks.length === 0) return '';
    data.risks = markReportMentions(data.risks, markdown);
    // 直後の行が表の行として扱われないよう空行を入れる
    return `${heatmapToMarkdownTable(data, language)}\n`;
  });
}
