// src/app/api/chunk-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 型定義
interface UploadMetadata {
  fileName: string;
  fileType: string;
  totalChunks: number;
  uploadTime: number;
}

// グローバルメモリストレージs
declare global {
  var uploadChunks: Map<string, Map<number, Buffer>> | undefined;
  var uploadMetadata: Map<string, UploadMetadata> | undefined;
}

// 初期化
if (!global.uploadChunks) {
  global.uploadChunks = new Map();
}
if (!global.uploadMetadata) {
  global.uploadMetadata = new Map();
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = formData.get('chunkIndex') as string;
    const totalChunks = formData.get('totalChunks') as string;
    const fileName = formData.get('fileName') as string;
    const fileType = formData.get('fileType') as string;
    
    if (!chunk || !uploadId || !chunkIndex) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    
    const chunkIndexNum = Number(chunkIndex);
    const totalChunksNum = Number(totalChunks);
    
    // メモリに保存
    if (!global.uploadChunks!.has(uploadId)) {
      global.uploadChunks!.set(uploadId, new Map());
      global.uploadMetadata!.set(uploadId, {
        fileName,
        fileType,
        totalChunks: totalChunksNum,
        uploadTime: Date.now()
      });
    }
    
    // チャンクをメモリに保存
    const buffer = Buffer.from(await chunk.arrayBuffer());
    global.uploadChunks!.get(uploadId)!.set(chunkIndexNum, buffer);
    
    console.log(`Chunk ${chunkIndex}/${totalChunks} saved in memory: ${fileName} (${uploadId})`);
    
    // 5分以上古いアップロードをクリーンアップ
    const now = Date.now();
    for (const [id, metadata] of global.uploadMetadata!.entries()) {
      if (now - metadata.uploadTime > 5 * 60 * 1000) {
        global.uploadChunks!.delete(id);
        global.uploadMetadata!.delete(id);
        console.log(`Cleaned up expired upload: ${id}`);
      }
    }
    
    // 現在の状態を返す
    const currentChunks = global.uploadChunks!.get(uploadId)!.size;
    
    return NextResponse.json({ 
      success: true, 
      chunkIndex: chunkIndexNum,
      uploadId,
      received: currentChunks,
      total: totalChunksNum,
      complete: currentChunks === totalChunksNum
    });
    
  } catch (error) {
    console.error('Chunk upload error:', error);
    return NextResponse.json(
      { 
        error: 'Chunk upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}