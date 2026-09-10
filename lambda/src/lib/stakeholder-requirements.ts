// lambda/src/lib/stakeholder-requirements.ts
// ステークホルダー別「必須見出し」定義
//
// 【背景】
// GSNファイルがある場合、1パス目のアウトラインはGSNノード（hicase/GSNビュー）だけで
// 構成される。GSNは安全論証の構造しか持たないため、
// 「CxOが経営判断を行うための材料」「Product がリリース判断に必要な情報」といった
// ステークホルダー固有の要件に対応する見出しがアウトラインから欠落する。
// 2パス目（restructure-prompts.ts）は事実の追加を禁止した再編成であるため、
// 1パス目で書かれなかった判断材料は最終レポートにも現れない。
//
// そこで、GSN由来アウトラインに対してステークホルダー別の必須見出しを追加し、
// (1) RAG検索クエリに反映し、(2) 1パス目でその見出しを書かせ、
// (3) 2パス目では *新しい見出しを作らず*、ステークホルダーのテンプレート見出しのうち
//     内容的に最も適切なもの（リスク評価・現状分析・推奨事項など）の中へ記述させる。
//
// 【2パス目の方針】
// 2パス目の目標構成は report-structures.ts のテンプレートそのものであり、
// 必須項目のために章を増やさない（テンプレート構成の一貫性・読者の期待を壊さないため）。
// 代わりに placement（decision / risk / impact / technical / open-issues）から
// 目標構成中の適切な見出しを選び、「この見出しの本文に必ず含めること」として指示する。
//
// 日本語版・英語版はコードベースの方針に従い並列に保守する（翻訳レイヤーではない）。

import { Stakeholder } from '../types';

/**
 * 必須内容の配置先カテゴリ。
 * 2パス目でテンプレート見出しのどれに書かせるかを決めるために使う。
 * - decision:    判断材料（判断すべき事項・選択肢・期限）→ 推奨事項／次のステップ系
 * - risk:        リスク・残存リスク・受容判断 → リスク評価系
 * - impact:      影響（事業・製品・アーキテクチャ）→ 現状分析／影響分析系
 * - technical:   技術的妥当性・論証の評価 → 技術概要／分析結果系
 * - open-issues: 未解決課題・追加検証 → 課題／残課題／テスト結果系
 */
export type RequirementPlacement =
  | 'decision'
  | 'risk'
  | 'impact'
  | 'technical'
  | 'open-issues';

export interface StakeholderRequiredSection {
  /** 内部識別子（重複判定・ログ用） */
  key: string;
  /** 2パス目でこの内容を書かせるテンプレート見出しの選択に使うカテゴリ */
  placement: RequirementPlacement;
  /** 内容のラベル（1パス目の見出し／2パス目では配置先見出し内の項目名） */
  title: string;
  /** 必ず記述させる内容（1パス目・2パス目のプロンプトに埋め込む） */
  guidance: string;
  /** この見出しの内容を回収するためのRAG検索クエリ */
  queries: string[];
}

/** ステークホルダー要件のプリセット種別 */
type RequirementProfile =
  | 'executive'
  | 'business'
  | 'product'
  | 'architect'
  | 'technical-fellows'
  | 'r-and-d';

// ============================================================================
// 日本語版プリセット
// ============================================================================

