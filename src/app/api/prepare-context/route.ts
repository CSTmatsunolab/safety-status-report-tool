// src/app/api/prepare-context/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { UploadedFile, Stakeholder, ReportStructureTemplate } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
import { createEmbeddings } from '@/lib/embeddings';
import { performAdaptiveRRFSearch } from '@/lib/rrf-fusion';
import { getDynamicK } from '@/lib/rag-utils';
import { CustomStakeholderQueryEnhancer } from '@/lib/query-enhancer';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.APP_AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET_NAME = process.env.APP_AWS_S3_BUCKET_NAME || 'safety-report-uploads-2024';

// 制限値
const MAX_CONTENT_CHARS_PER_FILE = 50000;
const MAX_TOTAL_CONTEXT_CHARS = 100000;

interface PrepareContextRequest {
  files: UploadedFile[];
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  userIdentifier?: string;
  language?: 'ja' | 'en';
}

interface PrepareContextResponse {
  success: boolean;
  context: {
    fullTextContent: string;
    ragContent: string;
    gsnContent: string;
    combinedContext: string;
  };
  metadata: {
    fullTextFileCount: number;
    ragResultCount: number;
    gsnFileCount: number;
    totalCharacters: number;
    hasContent: boolean;
  };
  error?: string;
  duration: number;
}

/**
 * S3からファイルコンテンツを取得
 */
async function getFileContentFromS3(s3Key: string, fileName: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
    });
    
    const response = await s3Client.send(command);
    const bodyContents = await response.Body?.transformToByteArray();
    
    if (!bodyContents) {
      throw new Error('Empty response from S3');
    }

    const buffer = Buffer.from(bodyContents);
    const lowerFileName = fileName.toLowerCase();

    if (lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls')) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let content = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        content += `\n=== Sheet: ${sheetName} ===\n`;
        content += XLSX.utils.sheet_to_txt(sheet);
      });
      return content;
    }

    if (lowerFileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    return buffer.toString('utf-8');
    
  } catch (error) {
    console.error(`Error fetching from S3: ${s3Key}`, error);
    throw error;
  }
}

/**
 * 全文使用ファイルのコンテンツを取得
 */
async function getFullTextContent(files: UploadedFile[]): Promise<{ content: string; count: number }> {
  const fullTextFiles = files.filter(f => f.includeFullText);
  let content = '';
  let count = 0;
  
  for (const file of fullTextFiles) {
    let fileContent = file.content;
    
    // S3からコンテンツ取得
    if (file.metadata?.s3Key && (!fileContent || fileContent.length < 1000)) {
      try {
        fileContent = await getFileContentFromS3(file.metadata.s3Key, file.name);
      } catch (error) {
        console.warn(`Failed to fetch ${file.name} from S3:`, error);
        continue;
      }
    }
    
    if (!fileContent || fileContent.trim().length === 0) {
      continue;
    }
    
    // 文字数制限
    if (fileContent.length > MAX_CONTENT_CHARS_PER_FILE) {
      fileContent = fileContent.substring(0, MAX_CONTENT_CHARS_PER_FILE);
    }
    
    content += `\n=== ${file.name} ===\n${fileContent}\n`;
    count++;
  }

  return { content, count };
}

/**
 * GSNファイルのコンテンツを取得
 */
async function getGSNContent(files: UploadedFile[]): Promise<{ content: string; count: number }> {
  const gsnFiles = files.filter(f => 
    f.type === 'gsn' || 
    f.metadata?.userDesignatedGSN || 
    f.name.toLowerCase().includes('gsn')
  );
  
  let content = '';
  let count = 0;
  
  for (const file of gsnFiles) {
    let fileContent = file.content;
    
    // S3からコンテンツ取得
    if (file.metadata?.s3Key && (!fileContent || fileContent.length < 1000)) {
      try {
        fileContent = await getFileContentFromS3(file.metadata.s3Key, file.name);
      } catch (error) {
        console.warn(`Failed to fetch GSN file ${file.name} from S3:`, error);
        continue;
      }
    }
    
    if (!fileContent || fileContent.trim().length === 0) {
      continue;
    }
    
    content += `\n=== GSN: ${file.name} ===\n${fileContent}\n`;
    count++;
  }

  return { content, count };
}

/**
 * RAG検索でコンテンツを取得
 */
