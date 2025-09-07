import { NextRequest, NextResponse } from 'next/server';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from 'docx';
import { Report } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { report }: { report: Report } = await request.json();

    // Word文書を作成
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // タイトル
          new Paragraph({
            text: report.title,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),

          // メタデータ
          new Paragraph({
            children: [
              new TextRun({ text: "対象: ", bold: true }),
              new TextRun(report.stakeholder.role),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "戦略: ", bold: true }),
              new TextRun(report.rhetoricStrategy),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "作成日: ", bold: true }),
              new TextRun(new Date(report.createdAt).toLocaleDateString('ja-JP')),
            ],
            spacing: { after: 400 }
          }),

          // 本文を段落ごとに追加
          ...report.content.split('\n').map(line => {
            if (line.match(/^\d+\.\s/)) {
              // 見出し
              return new Paragraph({
                text: line,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 120 }
              });
            }
            // 通常の段落
            return new Paragraph({
              text: line,
              spacing: { after: 200 }
            });
          })
        ],
      }],
    });

    // Word文書をバッファに変換
    const buffer = await Packer.toBuffer(doc);
    
    // BufferをUint8Arrayに変換
    const uint8Array = new Uint8Array(buffer);

    // ファイルとして返す
    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(report.title)}.docx"`,
      },
    });
  } catch (error) {
    console.error('DOCX export error:', error);
    return NextResponse.json(
      { error: 'DOCX export failed' },
      { status: 500 }
    );
  }
}