const PROFILES_JA: Record<RequirementProfile, StakeholderRequiredSection[]> = {
  executive: [
    {
      key: 'decision-material',
      placement: 'decision',
      title: '経営判断に必要な情報',
      guidance:
        '安全性の達成状況が事業判断（出荷・リリース・追加投資・開発継続）に与える影響、' +
        '経営が判断を下す必要がある未解決事項とその選択肢、判断の期限・前提条件を記述する。' +
        'コスト・スケジュール・法規制への影響は文書に記載がある範囲で定量的に示す。',
      queries: [
        '出荷判断 リリース可否 経営判断 意思決定',
        'コスト スケジュール 遅延 事業影響 法規制対応',
      ],
    },
    {
      key: 'residual-risk-acceptance',
      placement: 'risk',
      title: '残存リスクと受容判断',
      guidance:
        '残存リスクの内容・影響度・発生可能性、現時点での受容状況（受容済み／未受容／判断待ち）、' +
        '受容にあたって必要な条件・承認・追加対策を記述する。',
      queries: ['残存リスク リスク受容 承認 受容基準 経営リスク'],
    },
  ],
  business: [
    {
      key: 'business-impact',
      placement: 'impact',
      title: '事業影響とコスト・スケジュール影響',
      guidance:
        '安全性の未達成事項・未解決課題が事業計画（コスト、スケジュール、市場投入時期、顧客対応）に' +
        '与える影響を、文書に記載のある数値・日付とともに記述する。',
      queries: [
        'コスト 予算 スケジュール 納期 市場投入 事業計画',
        '顧客影響 契約 法規制 認証 事業リスク',
      ],
    },
    {
      key: 'resource-decision',
      placement: 'decision',
      title: '投資・リソース判断に必要な情報',
      guidance:
        '残作業の完了に必要な追加リソース・投資、判断を要する事項とその選択肢を、' +
        '文書に記載がある範囲で記述する。記載がない場合は不足している旨を明示する。',
      queries: ['追加リソース 工数 投資 体制 残作業 完了見込み'],
    },
  ],
  product: [
    {
      key: 'product-user-impact',
      placement: 'impact',
      title: '製品・ユーザーへの影響',
      guidance:
        '未達成の安全目標・残存ハザードが製品仕様・機能制限・ユーザー運用（使用条件、注意事項）に' +
        '与える影響を記述する。',
      queries: [
        '製品仕様 機能制限 使用条件 運用制約 ユーザー影響',
        '顧客影響 市場不具合 使用上の注意',
      ],
    },
    {
      key: 'release-decision',
      placement: 'decision',
      title: 'リリース判断に必要な情報',
      guidance:
        'リリース可否の判断に必要な未解決項目、リリース前に完了が必要な作業、' +
        '暫定的な運用回避策（文書に記載がある場合のみ）を記述する。',
      queries: ['リリース判断 出荷条件 リリース前提 暫定対策 回避策'],
    },
  ],
  architect: [
    {
      key: 'architecture-impact',
      placement: 'impact',
      title: 'アーキテクチャへの影響と設計判断事項',
      guidance:
        '未達成の安全目標・未解決の前提が、システム構成・安全機構の配置・インターフェースに' +
        '与える影響と、設計上判断が必要な事項（選択肢とトレードオフ）を記述する。',
      queries: [
        'アーキテクチャ システム構成 安全機構 冗長化 インターフェース',
        '設計判断 トレードオフ 設計変更 設計制約',
      ],
    },
  ],
  'technical-fellows': [
    {
      key: 'technical-validity',
      placement: 'technical',
      title: '技術的妥当性の評価と技術的論点',
      guidance:
        '安全論証（Goal-Strategy-Evidence の連鎖）の技術的妥当性、証拠の強度と限界、' +
        '技術的に議論・判断が必要な論点を記述する。',
      queries: [
        '技術的妥当性 論証の妥当性 証拠の強度 カバレッジ 限界',
        '技術的課題 未解決の論点 レビュー指摘',
      ],
    },
  ],
  'r-and-d': [
    {
      key: 'open-technical-issues',
      placement: 'open-issues',
      title: '未解決の技術課題と追加検証項目',
      guidance:
        '未検証・検証失敗の項目、追加で必要な試験・解析・研究課題、' +
        'その完了予定と担当（文書に記載がある場合のみ）を記述する。',
      queries: [
        '未検証 検証失敗 追加試験 追加解析 再試験 研究課題',
        '完了予定 残作業 検証計画',
      ],
    },
  ],
};

// ============================================================================
// 英語版プリセット
// ============================================================================

