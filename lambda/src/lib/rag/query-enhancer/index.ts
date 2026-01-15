// lib/rag/query-enhancer/index.ts

// Classes
export { QueryEnhancer, QueryEnhancementConfig } from './QueryEnhancer';
export { CustomStakeholderQueryEnhancer } from './CustomStakeholderQueryEnhancer';

// Utils
export { detectLanguage, containsJapanese, isEnglishOnly, isTechnicalTerm } from './utils/language-detection';
export type { Language } from './utils/language-detection';
export { prioritizeConcerns, scoreConcern, getPriorityKeywords } from './utils/concern-prioritizer';

// Dictionaries
export {
  COMMON_ROLE_TRANSLATIONS,
  ROLE_SYNONYMS_JA,
  ROLE_SYNONYMS_EN,
  ROLE_TO_ENGLISH,
  ENGLISH_QUERY_TEMPLATES,
  ROLE_SPECIFIC_TERMS
} from './dictionaries/role-translations';

export {
  CONCERN_CONCRETIZATION,
  CONCERN_SYNONYMS_JA,
  CONCERN_SYNONYMS_EN,
  CONCERN_TRANSLATIONS,
  CONCERN_TO_ENGLISH,
  CONCERN_KEYWORDS_TO_ENGLISH
} from './dictionaries/concern-synonyms';

export {
  FIELD_TERMS_JA,
  FIELD_TERMS_EN,
  FIELD_ENGLISH_TEMPLATES,
  FIELD_DETECTION_KEYWORDS_JA,
  FIELD_SYNONYMS
} from './dictionaries/field-terms';

// Types
import type { Stakeholder } from '../types'; 
import { QueryEnhancementConfig } from './QueryEnhancer';
import { CustomStakeholderQueryEnhancer } from './CustomStakeholderQueryEnhancer';

/**
 * デバッグ用ユーティリティ
 * DEBUG_LOGGING環境変数が設定されている場合のみ出力
 */
export function debugQueryEnhancement(
  stakeholder: Stakeholder,
  config?: QueryEnhancementConfig
): void {
  const DEBUG_LOGGING = process.env.DEBUG_LOGGING;
  if (!DEBUG_LOGGING) return;

  const enhancer = new CustomStakeholderQueryEnhancer();
  const originalQuery = `${stakeholder.role} ${stakeholder.concerns.join(' ')}`;
  const enhancedQueries = enhancer.enhanceQuery(stakeholder, config);
  
  console.log('=== Query Enhancement Debug ===');
  console.log('Stakeholder:', stakeholder);
  console.log('Original query:', originalQuery);
  console.log('Original length:', originalQuery.length);
  console.log('Enhanced queries:', enhancedQueries);
  console.log('Number of queries:', enhancedQueries.length);
  console.log('Query lengths:', enhancedQueries.map(q => q.length));
  console.log('================================');
}

// default export
export default CustomStakeholderQueryEnhancer;
