// src/lib/gsn-categories.ts
// GSNノードヒートマップ（縦=ステークホルダへの関連度 × 横=達成状況）の分類ロジック
// - ノードの話題カテゴリー（固定6種）は GSN 抽出時に LLM が付与する
// - ノードの論証レイヤー（トップ/サブゴール/方針/証拠）はノード種別と親子関係から決める
// - ステークホルダの要求（必要なカテゴリー＋重視するレイヤー）とノードの一致から、関連度（必須/関連/参考）をルールで算出する
//
// ⚠️ GSN_INFO_CATEGORIES / GSN_LAYERS / STAKEHOLDER_PROFILE_MAP は lambda/src/lib/gsn-categories.ts と同一内容を手動で同期すること
// （Next.js と Lambda は独立ビルドのため共有パッケージを持たない）

import type { Stakeholder } from '@/types';
import type { GsnHeatmapItem, GsnStatus } from './gsn-heatmap';

export type GsnCategoryId =
  | 'hazard-risk'
  | 'verification'
  | 'compliance'
  | 'architecture'
  | 'technology'
  | 'business';

export interface GsnInfoCategory {
  id: GsnCategoryId;
  label: { ja: string; en: string };
  // LLM にノードを分類させる際の定義
  definition: { ja: string; en: string };
}

export const GSN_INFO_CATEGORIES: GsnInfoCategory[] = [
  {
    id: 'hazard-risk',
    label: { ja: 'ハザード・リスクと対策', en: 'Hazards, risks & mitigation' },
    definition: {
      ja: 'ハザード・リスクの識別、その対策・低減策の実施状況を論証するノード',
      en: 'Nodes arguing the identification of hazards/risks and the status of their mitigation',
    },
  },
  {
    id: 'verification',
    label: { ja: '検証・証拠の充足', en: 'Verification & evidence' },
    definition: {
      ja: '試験・レビュー・解析などの検証結果や、証拠が十分かどうかを示すノード',
      en: 'Nodes showing verification results (tests, reviews, analyses) or whether the evidence is sufficient',
    },
  },
  {
    id: 'compliance',
    label: { ja: '規格適合・説明責任', en: 'Compliance & accountability' },
    definition: {
      ja: '規格・法規への適合、認証、対外的な説明根拠に関わるノード。規格の手法に基づく論証（例: ISO 26262 のASILに応じた検証、SOTIFのシナリオ評価）や、未達成だと規格準拠・認証申請を主張できなくなるノードを含む',
      en: 'Nodes concerning conformance to standards/regulations, certification, or the basis for external accountability, including arguments built on a standard\'s method (e.g. ISO 26262 ASIL-dependent verification, SOTIF scenario evaluation) and nodes whose non-achievement prevents claiming conformance or applying for certification',
    },
  },
  {
    id: 'architecture',
    label: { ja: '設計・アーキテクチャ', en: 'Design & architecture' },
    definition: {
      ja: 'システム設計・アーキテクチャ・安全要件の仕様や設計上の整合性に関わるノード',
      en: 'Nodes concerning system design, architecture, safety requirement specifications, or design consistency',
    },
  },
  {
    id: 'technology',
    label: { ja: '技術的実現性・技術課題', en: 'Technical feasibility' },
    definition: {
      ja: '技術的な実現手段・技術的な課題や制約に関わるノード',
      en: 'Nodes concerning technical means of realization, technical challenges, or constraints',
    },
  },
  {
    id: 'business',
    label: { ja: '事業・製品への影響', en: 'Business & product impact' },
    definition: {
      ja: '製品品質・スケジュール・コスト・市場投入など事業や製品への影響があるノード。ノード自身の記載に加え、ノードが参照するハザード・要件・試験について、提供文書にマイルストーン遅延・予算超過・リリース判断・量産移行などへの影響が記載されているノードを含む',
      en: 'Nodes affecting the business or product, such as product quality, schedule, cost, or market launch, including nodes whose cited hazards, requirements, or tests are documented (anywhere in the provided documents) as affecting milestones, budget, release decisions, or production',
    },
  },
];

export const GSN_CATEGORY_IDS: GsnCategoryId[] = GSN_INFO_CATEGORIES.map((c) => c.id);

const CATEGORY_ID_SET = new Set<string>(GSN_CATEGORY_IDS);

export function isGsnCategoryId(value: unknown): value is GsnCategoryId {
  return typeof value === 'string' && CATEGORY_ID_SET.has(value);
}

export function gsnCategoryLabel(id: string, language: 'ja' | 'en'): string {
  return GSN_INFO_CATEGORIES.find((c) => c.id === id)?.label[language] ?? id;
}

/**
 * 既知のカテゴリーIDのみを残し、定義順に並べる
 */
export function normalizeCategoryIds(value: unknown): GsnCategoryId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set(value.filter(isGsnCategoryId));
  return GSN_CATEGORY_IDS.filter((id) => ids.has(id));
}

