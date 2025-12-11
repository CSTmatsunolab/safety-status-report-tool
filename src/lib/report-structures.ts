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

// 日本語版レポート構成
export const DEFAULT_REPORT_STRUCTURES_JA: ReportStructureTemplate[] = [
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

// 英語版レポート構成
export const DEFAULT_REPORT_STRUCTURES_EN: ReportStructureTemplate[] = [
  {
    id: 'executive',
    name: 'Executive Report',
    description: 'Focus on business impact and decision-making',
    sections: [
      'Executive Summary',
      'Current State Analysis',
      'Risk Assessment',
      'Recommendations',
      'Next Steps'
    ],
    gsnSections: [
      'GSN Goal Achievement Summary',
      'Key Risk Control Strategies'
    ],
    recommendedFor: ['cxo', 'business']
  },
  {
    id: 'technical-detailed',
    name: 'Technical Detailed Report',
    description: 'Emphasis on technical rationale and implementation details',
    sections: [
      'Executive Summary',
      'Technical Overview',
      'System Architecture',
      'Implementation Details',
      'Test Results and Quality Metrics',
      'Technical Risks and Mitigations',
      'Future Improvement Proposals'
    ],
    gsnSections: [
      'GSN Structure Analysis',
      'Goal-Strategy-Evidence Mapping',
      'Technical Gap Analysis'
    ],
    recommendedFor: ['technical-fellows', 'architect', 'r-and-d']
  },
  {
    id: 'data-driven',
    name: 'Data-Driven Report',
    description: 'Quantitative analysis and measurable outcomes',
    sections: [
      'Executive Summary',
      'Data Overview',
      'Analysis Results',
      'Insights',
      'Recommendations',
      'Implementation Plan'
    ],
    gsnSections: [
      'Evidence Quantitative Evaluation',
      'KPI Achievement Matrix'
    ],
    recommendedFor: ['cxo', 'business', 'finance', 'sales']
  },
  {
    id: 'problem-solving',
    name: 'Problem-Solving Report',
    description: 'Root cause analysis and solutions',
    sections: [
      'Executive Summary',
      'Problem Definition',
      'Root Cause Analysis',
      'Proposed Solutions',
      'Implementation Roadmap',
      'Expected Outcomes'
    ],
    gsnSections: [
      'Unmet Goal Analysis',
      'Mitigation Strategy Proposals'
    ],
    recommendedFor: ['product', 'risk-manager', 'qa', 'operations']
  },
  {
    id: 'narrative',
    name: 'Narrative Report',
    description: 'Story-format progress explanation',
    sections: [
      'Executive Summary',
      'Project History',
      'Current Situation',
      'Key Challenges',
      'Proposed Direction',
      'Action Plan'
    ],
    gsnSections: [
      'GSN Development History',
      'Phased Goal Achievement Status'
    ],
    recommendedFor: ['project-manager', 'marketing', 'hr']
  },
  {
    id: 'risk-focused',
    name: 'Risk-Focused Report',
    description: 'Risk identification and mitigation strategies',
    sections: [
      'Executive Summary',
      'Risk Summary',
      'Detailed Risk Analysis',
      'Risk Mitigation Measures',
      'Residual Risk Assessment',
      'Risk Management Plan'
    ],
    gsnSections: [
      'GSN Context Analysis',
      'Unresolved Assumptions List'
    ],
    recommendedFor: ['risk-manager', 'security', 'compliance', 'legal']
  }
];

// 言語に応じたレポート構成を取得する関数
export function getDefaultReportStructures(language: 'ja' | 'en' = 'ja'): ReportStructureTemplate[] {
  return language === 'en' ? DEFAULT_REPORT_STRUCTURES_EN : DEFAULT_REPORT_STRUCTURES_JA;
}

// 後方互換性のため、日本語版をデフォルトとしてエクスポート
export const DEFAULT_REPORT_STRUCTURES = DEFAULT_REPORT_STRUCTURES_JA;

export function getRecommendedStructure(
  stakeholder: Stakeholder,
  strategy: RhetoricStrategy,
  files: UploadedFile[],
  language: 'ja' | 'en' = 'ja'
): ReportStructureTemplate {
  const structures = getDefaultReportStructures(language);
  
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
  let selectedStructure = structures.find(s => s.id === strategyBasedId);
  
  // 2. ステークホルダー推奨構成のチェック
  const recommendedStructure = structures.find(s =>
    s.recommendedFor?.includes(stakeholder.id)
  );
  
  // 3. リスク関連キーワードが多い場合
  const riskMentions = files.reduce((count, f) => {
    const riskCount = (f.content.match(/リスク|risk|危険|hazard/gi) || []).length;
    return count + riskCount;
  }, 0);
  
  if (riskMentions > 20) {
    const riskStructure = structures.find(s => s.id === 'risk-focused');
    if (riskStructure) selectedStructure = riskStructure;
  }
  
  // 4. 優先順位: ステークホルダー推奨 > レトリック戦略ベース
  return recommendedStructure || selectedStructure || structures[0];
}

export function getSimpleRecommendedStructure(
  stakeholder: Stakeholder,
  language: 'ja' | 'en' = 'ja'
): ReportStructureTemplate {
  const structures = getDefaultReportStructures(language);
  const stakeholderId = stakeholder.id;
  const stakeholderRole = stakeholder.role;

  // ステークホルダーIDに基づいて推奨構成を検索
  const recommended = structures.find(structure =>
    structure.recommendedFor?.includes(stakeholderId)
  );
  
  if (recommended) {
    return recommended;
  }
  
  // カスタムステークホルダーの場合、キーワードで判定
  if (stakeholderId.startsWith('custom_')) {
    const idLower = stakeholderId.toLowerCase();
    const roleLower = stakeholderRole.toLowerCase();

    // リスク関連
    if (idLower.includes('risk') || roleLower.includes('リスク') ||
        idLower.includes('security') || roleLower.includes('セキュリティ') ||
        idLower.includes('qa') || roleLower.includes('品質') ||
        idLower.includes('danger') || roleLower.includes('危険')||
        idLower.includes('hazard') || roleLower.includes('脅威')) {
      const riskStructure = structures.find(s => s.id === 'risk-focused');
      if (riskStructure) return riskStructure;
    }
    
    // 技術関連
    if (idLower.includes('tech') || roleLower.includes('技術') ||
        idLower.includes('engineer') || roleLower.includes('エンジニア') ||
        idLower.includes('dev') || roleLower.includes('開発') ||
        idLower.includes('r-and-d') || roleLower.includes('研究') ||
        idLower.includes('r_and_d')) { 
      const techStructure = structures.find(s => s.id === 'technical-detailed');
      if (techStructure) return techStructure;
    }
  }
  
  // デフォルトは経営向けレポート
  return structures[0];
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