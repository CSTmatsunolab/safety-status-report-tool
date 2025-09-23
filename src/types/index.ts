// types/index.ts

export interface UploadedFile {
  id: string;
  name: string;
  type: 'gsn' | 'minutes' | 'other';
  content: string;
  uploadedAt: Date;
  metadata?: FileMetadata;
}

export interface Stakeholder {
  id: string;
  role: string;
  concerns: string[];
}

export interface AnalysisResult {
  stakeholders: Stakeholder[];
  keyTopics: string[];
  risks: string[];
  recommendations: string[];
}

export interface Report {
  id: string;
  title: string;
  stakeholder: Stakeholder;
  content: string;
  rhetoricStrategy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileMetadata {
  originalType: string;      // 元のMIMEタイプ
  extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'failed'; // 抽出方法
  size: number;              // ファイルサイズ
  confidence?: number;       // OCR信頼度（0-100）
  service?: string;          // 使用したOCRサービス
  //structured?: GSNStructure; // GSNの構造化データ
}

/*  GSN関連の型 - もしGSN図を構造的に解析する機能を追加する場合に使用
    現在未使用のため，コメントアウト
export interface GSNStructure {
  elements: GSNElement[];
  relationships: GSNRelationship[];
}

export interface GSNElement {
  id: string;
  type: 'Goal' | 'Strategy' | 'Solution' | 'Context' | 'Justification';
  content: string;
  position: { x: number; y: number };
  confidence: number;
}

export interface GSNRelationship {
  from: string;
  to: string;
  type: 'supports' | 'in-context-of' | 'justified-by';
}
*/