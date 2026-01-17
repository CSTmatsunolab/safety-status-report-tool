// src/lib/markdown-parser.ts
// Markdownコンテンツをパースして構造化データに変換するユーティリティ

export interface ParsedBlock {
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'paragraph' | 'listItem' | 'numberedListItem' | 'table' | 'hr' | 'blockquote' | 'code';
  text: string;
  level?: number;
  number?: number;
  rows?: string[][];
  headers?: string[];
}

/**
 * ## 1. → 1. に修正（番号付きリストの誤ったMarkdown記法を修正）
 */
export function fixNumberedLists(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  const jaSectionKeywords = [
    'エグゼクティブサマリー', '現状分析', 'リスク評価', '推奨事項',
    '次のステップ', '付録', '概要', '背景', '目的', '結論',
    'まとめ', '分析', '評価', '提言', '対策', '要約',
    '調査結果', '考察', '方法', '導入', '序論', '本論',
  ];
  
  const enSectionKeywords = [
    'Executive Summary', 'Current Status', 'Risk Assessment',
    'Recommendations', 'Next Steps', 'Appendix', 'Overview',
    'Background', 'Purpose', 'Conclusion', 'Summary',
    'Analysis', 'Evaluation', 'Introduction', 'Methodology',
    'Findings', 'Discussion', 'Results',
  ];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    const match = line.match(/^## (\d+)\. (.+)$/);
    if (match) {
      const num = match[1];
      const content = match[2];
      
      let isSectionHeading = false;
      
      if (parseInt(num) <= 10) {
        for (const keyword of [...jaSectionKeywords, ...enSectionKeywords]) {
          if (content.includes(keyword)) {
            isSectionHeading = true;
            break;
          }
        }
      }
      
      // 短い見出し（30文字以下）で太字でない場合はセクション見出し
      if (!isSectionHeading && content.length <= 30 && !content.startsWith('**')) {
        isSectionHeading = true;
      }
      
      if (!isSectionHeading) {
        line = `${num}. ${content}`;
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
}

/**
 * Markdownコンテンツをパースして構造化ブロックの配列に変換
 */
export function parseMarkdown(content: string): ParsedBlock[] {
  const fixedContent = fixNumberedLists(content);
  const lines = fixedContent.split('\n');
  const blocks: ParsedBlock[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed) {
      i++;
      continue;
    }
    
    // H1: # で始まる行
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      blocks.push({ type: 'h1', text: trimmed.substring(2).trim(), level: 1 });
      i++;
      continue;
    }
    
    // H2: ## で始まる行
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      blocks.push({ type: 'h2', text: trimmed.substring(3).trim(), level: 2 });
      i++;
      continue;
    }
    
    // H3: ### で始まる行
    if (trimmed.startsWith('### ') && !trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h3', text: trimmed.substring(4).trim(), level: 3 });
      i++;
      continue;
    }
    
    // H4: #### で始まる行
    if (trimmed.startsWith('#### ')) {
      blocks.push({ type: 'h4', text: trimmed.substring(5).trim(), level: 4 });
      i++;
      continue;
    }
    
    // 水平線
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      blocks.push({ type: 'hr', text: '' });
      i++;
      continue;
    }
    
    // テーブル
    if (trimmed.startsWith('|')) {
      const tableResult = parseTable(lines, i);
      if (tableResult.block) {
        blocks.push(tableResult.block);
      }
      i = tableResult.nextIndex;
      continue;
    }
    
    // 番号付きリスト
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      blocks.push({
        type: 'numberedListItem',
        text: numberedMatch[2],
        number: parseInt(numberedMatch[1]),
      });
      i++;
      continue;
    }
    
    // 箇条書き
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const bulletText = trimmed.replace(/^[-*•]\s+/, '');
      blocks.push({ type: 'listItem', text: bulletText });
      i++;
      continue;
    }
    
    // 引用
    if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'blockquote', text: trimmed.substring(2).trim() });
      i++;
      continue;
    }
    
    // コードブロック
    if (trimmed.startsWith('```')) {
      const codeResult = parseCodeBlock(lines, i);
      if (codeResult.block) {
        blocks.push(codeResult.block);
      }
      i = codeResult.nextIndex;
      continue;
    }
    
    // 通常の段落
    blocks.push({ type: 'paragraph', text: trimmed });
    i++;
  }
  
  return blocks;
}

