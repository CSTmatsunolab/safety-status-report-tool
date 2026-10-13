// src/types.ts
// Lambda側の共通型定義

export interface UploadedFile {
  id: string;
  name: string;
  type: 'gsn' | 'minutes' | 'other';
  content: string;
  uploadedAt: Date;
  metadata?: FileMetadata;
  includeFullText?: boolean;
  useFullText?: boolean;
  isGSN?: boolean;
  s3Key?: string;
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

// リスクヒートマップ（画面で抽出）の1リスク。値は文書記載のまま
export interface HeatmapRiskInput {
  id: string;
  name?: string;
  likelihood?: string | number | null;
  impact?: string | number | null;
  status?: string;
}

// GSNノードヒートマップ（画面で抽出）の1ノード。値は文書記載のまま
export interface HeatmapGsnNodeInput {
  id: string;
  type?: string;
  text?: string;
  status?: string | null;
  severity?: string | null;
  severitySource?: string;
  // 親ノードのID（[] = トップゴール）。ヒートマップの縦軸（GSNの深さ）に使う
  parentIds?: string[];
  // 関係する関心事（GenerateReportRequest.heatmapGsnConcerns のインデックス）
  concerns?: number[];
}

// ステークホルダの関心事に基づき、本レポートで詳述するGSNノード（画面で選択）
export interface FocusGsnNodeInput {
  id: string;
  concerns: string[];
  reason?: string;
}

export interface GenerateReportRequest {
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  files?: UploadedFile[];
  fullTextFileIds?: string[];
  language?: 'ja' | 'en';
  userIdentifier?: string;
  // 文書の全リスクと、本レポートで必ず扱うリスクのID（リスクヒートマップで指定）
  heatmapRisks?: HeatmapRiskInput[];
  focusRiskIds?: string[];
  // GSNノードヒートマップの元データ（画面で抽出。表示のみで選択はしない）
  heatmapGsnNodes?: HeatmapGsnNodeInput[];
  focusGsnNodes?: FocusGsnNodeInput[];
  // GSNノードヒートマップの横軸（ステークホルダの関心事）
  heatmapGsnConcerns?: string[];
}
