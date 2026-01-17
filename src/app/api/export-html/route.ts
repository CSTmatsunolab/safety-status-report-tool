// src/app/api/export-html/route.ts
// HTML エクスポート API（Markdown対応）

import { NextRequest, NextResponse } from 'next/server';
import { Report } from '@/types';
import { generateHTMLBuffer } from '@/lib/html-exporter';

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

    console.log('HTML generation started for report:', report.title);
    console.log('Language:', language);

    // HTMLを生成（Markdown対応）
    const htmlBuffer = generateHTMLBuffer(report, {
      language,
      includeMetadata: true,
      includeTimestamp: true,
      includeStyles: true,
    });
    
    console.log('HTML buffer size:', htmlBuffer.length);

    // BufferをUint8Arrayに変換
    const uint8Array = new Uint8Array(htmlBuffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(report.title)}.html"`,
        'Content-Length': htmlBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('HTML export error:', error);
    return NextResponse.json(
      { error: 'HTML export failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}