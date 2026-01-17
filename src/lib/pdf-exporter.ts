// src/lib/pdf-exporter.ts
// Markdown対応版 PDF エクスポーター

import React from 'react';
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { DocumentProps, PageProps } from '@react-pdf/renderer';
import { Report } from '@/types';
import { formatDate } from '@/lib/date-utils';
import { parseMarkdown, ParsedBlock, stripInlineMarkdown } from '@/lib/markdown-parser';

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

// 日本語フォントを登録
Font.register({
  family: 'NotoSansJP',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf',
      fontWeight: 'normal',
    },
    {
      src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf',
      fontWeight: 'bold',
    },
  ],
});

// ハイフネーションを無効化
Font.registerHyphenationCallback((word: string) => [word]);

// スタイル定義
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'NotoSansJP',
  },
  pageEn: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  titleSection: {
    textAlign: 'center',
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#34495e',
    borderBottomStyle: 'solid',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 4,
  },
  metadata: {
    fontSize: 9,
    color: '#999999',
    marginTop: 10,
  },
  content: {
    fontSize: 10,
    lineHeight: 1.7,
    color: '#333333',
  },
  // H1見出し
  h1: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 20,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },
  // H2見出し
  h2: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 18,
    marginBottom: 10,
    paddingVertical: 6,
    paddingLeft: 10,
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 4,
    borderLeftColor: '#34495e',
    borderLeftStyle: 'solid',
  },
  // H3見出し
  h3: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#34495e',
    marginTop: 14,
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#7f8c8d',
    borderLeftStyle: 'solid',
  },
  // H4見出し
  h4: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#34495e',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 8,
    lineHeight: 1.6,
  },
  listItem: {
    marginBottom: 4,
    marginLeft: 15,
    paddingLeft: 5,
  },
  numberedListItem: {
    marginBottom: 4,
    marginLeft: 15,
    paddingLeft: 5,
  },
  blockquote: {
    marginVertical: 10,
    paddingLeft: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    borderLeftStyle: 'solid',
    fontStyle: 'italic',
    color: '#666666',
  },
  code: {
    fontFamily: 'Courier',
    fontSize: 9,
    backgroundColor: '#f5f5f5',
    padding: 10,
    marginVertical: 8,
  },
  hr: {
    marginVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },
  // テーブル
  table: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'solid',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 2,
    borderBottomColor: '#34495e',
    borderBottomStyle: 'solid',
  },
  tableCell: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    borderRightStyle: 'solid',
  },
  tableHeaderCell: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    fontWeight: 'bold',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    borderRightStyle: 'solid',
  },
  pageNumber: {
    position: 'absolute',
    fontSize: 9,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#666666',
  },
  watermark: {
    position: 'absolute',
    top: '40%',
    left: '10%',
    fontSize: 60,
    color: '#f0f0f0',
    transform: 'rotate(-45deg)',
    opacity: 0.3,
  },
  header: {
    position: 'absolute',
    top: 15,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#999999',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    borderBottomStyle: 'solid',
    paddingBottom: 8,
  },
});

/**
 * ParsedBlockをReact要素に変換
 */
function renderBlock(block: ParsedBlock, index: number): React.ReactNode {
  const key = `block-${index}`;
  const text = stripInlineMarkdown(block.text);
  
  switch (block.type) {
    case 'h1':
      return React.createElement(Text, { key, style: styles.h1 }, text);
    case 'h2':
      return React.createElement(Text, { key, style: styles.h2 }, text);
    case 'h3':
      return React.createElement(Text, { key, style: styles.h3 }, text);
    case 'h4':
      return React.createElement(Text, { key, style: styles.h4 }, text);
    case 'paragraph':
      return React.createElement(Text, { key, style: styles.paragraph }, text);
    case 'listItem':
      return React.createElement(Text, { key, style: styles.listItem }, `• ${text}`);
    case 'numberedListItem':
      return React.createElement(Text, { key, style: styles.numberedListItem }, `${block.number}. ${text}`);
    case 'blockquote':
      return React.createElement(View, { key, style: styles.blockquote },
        React.createElement(Text, {}, text)
      );
    case 'code':
      return React.createElement(Text, { key, style: styles.code }, block.text);
    case 'hr':
      return React.createElement(View, { key, style: styles.hr });
    case 'table':
      return renderTable(block, key);
    default:
      return React.createElement(Text, { key, style: styles.paragraph }, text);
  }
}

/**
 * テーブルをReact要素に変換
 */
