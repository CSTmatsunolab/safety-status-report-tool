// lib/rag/query-enhancer/dictionaries/concern-synonyms.ts

/**
 * 抽象的な懸念事項を具体的なキーワードに変換するマッピング
 */
export const CONCERN_CONCRETIZATION: Record<string, string> = {
  // R&D
  '技術的な実現可能性': '技術検証 実装可能性',
  '開発リソースの効率性': '開発工数 リソース配分',
  'イノベーションの機会': '技術改善 新技術',
  '技術的リスクと課題': '技術課題 技術リスク',
  
  // Technical Fellows
  '技術的な卓越性': '技術品質 設計品質',
  'ベストプラクティスの適用': '標準準拠 業界標準',
  '長期的な技術戦略': '技術方針 技術選定',
  '技術的イノベーション': '技術改善 最適化',
  
  // CxO
  '戦略的整合性': '経営方針 事業戦略',
  '企業価値への影響': 'コスト ROI 投資対効果',
  'ステークホルダーへの説明責任': '報告 承認 意思決定',
  
  // Architect
  'システム設計の整合性': '設計整合性 アーキテクチャ',
  'アーキテクチャの保守性': '保守性 メンテナンス',
  
  // Business
  'ビジネスインパクト': '事業影響 ビジネス価値',
  'ROIと収益性': 'ROI 収益 コスト',
  '事業リスク': '事業リスク ビジネスリスク',
  
  // Product
  '製品の品質と安全性': '製品品質 安全性 品質保証',
  '市場競争力': '競争力 差別化 市場価値',
  'ユーザビリティ': '使いやすさ UX ユーザー体験',
  '製品化のタイムライン': 'リリース スケジュール マイルストーン',
};

/**
 * 日本語の関心事同義語マッピング
 */
export const CONCERN_SYNONYMS_JA: Record<string, string[]> = {
  // リスク関連
  'リスク管理': ['リスク', 'ハザード', '危険', 'リスク対策', 'リスク低減'],
  'リスク': ['ハザード', '危険', '脅威', '課題'],
  
  // 安全関連
  '安全': ['セーフティ', '安全性', '安全要件', 'ASIL'],
  '安全性': ['セーフティ', '安全', '安全要件'],
  
  // 品質関連
  '品質': ['クオリティ', 'QA', '品質保証', '検証'],
  '検証': ['テスト', '妥当性確認', 'バリデーション', '評価'],
  
  // コスト関連
  'コスト': ['費用', '予算', '見積', '工数'],
  'ROI': ['投資対効果', '費用対効果', '投資回収'],
  
  // 設計関連
  '設計': ['アーキテクチャ', '構成', '構造', 'ADR'],
  'アーキテクチャ': ['設計', 'システム構成', '構造'],
  
  // 要件関連
  '要件': ['仕様', '要求', 'スペック'],
  '機能': ['機能要件', 'FR', '機能仕様'],
  
  // 課題関連
  '課題': ['問題', 'イシュー', 'オープンイシュー', 'ブロッカー'],
  '技術課題': ['技術的問題', '実装課題', '技術リスク'],
  
  // 進捗関連
  '進捗': ['ステータス', '状況', '進行状況'],
  'スケジュール': ['日程', 'タイムライン', '期限', 'マイルストーン'],
  
  // 技術関連（R&D/Technical Fellows向け）
  '技術': ['テクノロジー', '技術的', '実装'],
  '実装': ['開発', '実現', '構築'],
  'イノベーション': ['技術革新', '改善', '刷新']
};

/**
 * 英語の関心事同義語マッピング
 */
export const CONCERN_SYNONYMS_EN: Record<string, string[]> = {
  'cost': ['budget', 'expense', 'spending'],
  'quality': ['QA', 'excellence', 'standard'],
  'risk': ['hazard', 'threat', 'vulnerability'],
  'safety': ['security', 'protection', 'safe'],
  'performance': ['efficiency', 'speed', 'optimization']
};

/**
 * 英語 → 日本語の関心事翻訳マッピング
 */
export const CONCERN_TRANSLATIONS: Record<string, string> = {
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

/**
 * 日本語 → 英語の関心事翻訳マッピング
 */
export const CONCERN_TO_ENGLISH: Record<string, string> = {
  'リスク管理': 'risk management',
  '安全': 'safety',
  '品質': 'quality assurance',
  '戦略': 'strategy',
  'コスト': 'cost',
  '技術': 'technology'
};

/**
 * 関心事から英語キーワードへのマッピング（クエリ生成用）
 */
export const CONCERN_KEYWORDS_TO_ENGLISH: Record<string, string> = {
  'リスク': 'risk',
  '安全': 'safety',
  '品質': 'quality',
  'コスト': 'cost',
  '効率': 'efficiency',
  '技術': 'technical',
  '設計': 'design',
  '検証': 'verification',
  'テスト': 'testing',
  '開発': 'development',
  '管理': 'management',
  '戦略': 'strategy',
  '課題': 'issue',
  '要件': 'requirements',
  '進捗': 'progress',
  'スケジュール': 'schedule'
};
