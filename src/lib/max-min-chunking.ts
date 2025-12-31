// lib/max-min-chunking.ts

import { Embeddings } from '@langchain/core/embeddings';

interface TableSegment {
  type: 'table';
  content: string;
  header: string;
  rows: string[];
}

interface TextSegment {
  type: 'text';
  content: string;
}

type ContentSegment = TableSegment | TextSegment;

/**
 * テーブル行の検出
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  
  // マークダウンテーブル
  if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
    return true;
  }
  
  // タブ区切り（3つ以上のセル）
  if (trimmed.split('\t').length >= 3) {
    return true;
  }
  
  // スペース区切りで構造化されたデータ行
  const idPatterns = [
    /^[A-Z]{1,3}-\d{2,4}\b/,  // M-001, R-002, H-003, TC-001, TD-01
    /^\d{4}-\d{2}-\d{2}\b/,    // 日付パターン
  ];
  
  const hasIdPattern = idPatterns.some(p => p.test(trimmed));
  const spaceSeparatedValues = trimmed.split(/\s{2,}/).filter(v => v.trim());
  const hasMultipleValues = spaceSeparatedValues.length >= 3;
  const numberCount = (trimmed.match(/\d+/g) || []).length;
  const hasMultipleNumbers = numberCount >= 2;
  
  if (hasIdPattern && hasMultipleValues) {
    return true;
  }
  
  if (hasMultipleValues && hasMultipleNumbers && spaceSeparatedValues.length >= 4) {
    return true;
  }
  
  return false;
}

/**
 * テーブルヘッダーの検出
 */
function isTableHeader(line: string, nextLine?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  
  if (/^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(trimmed)) {
    return false;
  }
  
  const headerKeywords = [
    'ID', 'No', '番号', '名前', '名称', 'Name',
    '状態', 'Status', '担当', '期限', 'Date',
    'スコア', 'Score', '確率', '深刻度',
    '対策', 'リスク', 'ハザード', 'Hazard',
    'コスト', 'Cost', '進捗', '%', '対象'
  ];
  const hasHeaderKeyword = headerKeywords.some(kw => trimmed.includes(kw));
  
  if (nextLine && isTableRow(nextLine) && hasHeaderKeyword) {
    return true;
  }
  
  if (trimmed.includes('|') && nextLine) {
    const nextTrimmed = nextLine.trim();
    if (/^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(nextTrimmed)) {
      return true;
    }
  }
  
  return false;
}

/**
 * テキストをセグメント（テーブル / テキスト）に分割
 * 短いテキストセグメントは自動的に結合
 */
function segmentContent(text: string): ContentSegment[] {
  const lines = text.split('\n');
  const rawSegments: ContentSegment[] = [];
  
  let currentTextLines: string[] = [];
  let tableLines: string[] = [];
  let tableHeader = '';
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i < lines.length - 1 ? lines[i + 1] : undefined;
    
    // テーブルヘッダーの検出
    if (!inTable && isTableHeader(line, nextLine)) {
      if (currentTextLines.length > 0) {
        rawSegments.push({
          type: 'text',
          content: currentTextLines.join('\n')
        });
        currentTextLines = [];
      }
      
      inTable = true;
      tableHeader = line;
      tableLines = [line];
      continue;
    }
    
    // テーブル行の検出
    if (!inTable && isTableRow(line)) {
      if (currentTextLines.length > 0) {
        rawSegments.push({
          type: 'text',
          content: currentTextLines.join('\n')
        });
        currentTextLines = [];
      }
      
      inTable = true;
      if (i > 0 && !lines[i-1].trim().match(/^[•●◆■]/)) {
        tableHeader = lines[i-1];
        tableLines = [lines[i-1], line];
      } else {
        tableHeader = '';
        tableLines = [line];
      }
      continue;
    }
    
    // テーブル継続中
    if (inTable) {
      if (/^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(line.trim())) {
        tableLines.push(line);
        continue;
      }
      
      if (isTableRow(line) || (line.trim() && line.includes('|'))) {
        tableLines.push(line);
        continue;
      }
      
      if (!line.trim()) {
        if (nextLine && isTableRow(nextLine)) {
          tableLines.push(line);
          continue;
        }
        // テーブル終了
        rawSegments.push({
          type: 'table',
          content: tableLines.join('\n'),
          header: tableHeader,
          rows: tableLines.filter(l => l.trim() && l !== tableHeader)
        });
        inTable = false;
        tableLines = [];
        tableHeader = '';
        continue;
      }
      
      // テーブル以外の行 → テーブル終了
      rawSegments.push({
        type: 'table',
        content: tableLines.join('\n'),
        header: tableHeader,
        rows: tableLines.filter(l => l.trim() && l !== tableHeader)
      });
      inTable = false;
      tableLines = [];
      tableHeader = '';
      currentTextLines = [line];
      continue;
    }
    
    currentTextLines.push(line);
  }
  
  // 残りを保存
  if (inTable && tableLines.length > 0) {
    rawSegments.push({
      type: 'table',
      content: tableLines.join('\n'),
      header: tableHeader,
      rows: tableLines.filter(l => l.trim() && l !== tableHeader)
    });
  } else if (currentTextLines.length > 0) {
    rawSegments.push({
      type: 'text',
      content: currentTextLines.join('\n')
    });
  }
  
  // 【重要】短いテキストセグメントを結合してチャンク数倍増を防ぐ
  const MIN_TEXT_LENGTH = 300;  // この長さ未満のテキストは結合
  const mergedSegments: ContentSegment[] = [];
  let pendingText = '';
  
  for (const segment of rawSegments) {
    if (segment.type === 'table') {
      // テーブルの前に保留中のテキストがあれば追加
      if (pendingText.trim()) {
        mergedSegments.push({ type: 'text', content: pendingText });
        pendingText = '';
      }
      mergedSegments.push(segment);
    } else {
      // テキストセグメント
      const textContent = segment.content.trim();
      if (!textContent) continue;
      
      if (pendingText) {
        pendingText += '\n' + textContent;
      } else {
        pendingText = textContent;
      }
      
      // 十分な長さになったら確定
      if (pendingText.length >= MIN_TEXT_LENGTH) {
        mergedSegments.push({ type: 'text', content: pendingText });
        pendingText = '';
      }
    }
  }
  
  // 残りの保留テキスト
  if (pendingText.trim()) {
    // 最後のテキストセグメントがあれば結合、なければ新規追加
    const lastSegment = mergedSegments[mergedSegments.length - 1];
    if (lastSegment && lastSegment.type === 'text') {
      lastSegment.content += '\n' + pendingText;
    } else {
      mergedSegments.push({ type: 'text', content: pendingText });
    }
  }
  
  return mergedSegments;
}

