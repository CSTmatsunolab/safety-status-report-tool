// lambda/src/lib/rag/sparse-vector-utils.ts
import WinkTokenizer from 'wink-tokenizer';
import * as kuromoji from 'kuromoji';
import path from 'path';
import fs from 'fs';

import { SparseValues } from './types';

// 英語のトークナイザー
const englishTokenizer = new WinkTokenizer();

// 英語の重要キーワード
const IMPORTANT_KEYWORDS = new Map<string, number>([
  ['api', 2.0],
  ['ml', 2.0],
  ['ai', 2.0],
  ['iot', 1.5],
  ['cicd', 1.5],
  ['devops', 1.5],
  ['cloud', 1.5],
  ['roi', 2.0],
  ['kpi', 2.0],
  ['revenue', 1.5],
  ['cost', 1.5],
  ['profit', 1.5],
  ['gsn', 3.0],
  ['goal', 2.0],
  ['strategy', 2.0],
  ['evidence', 2.0],
  ['safety', 2.5],
  ['risk', 2.5],
  ['hazard', 2.0],
]);

// 日本語の重要用語
const JAPANESE_KEYWORDS = new Map<string, number>([
  ['セキュリティ', 2.0],
  ['パフォーマンス', 1.8],
  ['スケーラビリティ', 1.8],
  ['コスト', 1.5],
  ['安全', 2.5],
  ['品質', 1.8],
  ['効率', 1.5],
  ['リスク', 2.5],
  ['ゴール', 2.0],
  ['戦略', 2.0],
  ['証拠', 2.0],
  ['アシュアランス', 2.0],
  ['ハザード', 2.0],
]);

/**
 * 文字列から簡易的なハッシュ値を生成
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 1000000;
}

// Kuromojiトークナイザーのシングルトン（キャッシュ）
let kuromojiTokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
let initPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

/**
 * Kuromojiトークナイザーの初期化（シングルトン）
 */
async function getKuromojiTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (kuromojiTokenizer) return kuromojiTokenizer;

  if (!initPromise) {
    console.log('Initializing Kuromoji tokenizer...');
    
    // Lambda Layer または node_modules から辞書を探す
    const possibleDicPaths = [
      '/opt/nodejs/node_modules/kuromoji/dict',  // Lambda Layer
      '/var/task/node_modules/kuromoji/dict',    // Lambda function内
      path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict')  // ローカル開発
    ];
    
    // 利用可能な辞書パスを探す
    let dicPath = possibleDicPaths[possibleDicPaths.length - 1];  // デフォルト
    
    for (const p of possibleDicPaths) {
      try {
        if (fs.existsSync(p)) {
          dicPath = p;
          console.log(`Found Kuromoji dict at: ${p}`);
          break;
        }
      } catch {
        // パスが存在しない場合は次へ
      }
    }
    
    console.log(`Using Kuromoji dict path: ${dicPath}`);
    
    initPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: dicPath }).build((err, built) => {
        if (err) {
          console.error('Failed to build Kuromoji tokenizer:', err);
          initPromise = null; // 次回リトライできるようにする
          return reject(err);
        }
        console.log('Kuromoji tokenizer initialized successfully.');
        kuromojiTokenizer = built;
        resolve(built);
      });
    });
  }
  
  return initPromise;
}

/**
 * スパースベクトルを生成（英語 + 日本語 + GSN要素）
 */
export async function createSparseVector(text: string): Promise<SparseValues> {
  const tf = new Map<number, number>();
  const textLower = text.toLowerCase();

  // --- 1. GSN要素の処理（最優先）---
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const gsnMatches = text.match(gsnPattern);
  if (gsnMatches) {
    gsnMatches.forEach(gsn => {
      const index = simpleHash(gsn.toUpperCase());
      tf.set(index, (tf.get(index) || 0) + 3.0); // GSN要素は高い重み
    });
  }

  // --- 2. 英語のトークン処理 ---
  const englishTokens = englishTokenizer.tokenize(textLower).map((t: { value: string }) => t.value);
  if (englishTokens) {
    englishTokens.forEach((token: string) => {
      if (token.length < 2) return;
      
      const index = simpleHash(token);
      let weight = (tf.get(index) || 0) + 1.0;
      
      // 英語の重要キーワード重み付け
      if (IMPORTANT_KEYWORDS.has(token)) {
        weight += IMPORTANT_KEYWORDS.get(token)!;
      }
      
      tf.set(index, weight);
    });
  }

  // --- 3. 日本語のトークン処理 ---
  try {
    const tokenizerInstance = await getKuromojiTokenizer();
    const japanesePath = tokenizerInstance.tokenize(text);
    
    japanesePath.forEach(token => {
      const word = token.basic_form; // 基本形
      const pos = token.pos; // 品詞

      // 意味のある品詞（名詞、動詞、形容詞）のみ
      if (!['名詞', '動詞', '形容詞'].includes(pos)) {
        return;
      }
      if (word.length < 2 || word === '*') return;

      const index = simpleHash(word.toLowerCase());
      let weight = (tf.get(index) || 0) + 1.0;
      
      // 日本語の重要キーワード重み付け
      if (JAPANESE_KEYWORDS.has(word)) {
        weight += JAPANESE_KEYWORDS.get(word)!;
      }
      
      tf.set(index, weight);
    });
  } catch (error) {
    console.warn('Kuromoji processing failed, using fallback:', error);
    // フォールバック: 日本語の重要キーワードを直接検索
    JAPANESE_KEYWORDS.forEach((weight, keyword) => {
      if (text.includes(keyword)) {
        const index = simpleHash(keyword);
        tf.set(index, (tf.get(index) || 0) + weight);
      }
    });
  }

  // --- 4. 正規化 ---
  const indices: number[] = [];
  const values: number[] = [];
  
  // 空のベクトルの場合はフォールバック値を追加（Pineconeは空のsparse vectorを許可しない）
  if (tf.size === 0) {
    const fallbackIndex = simpleHash(text.slice(0, 100) || 'fallback');
    indices.push(fallbackIndex);
    values.push(1.0);
    return { indices, values };
  }
  
  const maxValue = Math.max(...Array.from(tf.values()), 1);

  tf.forEach((count, index) => {
    indices.push(index);
    values.push(count / maxValue);
  });

  return { indices, values };
}

