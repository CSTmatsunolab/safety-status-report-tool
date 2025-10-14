// src/lib/rhetoric-strategies.ts

import { Stakeholder } from '@/types';
import { RhetoricStrategy } from './report-structures';

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
  if (role.includes('技術') || role.includes('エンジニア') || role.includes('開発')) {
    return RhetoricStrategy.LOGICAL_REASONING;
  } else if (role.includes('営業') || role.includes('マーケティング')) {
    return RhetoricStrategy.EMOTIONAL_APPEAL;
  } else if (concerns.includes('リスク') || concerns.includes('安全')) {
    return RhetoricStrategy.PROBLEM_SOLUTION;
  } else if (role.includes('プロジェクト') || role.includes('pm')) {
    return RhetoricStrategy.NARRATIVE;
  }
  
  // デフォルトはデータ駆動型
  return RhetoricStrategy.DATA_DRIVEN;
}

/**
 * レトリック戦略の表示名を取得
 */
export function getRhetoricStrategyDisplayName(
  strategy: RhetoricStrategy, 
  stakeholder: Stakeholder
): string {
  // デフォルトステークホルダー用の表示名
  const displayNameMap: { [key: string]: string } = {
    'technical-fellows': '技術的卓越性重視型',
    'architect': 'システム設計重視型',
    'r-and-d': '技術的詳細重視型',
    'cxo': '戦略的価値重視型',
    'business': 'ビジネスインパクト重視型',
    'product': '製品価値訴求型'
  };
  
  // カスタムステークホルダー用の細かい戦略名
  if (stakeholder.id.startsWith('custom_')) {
    const role = stakeholder.role.toLowerCase();
    if (role.includes('品質') || role.includes('qa')) return '品質重視型';
    if (role.includes('財務') || role.includes('経理')) return '財務インパクト重視型';
    if (role.includes('法務') || role.includes('コンプライアンス')) return '規制・法令遵守重視型';
    if (role.includes('人事') || role.includes('hr')) return '人材・組織重視型';
    if (role.includes('顧客') || role.includes('カスタマー')) return '顧客価値重視型';
  }
  
  // デフォルトステークホルダーの場合は事前定義された名前を返す
  if (displayNameMap[stakeholder.id]) {
    return displayNameMap[stakeholder.id];
  }
  
  // それ以外はEnum値をそのまま使用
  return strategy;
}

/**
 * 戦略に応じたレポート構成を決定
 */
export function determineReportStructure(
  stakeholder: Stakeholder,
  strategy: RhetoricStrategy
): string[] {
  // 戦略に応じて構成を調整
  switch (strategy) {
    case RhetoricStrategy.DATA_DRIVEN:
      return [
        'エグゼクティブサマリー',
        'データ概要',
        '分析結果',
        'インサイト',
        '推奨事項',
        '実装計画'
      ];
      
    case RhetoricStrategy.PROBLEM_SOLUTION:
      return [
        'エグゼクティブサマリー',
        '問題の定義',
        '根本原因分析',
        '解決策の提案',
        '実装ロードマップ',
        '期待される成果'
      ];
      
    case RhetoricStrategy.NARRATIVE:
      return [
        'エグゼクティブサマリー',
        'プロジェクトの経緯',
        '現在の状況',
        '主要な課題',
        '提案する方向性',
        'アクションプラン'
      ];
      
    default:
      return [
        'エグゼクティブサマリー',
        '現状分析',
        'リスク評価',
        '推奨事項',
        '次のステップ'
      ];
  }
}