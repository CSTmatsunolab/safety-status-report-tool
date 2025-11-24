// lib/vision-guided-chunking.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';

let VISION_CHUNKING_PROMPT: string | null = null;

// バッチ処理の設定
const BATCH_SIZE = parseInt(process.env.VISION_BATCH_SIZE || '4'); // デフォルト4ページ
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2秒

interface GenerativeModel {
  generateContent(
    contents: (string | { inlineData: { data: string; mimeType: string } })[]
  ): Promise<{ response: { text(): string } }>;
}

// チャンクのメタデータ型定義
interface ChunkMetadata {
  headingHierarchy: string[];
  continuesFlag: string;
  fallbackParsed?: boolean;
  batchIndex?: number;
  pageRange?: string;
  [key: string]: unknown;
}

// チャンクの型定義
interface VisionChunk {
  content: string;
  heading: string;
  continues: boolean;
  metadata: ChunkMetadata;
}

// バッチ処理の文脈
interface BatchContext {
  lastChunks: VisionChunk[];
  headingHierarchy: string[];
  continuationInfo: string;
  batchIndex: number;
}

function loadPrompt(): string {
  if (VISION_CHUNKING_PROMPT === null) {
    try {
      const promptPath = join(process.cwd(), 'prompts', 'vision-guided-chunking-prompt.txt');
      VISION_CHUNKING_PROMPT = readFileSync(promptPath, 'utf-8');
      console.log('Vision-Guided Chunking prompt loaded successfully');
    } catch (error) {
      console.error('Failed to load prompt file, using fallback:', error);
      VISION_CHUNKING_PROMPT = getFallbackPrompt();
    }
  }
  return VISION_CHUNKING_PROMPT;
}

function getFallbackPrompt(): string {
  return `
Extract text from the provided PDF and segment it into contextual chunks for knowledge retrieval.

CORE REQUIREMENTS:
1. Generate 3-level heading structure: [HEAD]Level1 > Level2 > Level3[/HEAD]
2. Keep ALL numbered steps/instructions together in ONE chunk
3. Keep table rows together with headers
4. Preserve visual layout and structure
5. Add continuation flag: [CONTINUES]True|False|Partial[/CONTINUES]

CONTEXT FROM PREVIOUS BATCH:
{PREVIOUS_CONTEXT}

OUTPUT FORMAT:
[CONTINUES]True|False|Partial[/CONTINUES]
[HEAD]main_heading > section_heading > chunk_heading[/HEAD]
chunk_content
`;
}

/**
 * PDFをページ数でバッチに分割
 */
async function splitPDFIntoPageBatches(
  pdfBuffer: Buffer,
  batchSize: number = BATCH_SIZE
): Promise<Buffer[]> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = pdfDoc.getPageCount();
    const batches: Buffer[] = [];
    
    console.log(`Splitting PDF into batches of ${batchSize} pages (Total: ${totalPages} pages)`);
    
    for (let i = 0; i < totalPages; i += batchSize) {
      const startPage = i;
      const endPage = Math.min(i + batchSize, totalPages);
      
      // 新しいPDFドキュメントを作成
      const batchDoc = await PDFDocument.create();
      
      // 指定範囲のページをコピー
      const pages = await batchDoc.copyPages(
        pdfDoc,
        Array.from({ length: endPage - startPage }, (_, idx) => startPage + idx)
      );
      
      pages.forEach(page => batchDoc.addPage(page));
      
      // バッチをBufferに変換
      const batchBuffer = await batchDoc.save();
      batches.push(Buffer.from(batchBuffer));
      
      console.log(`Created batch ${batches.length}: Pages ${startPage + 1}-${endPage}`);
    }
    
    return batches;
  } catch (error) {
    console.error('Error splitting PDF into batches:', error);
    // フォールバック: 全体を1バッチとして処理
    return [pdfBuffer];
  }
}

/**
 * Vision-Guided Chunking with Batch Processing
 * PDFを4ページごとのバッチでGemini 2.5 Proに送信
 */
export async function processDocumentWithVision(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): Promise<VisionChunk[]> {
  
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }
  
  console.log(`Vision-Guided Chunking: Processing ${fileName} with batch processing`);
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
    }
  });
  
  try {
    // PDFの場合はバッチ処理
    if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      return await processPDFInBatches(fileBuffer, fileName, model);
    } 
    // 画像の場合は単一処理
    else {
      return await processSingleImage(fileBuffer, fileName, fileType, model);
    }
    
  } catch (error) {
    console.error('Vision-Guided Chunking error:', error);
    throw error;
  }
}

/**
 * PDFをバッチで処理（文脈を保持しながら）
 */