function renderTable(block: ParsedBlock, key: string): React.ReactNode {
  if (!block.headers || !block.rows) return null;
  
  const headerCells = block.headers.map((header: string, i: number) =>
    React.createElement(Text, { key: `header-${i}`, style: styles.tableHeaderCell }, stripInlineMarkdown(header))
  );
  
  const headerRow = React.createElement(View, { key: 'header-row', style: styles.tableHeaderRow }, ...headerCells);
  
  const dataRows = block.rows.map((row: string[], rowIndex: number) => {
    const cells = row.map((cell: string, cellIndex: number) =>
      React.createElement(Text, { key: `cell-${rowIndex}-${cellIndex}`, style: styles.tableCell }, stripInlineMarkdown(cell))
    );
    return React.createElement(View, { key: `row-${rowIndex}`, style: styles.tableRow }, ...cells);
  });
  
  return React.createElement(View, { key, style: styles.table }, headerRow, ...dataRows);
}

/**
 * PDFドキュメントを生成
 */
function createReportDocument(
  report: Report, 
  options: PDFOptions
): React.ReactElement<DocumentProps> {
  const {
    includeMetadata = true,
    includeTimestamp = true,
    watermark,
    headerText,
    language = 'ja',
  } = options;

  const labels = language === 'en' 
    ? { target: 'Target:', strategy: 'Strategy:', createdAt: 'Created:' }
    : { target: '対象:', strategy: '戦略:', createdAt: '作成日:' };

  const formattedDate = language === 'en'
    ? new Date(report.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      })
    : formatDate(report.createdAt);

  // Markdownをパース
  const blocks = parseMarkdown(report.content);
  const pageStyle = language === 'en' ? styles.pageEn : styles.page;

  // コンテンツ要素を生成
  const contentElements = blocks.map((block: ParsedBlock, index: number) => renderBlock(block, index));

  // ページ内の子要素を構築
  const pageChildren: React.ReactNode[] = [
    React.createElement(Text, { key: 'header', style: styles.header, fixed: true }, 
      headerText || report.title
    ),
  ];

  if (watermark) {
    pageChildren.push(
      React.createElement(Text, { key: 'watermark', style: styles.watermark, fixed: true }, watermark)
    );
  }

  const titleChildren: React.ReactNode[] = [
    React.createElement(Text, { key: 'title', style: styles.title }, report.title),
    React.createElement(Text, { key: 'target', style: styles.subtitle }, 
      `${labels.target} ${report.stakeholder.role}`
    ),
    React.createElement(Text, { key: 'strategy', style: styles.subtitle }, 
      `${labels.strategy} ${report.rhetoricStrategy}`
    ),
  ];

  if (includeMetadata && includeTimestamp) {
    titleChildren.push(
      React.createElement(Text, { key: 'date', style: styles.metadata }, 
        `${labels.createdAt} ${formattedDate}`
      )
    );
  }

  pageChildren.push(
    React.createElement(View, { key: 'titleSection', style: styles.titleSection }, ...titleChildren)
  );

  pageChildren.push(
    React.createElement(View, { key: 'content', style: styles.content }, ...contentElements)
  );

  pageChildren.push(
    React.createElement(Text, { 
      key: 'pageNumber',
      style: styles.pageNumber, 
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}`,
      fixed: true 
    })
  );

  const pageElement = React.createElement(
    Page, 
    { size: 'A4', style: pageStyle, wrap: true } as PageProps,
    ...pageChildren
  );

  return React.createElement(
    Document,
    {
      title: report.title,
      author: 'Safety Reporter',
      subject: `Report for ${report.stakeholder.role}`,
      creator: 'Safety Reporter',
    } as DocumentProps,
    pageElement
  ) as React.ReactElement<DocumentProps>;
}

/**
 * PDFを生成してBufferとして返す
 */
export async function generatePDF(
  report: Report,
  options: PDFOptions = {}
): Promise<Buffer> {
  try {
    console.log('Generating PDF with Markdown support...');
    console.log('Report title:', report.title);
    console.log('Language:', options.language || 'ja');
    
    const document = createReportDocument(report, options);
    const buffer = await renderToBuffer(document);
    
    console.log('PDF generated successfully, size:', buffer.length, 'bytes');
    
    return Buffer.from(buffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
}

/**
 * PDFをBase64文字列として返す
 */
export async function generatePDFBase64(
  report: Report,
  options: PDFOptions = {}
): Promise<string> {
  const buffer = await generatePDF(report, options);
  return buffer.toString('base64');
}