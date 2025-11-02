// src/app/api/excel-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
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

    // 4MB以上のファイルはクライアント側でチャンク分割されるため、ここでは4MB未満のみ処理
    const buffer = Buffer.from(await file.arrayBuffer());

    // Excelファイルを解析
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let fullText = '';

    // 全シートのテキストを抽出
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csvData = XLSX.utils.sheet_to_csv(sheet);
      fullText += `\n--- シート: ${sheetName} ---\n${csvData}\n`;
    });

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
    
    return NextResponse.json(
      { 
        error: 'Excelファイルの処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}