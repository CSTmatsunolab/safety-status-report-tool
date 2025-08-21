import { NextRequest, NextResponse } from 'next/server';
import { Report } from '@/types';
import { generatePDF } from '@/lib/pdf-exporter';

export async function POST(request: NextRequest) {
  try {
    const { report, options = {} }: { 
      report: Report; 
      options?: {
        includeMetadata?: boolean;
        includeTimestamp?: boolean;
        watermark?: string;
      }
    } = await request.json();

    // PDFを生成
    const pdfBuffer = await generatePDF(report, options);

    // PDFをレスポンスとして返す
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${report.title}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'PDF export failed' },
      { status: 500 }
    );
  }
}