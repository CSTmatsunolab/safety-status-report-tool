// src/lib/rhetoric-strategies.ts

import { Stakeholder } from '../types';

export enum RhetoricStrategy {
  DATA_DRIVEN = 'データ駆動型説得法',
  EMOTIONAL_APPEAL = '感情訴求型',
  LOGICAL_REASONING = '論理的推論型',
  AUTHORITY_BASED = '権威依拠型',
  PROBLEM_SOLUTION = '問題解決型',
  NARRATIVE = 'ナラティブ型'
}

/**
 * ステークホルダーに基づいて高度なレトリック戦略を決定
 */
export function determineAdvancedRhetoricStrategy(stakeholder: Stakeholder): RhetoricStrategy {
  const role = stakeholder.role.toLowerCase();
  const concerns = stakeholder.concerns.join(' ').toLowerCase();
  
  // IDベースの判定を優先
  switch(stakeholder.id) {
    case 'technical-fellows':
    case 'architect':
      return RhetoricStrategy.LOGICAL_REASONING;
    case 'r-and-d':
      return RhetoricStrategy.AUTHORITY_BASED;
    case 'cxo':
    case 'business':
    case 'product':
      return RhetoricStrategy.DATA_DRIVEN;
  }
  
  // カスタムステークホルダー用の判定
  if (role.includes('技術') || role.includes('エンジニア') || role.includes('開発') ||
      role.includes('technical') || role.includes('engineer') || role.includes('development')) {
    return RhetoricStrategy.LOGICAL_REASONING;
  } else if (role.includes('営業') || role.includes('マーケティング') ||
             role.includes('sales') || role.includes('marketing')) {
    return RhetoricStrategy.EMOTIONAL_APPEAL;
  } else if (concerns.includes('リスク') || concerns.includes('安全') ||
             concerns.includes('risk') || concerns.includes('safety')) {
    return RhetoricStrategy.PROBLEM_SOLUTION;
  } else if (role.includes('プロジェクト') || role.includes('pm') ||
             role.includes('project')) {
    return RhetoricStrategy.NARRATIVE;
  }
  
  // デフォルトはデータ駆動型
  return RhetoricStrategy.DATA_DRIVEN;
}

/**
 * レトリック戦略の表示名を取得（言語対応）
 */
export function getRhetoricStrategyDisplayName(
  strategy: RhetoricStrategy, 
  stakeholder: Stakeholder,
  language: 'ja' | 'en' = 'ja'
): string {
  // 日本語の表示名
  const displayNameMapJA: { [key: string]: string } = {
    'technical-fellows': '技術的卓越性重視型',
    'architect': 'システム設計重視型',
    'r-and-d': '技術的詳細重視型',
    'cxo': '戦略的価値重視型',
    'business': 'ビジネスインパクト重視型',
    'product': '製品価値訴求型'
  };

  // 英語の表示名
  const displayNameMapEN: { [key: string]: string } = {
    'technical-fellows': 'Technical Excellence Focus',
    'architect': 'System Design Focus',
    'r-and-d': 'Technical Detail Focus',
    'cxo': 'Strategic Value Focus',
    'business': 'Business Impact Focus',
    'product': 'Product Value Appeal'
  };

  const displayNameMap = language === 'en' ? displayNameMapEN : displayNameMapJA;
  
  // カスタムステークホルダー用の細かい戦略名
  if (stakeholder.id.startsWith('custom_')) {
    const role = stakeholder.role.toLowerCase();
    
    if (language === 'en') {
      if (role.includes('品質') || role.includes('qa') || role.includes('quality')) return 'Quality Focus';
      if (role.includes('財務') || role.includes('経理') || role.includes('finance')) return 'Financial Impact Focus';
      if (role.includes('法務') || role.includes('コンプライアンス') || role.includes('legal') || role.includes('compliance')) return 'Regulatory Compliance Focus';
      if (role.includes('人事') || role.includes('hr') || role.includes('human')) return 'HR & Organization Focus';
      if (role.includes('顧客') || role.includes('カスタマー') || role.includes('customer')) return 'Customer Value Focus';
    } else {
      if (role.includes('品質') || role.includes('qa') || role.includes('quality')) return '品質重視型';
      if (role.includes('財務') || role.includes('経理') || role.includes('finance')) return '財務インパクト重視型';
      if (role.includes('法務') || role.includes('コンプライアンス') || role.includes('legal') || role.includes('compliance')) return '規制・法令遵守重視型';
      if (role.includes('人事') || role.includes('hr') || role.includes('human')) return '人材・組織重視型';
      if (role.includes('顧客') || role.includes('カスタマー') || role.includes('customer')) return '顧客価値重視型';
    }
  }
  
  // デフォルトステークホルダーの場合は事前定義された名前を返す
  if (displayNameMap[stakeholder.id]) {
    return displayNameMap[stakeholder.id];
  }
  
  // それ以外はEnum値の言語対応版を返す
  const strategyNameMapEN: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: 'Data-Driven',
    [RhetoricStrategy.EMOTIONAL_APPEAL]: 'Emotional Appeal',
    [RhetoricStrategy.LOGICAL_REASONING]: 'Logical Reasoning',
    [RhetoricStrategy.AUTHORITY_BASED]: 'Authority-Based',
    [RhetoricStrategy.PROBLEM_SOLUTION]: 'Problem-Solution',
    [RhetoricStrategy.NARRATIVE]: 'Narrative'
  };

  if (language === 'en') {
    return strategyNameMapEN[strategy] || strategy;
  }
  
  return strategy;
}