/**
 * テーブルを適切なサイズのチャンクに分割（ヘッダー付与）
 */
function chunkTable(table: TableSegment, maxRows: number = 15): string[] {
  const { header, rows } = table;
  
  if (rows.length <= maxRows) {
    return [table.content];
  }
  
  const chunks: string[] = [];
  for (let i = 0; i < rows.length; i += maxRows) {
    const chunkRows = rows.slice(i, Math.min(i + maxRows, rows.length));
    const chunkContent = header 
      ? [header, ...chunkRows].join('\n')
      : chunkRows.join('\n');
    chunks.push(chunkContent);
  }
  
  return chunks;
}

// ============================================================
// 【既存】PDFテキスト前処理（テーブル行を壊さないよう修正）
// ============================================================

/**
 * PDFテキストの積極的な前処理
 * 不要な改行を除去し、段落を適切に結合
 */
function preprocessPDFText(text: string): string {
  // まず全体を段落に分割（2つ以上の改行で分割）
  const paragraphs = text.split(/\n\s*\n/);
  
  const processedParagraphs = paragraphs.map(paragraph => {
    // 段落内の改行を処理
    const lines = paragraph.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length === 0) return '';
    
    // テーブル行っぽいものは結合しない
    const looksLikeTable = lines.some(line => 
      line.includes('|') || 
      /^[A-Z]{1,3}-\d{2,4}\s+/.test(line) ||
      line.split(/\s{2,}/).length >= 3
    );
    
    if (looksLikeTable) {
      // テーブルっぽい段落はそのまま改行を維持
      return lines.join('\n');
    }
    
    // 短い行（おそらくPDFの自動改行）を結合
    const mergedText = lines.reduce((acc, line, index) => {
      if (index === 0) return line;
      
      const prevLine = lines[index - 1];
      
      // 結合条件の判定
      const shouldMerge = 
        // 前の行が文末記号で終わっていない
        !prevLine.match(/[。！？.!?]$/) &&
        // 前の行が短い（50文字未満 - PDFの自動改行の可能性）
        prevLine.length < 50 &&
        // 現在の行が箇条書きや見出しで始まっていない
        !line.match(/^[A-Z\d●•◆■□▪▫◯◉①-⑩\[\(（【「『]/);
      
      if (shouldMerge) {
        // 日本語の場合は直接結合、英語の場合はスペースを入れる
        const needsSpace = /[a-zA-Z0-9]$/.test(acc) && /^[a-zA-Z0-9]/.test(line);
        return acc + (needsSpace ? ' ' : '') + line;
      } else {
        // 新しい文として追加
        return acc + '。' + line;  // 明示的に文の区切りを追加
      }
    }, '');
    
    return mergedText;
  });
  
  // 空の段落を除去して結合
  return processedParagraphs.filter(p => p).join('。\n');
}

/**
 * テキストを文単位に分割（改善版）
 */
function splitIntoSentences(text: string): string[] {
  // 複数のスペースや改行を正規化
  const normalizedText = text
    .replace(/\r\n/g, '\n')  // Windows改行を統一
    .replace(/\s+/g, ' ')    // 複数のスペースを1つに
    .replace(/\n+/g, '\n')   // 複数の改行を1つに
    .trim();
  
  // 文末パターン（日本語と英語）
  const sentencePattern = /[。！？.!?]/g;
  
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = sentencePattern.exec(normalizedText)) !== null) {
    const sentence = normalizedText.slice(lastIndex, match.index + 1).trim();
    
    // 最小文字数チェック（15文字以上）と最大文字数チェック（1000文字以下）
    if (sentence.length >= 15 && sentence.length <= 1000) {
      sentences.push(sentence);
    } else if (sentence.length > 1000) {
      // 長すぎる文は分割
      const chunks = sentence.match(/.{1,500}/g) || [sentence];
      sentences.push(...chunks);
    } else if (sentences.length > 0 && sentence.length > 0) {
      // 短すぎる文は前の文に結合
      sentences[sentences.length - 1] += ' ' + sentence;
    }
    
    lastIndex = match.index + 1;
  }
  
  // 最後の部分を処理
  if (lastIndex < normalizedText.length) {
    const remaining = normalizedText.slice(lastIndex).trim();
    if (remaining.length >= 15) {
      sentences.push(remaining);
    } else if (sentences.length > 0 && remaining.length > 0) {
      sentences[sentences.length - 1] += ' ' + remaining;
    }
  }
  
  // 重複削除と空文字除去
  return sentences
    .filter((s, index, self) => s && self.indexOf(s) === index)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * テキスト部分のMax-Min Semantic Chunking（内部用）
 */
