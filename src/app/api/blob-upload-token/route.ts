// src/app/api/pdf-extract-from-blob/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null;
  let fileName: string = 'unknown';
  
  try {
    const formData = await request.formData();
    blobUrl = formData.get('blobUrl') as string;
    fileName = formData.get('fileName') as string;

    if (!blobUrl) {
      return NextResponse.json(
        { error: 'Blob URLが提供されていません' },
        { status: 400 }
      );
    }

    console.log(`Processing PDF from Blob: ${fileName}`);
    console.log(`Blob URL: ${blobUrl}`);

    // ユーザーエージェントを追加してfetch
    const response = await fetch(blobUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Vercel Edge Functions)'
      }
    });
    
    if (!response.ok) {
      // デバッグ情報を追加
      console.error(`Fetch failed: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch from Blob: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`Successfully fetched: ${buffer.length} bytes`);

    // 以下、通常のPDF処理...
    const pdf = await import('pdf-parse-new');
    const data = await pdf.default(buffer);
    
    return NextResponse.json({ 
      text: data.text,
      success: true,
      method: 'blob-processed',
      fileName: fileName,
      textLength: data.text.length
    });

  } catch (error) {
    console.error('PDF extraction error:', error);
    return NextResponse.json(
      { 
        error: 'PDFの処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
        fileName: fileName
      },
      { status: 500 }
    );
    
  } finally {
    if (blobUrl) {
      try {
        await del(blobUrl);
        console.log(`Blob deleted: ${fileName}`);
      } catch (delError) {
        console.error(`Blob deletion failed:`, delError);
      }
    }
  }
}