const PROFILES_EN: Record<RequirementProfile, StakeholderRequiredSection[]> = {
  executive: [
    {
      key: 'decision-material',
      placement: 'decision',
      title: 'Information Required for Executive Decisions',
      guidance:
        'Describe how the current safety achievement status affects business decisions ' +
        '(shipment, release, further investment, continuation of development), the unresolved items ' +
        'that require an executive decision together with the available options, and any deadlines or ' +
        'preconditions for that decision. Present cost, schedule, and regulatory impacts quantitatively ' +
        'to the extent they are documented.',
      queries: [
        'shipment decision release approval executive decision',
        'cost schedule delay business impact regulatory compliance',
      ],
    },
    {
      key: 'residual-risk-acceptance',
      placement: 'risk',
      title: 'Residual Risk and Acceptance Decision',
      guidance:
        'Describe the residual risks (content, severity, likelihood), their current acceptance status ' +
        '(accepted / not accepted / pending decision), and the conditions, approvals, or additional ' +
        'measures required for acceptance.',
      queries: ['residual risk risk acceptance approval acceptance criteria'],
    },
  ],
  business: [
    {
      key: 'business-impact',
      placement: 'impact',
      title: 'Business, Cost, and Schedule Impact',
      guidance:
        'Describe how unmet safety objectives and open issues affect the business plan (cost, schedule, ' +
        'time to market, customer commitments), citing the figures and dates stated in the documents.',
      queries: [
        'cost budget schedule deadline time to market business plan',
        'customer impact contract regulation certification business risk',
      ],
    },
    {
      key: 'resource-decision',
      placement: 'decision',
      title: 'Information Required for Investment and Resource Decisions',
      guidance:
        'Describe the additional resources or investment needed to complete the remaining work and the ' +
        'decisions to be made with their options, to the extent documented. Where nothing is documented, ' +
        'state explicitly that the information is missing.',
      queries: ['additional resources effort investment staffing remaining work completion forecast'],
    },
  ],
  product: [
    {
      key: 'product-user-impact',
      placement: 'impact',
      title: 'Impact on Product and Users',
      guidance:
        'Describe how unmet safety goals and residual hazards affect product specifications, functional ' +
        'limitations, and user-facing operation (usage conditions, cautions).',
      queries: [
        'product specification functional limitation usage conditions operational constraints user impact',
        'customer impact field issue precautions for use',
      ],
    },
    {
      key: 'release-decision',
      placement: 'decision',
      title: 'Information Required for the Release Decision',
      guidance:
        'Describe the unresolved items relevant to the release decision, the work that must be completed ' +
        'before release, and any interim workarounds (only where documented).',
      queries: ['release decision shipment criteria release prerequisites interim measure workaround'],
    },
  ],
  architect: [
    {
      key: 'architecture-impact',
      placement: 'impact',
      title: 'Architectural Impact and Design Decisions',
      guidance:
        'Describe how unmet safety goals and unresolved assumptions affect the system structure, the ' +
        'placement of safety mechanisms, and interfaces, together with the design decisions that must be ' +
        'made (options and trade-offs).',
      queries: [
        'architecture system structure safety mechanism redundancy interface',
        'design decision trade-off design change design constraint',
      ],
    },
  ],
  'technical-fellows': [
    {
      key: 'technical-validity',
      placement: 'technical',
      title: 'Technical Validity Assessment and Open Technical Questions',
      guidance:
        'Describe the technical validity of the safety argument (the Goal-Strategy-Evidence chain), the ' +
        'strength and limits of the evidence, and the technical questions that require discussion or a decision.',
      queries: [
        'technical validity soundness of argument strength of evidence coverage limitations',
        'technical issues open questions review findings',
      ],
    },
  ],
  'r-and-d': [
    {
      key: 'open-technical-issues',
      placement: 'open-issues',
      title: 'Open Technical Issues and Additional Verification',
      guidance:
        'Describe unverified items and failed verifications, the additional tests, analyses, or research ' +
        'tasks required, and their target dates and owners (only where documented).',
      queries: [
        'unverified verification failure additional test additional analysis retest research task',
        'target date remaining work verification plan',
      ],
    },
  ],
};

// ============================================================================
// プロファイル判定
// ============================================================================

/**
 * ステークホルダーIDから要件プリセットを決定する。
 * プリセット外（カスタムステークホルダー）は役職名・関心事のキーワードで推定し、
 * 該当しない場合は null（汎用セクションを生成する）。
 */
function resolveProfile(stakeholder: Stakeholder): RequirementProfile | null {
  switch (stakeholder.id) {
    case 'cxo':
      return 'executive';
    case 'business':
      return 'business';
    case 'product':
      return 'product';
    case 'architect':
      return 'architect';
    case 'technical-fellows':
      return 'technical-fellows';
    case 'r-and-d':
      return 'r-and-d';
  }

  const text = `${stakeholder.id} ${stakeholder.role} ${(stakeholder.concerns || []).join(' ')}`.toLowerCase();

  const matches = (keywords: string[]): boolean => keywords.some(k => text.includes(k));

  if (matches(['cxo', 'ceo', 'cto', 'coo', 'cfo', 'executive', 'board', '経営', '役員', '社長', '取締役'])) {
    return 'executive';
  }
  if (matches(['business', 'finance', 'sales', 'marketing', '事業', '営業', '財務', 'コスト', '投資'])) {
    return 'business';
  }
  if (matches(['product', 'pm', 'project-manager', '製品', 'プロダクト', 'リリース', '企画'])) {
    return 'product';
  }
  if (matches(['architect', 'architecture', 'アーキテクト', 'アーキテクチャ', '設計'])) {
    return 'architect';
  }
  if (matches(['research', 'r&d', 'r-and-d', 'r_and_d', '研究', '検証', 'qa', '品質'])) {
    return 'r-and-d';
  }
  if (matches(['tech', 'engineer', 'fellow', '技術', 'エンジニア', '開発'])) {
    return 'technical-fellows';
  }

  return null;
}

