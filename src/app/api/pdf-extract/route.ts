import { NextRequest, NextResponse } from 'next/server';

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
      // pdf-parse-newを使用（pdf-parseの修正版）
      const pdf = await import('pdf-parse-new');
      const data = await pdf.default(buffer);
      
      console.log(`PDF extraction successful: ${file.name}, extracted ${data.text.length} characters`);
      
      return NextResponse.json({ 
        text: data.text,
        success: true,
        fileName: file.name,
        textLength: data.text.length
      });
    } catch (error) {
      console.error('PDF parsing error:', error);
      
      // エラーが発生しても空のテキストを返してアップロードを続行
      return NextResponse.json({ 
        text: '', 
        success: false,
        error: 'PDF parsing failed',
        fileName: file.name,
        details: error instanceof Error ? error.message : 'Unknown error'
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