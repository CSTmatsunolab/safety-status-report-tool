// src/app/api/excel-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import * as XLSX from 'xlsx';

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

    console.log(`Processing Excel: ${file.name}, Size: ${file.size} bytes`);

    // 4MB以上はBlob経由
    const USE_BLOB_THRESHOLD = 4 * 1024 * 1024;
    let buffer: Buffer;

    if (file.size > USE_BLOB_THRESHOLD) {
      console.log('Large Excel file detected, using Vercel Blob storage');
      
      const blob = await put(`temp/excel-${Date.now()}-${file.name}`, file, {
        access: 'public',
        addRandomSuffix: true,
      });
      
      blobUrl = blob.url;
      console.log(`Excel uploaded to Blob: ${blobUrl}`);
      
      const response = await fetch(blobUrl);
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      buffer = Buffer.from(await file.arrayBuffer());
    }

    // Excelファイルを解析
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let fullText = '';

    // 全シートのテキストを抽出
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csvData = XLSX.utils.sheet_to_csv(sheet);
      fullText += `\n--- シート: ${sheetName} ---\n${csvData}\n`;
    });

    // Blobクリーンアップ
    if (blobUrl) {
      await del(blobUrl).catch(err => 
        console.error('Blob deletion failed:', err)
      );
    }

    console.log(`Excel extraction successful: ${file.name}, extracted ${fullText.length} characters`);

    return NextResponse.json({ 
      text: fullText,
      success: true,
      fileName: file.name,
      textLength: fullText.length,
      sheetCount: workbook.SheetNames.length
    });
    
  } catch (error) {
    console.error('Excel extraction error:', error);
    
    // エラー時もBlobをクリーンアップ
    if (blobUrl) {
      await del(blobUrl).catch(err => 
        console.error('Blob deletion failed during error handling:', err)
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Excelファイルの処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}