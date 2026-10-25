// src/lib/risk-heatmap.ts
// リスクヒートマップ（発生確率 × 影響度 の 5×5 マトリクス）用の共通ロジック
// LLMがレポート中に出力する ```risk-heatmap フェンスブロック（JSON）を扱う
// 軸は読者によらず共通。読者への関連度（必須/関連/参考）は src/lib/risk-relevance.ts で別に算出して重ねる

import {
  GSN_RELEVANCES,
  GSN_RELEVANCE_LABELS,
  GsnCategoryId,
  gsnCategoryLabel,
  isGsnCategoryId,
  normalizeCategoryIds,
} from './gsn-categories';
import { hasRiskCategories, riskRelevance, riskWantedCategories } from './risk-relevance';

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
  // 本文での扱いの深さ（詳述／言及のみ／なし）。markReportMentions で判定。未判定は undefined
  coverage?: ReportCoverage;
  // リスクの影響・対策が関わる話題カテゴリーのID（src/lib/gsn-categories.ts。抽出時にLLMが付与）
  categories?: string[];
  // そのうち最も中心的なカテゴリー（関連度の「必須」の判定に使う）
  primaryCategory?: string;
}

// 本文での扱いの深さ: 見出しで個別に取り上げた＝詳述、本文・表で触れただけ＝言及のみ
export type ReportCoverage = 'detailed' | 'mentioned' | 'none';

export const REPORT_COVERAGE_LABELS: Record<'ja' | 'en', Record<ReportCoverage, string>> = {
  ja: { detailed: '詳述', mentioned: '言及のみ', none: 'なし' },
  en: { detailed: 'Detailed', mentioned: 'Mentioned', none: 'No' },
};

export interface RiskHeatmapData {
  title?: string;
  // レポート対象のステークホルダが必要とするカテゴリーのID（関連度の算出に使う）
  stakeholderCategories?: string[];
  risks: RiskHeatmapItem[];
}

export type RiskBand = 'high' | 'medium' | 'low' | 'minimal';

export const RISK_HEATMAP_LANG = 'risk-heatmap';

const HEATMAP_BLOCK_REGEX = /```risk-heatmap[^\n]*\n([\s\S]*?)```/g;
// エクスポート用: ブロックの直前に残った図のプレースホルダー行（[図1: リスクヒートマップ] 等）と、
// 直後の「※ 本図は〜」の説明（色・強調の説明で表には当てはまらない）も含めて置き換える
export function heatmapExportRegex(lang: string): RegExp {
  return new RegExp(
    String.raw`(?:^[ \t]*\[(?:図|Figure)\s*[^\]\n]*(?:ヒートマップ|heatmap)[^\]\n]*\][ \t]*\n\s*)?` +
      '```' + lang + String.raw`[^\n]*\n([\s\S]*?)` + '```' +
      String.raw`(?:\s*\n[ \t]*(?:※|\*)\s*(?:本図|This figure)[^\n]*)?`,
    'gim'
  );
}

