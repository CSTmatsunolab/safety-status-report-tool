// src/types.ts

export interface Stakeholder {
  id: string;
  role: string;
  concerns: string[];
  readingTime?: {
    min: number;
    max: number;
  };
}

export interface ReportStructureTemplate {
  id: string;
  name: string;
  description?: string;
  sections: string[];
  gsnSections?: string[];
  recommendedFor?: string[];
}

export interface FileInfo {
  name: string;
  content: string;
  type: string;
  size: number;
  isGSN?: boolean;
  useFullText?: boolean;
  s3Key?: string;
  metadata?: {
    originalType?: string;
    extractionMethod?: string;
    s3Key?: string;
    contentPreview?: string;
    originalContentLength?: number;
    userDesignatedGSN?: boolean;
    isGSN?: boolean;
  };
}

export interface GenerateReportRequest {
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  files: FileInfo[];
  fullTextFileIds?: string[];
  language?: 'ja' | 'en';
  userIdentifier?: string;
}

export interface Report {
  id?: string;
  title: string;
  content: string;
  stakeholder: Stakeholder;
  rhetoricStrategy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GenerateReportResponse {
  success: boolean;
  report?: Report;
  error?: string;
  details?: string;
  totalDuration?: number;
}

/**
 * ステークホルダーの読了時間設定を取得
 */
export function getReadingConfig(stakeholder: Stakeholder): { min: number; max: number } {
  // デフォルト値
  const defaultConfig = { min: 5, max: 15 };
  
  if (stakeholder.readingTime) {
    return stakeholder.readingTime;
  }
  
  // ステークホルダーIDに基づくデフォルト設定
  const configMap: { [key: string]: { min: number; max: number } } = {
    'cxo': { min: 3, max: 7 },
    'business': { min: 5, max: 10 },
    'product': { min: 5, max: 12 },
    'technical-fellows': { min: 10, max: 20 },
    'architect': { min: 8, max: 15 },
    'r-and-d': { min: 10, max: 25 }
  };
  
  return configMap[stakeholder.id] || defaultConfig;
}
