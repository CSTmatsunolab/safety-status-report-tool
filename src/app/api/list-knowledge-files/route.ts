// src/app/api/list-knowledge-files/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { generateNamespace } from '@/lib/browser-id';

interface FileInfo {
  fileName: string;
  uploadedAt: string | null;
  chunkCount: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stakeholderId = searchParams.get('stakeholderId');
    const userIdentifier = searchParams.get('userIdentifier');

    if (!stakeholderId || !userIdentifier) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!process.env.PINECONE_API_KEY) {
      return NextResponse.json(
        { error: 'Pinecone API key not configured' },
        { status: 500 }
      );
    }

    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
    const index = pinecone.index(indexName);
    const namespace = generateNamespace(stakeholderId, userIdentifier);

    console.log(`Listing files for namespace: ${namespace}`);

    // ダミーベクトルでクエリを実行してメタデータを取得
    // Pineconeは直接リスト取得ができないため、クエリでサンプリング
    const dimension = 1536; // text-embedding-3-small の次元数
    const dummyVector = new Array(dimension).fill(0);

    // 多めにサンプリングしてユニークなファイル名を抽出
    const queryResponse = await index.namespace(namespace).query({
      vector: dummyVector,
      topK: 10000, // 最大数を取得
      includeMetadata: true,
    });

    // ファイル名ごとに集計
    const fileMap = new Map<string, { uploadedAt: string | null; chunkCount: number }>();

    for (const match of queryResponse.matches || []) {
      const metadata = match.metadata;
      if (metadata && metadata.fileName) {
        const fileName = metadata.fileName as string;
        const uploadedAt = metadata.uploadedAt as string | null;
        
        const existing = fileMap.get(fileName);
        if (existing) {
          existing.chunkCount += 1;
          // より新しい日時があれば更新
          if (uploadedAt && (!existing.uploadedAt || uploadedAt > existing.uploadedAt)) {
            existing.uploadedAt = uploadedAt;
          }
        } else {
          fileMap.set(fileName, {
            uploadedAt: uploadedAt || null,
            chunkCount: 1,
          });
        }
      }
    }

    // 配列に変換してソート（日時降順、日時なしは最後）
    const files: FileInfo[] = Array.from(fileMap.entries())
      .map(([fileName, info]) => ({
        fileName,
        uploadedAt: info.uploadedAt,
        chunkCount: info.chunkCount,
      }))
      .sort((a, b) => {
        if (a.uploadedAt && b.uploadedAt) {
          return b.uploadedAt.localeCompare(a.uploadedAt);
        }
        if (a.uploadedAt) return -1;
        if (b.uploadedAt) return 1;
        return a.fileName.localeCompare(b.fileName);
      });

    console.log(`Found ${files.length} unique files in namespace: ${namespace}`);

    return NextResponse.json({
      success: true,
      namespace,
      files,
      totalFiles: files.length,
    });

  } catch (error) {
    console.error('Error listing knowledge files:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list knowledge files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}