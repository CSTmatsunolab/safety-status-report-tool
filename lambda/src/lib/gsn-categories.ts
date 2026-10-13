// lambda/src/lib/gsn-categories.ts
// GSNノードヒートマップの横軸: ステークホルダが必要とする情報の共通カテゴリー（固定）
//
// ⚠️ src/lib/gsn-categories.ts の GSN_INFO_CATEGORIES / STAKEHOLDER_CATEGORY_MAP と同一内容を手動で同期すること
// （Next.js と Lambda は独立ビルドのため共有パッケージを持たない）

export interface GsnInfoCategory {
  id: string;
  label: { ja: string; en: string };
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
      ja: '規格・法規への適合、認証、対外的な説明根拠に関わるノード',
      en: 'Nodes concerning conformance to standards/regulations, certification, or the basis for external accountability',
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
      ja: '製品品質・スケジュール・コスト・市場投入など事業や製品への影響が文書に記載されたノード',
      en: 'Nodes whose documented content affects product quality, schedule, cost, or market launch',
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

// 既定ステークホルダが必要とするカテゴリー
export const STAKEHOLDER_CATEGORY_MAP: Record<string, string[]> = {
  cxo: ['goal-status', 'hazard-risk', 'compliance', 'business'],
  business: ['goal-status', 'hazard-risk', 'business'],
  product: ['goal-status', 'hazard-risk', 'open-issues', 'business'],
  architect: ['architecture', 'verification', 'open-issues', 'technology'],
  'technical-fellows': ['verification', 'technology', 'architecture', 'hazard-risk'],
  'r-and-d': ['technology', 'open-issues', 'verification'],
};