function parseTable(lines: string[], startIndex: number): { block: ParsedBlock | null; nextIndex: number } {
  const tableLines: string[] = [];
  let i = startIndex;
  
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    tableLines.push(lines[i].trim());
    i++;
  }
  
  if (tableLines.length < 2) {
    return { block: null, nextIndex: i };
  }
  
  const headers = tableLines[0]
    .split('|')
    .map((cell: string) => cell.trim())
    .filter((cell: string) => cell !== '');
  
  let dataStartIndex = 1;
  if (tableLines[1] && tableLines[1].includes('-')) {
    dataStartIndex = 2;
  }
  
  const rows: string[][] = [];
  for (let j = dataStartIndex; j < tableLines.length; j++) {
    const row = tableLines[j]
      .split('|')
      .map((cell: string) => cell.trim())
      .filter((cell: string) => cell !== '');
    if (row.length > 0) {
      rows.push(row);
    }
  }
  
  return {
    block: { type: 'table', text: '', headers, rows },
    nextIndex: i,
  };
}

function parseCodeBlock(lines: string[], startIndex: number): { block: ParsedBlock | null; nextIndex: number } {
  const codeLines: string[] = [];
  let i = startIndex + 1;
  
  while (i < lines.length && !lines[i].trim().startsWith('```')) {
    codeLines.push(lines[i]);
    i++;
  }
  
  if (i < lines.length) i++;
  
  return {
    block: { type: 'code', text: codeLines.join('\n') },
    nextIndex: i,
  };
}

/**
 * インラインMarkdownをHTMLに変換
 */
export function processInlineMarkdown(text: string): string {
  let result = text;
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/`(.+?)`/g, '<code>$1</code>');
  result = result.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  return result;
}

/**
 * インラインMarkdownを除去
 */
export function stripInlineMarkdown(text: string): string {
  let result = text;
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result.replace(/\*(.+?)\*/g, '$1');
  result = result.replace(/`(.+?)`/g, '$1');
  result = result.replace(/\[(.+?)\]\((.+?)\)/g, '$1');
  return result;
}

/**
 * ParsedBlockをHTML文字列に変換
 */
export function blocksToHtml(blocks: ParsedBlock[]): string {
  const htmlParts: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const nextBlock = blocks[i + 1];
    
    // リストの開始判定
    if ((block.type === 'listItem' || block.type === 'numberedListItem') && !inList) {
      inList = true;
      listType = block.type === 'numberedListItem' ? 'ol' : 'ul';
      htmlParts.push(`<${listType}>`);
    }
    
    switch (block.type) {
      case 'h1':
        htmlParts.push(`<h1>${processInlineMarkdown(block.text)}</h1>`);
        break;
      case 'h2':
        htmlParts.push(`<h2>${processInlineMarkdown(block.text)}</h2>`);
        break;
      case 'h3':
        htmlParts.push(`<h3>${processInlineMarkdown(block.text)}</h3>`);
        break;
      case 'h4':
        htmlParts.push(`<h4>${processInlineMarkdown(block.text)}</h4>`);
        break;
      case 'paragraph':
        htmlParts.push(`<p>${processInlineMarkdown(block.text)}</p>`);
        break;
      case 'listItem':
      case 'numberedListItem':
        htmlParts.push(`<li>${processInlineMarkdown(block.text)}</li>`);
        break;
      case 'blockquote':
        htmlParts.push(`<blockquote>${processInlineMarkdown(block.text)}</blockquote>`);
        break;
      case 'code':
        htmlParts.push(`<pre><code>${escapeHtml(block.text)}</code></pre>`);
        break;
      case 'hr':
        htmlParts.push('<hr>');
        break;
      case 'table':
        htmlParts.push(tableToHtml(block));
        break;
    }
    
    // リストの終了判定
    if (inList && nextBlock?.type !== 'listItem' && nextBlock?.type !== 'numberedListItem') {
      htmlParts.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  }
  
  // 最後のリストを閉じる
  if (inList && listType) {
    htmlParts.push(`</${listType}>`);
  }
  
  return htmlParts.join('\n');
}

function tableToHtml(block: ParsedBlock): string {
  if (!block.headers || !block.rows) return '';
  
  const headerRow = block.headers
    .map((h: string) => `<th>${processInlineMarkdown(h)}</th>`)
    .join('');
  
  const dataRows = block.rows
    .map((row: string[]) => {
      const cells = row.map((cell: string) => `<td>${processInlineMarkdown(cell)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');
  
  return `<table>
<thead><tr>${headerRow}</tr></thead>
<tbody>
${dataRows}
</tbody>
</table>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
