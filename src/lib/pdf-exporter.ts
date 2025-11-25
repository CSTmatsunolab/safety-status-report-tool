import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
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
 * 本番環境とローカル環境の両方で動作するPDF生成
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

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const htmlContent = generateHTMLContent(report, {
      includeMetadata,
      includeTimestamp,
      watermark,
      headerText,
      footerText
    });

    console.log('Launching browser...');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Platform:', process.platform);
    
    // 本番環境（Vercel等）とローカル環境を判定
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      console.log('Using Chromium for serverless environment');
      
      // Vercel/Lambda用のChromiumを使用
      browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      console.log('Using local Puppeteer');
      
      // ローカル環境用 - 動的インポートを使用（ESLintエラー回避）
      const puppeteerModule = await import('puppeteer');
      browser = await puppeteerModule.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        timeout: 30000,
      });
    }

    if (!browser) {
      throw new Error('Failed to launch browser');
    }

    console.log('Browser launched successfully');
    
    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
    
    console.log('Setting page content...');
    
    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log('Waiting for rendering...');
    
    // レンダリングを安定させる
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Generating PDF...');
    
    const pdfBuffer = await page.pdf({
      format: pageSize,
      margin,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: generateHeaderTemplate(headerText || report.title),
      footerTemplate: generateFooterTemplate(footerText),
      timeout: 60000,
    });

    console.log('PDF generated successfully, size:', pdfBuffer.length);

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'N/A'
    });
    
    throw new Error(
      `PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    try {
      if (page) {
        console.log('Closing page...');
        await page.close();
      }
    } catch (closeError) {
      console.warn('Error closing page:', closeError);
    }
    
    try {
      if (browser) {
        console.log('Closing browser...');
        await browser.close();
      }
    } catch (closeError) {
      console.warn('Error closing browser:', closeError);
    }
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", 
                   "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, 
                   sans-serif;
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
    
    <div class="content">
      ${formatContent(report.content)}
    </div>
  </div>
</body>
</html>
`;
}

function generateHeaderTemplate(headerText: string): string {
  return `
    <div style="font-size: 10px; text-align: center; width: 100%; padding: 10px 0;">
      <span>${escapeHtml(headerText)}</span>
    </div>
  `;
}

function generateFooterTemplate(footerText?: string): string {
  return `
    <div style="font-size: 10px; text-align: center; width: 100%; padding: 10px 0;">
      <span>${footerText ? escapeHtml(footerText) : 'ページ <span class="pageNumber"></span> / <span class="totalPages"></span>'}</span>
    </div>
  `;
}

function formatContent(content: string): string {
  const lines = content.split('\n');
  const formattedLines = lines.map(line => {
    if (line.match(/^\d+\.\s/)) {
      return `<h3>${escapeHtml(line)}</h3>`;
    }
    return `<p>${escapeHtml(line)}</p>`;
  });
  
  return formattedLines.join('\n');
}

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

function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}