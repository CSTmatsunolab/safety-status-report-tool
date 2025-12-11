import { NextRequest, NextResponse } from 'next/server';
import { Report } from '@/types';
import { generatePDF } from '@/lib/pdf-exporter';

export async function POST(request: NextRequest) {
  try {
    const { report, options = {}, language = 'ja' }: { 
      report: Report; 
      options?: {
        includeMetadata?: boolean;
        includeTimestamp?: boolean;
        watermark?: string;
      };
      language?: 'ja' | 'en';
    } = await request.json();

    console.log('PDF generation started for report:', report.title);
    console.log('Language:', language);

    // PDFを生成（言語パラメータを渡す）
    const pdfBuffer = await generatePDF(report, {
      ...options,
      language: language,
    });
    
    console.log('PDF buffer size:', pdfBuffer.length);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty');
    }

    // 型アサーションを使用してTypeScriptエラーを回避
    // 実行時にはBufferは正しく処理される
    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(report.title)}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'PDF export failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;