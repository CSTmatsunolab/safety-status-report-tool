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

    const buffer = Buffer.from(await file.arrayBuffer());
    
    try {
      // Excelファイルを読み込む
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellText: false,
        cellDates: true
      });
      
      let fullText = '';
      
      // 各シートを処理
      workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        
        // シート名を追加
        fullText += `\n=== シート: ${sheetName} ===\n`;
        
        // CSV形式のテキストに変換
        const csvContent = XLSX.utils.sheet_to_csv(worksheet, {
          blankrows: false,
          skipHidden: true
        });
        
        fullText += csvContent + '\n';
      });
      
      console.log(`Excel extraction successful: ${file.name}, extracted ${fullText.length} characters`);
      
      return NextResponse.json({ 
        text: fullText.trim(),
        success: true,
        fileName: file.name,
        textLength: fullText.length
      });
    } catch (error) {
      console.error('Excel parsing error:', error);
      
      return NextResponse.json({ 
        text: '', 
        success: false,
        error: 'Excel parsing failed',
        fileName: file.name
      });
    }
  } catch (error) {
    console.error('Request processing error:', error);
    return NextResponse.json(
      { error: 'Request processing failed' },
      { status: 500 }
    );
  }
}