// lib/chunking-strategies.ts

import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { maxMinSemanticChunk } from './max-min-chunking';
import {
  convertToMarkdown,
  extractPreservedBlocks,
  extractSafetyIds,
  isPdfFile,
  getPdfWarning,
  ConversionResult
} from './md-converter';

// 環境変数でアドバンスドチャンキングの有効/無効を制御
const USE_ADVANCED_CHUNKING = process.env.USE_ADVANCED_CHUNKING === 'true';

// 環境変数でMD変換の有効/無効を制御（デフォルト有効）
const USE_MD_CONVERSION = process.env.USE_MD_CONVERSION !== 'false';

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

// チャンキング結果の型定義（警告を含む）
export interface ChunkingResult {
  documents: Document[];
  warnings: string[];
  conversionInfo?: {
    method: string;
    confidence: number;
    skipped?: boolean;
  };
}

/**
 * ドキュメントをチャンク分割（既存API互換）
 */
export async function chunkDocument(
  contentOrBuffer: string | Buffer,
  fileName: string,
  fileType: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<Document[]> {
  const result = await chunkDocumentWithInfo(
    contentOrBuffer,
    fileName,
    fileType,
    embeddings,
    metadata
  );
  return result.documents;
}

/**
 * ドキュメントをチャンク分割（詳細情報付き）
 */
export async function chunkDocumentWithInfo(
  contentOrBuffer: string | Buffer,
  fileName: string,
  fileType: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<ChunkingResult> {
  
  console.log(`\n=== Chunking Strategy Selection ===`);
  console.log(`File: ${fileName}`);
  console.log(`Type: ${fileType}`);
  console.log(`Advanced Chunking: ${USE_ADVANCED_CHUNKING ? 'ENABLED' : 'DISABLED'}`);
  console.log(`MD Conversion: ${USE_MD_CONVERSION ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Extraction Method: ${metadata.extractionMethod || 'N/A'}`);
  
  const warnings: string[] = [];
  
  // アップロード日時を追加
  const uploadedAt = new Date().toISOString();
  let metadataWithTimestamp: ChunkMetadata = {
    ...metadata,
    uploadedAt,
  };
  
  // テキストを取得
  let text = typeof contentOrBuffer === 'string'
    ? contentOrBuffer
    : contentOrBuffer.toString('utf-8');
  
  // MD変換情報
  let conversionInfo: { method: string; confidence: number; skipped?: boolean } | undefined;
  
  // ===== MD変換処理 =====
  if (USE_MD_CONVERSION) {
    console.log(`\n--- MD Conversion Phase ---`);
    
    // PDF警告チェック
    if (isPdfFile(fileType, fileName)) {
      const pdfWarning = getPdfWarning();
      warnings.push(pdfWarning);
      console.warn('⚠️ PDF detected - showing conversion recommendation');
    }
    
    try {
      const conversionResult: ConversionResult = await convertToMarkdown(
        contentOrBuffer,
        fileType,
        fileName
      );
      
      text = conversionResult.markdown;
      conversionInfo = {
        method: conversionResult.method,
        confidence: conversionResult.confidence,
        skipped: conversionResult.skipped
      };
      
      // 変換警告を追加
      if (conversionResult.warnings.length > 0) {
        warnings.push(...conversionResult.warnings);
      }
      
      // メタデータに変換情報を追加
      metadataWithTimestamp = {
        ...metadataWithTimestamp,
        mdConversionMethod: conversionResult.method,
        mdConversionConfidence: conversionResult.confidence,
        mdConversionSkipped: conversionResult.skipped,
      };
      
      if (conversionResult.skipped) {
        console.log(`Result: SKIPPED (already Markdown)`);
      } else {
        console.log(`Method: ${conversionResult.method}`);
        console.log(`Confidence: ${(conversionResult.confidence * 100).toFixed(0)}%`);
        console.log(`Output Length: ${text.length} chars`);
      }
      
    } catch (error) {
      console.error('MD Conversion failed:', error);
      warnings.push(`MD変換エラー: ${error}`);
      // 変換失敗時は元のテキストを使用
    }
  }
  
  // ===== チャンキング処理 =====
  
  // 環境変数がfalseの場合は従来の固定長チャンキングを使用
  if (!USE_ADVANCED_CHUNKING) {
    console.log(`Strategy: Traditional Fixed-Size Chunking`);
    console.log(`===================================\n`);
    
    const documents = await traditionalFixedSizeChunking(
      text,
      fileName,
      metadataWithTimestamp
    );
    
    return { documents, warnings, conversionInfo };
  }
  
  // Max-Min Semantic Chunking（保護ブロック対応版）
  console.log(`Strategy: Max-Min Semantic Chunking`);
  console.log(`===================================\n`);
  
  const documents = await maxMinSemanticChunkingStrategy(
    text,
    fileName,
    fileType,
    embeddings,
    metadataWithTimestamp
  );
  
  return { documents, warnings, conversionInfo };
}

/**
 * 従来の固定長チャンキング（環境変数がfalseの場合）
 */
async function traditionalFixedSizeChunking(
  text: string,
  fileName: string,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
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
        fileName: fileName,
        containedIds: extractSafetyIds(chunkText)
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
 * Max-Min Semantic Chunkingストラテジー（保護ブロック対応版）
 */
async function maxMinSemanticChunkingStrategy(
  text: string,
  fileName: string,
  fileType: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  try {
    // 1. 保護ブロックを抽出（表など分割禁止）
    const { preservedBlocks, remainingText } = extractPreservedBlocks(text);
    
    console.log(`Preserved Blocks: ${preservedBlocks.length}`);
    console.log(`Remaining Text: ${remainingText.length} chars`);
    
    // 2. PDFかどうかを判定
    const isPDF = metadata.extractionMethod === 'pdf' || 
                  metadata.extractionMethod === 'ocr' ||
                  metadata.extractionMethod === 'vision-ocr' ||
                  isPdfFile(fileType, fileName);
    
    // 3. PDFの場合は調整されたパラメータを使用
    const config = isPDF ? {
      hard_thr: 0.5,    // PDFは閾値を上げて結合を促進
      init_const: 2.0,  // PDFは初期値を上げて結合を促進  
      c: 0.9
    } : {
      hard_thr: 0.4,    // デフォルト値
      init_const: 1.5,
      c: 0.9
    };
    
    if (isPDF) {
      console.log('PDF detected - using adjusted parameters for chunking');
      console.log('Config:', config);
    }
    
    // 4. 残りのテキストにMax-Minチャンキングを実行
    let semanticChunks: string[] = [];
    if (remainingText.trim().length > 0) {
      semanticChunks = await maxMinSemanticChunk(
        remainingText, 
        embeddings,
        config,
        isPDF
      );
      console.log(`Semantic Chunks: ${semanticChunks.length}`);
    }
    
    // 5. ドキュメント配列を構築
    const documents: Document[] = [];
    let chunkIndex = 0;
    
    // 5a. 保護ブロックをドキュメント化（表などは分割しない）
    for (const block of preservedBlocks) {
      if (block.trim().length === 0) continue;
      
      documents.push(new Document({
        pageContent: block,
        metadata: {
          ...metadata,
          chunkIndex: chunkIndex++,
          chunkingMethod: 'preserved-block',
          isPreservedBlock: true,
          fileName: fileName,
          isPDF: isPDF,
          containedIds: extractSafetyIds(block)
        }
      }));
    }
    
    // 5b. セマンティックチャンクをドキュメント化
    for (const chunk of semanticChunks) {
      if (chunk.trim().length === 0) continue;
      
      documents.push(new Document({
        pageContent: chunk,
        metadata: {
          ...metadata,
          chunkIndex: chunkIndex++,
          chunkingMethod: 'max-min-semantic',
          isPreservedBlock: false,
          fileName: fileName,
          isPDF: isPDF,
          containedIds: extractSafetyIds(chunk)
        }
      }));
    }
    
    // 6. 総チャンク数を更新
    const totalChunks = documents.length;
    documents.forEach(doc => {
      doc.metadata.totalChunks = totalChunks;
    });
    
    // チャンク数が多すぎる場合の警告
    if (totalChunks > 100) {
      console.warn(`Warning: ${totalChunks} chunks created. Consider adjusting parameters.`);
    }
    
    // ドキュメントがない場合のフォールバック
    if (documents.length === 0) {
      console.warn('No chunks created, using fallback');
      return traditionalFixedSizeChunking(text, fileName, metadata);
    }
    
    console.log(`Total Chunks: ${totalChunks}`);
    
    return documents;
    
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
    mdConversion: USE_MD_CONVERSION,
    strategies: USE_ADVANCED_CHUNKING 
      ? ['max-min-semantic', 'preserved-blocks']
      : ['fixed-size'],
    fixedChunkSize: 1000,
    fixedChunkOverlap: 100,
  };
}