async function getRAGContent(
  stakeholder: Stakeholder,
  _reportStructure: ReportStructureTemplate,  // 現在は未使用（QueryEnhancerがクエリを生成）
  _files: UploadedFile[],  // 現在は未使用（VectorStoreから直接取得）
  userIdentifier?: string
): Promise<{ content: string; count: number }> {
  if (!userIdentifier) {
    return { content: '', count: 0 };
  }

  try {
    const embeddings = createEmbeddings();
    const vectorStore = await VectorStoreFactory.getExistingStore(
      embeddings,
      stakeholder.id,
      userIdentifier
    );
    
    if (!vectorStore) {
      console.log('No vector store found');
      return { content: '', count: 0 };
    }

    // CustomStakeholderQueryEnhancerを使用してクエリを生成（元のgenerate-report方式）
    const queryEnhancer = new CustomStakeholderQueryEnhancer();
    const queries = queryEnhancer.enhanceQuery(stakeholder, { maxQueries: 5 });
    
    console.log(`Enhanced queries (${queries.length}): ${queries.join(' | ')}`);
    
    // ベクターストアの統計情報を取得して動的K値を計算
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    const stats = await VectorStoreFactory.getVectorStoreStats(
      vectorStore,
      stakeholder.id,
      userIdentifier
    );
    const totalChunks = stats.totalDocuments;
    
    // 動的K値を計算
    const dynamicK = getDynamicK(totalChunks, stakeholder, vectorStoreType);
    
    console.log(`📊 Dynamic K: ${dynamicK}, Realistic K: ${Math.min(dynamicK, totalChunks)}`);
    
    // RRF検索を実行（全セクション分を一括取得）
    const results = await performAdaptiveRRFSearch(
      vectorStore,
      embeddings,
      queries,
      dynamicK,
      stakeholder
    );
    
    if (results.length === 0) {
      return { content: '', count: 0 };
    }
    
    const content = results.map((doc, i) => 
      `[関連文書 ${i + 1}]\n${doc.pageContent}`
    ).join('\n\n');
    
    return { content, count: results.length };
    
  } catch (error) {
    console.error('RAG search failed:', error);
    return { content: '', count: 0 };
  }
}

/**
 * メインのPOSTハンドラ
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: PrepareContextRequest = await request.json();
    
    const {
      files,
      stakeholder,
      reportStructure,
      userIdentifier,
      language = 'ja',
    } = body;

    // バリデーション
    if (!stakeholder || !reportStructure) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required parameters',
          context: { fullTextContent: '', ragContent: '', gsnContent: '', combinedContext: '' },
          metadata: { fullTextFileCount: 0, ragResultCount: 0, gsnFileCount: 0, totalCharacters: 0, hasContent: false },
          duration: Date.now() - startTime,
        },
        { status: 400 }
      );
    }

    console.log(`Preparing context for stakeholder: ${stakeholder.role}`);
    console.log(`Files count: ${files?.length || 0}`);

    // 並列でコンテンツを取得
    const [fullTextResult, gsnResult, ragResult] = await Promise.all([
      getFullTextContent(files || []),
      getGSNContent(files || []),
      getRAGContent(stakeholder, reportStructure, files || [], userIdentifier),
    ]);

    // コンテキストを結合
    let combinedContext = '';
    
    if (fullTextResult.content) {
      combinedContext += `\n【アップロードされた文書（全文）】\n${fullTextResult.content}`;
    }
    
    if (gsnResult.content) {
      combinedContext += `\n【GSN（Goal Structuring Notation）ファイル】\n${gsnResult.content}`;
    }
    
    if (ragResult.content) {
      combinedContext += `\n【関連する情報（RAG検索結果）】\n${ragResult.content}`;
    }

    // 総文字数を制限
    if (combinedContext.length > MAX_TOTAL_CONTEXT_CHARS) {
      combinedContext = combinedContext.substring(0, MAX_TOTAL_CONTEXT_CHARS);
      console.log(`Context truncated to ${MAX_TOTAL_CONTEXT_CHARS} characters`);
    }

    const totalCharacters = combinedContext.length;
    const hasContent = totalCharacters > 100; // 最低100文字以上

    const duration = Date.now() - startTime;
    console.log(`Context prepared in ${duration}ms`);
    console.log(`Full text files: ${fullTextResult.count}, RAG results: ${ragResult.count}, GSN files: ${gsnResult.count}`);
    console.log(`Total characters: ${totalCharacters}, Has content: ${hasContent}`);

    // 文書がない場合はエラーを返す
    if (!hasContent) {
      const errorMessage = language === 'en'
        ? 'No document content available. Please upload files or enable "Use Full Text" for existing files.'
        : '文書コンテンツがありません。ファイルをアップロードするか、既存ファイルの「全文使用」を有効にしてください。';
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        context: {
          fullTextContent: fullTextResult.content,
          ragContent: ragResult.content,
          gsnContent: gsnResult.content,
          combinedContext: '',
        },
        metadata: {
          fullTextFileCount: fullTextResult.count,
          ragResultCount: ragResult.count,
          gsnFileCount: gsnResult.count,
          totalCharacters: 0,
          hasContent: false,
        },
        duration,
      });
    }

    const response: PrepareContextResponse = {
      success: true,
      context: {
        fullTextContent: fullTextResult.content,
        ragContent: ragResult.content,
        gsnContent: gsnResult.content,
        combinedContext,
      },
      metadata: {
        fullTextFileCount: fullTextResult.count,
        ragResultCount: ragResult.count,
        gsnFileCount: gsnResult.count,
        totalCharacters,
        hasContent,
      },
      duration,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Context preparation error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        context: { fullTextContent: '', ragContent: '', gsnContent: '', combinedContext: '' },
        metadata: { fullTextFileCount: 0, ragResultCount: 0, gsnFileCount: 0, totalCharacters: 0, hasContent: false },
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// タイムアウト設定（コンテキスト準備は長めに）
export const maxDuration = 25;
