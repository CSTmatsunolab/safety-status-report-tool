// lib/rag/query-enhancer/utils/concern-prioritizer.ts

/**
 * 日本語の重要キーワード
 */
const PRIORITY_KEYWORDS_JA = [
  '安全', 'リスク', '品質', 'コスト', '戦略', 'セキュリティ',
  '課題', '検証', '設計', '要件', '技術', '実装'
];

/**
 * 英語の重要キーワード
 */
const PRIORITY_KEYWORDS_EN = [
  'safety', 'risk', 'quality', 'cost', 'strategy',
  'security', 'compliance', 'performance', 'efficiency'
];

interface ScoredConcern {
  concern: string;
  score: number;
}

/**
 * 懸念事項の優先順位付けを行う
 * @param concerns 懸念事項の配列
 * @param maxCount 返す懸念事項の最大数（デフォルト: 3）
 * @returns 優先順位付けされた懸念事項の配列
 */
export function prioritizeConcerns(concerns: string[], maxCount: number = 3): string[] {
  const scored = concerns.map(concern => {
    const concernLower = concern.toLowerCase();
    let score = 0;
    
    // 日本語キーワードのチェック（スコア2倍）
    score += PRIORITY_KEYWORDS_JA.filter(keyword => 
      concern.includes(keyword)
    ).length * 2;
    
    // 英語キーワードのチェック
    score += PRIORITY_KEYWORDS_EN.filter(keyword => 
      concernLower.includes(keyword)
    ).length;
    
    return { concern, score };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map(item => item.concern);
}

/**
 * 懸念事項のスコアを計算する（デバッグ用）
 * @param concern 懸念事項
 * @returns スコア情報
 */
export function scoreConcern(concern: string): ScoredConcern {
  const concernLower = concern.toLowerCase();
  let score = 0;
  
  score += PRIORITY_KEYWORDS_JA.filter(keyword => 
    concern.includes(keyword)
  ).length * 2;
  
  score += PRIORITY_KEYWORDS_EN.filter(keyword => 
    concernLower.includes(keyword)
  ).length;
  
  return { concern, score };
}

/**
 * 優先キーワードを取得する
 */
export function getPriorityKeywords(): { ja: string[]; en: string[] } {
  return {
    ja: [...PRIORITY_KEYWORDS_JA],
    en: [...PRIORITY_KEYWORDS_EN]
  };
}
