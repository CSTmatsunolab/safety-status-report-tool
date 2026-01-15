// lib/md-converter/converters/pdf.ts
// PDF処理（パススルー + 変換を促す警告）

import { Document } from '@langchain/core/documents';
import { ConversionResult } from '../types';
import { bufferToString, normalizeText } from '../utils/text-utils';

const PDF_GUIDE_URL = '/pdf-conversion-guide.html';

/**
 * PDFファイルの警告付きパススルー
 */
export function createPdfWarningResult(content: string | Buffer, fileName: string): ConversionResult {
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

/**
 * PDF変換プロンプトの生成
 */
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

/**
 * PDF警告メッセージの取得
 */
export function getPdfWarning(): string {
  return `⚠️ PDF形式は精度が低下する可能性があります。
Markdown または DOCX に変換することを推奨します。
詳細: ${PDF_GUIDE_URL}`;
}

/**
 * PDFガイドURLの取得
 */
export function getPdfGuideUrl(): string {
  return PDF_GUIDE_URL;
}
