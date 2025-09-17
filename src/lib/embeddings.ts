import { OpenAIEmbeddings } from '@langchain/openai';
import { Embeddings } from '@langchain/core/embeddings';


export function createEmbeddings(): Embeddings {
  // OpenAI APIキーが設定されていない場合は、ダミーのエンベディングを使用
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set. Using dummy embeddings for development.');
    return new DummyEmbeddings();
  }

  return new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small',
  });
}

// 開発用のダミーエンベディング
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