async function processPDFInBatches(
  pdfBuffer: Buffer,
  fileName: string,
  model: GenerativeModel
): Promise<VisionChunk[]> {
  
  // PDFをバッチに分割
  const batches = await splitPDFIntoPageBatches(pdfBuffer);
  const allChunks: VisionChunk[] = [];
  
  // バッチ処理の文脈を初期化
  let context: BatchContext = {
    lastChunks: [],
    headingHierarchy: [],
    continuationInfo: '',
    batchIndex: 0
  };
  
  console.log(`Processing ${batches.length} batches for ${fileName}`);
  
  // 各バッチを順番に処理
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const isFirstBatch = i === 0;
    const isLastBatch = i === batches.length - 1;
    
    console.log(`\nProcessing batch ${i + 1}/${batches.length}`);
    
    // リトライ機能付きでバッチを処理
    let batchChunks: VisionChunk[] = [];
    let retryCount = 0;
    
    while (retryCount < MAX_RETRIES) {
      try {
        batchChunks = await processSingleBatch(
          batch,
          fileName,
          context,
          isFirstBatch,
          isLastBatch,
          model
        );
        break; // 成功したらループを抜ける
        
      } catch (error) {
        retryCount++;
        console.error(`Batch ${i + 1} processing failed (attempt ${retryCount}/${MAX_RETRIES}):`, error);
        
        if (retryCount >= MAX_RETRIES) {
          console.error(`Failed to process batch ${i + 1} after ${MAX_RETRIES} attempts`);
          // エラーバッチをスキップして続行
          batchChunks = [];
        } else {
          // リトライ前に待機
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }
    
    // チャンクを追加
    allChunks.push(...batchChunks);
    
    // 次のバッチ用に文脈を更新
    if (batchChunks.length > 0) {
      context = updateBatchContext(context, batchChunks, i);
    }
  }
  
  // バッチ間でマージが必要なチャンクを処理
  return mergeChunksAcrossBatches(allChunks);
}

/**
 * 単一バッチを処理
 */
async function processSingleBatch(
  batchBuffer: Buffer,
  fileName: string,
  context: BatchContext,
  isFirstBatch: boolean,
  isLastBatch: boolean,
  model: GenerativeModel
): Promise<VisionChunk[]> {
  
  const base64Data = batchBuffer.toString('base64');
  
  // プロンプトに前のバッチの文脈を含める
  const prompt = buildBatchPrompt(fileName, context, isFirstBatch, isLastBatch);
  
  // Geminiに送信
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Data,
        mimeType: 'application/pdf'
      }
    }
  ]);
  
  const response = result.response.text();
  console.log(`Batch response received (${response.length} characters)`);
  
  // レスポンスをパース
  const chunks = parseVisionGuidedResponse(response);
  
  // バッチインデックスとページ範囲をメタデータに追加
  chunks.forEach(chunk => {
    chunk.metadata.batchIndex = context.batchIndex;
    chunk.metadata.pageRange = `Batch ${context.batchIndex + 1}`;
  });
  
  return chunks;
}

/**
 * バッチ処理用のプロンプトを構築
 */
function buildBatchPrompt(
  fileName: string,
  context: BatchContext,
  isFirstBatch: boolean,
  isLastBatch: boolean
): string {
  let basePrompt = loadPrompt();
  
  // 前のバッチの文脈を挿入
  let contextInfo = '';
  if (!isFirstBatch && context.lastChunks.length > 0) {
    const lastChunk = context.lastChunks[context.lastChunks.length - 1];
    contextInfo = `
=== CONTEXT FROM PREVIOUS BATCH ===
Last Heading: ${lastChunk.heading}
Last Content (truncated): ${lastChunk.content.substring(-500)}
Continuation Flag: ${lastChunk.continues ? 'Content continues from previous batch' : 'Previous content completed'}
Current Heading Hierarchy: ${context.headingHierarchy.join(' > ')}
===================================
`;
  }
  
  basePrompt = basePrompt.replace('{PREVIOUS_CONTEXT}', contextInfo);
  
  return `${basePrompt}

DOCUMENT: ${fileName}
BATCH INFO: ${isFirstBatch ? 'FIRST BATCH' : ''} ${isLastBatch ? 'LAST BATCH' : 'MIDDLE BATCH'}

IMPORTANT INSTRUCTIONS FOR BATCH PROCESSING:
${!isFirstBatch ? '- This is a continuation from previous pages. Check if content continues from the previous batch.' : ''}
${!isLastBatch ? '- Content may continue to the next batch. Mark appropriately with [CONTINUES] flag.' : ''}
- Maintain consistent heading hierarchy across batches
- Preserve table structures that may span across batches
- Keep track of numbered sequences that may continue

Analyze the provided pages and create chunks according to the rules above.
`;
}

/**
 * バッチ文脈を更新
 */
