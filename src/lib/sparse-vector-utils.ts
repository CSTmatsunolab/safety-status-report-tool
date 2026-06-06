// src/lib/sparse-vector-utils.ts
import WinkTokenizer from 'wink-tokenizer';
import * as kuromoji from 'kuromoji';
import path from 'path';

export interface SparseValues {
  indices: number[];
  values: number[];
}

export interface BM25SparseVectorOptions {
  k1?: number;
  b?: number;
  maxDimensions?: number;
}

export interface BM25SparseVectorStats {
  documentCount: number;
  averageDocumentLength: number;
  uniqueTerms: number;
  k1: number;
  b: number;
  maxDimensions: number;
}

export interface BM25SparseVectorSet {
  vectors: SparseValues[];
  stats: BM25SparseVectorStats;
}

const englishTokenizer = new WinkTokenizer();

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

const DEFAULT_BM25_OPTIONS: Required<BM25SparseVectorOptions> = {
  k1: 1.2,
  b: 0.75,
  maxDimensions: 1000,
};

type WinkToken = { value: string };
type TermWeights = Map<string, number>;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 1000000;
}

let kuromojiTokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
let initPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

async function getKuromojiTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (kuromojiTokenizer) return kuromojiTokenizer;

  if (!initPromise) {
    console.log('Initializing Kuromoji tokenizer...');
    const dicPath = path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');

    initPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, built) => {
        if (err) {
          console.error('Failed to build Kuromoji tokenizer:', err);
          initPromise = null;
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

function normalizeTerm(term: string): string {
  return term.normalize('NFKC').trim().toLowerCase();
}

function addTerm(terms: TermWeights, term: string, weight: number = 1): void {
  const normalized = normalizeTerm(term);
  if (normalized.length < 2 || !Number.isFinite(weight) || weight <= 0) return;
  terms.set(normalized, (terms.get(normalized) || 0) + weight);
}

function addGsnTerms(text: string, terms: TermWeights): void {
  const gsnPattern = /\b((?:Sn|[GSCJEAM])\d+)\b/gi;
  const matches = text.match(gsnPattern) || [];
  for (const gsn of matches) {
    addTerm(terms, gsn, 3.0);
  }
}

function addEnglishTerms(text: string, terms: TermWeights): void {
  const tokens = englishTokenizer.tokenize(text.toLowerCase()) as WinkToken[];
  for (const token of tokens) {
    const value = normalizeTerm(token.value);
    if (value.length < 2) continue;
    addTerm(terms, value, 1 + (IMPORTANT_KEYWORDS.get(value) || 0));
  }
}

async function addJapaneseTerms(text: string, terms: TermWeights): Promise<void> {
  const tokenizer = await getKuromojiTokenizer();
  const tokens = tokenizer.tokenize(text);

  for (const token of tokens) {
    if (!['名詞', '動詞', '形容詞'].includes(token.pos)) continue;
    const word = token.basic_form && token.basic_form !== '*'
      ? token.basic_form
      : token.surface_form;
    addTerm(terms, word, 1 + (JAPANESE_KEYWORDS.get(word) || 0));
  }
}

function addJapaneseFallbackTerms(text: string, terms: TermWeights): void {
  for (const [keyword, weight] of JAPANESE_KEYWORDS) {
    if (text.includes(keyword)) {
      addTerm(terms, keyword, 1 + weight);
    }
  }

  const katakanaMatches = text.match(/[ァ-ヴー]{3,}/g) || [];
  for (const word of katakanaMatches) {
    addTerm(terms, word, 1.5);
  }
}

async function collectTermWeights(text: string, useKuromoji: boolean): Promise<TermWeights> {
  const terms: TermWeights = new Map();
  addGsnTerms(text, terms);
  addEnglishTerms(text, terms);

  if (useKuromoji) {
    try {
      await addJapaneseTerms(text, terms);
    } catch (error) {
      console.warn('Kuromoji processing failed, using fallback:', error);
      addJapaneseFallbackTerms(text, terms);
    }
  } else {
    addJapaneseFallbackTerms(text, terms);
  }

  return terms;
}

function createSparseValuesFromTermWeights(
  termWeights: TermWeights,
  maxDimensions: number,
  fallbackSeed: string
): SparseValues {
  const indexWeights = new Map<number, number>();

  for (const [term, weight] of termWeights) {
    const index = simpleHash(term);
    indexWeights.set(index, (indexWeights.get(index) || 0) + weight);
  }

  if (indexWeights.size === 0) {
    return {
      indices: [simpleHash(fallbackSeed.slice(0, 100) || 'fallback')],
      values: [1.0],
    };
  }

  let entries = Array.from(indexWeights.entries())
    .filter(([, value]) => Number.isFinite(value) && value > 0);

  if (entries.length > maxDimensions) {
    entries = entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxDimensions);
  }

  entries.sort((a, b) => a[0] - b[0]);

  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, value]) => value),
  };
}