/**
 * LLM プロンプトに埋め込むカテゴリー一覧（"- id: 定義" 形式）
 */
export function formatCategoryDefinitions(language: 'ja' | 'en'): string {
  return GSN_INFO_CATEGORIES.map((c) => `- ${c.id}（${c.label[language]}）: ${c.definition[language]}`).join('\n');
}

// ============================================================================
// 論証レイヤー
// ============================================================================

export type GsnLayer = 'top' | 'subgoal' | 'strategy' | 'evidence';

export const GSN_LAYERS: { id: GsnLayer; label: { ja: string; en: string }; definition: { ja: string; en: string } }[] = [
  {
    id: 'top',
    label: { ja: 'トップゴール', en: 'Top goal' },
    definition: { ja: 'システム全体の安全性の結論', en: 'The overall safety conclusion of the system' },
  },
  {
    id: 'subgoal',
    label: { ja: 'サブゴール', en: 'Sub-goal' },
    definition: { ja: '個々の安全目標・主張（未展開の論証を含む）', en: 'Individual safety goals/claims (including undeveloped arguments)' },
  },
  {
    id: 'strategy',
    label: { ja: '論証方針', en: 'Strategy' },
    definition: { ja: '主張を分解する論証の方針・手法', en: 'How claims are decomposed and argued' },
  },
  {
    id: 'evidence',
    label: { ja: '証拠', en: 'Evidence' },
    definition: { ja: '試験結果・解析・記録などの証拠', en: 'Evidence such as test results, analyses, and records' },
  },
];

export const GSN_LAYER_IDS: GsnLayer[] = GSN_LAYERS.map((l) => l.id);

/**
 * LLM プロンプトに埋め込むレイヤー一覧（"- id（ラベル）: 定義" 形式）
 */
export function formatLayerDefinitions(language: 'ja' | 'en'): string {
  return GSN_LAYERS.map((l) => `- ${l.id}（${l.label[language]}）: ${l.definition[language]}`).join('\n');
}

export function gsnLayerLabel(id: GsnLayer, language: 'ja' | 'en'): string {
  return GSN_LAYERS.find((l) => l.id === id)?.label[language] ?? id;
}

/**
 * 既知のレイヤーIDのみを残し、定義順に並べる
 */
export function normalizeLayerIds(value: unknown): GsnLayer[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set(value.filter((v): v is string => typeof v === 'string'));
  return GSN_LAYER_IDS.filter((id) => ids.has(id));
}

/**
 * ノードの論証レイヤー
 * - 親が [] ならトップゴール。Strategy は方針、Solution は証拠、それ以外（Goal・Undeveloped・親不明のGoal等）はサブゴール
 */
export function gsnNodeLayer(node: Pick<GsnHeatmapItem, 'kind' | 'parentIds'>): GsnLayer {
  if (node.parentIds && node.parentIds.length === 0) return 'top';
  if (node.kind === 'strategy') return 'strategy';
  if (node.kind === 'solution') return 'evidence';
  return 'subgoal';
}

// ============================================================================
// ステークホルダの要求と関連度
// ============================================================================

export interface StakeholderProfile {
  // 必要とする話題カテゴリー
  categories: GsnCategoryId[];
  // 重視する論証レイヤー（経営層は上位の主張、技術者は方針・証拠）
  layers: GsnLayer[];
}

// 既定ステークホルダの要求
export const STAKEHOLDER_PROFILE_MAP: Record<string, StakeholderProfile> = {
  cxo: { categories: ['hazard-risk', 'compliance', 'business'], layers: ['top', 'subgoal'] },
  business: { categories: ['hazard-risk', 'business'], layers: ['top', 'subgoal'] },
  product: { categories: ['hazard-risk', 'business', 'verification'], layers: ['top', 'subgoal'] },
  architect: { categories: ['architecture', 'verification', 'technology'], layers: ['strategy', 'evidence'] },
  'technical-fellows': {
    categories: ['verification', 'technology', 'architecture', 'hazard-risk'],
    layers: ['strategy', 'evidence'],
  },
  'r-and-d': { categories: ['technology', 'verification'], layers: ['subgoal', 'evidence'] },
};

export function isPredefinedCategoryStakeholder(stakeholder: Stakeholder): boolean {
  return stakeholder.id in STAKEHOLDER_PROFILE_MAP;
}

/**
 * カスタムステークホルダの判定結果のキャッシュキー（関心事が編集された場合も別キーになる）
 */
export function stakeholderCategoryKey(stakeholder: Stakeholder): string {
  return `${stakeholder.id}::${stakeholder.role}::${stakeholder.concerns.join('|')}`;
}

/**
 * ステークホルダの要求
 * - 既定ステークホルダは対応表、カスタムは LLM で判定した結果（customMap）。未判定なら null
 */
