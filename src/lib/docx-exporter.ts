// src/lib/docx-exporter.ts
// Markdown対応版 DOCX エクスポーター

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  convertInchesToTwip,
  ShadingType,
} from 'docx';
import { Report } from '@/types';
import { formatDate } from '@/lib/date-utils';
import { parseMarkdown, ParsedBlock, stripInlineMarkdown } from '@/lib/markdown-parser';

export interface DOCXOptions {
  includeMetadata?: boolean;
  includeTimestamp?: boolean;
  language?: 'ja' | 'en';
}

/**
 * インラインMarkdownをTextRunの配列に変換
 */
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    // 太字パターン: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
    // イタリックパターン: *text* (太字でないもの)
    const italicMatch = remaining.match(/^(.*?)\*([^*]+?)\*(.*)/);
    // インラインコードパターン: `code`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/);
    
    // 最も早く出現するパターンを見つける
    let earliestMatch: RegExpMatchArray | null = null;
    let matchType: 'bold' | 'italic' | 'code' | null = null;
    let earliestIndex = remaining.length;
    
    if (boldMatch && boldMatch[1].length < earliestIndex) {
      earliestMatch = boldMatch;
      earliestIndex = boldMatch[1].length;
      matchType = 'bold';
    }
    
    if (codeMatch && codeMatch[1].length < earliestIndex) {
      earliestMatch = codeMatch;
      earliestIndex = codeMatch[1].length;
      matchType = 'code';
    }
    
    // イタリックは太字と重複しないようにチェック
    if (italicMatch && italicMatch[1].length < earliestIndex) {
      if (!boldMatch || italicMatch[1].length < boldMatch[1].length) {
        earliestMatch = italicMatch;
        earliestIndex = italicMatch[1].length;
        matchType = 'italic';
      }
    }
    
    if (!earliestMatch || matchType === null) {
      if (remaining.length > 0) {
        runs.push(new TextRun({ text: remaining }));
      }
      break;
    }
    
    // マッチ前のテキストを追加
    if (earliestMatch[1].length > 0) {
      runs.push(new TextRun({ text: earliestMatch[1] }));
    }
    
    // マッチしたテキストをスタイル付きで追加
    const matchedText = earliestMatch[2];
    switch (matchType) {
      case 'bold':
        runs.push(new TextRun({ text: matchedText, bold: true }));
        break;
      case 'italic':
        runs.push(new TextRun({ text: matchedText, italics: true }));
        break;
      case 'code':
        runs.push(new TextRun({
          text: matchedText,
          font: 'Consolas',
          shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' },
        }));
        break;
    }
    
    remaining = earliestMatch[3];
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/**
 * ParsedBlockをdocxのParagraphまたはTableに変換
 */
function blockToDocxElement(block: ParsedBlock, language: 'ja' | 'en'): Paragraph | Table {
  switch (block.type) {
    case 'h1':
      return new Paragraph({
        children: parseInlineMarkdown(block.text),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      });
    
    case 'h2':
      return new Paragraph({
        children: parseInlineMarkdown(block.text),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 24, color: '34495e' },
        },
        shading: { type: ShadingType.CLEAR, fill: 'F8F9FA' },
      });
    
    case 'h3':
      return new Paragraph({
        children: parseInlineMarkdown(block.text),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 250, after: 120 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 16, color: '7f8c8d' },
        },
      });
    
    case 'h4':
      return new Paragraph({
        children: parseInlineMarkdown(block.text),
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 200, after: 100 },
      });
    
    case 'paragraph':
      return new Paragraph({
        children: parseInlineMarkdown(block.text),
        spacing: { before: 100, after: 100 },
      });
    
    case 'listItem':
      return new Paragraph({
        children: parseInlineMarkdown(block.text),
        bullet: { level: 0 },
        spacing: { before: 50, after: 50 },
      });
    
    case 'numberedListItem':
      return new Paragraph({
        children: [
          new TextRun({ text: `${block.number}. ` }),
          ...parseInlineMarkdown(block.text),
        ],
        spacing: { before: 50, after: 50 },
        indent: { left: convertInchesToTwip(0.25) },
      });
    
    case 'blockquote':
      return new Paragraph({
        children: [new TextRun({ text: block.text, italics: true, color: '666666' })],
        spacing: { before: 150, after: 150 },
        indent: { left: convertInchesToTwip(0.5) },
        border: {
          left: { style: BorderStyle.SINGLE, size: 16, color: '3b82f6' },
        },
      });
    
    case 'code':
      return new Paragraph({
        children: [
          new TextRun({
            text: block.text,
            font: 'Consolas',
            size: 18,
          }),
        ],
        spacing: { before: 150, after: 150 },
        shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
      });
    
    case 'hr':
      return new Paragraph({
        children: [],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E0E0E0' },
        },
        spacing: { before: 200, after: 200 },
      });
    
    case 'table':
      return createTable(block);
    
    default:
      return new Paragraph({
        children: [new TextRun({ text: block.text })],
      });
  }
}

