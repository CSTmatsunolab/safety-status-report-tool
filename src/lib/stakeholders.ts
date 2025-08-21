import { Stakeholder } from '@/types';

export const PREDEFINED_STAKEHOLDERS: Stakeholder[] = [
  {
    id: 'r-and-d',
    role: 'R&D Division / 研究開発部門',
    concerns: [
      '技術的な実現可能性',
      '開発リソースの効率性',
      'イノベーションの機会',
      '技術的リスクと課題'
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
    id: 'cxo',
    role: 'CxO / 経営層',
    concerns: [
      '戦略的整合性',
      '企業価値への影響',
      'リスク管理',
      'ステークホルダーへの説明責任'
    ]
  }
];