// lib/chunking-strategies.ts
// 構造認識型チャンキング（見出しセクション分割 + Max-Min ハイブリッド）

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

// ============================================
// 設定
// ============================================

// 環境変数でアドバンスドチャンキングの有効/無効を制御（デフォルト有効）
const USE_ADVANCED_CHUNKING = process.env.USE_ADVANCED_CHUNKING !== 'false';

// 環境変数でMD変換の有効/無効を制御（デフォルト有効）
const USE_MD_CONVERSION = process.env.USE_MD_CONVERSION !== 'false';

// 環境変数で構造認識型チャンキングの有効/無効を制御（デフォルト有効）
const USE_STRUCTURE_AWARE = process.env.USE_STRUCTURE_AWARE !== 'false';

// チャンキング設定
const CHUNK_CONFIG = {
  // これ以下のセクションは次と結合
  MIN_SECTION_SIZE: 300,
  
  // これを超えたらMax-Min/Traditionalで分割
  MAX_SECTION_SIZE: 1200,
  
  // Traditional用の設定
  TRADITIONAL_CHUNK_SIZE: 1000,
  TRADITIONAL_OVERLAP: 100,
};

// ============================================
// 型定義
// ============================================

interface ChunkMetadata {
  extractionMethod?: string;
  userDesignatedGSN?: boolean;
  s3Key?: string;
  contentPreview?: string;
  isBase64?: boolean;
  originalType?: string;
  pdfBuffer?: Buffer;
  [key: string]: unknown;
}

export interface ChunkingResult {
  documents: Document[];
  warnings: string[];
  conversionInfo?: {
    method: string;
    confidence: number;
    skipped?: boolean;
  };
}

// セクション情報
interface Section {
  heading: string;        // 見出しテキスト（例: "# ADR-101：設計判断"）
  headingLevel: number;   // 見出しレベル（1-6）
  content: string;        // 本文（見出し含む）
  startIndex: number;     // 元テキストでの開始位置
}

// ============================================
// メインAPI
// ============================================

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
  console.log(`Structure-Aware: ${USE_STRUCTURE_AWARE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Advanced (Max-Min): ${USE_ADVANCED_CHUNKING ? 'ENABLED' : 'DISABLED'}`);
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
  
  // 構造認識型チャンキング（デフォルト有効）
  if (USE_STRUCTURE_AWARE) {
    console.log(`\n--- Structure-Aware Chunking Phase ---`);
    console.log(`Strategy: Heading-based Section Split + ${USE_ADVANCED_CHUNKING ? 'Max-Min' : 'Traditional'}`);
    console.log(`Config: MIN=${CHUNK_CONFIG.MIN_SECTION_SIZE}, MAX=${CHUNK_CONFIG.MAX_SECTION_SIZE}`);
    console.log(`===================================\n`);
    
    const documents = await structureAwareChunking(
      text,
      fileName,
      fileType,
      embeddings,
      metadataWithTimestamp
    );
    
    return { documents, warnings, conversionInfo };
  }
  
  // 従来のチャンキング（構造認識無効時）
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
  
  // Max-Minのみ（構造認識無効、アドバンスド有効）
  console.log(`Strategy: Max-Min Semantic Chunking (without structure)`);
  console.log(`===================================\n`);
  
  const documents = await maxMinOnlyChunking(
    text,
    fileName,
    fileType,
    embeddings,
    metadataWithTimestamp
  );
  
  return { documents, warnings, conversionInfo };
}

// ============================================
// 構造認識型チャンキング（案1実装）
// ============================================

/**
 * 構造認識型チャンキング
 * 1. 表を抽出（保護）
 * 2. 見出しでセクション分割
 * 3. 小さいセクションは結合、大きいセクションは分割
 */
