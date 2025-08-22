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

    // 日本語フォントの読み込みを待つ
    await page.evaluateHandle('document.fonts.ready');

    // PDFを生成
    const pdfBuffer = await page.pdf({
      format: pageSize,
      margin,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: generateHeaderTemplate(headerText || report.title),
      footerTemplate: generateFooterTemplate(footerText),
    });

    return Buffer.from(pdfBuffer);
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
    
    .content {
      margin-top: 30px;
    }
    
    .content p {
      margin-bottom: 10px;
      text-align: justify;
      line-height: 1.8;
    }
    
    .content h3 {
      font-size: 18px;
      font-weight: 700;
      margin: 20px 0 10px;
      color: #34495e;
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
    <div class="content">
      ${formatContent(report.content)}
    </div>
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
 * コンテンツのフォーマット
 */
function formatContent(content: string): string {
  // 改行を<br>タグに変換
  const lines = content.split('\n');
  const formattedLines = lines.map(line => {
    // 見出しの処理
    if (line.match(/^\d+\.\s/)) {
      return `<h3>${escapeHtml(line)}</h3>`;
    }
    // 通常の行
    return `<p>${escapeHtml(line)}</p>`;
  });
  
  return formattedLines.join('\n');
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