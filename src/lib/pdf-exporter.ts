import puppeteer from 'puppeteer';
import { Report } from '@/types';

export interface PDFOptions {
  includeMetadata?: boolean;
  includeTimestamp?: boolean;
  watermark?: string;
  headerText?: string;
  footerText?: string;
  pageSize?: 'A4' | 'Letter';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

/**
 * レポートをPDFに変換
 */
export async function generatePDF(
  report: Report,
  options: PDFOptions = {}
): Promise<Buffer> {
  const {
    includeMetadata = true,
    includeTimestamp = true,
    watermark,
    headerText,
    footerText,
    pageSize = 'A4',
    margin = {
      top: '20mm',
      right: '20mm',
      bottom: '20mm',
      left: '20mm'
    }
  } = options;

  // HTMLコンテンツを生成
  const htmlContent = generateHTMLContent(report, {
    includeMetadata,
    includeTimestamp,
    watermark,
    headerText,
    footerText
  });

  // Puppeteerでブラウザを起動
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // HTMLコンテンツを設定
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });

    // PDFを生成
    const pdfBuffer = await page.pdf({
      format: pageSize,
      margin,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: generateHeaderTemplate(headerText || report.title),
      footerTemplate: generateFooterTemplate(footerText),
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

/**
 * HTMLコンテンツの生成
 */
function generateHTMLContent(
  report: Report,
  options: {
    includeMetadata?: boolean;
    includeTimestamp?: boolean;
    watermark?: string;
    headerText?: string;
    footerText?: string;
  }
): string {
  const { includeMetadata, includeTimestamp, watermark } = options;

  // Markdownをパースして構造化
  const sections = parseMarkdownSections(report.content);

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', sans-serif;
      line-height: 1.8;
      color: #333;
      background: white;
      position: relative;
    }
    
    .container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 20mm;
      position: relative;
    }
    
    /* ウォーターマーク */
    ${watermark ? `
    body::before {
      content: "${escapeHtml(watermark)}";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 120px;
      color: rgba(0, 0, 0, 0.05);
      z-index: -1;
      white-space: nowrap;
    }
    ` : ''}
    
    /* タイトルページ */
    .title-page {
      text-align: center;
      margin-bottom: 50px;
      padding: 50px 0;
      border-bottom: 2px solid #e0e0e0;
    }
    
    .title-page h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #1a1a1a;
    }
    
    .title-page .subtitle {
      font-size: 18px;
      color: #666;
      margin-bottom: 10px;
    }
    
    .title-page .metadata {
      font-size: 14px;
      color: #999;
      margin-top: 30px;
    }
    
    /* セクション */
    .section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    
    .section h2 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    
    .section h3 {
      font-size: 18px;
      font-weight: 700;
      margin: 20px 0 10px;
      color: #34495e;
    }
    
    .section p {
      margin-bottom: 15px;
      text-align: justify;
    }
    
    .section ul, .section ol {
      margin: 15px 0;
      padding-left: 30px;
    }
    
    .section li {
      margin-bottom: 8px;
    }
    
    /* 強調表示 */
    .highlight {
      background-color: #fff3cd;
      padding: 2px 4px;
      border-radius: 3px;
    }
    
    strong {
      font-weight: 700;
      color: #2c3e50;
    }
    
    em {
      font-style: italic;
      color: #7f8c8d;
    }
    
    /* テーブル */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    
    th {
      background-color: #f8f9fa;
      font-weight: 700;
    }
    
    /* コードブロック */
    pre {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 15px 0;
    }
    
    code {
      font-family: 'Courier New', monospace;
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
    }
    
    /* 印刷用スタイル */
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      
      .container {
        padding: 0;
      }
      
      .section {
        page-break-inside: avoid;
      }
      
      .title-page {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- タイトルページ -->
    <div class="title-page">
      <h1>${escapeHtml(report.title)}</h1>
      <div class="subtitle">対象: ${escapeHtml(report.stakeholder.role)}</div>
      <div class="subtitle">戦略: ${escapeHtml(report.rhetoricStrategy)}</div>
      ${includeMetadata ? `
        <div class="metadata">
          ${includeTimestamp ? `
            <p>作成日: ${formatDate(report.createdAt)}</p>
            <p>更新日: ${formatDate(report.updatedAt)}</p>
          ` : ''}
        </div>
      ` : ''}
    </div>
    
    <!-- レポート本文 -->
    ${sections.map(section => `
      <div class="section">
        <h2>${escapeHtml(section.title)}</h2>
        ${formatContent(section.content)}
      </div>
    `).join('')}
  </div>
</body>
</html>
`;
}

/**
 * ヘッダーテンプレートの生成
 */
function generateHeaderTemplate(headerText: string): string {
  return `
    <div style="font-size: 10px; text-align: center; width: 100%; padding: 10px 0;">
      <span>${escapeHtml(headerText)}</span>
    </div>
  `;
}

/**
 * フッターテンプレートの生成
 */
function generateFooterTemplate(footerText?: string): string {
  return `
    <div style="font-size: 10px; text-align: center; width: 100%; padding: 10px 0;">
      <span>${footerText ? escapeHtml(footerText) : 'ページ <span class="pageNumber"></span> / <span class="totalPages"></span>'}</span>
    </div>
  `;
}

/**
 * Markdownをセクションに分割
 */
function parseMarkdownSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');
  let currentSection: { title: string; content: string } | null = null;
  
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: line.substring(3).trim(),
        content: ''
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }
  
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * コンテンツのフォーマット（簡易Markdownパーサー）
 */
function formatContent(content: string): string {
  return content
    // 段落
    .split('\n\n')
    .map(paragraph => {
      if (paragraph.trim() === '') return '';
      
      // リスト
      if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
        const items = paragraph.split('\n')
          .filter(line => line.trim())
          .map(line => `<li>${escapeHtml(line.substring(2))}</li>`)
          .join('\n');
        return `<ul>\n${items}\n</ul>`;
      }
      
      // 番号付きリスト
      if (/^\d+\.\s/.test(paragraph)) {
        const items = paragraph.split('\n')
          .filter(line => line.trim())
          .map(line => `<li>${escapeHtml(line.replace(/^\d+\.\s/, ''))}</li>`)
          .join('\n');
        return `<ol>\n${items}\n</ol>`;
      }
      
      // 通常の段落
      let formatted = escapeHtml(paragraph);
      
      // 太字
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      
      // 斜体
      formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
      
      // インラインコード
      formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>');
      
      return `<p>${formatted}</p>`;
    })
    .join('\n');
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 日付フォーマット
 */
function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}