async function structureAwareChunking(
  text: string,
  fileName: string,
  fileType: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  const documents: Document[] = [];
  
  try {
    // 1. 表を抽出（PRESERVE マーカーで囲まれた部分）+ 所属セクション情報
    const { preservedBlocks, remainingText } = extractPreservedBlocksWithContext(text);
    console.log(`Preserved Blocks (tables): ${preservedBlocks.length}`);
    
    // 2. 見出しでセクション分割
    const sections = splitByHeadings(remainingText);
    console.log(`Sections found: ${sections.length}`);
    
    // 3. 小さいセクションを結合
    const mergedSections = mergeTinySections(sections, CHUNK_CONFIG.MIN_SECTION_SIZE);
    console.log(`After merging tiny sections: ${mergedSections.length}`);
    
    // 4. PDFかどうかを判定
    const isPDF = metadata.extractionMethod === 'pdf' || 
                  metadata.extractionMethod === 'ocr' ||
                  metadata.extractionMethod === 'vision-ocr' ||
                  isPdfFile(fileType, fileName);
    
    // 5. 各セクションを処理
    for (const section of mergedSections) {
      const sectionContent = section.content.trim();
      if (sectionContent.length === 0) continue;
      
      if (sectionContent.length <= CHUNK_CONFIG.MAX_SECTION_SIZE) {
        // 適切なサイズ → そのままチャンク化
        documents.push(createSectionDocument(
          sectionContent,
          section.heading,
          section.headingLevel,
          fileName,
          metadata,
          'section-whole',
          isPDF
        ));
      } else {
        // 大きいセクション → Max-Min または Traditional で分割
        console.log(`Large section "${section.heading.substring(0, 30)}..." (${sectionContent.length} chars) - splitting`);
        
        const subChunks = USE_ADVANCED_CHUNKING
          ? await splitLargeSectionWithMaxMin(sectionContent, embeddings, isPDF)
          : await splitLargeSectionWithTraditional(sectionContent);
        
        for (const chunk of subChunks) {
          documents.push(createSectionDocument(
            chunk,
            section.heading,
            section.headingLevel,
            fileName,
            metadata,
            USE_ADVANCED_CHUNKING ? 'section-maxmin-split' : 'section-traditional-split',
            isPDF
          ));
        }
      }
    }
    
    // 6. 保護ブロック（表）をチャンク化（所属セクションの見出し付き）
    for (const block of preservedBlocks) {
      if (block.content.trim().length === 0) continue;
      
      // 見出し + 表の内容
      const contentWithContext = block.sectionHeading
        ? `${block.sectionHeading}\n\n${block.content}`
        : block.content;
      
      documents.push(new Document({
        pageContent: contentWithContext,
        metadata: {
          ...metadata,
          chunkingMethod: 'preserved-block',
          isPreservedBlock: true,
          sectionHeading: block.sectionHeading || '(no heading)',
          sectionLevel: block.sectionLevel,
          fileName: fileName,
          isPDF: isPDF,
          containedIds: extractSafetyIds(block.content)
        }
      }));
    }
    
    // 7. チャンクインデックスと総数を設定
    const totalChunks = documents.length;
    documents.forEach((doc, index) => {
      doc.metadata.chunkIndex = index;
      doc.metadata.totalChunks = totalChunks;
    });
    
    console.log(`\n--- Structure-Aware Chunking Result ---`);
    console.log(`Total Chunks: ${totalChunks}`);
    console.log(`  - Section chunks: ${documents.filter(d => !d.metadata.isPreservedBlock).length}`);
    console.log(`  - Table chunks: ${documents.filter(d => d.metadata.isPreservedBlock).length}`);
    
    // チャンク数が多すぎる場合の警告
    if (totalChunks > 100) {
      console.warn(`Warning: ${totalChunks} chunks created. Consider adjusting parameters.`);
    }
    
    // ドキュメントがない場合のフォールバック
    if (documents.length === 0) {
      console.warn('No chunks created, using fallback');
      return traditionalFixedSizeChunking(text, fileName, metadata);
    }
    
    return documents;
    
  } catch (error) {
    console.error('Structure-aware chunking failed:', error);
    return traditionalFixedSizeChunking(text, fileName, metadata);
  }
}

// 保護ブロックの型定義（見出し情報付き）
interface PreservedBlockWithContext {
  content: string;
  sectionHeading: string;
  sectionLevel: number;
  originalIndex: number;
}

/**
 * 保護ブロック（表など）を抽出し、所属セクションの見出しを付与
 * [TABLE_BLOCK] プレースホルダーは残りテキストから削除
 */