function updateBatchContext(
  context: BatchContext,
  batchChunks: VisionChunk[],
  batchIndex: number
): BatchContext {
  const lastChunk = batchChunks[batchChunks.length - 1];
  
  return {
    lastChunks: batchChunks.slice(-2), // 最後の2チャンクを保持
    headingHierarchy: lastChunk.metadata.headingHierarchy as string[],
    continuationInfo: lastChunk.continues ? 'Content continues' : 'Content completed',
    batchIndex: batchIndex + 1
  };
}

/**
 * バッチ間でチャンクをマージ
 */
function mergeChunksAcrossBatches(chunks: VisionChunk[]): VisionChunk[] {
  if (chunks.length === 0) return [];
  
  const merged: VisionChunk[] = [];
  let currentChunk: VisionChunk | null = null;
  
  for (const chunk of chunks) {
    // 前のチャンクと継続関係にある場合
    if (currentChunk && 
        chunk.continues && 
        currentChunk.heading === chunk.heading &&
        currentChunk.metadata.batchIndex !== undefined &&
        chunk.metadata.batchIndex !== undefined &&
        chunk.metadata.batchIndex === currentChunk.metadata.batchIndex + 1) {
      
      // マージ
      currentChunk.content += '\n\n' + chunk.content;
      console.log(`Merged chunk across batches: ${chunk.heading}`);
      
    } else {
      // 新しいチャンクとして追加
      if (currentChunk) {
        merged.push(currentChunk);
      }
      currentChunk = { ...chunk };
    }
  }
  
  if (currentChunk) {
    merged.push(currentChunk);
  }
  
  return merged;
}

/**
 * 単一画像を処理
 */
async function processSingleImage(
  imageBuffer: Buffer,
  fileName: string,
  fileType: string,
  model: GenerativeModel
): Promise<VisionChunk[]> {
  
  const base64Data = imageBuffer.toString('base64');
  const mimeType = getMimeType(fileType, fileName);
  
  console.log(`Processing single image: ${fileName} (${mimeType})`);
  
  const prompt = buildVisionGuidedPrompt(fileName);
  
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    }
  ]);
  
  const response = result.response.text();
  return parseVisionGuidedResponse(response);
}

// 既存の関数（getMimeType, buildVisionGuidedPrompt, parseVisionGuidedResponse）は変更なし

/**
 * MIMEタイプを決定
 */
function getMimeType(fileType: string, fileName: string): string {
  if (fileType === 'application/pdf') {
    return 'application/pdf';
  }
  
  const imageTypes: Record<string, string> = {
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/png': 'image/png',
    'image/webp': 'image/webp',
    'image/gif': 'image/gif'
  };
  
  if (imageTypes[fileType]) {
    return imageTypes[fileType];
  }
  
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith('.pdf')) {
    return 'application/pdf';
  } else if (lowerFileName.endsWith('.png')) {
    return 'image/png';
  } else if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  } else if (lowerFileName.endsWith('.webp')) {
    return 'image/webp';
  } else if (lowerFileName.endsWith('.gif')) {
    return 'image/gif';
  }
  
  return 'application/pdf';
}

/**
 * Vision-Guided Chunking用プロンプト構築
 */
function buildVisionGuidedPrompt(fileName: string): string {
  const basePrompt = loadPrompt();
  
  return `${basePrompt}

DOCUMENT: ${fileName}

Analyze the provided document and create chunks according to the rules above.
`;
}

/**
 * LMM応答をパース
 */
function parseVisionGuidedResponse(response: string): VisionChunk[] {
  const chunks: VisionChunk[] = [];
  
  const chunkPattern = /\[CONTINUES\](True|False|Partial)\[\/CONTINUES\]\s*\[HEAD\](.*?)\[\/HEAD\]\s*([\s\S]*?)(?=\[CONTINUES\]|$)/g;
  
  let match;
  while ((match = chunkPattern.exec(response)) !== null) {
    const continuesFlag = match[1];
    const heading = match[2].trim();
    const content = match[3].trim();
    
    if (content.length > 10) {
      chunks.push({
        content,
        heading,
        continues: continuesFlag === 'True',
        metadata: {
          headingHierarchy: heading.split('>').map(h => h.trim()),
          continuesFlag: continuesFlag
        }
      });
    }
  }
  
  if (chunks.length === 0) {
    console.warn('Failed to parse structured response, attempting fallback parsing...');
    
    const paragraphs = response
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 50);
    
    if (paragraphs.length > 0) {
      paragraphs.forEach((para, idx) => {
        chunks.push({
          content: para,
          heading: `Document > Content > Section ${idx + 1}`,
          continues: false,
          metadata: {
            headingHierarchy: ['Document', 'Content', `Section ${idx + 1}`],
            continuesFlag: 'False',
            fallbackParsed: true
          }
        });
      });
    }
  }
  
  return chunks;
}

/**
 * チャンクのマージ（既存関数の改良版）
 */
export function mergeRelatedChunks(chunks: VisionChunk[]): VisionChunk[] {
  return mergeChunksAcrossBatches(chunks);
}