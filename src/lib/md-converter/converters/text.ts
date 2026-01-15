// lib/md-converter/converters/text.ts
// TXT/JSON/XML/HTML変換

import { Document } from '@langchain/core/documents';
import { ConversionResult } from '../types';
import { convertHtmlToMarkdown } from '../utils/html-to-md';
import { normalizeSafetyDocument } from '../safety/normalizer';
import { convertTabSeparatedTables } from '../utils/table-utils';

/**
 * テキストファイルをMarkdownに変換
 */
export function convertTxt(content: string, fileName: string): ConversionResult {
  const markdown = enhanceTextToMarkdown(content);
  const normalized = normalizeSafetyDocument(markdown);

  const documents = [
    new Document({
      pageContent: normalized,
      metadata: {
        source: fileName,
        fileType: 'txt',
        converter: 'custom'
      }
    })
  ];

  console.log(`[TXT] Enhanced to MD: ${normalized.length} chars`);

  return {
    markdown: normalized,
    confidence: 0.90,
    method: 'txt-to-md',
    warnings: [],
    documents
  };
}

/**
 * HTMLファイルをMarkdownに変換
 */
export function convertHtml(content: string, fileName: string): ConversionResult {
  const markdown = convertHtmlToMarkdown(content);
  const normalized = normalizeSafetyDocument(markdown);

  const documents = [
    new Document({
      pageContent: normalized,
      metadata: {
        source: fileName,
        fileType: 'html',
        converter: 'custom'
      }
    })
  ];

  console.log(`[HTML] Converted to MD: ${normalized.length} chars`);

  return {
    markdown: normalized,
    confidence: 0.85,
    method: 'html-to-md',
    warnings: [],
    documents
  };
}

/**
 * JSONファイルをMarkdownに変換
 */
export function convertJson(content: string, fileName: string): ConversionResult {
  try {
    const json = JSON.parse(content);
    const markdown = formatJsonToMarkdown(json);
    const normalized = normalizeSafetyDocument(markdown);

    const documents = [
      new Document({
        pageContent: normalized,
        metadata: {
          source: fileName,
          fileType: 'json',
          converter: 'custom'
        }
      })
    ];

    console.log(`[JSON] Converted to MD`);

    return {
      markdown: normalized,
      confidence: 0.90,
      method: 'json-to-md',
      warnings: [],
      documents
    };

  } catch (error) {
    console.error('[JSON] Parse failed:', error);
    return {
      markdown: '```json\n' + content + '\n```',
      confidence: 0.50,
      method: 'json-raw',
      warnings: ['JSONパース失敗']
    };
  }
}

/**
 * XMLファイルをMarkdownに変換
 */
export function convertXml(content: string, fileName: string): ConversionResult {
  let markdown = content;

  // XML宣言・コメント除去
  markdown = markdown.replace(/<\?xml[^>]*\?>/gi, '');
  markdown = markdown.replace(/<!--[\s\S]*?-->/g, '');

  // タグを見出し風に変換
  markdown = markdown.replace(/<([a-z0-9_-]+)([^>]*)>/gi, '\n**$1**: ');
  markdown = markdown.replace(/<\/[a-z0-9_-]+>/gi, '\n');

  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  const normalized = normalizeSafetyDocument(markdown);

  console.log(`[XML] Converted to MD`);

  return {
    markdown: normalized,
    confidence: 0.70,
    method: 'xml-to-md',
    warnings: ['XMLは簡易変換'],
    documents: [
      new Document({
        pageContent: normalized,
        metadata: { source: fileName, fileType: 'xml', converter: 'custom' }
      })
    ]
  };
}

/**
 * テキストをMarkdownに拡張変換
 */
function enhanceTextToMarkdown(text: string): string {
  let md = text;

  // ===== 前処理 =====
  
  // CRLF → LF 正規化（Windows形式の改行対応）
  md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // BOM除去
  md = md.replace(/^\uFEFF/, '');
  
  // 区切り線を正規化（________________ → ---）
  md = md.replace(/^[_]{3,}$/gm, '\n---\n');
  md = md.replace(/^[-]{3,}$/gm, '\n---\n');
  md = md.replace(/^[=]{3,}$/gm, '\n---\n');
  
  // ===== タブ区切り表の検出と変換 =====
  md = convertTabSeparatedTables(md);
  
  // ===== 見出しパターン検出 =====
  
  // ADR-XXX：設計判断 のようなパターン → # 見出し
  md = md.replace(/^(ADR-\d+[：:].+)$/gm, '\n# $1\n');
  
  // 「要約」「概要」「目的」「背景」などの単独行 → # 見出し
  md = md.replace(/^(要約|概要|目的|背景|結論|まとめ|参考|付録|補足)$/gm, '\n# $1\n');
  
  // 「関連・参照」のようなパターン → ## 見出し
  md = md.replace(/^(関連・参照[（(].+[)）]?)$/gm, '\n## $1\n');
  md = md.replace(/^(関連・参照)$/gm, '\n## $1\n');
  
  // 番号付き見出し（1. 2. など）
  md = md.replace(/^(\d+\.)\s+([^\n]+)/gm, '## $1 $2');
  md = md.replace(/^(\d+\.\d+)\s+([^\n]+)/gm, '### $1 $2');
  md = md.replace(/^(\d+\.\d+\.\d+)\s+([^\n]+)/gm, '#### $1 $2');

  // ===== 箇条書き正規化 =====
  md = md.replace(/^[・◆◇■□▪▫]\s*/gm, '- ');
  md = md.replace(/^\*\s+/gm, '- ');

  // ===== 整理 =====
  // 連続する空行を2つに制限
  md = md.replace(/\n{3,}/g, '\n\n');
  
  return md.trim();
}

/**
 * JSONをMarkdownに整形
 */
function formatJsonToMarkdown(json: unknown, indent: number = 0): string {
  const prefix = '  '.repeat(indent);

  if (json === null || json === undefined) return `${prefix}(なし)`;

  if (Array.isArray(json)) {
    if (json.length === 0) return `${prefix}(空の配列)`;
    return json.map((item, i) => 
      `${prefix}### Item ${i + 1}\n\n${formatJsonToMarkdown(item, indent)}`
    ).join('\n\n');
  }

  if (typeof json === 'object') {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${prefix}- **${key}**:`);
        lines.push(formatJsonToMarkdown(value, indent + 1));
      } else {
        lines.push(`${prefix}- **${key}**: ${value}`);
      }
    }
    return lines.join('\n');
  }

  return `${prefix}${json}`;
}
