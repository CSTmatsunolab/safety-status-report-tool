// types/index.ts

export interface UploadedFile {
  id: string;
  name: string;
  type: 'gsn' | 'minutes' | 'other';
  content: string;
  uploadedAt: Date;
  metadata?: FileMetadata;
  includeFullText?: boolean;
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

export interface ReportStructureTemplate {
  id: string;
  name: string;
  description: string;
  sections: string[];
  gsnSections?: string[];
  recommendedFor?: string[];
}

export interface FileMetadata {
  originalType: string;      // 元のMIMEタイプ
  extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed'; // 抽出方法
  size: number;              // ファイルサイズ
  confidence?: number;       // OCR信頼度（0-100）
  service?: string;          // 使用したOCRサービス
  gsnValidation?: any;
  isGSN?: boolean;
}