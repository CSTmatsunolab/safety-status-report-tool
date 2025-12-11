//src/lib/pdf-exporter.ts

import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { Report } from '@/types';
import { formatDate } from '@/lib/date-utils';

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
  language?: 'ja' | 'en';
}

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
      top: '0mm', 
      right: '20mm',
      bottom: '25mm',
      left: '20mm'
    },
    language = 'ja'
  } = options;

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const htmlContent = generateHTMLContent(report, {
      includeMetadata,
      includeTimestamp,
      watermark,
      headerText: headerText || report.title,
      footerText,
      language
    });

    console.log('Launching browser...');
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      console.log('Using Chromium for serverless environment');

      browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
        ],
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      console.log('Using local Puppeteer');
      const puppeteerModule = await import('puppeteer');
      browser = await puppeteerModule.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 30000,
      });
    }

    if (!browser) throw new Error('Failed to launch browser');

    page = await browser.newPage();
    page.setDefaultTimeout(90000);
    
    await page.setContent(htmlContent, {
      waitUntil: 'load',
      timeout: 60000,
    });

    try { await page.evaluate(() => document.fonts.ready); } catch (e) { console.warn(e); }
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pdfBuffer = await page.pdf({
      format: pageSize,
      margin, 
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size: 10px; text-align: center; width: 100%; color: #666; padding-top: 5px;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
      timeout: 90000,
      preferCSSPageSize: false,
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

function generateHTMLContent(
  report: Report,
  options: {
    includeMetadata?: boolean;
    includeTimestamp?: boolean;
    watermark?: string;
    headerText?: string;
    footerText?: string;
    language?: 'ja' | 'en';
  }
): string {
  const { includeMetadata, includeTimestamp, watermark, headerText, language = 'ja' } = options;

  // 言語に応じたラベル
  const labels = language === 'en' 
    ? { target: 'Target:', strategy: 'Strategy:', createdAt: 'Created:' }
    : { target: '対象:', strategy: '戦略:', createdAt: '作成日:' };

  // 言語に応じた設定
  const htmlLang = language === 'en' ? 'en' : 'ja';
  const fontFamily = language === 'en' 
    ? "'Segoe UI', 'Helvetica Neue', sans-serif"
    : "'Noto Sans JP', sans-serif";

  // 日付フォーマット
  const formattedDate = language === 'en'
    ? new Date(report.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : formatDate(report.createdAt);

  return `
<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(report.title)}</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
  
  <style>
    /* リセット */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: ${fontFamily};
      line-height: 1.8;
      color: #333;
      background: white;
      font-size: 11pt;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
    }

    .header-space {
      height: 18mm;
    }

    .print-header {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 15mm;
      background-color: white;
      border-bottom: 1px solid #eee;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      font-size: 10px;
      z-index: 1000;
    }

    .container {
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
      font-family: ${fontFamily};
    }
    ` : ''}
    
    .title-page {
      text-align: center;
      margin-bottom: 40px;
      padding: 20px 0 40px;
      border-bottom: 2px solid #e0e0e0;
    }
    .title-page h1 { font-size: 28px; font-weight: 700; margin-bottom: 15px; }
    .title-page .subtitle { font-size: 16px; color: #666; margin-bottom: 8px; }
    .title-page .metadata { font-size: 12px; color: #999; margin-top: 20px; }
    
    .content p { margin-bottom: 12px; text-align: justify; }
    .content h3 { font-size: 16px; font-weight: 700; margin: 25px 0 15px; color: #34495e; border-left: 4px solid #34495e; padding-left: 10px; }
    
    table.data-table { width: 100%; border-collapse: collapse; margin: 20px 0; page-break-inside: avoid; }
    table.data-table th, table.data-table td { border: 1px solid #ddd; padding: 10px; font-size: 10pt; }
    table.data-table th { background-color: #f8f9fa; font-weight: 700; }
    
    pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; white-space: pre-wrap; font-size: 9pt; }

    @media print {
      thead { display: table-header-group; } 
      tfoot { display: table-footer-group; }
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <div class="print-header">
    ${escapeHtml(headerText || report.title)}
  </div>

  <table class="report-table">
  
    <thead>
      <tr>
        <td>
          <div class="header-space">&nbsp;</div>
        </td>
      </tr>
    </thead>

    <tbody>
      <tr>
        <td>
          <div class="container">
            
            <div class="title-page">
              <h1>${escapeHtml(report.title)}</h1>
              <div class="subtitle">${labels.target} ${escapeHtml(report.stakeholder.role)}</div>
              <div class="subtitle">${labels.strategy} ${escapeHtml(report.rhetoricStrategy)}</div>
              ${includeMetadata ? `
                <div class="metadata">
                  ${includeTimestamp ? `
                    <p>${labels.createdAt} ${formattedDate}</p>
                  ` : ''}
                </div>
              ` : ''}
            </div>
            
            <div class="content">
              ${formatContent(report.content)}
            </div>
            
          </div>
        </td>
      </tr>
    </tbody>
  </table>

</body>
</html>
`;
}

function formatContent(content: string): string {
  const lines = content.split('\n');
  return lines.map(line => {
    if (line.match(/^\d+\.\s/)) return `<h3>${escapeHtml(line)}</h3>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join('\n');
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}