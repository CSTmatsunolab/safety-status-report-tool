// src/index.ts
// Lambda Function URL handler - ストリーミング版（Claude APIストリーミング対応）

import { 
  APIGatewayProxyEventV2,
  Context 
} from 'aws-lambda';
import type { Writable } from 'stream';
import Anthropic from '@anthropic-ai/sdk';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { 
  GenerateReportRequest, 
  Stakeholder,
} from './types';
import { buildCompleteUserPrompt } from './lib/report-prompts';
import { buildCompleteUserPromptEN } from './lib/report-prompts-en';
import { 
  determineAdvancedRhetoricStrategy, 
  getRhetoricStrategyDisplayName,
} from './lib/rhetoric-strategies';

// クライアント初期化
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

// 定数
const MAX_CONTENT_CHARS_PER_FILE = 50000;
const MAX_TOTAL_CONTEXT_CHARS = 100000;

// 進捗メッセージの型
interface StreamMessage {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  status?: string;
  message?: string;
  percent?: number;
  // チャンク用
  text?: string;
  // 完了用
  report?: {
    title: string;
    content: string;
    stakeholder: Stakeholder;
    rhetoricStrategy: string;
    createdAt: string;
  };
  error?: string;
  details?: string;
  totalDuration?: number;
}

// ストリーミングハンドラーの実装
async function streamHandler(
  event: APIGatewayProxyEventV2,
  responseStream: Writable,
  _context: Context
): Promise<void> {
  const startTime = Date.now();

  // HTTPレスポンスストリームを設定
  const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });

  // メッセージ送信ヘルパー
  const sendMessage = (data: StreamMessage): void => {
    httpResponseStream.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // リクエストボディのパース
    const body: GenerateReportRequest = JSON.parse(event.body || '{}');
    const { 
      stakeholder, 
      reportStructure, 
      files = [], 
      fullTextFileIds = [],
      language = 'ja',
      userIdentifier = 'anonymous'
    } = body;

    // バリデーション
    if (!stakeholder || !reportStructure) {
      sendMessage({
        type: 'error',
        error: 'Missing required parameters: stakeholder or reportStructure'
      });
      httpResponseStream.end();
      return;
    }

    console.log('Starting streaming report generation:', {
      stakeholder: stakeholder.id,
      sections: reportStructure.sections.length,
      files: files.length,
      language
    });

    // ステップ1: 開始
    sendMessage({
      type: 'progress',
      status: 'starting',
      message: language === 'ja' ? '処理を開始しています...' : 'Starting process...',
      percent: 0
    });

    // ステップ2: RAG検索
    sendMessage({
      type: 'progress',
      status: 'searching',
      message: language === 'ja' ? '知識ベースを検索中...' : 'Searching knowledge base...',
      percent: 10
    });

    const namespace = generateNamespace(stakeholder.id, userIdentifier);
    const ragContent = await performRAGSearch(stakeholder, namespace);

    // ステップ3: コンテキスト準備
    sendMessage({
      type: 'progress',
      status: 'preparing',
      message: language === 'ja' ? 'コンテキストを準備中...' : 'Preparing context...',
      percent: 30
    });

    const contextParts: string[] = [];
    let hasGSNFile = false;

    // 全文ファイル処理
    const fullTextFiles = files.filter(f => 
      fullTextFileIds.includes(f.name) || f.useFullText
    );

    for (const file of fullTextFiles) {
      let content = file.content;
      if (file.s3Key && (!content || content.length < 100)) {
        content = await getS3FileContent(file.s3Key);
      }
      if (content) {
        const truncatedContent = content.length > MAX_CONTENT_CHARS_PER_FILE 
          ? content.substring(0, MAX_CONTENT_CHARS_PER_FILE) + '\n\n[内容が大きすぎるため省略されました]'
          : content;
        contextParts.push(`=== ファイル: ${file.name} (全文) ===\n\n${truncatedContent}`);
        if (file.isGSN) hasGSNFile = true;
      }
    }

    if (ragContent) {
      contextParts.push(`=== RAG抽出内容 ===\n\n${ragContent}`);
    }

    if (contextParts.length === 0) {
      sendMessage({
        type: 'error',
        error: language === 'ja' 
          ? '文書コンテンツがありません。ファイルをアップロードするか、知識ベースを構築してください。'
          : 'No document content available.'
      });
      httpResponseStream.end();
      return;
    }

    let contextContent = contextParts.join('\n\n---\n\n');
    if (contextContent.length > MAX_TOTAL_CONTEXT_CHARS) {
      contextContent = contextContent.substring(0, MAX_TOTAL_CONTEXT_CHARS) + '\n\n...(文字数制限により省略)';
    }

    // ステップ4: プロンプト構築
    sendMessage({
      type: 'progress',
      status: 'building',
      message: language === 'ja' ? 'プロンプトを構築中...' : 'Building prompt...',
      percent: 50
    });

    const strategy = determineAdvancedRhetoricStrategy(stakeholder);
    const promptBuilder = language === 'en' ? buildCompleteUserPromptEN : buildCompleteUserPrompt;
    const promptContent = promptBuilder({
      stakeholder,
      strategy,
      contextContent,
      reportSections: reportStructure.sections,
      hasGSN: hasGSNFile,
      structureDescription: reportStructure.description
    });

    // ステップ5: Claude APIストリーミング呼び出し
    sendMessage({
      type: 'progress',
      status: 'generating',
      message: language === 'ja' ? 'Claude AIでレポートを生成中...' : 'Generating report with Claude AI...',
      percent: 60
    });

    console.log('Calling Claude API with streaming...');
    console.log('Context length:', contextContent.length, 'chars');

    // Claude APIをストリーミングで呼び出し
    let fullReportContent = '';
    
    const stream = anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: promptContent
        }
      ]
    });

    // ストリーミングでテキストチャンクを受信・送信
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullReportContent += text;
        
        // チャンクをクライアントに送信
        sendMessage({
          type: 'chunk',
          text: text
        });
      }
    }

    // ステップ6: 完了
    sendMessage({
      type: 'progress',
      status: 'finalizing',
      message: language === 'ja' ? 'レポートを仕上げ中...' : 'Finalizing report...',
      percent: 90
    });

    const title = language === 'ja'
      ? `${stakeholder.role}向け Safety Status Report`
      : `Safety Status Report for ${stakeholder.role}`;

    const totalDuration = Date.now() - startTime;

    console.log(`Report generation completed in ${totalDuration}ms`);

    // 最終結果を送信
    sendMessage({
      type: 'complete',
      status: 'complete',
      message: language === 'ja' ? '生成完了！' : 'Generation complete!',
      percent: 100,
      report: {
        title,
        content: fullReportContent,
        stakeholder,
        rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder, language),
        createdAt: new Date().toISOString(),
      },
      totalDuration,
    });

  } catch (error) {
    console.error('Lambda handler error:', error);
    sendMessage({
      type: 'error',
      error: 'Report generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    httpResponseStream.end();
  }
}

// ストリーミングLambdaハンドラーをエクスポート
export const handler = awslambda.streamifyResponse(streamHandler);

/**
 * S3からファイルコンテンツを取得
 */
async function getS3FileContent(key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const buffer = await response.Body?.transformToByteArray();
    
    if (!buffer) {
      throw new Error('Failed to get file content from S3');
    }

    return new TextDecoder().decode(buffer);
  } catch (error) {
    console.error(`Error fetching from S3: ${key}`, error);
    throw error;
  }
}

