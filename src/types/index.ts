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
}