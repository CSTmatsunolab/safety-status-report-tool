import { NextRequest, NextResponse } from 'next/server';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { UploadedFile } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
import { createEmbeddings } from '@/lib/embeddings';

// グローバルストレージ（メモリストアの参照を保持）
const globalStores: Map<string, unknown> = 
  (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
(global as { vectorStores?: Map<string, unknown> }).vectorStores = globalStores;

export async function POST(request: NextRequest) {
  try {
    const { files, stakeholderId }: { files: UploadedFile[]; stakeholderId: string } = 
      await request.json();
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    console.log('Building knowledge base for stakeholder:', stakeholderId);
    console.log('Processing files:', files.length);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'pinecone');

    // エンベディングモデルの初期化
    const embeddings = createEmbeddings();

    // テキストスプリッターの設定
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '。', '．', '！', '？', ' '],
    });

    // 全ファイルからドキュメントを作成
    const documents: Document[] = [];
    
    for (const file of files) {
      // 全文使用ファイルはスキップ
      if (file.includeFullText) {
        console.log(`Skipping vector store for full-text file: ${file.name}`);
        continue;
      }
      
      if (file.content && file.content.length > 0) {
        // テキストをチャンクに分割
        const chunks = await textSplitter.createDocuments(
          [file.content],
          [{
            fileName: file.name,
            fileType: file.type,
            uploadedAt: file.uploadedAt.toString()
          }]
        );
        
        // メタデータを追加
        chunks.forEach((chunk, index) => {
          chunk.metadata = {
            ...chunk.metadata,
            chunkIndex: index,
            totalChunks: chunks.length,
            stakeholderId: stakeholderId,
            isGSN: file.type === 'gsn',
            isMinutes: file.type === 'minutes',
          };
        });
        
        documents.push(...chunks);
      }
    }

    console.log('Created document chunks:', documents.length);
    
    // チャンクが0の場合の処理
    if (documents.length === 0) {
      console.log('No documents to store in vector database (all files are full-text)');
      
      // 空のベクトルストアを作成せず、成功レスポンスを返す
      return NextResponse.json({
        success: true,
        documentCount: 0,
        vectorStore: 'none',
        message: 'All files are set to full-text mode, skipping vector store'
      });
    }

    // ベクトルストアにドキュメントを保存
    const vectorStore = await VectorStoreFactory.fromDocuments(
      documents,
      embeddings,
      { stakeholderId, embeddings }
    );
  
    const storeKey = `ssr_${stakeholderId.replace(/-/g, '_')}`;
    globalStores.set(storeKey, vectorStore);
    console.log(`Saved memory store to global storage with key: ${storeKey}`);

    console.log('Knowledge base built successfully');

    return NextResponse.json({
      success: true,
      documentCount: documents.length,
      vectorStore: process.env.VECTOR_STORE || 'pinecone',
    });
  } catch (error) {
    console.error('Knowledge base building error:', error);
    return NextResponse.json(
      { error: 'Failed to build knowledge base', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}