/**
 * プリセットに当てはまらないステークホルダー向けの汎用必須セクション。
 * 関心事（concerns）をそのまま記述必須内容として利用する。
 */
function buildGenericSection(
  stakeholder: Stakeholder,
  language: 'ja' | 'en'
): StakeholderRequiredSection[] {
  const concerns = (stakeholder.concerns || []).filter(c => c.trim().length > 0).slice(0, 5);
  if (concerns.length === 0) return [];

  if (language === 'en') {
    return [
      {
        key: 'reader-decision-material',
        placement: 'decision',
        title: 'Information Required for the Reader\'s Decisions',
        guidance:
          `Describe the safety status in terms of this reader's primary concerns ` +
          `(${concerns.join(', ')}), covering the items that require their decision and the options available, ` +
          `using only what the documents state.`,
        queries: concerns.slice(0, 2),
      },
    ];
  }

  return [
    {
      key: 'reader-decision-material',
      placement: 'decision',
      title: '読者の判断に必要な情報',
      guidance:
        `この読者の主要な関心事（${concerns.join('、')}）の観点から安全性の状況を整理し、` +
        '読者が判断を下す必要がある事項とその選択肢を、文書に記載のある事実のみで記述する。',
      queries: concerns.slice(0, 2),
    },
  ];
}

// ============================================================================
// 公開API
// ============================================================================

/**
 * ステークホルダーに必須の見出し（GSN由来アウトラインに欠落する判断材料）を返す。
 * GSNファイルがある場合のみ使用する（GSNがなければ静的テンプレートが既に判断材料を含む）。
 */
export function getStakeholderRequiredSections(
  stakeholder: Stakeholder,
  language: 'ja' | 'en' = 'ja'
): StakeholderRequiredSection[] {
  const profile = resolveProfile(stakeholder);
  if (profile === null) {
    return buildGenericSection(stakeholder, language);
  }
  const profiles = language === 'en' ? PROFILES_EN : PROFILES_JA;
  return profiles[profile];
}

/** 必須セクションからRAG検索用クエリを取り出す（重複除去） */
export function getRequiredSectionQueries(
  sections: StakeholderRequiredSection[]
): string[] {
  return [...new Set(sections.flatMap(s => s.queries))].filter(q => q.trim().length > 0);
}

/** 必須セクションの見出しラベル一覧 */
export function getRequiredSectionTitles(
  sections: StakeholderRequiredSection[]
): string[] {
  return sections.map(s => s.title);
}

/**
 * 必須セクションを「見出し: 記述必須内容」形式に整形する（プロンプト埋め込み用）。
 */
export function formatRequiredSectionsForPrompt(
  sections: StakeholderRequiredSection[]
): string {
  return sections.map(s => `- **${s.title}**: ${s.guidance}`).join('\n');
}

// ============================================================================
// テンプレート見出しへの割り当て
// ============================================================================

/**
 * placement ごとの、配置先として望ましいテンプレート見出しのキーワード（優先度順・日英混在）。
 * 前のグループほど優先して一致を探す。
 */
const PLACEMENT_KEYWORDS: Record<RequirementPlacement, string[][]> = {
  decision: [
    ['推奨', '次のステップ', 'アクション', '提案する方向性', 'recommend', 'next step', 'action'],
    ['実装計画', '管理計画', '今後の見通し', 'implementation plan', 'management plan', 'outlook'],
    ['現状分析', '現在の状況', 'インサイト', 'current state', 'current situation', 'insight'],
  ],
  risk: [
    ['残存リスク', 'residual risk'],
    ['リスク評価', 'リスクサマリー', 'リスク詳細', 'リスク軽減',
     'risk assessment', 'risk summary', 'detailed risk', 'risk mitigation'],
    ['リスク', 'risk'],
    ['問題と影響', '主要な課題', 'problem and impact', 'key challenge'],
  ],
  impact: [
    ['問題と影響', '影響', 'impact'],
    ['現状分析', '現在の状況', 'データ概要', '分析結果',
     'current state', 'current situation', 'data overview', 'analysis result'],
    ['アーキテクチャ', 'システム構成', 'architecture', 'system structure'],
    ['技術概要', 'technical overview'],
    ['リスク', 'risk'],
  ],
  technical: [
    ['技術概要', '技術的', 'technical'],
    ['分析結果', '根本原因', 'goal-strategy', 'gsn', 'analysis'],
    ['テスト結果', '品質指標', 'test result', 'quality metric'],
    ['現状分析', '現在の状況', 'current state', 'current situation'],
  ],
  'open-issues': [
    ['残課題', '未達成', '主要な課題', 'remaining issue', 'unachieved', 'key challenge'],
    ['技術的リスク', 'リスクと対策', 'technical risk', 'risks and mitigation'],
    ['テスト結果', '品質指標', 'test result', 'quality metric'],
    ['リスク', 'risk'],
    ['推奨', '次のステップ', 'recommend', 'next step'],
  ],
};

