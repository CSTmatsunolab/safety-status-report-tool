// src/app/api/build-knowledge-base/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Document } from '@langchain/core/documents';
import { UploadedFile } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
import { createEmbeddings } from '@/lib/embeddings';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { generateNamespace } from '@/lib/browser-id';
import { chunkDocument } from '@/lib/chunking-strategies';

// FileMetadata型を拡張（pdfBufferプロパティを追加）
interface ExtendedFileMetadata {
  originalType: string;
  extractionMethod: 'text' | 'pdf' | 'ocr' | 'excel' | 'docx' | 'failed' | 'vision-ocr';
  size: number;
  confidence?: number;
  service?: string;
  userDesignatedGSN: boolean;
  s3Key?: string;
  contentPreview?: string;
  isBase64?: boolean;
  isGSN?: boolean;
  [key: string]: unknown;
}

// UploadedFileの型を拡張
interface ExtendedUploadedFile extends Omit<UploadedFile, 'metadata'> {
  metadata?: ExtendedFileMetadata;
}

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET_NAME = process.env.APP_AWS_S3_BUCKET_NAME || 'safety-report-uploads-2024';

// 最大文字数制限
const MAX_CONTENT_CHARS = 80000;

// コンテンツを賢く切り詰める関数
function truncateContent(text: string, fileType: string, fileName: string): { 
  content: string; 
  truncated: boolean; 
  originalLength: number;
} {
  if (text.length <= MAX_CONTENT_CHARS) {
    return { 
      content: text, 
      truncated: false, 
      originalLength: text.length 
    };
  }

  console.log(`Truncating ${fileName}: ${text.length} -> ${MAX_CONTENT_CHARS} chars`);

  let truncatedContent = '';

  if (fileType.includes('csv') || fileType.includes('excel') || fileType.includes('spreadsheet')) {
    const lines = text.split('\n');
    let currentLength = 0;
    
    for (const line of lines) {
      if (currentLength + line.length + 1 > MAX_CONTENT_CHARS) {
        truncatedContent += '\n[残りのデータ行は省略されました]';
        break;
      }
      truncatedContent += (currentLength > 0 ? '\n' : '') + line;
      currentLength += line.length + 1;
    }
  } else if (fileType.includes('text') || fileType.includes('plain')) {
    const paragraphs = text.split('\n\n');
    let currentLength = 0;
    
    for (const paragraph of paragraphs) {
      if (currentLength + paragraph.length + 2 > MAX_CONTENT_CHARS) {
        truncatedContent += '\n\n[文書の続きは省略されました]';
        break;
      }
      truncatedContent += (currentLength > 0 ? '\n\n' : '') + paragraph;
      currentLength += paragraph.length + 2;
    }
  } else {
    truncatedContent = text.substring(0, MAX_CONTENT_CHARS) + '\n\n[内容が大きすぎるため省略されました]';
  }

  return {
    content: truncatedContent,
    truncated: true,
    originalLength: text.length
  };
}

