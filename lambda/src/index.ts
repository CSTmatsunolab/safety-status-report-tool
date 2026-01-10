// src/index.ts
// Lambda Function URL handler - ストリーミング版（RRF実装統合）

import { 
  APIGatewayProxyEventV2,
  Context 
} from 'aws-lambda';
import type { Writable } from 'stream';
import Anthropic from '@anthropic-ai/sdk';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

const pdfParse = require('pdf-parse-new');

import { 
  GenerateReportRequest, 
  Stakeholder,
  ReportStructureTemplate,
} from './types';
import { buildCompleteUserPrompt } from './lib/report-prompts';
import { buildCompleteUserPromptEN } from './lib/report-prompts-en';
import { 
  determineAdvancedRhetoricStrategy, 
  getRhetoricStrategyDisplayName,
} from './lib/rhetoric-strategies';

// RAGモジュールのインポート
import { 
  performAdaptiveRRFSearch,
  generateNamespace,
  debugQueryEnhancement
} from './lib/rag';

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
const DEBUG_LOGGING = process.env.DEBUG_LOGGING;

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

/**
 * GSNファイルがある場合にセクションを動的に追加
 */
function buildFinalReportStructure(
  baseStructure: ReportStructureTemplate,
  hasGSN: boolean
): string[] {
  if (!hasGSN) {
    return baseStructure.sections;
  }

  // GSNファイルがある場合、適切な位置にGSNセクションを挿入
  const finalSections = [...baseStructure.sections];
  const gsnSections = baseStructure.gsnSections || [];

  // GSNセクションがない場合はそのまま返す
  if (gsnSections.length === 0) {
    return finalSections;
  }

  // エグゼクティブサマリーの後にGSN概要を挿入
  if (gsnSections.length > 0) {
    finalSections.splice(1, 0, gsnSections[0]);
  }

  // 技術系レポートの場合は詳細分析を中間に挿入
  if (baseStructure.id === 'technical-detailed' && gsnSections.length > 1) {
    finalSections.splice(4, 0, ...gsnSections.slice(1));
  } else if (gsnSections.length > 1) {
    // その他のレポートは分析結果の後に挿入
    finalSections.splice(3, 0, ...gsnSections.slice(1));
  }

  return finalSections;
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
    
    if (DEBUG_LOGGING) {
        console.log('Starting streaming report generation:', {
          stakeholder: stakeholder.id,
          sections: reportStructure.sections.length,
          gsnSections: reportStructure.gsnSections?.length || 0,
          files: files.length,
          language
        });
    }

    // ステップ1: 開始
    sendMessage({
      type: 'progress',
      status: 'starting',
      message: language === 'ja' ? '処理を開始しています...' : 'Starting process...',
      percent: 0
    });

    // ステップ2: RRF検索
    sendMessage({
      type: 'progress',
      status: 'searching',
      message: language === 'ja' ? 'ナレッジベースを検索中...' : 'Searching knowledge base...',
      percent: 10
    });

    const namespace = generateNamespace(stakeholder.id, userIdentifier);
    const indexName = process.env.PINECONE_INDEX_NAME || 'safety-status-report-tool';
    
    // デバッグモードの場合、クエリ拡張をログ出力
    if (DEBUG_LOGGING) {
      debugQueryEnhancement(stakeholder, {
        maxQueries: 5,
        includeEnglish: true,
        includeSynonyms: true,
        includeRoleTerms: true
      });
    }

    // RRF検索を実行
    const ragResult = await performAdaptiveRRFSearch(
      openai,
      pinecone,
      stakeholder,
      namespace,
      indexName,
      {
        enableHybridSearch: process.env.ENABLE_HYBRID_SEARCH === 'true',
        debug: DEBUG_LOGGING === 'true'
      }
    );

    const ragContent = ragResult.content;

    // 検索結果のログ
    if (DEBUG_LOGGING) {
      console.log('RRF Search completed:', {
        documentsFound: ragResult.documents.length,
        dynamicK: ragResult.metadata.dynamicK,
        queriesUsed: ragResult.metadata.queriesUsed.length,
        totalChunks: ragResult.metadata.totalChunks,
        searchDuration: ragResult.metadata.searchDuration,
        hybridEnabled: ragResult.metadata.hybridSearchEnabled
      });
    }
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
        content = await getS3FileContent(file.s3Key, file.name);
      }
      if (content) {
        const truncatedContent = content.length > MAX_CONTENT_CHARS_PER_FILE 
          ? content.substring(0, MAX_CONTENT_CHARS_PER_FILE) + '\n\n[内容が大きすぎるため省略されました]'
          : content;
        contextParts.push(`=== ファイル: ${file.name} (全文) ===\n\n${truncatedContent}`);
        if (file.isGSN) hasGSNFile = true;
      }
    }

    // ファイル配列からもGSNチェック
    if (!hasGSNFile) {
      hasGSNFile = files.some(f => f.isGSN);
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
    
    // GSNファイルがある場合、動的にセクションを追加
    const finalSections = buildFinalReportStructure(reportStructure, hasGSNFile);
    if (DEBUG_LOGGING) {
      console.log('Final sections:', finalSections);
      console.log('Has GSN:', hasGSNFile);
    }
    const promptBuilder = language === 'en' ? buildCompleteUserPromptEN : buildCompleteUserPrompt;
    const promptContent = promptBuilder({
      stakeholder,
      strategy,
      contextContent,
      reportSections: finalSections,
      hasGSN: hasGSNFile,
      structureDescription: reportStructure.description
    });

    // ステップ5: Claude APIストリーミング呼び出し
    sendMessage({
      type: 'progress',
      status: 'generating',
      message: language === 'ja' ? 'AIでレポートを生成中...' : 'Generating report with AI...',
      percent: 60
    });

    console.log('Calling Claude API with streaming...');
    console.log('Context length:', contextContent.length, 'chars');

    // Claude APIをストリーミングで呼び出し
    let fullReportContent = '';
    
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
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
 * XLSX/DOCX/テキストファイルを適切に処理
 */
async function getS3FileContent(key: string, fileName: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyContents = await response.Body?.transformToByteArray();
    
    if (!bodyContents) {
      throw new Error('Failed to get file content from S3');
    }

    const buffer = Buffer.from(bodyContents);
    const lowerFileName = fileName.toLowerCase();

    // Excel ファイル (.xlsx, .xls) の処理
    if (lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls')) {
      console.log(`Processing Excel file: ${fileName}`);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let content = '';
      
      workbook.SheetNames.forEach((sheetName, index) => {
        const sheet = workbook.Sheets[sheetName];
        content += `\n=== Sheet ${index + 1}: ${sheetName} ===\n`;
        content += XLSX.utils.sheet_to_txt(sheet);
        content += '\n';
      });
      
      console.log(`Excel file processed: ${workbook.SheetNames.length} sheets, ${content.length} chars`);
      return content;
    }

    // Word ファイル (.docx) の処理
    if (lowerFileName.endsWith('.docx')) {
      console.log(`Processing Word file: ${fileName}`);
      const result = await mammoth.extractRawText({ buffer });
      console.log(`Word file processed: ${result.value.length} chars`);
      return result.value;
    }

    // PDF ファイル (.pdf) の処理
    if (lowerFileName.endsWith('.pdf')) {
      console.log(`Processing PDF file: ${fileName}`);
      const pdfData = await pdfParse(buffer);
      console.log(`PDF file processed: ${pdfData.numpages} pages, ${pdfData.text.length} chars`);
      
      let content = `=== PDF Document: ${fileName} ===\n`;
      content += `(Total pages: ${pdfData.numpages})\n\n`;
      content += pdfData.text;
      return content;
    }

    // その他のファイル（テキストとして処理）
    return new TextDecoder().decode(buffer);
    
  } catch (error) {
    console.error(`Error fetching/processing from S3: ${key}`, error);
    throw error;
  }
}