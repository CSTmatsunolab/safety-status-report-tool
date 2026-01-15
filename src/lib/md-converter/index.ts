// lib/md-converter/index.ts
// MD変換モジュール（独自実装版）
// - MD: スキップ
// - DOCX: mammoth → HTML → MD（構造保持）
// - CSV/JSON/TXT/HTML/XLSX/XML: 独自実装

import { Document } from '@langchain/core/documents';
import { ConversionResult } from './types';

// コンバーター
import { convertDocx } from './converters/docx';
import { convertExcel, convertCsv } from './converters/excel';
import { convertTxt, convertHtml, convertJson, convertXml } from './converters/text';
import { createPdfWarningResult, getPdfWarning, getPdfGuideUrl } from './converters/pdf';

// ユーティリティ
import {
  isDocxFile,
  isExcelFile,
  isCsvFile,
  isJsonFile,
  isHtmlFile,
  isTextFile,
  isXmlFile,
  isPdfFile,
  isMarkdownFile
} from './utils/file-detection';
import { bufferToString, normalizeText } from './utils/text-utils';

// 安全性処理
import { normalizeSafetyDocument } from './safety/normalizer';
import { extractPreservedBlocks, extractSafetyIds } from './safety/preserve-markers';

// ============================================
// メインエントリーポイント
// ============================================

export async function convertToMarkdown(
  content: string | Buffer,
  fileType: string,
  fileName: string
): Promise<ConversionResult> {
  const lowerFileName = fileName.toLowerCase();

  // ===== MDファイルはスキップ（ただし正規化は行う） =====
  if (isMarkdownFile(lowerFileName)) {
    console.log(`[MD Converter] Skip: ${fileName} (already Markdown)`);
    const text = bufferToString(content);
    // 表の保護マーカーを追加（MDファイルでも必要）
    const normalized = normalizeSafetyDocument(text);
    return {
      markdown: normalized,
      confidence: 1.0,
      method: 'md-passthrough',
      warnings: [],
      skipped: true
    };
  }

  try {
    // PDF → パススルー + 警告
    if (isPdfFile(fileType, lowerFileName)) {
      return createPdfWarningResult(content, fileName);
    }

    // DOCX → mammoth → HTML → MD
    if (isDocxFile(fileType, lowerFileName)) {
      return await convertDocx(content as Buffer, fileName);
    }

    // XLSX/XLS → MD表
    if (isExcelFile(fileType, lowerFileName)) {
      return convertExcel(content as Buffer, fileName);
    }

    // CSV → MD表
    if (isCsvFile(fileType, lowerFileName)) {
      return convertCsv(bufferToString(content), fileName);
    }

    // JSON → MD
    if (isJsonFile(fileType, lowerFileName)) {
      return convertJson(bufferToString(content), fileName);
    }

    // HTML → MD
    if (isHtmlFile(fileType, lowerFileName)) {
      return convertHtml(bufferToString(content), fileName);
    }

    // TXT → MD
    if (isTextFile(fileType, lowerFileName)) {
      return convertTxt(bufferToString(content), fileName);
    }

    // XML → MD
    if (isXmlFile(fileType, lowerFileName)) {
      return convertXml(bufferToString(content), fileName);
    }

    // 未対応形式 → テキストとして処理
    console.log(`[MD Converter] Unknown format: ${fileType}`);
    const text = bufferToString(content);
    return {
      markdown: normalizeSafetyDocument(normalizeText(text)),
      confidence: 0.60,
      method: 'unknown-as-text',
      warnings: [`未対応の形式: ${fileType}`]
    };

  } catch (error) {
    console.error('[MD Converter] Error:', error);
    return createFallbackResult(content, fileName, error);
  }
}

// ============================================
// フォールバック
// ============================================

function createFallbackResult(
  content: string | Buffer,
  fileName: string,
  error: unknown
): ConversionResult {
  const text = bufferToString(content);
  return {
    markdown: normalizeText(text),
    confidence: 0.30,
    method: 'error-fallback',
    warnings: [`変換エラー: ${error}`],
    documents: [
      new Document({
        pageContent: normalizeText(text),
        metadata: { source: fileName, converter: 'fallback' }
      })
    ]
  };
}

// ============================================
// 型・ユーティリティのエクスポート
// ============================================

export type { ConversionResult } from './types';

// ファイル形式判定
export { isPdfFile } from './utils/file-detection';

// PDF関連
export { getPdfWarning, getPdfGuideUrl };

// 安全性処理
export { extractPreservedBlocks, extractSafetyIds };
