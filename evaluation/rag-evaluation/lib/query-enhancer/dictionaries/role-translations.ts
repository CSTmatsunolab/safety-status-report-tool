// lib/rag/query-enhancer/dictionaries/role-translations.ts

/**
 * 英語の役職を日本語に変換するマッピング
 */
export const COMMON_ROLE_TRANSLATIONS: Record<string, string> = {
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

/**
 * 日本語ロールの同義語マッピング
 */
export const ROLE_SYNONYMS_JA: Record<string, string[]> = {
  '経営層': ['経営', '役員', 'マネジメント', '経営陣'],
  '技術専門家': ['技術者', 'エンジニア', 'テクニカル', '技術担当'],
  'アーキテクト': ['設計者', 'システム設計', 'アーキテクチャ'],
  '事業部門': ['ビジネス', '営業', '事業'],
  '製品部門': ['プロダクト', '製品開発', '商品'],
  '研究開発部門': ['R&D', '研究', '開発', 'イノベーション']
};

/**
 * 英語ロールの同義語マッピング
 */
export const ROLE_SYNONYMS_EN: Record<string, string[]> = {
  'product manager': ['PM', 'product owner', 'product lead'],
  'engineering manager': ['EM', 'tech lead', 'engineering lead'],
  'security': ['cybersecurity', 'infosec', 'security team'],
  'quality assurance': ['QA', 'testing', 'quality control'],
  'developer': ['engineer', 'programmer', 'developer'],
  'devops': ['DevOps engineer', 'infrastructure', 'SRE']
};

/**
 * 日本語ロール → 英語への翻訳マッピング
 */
export const ROLE_TO_ENGLISH: Record<string, string> = {
  '経営層': 'executive management',
  '技術専門家': 'technical expert',
  'アーキテクト': 'system architect',
  '事業部門': 'business division',
  '製品部門': 'product team',
  '研究開発部門': 'R&D'
};

/**
 * ステークホルダー別の英語クエリテンプレート
 */
export const ENGLISH_QUERY_TEMPLATES: Record<string, string> = {
  'cxo': 'risk management cost ROI governance strategy',
  'technical-fellows': 'technical quality architecture design review standard',
  'architect': 'system architecture design ADR component interface',
  'business': 'business risk cost revenue ROI budget',
  'product': 'product quality safety requirements verification test',
  'r-and-d': 'technical verification implementation development issue risk'
};

/**
 * ロール特化キーワード
 */
export const ROLE_SPECIFIC_TERMS: Record<string, string[]> = {
  'cxo': ['経営判断', 'コスト', '予算', '進捗', '承認', 'マイルストーン'],
  'technical-fellows': ['技術評価', '設計判断', '技術レビュー', '品質基準', '技術方針'],
  'architect': ['設計', '構成', 'モジュール', 'インターフェース', 'ADR', '依存関係'],
  'business': ['収益', 'コスト削減', '市場影響', 'ビジネスリスク', '投資', '予算'],
  'product': ['品質', '安全性', '要件', '機能', 'リリース', '検証', 'テスト'],
  'r-and-d': ['技術検証', '実装', '開発課題', '技術評価', '検証結果', '課題', 'オープンイシュー']
};