export function profileForStakeholder(
  stakeholder: Stakeholder,
  customMap: Record<string, StakeholderProfile>
): StakeholderProfile | null {
  if (isPredefinedCategoryStakeholder(stakeholder)) return STAKEHOLDER_PROFILE_MAP[stakeholder.id];
  return customMap[stakeholderCategoryKey(stakeholder)] ?? null;
}

/**
 * ブロック等に保存された要求を復元する（レイヤーが無い旧データは、カテゴリーのみで判定できるよう全レイヤーを重視しない＝[]）
 */
export function toStakeholderProfile(categories: unknown, layers: unknown): StakeholderProfile | null {
  const cats = normalizeCategoryIds(categories);
  const lays = normalizeLayerIds(layers);
  if ((!cats || cats.length === 0) && (!lays || lays.length === 0)) return null;
  return { categories: cats ?? [], layers: lays ?? [] };
}

export type GsnRelevance = 'required' | 'related' | 'reference';

// 表示順（上から）
export const GSN_RELEVANCES: GsnRelevance[] = ['required', 'related', 'reference'];

export const GSN_RELEVANCE_LABELS: Record<'ja' | 'en', Record<GsnRelevance, string>> = {
  ja: { required: '必須', related: '関連', reference: '参考' },
  en: { required: 'Required', related: 'Related', reference: 'Reference' },
};

export interface GsnRelevanceResult {
  relevance: GsnRelevance;
  matchedCategories: GsnCategoryId[];
  layer: GsnLayer;
  layerMatched: boolean;
  // 根拠（例: 「カテゴリー一致: ハザード・リスクと対策／レイヤー一致: サブゴール」）
  reason: string;
}

/**
 * ノードの、ステークホルダに対する関連度をルールで決める
 * - 必須: 必要とするカテゴリーに一致し、かつ重視するレイヤーのノード（トップを重視する読者にとってのトップゴールも必須）
 * - 関連: カテゴリーとレイヤーのどちらか一方だけが一致
 * - 参考: どちらも一致しない
 * - 重視するレイヤーが無い要求（旧データ等）は、すべてのレイヤーを重視するものとして扱う
 * - 達成状況・重大度は使わない（横軸・マーカーで別に示すため）
 */
export function gsnRelevance(
  node: Pick<GsnHeatmapItem, 'kind' | 'parentIds' | 'categories'>,
  profile: StakeholderProfile,
  language: 'ja' | 'en'
): GsnRelevanceResult {
  const wanted = new Set<string>(profile.categories);
  const matchedCategories = (node.categories ?? []).filter((c): c is GsnCategoryId => wanted.has(c));
  const layer = gsnNodeLayer(node);
  const layerMatched = profile.layers.length === 0 || profile.layers.includes(layer);
  const categoryMatched = matchedCategories.length > 0;
  const relevance: GsnRelevance =
    (categoryMatched && layerMatched) || (layer === 'top' && profile.layers.includes('top'))
      ? 'required'
      : categoryMatched || layerMatched
        ? 'related'
        : 'reference';

  const ja = language === 'ja';
  const parts: string[] = [];
  if (matchedCategories.length > 0) {
    parts.push(
      `${ja ? 'カテゴリー一致: ' : 'Category match: '}${matchedCategories.map((c) => gsnCategoryLabel(c, language)).join(ja ? '、' : ', ')}`
    );
  }
  if (layerMatched && profile.layers.length > 0) parts.push(`${ja ? 'レイヤー一致: ' : 'Layer match: '}${gsnLayerLabel(layer, language)}`);
  const reason = parts.length > 0 ? parts.join(ja ? '／' : ' / ') : ja ? '一致なし' : 'No match';

  return { relevance, matchedCategories, layer, layerMatched, reason };
}

// レポート生成に渡す「詳述するノード」
export interface FocusGsnNode {
  id: string;
  // 該当する必要情報カテゴリーのラベル
  categories: string[];
  reason?: string;
}

const UNRESOLVED: (GsnStatus | null)[] = ['unachieved', 'undeveloped'];

/**
 * レポートで詳述するノードの初期選択: 必須の全ノード ＋ 関連のうち未達成・未展開のもの
 * 戻り値: ノードID → 選定理由（「必須（カテゴリー一致: …）」）
 */
export function selectFocusGsnNodes(
  nodes: GsnHeatmapItem[],
  profile: StakeholderProfile,
  language: 'ja' | 'en'
): Map<string, string> {
  const labels = GSN_RELEVANCE_LABELS[language];
  const selected = new Map<string, string>();
  for (const node of nodes) {
    const r = gsnRelevance(node, profile, language);
    if (r.relevance === 'required' || (r.relevance === 'related' && UNRESOLVED.includes(node.status))) {
      selected.set(node.id, `${labels[r.relevance]}（${r.reason}）`);
    }
  }
  return selected;
}
