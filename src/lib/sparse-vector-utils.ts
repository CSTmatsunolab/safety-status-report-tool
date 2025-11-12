// src/lib/sparse-vector-utils.ts
import WinkTokenizer from 'wink-tokenizer';
import * as kuromoji from 'kuromoji';
import path from 'path';

export interface SparseValues {
  indices: number[];
  values: number[];
}

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
]);

// 日本語の重要用語
const JAPANESE_KEYWORDS = new Map<string, number>([
  ['セキュリティ', 2.0],
  ['パフォーマンス', 1.8],
  ['スケーラビリティ', 1.8],
  ['コスト', 1.5],
  ['安全', 2.0],
  ['品質', 1.8],
  ['効率', 1.5],
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
    const dicPath = path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');
    
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

//英語 (WordTokenizer) と日本語 (Kuromoji) の両方を処理
export async function createSparseVector(text: string): Promise<SparseValues> {
  const tf = new Map<number, number>();
  const textLower = text.toLowerCase();

  // --- 1. GSN要素の処理 ---
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const gsnMatches = text.match(gsnPattern);
  if (gsnMatches) {
    gsnMatches.forEach(gsn => {
      const index = simpleHash(gsn.toUpperCase());
      tf.set(index, (tf.get(index) || 0) + 3.0); // GSN要素は高い重み
    });
  }

  // --- 2. 英語のトークン処理 ---
  const englishTokens = englishTokenizer.tokenize(textLower).map(t => t.value);
  if (englishTokens) {
    englishTokens.forEach(token => {
      if (token.length < 2) return;
      
      const index = simpleHash(token);
      let weight = (tf.get(index) || 0) + 1.0; // 基本カウント
      
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
      let weight = (tf.get(index) || 0) + 1.0; // 基本カウント
      
      // 日本語の重要キーワード重み付け
      if (JAPANESE_KEYWORDS.has(word)) {
        weight += JAPANESE_KEYWORDS.get(word)!;
      }
      
      tf.set(index, weight);
    });
  } catch (error) {
    console.warn('Kuromoji processing failed:', error);
    // Kuromojiが失敗しても、英語とGSNの処理は続行される
  }

  // --- 4. 正規化 ---
  const indices: number[] = [];
  const values: number[] = [];
  const maxValue = Math.max(...Array.from(tf.values()));

  tf.forEach((count, index) => {
    indices.push(index);
    values.push(count / (maxValue || 1));
  });

  return { indices, values };
}
