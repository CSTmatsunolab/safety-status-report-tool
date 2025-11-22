// lib/chunking-strategies.ts

import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { processDocumentWithVision } from './vision-guided-chunking';
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

/**
 * ファイルタイプに応じた最適なチャンキング戦略を選択
 * 
 * 重要：PDFファイルは、テキスト抽出済みでも視覚的構造（表、図、レイアウト）が
 * 重要なため、オリジナルのPDFバイナリがある場合はVision-Guidedを優先的に使用
 */
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
  console.log(`Content type: ${typeof contentOrBuffer}`);
  console.log(`Is Buffer: ${Buffer.isBuffer(contentOrBuffer)}`);
  console.log(`Has PDF Buffer in metadata: ${!!metadata.pdfBuffer}`);
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
    
    // ケース1: PDFバイナリが直接渡されている
    if (Buffer.isBuffer(contentOrBuffer)) {
      console.log(`Strategy: Vision-Guided Chunking (PDF Binary Available)`);
      console.log(`===================================\n`);
      
      return await visionGuidedChunkingStrategy(
        contentOrBuffer,
        fileName,
        fileType,
        metadata
      );
    }
    
    // ケース2: メタデータにPDFバイナリが保存されている
    if (metadata.pdfBuffer) {
      console.log(`Strategy: Vision-Guided Chunking (Using Stored PDF Binary)`);
      console.log(`===================================\n`);
      
      // pdfBufferをBufferに変換（必要な場合）
      let pdfBuffer: Buffer;
      
      if (Buffer.isBuffer(metadata.pdfBuffer)) {
        pdfBuffer = metadata.pdfBuffer;
      } else {
        // any型にキャストしてプロパティにアクセス
        const pdfBufferAny = metadata.pdfBuffer as any;
        
        if (typeof pdfBufferAny === 'object' && pdfBufferAny.type === 'Buffer' && Array.isArray(pdfBufferAny.data)) {
          // JSONシリアライズされたBufferオブジェクトの復元
          pdfBuffer = Buffer.from(pdfBufferAny.data);
          console.log(`Restored Buffer from serialized object (${pdfBuffer.length} bytes)`);
        } else if (typeof pdfBufferAny === 'string') {
          // Base64文字列の場合
          pdfBuffer = Buffer.from(pdfBufferAny, 'base64');
          console.log(`Restored Buffer from base64 string (${pdfBuffer.length} bytes)`);
        } else {
          console.error(`Invalid pdfBuffer type: ${typeof pdfBufferAny}`, pdfBufferAny);
          // Max-Minにフォールバック
          console.log(`Falling back to Max-Min Semantic Chunking`);
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
      }
      
      return await visionGuidedChunkingStrategy(
        pdfBuffer,
        fileName,
        fileType,
        metadata
      );
    }
    
    // ケース3: テキスト抽出済みだがバイナリがない場合
    console.log(`WARNING: PDF text extracted but no binary available for Vision-Guided processing`);
    console.log(`Recommendation: Store original PDF buffer in metadata.pdfBuffer for better chunking`);
    console.log(`Falling back to Max-Min Semantic Chunking`);
    
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
  
  // 画像ファイルの処理
  const imageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ];
  
  if (imageTypes.includes(fileType)) {
    if (Buffer.isBuffer(contentOrBuffer)) {
      console.log(`Strategy: Vision-Guided Chunking (Image)`);
      console.log(`===================================\n`);
      
      return await visionGuidedChunkingStrategy(
        contentOrBuffer,
        fileName,
        fileType,
        metadata
      );
    } else {
      console.log(`ERROR: Image file but no binary buffer available`);
      return [];
    }
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
 * Vision-Guided Chunkingストラテジー（PDF/画像直接送信）
 */
async function visionGuidedChunkingStrategy(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  try {

    if (!Buffer.isBuffer(fileBuffer)) {
      console.error('Vision-Guided Chunking requires Buffer, got:', typeof fileBuffer);
      throw new Error('Invalid input: Buffer expected');
    }

    // PDFまたは画像を直接Geminiに送信して視覚的にチャンキング
    const chunks = await processDocumentWithVision(
      fileBuffer,
      fileName,
      fileType
    );
    
    return chunks.map((chunk, index) => new Document({
      pageContent: chunk.content,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunkingMethod: 'vision-guided-direct',
        heading: chunk.heading,
        headingHierarchy: chunk.metadata.headingHierarchy,
        continues: chunk.continues,
        continuesFlag: chunk.metadata.continuesFlag,
        fileName: fileName,
        fallbackParsed: chunk.metadata.fallbackParsed || false
      }
    }));
    
  } catch (error) {
    console.error('Vision-Guided Chunking failed:', error);
    
    // エラー時のフォールバック処理
    console.log('Attempting fallback to text-based chunking...');
    
    // Bufferからテキストを取得してフォールバック
    const text = fileBuffer.toString('utf-8');
    
    if (text && text.length > 0) {
      return await traditionalFixedSizeChunking(text, fileName, metadata);
    } else {
      console.error('Failed to extract text for fallback');
      return [];
    }
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
    const chunks = await maxMinSemanticChunk(text, embeddings);
    
    return chunks.map((chunkText, index) => new Document({
      pageContent: chunkText,
      metadata: {
        ...metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
        chunkingMethod: 'max-min-semantic',
        fileName: fileName
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
      ? ['vision-guided', 'max-min-semantic'] 
      : ['fixed-size'],
    fixedChunkSize: 1000,
    fixedChunkOverlap: 100,
    recommendation: 'Store original PDF buffer in metadata.pdfBuffer for optimal chunking'
  };
}