function calculateDocumentLength(terms: TermWeights): number {
  return Array.from(terms.values()).reduce((sum, value) => sum + value, 0);
}

function bm25Idf(documentCount: number, documentFrequency: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

export async function createBM25SparseVectorSet(
  texts: string[],
  options: BM25SparseVectorOptions = {}
): Promise<BM25SparseVectorSet> {
  const resolvedOptions = { ...DEFAULT_BM25_OPTIONS, ...options };
  const documents = await Promise.all(texts.map(text => collectTermWeights(text, true)));
  const documentCount = Math.max(documents.length, 1);
  const documentLengths = documents.map(calculateDocumentLength);
  const averageDocumentLength = documentLengths.reduce((sum, value) => sum + value, 0) / documentCount || 1;

  const documentFrequencies = new Map<string, number>();
  for (const terms of documents) {
    for (const term of terms.keys()) {
      documentFrequencies.set(term, (documentFrequencies.get(term) || 0) + 1);
    }
  }

  const vectors = documents.map((terms, documentIndex) => {
    const documentLength = documentLengths[documentIndex] || averageDocumentLength;
    const bm25Weights: TermWeights = new Map();

    for (const [term, termFrequency] of terms) {
      const df = documentFrequencies.get(term) || 1;
      const idf = bm25Idf(documentCount, df);
      const denominator = termFrequency + resolvedOptions.k1 *
        (1 - resolvedOptions.b + resolvedOptions.b * (documentLength / averageDocumentLength));
      const score = idf * ((termFrequency * (resolvedOptions.k1 + 1)) / denominator);
      if (score > 0) {
        bm25Weights.set(term, score);
      }
    }

    return createSparseValuesFromTermWeights(
      bm25Weights,
      resolvedOptions.maxDimensions,
      texts[documentIndex] || 'fallback'
    );
  });

  return {
    vectors,
    stats: {
      documentCount: texts.length,
      averageDocumentLength,
      uniqueTerms: documentFrequencies.size,
      k1: resolvedOptions.k1,
      b: resolvedOptions.b,
      maxDimensions: resolvedOptions.maxDimensions,
    },
  };
}

export async function createBM25SparseVectors(
  texts: string[],
  options: BM25SparseVectorOptions = {}
): Promise<SparseValues[]> {
  return (await createBM25SparseVectorSet(texts, options)).vectors;
}

export async function createSparseVector(text: string): Promise<SparseValues> {
  const terms = await collectTermWeights(text, true);
  const queryWeights: TermWeights = new Map();

  for (const [term, weight] of terms) {
    queryWeights.set(term, 1 + Math.log(weight));
  }

  return createSparseValuesFromTermWeights(
    queryWeights,
    DEFAULT_BM25_OPTIONS.maxDimensions,
    text
  );
}

export async function createSparseVectorLite(text: string): Promise<SparseValues> {
  const terms = await collectTermWeights(text, false);
  const queryWeights: TermWeights = new Map();

  for (const [term, weight] of terms) {
    queryWeights.set(term, 1 + Math.log(weight));
  }

  return createSparseValuesFromTermWeights(
    queryWeights,
    DEFAULT_BM25_OPTIONS.maxDimensions,
    text
  );
}

export async function createSparseVectorAuto(text: string): Promise<SparseValues> {
  try {
    return await createSparseVector(text);
  } catch (error) {
    console.warn('Full sparse vector creation failed, using lite version:', error);
    return createSparseVectorLite(text);
  }
}
