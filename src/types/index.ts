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
  rhetoricStrategy?: string;
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
  // 2パス目（ステークホルダー構成への再編成）を実行した場合のみ、
  // 1パス目（GSN由来アウトライン）の本文を保持する
  draftContent?: string;
  // アウトラインの生成元（'hicase' | 'gsn-flat' | 'template'）
  outlineSource?: string;
  // 2パス目を実際に適用したかどうか
  restructured?: boolean;
}

export interface ReportStructureTemplate {
  id: string;
  name: string;
  description: string;
  sections: string[];
  gsnSections?: string[];
  recommendedFor?: string[];
}

export interface GSNValidationResult {
  isValid: boolean;
  issues: string[];
}

export interface FileMetadata {
  originalType: string;
  extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed';
  size: number;
  confidence?: number;
  service?: string;
  gsnValidation?: GSNValidationResult | null;
  isGSN?: boolean;
  userDesignatedGSN: boolean;
  s3Key?: string;
  contentPreview?: string;
  isBase64?: boolean;
  [key: string]: unknown;
}