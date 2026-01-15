// lib/rag/query-enhancer/QueryEnhancer.ts

import type { Stakeholder } from '../types'; 
import { detectLanguage, Language, isTechnicalTerm } from './utils/language-detection';
import { prioritizeConcerns } from './utils/concern-prioritizer';
import {
  COMMON_ROLE_TRANSLATIONS,
  ROLE_SYNONYMS_JA,
  ROLE_SYNONYMS_EN,
  ROLE_TO_ENGLISH,
  ENGLISH_QUERY_TEMPLATES,
  ROLE_SPECIFIC_TERMS
} from './dictionaries/role-translations';
import {
  CONCERN_CONCRETIZATION,
  CONCERN_SYNONYMS_JA,
  CONCERN_SYNONYMS_EN,
  CONCERN_TRANSLATIONS,
  CONCERN_TO_ENGLISH
} from './dictionaries/concern-synonyms';

/**
 * クエリ拡張の設定
 */
export interface QueryEnhancementConfig {
  maxQueries?: number;           // 生成するクエリの最大数（デフォルト: 5）
  includeEnglish?: boolean;      // 英語クエリを含むか（デフォルト: true）
  includeSynonyms?: boolean;     // 同義語展開を行うか（デフォルト: true）
  includeRoleTerms?: boolean;    // ロール固有の用語を含むか（デフォルト: true）
}

/**
 * 基本のクエリ拡張クラス
 */
export class QueryEnhancer {
  /**
   * メインの拡張メソッド
   */
  enhanceQuery(
    stakeholder: Stakeholder,
    config: QueryEnhancementConfig = {}
  ): string[] {
    const {
      maxQueries = 5,
      includeEnglish = true,
      includeSynonyms = true,
      includeRoleTerms = true
    } = config;

    const queries: string[] = [];
    
    // 1. 言語の判定
    const roleLang = this.detectLanguage(stakeholder.role);
    const concernsLang = this.detectLanguage(stakeholder.concerns.join(' '));
    
    // 2. ロールと関心事の処理
    const cleanedRole = this.cleanRole(stakeholder.role);
    // concernsを具体化してから優先順位付け
    const concretizedConcerns = this.concretizeConcerns(stakeholder.concerns);
    const prioritizedConcerns = this.prioritizeConcerns(concretizedConcerns);
    
    // 3. 基本クエリパターン（重複回避ロジック）
    if (prioritizedConcerns.length >= 3) {
      queries.push(
        `${cleanedRole} ${prioritizedConcerns.join(' ')}`,
        prioritizedConcerns.join(' '),
        prioritizedConcerns.slice(0, 2).join(' ')  // 上位2つのみ
      );
    } else if (prioritizedConcerns.length === 2) {
      queries.push(
        `${cleanedRole} ${prioritizedConcerns.join(' ')}`,
        prioritizedConcerns.join(' '),
        `${cleanedRole} ${prioritizedConcerns[0]}`  // ロール＋第1関心事
      );
    } else if (prioritizedConcerns.length === 1) {
      queries.push(
        `${cleanedRole} ${prioritizedConcerns[0]}`,
        prioritizedConcerns[0]
        // 3つ目は後続の拡張に任せる
      );
    } else if (prioritizedConcerns.length === 0) {
      // 関心事がない場合（エラーケース対応）
      queries.push(cleanedRole);
    }
    
    // 4. 言語変換クエリ
    if (roleLang === 'en' || concernsLang === 'en') {
      const translatedQueries = this.generateTranslatedQueries(
        cleanedRole, 
        prioritizedConcerns, 
        roleLang, 
        concernsLang
      );
      queries.push(...translatedQueries);
    }
    
    // 5. 同義語展開
    if (includeSynonyms) {
      const synonymQueries = this.generateSynonymQueries(
        cleanedRole, 
        prioritizedConcerns,
        stakeholder
      );
      queries.push(...synonymQueries);
    }
    
    // 6. ロール特化用語の追加
    if (includeRoleTerms) {
      const roleSpecificQueries = this.generateRoleSpecificQueries(stakeholder);
      queries.push(...roleSpecificQueries);
    }
    
    // 7. 日本語クエリを最大5つに制限し、英語クエリを6番目として追加
    const japaneseQueries = [...new Set(queries)]
      .filter(q => q && q.trim().length > 0)
      .slice(0, 5);
    
    // 英語クエリを6番目として追加（日本語入力の場合）
    if (includeEnglish && (roleLang === 'ja' || concernsLang === 'ja')) {
      const englishQuery = this.generateEnglishQuerySingle(stakeholder);
      if (englishQuery) {
        return [...japaneseQueries, englishQuery];
      }
    }
    
    return japaneseQueries;
  }

  /**
   * 英語クエリを1つ生成（6番目用）
   */
  protected generateEnglishQuerySingle(stakeholder: Stakeholder): string | null {
    return ENGLISH_QUERY_TEMPLATES[stakeholder.id] || null;
  }

  /**
   * 入力言語の判定
   */
  protected detectLanguage(text: string): Language {
    return detectLanguage(text);
  }

  /**
   * ロール文字列のクリーニング（多言語対応版）
   */
  protected cleanRole(role: string): string {
    // スラッシュで分割されている場合
    if (role.includes('/')) {
      const parts = role.split('/').map(p => p.trim());
      
      // 日本語部分を優先的に探す
      const japanesePart = parts.find(p => /[ぁ-ん]+|[ァ-ヴー]+|[一-龠]+/.test(p));
      if (japanesePart) return japanesePart;
      
      // 日本語がない場合は、より長い方を選択
      return parts.reduce((a, b) => a.length > b.length ? a : b);
    }
    
    // 特殊文字を除去
    const cleanedRole = role.replace(/[\/\-\(\)]/g, ' ').trim();
    
    // 大文字小文字を無視して変換を試みる
    const lowerRole = cleanedRole.toLowerCase();
    for (const [eng, jpn] of Object.entries(COMMON_ROLE_TRANSLATIONS)) {
      if (lowerRole === eng || lowerRole === `${eng} team` || lowerRole === `${eng} division`) {
        return jpn;
      }
    }
    
    // 変換できない場合はそのまま返す
    return cleanedRole;
  }

