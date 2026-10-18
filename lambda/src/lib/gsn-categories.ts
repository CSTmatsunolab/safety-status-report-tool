// lambda/src/lib/gsn-categories.ts
// GSNノードヒートマップ（縦=ステークホルダへの関連度 × 横=達成状況）の分類に使う定義
// ノードの話題カテゴリー（固定6種）・論証レイヤー・既定ステークホルダの要求
//
// ⚠️ src/lib/gsn-categories.ts の GSN_INFO_CATEGORIES / GSN_LAYERS / STAKEHOLDER_PROFILE_MAP と同一内容を手動で同期すること
// （Next.js と Lambda は独立ビルドのため共有パッケージを持たない）

export interface GsnInfoCategory {
  id: string;
  label: { ja: string; en: string };
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

export const GSN_CATEGORY_IDS: string[] = GSN_INFO_CATEGORIES.map((c) => c.id);

/**
 * 既知のカテゴリーIDのみを残し、定義順に並べる
 */
export function normalizeCategoryIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set(value.filter((v): v is string => typeof v === 'string'));
  return GSN_CATEGORY_IDS.filter((id) => ids.has(id));
}

export function gsnCategoryLabel(id: string, language: 'ja' | 'en'): string {
  return GSN_INFO_CATEGORIES.find((c) => c.id === id)?.label[language] ?? id;
}

/**
 * LLM プロンプトに埋め込むカテゴリー一覧（"- id（ラベル）: 定義" 形式）
 */
export function formatCategoryDefinitions(language: 'ja' | 'en'): string {
  return GSN_INFO_CATEGORIES.map((c) => `- ${c.id}（${c.label[language]}）: ${c.definition[language]}`).join('\n');
}

// 論証レイヤー（関連度の判定に使う。ノードのレイヤーは種別と親子関係から画面側で決める）
export const GSN_LAYERS: { id: string; label: { ja: string; en: string }; definition: { ja: string; en: string } }[] = [
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

export const GSN_LAYER_IDS: string[] = GSN_LAYERS.map((l) => l.id);

/**
 * LLM プロンプトに埋め込むレイヤー一覧（"- id（ラベル）: 定義" 形式）
 */
export function formatLayerDefinitions(language: 'ja' | 'en'): string {
  return GSN_LAYERS.map((l) => `- ${l.id}（${l.label[language]}）: ${l.definition[language]}`).join('\n');
}

/**
 * 既知のレイヤーIDのみを残し、定義順に並べる
 */
export function normalizeLayerIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set(value.filter((v): v is string => typeof v === 'string'));
  return GSN_LAYER_IDS.filter((id) => ids.has(id));
}

export interface StakeholderProfile {
  categories: string[];
  layers: string[];
}

// 既定ステークホルダの要求（必要とする話題カテゴリー＋重視する論証レイヤー）
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
