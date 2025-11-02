// src/app/api/docx-extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as mammoth from 'mammoth';

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

    console.log(`Processing Word document: ${file.name}, Size: ${file.size} bytes`);

    // 4MB以上のファイルはクライアント側でチャンク分割されるため、ここでは4MB未満のみ処理
    const buffer = Buffer.from(await file.arrayBuffer());
    
    try {
      // mammothを使用してdocxからテキストを抽出
      const result = await mammoth.extractRawText({ buffer });
      
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
    
    return NextResponse.json(
      { 
        error: 'Request processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}