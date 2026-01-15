// lib/rag/query-enhancer/CustomStakeholderQueryEnhancer.ts

import { Stakeholder } from '@/types';
import { QueryEnhancer, QueryEnhancementConfig } from './QueryEnhancer';
import { detectLanguage, Language } from './utils/language-detection';
import {
  FIELD_TERMS_JA,
  FIELD_TERMS_EN,
  FIELD_ENGLISH_TEMPLATES,
  FIELD_DETECTION_KEYWORDS_JA,
  FIELD_SYNONYMS
} from './dictionaries/field-terms';
import { CONCERN_KEYWORDS_TO_ENGLISH } from './dictionaries/concern-synonyms';

/**
 * ロール分析結果
 */
interface RoleAnalysis {
  field?: string;
  level?: string;
}

/**
 * カスタムステークホルダー対応の拡張クラス
 */
export class CustomStakeholderQueryEnhancer extends QueryEnhancer {
  
  /**
   * カスタムステークホルダーの判定と処理
   */
  enhanceQuery(
    stakeholder: Stakeholder,
    config: QueryEnhancementConfig = {}
  ): string[] {
    if (stakeholder.id.startsWith('custom_')) {
      return this.handleCustomStakeholder(stakeholder, config);
    }
    
    return super.enhanceQuery(stakeholder, config);
  }

  /**
   * カスタムステークホルダー専用の処理
   */
  private handleCustomStakeholder(
    stakeholder: Stakeholder,
    config: QueryEnhancementConfig
  ): string[] {
    const queries: string[] = [];
    
    // 1. ロールから業界/部門を推測
    const roleAnalysis = this.analyzeCustomRole(stakeholder.role);
    
    // 2. 言語判定
    const roleLang = this.detectLanguage(stakeholder.role);
    const concernsLang = this.detectLanguage(stakeholder.concerns.join(' '));
    
    // 3. Concernsを具体化してから処理
    const concretizedConcerns = this.concretizeConcerns(stakeholder.concerns);
    const cleanRole = this.cleanRole(stakeholder.role);
    const prioritizedConcerns = this.prioritizeConcerns(concretizedConcerns);
    
    queries.push(
      `${cleanRole} ${prioritizedConcerns.join(' ')}`,
      prioritizedConcerns.join(' ')
    );
    
    // 4. 言語変換クエリ（英語入力の場合）
    if (roleLang === 'en' || concernsLang === 'en') {
      const translatedQueries = this.generateTranslatedQueries(
        cleanRole,
        prioritizedConcerns,
        roleLang,
        concernsLang
      );
      queries.push(...translatedQueries);
    }
    
    // 5. 分野特化クエリ
    if (roleAnalysis.field) {
      const fieldQueries = this.generateFieldSpecificQueries(
        roleAnalysis.field,
        prioritizedConcerns,
        this.detectLanguage(prioritizedConcerns.join(' '))
      );
      queries.push(...fieldQueries);
    }
    
    // 6. 懸念事項ベースの関連用語
    const concernBasedQueries = this.generateConcernBasedQueries(stakeholder.concerns);
    queries.push(...concernBasedQueries);
    
    // 7. カスタム同義語展開
    if (config.includeSynonyms !== false) {
      const customSynonymQueries = this.generateCustomSynonymQueries(
        cleanRole,
        prioritizedConcerns,
        roleAnalysis.field
      );
      queries.push(...customSynonymQueries);
    }
    
    // 8. 日本語クエリを最大5つに制限し、英語クエリを6番目として追加
    const japaneseQueries = [...new Set(queries)]
      .filter(q => q && q.trim().length > 0)
      .slice(0, 5);
    
    // 英語クエリを6番目として追加（日本語入力の場合）
    if (config.includeEnglish !== false && (roleLang === 'ja' || concernsLang === 'ja')) {
      const englishQuery = this.generateCustomEnglishQuery(stakeholder, roleAnalysis.field);
      if (englishQuery) {
        return [...japaneseQueries, englishQuery];
      }
    }
    
    return japaneseQueries;
  }