function extractPreservedBlocksWithContext(text: string): {
  preservedBlocks: PreservedBlockWithContext[];
  remainingText: string;
} {
  const blocks: PreservedBlockWithContext[] = [];
  const pattern = /<!-- PRESERVE_START -->([\s\S]*?)<!-- PRESERVE_END -->/g;
  
  // 見出しパターン
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  
  // すべての見出しを取得
  const headings: { index: number; level: number; text: string; fullMatch: string }[] = [];
  let headingMatch;
  while ((headingMatch = headingPattern.exec(text)) !== null) {
    headings.push({
      index: headingMatch.index,
      level: headingMatch[1].length,
      text: headingMatch[2].trim(),
      fullMatch: headingMatch[0]
    });
  }
  
  // 各保護ブロックを抽出し、直前の見出しを特定
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const blockContent = match[1].trim();
    const blockIndex = match.index;
    
    if (!blockContent) continue;
    
    // このブロックより前にある最後の見出しを探す
    let sectionHeading = '';
    let sectionLevel = 0;
    
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].index < blockIndex) {
        sectionHeading = headings[i].fullMatch;
        sectionLevel = headings[i].level;
        break;
      }
    }
    
    blocks.push({
      content: blockContent,
      sectionHeading: sectionHeading,
      sectionLevel: sectionLevel,
      originalIndex: blockIndex
    });
  }
  
  // 残りテキストから保護ブロックと[TABLE_BLOCK]プレースホルダーを削除
  let remaining = text
    .replace(pattern, '')  // PRESERVEマーカーと内容を削除
    .replace(/\[TABLE_BLOCK\]/g, '')  // プレースホルダーを削除
    .replace(/\n{3,}/g, '\n\n')  // 連続改行を整理
    .trim();
  
  return { preservedBlocks: blocks, remainingText: remaining };
}

/**
 * 見出しでテキストをセクションに分割
 */
function splitByHeadings(text: string): Section[] {
  const sections: Section[] = [];
  
  // 見出しパターン: # から ###### まで
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  
  const matches: { index: number; level: number; text: string; fullMatch: string }[] = [];
  let match;
  
  while ((match = headingPattern.exec(text)) !== null) {
    matches.push({
      index: match.index,
      level: match[1].length,
      text: match[2].trim(),
      fullMatch: match[0]
    });
  }
  
  // 見出しがない場合は全体を1セクションとして返す
  if (matches.length === 0) {
    return [{
      heading: '(no heading)',
      headingLevel: 0,
      content: text,
      startIndex: 0
    }];
  }
  
  // 最初の見出し前のテキストがあれば追加
  if (matches[0].index > 0) {
    const preContent = text.substring(0, matches[0].index).trim();
    if (preContent.length > 0) {
      sections.push({
        heading: '(preamble)',
        headingLevel: 0,
        content: preContent,
        startIndex: 0
      });
    }
  }
  
  // 各見出しセクションを作成
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    
    const startIndex = current.index;
    const endIndex = next ? next.index : text.length;
    const content = text.substring(startIndex, endIndex).trim();
    
    sections.push({
      heading: current.fullMatch,
      headingLevel: current.level,
      content: content,
      startIndex: startIndex
    });
  }
  
  return sections;
}

/**
 * 小さすぎるセクションを次のセクションと結合
 */
function mergeTinySections(sections: Section[], minSize: number): Section[] {
  if (sections.length <= 1) return sections;
  
  const merged: Section[] = [];
  let accumulator: Section | null = null;
  
  for (const section of sections) {
    if (accumulator === null) {
      accumulator = { ...section };
    } else if (accumulator.content.length < minSize) {
      // 小さいセクション → 次と結合
      accumulator.content += '\n\n' + section.content;
      // 見出しは最初のものを維持（または結合を示す）
      if (section.headingLevel > 0 && accumulator.headingLevel === 0) {
        accumulator.heading = section.heading;
        accumulator.headingLevel = section.headingLevel;
      }
    } else {
      // 十分なサイズ → 確定して次へ
      merged.push(accumulator);
      accumulator = { ...section };
    }
  }
  
  // 最後の accumulator を追加
  if (accumulator !== null) {
    merged.push(accumulator);
  }
  
  return merged;
}

/**
 * 大きいセクションをMax-Minで分割
 */
async function splitLargeSectionWithMaxMin(
  content: string,
  embeddings: Embeddings,
  isPDF: boolean
): Promise<string[]> {
  try {
    const config = isPDF ? {
      hard_thr: 0.5,
      init_const: 2.0,
      c: 0.9
    } : {
      hard_thr: 0.4,
      init_const: 1.5,
      c: 0.9
    };
    
    const chunks = await maxMinSemanticChunk(content, embeddings, config, isPDF);
    return chunks;
    
  } catch (error) {
    console.error('Max-Min split failed, using traditional:', error);
    return splitLargeSectionWithTraditional(content);
  }
}

