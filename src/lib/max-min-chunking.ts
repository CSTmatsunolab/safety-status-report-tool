// lib/max-min-chunking.ts

import { Embeddings } from '@langchain/core/embeddings';

/**
 * Max-Min Semantic Chunking アルゴリズム
 * 論文1の手法を実装
 */
export async function maxMinSemanticChunk(
  text: string,
  embeddings: Embeddings,
  config: MaxMinConfig = {}
): Promise<string[]> {
  
  // ハイパーパラメータ（論文推奨値）
  const {
    hard_thr = 0.4,
    init_const = 1.5,
    c = 0.9
  } = config;
  
  // 1. 文単位に分割
  const sentences = splitIntoSentences(text);
  
  if (sentences.length === 0) {
    return [text];
  }
  
  if (sentences.length === 1) {
    return sentences;
  }
  
  console.log(`Max-Min Chunking: Processing ${sentences.length} sentences`);
  
  // 2. 各文のエンベディングを取得
  const sentenceEmbeddings = await embeddings.embedDocuments(sentences);
  
  // 3. Max-Minアルゴリズムでチャンキング
  const chunks: string[] = [];
  let currentChunk: number[] = []; // 文のインデックスを格納
  
  for (let i = 0; i < sentences.length; i++) {
    
    if (currentChunk.length === 0) {
      // 最初の文
      currentChunk.push(i);
      continue;
    }
    
    if (currentChunk.length === 1) {
      // 2文目の判定
      const similarity = cosineSimilarity(
        sentenceEmbeddings[currentChunk[0]],
        sentenceEmbeddings[i]
      );
      
      if (init_const * similarity > hard_thr) {
        currentChunk.push(i);
      } else {
        // 新しいチャンクを開始
        chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
        currentChunk = [i];
      }
      continue;
    }
    
    // 3文目以降: Max-Minロジック
    
    // min_sim(C): 現在のチャンク内の最小類似度
    const minSim = calculateMinSimilarity(currentChunk, sentenceEmbeddings);
    
    // max_sim(sk, C): 新しい文と現在のチャンクの最大類似度
    const maxSim = calculateMaxSimilarity(i, currentChunk, sentenceEmbeddings);
    
    // threshold(C): 動的閾値
    const threshold = Math.max(
      c * minSim * sigmoid(currentChunk.length),
      hard_thr
    );
    
    // チャンクへの追加判定
    if (maxSim > threshold) {
      currentChunk.push(i);
    } else {
      // 現在のチャンクを確定し、新しいチャンクを開始
      chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
      currentChunk = [i];
    }
  }
  
  // 最後のチャンクを追加
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.map(idx => sentences[idx]).join(' '));
  }
  
  console.log(`Max-Min Chunking: Created ${chunks.length} chunks`);
  
  return chunks;
}

/**
 * チャンク内の最小ペアワイズ類似度を計算
 */
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

/**
 * 新しい文とチャンク内の文の最大類似度を計算
 */
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

/**
 * コサイン類似度を計算
 */
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

/**
 * シグモイド関数
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * テキストを文単位に分割
 */
function splitIntoSentences(text: string): string[] {
  // 日本語と英語の両方に対応
  const sentences = text
    // 句点と改行
    .replace(/([。！？.!?])\s*/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences;
}

/**
 * Max-Min設定インターフェース
 */
export interface MaxMinConfig {
  hard_thr?: number;    // 最小閾値（デフォルト: 0.6）
  init_const?: number;  // 初期化定数（デフォルト: 1.5）
  c?: number;          // 閾値係数（デフォルト: 0.9）
}