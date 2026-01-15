// lib/rag/query-enhancer/dictionaries/field-terms.ts

/**
 * 分野別キーワード（日本語）
 */
export const FIELD_TERMS_JA: Record<string, string[]> = {
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

/**
 * 分野別キーワード（英語）
 */
export const FIELD_TERMS_EN: Record<string, string[]> = {
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

/**
 * 分野別の英語クエリテンプレート
 */
export const FIELD_ENGLISH_TEMPLATES: Record<string, string> = {
  'quality': 'quality assurance testing verification QA',
  'security': 'security vulnerability risk protection',
  'sales': 'sales revenue customer business',
  'marketing': 'marketing brand promotion market',
  'finance': 'cost budget ROI financial investment',
  'legal': 'compliance regulatory governance legal',
  'hr': 'human resources talent recruitment',
  'manufacturing': 'manufacturing production quality efficiency',
  'customer': 'customer satisfaction support CX',
  'data': 'data analytics insights metrics KPI',
  'project': 'project management schedule resources',
  'devops': 'DevOps CI/CD infrastructure automation',
  'development': 'development implementation technical engineering'
};

/**
 * 分野判定用のキーワードマッピング（日本語）
 */
export const FIELD_DETECTION_KEYWORDS_JA: Record<string, string[]> = {
  'quality': ['品質', 'qa'],
  'security': ['セキュリティ', 'security'],
  'sales': ['営業', 'sales'],
  'marketing': ['マーケティング', 'marketing'],
  'finance': ['財務', '経理', 'finance'],
  'legal': ['法務', 'コンプライアンス', 'legal'],
  'hr': ['人事', 'hr', 'human resource'],
  'manufacturing': ['製造', '生産', 'manufacturing'],
  'customer': ['カスタマー', '顧客', 'customer'],
  'data': ['データ', '分析', 'data', 'analytics'],
  'project': ['プロジェクト', 'pm', 'project'],
  'devops': ['devops', 'インフラ', 'infrastructure'],
  'development': ['開発', 'development', 'engineer']
};

/**
 * 分野別の同義語マッピング
 */
export const FIELD_SYNONYMS: Record<string, string[]> = {
  'quality': ['品質', 'QA', 'テスト', 'testing'],
  'security': ['セキュリティ', 'security', '防御'],
  'sales': ['営業', 'セールス', 'sales'],
  'development': ['開発', 'dev', 'engineering']
};
