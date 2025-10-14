// src/lib/report-structures.ts

import { ReportStructureTemplate, UploadedFile, Stakeholder } from '@/types';

export enum RhetoricStrategy {
  DATA_DRIVEN = 'データ駆動型説得法',
  EMOTIONAL_APPEAL = '感情訴求型',
  LOGICAL_REASONING = '論理的推論型',
  AUTHORITY_BASED = '権威依拠型',
  PROBLEM_SOLUTION = '問題解決型',
  NARRATIVE = 'ナラティブ型'
}

export const DEFAULT_REPORT_STRUCTURES: ReportStructureTemplate[] = [
  {
    id: 'executive',
    name: '経営向けレポート',
    description: 'ビジネス影響と意思決定に焦点',
    sections: [
      'エグゼクティブサマリー',
      '現状分析',
      'リスク評価',
      '推奨事項',
      '次のステップ'
    ],
    gsnSections: [
      'GSN目標達成状況サマリー',
      '主要リスク制御戦略'
    ],
    recommendedFor: ['cxo', 'business']
  },
  {
    id: 'technical-detailed',
    name: '技術詳細レポート',
    description: '技術的根拠と実装詳細を重視',
    sections: [
      'エグゼクティブサマリー',
      '技術概要',
      'システムアーキテクチャ',
      '実装詳細',
      'テスト結果と品質指標',
      '技術的リスクと対策',
      '今後の改善提案'
    ],
    gsnSections: [
      'GSN構造分析',
      'Goal-Strategy-Evidence対応表',
      '技術的ギャップ分析'
    ],
    recommendedFor: ['technical-fellows', 'architect', 'r-and-d']
  },
  {
    id: 'data-driven',
    name: 'データ駆動型レポート',
    description: '定量的分析と測定可能な成果',
    sections: [
      'エグゼクティブサマリー',
      'データ概要',
      '分析結果',
      'インサイト',
      '推奨事項',
      '実装計画'
    ],
    gsnSections: [
      'Evidence定量評価',
      'KPI達成度マトリクス'
    ],
    recommendedFor: ['cxo', 'business', 'finance', 'sales']
  },
  {
    id: 'problem-solving',
    name: '問題解決型レポート',
    description: '課題の根本原因と解決策',
    sections: [
      'エグゼクティブサマリー',
      '問題の定義',
      '根本原因分析',
      '解決策の提案',
      '実装ロードマップ',
      '期待される成果'
    ],
    gsnSections: [
      '未達成Goal分析',
      '対策Strategy提案'
    ],
    recommendedFor: ['product', 'risk-manager', 'qa', 'operations']
  },
  {
    id: 'narrative',
    name: 'ナラティブ型レポート',
    description: 'ストーリー形式での経緯説明',
    sections: [
      'エグゼクティブサマリー',
      'プロジェクトの経緯',
      '現在の状況',
      '主要な課題',
      '提案する方向性',
      'アクションプラン'
    ],
    gsnSections: [
      'GSN開発の経緯',
      '段階的Goal達成状況'
    ],
    recommendedFor: ['project-manager', 'marketing', 'hr']
  },
  {
    id: 'risk-focused',
    name: 'リスク重視レポート',
    description: 'リスク識別と軽減戦略',
    sections: [
      'エグゼクティブサマリー',
      'リスクサマリー',
      'リスク詳細分析',
      'リスク軽減策',
      '残存リスクの評価',
      'リスク管理計画'
    ],
    gsnSections: [
      'GSNコンテキスト分析',
      '未解決Assumptionリスト'
    ],
    recommendedFor: ['risk-manager', 'security', 'compliance', 'legal']
  }
];

export function getRecommendedStructure(
  stakeholder: Stakeholder,
  strategy: RhetoricStrategy,
  files: UploadedFile[]
): ReportStructureTemplate {
  
  // 1. レトリック戦略に基づく構成選択
  const strategyMap: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: 'data-driven',
    [RhetoricStrategy.PROBLEM_SOLUTION]: 'problem-solving',
    [RhetoricStrategy.NARRATIVE]: 'narrative',
    [RhetoricStrategy.LOGICAL_REASONING]: 'technical-detailed',
    [RhetoricStrategy.AUTHORITY_BASED]: 'technical-detailed',
    [RhetoricStrategy.EMOTIONAL_APPEAL]: 'narrative'
  };
  
  const strategyBasedId = strategyMap[strategy];
  let selectedStructure = DEFAULT_REPORT_STRUCTURES.find(s => s.id === strategyBasedId);
  
  // 2. ステークホルダー推奨構成のチェック
  const recommendedStructure = DEFAULT_REPORT_STRUCTURES.find(s =>
    s.recommendedFor?.includes(stakeholder.id)
  );
  
  // 3. リスク関連キーワードが多い場合
  const riskMentions = files.reduce((count, f) => {
    const riskCount = (f.content.match(/リスク|risk|危険|hazard/gi) || []).length;
    return count + riskCount;
  }, 0);
  
  if (riskMentions > 20) {
    const riskStructure = DEFAULT_REPORT_STRUCTURES.find(s => s.id === 'risk-focused');
    if (riskStructure) selectedStructure = riskStructure;
  }
  
  // 4. 優先順位: ステークホルダー推奨 > レトリック戦略ベース
  return recommendedStructure || selectedStructure || DEFAULT_REPORT_STRUCTURES[0];
}

export function getSimpleRecommendedStructure(
  stakeholderId: string,
  files: { name: string; type: string; metadata?: any }[] = []
): ReportStructureTemplate {
  // GSNファイルチェック
  const hasGSNFile = files.some(f => 
    f.type === 'gsn' || f.name.toLowerCase().includes('gsn') || f.metadata?.isGSN
  );
  
  // ステークホルダーIDに基づいて推奨構成を検索
  const recommended = DEFAULT_REPORT_STRUCTURES.find(structure =>
    structure.recommendedFor?.includes(stakeholderId)
  );
  
  if (recommended) {
    return recommended;
  }
  
  // カスタムステークホルダーの場合、キーワードで判定
  if (stakeholderId.startsWith('custom_')) {
    // リスク関連
    if (stakeholderId.toLowerCase().includes('risk') || 
        stakeholderId.toLowerCase().includes('security') ||
        stakeholderId.toLowerCase().includes('qa')) {
      const riskStructure = DEFAULT_REPORT_STRUCTURES.find(s => s.id === 'risk-focused');
      if (riskStructure) return riskStructure;
    }
    
    // 技術関連
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

export function buildFinalReportStructure(
  baseStructure: ReportStructureTemplate,
  files: UploadedFile[]
): string[] {
  const hasGSN = files.some(f => f.type === 'gsn' || f.metadata?.isGSN);
  
  if (!hasGSN) {
    return baseStructure.sections;
  }
  
  // GSNファイルがある場合、適切な位置にGSNセクションを挿入
  const finalSections = [...baseStructure.sections];
  const gsnSections = baseStructure.gsnSections || [];
  
  // エグゼクティブサマリーの後にGSN概要を挿入
  if (gsnSections.length > 0) {
    finalSections.splice(1, 0, gsnSections[0]);
  }
  
  // 技術系レポートの場合は詳細分析を中間に挿入
  if (baseStructure.id === 'technical-detailed' && gsnSections.length > 1) {
    finalSections.splice(4, 0, ...gsnSections.slice(1));
  } else if (gsnSections.length > 1) {
    // その他のレポートは分析結果の後に挿入
    finalSections.splice(3, 0, ...gsnSections.slice(1));
  }
  
  return finalSections;
}