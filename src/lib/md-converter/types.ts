// lib/md-converter/types.ts
// MD変換モジュールの型定義

import { Document } from '@langchain/core/documents';

/**
 * 変換結果の型定義
 */
export interface ConversionResult {
  markdown: string;
  confidence: number;
  method: string;
  warnings: string[];
  documents?: Document[];
  skipped?: boolean;
}

/**
 * ファイル形式の種類
 */
export type FileFormat = 
  | 'md'
  | 'docx'
  | 'xlsx'
  | 'xls'
  | 'csv'
  | 'json'
  | 'html'
  | 'txt'
  | 'xml'
  | 'pdf'
  | 'unknown';
