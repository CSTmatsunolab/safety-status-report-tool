// src/lib/report-structures.ts

import { ReportStructureTemplate } from '@/types';

export const DEFAULT_REPORT_STRUCTURES: ReportStructureTemplate[] = [
  {
    id: 'executive',
    name: '経営向けレポート',
    description: 'エグゼクティブサマリー中心の構成',
    sections: [
      'エグゼクティブサマリー',
      '現状分析',
      'リスク評価',
      '推奨事項',
      '次のステップ'
    ],
    recommendedFor: ['cxo', 'business']
  },
  {
    id: 'technical-detailed',
    name: '技術詳細レポート',
    description: '技術的な詳細を重視した構成',
    sections: [
      'エグゼクティブサマリー',
      '技術概要',
      'システムアーキテクチャ',
      '実装詳細',
      'テスト結果と品質指標',
      '技術的リスクと対策',
      '今後の改善提案'
    ],
    recommendedFor: ['technical-fellows', 'architect', 'r-and-d']
  },
  {
    id: 'problem-solving',
    name: '問題解決型レポート',
    description: '課題と解決策に焦点を当てた構成',
    sections: [
      'エグゼクティブサマリー',
      '問題の定義',
      '根本原因分析',
      '解決策の提案',
      '実装ロードマップ',
      '期待される成果'
    ],
    recommendedFor: ['product']
  },
  {
    id: 'gsn-analysis',
    name: 'GSN分析レポート',
    description: 'GSN構造の詳細分析を含む構成',
    sections: [
      'エグゼクティブサマリー',
      'GSN構造概要',
      'Goal達成状況評価',
      'Strategy妥当性検証',
      'Evidence/Solution分析',
      'ギャップ分析と改善提案',
      '総合評価と次のステップ'
    ],
    recommendedFor: [] // GSNファイルが含まれる場合に推奨
  },
  {
    id: 'risk-focused',
    name: 'リスク重視レポート',
    description: 'リスク分析と対策に特化した構成',
    sections: [
      'エグゼクティブサマリー',
      'リスクサマリー',
      'リスク詳細分析',
      'リスク軽減策',
      '残存リスクの評価',
      'リスク管理計画',
      '推奨アクション'
    ],
    recommendedFor: [] // リスク関連のステークホルダー向け
  }
];

/**
 * ステークホルダーとファイル内容に基づいて推奨構成を取得
 */
export function getRecommendedStructure(
  stakeholderId: string,
  files: { name: string; type: string }[]
): ReportStructureTemplate {
  // GSNファイルが含まれているかチェック
  const hasGSNFile = files.some(f => 
    f.type === 'gsn' || f.name.toLowerCase().includes('gsn')
  );
  
  if (hasGSNFile) {
    const gsnStructure = DEFAULT_REPORT_STRUCTURES.find(s => s.id === 'gsn-analysis');
    if (gsnStructure) return gsnStructure;
  }
  
  // ステークホルダーIDに基づいて推奨構成を検索
  const recommended = DEFAULT_REPORT_STRUCTURES.find(structure =>
    structure.recommendedFor?.includes(stakeholderId)
  );
  
  if (recommended) {
    return recommended;
  }
  
  // カスタムステークホルダーの場合、役職に基づいて推測
  if (stakeholderId.startsWith('custom_')) {
    // リスク関連のキーワードがあるか
    if (stakeholderId.toLowerCase().includes('risk') || 
        stakeholderId.toLowerCase().includes('security') ||
        stakeholderId.toLowerCase().includes('qa')) {
      const riskStructure = DEFAULT_REPORT_STRUCTURES.find(s => s.id === 'risk-focused');
      if (riskStructure) return riskStructure;
    }
    
    // 技術関連のキーワードがあるか
    if (stakeholderId.toLowerCase().includes('tech') || 
        stakeholderId.toLowerCase().includes('engineer') ||
        stakeholderId.toLowerCase().includes('dev')) {
      const techStructure = DEFAULT_REPORT_STRUCTURES.find(s => s.id === 'technical-detailed');
      if (techStructure) return techStructure;
    }
  }
  
  // デフォルトは経営向けレポート
  return DEFAULT_REPORT_STRUCTURES[0];
}