/**
 * 大きいセクションをTraditionalで分割
 */
async function splitLargeSectionWithTraditional(content: string): Promise<string[]> {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_CONFIG.TRADITIONAL_CHUNK_SIZE,
    chunkOverlap: CHUNK_CONFIG.TRADITIONAL_OVERLAP,
    separators: ['\n\n', '\n', '。', '．', '！', '？', ' '],
  });
  
  try {
    return await textSplitter.splitText(content);
  } catch (error) {
    console.error('Traditional split failed:', error);
    return [content]; // フォールバック: 分割せず返す
  }
}

/**
 * セクションからDocumentを作成
 */
function createSectionDocument(
  content: string,
  heading: string,
  headingLevel: number,
  fileName: string,
  metadata: ChunkMetadata,
  chunkingMethod: string,
  isPDF: boolean
): Document {
  return new Document({
    pageContent: content,
    metadata: {
      ...metadata,
      chunkingMethod: chunkingMethod,
      sectionHeading: heading,
      sectionLevel: headingLevel,
      isPreservedBlock: false,
      fileName: fileName,
      isPDF: isPDF,
      containedIds: extractSafetyIds(content)
    }
  });
}

// ============================================
// 従来のチャンキング関数（フォールバック用）
// ============================================

/**
 * 従来の固定長チャンキング
 */
async function traditionalFixedSizeChunking(
  text: string,
  fileName: string,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_CONFIG.TRADITIONAL_CHUNK_SIZE,
    chunkOverlap: CHUNK_CONFIG.TRADITIONAL_OVERLAP,
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
        chunkSize: CHUNK_CONFIG.TRADITIONAL_CHUNK_SIZE,
        chunkOverlap: CHUNK_CONFIG.TRADITIONAL_OVERLAP,
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
 * Max-Minのみのチャンキング（構造認識なし）
 */
async function maxMinOnlyChunking(
  text: string,
  fileName: string,
  fileType: string,
  embeddings: Embeddings,
  metadata: ChunkMetadata
): Promise<Document[]> {
  
  try {
    const { preservedBlocks, remainingText } = extractPreservedBlocks(text);
    
    const isPDF = metadata.extractionMethod === 'pdf' || 
                  metadata.extractionMethod === 'ocr' ||
                  metadata.extractionMethod === 'vision-ocr' ||
                  isPdfFile(fileType, fileName);
    
    const config = isPDF ? {
      hard_thr: 0.5,
      init_const: 2.0,
      c: 0.9
    } : {
      hard_thr: 0.4,
      init_const: 1.5,
      c: 0.9
    };
    
    let semanticChunks: string[] = [];
    if (remainingText.trim().length > 0) {
      semanticChunks = await maxMinSemanticChunk(remainingText, embeddings, config, isPDF);
    }
    
    const documents: Document[] = [];
    let chunkIndex = 0;
    
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
    
    const totalChunks = documents.length;
    documents.forEach(doc => {
      doc.metadata.totalChunks = totalChunks;
    });
    
    if (documents.length === 0) {
      return traditionalFixedSizeChunking(text, fileName, metadata);
    }
    
    return documents;
    
  } catch (error) {
    console.error('Max-Min only chunking failed:', error);
    return traditionalFixedSizeChunking(text, fileName, metadata);
  }
}

// ============================================
// 設定取得
// ============================================

/**
 * 現在のチャンキング設定を取得
 */
export function getChunkingConfiguration() {
  return {
    structureAware: USE_STRUCTURE_AWARE,
    advancedChunking: USE_ADVANCED_CHUNKING,
    mdConversion: USE_MD_CONVERSION,
    mode: USE_STRUCTURE_AWARE 
      ? (USE_ADVANCED_CHUNKING ? 'structure-aware-maxmin' : 'structure-aware-traditional')
      : (USE_ADVANCED_CHUNKING ? 'maxmin-only' : 'traditional'),
    config: CHUNK_CONFIG,
    strategies: [
      ...(USE_STRUCTURE_AWARE ? ['heading-split', 'section-merge'] : []),
      ...(USE_ADVANCED_CHUNKING ? ['max-min-semantic'] : ['fixed-size']),
      'preserved-blocks'
    ],
  };
}