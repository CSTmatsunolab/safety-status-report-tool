// src/lib/gsn-categories.ts
// GSNノードヒートマップの横軸: ステークホルダが必要とする情報の共通カテゴリー（固定）
// ノードのカテゴリーは GSN 抽出時に LLM が付与し、ステークホルダを選ぶとそのステークホルダが必要とするカテゴリーを強調する
//
// ⚠️ カテゴリー定義（GSN_INFO_CATEGORIES）は lambda/src/lib/gsn-categories.ts と同一内容を手動で同期すること
// （Next.js と Lambda は独立ビルドのため共有パッケージを持たない）

import type { Stakeholder } from '@/types';
import type { GsnHeatmapItem } from './gsn-heatmap';

export type GsnCategoryId =
  | 'goal-status'
  | 'hazard-risk'
  | 'verification'
  | 'compliance'
  | 'open-issues'
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
    id: 'goal-status',
    label: { ja: '安全目標の達成状況', en: 'Safety goal status' },
    definition: {
      ja: 'システム全体または主要な安全目標が達成されているか（論証全体の結論）を示すノード',
      en: 'Nodes showing whether the overall system or major safety goals are achieved (the conclusion of the argument)',
    },
  },
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
    id: 'open-issues',
    label: { ja: '未解決課題・残作業', en: 'Open issues & remaining work' },
    definition: {
      ja: '未達成・部分達成・未展開で、対策中・検証中などの残作業や未解決の課題を含むノード',
      en: 'Nodes that are not (fully) achieved or undeveloped and carry remaining work or unresolved issues',
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

// 既定ステークホルダが必要とするカテゴリー
export const STAKEHOLDER_CATEGORY_MAP: Record<string, GsnCategoryId[]> = {
  cxo: ['goal-status', 'hazard-risk', 'compliance', 'business'],
  business: ['goal-status', 'hazard-risk', 'business'],
  product: ['goal-status', 'hazard-risk', 'open-issues', 'business'],
  architect: ['architecture', 'verification', 'open-issues', 'technology'],
  'technical-fellows': ['verification', 'technology', 'architecture', 'hazard-risk'],
  'r-and-d': ['technology', 'open-issues', 'verification'],
};

export function isPredefinedCategoryStakeholder(stakeholder: Stakeholder): boolean {
  return stakeholder.id in STAKEHOLDER_CATEGORY_MAP;
}

/**
 * カスタムステークホルダの割り当て結果のキャッシュキー（関心事が編集された場合も別キーになる）
 */
export function stakeholderCategoryKey(stakeholder: Stakeholder): string {
  return `${stakeholder.id}::${stakeholder.role}::${stakeholder.concerns.join('|')}`;
}

/**
 * ステークホルダが必要とするカテゴリー
 * - 既定ステークホルダは対応表、カスタムは LLM で割り当てた結果（customMap）。未割り当てなら null
 */
export function categoriesForStakeholder(
  stakeholder: Stakeholder,
  customMap: Record<string, GsnCategoryId[]>
): GsnCategoryId[] | null {
  if (isPredefinedCategoryStakeholder(stakeholder)) return STAKEHOLDER_CATEGORY_MAP[stakeholder.id];
  return customMap[stakeholderCategoryKey(stakeholder)] ?? null;
}

// レポート生成に渡す「詳述するノード」
export interface FocusGsnNode {
  id: string;
  // 該当する必要情報カテゴリーのラベル
  categories: string[];
  reason?: string;
}

/**
 * ステークホルダの必要カテゴリーに1つでも入るノードを、レポートで詳述するノードとして初期選択する
 * 戻り値: ノードID → 選定理由（「カテゴリー: ハザード・リスクと対策」）
 */
export function selectFocusGsnNodes(
  nodes: GsnHeatmapItem[],
  categoryIds: string[],
  language: 'ja' | 'en'
): Map<string, string> {
  const wanted = new Set(categoryIds);
  const prefix = language === 'en' ? 'Category: ' : 'カテゴリー: ';
  const selected = new Map<string, string>();
  for (const node of nodes) {
    const matched = (node.categories ?? []).filter((c) => wanted.has(c));
    if (matched.length > 0) {
      selected.set(node.id, prefix + matched.map((c) => gsnCategoryLabel(c, language)).join(language === 'en' ? ', ' : '、'));
    }
  }
  return selected;
}