  /**
   * concernを具体化
   */
  protected concretizeConcern(concern: string): string {
    return CONCERN_CONCRETIZATION[concern] || concern;
  }

  /**
   * concernsリストを具体化
   */
  protected concretizeConcerns(concerns: string[]): string[] {
    return concerns.map(c => this.concretizeConcern(c));
  }

  /**
   * 懸念事項の優先順位付け（多言語対応版）
   */
  protected prioritizeConcerns(concerns: string[]): string[] {
    return prioritizeConcerns(concerns);
  }

  /**
   * 言語変換クエリの生成
   */
  protected generateTranslatedQueries(
    role: string,
    concerns: string[],
    roleLang: Language,
    concernsLang: Language
  ): string[] {
    const queries: string[] = [];
    
    // 関心事が英語の場合、日本語版も生成
    if (concernsLang === 'en' || concernsLang === 'mixed') {
      const translatedConcerns = this.translateConcerns(concerns);
      const differentConcerns = translatedConcerns.filter((tc, i) => tc !== concerns[i]);
      
      if (differentConcerns.length > 0) {
        queries.push(
          `${role} ${translatedConcerns.join(' ')}`,
          translatedConcerns.join(' ')
        );
      }
    }
    
    // ロールが英語の場合、日本語版も生成
    if (roleLang === 'en') {
      const translatedRole = this.translateRole(role);
      if (translatedRole !== role) {
        queries.push(`${translatedRole} ${concerns.join(' ')}`);
      }
    }
    
    return queries;
  }

  /**
   * 英語のロールを日本語に変換
   */
  protected translateRole(role: string): string {
    const cleanedRole = this.cleanRole(role);
    return cleanedRole; // cleanRole内で既に変換処理を実施
  }

  /**
   * 英語の関心事を日本語に変換
   */
  protected translateConcerns(concerns: string[]): string[] {
    return concerns.map(concern => {
      const concernLower = concern.toLowerCase();
      
      // 完全一致を優先
      if (CONCERN_TRANSLATIONS[concernLower]) {
        return CONCERN_TRANSLATIONS[concernLower];
      }
      
      // 部分一致を試みる
      for (const [eng, jpn] of Object.entries(CONCERN_TRANSLATIONS)) {
        if (concernLower.includes(eng)) {
          return concern.toLowerCase().replace(eng, jpn);
        }
      }
      
      // 技術用語はそのまま残す（CI/CD, Kubernetes等）
      if (isTechnicalTerm(concern)) {
        return concern;
      }
      
      return concern;
    });
  }

  /**
   * 同義語を使用したクエリ生成（多言語対応版）
   */
  protected generateSynonymQueries(
    role: string,
    concerns: string[],
    stakeholder: Stakeholder
  ): string[] {
    const queries: string[] = [];
    
    // ロールの言語を判定して適切な同義語を使用
    const roleLower = role.toLowerCase();
    
    // 日本語ロールの同義語
    Object.entries(ROLE_SYNONYMS_JA).forEach(([key, synonyms]) => {
      if (role.includes(key)) {
        queries.push(`${synonyms[0]} ${concerns[0] || ''}`);
      }
    });
    
    // 英語ロールの同義語
    Object.entries(ROLE_SYNONYMS_EN).forEach(([key, synonyms]) => {
      if (roleLower.includes(key)) {
        queries.push(`${synonyms[0]} ${concerns[0] || ''}`);
      }
    });
    
    // 関心事の同義語（日英両対応）
    concerns.forEach(concern => {
      const concernLower = concern.toLowerCase();
      
      // 日本語の同義語
      Object.entries(CONCERN_SYNONYMS_JA).forEach(([key, synonyms]) => {
        if (concern.includes(key)) {
          queries.push(`${role} ${synonyms[0]}`);
        }
      });
      
      // 英語の同義語
      Object.entries(CONCERN_SYNONYMS_EN).forEach(([key, synonyms]) => {
        if (concernLower.includes(key)) {
          queries.push(`${role} ${synonyms[0]}`);
        }
      });
    });
    
    return queries;
  }

  /**
   * ロール特化のクエリ生成
   */
  protected generateRoleSpecificQueries(stakeholder: Stakeholder): string[] {
    const queries: string[] = [];
    
    const terms = ROLE_SPECIFIC_TERMS[stakeholder.id] || [];
    
    if (terms.length > 0) {
      const mainConcern = stakeholder.concerns[0] || '';
      queries.push(`${terms[0]} ${mainConcern}`);
      
      if (['technical-fellows', 'architect', 'r-and-d'].includes(stakeholder.id)) {
        queries.push(`GSN アシュアランスケース ${mainConcern}`);
      }
    }
    
    return queries;
  }

  /**
   * 英語クエリの生成
   */
  protected generateEnglishQueries(stakeholder: Stakeholder): string[] {
    const queries: string[] = [];
    
    const cleanRole = this.cleanRole(stakeholder.role);
    const roleEn = ROLE_TO_ENGLISH[cleanRole] || '';
    const concernEn = CONCERN_TO_ENGLISH[stakeholder.concerns[0]] || '';
    
    if (roleEn || concernEn) {
      queries.push(`${roleEn} ${concernEn}`.trim());
    }
    
    return queries;
  }
}
