// src/app/api/pdf-chunk-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// 一時ストレージディレクトリ
const TEMP_DIR = '/tmp/pdf-chunks';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = formData.get('chunkIndex') as string;
    
    if (!chunk || !uploadId || !chunkIndex) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    
    // ディレクトリ作成
    const uploadDir = path.join(TEMP_DIR, uploadId);
    await fs.mkdir(uploadDir, { recursive: true });
    
    // チャンクをファイルとして保存
    const buffer = Buffer.from(await chunk.arrayBuffer());
    const chunkPath = path.join(uploadDir, `chunk_${chunkIndex.padStart(3, '0')}`);
    await fs.writeFile(chunkPath, buffer);
    
    console.log(`Chunk ${chunkIndex} saved for upload ${uploadId}`);
    
    return NextResponse.json({ success: true, chunkIndex });
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    return NextResponse.json(
      { error: 'Chunk upload failed' },
      { status: 500 }
    );
  }
}