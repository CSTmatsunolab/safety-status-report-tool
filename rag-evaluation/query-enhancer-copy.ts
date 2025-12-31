// query-enhancer-copy.ts
// SSRツールのsrc/lib/query-enhancer.tsからコピー
// 評価スクリプト用にimport文のみ修正

import { Stakeholder, QueryEnhancementConfig } from './types';

// QueryEnhancementConfig は types.ts で定義済み

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
    const prioritizedConcerns = this.prioritizeConcerns(stakeholder.concerns);
    
    // 3. 【変更】基本クエリパターン（重複回避ロジック）
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
    
    // 7. 英語クエリの追加
    if (includeEnglish && (roleLang === 'ja' || concernsLang === 'ja')) {
      const englishQueries = this.generateEnglishQueries(stakeholder);
      queries.push(...englishQueries);
    }
    
    // 重複除去して最大数に制限
    return [...new Set(queries)]
      .filter(q => q && q.trim().length > 0)
      .slice(0, maxQueries);
  }

  /**
   * 入力言語の判定
   */
  protected detectLanguage(text: string): 'ja' | 'en' | 'mixed' {
    const hasJapanese = /[ぁ-ん]+|[ァ-ヴー]+|[一-龠]+/.test(text);
    const hasEnglish = /[a-zA-Z]+/.test(text);
    
    if (hasJapanese && hasEnglish) return 'mixed';
    if (hasJapanese) return 'ja';
    return 'en';
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
    
    // 英語の役職を日本語に変換する共通パターン
    const commonRoleTranslations: Record<string, string> = {
      'ceo': 'CEO',
      'cto': 'CTO',
      'cfo': 'CFO',
      'product manager': 'プロダクトマネージャー',
      'project manager': 'プロジェクトマネージャー',
      'security team': 'セキュリティチーム',
      'quality assurance': '品質保証',
      'qa team': 'QAチーム',
      'devops': 'DevOps',
      'sales': '営業',
      'marketing': 'マーケティング',
      'engineering': 'エンジニアリング',
      'development': '開発',
      'developer': '開発者',
      'r&d': '研究開発',
      'hr': '人事',
      'legal': '法務',
      'finance': '財務'
    };
    
    // 大文字小文字を無視して変換を試みる
    const lowerRole = cleanedRole.toLowerCase();
    for (const [eng, jpn] of Object.entries(commonRoleTranslations)) {
      if (lowerRole === eng || lowerRole === `${eng} team` || lowerRole === `${eng} division`) {
        return jpn;
      }
    }
    
    // 変換できない場合はそのまま返す
    return cleanedRole;
  }

  /**
   * 懸念事項の優先順位付け（多言語対応版）
   */
  protected prioritizeConcerns(concerns: string[]): string[] {
    // 日本語の重要キーワード
    const priorityKeywordsJa = ['安全', 'リスク', '品質', 'コスト', '戦略', 'セキュリティ'];
    
    // 英語の重要キーワード
    const priorityKeywordsEn = ['safety', 'risk', 'quality', 'cost', 'strategy', 
                                'security', 'compliance', 'performance', 'efficiency'];
    
    const scored = concerns.map(concern => {
      const concernLower = concern.toLowerCase();
      let score = 0;
      
      // 日本語キーワードのチェック
      score += priorityKeywordsJa.filter(keyword => 
        concern.includes(keyword)
      ).length * 2;
      
      // 英語キーワードのチェック
      score += priorityKeywordsEn.filter(keyword => 
        concernLower.includes(keyword)
      ).length;
      
      return { concern, score };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.concern);
  }

  /**
   * 言語変換クエリの生成
   */
  protected generateTranslatedQueries(
    role: string,
    concerns: string[],
    roleLang: 'ja' | 'en' | 'mixed',
    concernsLang: 'ja' | 'en' | 'mixed'
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
    const translations: Record<string, string> = {
      'cost reduction': 'コスト削減',
      'cost': 'コスト',
      'quality improvement': '品質向上',
      'quality': '品質',
      'risk management': 'リスク管理',
      'risk': 'リスク',
      'safety': '安全',
      'security': 'セキュリティ',
      'performance': 'パフォーマンス',
      'efficiency': '効率',
      'customer satisfaction': '顧客満足',
      'compliance': 'コンプライアンス',
      'schedule': 'スケジュール',
      'deadline': '納期',
      'budget': '予算',
      'innovation': 'イノベーション',
      'scalability': 'スケーラビリティ',
      'reliability': '信頼性',
      'user experience': 'ユーザー体験',
      'ux': 'UX',
      'automation': '自動化',
      'optimization': '最適化',
      'productivity': '生産性',
      'maintenance': '保守',
      'monitoring': '監視',
      'deployment': 'デプロイメント',
      'integration': '統合',
      'testing': 'テスト',
      'documentation': 'ドキュメント'
    };
    
    return concerns.map(concern => {
      const concernLower = concern.toLowerCase();
      
      // 完全一致を優先
      if (translations[concernLower]) {
        return translations[concernLower];
      }
      
      // 部分一致を試みる
      for (const [eng, jpn] of Object.entries(translations)) {
        if (concernLower.includes(eng)) {
          return concern.toLowerCase().replace(eng, jpn);
        }
      }
      
      // 技術用語はそのまま残す（CI/CD, Kubernetes等）
      if (/^[A-Z\/\-]+$/.test(concern) || concern.includes('/')) {
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
    
    // 日本語ロールの同義語
    const roleSynonymsJa: Record<string, string[]> = {
      '経営層': ['経営', '役員', 'マネジメント', '経営陣'],
      '技術専門家': ['技術者', 'エンジニア', 'テクニカル', '技術担当'],
      'アーキテクト': ['設計者', 'システム設計', 'アーキテクチャ'],
      '事業部門': ['ビジネス', '営業', '事業'],
      '製品部門': ['プロダクト', '製品開発', '商品'],
      '研究開発部門': ['R&D', '研究', '開発', 'イノベーション']
    };
    
    // 英語ロールの同義語
    const roleSynonymsEn: Record<string, string[]> = {
      'product manager': ['PM', 'product owner', 'product lead'],
      'engineering manager': ['EM', 'tech lead', 'engineering lead'],
      'security': ['cybersecurity', 'infosec', 'security team'],
      'quality assurance': ['QA', 'testing', 'quality control'],
      'developer': ['engineer', 'programmer', 'developer'],
      'devops': ['DevOps engineer', 'infrastructure', 'SRE']
    };
    
    // 日本語の関心事同義語
    const concernSynonymsJa: Record<string, string[]> = {
      'リスク管理': ['リスク', 'ハザード', '危険', 'リスクアセスメント'],
      '安全': ['セーフティ', '安全性', '安全確保'],
      '品質': ['クオリティ', 'QA', '品質保証'],
      'コスト': ['費用', '予算', 'コスト削減']
    };
    
    // 英語の関心事同義語
    const concernSynonymsEn: Record<string, string[]> = {
      'cost': ['budget', 'expense', 'spending'],
      'quality': ['QA', 'excellence', 'standard'],
      'risk': ['hazard', 'threat', 'vulnerability'],
      'safety': ['security', 'protection', 'safe'],
      'performance': ['efficiency', 'speed', 'optimization']
    };
    
    // ロールの言語を判定して適切な同義語を使用
    const roleLower = role.toLowerCase();
    
    // 日本語ロールの同義語
    Object.entries(roleSynonymsJa).forEach(([key, synonyms]) => {
      if (role.includes(key)) {
        queries.push(`${synonyms[0]} ${concerns[0] || ''}`);
      }
    });
    
    // 英語ロールの同義語
    Object.entries(roleSynonymsEn).forEach(([key, synonyms]) => {
      if (roleLower.includes(key)) {
        queries.push(`${synonyms[0]} ${concerns[0] || ''}`);
      }
    });
    
    // 関心事の同義語（日英両対応）
    concerns.forEach(concern => {
      const concernLower = concern.toLowerCase();
      
      // 日本語の同義語
      Object.entries(concernSynonymsJa).forEach(([key, synonyms]) => {
        if (concern.includes(key)) {
          queries.push(`${role} ${synonyms[0]}`);
        }
      });
      
      // 英語の同義語
      Object.entries(concernSynonymsEn).forEach(([key, synonyms]) => {
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
    
    const roleSpecificTerms: Record<string, string[]> = {
      'cxo': ['経営戦略', 'ビジネスインパクト', 'ROI', 'ガバナンス'],
      'technical-fellows': ['アーキテクチャ', 'ベストプラクティス', '技術革新'],
      'architect': ['システム設計', 'インフラ', 'スケーラビリティ'],
      'business': ['売上', '市場', '競合', '顧客'],
      'product': ['ユーザー', 'フィーチャー', 'ロードマップ'],
      'r-and-d': ['研究', '実験', 'プロトタイプ', '特許']
    };
    
    const terms = roleSpecificTerms[stakeholder.id] || [];
    
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
    
    const roleTranslations: Record<string, string> = {
      '経営層': 'executive management',
      '技術専門家': 'technical expert',
      'アーキテクト': 'system architect',
      '事業部門': 'business division',
      '製品部門': 'product team',
      '研究開発部門': 'R&D'
    };
    
    const concernTranslations: Record<string, string> = {
      'リスク管理': 'risk management',
      '安全': 'safety',
      '品質': 'quality assurance',
      '戦略': 'strategy',
      'コスト': 'cost',
      '技術': 'technology'
    };
    
    const cleanRole = this.cleanRole(stakeholder.role);
    const roleEn = roleTranslations[cleanRole] || '';
    const concernEn = concernTranslations[stakeholder.concerns[0]] || '';
    
    if (roleEn || concernEn) {
      queries.push(`${roleEn} ${concernEn}`.trim());
    }
    
    return queries;
  }
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
    
    // 3. 基本クエリ
    const cleanRole = this.cleanRole(stakeholder.role);
    const prioritizedConcerns = this.prioritizeConcerns(stakeholder.concerns);
    
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
    
    return [...new Set(queries)]
      .filter(q => q && q.trim().length > 0)
      .slice(0, config.maxQueries || 5);
  }

  /**
   * カスタムロールの分析
   */
  private analyzeCustomRole(role: string): { field?: string; level?: string } {
    const roleLower = role.toLowerCase();
    
    let field: string | undefined;
    
    // 日本語での判定
    if (roleLower.includes('品質') || roleLower.includes('qa')) {
      field = 'quality';
    } else if (roleLower.includes('セキュリティ') || roleLower.includes('security')) {
      field = 'security';
    } else if (roleLower.includes('営業') || roleLower.includes('sales')) {
      field = 'sales';
    } else if (roleLower.includes('マーケティング') || roleLower.includes('marketing')) {
      field = 'marketing';
    } else if (roleLower.includes('財務') || roleLower.includes('経理') || roleLower.includes('finance')) {
      field = 'finance';
    } else if (roleLower.includes('法務') || roleLower.includes('コンプライアンス') || roleLower.includes('legal')) {
      field = 'legal';
    } else if (roleLower.includes('人事') || roleLower.includes('hr') || roleLower.includes('human resource')) {
      field = 'hr';
    } else if (roleLower.includes('製造') || roleLower.includes('生産') || roleLower.includes('manufacturing')) {
      field = 'manufacturing';
    } else if (roleLower.includes('カスタマー') || roleLower.includes('顧客') || roleLower.includes('customer')) {
      field = 'customer';
    } else if (roleLower.includes('データ') || roleLower.includes('分析') || roleLower.includes('data') || roleLower.includes('analytics')) {
      field = 'data';
    } else if (roleLower.includes('プロジェクト') || roleLower.includes('pm') || roleLower.includes('project')) {
      field = 'project';
    } else if (roleLower.includes('devops') || roleLower.includes('インフラ') || roleLower.includes('infrastructure')) {
      field = 'devops';
    } else if (roleLower.includes('開発') || roleLower.includes('development') || roleLower.includes('engineer')) {
      field = 'development';
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
    concernsLang: 'ja' | 'en' | 'mixed'
  ): string[] {
    const fieldTermsJa: Record<string, string[]> = {
      'quality': ['品質保証', 'テスト', 'バグ', '不具合', 'QA', '検証'],
      'security': ['セキュリティ', '脆弱性', '攻撃', '防御', 'ゼロトラスト'],
      'sales': ['売上', '営業戦略', '顧客', '提案', '契約'],
      'marketing': ['マーケティング', 'ブランド', 'プロモーション', '市場分析'],
      'finance': ['予算', 'コスト', 'ROI', '財務', '投資'],
      'legal': ['コンプライアンス', '法令', '規制', 'リーガル'],
      'hr': ['人材', '採用', '育成', '評価', '組織'],
      'manufacturing': ['製造', '生産性', '品質管理', '工程', '効率化'],
      'customer': ['顧客満足', 'カスタマーサポート', 'CS', 'CX'],
      'data': ['データ分析', 'BI', 'データガバナンス', 'KPI'],
      'project': ['プロジェクト管理', 'スケジュール', 'リソース', 'PMO'],
      'devops': ['CI/CD', 'インフラ', 'デプロイ', '自動化'],
      'development': ['開発', 'プログラミング', 'コード', '実装']
    };
    
    const fieldTermsEn: Record<string, string[]> = {
      'quality': ['QA', 'testing', 'quality assurance', 'validation'],
      'security': ['security', 'vulnerability', 'threat', 'cybersecurity'],
      'sales': ['sales', 'revenue', 'customer', 'deal'],
      'marketing': ['marketing', 'brand', 'campaign', 'market analysis'],
      'finance': ['budget', 'cost', 'ROI', 'financial'],
      'legal': ['compliance', 'regulatory', 'governance', 'legal'],
      'hr': ['HR', 'talent', 'recruitment', 'performance'],
      'manufacturing': ['manufacturing', 'production', 'quality control'],
      'customer': ['customer satisfaction', 'support', 'CX'],
      'data': ['data analytics', 'BI', 'insights', 'metrics'],
      'project': ['project management', 'schedule', 'resources'],
      'devops': ['CI/CD', 'infrastructure', 'deployment', 'automation'],
      'development': ['development', 'programming', 'code', 'implementation']
    };
    
    const terms = concernsLang === 'en' ? fieldTermsEn[field] : fieldTermsJa[field];
    
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
    
    const fieldSynonyms: Record<string, string[]> = {
      'quality': ['品質', 'QA', 'テスト', 'testing'],
      'security': ['セキュリティ', 'security', '防御'],
      'sales': ['営業', 'セールス', 'sales'],
      'development': ['開発', 'dev', 'engineering']
    };
    
    if (field && fieldSynonyms[field]) {
      const synonyms = fieldSynonyms[field];
      queries.push(`${synonyms[0]} ${concerns[0] || ''}`.trim());
    }
    
    return queries;
  }
}

/**
 * デバッグ用ユーティリティ
 */
export function debugQueryEnhancement(
  stakeholder: Stakeholder,
  config?: QueryEnhancementConfig
): void {
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