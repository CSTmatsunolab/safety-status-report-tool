// src/app/api/generate-report/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Document } from '@langchain/core/documents'; 
import { VectorStore } from "@langchain/core/vectorstores";
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
import { createEmbeddings } from '@/lib/embeddings';
import { getRecommendedStructure, buildFinalReportStructure } from '@/lib/report-structures';
import { determineAdvancedRhetoricStrategy, getRhetoricStrategyDisplayName } from '@/lib/rhetoric-strategies';
import { getDynamicK, saveRAGLog, type RAGLogData, type RRFStatistics } from '@/lib/rag-utils';
import { buildCompleteUserPrompt } from '@/lib/report-prompts';
import { CustomStakeholderQueryEnhancer, debugQueryEnhancement } from '@/lib/query-enhancer';
import { processGSNText } from '@/lib/text-processing';
import { generateNamespace } from '@/lib/browser-id';
import { performAdaptiveRRFSearch, debugRRFResults, getRRFStatistics } from '@/lib/rrf-fusion';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'safety-report-uploads-2024';

// 保護機能の制限値
const MAX_LARGE_FULL_TEXT_FILES = 2;  // 大きなファイル（S3保存）かつ全文使用の最大数
const MAX_CONTENT_CHARS_PER_FILE = 80000;  // 1ファイルあたりの最大文字数
const MAX_TOTAL_CONTEXT_CHARS = 150000;  // 全体の最大文字数

function isVectorStore(obj: unknown): obj is VectorStore {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as VectorStore).similaritySearch === 'function' &&
    typeof (obj as VectorStore)._vectorstoreType === 'string'
  );
}

const globalStores: Map<string, unknown> = 
  (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
(global as { vectorStores?: Map<string, unknown> }).vectorStores = globalStores;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// S3からファイルコンテンツを取得
async function getContentFromS3(
  key: string, 
  fileType: string, 
  fileName: string
): Promise<{ content: string; truncated: boolean; originalLength: number }> {
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

    let text = '';

    // ファイルタイプに応じて処理
    if (fileType.includes('excel') || fileType.includes('spreadsheet') || key.endsWith('.xlsx') || key.endsWith('.xls')) {
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        text += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
      });
      
    } else if (fileType.includes('word') || key.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      text = result.value;
      
    } else {
      text = new TextDecoder().decode(buffer);
    }

    // コンテンツを制限内に収める
    return truncateContent(text, fileType, fileName);
    
  } catch (error) {
    console.error(`Error fetching from S3: ${key}`, error);
    throw error;
  }
}

// コンテンツを賢く切り詰める関数
function truncateContent(
  text: string, 
  fileType: string, 
  fileName: string
): { content: string; truncated: boolean; originalLength: number } {
  if (text.length <= MAX_CONTENT_CHARS_PER_FILE) {
    return { 
      content: text, 
      truncated: false, 
      originalLength: text.length 
    };
  }

  console.log(`Truncating ${fileName}: ${text.length} -> ${MAX_CONTENT_CHARS_PER_FILE} chars`);

  let truncatedContent = '';

  // CSVやExcelの場合は行単位で切り詰め
  if (fileType.includes('csv') || fileType.includes('excel') || fileType.includes('spreadsheet')) {
    const lines = text.split('\n');
    let currentLength = 0;
    
    for (const line of lines) {
      if (currentLength + line.length + 1 > MAX_CONTENT_CHARS_PER_FILE) {
        truncatedContent += '\n[残りのデータ行は省略されました]';
        break;
      }
      truncatedContent += (currentLength > 0 ? '\n' : '') + line;
      currentLength += line.length + 1;
    }
  } 
  // テキストファイルは段落単位で切り詰め
  else if (fileType.includes('text') || fileType.includes('plain')) {
    const paragraphs = text.split('\n\n');
    let currentLength = 0;
    
    for (const paragraph of paragraphs) {
      if (currentLength + paragraph.length + 2 > MAX_CONTENT_CHARS_PER_FILE) {
        truncatedContent += '\n\n[文書の続きは省略されました]';
        break;
      }
      truncatedContent += (currentLength > 0 ? '\n\n' : '') + paragraph;
      currentLength += paragraph.length + 2;
    }
  }
  // その他のファイルは文字単位で切り詰め
  else {
    truncatedContent = text.substring(0, MAX_CONTENT_CHARS_PER_FILE) + '\n\n[内容が大きすぎるため省略されました]';
  }

  return {
    content: truncatedContent,
    truncated: true,
    originalLength: text.length
  };
}

