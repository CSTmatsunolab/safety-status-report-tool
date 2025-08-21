// types/index.ts

export interface UploadedFile {
  id: string;
  name: string;
  type: 'gsn' | 'minutes' | 'other';
  content: string;
  uploadedAt: Date;
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

export interface GenerateReportRequest {
  files: UploadedFile[];
  stakeholderId: string;
  analysisResult: AnalysisResult;
}

export interface ExportOptions {
  format: 'pdf' | 'html';
  includeMetadata: boolean;
}