async function chunkTextSegment(
  text: string,
  embeddings: Embeddings,
  hard_thr: number,
  init_const: number,
  c: number
): Promise<string[]> {
  const sentences = splitIntoSentences(text);
  
  if (sentences.length === 0) {
    return text.trim() ? [text] : [];
  }
  
  if (sentences.length === 1) {
    return sentences;
  }
  
  // 文が異常に多い場合のフォールバック
  if (sentences.length > 500) {
    console.warn(`警告: ${sentences.length}個の文が検出されました。固定長チャンキングへフォールバック`);
    const chunkSize = 2000;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, Math.min(i + chunkSize, text.length));
      if (chunk.trim()) {
        chunks.push(chunk.trim());
      }
    }
    return chunks;
  }
  
  // 各文のエンベディングを取得（バッチ処理）
  const batchSize = 100;
  const sentenceEmbeddings: number[][] = [];
  
  for (let i = 0; i < sentences.length; i += batchSize) {
    const batch = sentences.slice(i, Math.min(i + batchSize, sentences.length));
    const batchEmbeddings = await embeddings.embedDocuments(batch);
    sentenceEmbeddings.push(...batchEmbeddings);
  }
  
  // Max-Minアルゴリズムでチャンキング
  const chunks: string[] = [];
  let currentChunk: number[] = [];
  
  for (let i = 0; i < sentences.length; i++) {
    if (currentChunk.length === 0) {
      currentChunk.push(i);
      continue;
    }
    
    if (currentChunk.length === 1) {
      const similarity = cosineSimilarity(
        sentenceEmbeddings[currentChunk[0]],
        sentenceEmbeddings[i]
      );
      
      if (init_const * similarity > hard_thr) {
        currentChunk.push(i);
      } else {
        chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
        currentChunk = [i];
      }
      continue;
    }
    
    const minSim = calculateMinSimilarity(currentChunk, sentenceEmbeddings);
    const maxSim = calculateMaxSimilarity(i, currentChunk, sentenceEmbeddings);
    const threshold = Math.max(
      c * minSim * sigmoid(currentChunk.length),
      hard_thr
    );
    
    if (maxSim > threshold) {
      currentChunk.push(i);
    } else {
      chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
      currentChunk = [i];
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
  }
  
  return chunks;
}

// ============================================================
// 【修正】メイン関数（テーブル対応を統合）
// ============================================================

/**
 * Max-Min Semantic Chunking アルゴリズム
 * 論文1の手法を実装
 * 【修正】テーブル構造を保持するよう改善
 */