/**
 * 軽量版スパースベクトル生成（Kuromojiなし）
 * Lambda Layer が利用できない場合のフォールバック
 */
export async function createSparseVectorLite(text: string): Promise<SparseValues> {
  const tf = new Map<number, number>();
  const textLower = text.toLowerCase();

  // --- 1. GSN要素の処理 ---
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const gsnMatches = text.match(gsnPattern);
  if (gsnMatches) {
    gsnMatches.forEach(gsn => {
      const index = simpleHash(gsn.toUpperCase());
      tf.set(index, (tf.get(index) || 0) + 3.0);
    });
  }

  // --- 2. 英語トークン ---
  const englishTokens = englishTokenizer.tokenize(textLower).map((t: { value: string }) => t.value);
  englishTokens.forEach((token: string) => {
    if (token.length < 2) return;
    const index = simpleHash(token);
    let weight = (tf.get(index) || 0) + 1.0;
    if (IMPORTANT_KEYWORDS.has(token)) {
      weight += IMPORTANT_KEYWORDS.get(token)!;
    }
    tf.set(index, weight);
  });

  // --- 3. 日本語重要キーワード検索 ---
  JAPANESE_KEYWORDS.forEach((weight, keyword) => {
    if (text.includes(keyword)) {
      const index = simpleHash(keyword);
      tf.set(index, (tf.get(index) || 0) + weight);
    }
  });

  // カタカナ語の抽出
  const katakanaPattern = /[ァ-ヴー]{3,}/g;
  const katakanaMatches = text.match(katakanaPattern) || [];
  katakanaMatches.forEach(word => {
    const index = simpleHash(word);
    tf.set(index, (tf.get(index) || 0) + 1.5);
  });

  // --- 4. 正規化 ---
  const indices: number[] = [];
  const values: number[] = [];
  
  // 空のベクトルの場合はフォールバック値を追加（Pineconeは空のsparse vectorを許可しない）
  if (tf.size === 0) {
    const fallbackIndex = simpleHash(text.slice(0, 100) || 'fallback');
    indices.push(fallbackIndex);
    values.push(1.0);
    return { indices, values };
  }
  
  const maxValue = Math.max(...Array.from(tf.values()), 1);

  tf.forEach((count, index) => {
    indices.push(index);
    values.push(count / maxValue);
  });

  return { indices, values };
}

/**
 * ハイブリッド検索用のスパースベクトル生成
 * 環境に応じて適切なバージョンを選択
 */
export async function createSparseVectorAuto(text: string): Promise<SparseValues> {
  try {
    // まず完全版を試みる
    return await createSparseVector(text);
  } catch (error) {
    console.warn('Full sparse vector creation failed, using lite version:', error);
    // フォールバック
    return await createSparseVectorLite(text);
  }
}

/**
 * スパースベクトルのデバッグ情報
 */
export function debugSparseVector(sparseVector: SparseValues, text: string): void {
  console.log('=== Sparse Vector Debug ===');
  console.log(`Text length: ${text.length}`);
  console.log(`Vector dimensions: ${sparseVector.indices.length}`);
  console.log(`Max value: ${Math.max(...sparseVector.values).toFixed(4)}`);
  console.log(`Min value: ${Math.min(...sparseVector.values).toFixed(4)}`);
  
  // GSN要素のチェック
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const gsnMatches = text.match(gsnPattern);
  if (gsnMatches) {
    console.log(`GSN elements found: ${[...new Set(gsnMatches)].join(', ')}`);
  }
  
  console.log('===========================');
}