// src/lib/config/constants.ts

// 表示設定
export const PREVIEW_LENGTH = 500; // テキストプレビューの最大文字数

// OCR設定
export const PDF_OCR_MAX_PAGES = 5; // PDFのOCR処理最大ページ数
export const MIN_EMBEDDED_TEXT_LENGTH = 100; // 埋め込みテキストを採用する最小文字数

// ファイル処理設定
export const IMAGE_FILE_EXTENSIONS = /\.(jpg|jpeg|png|gif|bmp|tiff)$/i; // 対応画像形式

// OCR詳細設定
export const OCR_CONFIG = {
  // Google Cloud Vision APIの設定
  maxRetries: 3, // リトライ回数
  retryDelay: 1000, // リトライ間隔（ミリ秒）
  
  // ページ数の制限（コスト管理）
  absoluteMaxPages: 20, // 絶対的な上限（安全装置）
  warningPageCount: 15, // 警告を表示するページ数
  
  // OCR品質設定
  minConfidenceThreshold: 70, // OCR信頼度の最小閾値（%）
  lowConfidenceWarning: 50, // 低信頼度警告の閾値（%）
};

// GSN処理設定
export const GSN_CONFIG = {
  // GSN要素の識別パターン
  patterns: {
    goal: /\b(G\d+)\s*[:：]\s*/g,
    strategy: /\b(S\d+)\s*[:：]\s*/g,
    context: /\b(C\d+)\s*[:：]\s*/g,
    solution: /\b(Sn\d+)\s*[:：]\s*/g,
    justification: /\b(J\d+)\s*[:：]\s*/g,
  },
  
  // GSN処理オプション
  enableAutoFormatting: true, // 自動フォーマット有効化
  preserveOriginalSpacing: false, // 元の空白を保持するか
};