/**
 * テーブルを作成
 */
function createTable(block: ParsedBlock): Table {
  if (!block.headers || !block.rows) {
    return new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
            }),
          ],
        }),
      ],
    });
  }
  
  // ヘッダー行
  const headerRow = new TableRow({
    children: block.headers.map((header: string) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: stripInlineMarkdown(header), bold: true })],
            alignment: AlignmentType.LEFT,
          }),
        ],
        shading: { type: ShadingType.CLEAR, fill: 'F8F9FA' },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
          bottom: { style: BorderStyle.SINGLE, size: 2, color: '34495e' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
        },
      })
    ),
  });
  
  // データ行
  const dataRows = block.rows.map((row: string[], rowIndex: number) =>
    new TableRow({
      children: row.map((cell: string) =>
        new TableCell({
          children: [
            new Paragraph({
              children: parseInlineMarkdown(cell),
            }),
          ],
          shading: rowIndex % 2 === 1
            ? { type: ShadingType.CLEAR, fill: 'F9FAFB' }
            : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
          },
        })
      ),
    })
  );
  
  return new Table({
    rows: [headerRow, ...dataRows],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });
}

/**
 * レポートをDOCXドキュメントに変換
 */
export async function generateDOCX(
  report: Report,
  options: DOCXOptions = {}
): Promise<Buffer> {
  const {
    includeMetadata = true,
    includeTimestamp = true,
    language = 'ja',
  } = options;

  const labels = language === 'en'
    ? { target: 'Target', strategy: 'Strategy', createdAt: 'Created' }
    : { target: '対象', strategy: '戦略', createdAt: '作成日' };

  const formattedDate = language === 'en'
    ? new Date(report.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : formatDate(report.createdAt);

  // Markdownをパース
  const blocks = parseMarkdown(report.content);

  // ドキュメントの子要素を構築
  const children: (Paragraph | Table)[] = [];

  // タイトル
  children.push(
    new Paragraph({
      children: [new TextRun({ text: report.title, bold: true, size: 36 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: '34495e' },
      },
    })
  );

  // メタデータ
  if (includeMetadata) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${labels.target}: `, bold: true }),
          new TextRun({ text: report.stakeholder.role }),
          new TextRun({ text: '  |  ' }),
          new TextRun({ text: `${labels.strategy}: `, bold: true }),
          new TextRun({ text: report.rhetoricStrategy }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 50 },
      })
    );

    if (includeTimestamp) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${labels.createdAt}: `, bold: true }),
            new TextRun({ text: formattedDate }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        })
      );
    }

    // 区切り線
    children.push(
      new Paragraph({
        children: [],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E0E0E0' },
        },
        spacing: { after: 300 },
      })
    );
  }

  // コンテンツブロックを変換
  for (const block of blocks) {
    children.push(blockToDocxElement(block, language));
  }

  // フォント設定
  const fontName = language === 'ja' ? 'Noto Sans JP' : 'Segoe UI';

  // ドキュメントを作成
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: fontName,
            size: 22,
          },
          paragraph: {
            spacing: { line: 360 },
          },
        },
        heading1: {
          run: {
            font: fontName,
            size: 32,
            bold: true,
            color: '1a1a1a',
          },
        },
        heading2: {
          run: {
            font: fontName,
            size: 28,
            bold: true,
            color: '2c3e50',
          },
        },
        heading3: {
          run: {
            font: fontName,
            size: 24,
            bold: true,
            color: '34495e',
          },
        },
        heading4: {
          run: {
            font: fontName,
            size: 22,
            bold: true,
            color: '34495e',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * DOCXをBase64文字列として返す
 */
export async function generateDOCXBase64(
  report: Report,
  options: DOCXOptions = {}
): Promise<string> {
  const buffer = await generateDOCX(report, options);
  return buffer.toString('base64');
}