// S3からファイルコンテンツを取得（Bufferとして返す）
async function getContentFromS3(
  key: string, 
  fileType: string, 
  fileName: string
): Promise<{
  content: string | Buffer;
  truncated: boolean;
  originalLength: number;
  isBuffer: boolean;
}> {
  try {
    console.log(`Fetching content from S3: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const buffer = await response.Body?.transformToByteArray();
    
    if (!buffer) {
      throw new Error('Failed to get file content from S3');
    }

    const nodeBuffer = Buffer.from(buffer);
    const lowerFileName = fileName.toLowerCase();

    // ★ DOCX/XLSXはBufferのまま返す（md-converterで構造保持変換するため）
    if (lowerFileName.endsWith('.docx') || fileType.includes('wordprocessingml')) {
      console.log(`[S3] Returning DOCX as Buffer for structure-preserving conversion`);
      return {
        content: nodeBuffer,
        truncated: false,
        originalLength: nodeBuffer.length,
        isBuffer: true
      };
    }
    
    if (lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls') || 
        fileType.includes('excel') || fileType.includes('spreadsheet')) {
      console.log(`[S3] Returning Excel as Buffer for structure-preserving conversion`);
      return {
        content: nodeBuffer,
        truncated: false,
        originalLength: nodeBuffer.length,
        isBuffer: true
      };
    }

    // テキストベースファイルの場合はテキストに変換
    let text = new TextDecoder().decode(nodeBuffer);

    const truncated = truncateContent(text, fileType, fileName);
    return {
      content: truncated.content,
      truncated: truncated.truncated,
      originalLength: truncated.originalLength,
      isBuffer: false
    };
    
  } catch (error) {
    console.error(`Error fetching from S3: ${key}`, error);
    throw error;
  }
}

// Bufferとして返すべきかどうかを判定
function shouldReturnAsBuffer(fileType: string, fileName: string): boolean {
  if (fileType === 'application/pdf') return true;
  
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (imageTypes.includes(fileType)) return true;
  
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith('.pdf') || 
      lowerFileName.match(/\.(jpg|jpeg|png|webp|gif)$/)) {
    return true;
  }
  
  return false;
}

// グローバルストレージ
const globalStores: Map<string, unknown> = 
  (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
(global as { vectorStores?: Map<string, unknown> }).vectorStores = globalStores;

export async function POST(request: NextRequest) {
  try {
    // userIdentifier と browserId の両方を受け付け（後方互換性）
    const { files, stakeholderId, userIdentifier, browserId }: { 
      files: ExtendedUploadedFile[];
      stakeholderId: string; 
      userIdentifier?: string;
      browserId?: string; 
    } = await request.json();
    
    const identifier = userIdentifier || browserId;
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    console.log('Building knowledge base for stakeholder:', stakeholderId);
    console.log('User identifier:', identifier);
    console.log('Processing files:', files.length);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'pinecone');

    const embeddings = createEmbeddings();
    const documents: Document[] = [];
    const warnings: string[] = [];
    
    for (const file of files) {
      // 全文使用ファイルはスキップ
      if (file.includeFullText) {
        console.log(`Skipping vector store for full-text file: ${file.name}`);
        continue;
      }
      
      let fileContent: string | Buffer = '';
      let truncated = false;
      let originalLength = 0;
      
      // S3参照の場合、またはcontentが空の場合はコンテンツを取得
      if (file.metadata?.s3Key && (!file.content || file.content === '')) {
        console.log(`Fetching content for ${file.name} from S3: ${file.metadata.s3Key}`);
        
        try {
          const result = await getContentFromS3(
            file.metadata.s3Key,
            file.metadata.originalType || file.type,
            file.name
          );
          
          fileContent = result.content;
          truncated = result.truncated;
          originalLength = result.originalLength;
          
          if (truncated) {
            const warning = `${file.name}: 大きすぎるため ${originalLength.toLocaleString()} 文字から ${MAX_CONTENT_CHARS.toLocaleString()} 文字に切り詰めました`;
            warnings.push(warning);
            console.warn(warning);
          }
          
        } catch (error) {
          console.error(`Failed to fetch S3 content for ${file.name}:`, error);
          fileContent = file.metadata.contentPreview || '';
        }
      } else if (file.content && file.content !== '') {  // contentが空でない場合のみ処理
        // ★ isBase64フラグを確認してデコード
        if (file.metadata?.isBase64) {
          console.log(`[Base64] Decoding binary content for ${file.name}`);
          try {
            fileContent = Buffer.from(file.content, 'base64');
            console.log(`[Base64] Decoded to Buffer: ${fileContent.length} bytes`);
          } catch (error) {
            console.error(`[Base64] Failed to decode ${file.name}:`, error);
            warnings.push(`${file.name}: Base64デコードに失敗しました`);
            continue;
          }
        } else {
          // テキストベースの処理
          fileContent = file.content;
          
          if (typeof fileContent === 'string') {
            const result = truncateContent(fileContent, file.type, file.name);
            if (result.truncated) {
              fileContent = result.content;
              const warning = `${file.name}: ${result.originalLength.toLocaleString()} 文字から ${MAX_CONTENT_CHARS.toLocaleString()} 文字に切り詰めました`;
              warnings.push(warning);
              console.warn(warning);
            }
          }
        }
      }
      
      // contentが完全に空の場合の処理
      if (!fileContent || (typeof fileContent === 'string' && fileContent === '')) {
        console.log(`No content available for ${file.name}`);
        
        // contentOmittedForTransmissionフラグがある場合の特別処理
        if (file.metadata?.contentOmittedForTransmission && file.metadata?.originalContentLength) {
          console.log(`Content was omitted for transmission (original: ${file.metadata.originalContentLength} chars)`);
          
          // S3キーがなくても再取得を試みる
          if (file.metadata?.s3Key) {
            try {
              console.log(`Attempting to fetch from S3: ${file.metadata.s3Key}`);
              const result = await getContentFromS3(
                file.metadata.s3Key,
                file.metadata.originalType || file.type,
                file.name
              );
              fileContent = result.content;
              
            } catch (error) {
              console.error(`Failed to retrieve content from S3:`, error);
            }
          }
        }
        
        // それでもcontentがない場合は警告を出してスキップ
        if (!fileContent || (typeof fileContent === 'string' && fileContent === '')) {
          console.warn(`Skipping ${file.name} - no content available`);
          warnings.push(`${file.name}: コンテンツが利用できません`);
          continue; // 次のファイルへ
        }
      }
      
      // チャンキング処理
      if (fileContent && (typeof fileContent === 'string' ? fileContent.length > 0 : fileContent.length > 0)) {
        try {
          console.log(`\n=== Chunking file: ${file.name} ===`);
          console.log(`File type: ${file.type}`);
          console.log(`Content type: ${typeof fileContent === 'string' ? 'string' : 'Buffer'}`);
          console.log(`Extraction method: ${file.metadata?.extractionMethod || 'N/A'}`);
          
          const metadataForChunking: Record<string, unknown> = {
            fileName: file.name,
            fileType: file.metadata?.originalType || file.type,
            uploadedAt: file.uploadedAt.toString(),
            truncated: truncated,
            stakeholderId: stakeholderId,
            isGSN: file.type === 'gsn' || file.metadata?.isGSN,
            isMinutes: file.type === 'minutes',
            extractionMethod: file.metadata?.extractionMethod,
            userDesignatedGSN: file.metadata?.userDesignatedGSN
          };

          const chunks = await chunkDocument(
            fileContent,
            file.name,
            file.metadata?.originalType || file.type,
            embeddings,
            metadataForChunking
          );
          
          console.log(`Created ${chunks.length} chunks using ${chunks[0]?.metadata?.chunkingMethod || 'unknown'} method`);
          console.log(`=== End chunking: ${file.name} ===\n`);
          
          documents.push(...chunks);
          
        } catch (chunkError) {
          console.error(`Error chunking file ${file.name}:`, chunkError);
          warnings.push(`ファイル ${file.name} のチャンキングでエラーが発生しました: ${chunkError instanceof Error ? chunkError.message : '不明なエラー'}`);
          
          // エラー時のフォールバック
          const content = typeof fileContent === 'string' 
            ? fileContent 
            : fileContent.toString('utf-8');
            
          const fallbackDoc = new Document({
            pageContent: content.substring(0, 10000), // 安全のため10000文字に制限
            metadata: {
              fileName: file.name,
              fileType: file.type,
              uploadedAt: file.uploadedAt.toString(),
              truncated: truncated,
              chunkIndex: 0,
              totalChunks: 1,
              stakeholderId: stakeholderId,
              isGSN: file.type === 'gsn',
              isMinutes: file.type === 'minutes',
              chunkingMethod: 'fallback-error'
            }
          });
          documents.push(fallbackDoc);
        }
      }
    }

    console.log('Total document chunks created:', documents.length);
    
    // チャンクが多すぎる場合の追加制限
    const MAX_CHUNKS = 500;
    if (documents.length > MAX_CHUNKS) {
      const warning = `チャンク数が多すぎるため、${documents.length} から ${MAX_CHUNKS} に制限しました`;
      warnings.push(warning);
      console.warn(warning);
      documents.length = MAX_CHUNKS;
    }
    
    // チャンクが0の場合の処理
    if (documents.length === 0) {
      const namespace = generateNamespace(stakeholderId, identifier);
      console.log('No documents to store in vector database (all files are full-text)');
      
      return NextResponse.json({
        success: true,
        documentCount: 0,
        vectorStore: 'none',
        message: 'All files are set to full-text mode, skipping vector store',
        warnings: warnings.length > 0 ? warnings : undefined,
        namespace: namespace
      });
    }

    // ベクトルストアにドキュメントを保存
    try {
      const vectorStore = await VectorStoreFactory.fromDocuments(
        documents,
        embeddings,
        { stakeholderId, embeddings, userIdentifier: identifier }
      );
    
      const namespace = generateNamespace(stakeholderId, identifier);
      const storeKey = `ssr_${namespace.replace(/-/g, '_')}`;

      globalStores.set(storeKey, vectorStore);
      console.log(`Saved memory store to global storage with key: ${storeKey}`);

      console.log('Knowledge base built successfully');

      return NextResponse.json({
        success: true,
        documentCount: documents.length,
        vectorStore: process.env.VECTOR_STORE || 'pinecone',
        warnings: warnings.length > 0 ? warnings : undefined,
        namespace: namespace
      });
      
    } catch (embedError) {
      console.error('Embedding error:', embedError);
      
      if (embedError instanceof Error && embedError.message.includes('max_tokens_per_request')) {
        return NextResponse.json(
          { 
            error: 'ファイルサイズが大きすぎます。より小さいファイルをアップロードしてください。',
            details: 'エンベディング処理のトークン制限を超えました',
            warnings 
          },
          { status: 400 }
        );
      }
      
      throw embedError;
    }
    
  } catch (error) {
    console.error('Knowledge base building error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to build knowledge base', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}