/** どの placement でも一致しなかった場合の最終フォールバック（優先度順） */
const FALLBACK_KEYWORDS: string[][] = [
  ['リスク', 'risk'],
  ['現状分析', '現在の状況', 'current state', 'current situation'],
  ['推奨', '次のステップ', 'recommend', 'next step', 'action'],
];

/** 割り当て対象から除外する見出し（要約・付録は判断材料の置き場にしない） */
const EXCLUDED_SECTION_KEYWORDS = [
  'エグゼクティブサマリー', 'executive summary', '付録', 'appendix', '用語集', 'glossary',
];

function isExcludedSection(section: string): boolean {
  const lower = section.toLowerCase();
  return EXCLUDED_SECTION_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

function findSectionByKeywordGroups(
  sections: string[],
  keywordGroups: string[][]
): string | null {
  for (const group of keywordGroups) {
    const hit = sections.find(section => {
      const lower = section.toLowerCase();
      return group.some(k => lower.includes(k.toLowerCase()));
    });
    if (hit) return hit;
  }
  return null;
}

/** 必須内容の配置先（テンプレート見出し1つ ＋ そこに書かせる必須項目群） */
export interface RequiredSectionPlacement {
  /** 配置先のテンプレート見出し（targetSections のいずれか、そのままの文字列） */
  sectionTitle: string;
  /** その見出しの本文に含めさせる必須項目 */
  requirements: StakeholderRequiredSection[];
}

/**
 * 必須内容を、既存のテンプレート見出し（2パス目の目標構成）へ割り当てる。
 *
 * 従来は目標構成へ必須見出しを新規挿入していたが、それではステークホルダーごとに
 * 設定されたレポート構成が崩れる。ここでは構成を一切変更せず、
 * 「どの既存見出しの中に何を書くか」の対応表だけを作る。
 *
 * 割り当て順序: placement のキーワード群 → 汎用フォールバック → 除外対象以外の最後の見出し
 * （それも無ければ先頭の見出し）。必ずいずれかの見出しに割り当てられ、内容が落ちることはない。
 */
export function mapRequiredSectionsToTemplate(
  sections: string[],
  requiredSections: StakeholderRequiredSection[]
): RequiredSectionPlacement[] {
  if (sections.length === 0 || requiredSections.length === 0) return [];

  // 要約・付録は避けるが、それしか無い構成では已むを得ず使う
  const assignable = sections.filter(s => !isExcludedSection(s));
  const pool = assignable.length > 0 ? assignable : sections;

  const placements: RequiredSectionPlacement[] = [];

  for (const requirement of requiredSections) {
    const target =
      findSectionByKeywordGroups(pool, PLACEMENT_KEYWORDS[requirement.placement]) ??
      findSectionByKeywordGroups(pool, FALLBACK_KEYWORDS) ??
      pool[pool.length - 1];

    const existing = placements.find(p => p.sectionTitle === target);
    if (existing) {
      existing.requirements.push(requirement);
    } else {
      placements.push({ sectionTitle: target, requirements: [requirement] });
    }
  }

  // 目標構成に現れる順に並べる（プロンプト内の記述順を構成順と一致させる）
  placements.sort(
    (a, b) => sections.indexOf(a.sectionTitle) - sections.indexOf(b.sectionTitle)
  );

  return placements;
}

/**
 * 配置先つき必須内容を「見出し → その中に書く項目」形式に整形する（2パス目プロンプト用）。
 */
export function formatRequiredPlacementsForPrompt(
  placements: RequiredSectionPlacement[],
  language: 'ja' | 'en' = 'ja'
): string {
  return placements
    .map(placement => {
      const items = placement.requirements
        .map(r => `  - ${r.title}: ${r.guidance}`)
        .join('\n');
      return language === 'en'
        ? `- Inside "${placement.sectionTitle}":\n${items}`
        : `- 「${placement.sectionTitle}」の中に:\n${items}`;
    })
    .join('\n');
}
