import { ChromaClient, Collection } from 'chromadb';
import { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';

export interface DirectChromaConfig {
  url?: string;
  apiKey?: string;
}

export class DirectChromaStore {
  private client: ChromaClient;
  private embeddings: Embeddings;
  
  constructor(embeddings: Embeddings, config?: DirectChromaConfig) {
  const url = config?.url || process.env.CHROMA_URL || 'http://localhost:8000';
  const parsedUrl = new URL(url);
  
  this.client = new ChromaClient({
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '8000'),
    ssl: parsedUrl.protocol === 'https:'
  });
  
  this.embeddings = embeddings;
}
  
  /**
   * コレクションの作成または取得
   */
  async getOrCreateCollection(name: string): Promise<Collection> {
    try {
      // 既存のコレクションを取得
      return await this.client.getCollection({ name });
    } catch (error) {
      // 存在しない場合は新規作成
      console.log(`Creating new collection: ${name}`);
      return await this.client.createCollection({
        name,
        metadata: { 
          "hnsw:space": "cosine",
          "created_at": new Date().toISOString()
        }
      });
    }
  }
  
  /**
   * ドキュメントの追加
   */
  async addDocuments(
    collectionName: string,
    documents: Document[]
  ): Promise<void> {
    const collection = await this.getOrCreateCollection(collectionName);
    
    // テキストをエンベディング
    const texts = documents.map(doc => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    
    // ChromaDBに追加
    const metadatas = documents.map(doc => {
      // ChromaDBが受け入れる型に変換
      const cleanMetadata: Record<string, string | number | boolean> = {};
      
      for (const [key, value] of Object.entries(doc.metadata || {})) {
        // エンベディング配列をスキップ
        if (key === 'embeddings' || Array.isArray(value)) {
          continue;
        }
        
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          cleanMetadata[key] = value;
        } else if (value instanceof Date) {
          cleanMetadata[key] = value.toISOString();
        } else if (value !== null && value !== undefined) {
          cleanMetadata[key] = String(value);
        }
      }
      
      cleanMetadata.timestamp = new Date().toISOString();
      return cleanMetadata;
    });
    
    console.log('Uploaded metadata:', metadatas[0]);
    
    await collection.add({
      ids: documents.map((_, i) => `doc_${Date.now()}_${i}`),
      documents: texts,
      embeddings: embeddings,
      metadatas: metadatas
    });
    
    console.log(`Added ${documents.length} documents to collection ${collectionName}`);
  }
  
  /**
   * 類似検索
   */
  async similaritySearch(
    collectionName: string,
    query: string,
    k: number = 5
  ): Promise<Document[]> {
    try {
      const collection = await this.client.getCollection({ name: collectionName });
      
      // クエリをエンベディング
      const queryEmbedding = await this.embeddings.embedQuery(query);
      
      // 検索実行
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: k
      });
      
      // Document形式に変換
      const documents: Document[] = [];
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const content = results.documents[0][i];
          const metadata = results.metadatas?.[0]?.[i] || {};
          const distance = results.distances?.[0]?.[i];
          
          if (content) {
            documents.push(new Document({
              pageContent: content,
              metadata: {
                ...metadata,
                distance: distance,
                score: distance ? 1 - distance : 0 // 距離をスコアに変換
              }
            }));
          }
        }
      }
      
      return documents;
    } catch (error) {
      console.error('Similarity search error:', error);
      return [];
    }
  }
  
  /**
   * コレクションの削除
   */
  async deleteCollection(name: string): Promise<void> {
    try {
      await this.client.deleteCollection({ name });
      console.log(`Deleted collection: ${name}`);
    } catch (error) {
      console.error(`Failed to delete collection ${name}:`, error);
    }
  }
  
  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      // listCollectionsを使用して接続を確認
      const collections = await this.client.listCollections();
      console.log('ChromaDB connection successful, collections:', collections.length);
      return true;
    } catch (error) {
      console.error('ChromaDB connection failed:', error);
      return false;
    }
  }
  
  /**
   * すべてのコレクションをリスト
   */
  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.client.listCollections();
      return collections.map(col => col.name);
    } catch (error) {
      console.error('Failed to list collections:', error);
      return [];
    }
  }

/**
 * コレクションの統計情報を取得
 */
  async getCollectionStats(collectionName: string): Promise<any> {
    try {
      const collection = await this.client.getCollection({ name: collectionName });
      const count = await collection.count();
      
      return {
        name: collectionName,
        count: count,
        metadata: collection.metadata
      };
    } catch (error) {
      console.error('Failed to get collection stats:', error);
      return { count: 0 };
    }
  }
}