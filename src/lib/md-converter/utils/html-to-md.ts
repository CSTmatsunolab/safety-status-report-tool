// lib/md-converter/utils/html-to-md.ts
// HTML → Markdown変換ユーティリティ

import { arrayToMarkdownTable } from './table-utils';
import { decodeHtmlEntities } from './text-utils';

/**
 * HTMLをMarkdownに変換
 */
export function convertHtmlToMarkdown(html: string): string {
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

/**
 * HTML表をMarkdownに変換
 */
export function convertHtmlTableToMarkdown(tableHtml: string): string {
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