// 適応的なRAG検索関数
async function performRAGSearch(
  stakeholder: Stakeholder,
  vectorStoreType: string,
  fullTextFiles: UploadedFile[],
  browserId?: string
): Promise<{ contextContent: string; relevantDocs: Document[] }> {
  let contextContent = '';
  let relevantDocs: Document[] = [];

  const embeddings = createEmbeddings();
  if (vectorStoreType === 'pinecone') {
    try {
      const vectorStore = await VectorStoreFactory.getExistingStore(
        embeddings,
        stakeholder.id,
        browserId
      );
      
      if (vectorStore) {
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore,
          stakeholder.id,
          browserId
        );
        
        console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          const dynamicK = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const realisticK = Math.min(dynamicK, Math.floor(stats.totalDocuments * 0.8));
          
          console.log(`📊 Dynamic K: ${dynamicK}, Realistic K: ${realisticK}`);
          
          let rrfStats: RRFStatistics | undefined = undefined;
          const queryEnhancer = new CustomStakeholderQueryEnhancer();
          const enhancedQueries = queryEnhancer.enhanceQuery(stakeholder, {
            maxQueries: 5,
            includeEnglish: true,
            includeSynonyms: true,
            includeRoleTerms: true
          });
          
          if (process.env.DEBUG_LOGGING === 'true') {
            debugQueryEnhancement(stakeholder, {
              maxQueries: 5,
              includeEnglish: true,
              includeSynonyms: true,
              includeRoleTerms: true
            });
          }

          console.log('Enhanced queries:', enhancedQueries);
          console.log('Using Adaptive RRF Search');
          
          relevantDocs = await performAdaptiveRRFSearch(
            vectorStore,
            embeddings,
            enhancedQueries,
            realisticK,
            stakeholder
          );
            
          const enableRRFDebug = process.env.DEBUG_LOGGING === 'true';

          if (enableRRFDebug && relevantDocs.length > 0) {
            console.log('RRF Debugging Enabled...');
            debugRRFResults(relevantDocs); 
            rrfStats = getRRFStatistics(relevantDocs);
          }
          
          const achievementRate = (relevantDocs.length / dynamicK) * 100;
          console.log(`K値達成率: ${achievementRate.toFixed(1)}% (${relevantDocs.length}/${dynamicK})`);
          
          if (relevantDocs.length > 0) {
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: Document) => doc.pageContent)
                .join('\n\n---\n\n');

            if (process.env.DEBUG_LOGGING === 'true') {
              const logData: RAGLogData = {
                stakeholder,
                searchQuery: enhancedQueries.join(' | '),
                enhancedQueries,
                k: dynamicK,
                totalChunks: stats.totalDocuments,
                vectorStoreType: stats.storeType,
                relevantDocs,
                contextLength: contextContent.length,
                fullTextFiles,
                timestamp: new Date(),
                rrfStatistics: rrfStats
              };
              saveRAGLog(logData);
            }
          }
        }
      }
    } catch (error) {
      console.error('Vector store error:', error);
    }
  } else {
    // メモリストアの場合
    const namespace = generateNamespace(stakeholder.id, browserId);
    const storeKey = `ssr_${namespace}`; 
    const vectorStoreCandidate = globalStores.get(storeKey);
    
    if (isVectorStore(vectorStoreCandidate)) {
      const vectorStore = vectorStoreCandidate;
      console.log('Found memory store, searching...');
      
      try {
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore,
          stakeholder.id,
          browserId
        );
        console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          const targetK = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const realisticK = Math.min(targetK, Math.floor(stats.totalDocuments * 0.8));
          
          const queryEnhancer = new CustomStakeholderQueryEnhancer();
          const enhancedQueries = queryEnhancer.enhanceQuery(stakeholder);

          if (process.env.DEBUG_LOGGING === 'true') {
            debugQueryEnhancement(stakeholder);
          }

          console.log('Enhanced queries for memory store:', enhancedQueries);

          console.log('Using Adaptive RRF Search (Memory)');
          relevantDocs = await performAdaptiveRRFSearch(
              vectorStore,
              embeddings,
              enhancedQueries,
              realisticK,
              stakeholder
          );
          if (relevantDocs.length > 0) {
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: Document) => doc.pageContent)
                .join('\n\n---\n\n');

            if (process.env.DEBUG_LOGGING === 'true') {
              const rrfStats = getRRFStatistics(relevantDocs);
              const logData: RAGLogData = {
                stakeholder,
                searchQuery: enhancedQueries.join(' | '),
                enhancedQueries: enhancedQueries,
                k: targetK,
                totalChunks: stats.totalDocuments,
                vectorStoreType: stats.storeType,
                relevantDocs,
                contextLength: contextContent.length,
                fullTextFiles,
                timestamp: new Date(),
                rrfStatistics: rrfStats
              };
              saveRAGLog(logData);
            }
          }
        }
      } catch (error) {
        console.error('Error during vector search:', error);
      }
    }
  }

  return { contextContent, relevantDocs };
}