export async function maxMinSemanticChunk(
  text: string,
  embeddings: Embeddings,
  config: MaxMinConfig = {},
  isPDF: boolean = false  // PDF判定フラグを追加
): Promise<string[]> {
  
  // PDFの場合は前処理を適用
  if (isPDF) {
    console.log(`PDF前処理開始: ${text.length}文字`);
    text = preprocessPDFText(text);
    console.log(`PDF前処理完了: ${text.length}文字`);
  }
  
  // ハイパーパラメータ（PDFの場合は調整）- 元の設定を維持
  const {
    hard_thr = isPDF ? 0.5 : 0.4,  // PDFは閾値を上げて結合を促進
    init_const = isPDF ? 2.0 : 1.5, // PDFは初期値を上げて結合を促進
    c = 0.9
  } = config;
  
  const segments = segmentContent(text);
  
  // セグメントが1つでテーブルがない場合は従来通りの処理
  if (segments.length === 1 && segments[0].type === 'text') {
    // 従来のMax-Minチャンキング処理
    const sentences = splitIntoSentences(text);
    
    if (sentences.length === 0) {
      return [text];
    }
    
    if (sentences.length === 1) {
      return sentences;
    }
    
    console.log(`Max-Min Chunking: Processing ${sentences.length} sentences`);
    
    // 文が異常に多い場合の警告
    if (sentences.length > 500) {
      console.warn(`警告: ${sentences.length}個の文が検出されました。`);
      console.warn(`PDFの構造に問題がある可能性があります。固定長チャンキングへフォールバック`);
      
      const chunkSize = 2000;
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, Math.min(i + chunkSize, text.length));
        if (chunk.trim()) {
          chunks.push(chunk.trim());
        }
      }
      return chunks;
    }
    
    // 各文のエンベディングを取得（バッチ処理）
    const batchSize = 100;
    const sentenceEmbeddings: number[][] = [];
    
    for (let i = 0; i < sentences.length; i += batchSize) {
      const batch = sentences.slice(i, Math.min(i + batchSize, sentences.length));
      const batchEmbeddings = await embeddings.embedDocuments(batch);
      sentenceEmbeddings.push(...batchEmbeddings);
    }
    
    // Max-Minアルゴリズムでチャンキング
    const chunks: string[] = [];
    let currentChunk: number[] = [];
    
    for (let i = 0; i < sentences.length; i++) {
      if (currentChunk.length === 0) {
        currentChunk.push(i);
        continue;
      }
      
      if (currentChunk.length === 1) {
        const similarity = cosineSimilarity(
          sentenceEmbeddings[currentChunk[0]],
          sentenceEmbeddings[i]
        );
        
        if (init_const * similarity > hard_thr) {
          currentChunk.push(i);
        } else {
          chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
          currentChunk = [i];
        }
        continue;
      }
      
      const minSim = calculateMinSimilarity(currentChunk, sentenceEmbeddings);
      const maxSim = calculateMaxSimilarity(i, currentChunk, sentenceEmbeddings);
      const threshold = Math.max(
        c * minSim * sigmoid(currentChunk.length),
        hard_thr
      );
      
      if (maxSim > threshold) {
        currentChunk.push(i);
      } else {
        chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
        currentChunk = [i];
      }
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
    }
    
    console.log(`Max-Min Chunking: Created ${chunks.length} chunks`);
    
    return chunks;
  }
  
  console.log(`Table-Aware Chunking: ${segments.length} segments detected`);
  
  const allChunks: string[] = [];
  let tableCount = 0;
  let textSegmentCount = 0;
  
  for (const segment of segments) {
    if (segment.type === 'table') {
      // テーブルは構造を保持してチャンク化
      const tableChunks = chunkTable(segment, 15);
      tableCount++;
      allChunks.push(...tableChunks);
    } else {
      // テキストはMax-Min Chunkingで処理
      textSegmentCount++;
      const textChunks = await chunkTextSegment(
        segment.content,
        embeddings,
        hard_thr,
        init_const,
        c
      );
      allChunks.push(...textChunks);
    }
  }
  
  console.log(`Table-Aware Chunking: ${tableCount} tables, ${textSegmentCount} text segments → ${allChunks.length} chunks`);
  
  return allChunks;
}

// ============================================================
// 【既存】ヘルパー関数（変更なし）
// ============================================================

function calculateMinSimilarity(
  chunkIndices: number[],
  embeddings: number[][]
): number {
  let minSim = 1.0;
  
  for (let i = 0; i < chunkIndices.length; i++) {
    for (let j = i + 1; j < chunkIndices.length; j++) {
      const sim = cosineSimilarity(
        embeddings[chunkIndices[i]],
        embeddings[chunkIndices[j]]
      );
      minSim = Math.min(minSim, sim);
    }
  }
  
  return minSim;
}

function calculateMaxSimilarity(
  sentenceIndex: number,
  chunkIndices: number[],
  embeddings: number[][]
): number {
  let maxSim = 0.0;
  
  for (const idx of chunkIndices) {
    const sim = cosineSimilarity(
      embeddings[sentenceIndex],
      embeddings[idx]
    );
    maxSim = Math.max(maxSim, sim);
  }
  
  return maxSim;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface MaxMinConfig {
  hard_thr?: number;
  init_const?: number;
  c?: number;
}