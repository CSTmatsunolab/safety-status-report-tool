// src/lib/html-exporter.ts
// Markdown対応版 HTML エクスポーター

import { Report } from '@/types';
import { formatDate } from '@/lib/date-utils';
import { parseMarkdown, blocksToHtml } from '@/lib/markdown-parser';

export interface HTMLOptions {
  includeMetadata?: boolean;
  includeTimestamp?: boolean;
  includeStyles?: boolean;
  language?: 'ja' | 'en';
  customStyles?: string;
}

/**
 * デフォルトのCSSスタイル
 */
const defaultStyles = `
  * {
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Noto Sans JP', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.8;
    color: #333;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 20px;
    background-color: #f5f5f5;
  }
  
  .container {
    background-color: white;
    padding: 60px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  }
  
  h1 {
    font-size: 1.8rem;
    font-weight: 700;
    color: #1a1a1a;
    margin-top: 0;
    margin-bottom: 1rem;
    padding-bottom: 0.8rem;
    border-bottom: 3px solid #0066cc;
  }
  
  h2 {
    font-size: 1.4rem;
    font-weight: 600;
    color: #2c3e50;
    margin-top: 2rem;
    margin-bottom: 0.8rem;
    padding: 0.5rem 0 0.5rem 1rem;
    background-color: #f8f9fa;
    border-left: 4px solid #34495e;
  }
  
  h3 {
    font-size: 1.15rem;
    font-weight: 600;
    color: #34495e;
    margin-top: 1.5rem;
    margin-bottom: 0.6rem;
    padding-left: 0.8rem;
    border-left: 3px solid #7f8c8d;
  }
  
  h4 {
    font-size: 1rem;
    font-weight: 600;
    color: #34495e;
    margin-top: 1.2rem;
    margin-bottom: 0.5rem;
  }
  
  p {
    margin-top: 0.6rem;
    margin-bottom: 0.6rem;
    line-height: 1.8;
    text-align: justify;
  }
  
  ul, ol {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    padding-left: 2rem;
  }
  
  li {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
    line-height: 1.6;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  
  th {
    background-color: #f8f9fa;
    padding: 0.6rem 0.8rem;
    text-align: left;
    font-weight: 600;
    border: 1px solid #e0e0e0;
  }
  
  td {
    padding: 0.5rem 0.8rem;
    border: 1px solid #e0e0e0;
  }
  
  tbody tr:nth-child(even) {
    background-color: #f9fafb;
  }
  
  strong {
    font-weight: 600;
    color: #1a1a1a;
  }
  
  em {
    font-style: italic;
  }
  
  code {
    background-color: #f5f5f5;
    padding: 0.15rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }
  
  pre {
    background-color: #f5f5f5;
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-top: 1rem;
    margin-bottom: 1rem;
  }
  
  pre code {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 0.9rem;
  }
  
  blockquote {
    border-left: 4px solid #3b82f6;
    padding-left: 1rem;
    margin: 1rem 0;
    color: #666;
    font-style: italic;
  }
  
  hr {
    border: 0;
    border-top: 1px solid #e0e0e0;
    margin: 1.5rem 0;
  }
  
  a {
    color: #3b82f6;
    text-decoration: underline;
  }
  
  a:hover {
    opacity: 0.8;
  }
  
  .metadata {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 2rem;
    padding: 1rem;
    background-color: #f8f9fa;
    border-radius: 4px;
  }
  
  .metadata p {
    margin: 0.3rem 0;
    text-align: left;
  }
  
  .content {
    margin-top: 2rem;
  }
  
  @media print {
    body {
      background-color: white;
      padding: 0;
      max-width: none;
    }
    .container {
      box-shadow: none;
      padding: 20px;
    }
    h2 {
      page-break-after: avoid;
    }
    table, pre {
      page-break-inside: avoid;
    }
  }
  
  @media (max-width: 768px) {
    .container {
      padding: 30px 20px;
    }
    h1 {
      font-size: 1.5rem;
    }
    h2 {
      font-size: 1.2rem;
    }
  }
`;

/**
 * HTML特殊文字をエスケープ
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * レポートをHTML文字列に変換
 */
export function generateHTML(
  report: Report,
  options: HTMLOptions = {}
): string {
  const {
    includeMetadata = true,
    includeTimestamp = true,
    includeStyles = true,
    language = 'ja',
    customStyles = '',
  } = options;

  const labels = language === 'en'
    ? { target: 'Target', strategy: 'Strategy', createdAt: 'Created' }
    : { target: '対象', strategy: '戦略', createdAt: '作成日' };

  const formattedDate = language === 'en'
    ? new Date(report.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : formatDate(report.createdAt);

  // Markdownをパースしてブロックに変換
  const blocks = parseMarkdown(report.content);
  
  // ブロックをHTMLに変換
  const contentHtml = blocksToHtml(blocks);

  // メタデータセクション
  let metadataHtml = '';
  if (includeMetadata) {
    metadataHtml = `
    <div class="metadata">
      <p><strong>${labels.target}:</strong> ${escapeHtml(report.stakeholder.role)}</p>
      <p><strong>${labels.strategy}:</strong> ${escapeHtml(report.rhetoricStrategy)}</p>
      ${includeTimestamp ? `<p><strong>${labels.createdAt}:</strong> ${formattedDate}</p>` : ''}
    </div>`;
  }

  // スタイル
  const stylesHtml = includeStyles
    ? `<style>${defaultStyles}${customStyles}</style>`
    : (customStyles ? `<style>${customStyles}</style>` : '');

  // HTMLドキュメントを構築
  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)}</title>
  ${stylesHtml}
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(report.title)}</h1>
    ${metadataHtml}
    <div class="content">
      ${contentHtml}
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * HTMLをBufferとして返す（API用）
 */
export function generateHTMLBuffer(
  report: Report,
  options: HTMLOptions = {}
): Buffer {
  const html = generateHTML(report, options);
  return Buffer.from(html, 'utf-8');
}
