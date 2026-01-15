// lib/md-converter/converters/excel.ts
// Excel/CSV変換

import { Document } from '@langchain/core/documents';
import * as XLSX from 'xlsx';
import { ConversionResult } from '../types';
import { arrayToMarkdownTable, parseCsvLine, createRowDocuments } from '../utils/table-utils';
import { normalizeSafetyDocument } from '../safety/normalizer';

/**
 * ExcelファイルをMarkdownに変換
 */
export function convertExcel(buffer: Buffer, fileName: string): ConversionResult {
  const documents: Document[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const markdownParts: string[] = [];

    workbook.SheetNames.forEach((sheetName: string, sheetIndex: number) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

      if (jsonData.length === 0) return;

      if (workbook.SheetNames.length > 1) {
        markdownParts.push(`## シート: ${sheetName}\n`);
      }

      const rows = jsonData as unknown[][];
      const mdTable = arrayToMarkdownTable(rows);
      markdownParts.push(mdTable);

      documents.push(
        new Document({
          pageContent: mdTable,
          metadata: {
            source: fileName,
            sheetName,
            sheetIndex,
            fileType: 'xlsx',
            converter: 'xlsx',
            rowCount: rows.length
          }
        })
      );
    });

    const markdown = normalizeSafetyDocument(markdownParts.join('\n\n'));

    console.log(`[XLSX] ${documents.length} sheets`);

    return {
      markdown,
      confidence: 0.92,
      method: 'xlsx-to-md',
      warnings: [],
      documents
    };

  } catch (error) {
    console.error('[XLSX] Failed:', error);
    return {
      markdown: '',
      confidence: 0,
      method: 'xlsx-failed',
      warnings: [`Excel変換エラー: ${error}`]
    };
  }
}

/**
 * CSVファイルをMarkdownに変換
 */
export function convertCsv(content: string, fileName: string): ConversionResult {
  try {
    const lines = content.trim().split('\n');
    if (lines.length === 0) {
      return {
        markdown: '',
        confidence: 0,
        method: 'csv-empty',
        warnings: ['CSVが空です']
      };
    }

    // CSVパース
    const rows = lines.map(line => parseCsvLine(line));
    
    // Markdown表を生成
    const mdTable = arrayToMarkdownTable(rows);
    const normalized = normalizeSafetyDocument(mdTable);

    // Documents生成
    const documents = createRowDocuments(rows, fileName, 'csv');

    console.log(`[CSV] ${rows.length} rows → MD table`);

    return {
      markdown: normalized,
      confidence: 0.95,
      method: 'csv-to-md-table',
      warnings: [],
      documents
    };

  } catch (error) {
    console.error('[CSV] Failed:', error);
    return {
      markdown: content,
      confidence: 0.50,
      method: 'csv-fallback',
      warnings: [`CSV変換エラー: ${error}`]
    };
  }
}