/**
 * Pinecone RAG検索
 */
async function performRAGSearch(
  stakeholder: Stakeholder,
  namespace: string
): Promise<string | null> {
  try {
    const indexName = process.env.PINECONE_INDEX_NAME || 'safety-status-report-tool';
    const index = pinecone.index(indexName);

    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    
    if (!namespaceStats || namespaceStats.recordCount === 0) {
      console.log(`No vectors found in namespace: ${namespace}`);
      return null;
    }

    const totalChunks = namespaceStats.recordCount;
    const baseK = Math.ceil(totalChunks * 0.3);
    const roleMultiplier = stakeholder.id === 'technical-fellows' ? 1.2 : 1.0;
    const dynamicK = Math.min(Math.ceil(baseK * roleMultiplier), 50);

    console.log(`Dynamic K: ${dynamicK}`);

    const queries = enhanceQueries(stakeholder);
    console.log(`Enhanced queries (${queries.length}):`, queries);

    const allResults: Map<string, { content: string; score: number }> = new Map();

    for (const query of queries) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      const queryVector = embeddingResponse.data[0].embedding;

      const searchResults = await index.namespace(namespace).query({
        vector: queryVector,
        topK: dynamicK,
        includeMetadata: true,
      });

      for (const match of searchResults.matches || []) {
        const content = match.metadata?.pageContent as string || '';
        const existingScore = allResults.get(match.id)?.score || 0;
        
        if (match.score && match.score > existingScore) {
          allResults.set(match.id, { content, score: match.score });
        }
      }
    }

    const sortedResults = Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, dynamicK);

    console.log(`Pinecone search completed: ${sortedResults.length} results`);

    if (sortedResults.length === 0) {
      return null;
    }

    return sortedResults.map(r => r.content).join('\n\n---\n\n');

  } catch (error) {
    console.error('Pinecone search error:', error);
    return null;
  }
}

/**
 * クエリ拡張
 */
function enhanceQueries(stakeholder: Stakeholder): string[] {
  const baseQuery = `${stakeholder.role} ${stakeholder.concerns.slice(0, 3).join(' ')}`;
  
  const queries = [
    baseQuery,
    ...stakeholder.concerns.slice(0, 2),
    'GSN Goal Strategy Evidence',
    '安全性 リスク 対策'
  ];

  return queries.slice(0, 5);
}

/**
 * namespace生成
 */
function generateNamespace(stakeholderId: string, userIdentifier: string): string {
  return `${stakeholderId}_${userIdentifier}`;
}