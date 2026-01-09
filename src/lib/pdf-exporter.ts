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
  // セクション見出し（【】形式）
  sectionHeading: {
    fontSize: 12,
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
  // 数字付き見出し
  numberedHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#34495e',
    marginTop: 14,
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#7f8c8d',
    borderLeftStyle: 'solid',
  },
  paragraph: {
    marginBottom: 6,
  },
  listItem: {
    marginBottom: 4,
    marginLeft: 15,
    paddingLeft: 5,
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
  type: 'sectionHeading' | 'numberedHeading' | 'paragraph' | 'listItem';
  text: string;
}

// コンテンツをパースして構造化
interface ContentBlock {
  type: 'sectionHeading' | 'numberedHeading' | 'paragraph' | 'listItem';
  text: string;
}

/**
 * 単一のテキストブロック内の不要な改行を削除
 */
function removeLineBreaks(text: string): string {
  return text
    // 改行をスペースに変換
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    // 連続するスペースを1つに
    .replace(/\s+/g, ' ')
    .trim();
}

function parseContent(content: string): ContentBlock[] {
  // 【】で始まるセクション見出しを基準に分割
  // 見出しの前に改行を入れて分割しやすくする
  const preparedContent = content
    .replace(/【/g, '\n\n【')
    .replace(/】\s*/g, '】\n\n');
  
  const lines = preparedContent.split('\n');
  const blocks: ContentBlock[] = [];
  let currentParagraph = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // 空行の場合、蓄積した段落を出力
      if (currentParagraph) {
        blocks.push({ type: 'paragraph', text: removeLineBreaks(currentParagraph) });
        currentParagraph = '';
      }
      continue;
    }
    
    // 【】で囲まれたセクション見出し
    if (trimmed.match(/^【.+】$/)) {
      // 蓄積した段落を先に出力
      if (currentParagraph) {
        blocks.push({ type: 'paragraph', text: removeLineBreaks(currentParagraph) });
        currentParagraph = '';
      }
      blocks.push({ 
        type: 'sectionHeading', 
        text: trimmed.replace(/^【/, '').replace(/】$/, '') 
      });
    }
    // 数字で始まる見出し（1. や 1.1 など）
    else if (trimmed.match(/^\d+(\.\d+)*\.\s/)) {
      if (currentParagraph) {
        blocks.push({ type: 'paragraph', text: removeLineBreaks(currentParagraph) });
        currentParagraph = '';
      }
      blocks.push({ type: 'numberedHeading', text: removeLineBreaks(trimmed) });
    }
    // 箇条書き（・、• など）- ハイフンは除外（英単語で使用されるため）
    else if (trimmed.match(/^[・•]\s*/)) {
      if (currentParagraph) {
        blocks.push({ type: 'paragraph', text: removeLineBreaks(currentParagraph) });
        currentParagraph = '';
      }
      blocks.push({ 
        type: 'listItem', 
        text: removeLineBreaks(trimmed.replace(/^[・•]\s*/, ''))
      });
    }
    // 通常のテキスト → 段落として蓄積
    else {
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    }
  }
  
  // 最後に蓄積した段落を出力
  if (currentParagraph) {
    blocks.push({ type: 'paragraph', text: removeLineBreaks(currentParagraph) });
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
      case 'sectionHeading':
        return React.createElement(Text, { key, style: styles.sectionHeading }, block.text);
      case 'numberedHeading':
        return React.createElement(Text, { key, style: styles.numberedHeading }, block.text);
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