  /**
   * カスタムステークホルダー用の英語クエリ生成
   */
  private generateCustomEnglishQuery(
    stakeholder: Stakeholder,
    field?: string
  ): string | null {
    // 分野が推測できた場合はそのテンプレートを使用
    if (field && FIELD_ENGLISH_TEMPLATES[field]) {
      return FIELD_ENGLISH_TEMPLATES[field];
    }
    
    // 分野が推測できない場合はConcernsから英語キーワードを生成
    const englishTerms: string[] = [];
    stakeholder.concerns.forEach(concern => {
      Object.entries(CONCERN_KEYWORDS_TO_ENGLISH).forEach(([ja, en]) => {
        if (concern.includes(ja) && !englishTerms.includes(en)) {
          englishTerms.push(en);
        }
      });
    });
    
    if (englishTerms.length > 0) {
      return englishTerms.slice(0, 5).join(' ');
    }
    
    // デフォルトの汎用英語クエリ
    return 'safety risk quality management';
  }

  /**
   * カスタムロールの分析
   */
  private analyzeCustomRole(role: string): RoleAnalysis {
    const roleLower = role.toLowerCase();
    
    let field: string | undefined;
    
    // 分野の判定
    for (const [fieldName, keywords] of Object.entries(FIELD_DETECTION_KEYWORDS_JA)) {
      for (const keyword of keywords) {
        if (roleLower.includes(keyword)) {
          field = fieldName;
          break;
        }
      }
      if (field) break;
    }
    
    let level: string | undefined;
    
    // 日英両対応のレベル判定
    if (roleLower.includes('部長') || roleLower.includes('マネージャー') || roleLower.includes('manager')) {
      level = 'manager';
    } else if (roleLower.includes('リーダー') || roleLower.includes('主任') || roleLower.includes('lead')) {
      level = 'leader';
    } else if (roleLower.includes('担当') || roleLower.includes('スタッフ') || roleLower.includes('staff')) {
      level = 'staff';
    }
    
    return { field, level };
  }

  /**
   * 分野別の検索クエリ生成（多言語対応）
   */
  private generateFieldSpecificQueries(
    field: string,
    concerns: string[],
    concernsLang: Language
  ): string[] {
    const terms = concernsLang === 'en' ? FIELD_TERMS_EN[field] : FIELD_TERMS_JA[field];
    
    if (!terms || terms.length === 0) return [];
    
    return [
      `${terms[0]} ${concerns[0] || ''}`.trim(),
      `${terms[1] || ''} ${terms[2] || ''}`.trim()
    ].filter(q => q.length > 0);
  }

  /**
   * 懸念事項ベースのクエリ生成
   */
  private generateConcernBasedQueries(concerns: string[]): string[] {
    const queries: string[] = [];
    
    concerns.forEach(concern => {
      const concernLower = concern.toLowerCase();
      
      // 日本語パターン
      if (concernLower.includes('コスト') || concernLower.includes('予算')) {
        queries.push('コスト削減 効率化 ROI');
      }
      if (concernLower.includes('品質')) {
        queries.push('品質向上 不具合削減 テスト');
      }
      if (concernLower.includes('スケジュール') || concernLower.includes('納期')) {
        queries.push('プロジェクト管理 マイルストーン 進捗');
      }
      
      // 英語パターン
      if (concernLower.includes('cost') || concernLower.includes('budget')) {
        queries.push('cost reduction efficiency ROI');
      }
      if (concernLower.includes('quality')) {
        queries.push('quality improvement testing QA');
      }
      if (concernLower.includes('schedule') || concernLower.includes('deadline')) {
        queries.push('project management milestone progress');
      }
    });
    
    return [...new Set(queries)];
  }

  /**
   * カスタム同義語クエリ生成
   */
  private generateCustomSynonymQueries(
    role: string,
    concerns: string[],
    field?: string
  ): string[] {
    const queries: string[] = [];
    
    if (field && FIELD_SYNONYMS[field]) {
      const synonyms = FIELD_SYNONYMS[field];
      queries.push(`${synonyms[0]} ${concerns[0] || ''}`.trim());
    }
    
    return queries;
  }
}
