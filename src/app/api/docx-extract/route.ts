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
    } catch (error) {
      console.error('DOCX parsing error:', error);
      
      return NextResponse.json({ 
        text: '', 
        success: false,
        error: 'DOCX parsing failed',
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