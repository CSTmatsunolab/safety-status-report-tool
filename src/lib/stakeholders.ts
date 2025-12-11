import { Stakeholder } from '@/types';

// Predefined stakeholders with IDs (language-independent)
export const PREDEFINED_STAKEHOLDER_IDS = [
  'cxo',
  'technical-fellows',
  'architect',
  'business',
  'product',
  'r-and-d'
] as const;

export type PredefinedStakeholderId = typeof PREDEFINED_STAKEHOLDER_IDS[number];

// Japanese stakeholder definitions
export const PREDEFINED_STAKEHOLDERS_JA: Stakeholder[] = [
  {
    id: 'cxo',
    role: 'CxO / 経営層',
    concerns: [
      '戦略的整合性',
      '企業価値への影響',
      'リスク管理',
      'ステークホルダーへの説明責任'
    ]
  },
  {
    id: 'technical-fellows',
    role: 'Technical Fellows / 技術専門家',
    concerns: [
      '技術的な卓越性',
      'ベストプラクティスの適用',
      '長期的な技術戦略',
      '技術的イノベーション'
    ]
  },
  {
    id: 'architect',
    role: 'Architect / アーキテクト',
    concerns: [
      'システム設計の整合性',
      'スケーラビリティ',
      '技術的負債',
      'アーキテクチャの保守性'
    ]
  },
  {
    id: 'business',
    role: 'Business Division / 事業部門',
    concerns: [
      'ビジネスインパクト',
      'ROIと収益性',
      '市場シェア',
      '事業リスク'
    ]
  },
  {
    id: 'product',
    role: 'Product Division / 製品部門',
    concerns: [
      '製品の品質と安全性',
      '市場競争力',
      'ユーザビリティ',
      '製品化のタイムライン'
    ]
  },
  {
    id: 'r-and-d',
    role: 'R&D Division / 研究開発部門',
    concerns: [
      '技術的な実現可能性',
      '開発リソースの効率性',
      'イノベーションの機会',
      '技術的リスクと課題'
    ]
  }
];

// English stakeholder definitions
export const PREDEFINED_STAKEHOLDERS_EN: Stakeholder[] = [
  {
    id: 'cxo',
    role: 'CxO / Executive',
    concerns: [
      'Strategic alignment',
      'Corporate value impact',
      'Risk management',
      'Stakeholder accountability'
    ]
  },
  {
    id: 'technical-fellows',
    role: 'Technical Fellows',
    concerns: [
      'Technical excellence',
      'Best practice adoption',
      'Long-term tech strategy',
      'Technical innovation'
    ]
  },
  {
    id: 'architect',
    role: 'Architect',
    concerns: [
      'System design integrity',
      'Scalability',
      'Technical debt',
      'Architecture maintainability'
    ]
  },
  {
    id: 'business',
    role: 'Business Division',
    concerns: [
      'Business impact',
      'ROI and profitability',
      'Market share',
      'Business risk'
    ]
  },
  {
    id: 'product',
    role: 'Product Division',
    concerns: [
      'Product quality and safety',
      'Market competitiveness',
      'Usability',
      'Product launch timeline'
    ]
  },
  {
    id: 'r-and-d',
    role: 'R&D Division',
    concerns: [
      'Technical feasibility',
      'Development resource efficiency',
      'Innovation opportunities',
      'Technical risks and challenges'
    ]
  }
];

// Get stakeholders by language
export function getPredefinedStakeholders(language: 'ja' | 'en' = 'ja'): Stakeholder[] {
  return language === 'en' ? PREDEFINED_STAKEHOLDERS_EN : PREDEFINED_STAKEHOLDERS_JA;
}

// For backward compatibility
export const PREDEFINED_STAKEHOLDERS = PREDEFINED_STAKEHOLDERS_JA;