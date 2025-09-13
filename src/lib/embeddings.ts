import { OpenAIEmbeddings } from '@langchain/openai';
import { Embeddings } from '@langchain/core/embeddings';

/**
 * エンベディングモデルの設定
 * 
 * デフォルトでOpenAIの text-embedding-3-small を使用
 * 他のオプション:
 * - text-embedding-3-large (より高精度、1536次元)
 * - text-embedding-ada-002 (旧モデル、1536次元)
 */
export function createEmbeddings(): Embeddings {
  // OpenAI APIキーが設定されていない場合は、ダミーのエンベディングを使用
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set. Using dummy embeddings for development.');
    return new DummyEmbeddings();
  }

  const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  
  console.log(`Using embedding model: ${embeddingModel}`);
  
  return new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: embeddingModel,
  });
}

/**
 * 開発用のダミーエンベディング
 * OpenAI APIキーがない場合の開発用
 */
class DummyEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    // 1536次元のダミーベクトル（text-embedding-3-smallと同じ次元）
    return documents.map(() => Array(1536).fill(0).map(() => Math.random()));
  }

  async embedQuery(document: string): Promise<number[]> {
    // 1536次元のダミーベクトル
    return Array(1536).fill(0).map(() => Math.random());
  }
}

// エンベディングモデルの情報
export const EMBEDDING_MODELS = {
  'text-embedding-3-small': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002, // USD
  },
  'text-embedding-3-large': {
    dimensions: 3072,
    maxTokens: 8191,
    costPer1kTokens: 0.00013, // USD
  },
  'text-embedding-ada-002': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00010, // USD
  },
} as const;