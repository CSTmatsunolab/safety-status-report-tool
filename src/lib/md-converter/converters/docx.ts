// lib/md-converter/converters/docx.ts
// DOCX変換（mammoth → HTML → MD）

import { Document } from '@langchain/core/documents';
import * as mammoth from 'mammoth';
import { ConversionResult } from '../types';
import { convertHtmlToMarkdown } from '../utils/html-to-md';
import { normalizeSafetyDocument } from '../safety/normalizer';

/**
 * DOCXファイルをMarkdownに変換
 */
export async function convertDocx(
  buffer: Buffer,
  fileName: string
): Promise<ConversionResult> {
  const warnings: string[] = [];

  try {
    // mammothでHTML変換（表・見出し・リスト構造を保持）
    const result = await mammoth.convertToHtml({ buffer });

    result.messages.forEach((msg: { type: string; message: string }) => {
      if (msg.type === 'warning') {
        warnings.push(`DOCX: ${msg.message}`);
      }
    });

    // HTML → Markdown
    const markdown = convertHtmlToMarkdown(result.value);
    const normalized = normalizeSafetyDocument(markdown);

    const documents = [
      new Document({
        pageContent: normalized,
        metadata: {
          source: fileName,
          fileType: 'docx',
          converter: 'mammoth'
        }
      })
    ];

    console.log(`[DOCX] mammoth → HTML → MD: ${normalized.length} chars`);

    return {
      markdown: normalized,
      confidence: 0.90,
      method: 'mammoth-html-to-md',
      warnings,
      documents
    };

  } catch (error) {
    console.error('[DOCX] Failed:', error);
    return {
      markdown: '',
      confidence: 0,
      method: 'docx-failed',
      warnings: [`DOCX変換エラー: ${error}`]
    };
  }
}
