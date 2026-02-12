// src/lib/rhetoric-strategies.ts
// フロントエンド用のレトリック戦略判定ロジック

import { Stakeholder } from '@/types';
import { RhetoricStrategy } from './report-structures';

// re-export for convenience
export { RhetoricStrategy };

/**
 * RhetoricStrategy enum の全値リスト（バリデーション用）
 */
const VALID_RHETORIC_STRATEGIES = Object.values(RhetoricStrategy) as string[];

/**
 * ステークホルダーに基づいて高度なレトリック戦略を決定
 */
export function determineAdvancedRhetoricStrategy(stakeholder: Stakeholder): RhetoricStrategy {
  // ユーザーが明示的に設定している場合はそれを優先
  if (stakeholder.rhetoricStrategy && VALID_RHETORIC_STRATEGIES.includes(stakeholder.rhetoricStrategy)) {
    return stakeholder.rhetoricStrategy as RhetoricStrategy;
  }

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
  
  // 一般向け・非専門家 → ナラティブ型（平易でわかりやすい）
  if (role.includes('一般') || role.includes('全ステークホルダー') || role.includes('非専門') ||
      role.includes('市民') || role.includes('住民') || role.includes('利用者') ||
      role.includes('general') || role.includes('public') || role.includes('non-expert') ||
      role.includes('citizen') || role.includes('resident') || role.includes('user') ||
      role.includes('全員') || role.includes('everyone') || role.includes('all stakeholder')) {
    return RhetoricStrategy.NARRATIVE;
  }
  
  // 技術系 → 論理的推論型
  if (role.includes('技術') || role.includes('エンジニア') || role.includes('開発') ||
      role.includes('technical') || role.includes('engineer') || role.includes('development') ||
      role.includes('アーキテクト') || role.includes('architect') || role.includes('設計')) {
    return RhetoricStrategy.LOGICAL_REASONING;
  }
  
  // 研究・学術系 → 権威依拠型
  if (role.includes('研究') || role.includes('r&d') || role.includes('research') ||
      role.includes('学術') || role.includes('academic') || role.includes('博士') ||
      role.includes('scientist') || role.includes('researcher')) {
    return RhetoricStrategy.AUTHORITY_BASED;
  }
  
  // 営業・マーケティング系 → 感情訴求型
  if (role.includes('営業') || role.includes('マーケティング') ||
      role.includes('sales') || role.includes('marketing') ||
      role.includes('広報') || role.includes('pr') || role.includes('ブランド')) {
    return RhetoricStrategy.EMOTIONAL_APPEAL;
  }
  
  // リスク・品質・セキュリティ系 → 問題解決型
  if (concerns.includes('リスク') || concerns.includes('安全') ||
      concerns.includes('risk') || concerns.includes('safety') ||
      role.includes('品質') || role.includes('qa') || role.includes('quality') ||
      role.includes('セキュリティ') || role.includes('security') ||
      role.includes('監査') || role.includes('audit') || role.includes('コンプライアンス')) {
    return RhetoricStrategy.PROBLEM_SOLUTION;
  }
  
  // プロジェクト管理系 → ナラティブ型
  if (role.includes('プロジェクト') || role.includes('pm') || role.includes('project') ||
      role.includes('企画') || role.includes('planning') || role.includes('調整')) {
    return RhetoricStrategy.NARRATIVE;
  }
  
  // 経営・財務系 → データ駆動型
  if (role.includes('経営') || role.includes('executive') || role.includes('経理') ||
      role.includes('財務') || role.includes('finance') || role.includes('分析') ||
      role.includes('analytics') || role.includes('ceo') || role.includes('cfo')) {
    return RhetoricStrategy.DATA_DRIVEN;
  }
  
  // デフォルトはデータ駆動型
  return RhetoricStrategy.DATA_DRIVEN;
}

/**
 * レトリック戦略の表示名を取得（言語対応）
 * 論文で定義した6種のレトリック戦略名に統一
 */
export function getRhetoricStrategyDisplayName(
  strategy: RhetoricStrategy, 
  stakeholder: Stakeholder,
  language: 'ja' | 'en' = 'ja'
): string {
  // 日本語の表示名（論文の6種に統一）
  const displayNameMapJA: { [key: string]: string } = {
    'technical-fellows': '論理的推論型',
    'architect': '論理的推論型',
    'r-and-d': '権威依拠型',
    'cxo': 'データ駆動型',
    'business': 'データ駆動型',
    'product': 'データ駆動型'
  };

  // 英語の表示名（論文の6種に統一）
  const displayNameMapEN: { [key: string]: string } = {
    'technical-fellows': 'Logical Reasoning',
    'architect': 'Logical Reasoning',
    'r-and-d': 'Authority-Based',
    'cxo': 'Data-Driven',
    'business': 'Data-Driven',
    'product': 'Data-Driven'
  };

  const displayNameMap = language === 'en' ? displayNameMapEN : displayNameMapJA;
  
  // 戦略名のマッピング（日本語）
  const strategyNameMapJA: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: 'データ駆動型',
    [RhetoricStrategy.EMOTIONAL_APPEAL]: '感情訴求型',
    [RhetoricStrategy.LOGICAL_REASONING]: '論理的推論型',
    [RhetoricStrategy.AUTHORITY_BASED]: '権威依拠型',
    [RhetoricStrategy.PROBLEM_SOLUTION]: '問題解決型',
    [RhetoricStrategy.NARRATIVE]: 'ナラティブ型'
  };

  // 戦略名のマッピング（英語）
  const strategyNameMapEN: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: 'Data-Driven',
    [RhetoricStrategy.EMOTIONAL_APPEAL]: 'Emotional Appeal',
    [RhetoricStrategy.LOGICAL_REASONING]: 'Logical Reasoning',
    [RhetoricStrategy.AUTHORITY_BASED]: 'Authority-Based',
    [RhetoricStrategy.PROBLEM_SOLUTION]: 'Problem-Solution',
    [RhetoricStrategy.NARRATIVE]: 'Narrative'
  };

  const strategyNameMap = language === 'en' ? strategyNameMapEN : strategyNameMapJA;

  // カスタムステークホルダー用の判定
  if (stakeholder.id.startsWith('custom_')) {
    // ユーザーが明示的に戦略を設定している場合
    if (stakeholder.rhetoricStrategy && VALID_RHETORIC_STRATEGIES.includes(stakeholder.rhetoricStrategy)) {
      return strategyNameMap[stakeholder.rhetoricStrategy as RhetoricStrategy] || stakeholder.rhetoricStrategy;
    }
    // 自動判定された戦略名を返す
    return strategyNameMap[strategy] || strategy;
  }
  
  // デフォルトステークホルダーの場合は事前定義された名前を返す
  if (displayNameMap[stakeholder.id]) {
    return displayNameMap[stakeholder.id];
  }
  
  // それ以外はEnum値の言語対応版を返す
  return strategyNameMap[strategy] || strategy;
}