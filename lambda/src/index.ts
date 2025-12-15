// src/index.ts
// Lambda Function URL handler - 一括生成版（1回のClaude API呼び出し）

import { 
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context 
} from 'aws-lambda';
import Anthropic from '@anthropic-ai/sdk';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { 
  GenerateReportRequest, 
  Stakeholder,
  ReportStructureTemplate
} from './types';
import { buildCompleteUserPrompt } from './lib/report-prompts';
import { buildCompleteUserPromptEN } from './lib/report-prompts-en';
import { 
  determineAdvancedRhetoricStrategy, 
  getRhetoricStrategyDisplayName,
  RhetoricStrategy
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

// Lambdaハンドラー
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const startTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
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
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required parameters: stakeholder or reportStructure'
        }),
      };
    }

    console.log('Starting report generation:', {
      stakeholder: stakeholder.id,
      sections: reportStructure.sections.length,
      files: files.length,
      language
    });

    // コンテキスト準備（RAG + 全文ファイル）
    const contextResult = await prepareContext(
      stakeholder,
      files,
      fullTextFileIds,
      userIdentifier,
      language
    );

    if (!contextResult.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: contextResult.error,
          details: contextResult.details
        }),
      };
    }

    const contextContent = contextResult.combinedContext!;
    const hasGSNFile = contextResult.hasGSNFile ?? false;

    // レトリック戦略の決定
    const strategy = determineAdvancedRhetoricStrategy(stakeholder);

    // プロンプト構築（言語に応じて切り替え）
    const promptBuilder = language === 'en' ? buildCompleteUserPromptEN : buildCompleteUserPrompt;
    const promptContent = promptBuilder({
      stakeholder,
      strategy,
      contextContent,
      reportSections: reportStructure.sections,
      hasGSN: hasGSNFile,
      structureDescription: reportStructure.description
    });

    console.log('Prompt built, calling Claude API...');
    console.log('Context length:', contextContent.length, 'chars');

    // Claude API呼び出し（1回のみ）
    const message = await anthropic.messages.create({
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

    const reportContent = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    const title = language === 'ja'
      ? `${stakeholder.role}向け Safety Status Report`
      : `Safety Status Report for ${stakeholder.role}`;

    const totalDuration = Date.now() - startTime;

    console.log(`Report generation completed in ${totalDuration}ms`);

    // 成功レスポンス
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        report: {
          title,
          content: reportContent,
          stakeholder,
          rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder, language),
          createdAt: new Date().toISOString(),
        },
        totalDuration,
      }),
    };

  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Report generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};

/**
 * コンテキスト準備（RAG検索 + 全文ファイル取得）
 */
async function prepareContext(
  stakeholder: Stakeholder,
  files: GenerateReportRequest['files'],
  fullTextFileIds: string[],
  userIdentifier: string,
  language: 'ja' | 'en'
): Promise<{
  success: boolean;
  combinedContext?: string;
  hasGSNFile?: boolean;
  error?: string;
  details?: string;
}> {
  try {
    const contextParts: string[] = [];
    let hasGSNFile = false;

    // 1. 全文使用ファイルの処理
    const fullTextFiles = files.filter(f => 
      fullTextFileIds.includes(f.name) || f.useFullText
    );

    for (const file of fullTextFiles) {
      let content = file.content;

      // S3からファイル取得が必要な場合
      if (file.s3Key && (!content || content.length < 100)) {
        console.log(`Fetching file from S3: ${file.s3Key}`);
        content = await getS3FileContent(file.s3Key);
      }

      if (content) {
        // 文字数制限
        const truncatedContent = content.length > MAX_CONTENT_CHARS_PER_FILE 
          ? content.substring(0, MAX_CONTENT_CHARS_PER_FILE) + '\n\n[内容が大きすぎるため省略されました]'
          : content;
        
        contextParts.push(`=== ファイル: ${file.name} (全文) ===\n\n${truncatedContent}`);

        if (file.isGSN) {
          hasGSNFile = true;
        }
      }
    }

    // 2. RAG検索（Pinecone）
    const namespace = generateNamespace(stakeholder.id, userIdentifier);
    const ragContent = await performRAGSearch(stakeholder, namespace);
    
    if (ragContent) {
      contextParts.push(`=== RAG抽出内容 ===\n\n${ragContent}`);
    }

    // コンテキストが空かチェック
    if (contextParts.length === 0) {
      return {
        success: false,
        error: language === 'ja' 
          ? '文書コンテンツがありません。ファイルをアップロードするか、知識ベースを構築してください。'
          : 'No document content available. Please upload files or build knowledge base.'
      };
    }

    let combinedContext = contextParts.join('\n\n---\n\n');

    // 全体の文字数制限
    if (combinedContext.length > MAX_TOTAL_CONTEXT_CHARS) {
      combinedContext = combinedContext.substring(0, MAX_TOTAL_CONTEXT_CHARS) + 
        '\n\n...(文字数制限により省略)';
    }

    return {
      success: true,
      combinedContext,
      hasGSNFile
    };

  } catch (error) {
    console.error('Context preparation error:', error);
    return {
      success: false,
      error: 'Context preparation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

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

    // インデックスの統計情報を取得
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    
    if (!namespaceStats || namespaceStats.recordCount === 0) {
      console.log(`No vectors found in namespace: ${namespace}`);
      return null;
    }

    const totalChunks = namespaceStats.recordCount;
    
    // 動的K値の計算
    const baseK = Math.ceil(totalChunks * 0.3);
    const roleMultiplier = stakeholder.id === 'technical-fellows' ? 1.2 : 1.0;
    const dynamicK = Math.min(Math.ceil(baseK * roleMultiplier), 50);

    console.log(`Dynamic K calculation: totalChunks=${totalChunks}, baseK=${baseK}, multiplier=${roleMultiplier}, finalK=${dynamicK}`);

    // クエリ拡張
    const queries = enhanceQueries(stakeholder);
    console.log(`Enhanced queries (${queries.length}):`, queries);

    // 各クエリで検索してマージ
    const allResults: Map<string, { content: string; score: number }> = new Map();

    for (const query of queries) {
      // クエリをembeddingに変換
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      const queryVector = embeddingResponse.data[0].embedding;

      // Pinecone検索
      const searchResults = await index.namespace(namespace).query({
        vector: queryVector,
        topK: dynamicK,
        includeMetadata: true,
      });

      // 結果をマージ
      for (const match of searchResults.matches || []) {
        const content = match.metadata?.pageContent as string || '';
        const existingScore = allResults.get(match.id)?.score || 0;
        
        if (match.score && match.score > existingScore) {
          allResults.set(match.id, { content, score: match.score });
        }
      }
    }

    // スコア順にソートして上位K件を取得
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
