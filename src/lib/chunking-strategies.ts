// lib/chunking-strategies.ts

import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { maxMinSemanticChunk } from './max-min-chunking';

// 環境変数でアドバンスドチャンキングの有効/無効を制御
const USE_ADVANCED_CHUNKING = process.env.USE_ADVANCED_CHUNKING === 'true';

// メタデータの型定義
interface ChunkMetadata {
  extractionMethod?: string;
  userDesignatedGSN?: boolean;
  s3Key?: string;
  contentPreview?: string;
  isBase64?: boolean;
  originalType?: string;
  pdfBuffer?: Buffer;  // PDFのオリジナルバイナリを保持
  [key: string]: unknown;
}

export async function chunkDocument(
  contentOrBuffer: string | Buffer,
  fileName: string,
  fileType: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  console.log(`\n=== Chunking Strategy Selection ===`);
  console.log(`File: ${fileName}`);
  console.log(`Type: ${fileType}`);
  console.log(`Advanced Chunking: ${USE_ADVANCED_CHUNKING ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Extraction Method: ${metadata.extractionMethod || 'N/A'}`);
  
  // 環境変数がfalseの場合は従来の固定長チャンキングを使用
  if (!USE_ADVANCED_CHUNKING) {
    console.log(`Strategy: Traditional Fixed-Size Chunking`);
    console.log(`===================================\n`);
    
    return await traditionalFixedSizeChunking(
      contentOrBuffer,
      fileName,
      metadata
    );
  }
  
  // PDFの場合の処理戦略決定
  if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    console.log(`Strategy: Max-Min Semantic Chunking`);
    console.log(`===================================\n`);
    
    const text = Buffer.isBuffer(contentOrBuffer)
      ? contentOrBuffer.toString('utf-8')
      : contentOrBuffer;
      
    return await maxMinSemanticChunkingStrategy(
      text,
      fileName,
      embeddings,
      metadata
    );
  }
  
  // その他のテキストファイル（.txt, .md, .csv など）
  console.log(`Strategy: Max-Min Semantic Chunking (Text)`);
  console.log(`===================================\n`);
  
  const text = typeof contentOrBuffer === 'string' 
    ? contentOrBuffer 
    : contentOrBuffer.toString('utf-8');
    
  return await maxMinSemanticChunkingStrategy(
    text,
    fileName,
    embeddings,
    metadata
  );
}

/**
 * 従来の固定長チャンキング（環境変数がfalseの場合）
 */
async function traditionalFixedSizeChunking(
  contentOrBuffer: string | Buffer,
  fileName: string,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  // Bufferの場合はstringに変換
  const text = typeof contentOrBuffer === 'string' 
    ? contentOrBuffer 
    : contentOrBuffer.toString('utf-8');
  
  // 従来のRecursiveCharacterTextSplitterを使用
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
    separators: ['\n\n', '\n', '。', '．', '！', '？', ' '],
  });
  
  try {
    const chunks = await textSplitter.splitText(text);
    
    return chunks.map((chunkText, index) => new Document({
      pageContent: chunkText,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunkingMethod: 'traditional-fixed-size',
        chunkSize: 1000,
        chunkOverlap: 100,
        fileName: fileName
      }
    }));
    
  } catch (error) {
    console.error('Traditional chunking failed:', error);
    return [new Document({
      pageContent: text,
      metadata: {
        ...metadata,
        chunkIndex: 0,
        totalChunks: 1,
        chunkingMethod: 'fallback-whole',
        fileName: fileName
      }
    })];
  }
}

/**
 * Max-Min Semantic Chunkingストラテジー
 */
async function maxMinSemanticChunkingStrategy(
  text: string,
  fileName: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  try {
    // PDFかどうかを判定
    const isPDF = metadata.extractionMethod === 'pdf' || 
                  metadata.extractionMethod === 'ocr' ||
                  fileName.toLowerCase().endsWith('.pdf');
    
    // PDFの場合は調整されたパラメータを使用
    const config = isPDF ? {
      hard_thr: 0.5,    // PDFは閾値を上げて結合を促進
      init_const: 2.0,  // PDFは初期値を上げて結合を促進  
      c: 0.9
    } : {
      hard_thr: 0.4,    // デフォルト値
      init_const: 1.5,
      c: 0.9
    };
    
    // デバッグ情報
    if (isPDF) {
      console.log('PDF detected - using adjusted parameters for chunking');
      console.log('Config:', config);
    }
    
    // Max-Minチャンキングを実行（修正版のmax-min-chunking.tsを使用）
    const chunks = await maxMinSemanticChunk(
      text, 
      embeddings,
      config,
      isPDF  // PDFフラグを渡す
    );
    
    // チャンク数が多すぎる場合の警告
    if (chunks.length > 100) {
      console.warn(`Warning: ${chunks.length} chunks created. Consider adjusting parameters.`);
    }
    
    return chunks.map((chunkText, index) => new Document({
      pageContent: chunkText,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunkingMethod: 'max-min-semantic',
        fileName: fileName,
        isPDF: isPDF
      }
    }));
    
  } catch (error) {
    console.error('Max-Min Semantic Chunking failed:', error);
    return traditionalFixedSizeChunking(text, fileName, metadata);
  }
}

/**
 * 現在のチャンキング設定を取得
 */
export function getChunkingConfiguration() {
  return {
    mode: USE_ADVANCED_CHUNKING ? 'advanced' : 'traditional',
    enabled: USE_ADVANCED_CHUNKING,
    strategies: USE_ADVANCED_CHUNKING 
      ? ['max-min-semantic']
      : ['fixed-size'],
    fixedChunkSize: 1000,
    fixedChunkOverlap: 100,
  };
}