// src/app/api/export-docx/route.ts
// DOCX エクスポート API（Markdown対応）

import { NextRequest, NextResponse } from 'next/server';
import { Report } from '@/types';
import { generateDOCX } from '@/lib/docx-exporter';

export async function POST(request: NextRequest) {
  try {
    const { report, language = 'ja' }: { 
      report: Report; 
      language?: 'ja' | 'en';
    } = await request.json();

    if (!report) {
      return NextResponse.json(
        { error: 'Report data is required' },
        { status: 400 }
      );
    }

    console.log('DOCX generation started for report:', report.title);
    console.log('Language:', language);

    // DOCXを生成（Markdown対応）
    const docxBuffer = await generateDOCX(report, {
      language,
      includeMetadata: true,
      includeTimestamp: true,
    });
    
    console.log('DOCX buffer size:', docxBuffer.length);
    
    if (!docxBuffer || docxBuffer.length === 0) {
      throw new Error('Generated DOCX buffer is empty');
    }

    // BufferをUint8Arrayに変換
    const uint8Array = new Uint8Array(docxBuffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(report.title)}.docx"`,
        'Content-Length': docxBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('DOCX export error:', error);
    return NextResponse.json(
      { error: 'DOCX export failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