// 全文使用ファイルをコンテキストに追加
async function addFullTextToContext(
  contextContent: string,
  fullTextFiles: UploadedFile[]
): Promise<{ content: string; warnings: string[] }> {
  const warnings: string[] = [];
  
  if (fullTextFiles.length === 0) {
    return { content: contextContent, warnings };
  }

  console.log(`Adding ${fullTextFiles.length} full-text files to context`);
  
  // 大きなファイル（S3保存）の数をカウントして制限
  const largeFiles = fullTextFiles.filter(f => f.metadata?.s3Key);
  const smallFiles = fullTextFiles.filter(f => !f.metadata?.s3Key);
  
  let processedLargeFiles = largeFiles;
  if (largeFiles.length > MAX_LARGE_FULL_TEXT_FILES) {
    warnings.push(
      `大きなファイルの全文使用は${MAX_LARGE_FULL_TEXT_FILES}個までに制限されています。` +
      `${largeFiles.length}個中、最初の${MAX_LARGE_FULL_TEXT_FILES}個のみ処理します。`
    );
    console.warn(warnings[warnings.length - 1]);
    processedLargeFiles = largeFiles.slice(0, MAX_LARGE_FULL_TEXT_FILES);
  }
  
  const filesToProcess = [...smallFiles, ...processedLargeFiles];
  
  const fullTextContents = await Promise.all(
    filesToProcess.map(async (file) => {
      let content = file.content;
      let truncated = false;

      // S3に保存されている場合はS3から取得
      if (file.metadata?.s3Key && (!content || content.length === 0)) {
        try {
          console.log(`Fetching full content for ${file.name} from S3: ${file.metadata.s3Key}`);
          const result = await getContentFromS3(
            file.metadata.s3Key,
            file.metadata.originalType || file.type,
            file.name
          );
          content = result.content;
          truncated = result.truncated;
          
          if (truncated) {
            warnings.push(
              `${file.name}: ${result.originalLength.toLocaleString()}文字から${MAX_CONTENT_CHARS_PER_FILE.toLocaleString()}文字に切り詰めました`
            );
          }
        } catch (error) {
          console.error(`Failed to fetch S3 content for ${file.name}:`, error);
          content = file.metadata?.contentPreview || '';
          warnings.push(`${file.name}: S3からの取得に失敗しました。プレビュー内容のみ使用します。`);
        }
      } else if (content && content.length > MAX_CONTENT_CHARS_PER_FILE) {
        // メモリ内のコンテンツも制限を適用
        const result = truncateContent(content, file.type, file.name);
        content = result.content;
        if (result.truncated) {
          warnings.push(
            `${file.name}: ${result.originalLength.toLocaleString()}文字から${MAX_CONTENT_CHARS_PER_FILE.toLocaleString()}文字に切り詰めました`
          );
        }
      }

      // GSN処理
      const metadata = file.metadata as { 
        isGSN?: boolean; 
        extractionMethod?: string;
        userDesignatedGSN?: boolean;
      };

      const isGSN = file.type === 'gsn' || metadata?.isGSN || metadata?.userDesignatedGSN;
      const isOCR = metadata?.extractionMethod === 'ocr';

      if (isGSN && isOCR) {
        console.log(`Applying GSN auto-formatting to (OCR): ${file.name}`);
        content = processGSNText(content);
      }
      
      return `=== ファイル: ${file.name} (全文) ===\n\n${content}`;
    })
  );

  const fullTextContent = fullTextContents.join('\n\n---\n\n');
  
  let finalContent: string;
  if (contextContent) {
    finalContent = contextContent + '\n\n\n' + fullTextContent;
  } else {
    finalContent = fullTextContent;
  }
  
  return { content: finalContent, warnings };
}