// リスク・GSNの両ヒートマップブロック（本文判定ではどちらのJSONも本文として扱わない）
const ALL_HEATMAP_BLOCKS_REGEX = /```(?:risk-heatmap|gsn-heatmap)[^\n]*\n[\s\S]*?```/g;

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

  const { title, risks, stakeholderCategories } = root as {
    title?: unknown;
    risks?: unknown;
    stakeholderCategories?: unknown;
  };
  if (!Array.isArray(risks)) return null;

  const items: RiskHeatmapItem[] = [];
  risks.forEach((risk, index) => {
    if (!risk || typeof risk !== 'object') return;
    const r = risk as Record<string, unknown>;
    const rawLikelihood = toOptionalString(r.likelihood ?? r.probability);
    const rawImpact = toOptionalString(r.impact ?? r.severity);
    const categories = normalizeCategoryIds(r.categories);
    // 中心カテゴリーは categories に含まれるもののみ（無ければ categories に加える）
    const primaryCategory = isGsnCategoryId(r.primaryCategory) ? r.primaryCategory : undefined;
    items.push({
      id: toOptionalString(r.id) ?? `#${index + 1}`,
      name: toOptionalString(r.name),
      likelihood: normalizeLevel(r.likelihood ?? r.probability),
      impact: normalizeLevel(r.impact ?? r.severity),
      status: toOptionalString(r.status),
      rawLikelihood,
      rawImpact,
      categories:
        primaryCategory && categories && !categories.includes(primaryCategory)
          ? normalizeCategoryIds([...categories, primaryCategory])
          : categories ?? (primaryCategory ? [primaryCategory] : undefined),
      primaryCategory,
    });
  });

  return {
    title: toOptionalString(title),
    stakeholderCategories: normalizeCategoryIds(stakeholderCategories),
    risks: items,
  };
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

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 言及判定から除外する補助的な節（読み方ガイド・用語集・略語一覧）の見出し
const AUXILIARY_SECTION_REGEX = /読み方|用語集|略語|glossary|how to read|reading (?:this report|guide)|abbreviation/i;
const HEADING_REGEX = /^(#{1,6})\s+(.*)$/;
const HORIZONTAL_RULE_REGEX = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * 読み方ガイド・用語集などの補助的な節を取り除く
 * - 見出しの節は、同じかそれより上位の見出しまでを除く
 * - 見出しにしていない注記（「**本報告書の読み方について:**」等）は、次の見出しか水平線までを除く
 * 記号の一覧や用語の説明に出てくるIDは、本文で扱ったことを意味しないため
 */
function stripAuxiliarySections(markdown: string): string {
  const kept: string[] = [];
  // 除外中の見出しレベル（0 = 見出しでない注記。次の見出し・水平線で終わる）
  let skipLevel: number | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(HEADING_REGEX);
    if (skipLevel !== null) {
      const ends = heading
        ? skipLevel === 0 || heading[1].length <= skipLevel
        : skipLevel === 0 && HORIZONTAL_RULE_REGEX.test(line);
      if (!ends) continue;
      skipLevel = null;
    }
    if (heading && AUXILIARY_SECTION_REGEX.test(heading[2])) {
      skipLevel = heading[1].length;
      continue;
    }
    if (!heading && /^\s*(?:\*\*|__)?\s*(?:本報告書の読み方|本レポートの読み方|how to read|about reading this report)/i.test(line)) {
      skipLevel = 0;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * レポート本文（risk-heatmap / gsn-heatmap ブロック、読み方ガイド・用語集を除いた部分）を返す
 */
export function getReportBody(markdown: string): string {
  return stripAuxiliarySections(markdown.replace(ALL_HEATMAP_BLOCKS_REGEX, ''));
}

// 太字だけの行（「**R-101: リスク名**」のような見出し代わりの行）
const BOLD_ONLY_LINE_REGEX = /^\s*(?:\*\*|__)[^*_\n]+(?:\*\*|__)\s*$/;

/**
 * 本文から見出し（# 見出し、太字だけの行）を抜き出す
 * 見出しで個別に取り上げた項目を「詳述」とみなすため
 */
export function getReportHeadings(body: string): string {
  return body
    .split('\n')
    .filter((line) => HEADING_REGEX.test(line) || BOLD_ONLY_LINE_REGEX.test(line))
    .join('\n');
}

/**
 * 本文での扱いの深さを判定する（mentionedIn で本文・見出しそれぞれへの出現を判定）
 */
export function reportCoverage(
  mentionedIn: (text: string) => boolean,
  body: string,
  headings: string
): ReportCoverage {
  if (!mentionedIn(body)) return 'none';
  return mentionedIn(headings) ? 'detailed' : 'mentioned';
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
  const headings = getReportHeadings(body);
  return risks.map((item) => {
    const coverage = reportCoverage((text) => isRiskMentioned(item, text), body, headings);
    return { ...item, inReport: coverage !== 'none', coverage };
  });
}

/**
 * 「本レポートでの記載」列の表示（詳述／言及のみ／なし。未判定は -）
 */
export function coverageText(item: { inReport?: boolean; coverage?: ReportCoverage }, lang: 'ja' | 'en'): string {
  const coverage = item.coverage ?? (item.inReport === undefined ? undefined : item.inReport ? 'mentioned' : 'none');
  return coverage ? REPORT_COVERAGE_LABELS[lang][coverage] : '-';
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
          categories: item.categories ?? existing?.categories,
          primaryCategory: item.primaryCategory ?? existing?.primaryCategory,
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

export function detectLanguage(text: string): 'ja' | 'en' {
  return /[぀-ヿ一-鿿]/.test(text) ? 'ja' : 'en';
}

export function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const BAND_LABELS: Record<'ja' | 'en', Record<RiskBand, string>> = {
  ja: { high: '高', medium: '中', low: '低', minimal: '極低' },
  en: { high: 'High', medium: 'Medium', low: 'Low', minimal: 'Minimal' },
};

function heatmapToMarkdownTable(data: RiskHeatmapData, lang: 'ja' | 'en'): string {
  const ja = lang === 'ja';
  // 読者の要求があり、リスクにカテゴリーが付いていれば関連度とカテゴリーの列を加える
  const profile =
    data.stakeholderCategories && data.stakeholderCategories.length > 0 && hasRiskCategories(data.risks)
      ? { categories: data.stakeholderCategories as GsnCategoryId[], layers: [] }
      : null;
  const header = profile
    ? ja
      ? '| リスクID | リスク名 | 関連度（根拠） | 発生確率 | 影響度 | スコア | 対策状況 | カテゴリー | 本レポートでの記載 |'
      : '| Risk ID | Risk | Relevance (basis) | Likelihood | Impact | Score | Status | Categories | Covered in this report |'
    : ja
      ? '| リスクID | リスク名 | 発生確率 | 影響度 | スコア | 対策状況 | 本レポートでの記載 |'
      : '| Risk ID | Risk | Likelihood | Impact | Score | Status | Covered in this report |';
  const unrated = ja ? '記載なし' : 'Not documented';

  const formatLevel = (level: RiskLevel | null, raw?: string) => {
    if (level === null) return raw ? escapeTableCell(raw) : unrated;
    return raw && raw !== String(level) ? `${level} (${escapeTableCell(raw)})` : String(level);
  };
  const scoreOf = (item: RiskHeatmapItem) =>
    item.likelihood !== null && item.impact !== null ? riskScore(item.likelihood, item.impact) : null;
  const categoryText = (item: RiskHeatmapItem) => {
    const names = (item.categories ?? []).map((c) =>
      c === item.primaryCategory ? `${gsnCategoryLabel(c, lang)}${ja ? '（中心）' : ' (primary)'}` : gsnCategoryLabel(c, lang)
    );
    return names.length > 0 ? escapeTableCell(names.join(ja ? '、' : ', ')) : '-';
  };

  const entries = data.risks.map((item) => ({
    item,
    relevance: profile ? riskRelevance(item, profile, lang) : null,
  }));
  // 関連度の高い順、その中はスコアの高い順（要求が無ければ文書の順）
  if (profile) {
    entries.sort(
      (a, b) =>
        GSN_RELEVANCES.indexOf(a.relevance!.relevance) - GSN_RELEVANCES.indexOf(b.relevance!.relevance) ||
        (scoreOf(b.item) ?? 0) - (scoreOf(a.item) ?? 0)
    );
  }

  const rows = entries.map(({ item, relevance }) => {
    const score = scoreOf(item);
    const scoreText =
      score === null ? '-' : `${score} (${BAND_LABELS[lang][scoreBand(score)]})`;
    const cells = [
      escapeTableCell(item.id),
      escapeTableCell(item.name ?? '-'),
      ...(relevance
        ? [`${GSN_RELEVANCE_LABELS[lang][relevance.relevance]}（${escapeTableCell(relevance.reason)}）`]
        : []),
      formatLevel(item.likelihood, item.rawLikelihood),
      formatLevel(item.impact, item.rawImpact),
      scoreText,
      escapeTableCell(item.status ?? '-'),
      ...(profile ? [categoryText(item)] : []),
      coverageText(item, lang),
    ];
    return `| ${cells.join(' | ')} |`;
  });

  const separator = `|${'---|'.repeat(profile ? 9 : 7)}`;
  const lines = [header, separator, ...rows];
  if (data.title) lines.unshift(`**${data.title}**`, '');
  const relevanceNote = profile
    ? ja
      ? `関連度は、読者が必要とするカテゴリー（${riskWantedCategories(profile).map((c) => gsnCategoryLabel(c, lang)).join('、') || '-'}）にリスクの中心カテゴリーが一致＝必須、中心以外のみ一致＝関連、一致なし＝参考。`
      : `Relevance: the risk's primary category matches a category the reader needs (${riskWantedCategories(profile).map((c) => gsnCategoryLabel(c, lang)).join(', ') || '-'}) = Required, only other categories match = Related, no match = Reference. `
    : '';
  lines.push(
    '',
    ja
      ? `※ ヒートマップ（影響度×発生確率）の内容を表形式で示したもの。スコア＝影響度×発生確率。${relevanceNote}「本レポートでの記載」は本文での扱い（詳述＝見出しで個別に取り上げた、言及のみ＝本文・表で触れた、なし）。`
      : `Note: The heatmap (impact x likelihood) shown as a table. Score = impact x likelihood. ${relevanceNote}"Covered in this report" shows how the risk is covered in the body (Detailed = has its own heading, Mentioned = referred to in text or tables, No).`
  );
  return lines.join('\n');
}

/**
 * エクスポート・印刷用に risk-heatmap ブロックをMarkdown表へ置き換える
 * （パースできないブロックは削除する）
 */
export function replaceHeatmapBlocksWithTable(
  markdown: string,
  lang?: 'ja' | 'en',
  // 言及判定に使う全文（他のブロックを先に置き換えた場合に元の全文を渡す）
  mentionSource: string = markdown
): string {
  const language = lang ?? detectLanguage(markdown);
  return markdown.replace(heatmapExportRegex(RISK_HEATMAP_LANG), (_whole, json: string) => {
    const data = parseHeatmapBlock(json);
    if (!data || data.risks.length === 0) return '';
    data.risks = markReportMentions(data.risks, mentionSource);
    // 直後の行が表の行として扱われないよう空行を入れる
    return `${heatmapToMarkdownTable(data, language)}\n`;
  });
}
