// lib/rag/query-enhancer/utils/language-detection.ts

/**
 * 言語タイプ
 */
export type Language = 'ja' | 'en' | 'mixed';

/**
 * テキストの言語を判定する
 * @param text 判定対象のテキスト
 * @returns 'ja' | 'en' | 'mixed'
 */
export function detectLanguage(text: string): Language {
  const hasJapanese = /[ぁ-ん]+|[ァ-ヴー]+|[一-龠]+/.test(text);
  const hasEnglish = /[a-zA-Z]+/.test(text);
  
  if (hasJapanese && hasEnglish) return 'mixed';
  if (hasJapanese) return 'ja';
  return 'en';
}

/**
 * テキストが日本語を含むかどうか判定する
 * @param text 判定対象のテキスト
 * @returns boolean
 */
export function containsJapanese(text: string): boolean {
  return /[ぁ-ん]+|[ァ-ヴー]+|[一-龠]+/.test(text);
}

/**
 * テキストが英語のみかどうか判定する
 * @param text 判定対象のテキスト
 * @returns boolean
 */
export function isEnglishOnly(text: string): boolean {
  return /^[a-zA-Z\s\-\/]+$/.test(text.trim());
}

/**
 * テキストが技術用語かどうか判定する（CI/CD, Kubernetes等）
 * @param text 判定対象のテキスト
 * @returns boolean
 */
export function isTechnicalTerm(text: string): boolean {
  return /^[A-Z\/\-]+$/.test(text) || text.includes('/');
}
