// src/lib/pdf-exporter.ts

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

// 日本語フォントを登録（Google Fonts）
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
Font.registerHyphenationCallback(word => [word]);

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
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#e0e0e0',
    borderBottomStyle: 'solid',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 11,
    color: '#666666',
    marginBottom: 5,
  },
  metadata: {
    fontSize: 9,
    color: '#999999',
    marginTop: 12,
  },
  content: {
    fontSize: 10,
    lineHeight: 1.8,
    color: '#333333',
  },
  heading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#34495e',
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#34495e',
    borderLeftStyle: 'solid',
  },
  paragraph: {
    marginBottom: 8,
    textAlign: 'justify',
  },
  listItem: {
    marginBottom: 4,
    marginLeft: 15,
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

// コンテンツをパースして構造化
interface ContentBlock {
  type: 'heading' | 'paragraph' | 'listItem';
  text: string;
}

function parseContent(content: string): ContentBlock[] {
  const lines = content.split('\n');
  const blocks: ContentBlock[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.match(/^\d+\.\s/)) {
      blocks.push({ type: 'heading', text: trimmed });
    } else if (trimmed.match(/^[-•・]\s/)) {
      blocks.push({ type: 'listItem', text: trimmed.replace(/^[-•・]\s/, '') });
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  }
  
  return blocks;
}

// PDFドキュメントを生成
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

  const contentBlocks = parseContent(report.content);
  const pageStyle = language === 'en' ? styles.pageEn : styles.page;

  // コンテンツ要素を生成
  const contentElements = contentBlocks.map((block, index) => {
    const key = `block-${index}`;
    switch (block.type) {
      case 'heading':
        return React.createElement(Text, { key, style: styles.heading }, block.text);
      case 'listItem':
        return React.createElement(Text, { key, style: styles.listItem }, `• ${block.text}`);
      default:
        return React.createElement(Text, { key, style: styles.paragraph }, block.text);
    }
  });

  // ページ内の子要素を構築
  const pageChildren: React.ReactNode[] = [
    // ヘッダー
    React.createElement(Text, { key: 'header', style: styles.header, fixed: true }, 
      headerText || report.title
    ),
  ];

  // 透かし（オプション）
  if (watermark) {
    pageChildren.push(
      React.createElement(Text, { key: 'watermark', style: styles.watermark, fixed: true }, 
        watermark
      )
    );
  }

  // タイトルセクションの子要素
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

  // タイトルセクション
  pageChildren.push(
    React.createElement(View, { key: 'titleSection', style: styles.titleSection }, 
      ...titleChildren
    )
  );

  // コンテンツ
  pageChildren.push(
    React.createElement(View, { key: 'content', style: styles.content }, 
      ...contentElements
    )
  );

  // ページ番号
  pageChildren.push(
    React.createElement(Text, { 
      key: 'pageNumber',
      style: styles.pageNumber, 
      render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
      fixed: true 
    })
  );

  // Page要素
  const pageElement = React.createElement(
    Page, 
    { size: 'A4', style: pageStyle, wrap: true } as PageProps,
    ...pageChildren
  );

  // Document要素
  return React.createElement(
    Document,
    {
      title: report.title,
      author: 'Safety Status Report Generator',
      subject: `Report for ${report.stakeholder.role}`,
      creator: 'Safety Status Report Generator',
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
    console.log('Generating PDF with @react-pdf/renderer...');
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