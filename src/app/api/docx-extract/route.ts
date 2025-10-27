// src/app/api/docx-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import * as mammoth from 'mammoth';

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log(`Processing Word document: ${file.name}, Size: ${file.size} bytes`);

    // 4MB以上はBlob経由
    const USE_BLOB_THRESHOLD = 4 * 1024 * 1024;
    let buffer: Buffer;

    if (file.size > USE_BLOB_THRESHOLD) {
      console.log('Large Word file detected, using Vercel Blob storage');
      
      const blob = await put(`temp/docx-${Date.now()}-${file.name}`, file, {
        access: 'public',
        addRandomSuffix: true,
      });
      
      blobUrl = blob.url;
      console.log(`Word document uploaded to Blob: ${blobUrl}`);
      
      const response = await fetch(blobUrl);
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      buffer = Buffer.from(await file.arrayBuffer());
    }
    
    try {
      // mammothを使用してdocxからテキストを抽出
      const result = await mammoth.extractRawText({ buffer });
      
      // Blobクリーンアップ
      if (blobUrl) {
        await del(blobUrl).catch(err => 
          console.error('Blob deletion failed:', err)
        );
      }
      
      console.log(`DOCX extraction successful: ${file.name}, extracted ${result.value.length} characters`);
      
      return NextResponse.json({ 
        text: result.value,
        success: true,
        fileName: file.name,
        textLength: result.value.length,
        messages: result.messages // 警告やエラーメッセージ
      });
    } catch (parseError) {
      console.error('DOCX parsing error:', parseError);
      
      // パースエラー時もBlobクリーンアップ
      if (blobUrl) {
        await del(blobUrl).catch(err => 
          console.error('Blob deletion failed:', err)
        );
      }
      
      return NextResponse.json({ 
        text: '', 
        success: false,
        error: 'DOCX parsing failed',
        fileName: file.name,
        details: parseError instanceof Error ? parseError.message : 'Unknown parse error'
      });
    }
  } catch (error) {
    console.error('Request processing error:', error);
    
    // エラー時もBlobをクリーンアップ
    if (blobUrl) {
      await del(blobUrl).catch(err => 
        console.error('Blob deletion failed during error handling:', err)
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Request processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}