// コンテキストのサイズを制限
function limitContextSize(
  contextContent: string,
  stakeholder: Stakeholder,
  maxSize?: number
): string {
  const MAX_CONTEXT = maxSize || (stakeholder.role.includes('技術') ? MAX_TOTAL_CONTEXT_CHARS : 100000);
  
  if (contextContent.length > MAX_CONTEXT) {
    return contextContent.substring(0, MAX_CONTEXT) + '\n\n...(文字数制限により省略)';
  }
  
  return contextContent;
}

// Claude APIを使用してレポートを生成
async function generateReportWithClaude(
  promptContent: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: promptContent
      }
    ]
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

// メインのPOSTハンドラ
export async function POST(request: NextRequest) {
  try {
    const { files, stakeholder, reportStructure, browserId }: { 
      files: UploadedFile[]; 
      stakeholder: Stakeholder;
      fullTextFileIds?: string[];
      reportStructure?: ReportStructureTemplate;
      browserId?: string;
    } = await request.json();
    
    if (!stakeholder) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    const safeFiles = files || [];
    console.log('Generating report for:', stakeholder.role);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'pinecone');

    // ファイルの分類
    const fullTextFiles = safeFiles.filter(f => f.includeFullText);
    const ragTargetFiles = safeFiles.filter(f => !f.includeFullText);
    console.log(`Files breakdown: ${fullTextFiles.length} full-text, ${ragTargetFiles.length} RAG target`);

    // 大きなファイル数のログ
    const largeFullTextFiles = fullTextFiles.filter(f => f.metadata?.s3Key);
    if (largeFullTextFiles.length > 0) {
      console.log(`Large files (S3) with full-text: ${largeFullTextFiles.length}`);
    }

    // RAG検索の実行
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    const { contextContent: ragContent } = await performRAGSearch(
      stakeholder,
      vectorStoreType,
      fullTextFiles,
      browserId
    );

    // 全文使用ファイルの追加
    const { content: contextWithFullText, warnings } = await addFullTextToContext(ragContent, fullTextFiles);
    let contextContent = contextWithFullText;

    // 警告があればログ出力
    if (warnings.length > 0) {
      console.warn('Full-text processing warnings:', warnings);
    }

    // フォールバック処理
    if (!contextContent) {
      console.log('No content found, using fallback');
      contextContent = safeFiles.map(f => f.content.substring(0, 10000)).join('\n\n');
    }

    // コンテキストサイズの制限
    contextContent = limitContextSize(contextContent, stakeholder);

    // レトリック戦略の決定
    const strategy = determineAdvancedRhetoricStrategy(stakeholder);

    // レポート構成の決定
    const baseStructure = reportStructure || getRecommendedStructure(
      stakeholder,
      strategy,
      safeFiles
    );
    const reportSections = buildFinalReportStructure(baseStructure, safeFiles);
    const structureDescription = baseStructure.description?.slice(0, 500);
    
    console.log(`Using report structure: ${baseStructure.name}`);
    console.log(`Final sections: ${reportSections.join(', ')}`);

    // GSNファイルの有無を確認
    const hasGSN = safeFiles.some(f => 
      f.type === 'gsn' || (f.metadata as { isGSN?: boolean })?.isGSN
    );

    // プロンプトの構築
    const promptContent = buildCompleteUserPrompt({
      stakeholder,
      strategy,
      contextContent,
      reportSections,
      hasGSN,
      structureDescription
    });

    // Claude APIでレポート生成
    const reportContent = await generateReportWithClaude(promptContent);

    // レポートオブジェクトの作成
    const report: Report = {
      id: Math.random().toString(36).substr(2, 9),
      title: `${stakeholder.role}向け Safety Status Report`,
      stakeholder,
      content: reportContent,
      rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return NextResponse.json(report);
    
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { 
        error: 'Report generation failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}