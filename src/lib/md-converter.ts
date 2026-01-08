// lib/md-converter.ts
// MD変換モジュール（独自実装版）
// - MD: スキップ
// - DOCX: mammoth → HTML → MD（構造保持）
// - CSV/JSON/TXT/HTML/XLSX/XML: 独自実装

import { Document } from '@langchain/core/documents';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// ============================================
// 型定義
// ============================================

export interface ConversionResult {
  markdown: string;
  confidence: number;
  method: string;
  warnings: string[];
  documents?: Document[];
  skipped?: boolean;
}

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
  if (lowerFileName.endsWith('.md')) {
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
// DOCX変換（mammoth → HTML → MD）
// ============================================

async function convertDocx(
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

// ============================================
// CSV変換
// ============================================

function convertCsv(content: string, fileName: string): ConversionResult {
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

// ============================================
// JSON変換
// ============================================

function convertJson(content: string, fileName: string): ConversionResult {
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

// ============================================
// TXT変換
// ============================================

function convertTxt(content: string, fileName: string): ConversionResult {
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

// ============================================
// HTML変換
// ============================================

function convertHtml(content: string, fileName: string): ConversionResult {
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

// ============================================
// Excel変換
// ============================================

function convertExcel(buffer: Buffer, fileName: string): ConversionResult {
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

// ============================================
// XML変換
// ============================================

function convertXml(content: string, fileName: string): ConversionResult {
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

// ============================================
// PDF処理（パススルー + 変換を促す警告）
// ============================================

const PDF_GUIDE_URL = '/pdf-conversion-guide.html';

function createPdfWarningResult(content: string | Buffer, fileName: string): ConversionResult {
  const text = bufferToString(content);
  
  console.log(`[PDF] Passthrough with warning: ${fileName}`);
  
  return {
    markdown: normalizeText(text),
    confidence: 0.5,
    method: 'pdf-passthrough',
    warnings: [
      getPdfConversionPrompt(fileName)
    ],
    documents: [
      new Document({
        pageContent: normalizeText(text),
        metadata: { source: fileName, fileType: 'pdf', converter: 'passthrough' }
      })
    ]
  };
}

function getPdfConversionPrompt(fileName: string): string {
  return `📄 「${fileName}」はPDF形式です

PDF形式は構造情報（表・見出し・リスト）が失われやすく、
レポート精度が低下する可能性があります。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 推奨: Markdown または DOCX に変換してアップロード
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【方法1】Google Docs経由（推奨・無料）
  1. Google Drive (https://drive.google.com) にPDFをアップロード
  2. PDFを右クリック →「アプリで開く」→「Googleドキュメント」
  3.「ファイル」→「ダウンロード」→「Markdown (.md)」
  4. ダウンロードした .md ファイルをアップロード

【方法2】Microsoft Word
  1. WordでPDFを開く（「ファイル」→「開く」）
  2.「名前を付けて保存」→ .docx 形式で保存
  3. .docx ファイルをアップロード

【方法3】元のDOCXがある場合
  → PDFではなく元のDOCXファイルをアップロードしてください

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
詳しい手順: ${PDF_GUIDE_URL}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

export function getPdfWarning(): string {
  return `⚠️ PDF形式は精度が低下する可能性があります。
Markdown または DOCX に変換することを推奨します。
詳細: ${PDF_GUIDE_URL}`;
}

export function getPdfGuideUrl(): string {
  return PDF_GUIDE_URL;
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
// HTML → Markdown変換（DOCX・HTMLで共通使用）
// ============================================

function convertHtmlToMarkdown(html: string): string {
  let md = html;

  // 見出し
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // 段落・改行
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n$1\n');

  // 強調
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // リンク
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // リスト
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '\n$1\n');
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '\n$1\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  // figure + figcaption（図表番号付き）
  md = md.replace(/<figure[^>]*>([\s\S]*?)<\/figure>/gi, (_, figureContent: string) => {
    // figcaptionを抽出
    const captionMatch = figureContent.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    const caption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    // figcaptionを除いた内容
    const contentWithoutCaption = figureContent.replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, '');
    
    // 表があるかチェック
    const tableMatch = contentWithoutCaption.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const tableContent = convertHtmlTableToMarkdown(tableMatch[1]);
      // キャプションを表の前に配置
      return caption ? `\n${caption}\n\n${tableContent}\n` : `\n${tableContent}\n`;
    }
    
    // 画像があるかチェック
    const imgMatch = contentWithoutCaption.match(/<img[^>]*>/i);
    if (imgMatch) {
      // 画像はそのまま（または![caption]形式に）
      return caption ? `\n${caption}\n\n[画像]\n` : '\n[画像]\n';
    }
    
    // その他のfigure内容
    return caption ? `\n${caption}\n` : '';
  });

  // 表
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent: string) => {
    return '\n' + convertHtmlTableToMarkdown(tableContent) + '\n';
  });

  // コード
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // 水平線
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // タグ除去
  md = md.replace(/<[^>]+>/g, '');

  // HTMLエンティティ
  md = decodeHtmlEntities(md);

  // 整理
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

function convertHtmlTableToMarkdown(tableHtml: string): string {
  // captionを抽出
  const captionMatch = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  const caption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  
  const rows: string[][] = [];
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

  for (const rowHtml of rowMatches) {
    const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    const row = cellMatches.map(cell =>
      cell.replace(/<[^>]+>/g, '').replace(/\|/g, '\\|').trim()
    );
    if (row.length > 0) rows.push(row);
  }

  const table = arrayToMarkdownTable(rows);
  
  // キャプションがあれば表の前に追加
  return caption ? `${caption}\n\n${table}` : table;
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&yen;': '¥', '&copy;': '©', '&reg;': '®',
    '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
    '&laquo;': '«', '&raquo;': '»',
    '&bull;': '•', '&middot;': '·'
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'gi'), char);
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
}

// ============================================
// ファイル形式判定
// ============================================

function isDocxFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  );
}

function isExcelFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  );
}

function isCsvFile(fileType: string, fileName: string): boolean {
  return fileType === 'text/csv' || fileName.endsWith('.csv');
}

function isJsonFile(fileType: string, fileName: string): boolean {
  return fileType === 'application/json' || fileName.endsWith('.json');
}

function isHtmlFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'text/html' ||
    fileName.endsWith('.html') ||
    fileName.endsWith('.htm')
  );
}

function isTextFile(fileType: string, fileName: string): boolean {
  return fileType === 'text/plain' || fileName.endsWith('.txt');
}

function isXmlFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'application/xml' ||
    fileType === 'text/xml' ||
    fileName.endsWith('.xml')
  );
}

export function isPdfFile(fileType: string, fileName: string): boolean {
  return fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

// ============================================
// ユーティリティ
// ============================================

function bufferToString(content: string | Buffer): string {
  return typeof content === 'string' ? content : content.toString('utf-8');
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
  md = md.replace(/^[・●◆■◇□▪▫]\s*/gm, '- ');
  md = md.replace(/^\*\s+/gm, '- ');

  // ===== 整理 =====
  // 連続する空行を2つに制限
  md = md.replace(/\n{3,}/g, '\n\n');
  
  return md.trim();
}

/**
 * タブ区切りのテキストを Markdown 表に変換
 * Google Docs などからエクスポートされた表形式に対応
 * 
 * 2つの形式に対応:
 * 1. 標準形式: 1行にタブ区切りで複数セル
 * 2. Google Docs形式: 各セルが別の行でタブインデント
 */
function convertTabSeparatedTables(text: string): string {
  // まず Google Docs 形式を検出・変換
  let md = convertGoogleDocsTableFormat(text);
  
  // 次に標準のタブ区切り形式を変換
  md = convertStandardTabSeparatedTables(md);
  
  return md;
}

/**
 * Google Docs形式の表を変換
 * パターン: 最初のセルがタブなし、続くセルがタブ付きで別行
 */
function convertGoogleDocsTableFormat(text: string): string {
  // CRLF → LF 正規化（Windows形式の改行対応）
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // タブで始まる行のブロックを探す
    if (i + 1 < lines.length && lines[i + 1].startsWith('\t')) {
      // 連続するタブ付き行を収集
      const block: string[] = [trimmed];
      let j = i + 1;
      
      while (j < lines.length && lines[j].startsWith('\t')) {
        block.push(lines[j].replace(/^\t/, '').trim());
        j++;
      }
      
      // 空のセルを除去
      const filteredBlock = block.filter(c => c !== '');
      
      // ブロックが表らしいかチェック（3個以上のセル）
      if (filteredBlock.length >= 3) {
        // 列数を推測（最初のいくつかのセルがヘッダー）
        const numColumns = guessColumnCount(filteredBlock);
        
        if (numColumns >= 2 && filteredBlock.length >= numColumns * 2) {
          // 表として変換
          const table = convertBlockToTable(filteredBlock, numColumns);
          result.push(table);
          i = j;
          continue;
        }
      }
      
      // 表ではない場合はそのまま出力
      result.push(line);
      i++;
    } else {
      result.push(line);
      i++;
    }
  }
  
  return result.join('\n');
}

/**
 * セルブロックから列数を推測
 */
function guessColumnCount(cells: string[]): number {
  // 一般的な表ヘッダーパターンを検出
  const commonHeaders = [
    ['コンポーネント', '責務', '入出力'],  // 3列
    ['項目', '内容', '備考'],               // 3列
    ['名前', '説明', '値'],                 // 3列
    ['ID', '名称', '状態'],                 // 3列
  ];
  
  // 最初の数セルでパターンマッチ
  for (const headers of commonHeaders) {
    let matches = 0;
    for (let i = 0; i < Math.min(headers.length, cells.length); i++) {
      if (cells[i].includes(headers[i]) || headers[i].includes(cells[i])) {
        matches++;
      }
    }
    if (matches >= 2) {
      return headers.length;
    }
  }
  
  // セル数が特定の倍数になるか確認
  for (const cols of [3, 4, 2, 5]) {
    if (cells.length % cols === 0 && cells.length / cols >= 2) {
      return cols;
    }
  }
  
  return 3;  // デフォルト3列
}

/**
 * セルブロックを Markdown 表に変換
 */
function convertBlockToTable(cells: string[], numColumns: number): string {
  const rows: string[][] = [];
  
  for (let i = 0; i < cells.length; i += numColumns) {
    const row: string[] = [];
    for (let j = 0; j < numColumns; j++) {
      const cell = cells[i + j] || '';
      row.push(cell.replace(/\|/g, '\\|').trim());
    }
    rows.push(row);
  }
  
  if (rows.length < 2) return cells.join(' ');
  
  const header = `| ${rows[0].join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const dataRows = rows.slice(1).map(row => `| ${row.join(' | ')} |`);
  
  return '\n' + [header, separator, ...dataRows].join('\n') + '\n';
}

/**
 * 標準のタブ区切り形式を変換（1行に複数セル）
 */
function convertStandardTabSeparatedTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let tableBuffer: string[][] = [];
  let inTable = false;
  let expectedColumns = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // タブを含む行を検出（ただしタブで始まる行は除外 - Google Docs形式で処理済み）
    if (trimmed.includes('\t') && !line.startsWith('\t')) {
      const cells = trimmed.split('\t').map(c => c.trim());
      
      if (cells.length >= 2) {
        if (!inTable) {
          inTable = true;
          expectedColumns = cells.length;
          tableBuffer = [cells];
        } else if (cells.length === expectedColumns || 
                   (cells.length >= 2 && Math.abs(cells.length - expectedColumns) <= 1)) {
          tableBuffer.push(cells);
        } else {
          if (tableBuffer.length >= 2) {
            result.push(convertTableBufferToMarkdown(tableBuffer));
          } else if (tableBuffer.length === 1) {
            result.push(tableBuffer[0].join(' '));
          }
          tableBuffer = [cells];
          expectedColumns = cells.length;
        }
        continue;
      }
    }
    
    if (inTable) {
      if (trimmed === '' && i + 1 < lines.length && 
          lines[i + 1].includes('\t') && !lines[i + 1].startsWith('\t')) {
        continue;
      }
      
      if (tableBuffer.length >= 2) {
        result.push(convertTableBufferToMarkdown(tableBuffer));
      } else if (tableBuffer.length === 1) {
        result.push(tableBuffer[0].join(' '));
      }
      
      tableBuffer = [];
      inTable = false;
      expectedColumns = 0;
    }
    
    result.push(line);
  }
  
  if (tableBuffer.length >= 2) {
    result.push(convertTableBufferToMarkdown(tableBuffer));
  } else if (tableBuffer.length === 1) {
    result.push(tableBuffer[0].join(' '));
  }
  
  return result.join('\n');
}

/**
 * 表バッファを Markdown 表に変換
 */
function convertTableBufferToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return '';
  
  // 最大列数を取得
  const maxCols = Math.max(...rows.map(row => row.length));
  if (maxCols === 0) return '';
  
  // 各行を正規化（列数を揃える）
  const normalizedRows = rows.map(row => {
    const normalized: string[] = [];
    for (let i = 0; i < maxCols; i++) {
      const cell = row[i] || '';
      normalized.push(cell.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
    }
    return normalized;
  });
  
  // Markdown 表を生成
  const header = `| ${normalizedRows[0].join(' | ')} |`;
  const separator = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
  const dataRows = normalizedRows.slice(1).map(row => `| ${row.join(' | ')} |`);
  
  return '\n' + [header, separator, ...dataRows].join('\n') + '\n';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function arrayToMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return '';

  const maxCols = Math.max(...rows.map(row => row.length));
  if (maxCols === 0) return '';

  const normalizedRows = rows.map(row => {
    const normalized: string[] = [];
    for (let i = 0; i < maxCols; i++) {
      const cell = row[i];
      const cellStr = cell === null || cell === undefined ? '' : String(cell);
      normalized.push(cellStr.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
    }
    return normalized;
  });

  const header = `| ${normalizedRows[0].join(' | ')} |`;
  const separator = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
  const dataRows = normalizedRows.slice(1).map(row => `| ${row.join(' | ')} |`);

  return [header, separator, ...dataRows].join('\n');
}

function createRowDocuments(rows: string[][], fileName: string, fileType: string): Document[] {
  if (rows.length <= 1) return [];

  const headers = rows[0];
  return rows.slice(1).map((row, index) => {
    const content = headers.map((h, i) => `${h}: ${row[i] || ''}`).join('\n');
    return new Document({
      pageContent: content,
      metadata: {
        source: fileName,
        fileType,
        converter: 'custom',
        line: index + 2
      }
    });
  });
}

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

// ============================================
// 安全性文書の正規化
// ============================================

function normalizeSafetyDocument(text: string): string {
  let normalized = text;

  // ID強調（既に太字でない場合のみ）
  normalized = normalized.replace(
    /(?<!\*\*)\b(H-\d{3}|SR-\d{3}|R-\d{3})\b(?!\*\*)/g,
    '**$1**'
  );
  normalized = normalized.replace(
    /(?<!\*\*)\b(G\d+(?:\.\d+)*|S\d+(?:\.\d+)*|Sn\d+|C\d+)\b(?!\*\*)/g,
    '**$1**'
  );

  // 保護マーカー
  normalized = addPreserveMarkers(normalized);

  return normalized;
}

// 図表番号パターン（様々なファイル形式に対応）
const CAPTION_PATTERNS = [
  // 日本語（数字あり）
  /^表\s*[0-9０-９]+[.:：\s]/i,           // 表1: 表 1. 表１：
  /^図\s*[0-9０-９]+[.:：\s]/i,           // 図1: 図 1. 図１：
  /^リスト\s*[0-9０-９]+[.:：\s]/i,       // リスト1:
  /^一覧\s*[0-9０-９]+[.:：\s]/i,         // 一覧1:
  /^チャート\s*[0-9０-９]+[.:：\s]/i,     // チャート1:
  /^グラフ\s*[0-9０-９]+[.:：\s]/i,       // グラフ1:
  /^ダイアグラム\s*[0-9０-９]+[.:：\s]/i, // ダイアグラム1:
  /^コード\s*[0-9０-９]+[.:：\s]/i,       // コード1:
  /^ソースコード\s*[0-9０-９]+[.:：\s]/i, // ソースコード1:
  /^スニペット\s*[0-9０-９]+[.:：\s]/i,   // スニペット1:
  /^例\s*[0-9０-９]+[.:：\s]/i,           // 例1:
  /^サンプル\s*[0-9０-９]+[.:：\s]/i,     // サンプル1:
  
  // 日本語（「について」パターン - Wordの自動番号対応）
  /^表\s*.{0,30}について$/i,              // 表　ADR-101について
  /^図\s*.{0,30}について$/i,              // 図　システム構成について
  /^表\s*.{0,30}一覧$/i,                  // 表　コンポーネント一覧
  /^図\s*.{0,30}概要$/i,                  // 図　アーキテクチャ概要
  
  // 英語
  /^Table\s*[0-9]+[.:：\s]/i,             // Table 1: Table 1.
  /^Figure\s*[0-9]+[.:：\s]/i,            // Figure 1:
  /^Fig\.\s*[0-9]+[.:：\s]/i,             // Fig. 1:
  /^List\s*[0-9]+[.:：\s]/i,              // List 1:
  /^Listing\s*[0-9]+[.:：\s]/i,           // Listing 1:
  /^Chart\s*[0-9]+[.:：\s]/i,             // Chart 1:
  /^Diagram\s*[0-9]+[.:：\s]/i,           // Diagram 1:
  /^Graph\s*[0-9]+[.:：\s]/i,             // Graph 1:
  /^Code\s*[0-9]+[.:：\s]/i,              // Code 1:
  /^Snippet\s*[0-9]+[.:：\s]/i,           // Snippet 1:
  /^Example\s*[0-9]+[.:：\s]/i,           // Example 1:
  /^Sample\s*[0-9]+[.:：\s]/i,            // Sample 1:
  
  // 略称・記号パターン
  /^\[表\s*[0-9０-９]+\]/i,               // [表1]
  /^\[図\s*[0-9０-９]+\]/i,               // [図1]
  /^\[Table\s*[0-9]+\]/i,                 // [Table 1]
  /^\[Figure\s*[0-9]+\]/i,                // [Figure 1]
  /^\[Fig\.\s*[0-9]+\]/i,                 // [Fig. 1]
  /^\[Code\s*[0-9]+\]/i,                  // [Code 1]
  
  // 括弧付きパターン
  /^【表\s*[0-9０-９]+】/i,               // 【表1】
  /^【図\s*[0-9０-９]+】/i,               // 【図1】
  /^【コード\s*[0-9０-９]+】/i,           // 【コード1】
  
  // コロンなしパターン（番号の後に直接タイトル）
  /^表[0-9０-９]+\s+\S/,                  // 表1 コンポーネント一覧
  /^図[0-9０-９]+\s+\S/,                  // 図1 システム構成
  /^Table\s*[0-9]+\s+\S/i,                // Table 1 Components
  /^Figure\s*[0-9]+\s+\S/i,               // Figure 1 Architecture
];

/**
 * 図表番号パターンに一致するかチェック
 */
function isCaptionLine(line: string): boolean {
  let trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return false;  // 最低3文字
  
  // 太字マーカーを除去して判定（**表1** のようなパターン対応）
  trimmed = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  
  // 明確なパターンに一致
  if (CAPTION_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }
  
  // 「表」「図」で始まり、短い行（5〜50文字）で、文末が「。」でない
  // → 図表タイトルは通常「。」で終わらない
  if (/^[表図]/.test(trimmed) && 
      trimmed.length >= 5 && 
      trimmed.length <= 50 &&
      !trimmed.endsWith('。') &&
      !trimmed.endsWith('．')) {
    return true;
  }
  
  return false;
}

/**
 * 保護マーカーを追加（表と図表番号を一緒に保護）
 * - 表の直前にある図表番号（キャプション）
 * - 表の直後にある図表番号（キャプション）
 * - 図表番号と表の間に空行があっても対応
 */
function addPreserveMarkers(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;
  let pendingCaption: string[] = [];  // 図表番号（複数行対応）

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const isTableRow = /^\|/.test(trimmedLine);
    const isCaption = isCaptionLine(trimmedLine);
    const isEmpty = trimmedLine === '';
    
    // 先読み：この行から数行先に表があるか確認
    const tableAhead = findTableAhead(lines, i + 1, 3);  // 最大3行先まで

    if (isTableRow && !inTable) {
      // 表の開始
      inTable = true;
      result.push('<!-- PRESERVE_START -->');
      
      // 保留中の図表番号があれば先に追加
      if (pendingCaption.length > 0) {
        pendingCaption.forEach(cap => result.push(cap));
        pendingCaption = [];
      }
      
      result.push(line);
    } else if (!isTableRow && inTable) {
      // 表の終了の可能性
      
      // 空行の場合は次の行もチェック
      if (isEmpty) {
        const nextNonEmptyLine = findNextNonEmptyLine(lines, i + 1);
        if (nextNonEmptyLine && isCaptionLine(nextNonEmptyLine)) {
          // 表の直後に図表番号がある → 図表番号も含めて保護を継続
          result.push(line);  // 空行を追加
          continue;
        }
      }
      
      // 図表番号の場合は表と一緒に保護
      if (isCaption) {
        result.push(line);  // 図表番号を追加
        result.push('<!-- PRESERVE_END -->');
        inTable = false;
        continue;
      }
      
      // 通常の表終了
      result.push('<!-- PRESERVE_END -->');
      inTable = false;
      
      // 現在の行が次の表の図表番号かチェック
      if (isCaption && tableAhead) {
        pendingCaption.push(line);
      } else {
        result.push(line);
      }
    } else if (isCaption && tableAhead && !inTable) {
      // 表の直前にある図表番号 → 保留して次の表と一緒に保護
      pendingCaption.push(line);
    } else if (isEmpty && pendingCaption.length > 0 && tableAhead) {
      // 図表番号の後の空行で、まだ表が来る → 保留に追加
      pendingCaption.push(line);
    } else {
      // 通常の行
      if (pendingCaption.length > 0 && !isTableRow && !tableAhead) {
        // 保留中の図表番号があるが、表が来なかった → 通常出力
        pendingCaption.forEach(cap => result.push(cap));
        pendingCaption = [];
      }
      result.push(line);
    }
  }

  // 最後の処理
  if (pendingCaption.length > 0) {
    pendingCaption.forEach(cap => result.push(cap));
  }
  if (inTable) {
    result.push('<!-- PRESERVE_END -->');
  }

  return result.join('\n');
}

/**
 * 指定位置から次の非空行を探す
 */
function findNextNonEmptyLine(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < lines.length && i < startIndex + 3; i++) {
    const trimmed = lines[i].trim();
    if (trimmed !== '') {
      return trimmed;
    }
  }
  return null;
}

/**
 * 指定位置から数行先に表があるかチェック
 */
function findTableAhead(lines: string[], startIndex: number, maxLines: number): boolean {
  for (let i = startIndex; i < lines.length && i < startIndex + maxLines; i++) {
    const trimmed = lines[i].trim();
    if (/^\|/.test(trimmed)) {
      return true;  // 表が見つかった
    }
    if (trimmed !== '' && !isCaptionLine(trimmed)) {
      return false;  // 表以外の内容が見つかった
    }
  }
  return false;
}

// ============================================
// エクスポート関数
// ============================================

export function extractPreservedBlocks(text: string): {
  preservedBlocks: string[];
  remainingText: string;
} {
  const blocks: string[] = [];
  const pattern = /<!-- PRESERVE_START -->([\s\S]*?)<!-- PRESERVE_END -->/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const block = match[1].trim();
    if (block) blocks.push(block);
  }

  const remaining = text
    .replace(pattern, '\n[TABLE_BLOCK]\n')
    .replace(/\n{3,}/g, '\n\n');

  return { preservedBlocks: blocks, remainingText: remaining };
}

export function extractSafetyIds(text: string): string[] {
  const ids: string[] = [];
  const hazardMatches = text.match(/H-\d{3}/g) || [];
  const srMatches = text.match(/SR-\d{3}/g) || [];
  const riskMatches = text.match(/R-\d{3}/g) || [];
  const gsnMatches = text.match(/\b(G\d+(?:\.\d+)*|S\d+(?:\.\d+)*|Sn\d+|C\d+)\b/g) || [];

  ids.push(...hazardMatches, ...srMatches, ...riskMatches, ...gsnMatches);
  return [...new Set(ids)];
}