import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const TEMP_DIR = '/tmp/file-chunks';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = formData.get('chunkIndex') as string;
    const fileName = formData.get('fileName') as string;
    const fileType = formData.get('fileType') as string;
    
    if (!chunk || !uploadId || !chunkIndex) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    
    // アップロードディレクトリ作成
    const uploadDir = path.join(TEMP_DIR, uploadId);
    await fs.mkdir(uploadDir, { recursive: true });
    
    // メタデータ保存（最初のチャンクの時のみ）
    if (chunkIndex === '0') {
      const metadata = {
        fileName,
        fileType,
        uploadTime: new Date().toISOString()
      };
      await fs.writeFile(
        path.join(uploadDir, 'metadata.json'),
        JSON.stringify(metadata)
      );
    }
    
    // チャンク保存
    const buffer = Buffer.from(await chunk.arrayBuffer());
    const chunkPath = path.join(uploadDir, `chunk_${chunkIndex.padStart(3, '0')}`);
    await fs.writeFile(chunkPath, buffer);
    
    console.log(`Chunk ${chunkIndex} saved: ${fileName} (${uploadId})`);
    
    return NextResponse.json({ 
      success: true, 
      chunkIndex,
      uploadId 
    });
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    return NextResponse.json(
      { error: 'Chunk upload failed' },
      { status: 500 }
    );
  }
}