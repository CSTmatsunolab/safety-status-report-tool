import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { VectorStore } from '@langchain/core/vectorstores';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { DirectChromaStore } from './direct-chroma-store';

export interface VectorStoreConfig {
  stakeholderId: string;
  embeddings: Embeddings;
}

// ベクトルストア統計情報のインターフェース
export interface VectorStoreStats {
  totalDocuments: number;
  collectionName: string;
  storeType: string;
}

// ChromaDB直接実装のラッパー（VectorStoreインターフェースに適合）
class ChromaVectorStoreWrapper extends VectorStore {
  private chromaStore: DirectChromaStore;
  private collectionName: string;
  
  constructor(
    embeddings: Embeddings,
    collectionName: string,
    chromaStore: DirectChromaStore
  ) {
    super(embeddings, {});
    this.chromaStore = chromaStore;
    this.collectionName = collectionName;
  }
  
  async addDocuments(documents: Document[]): Promise<void> {
    await this.chromaStore.addDocuments(this.collectionName, documents);
  }
  
  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    // ChromaDBは内部でエンベディングを処理するため、このメソッドは使用しない
    await this.addDocuments(documents);
  }
  
  async similaritySearch(query: string, k?: number): Promise<Document[]> {
    return await this.chromaStore.similaritySearch(this.collectionName, query, k);
  }
  
  async similaritySearchWithScore(
    query: string,
    k?: number
  ): Promise<[Document, number][]> {
    const docs = await this.similaritySearch(query, k);
    return docs.map(doc => [doc, doc.metadata.score || 0]);
  }
  
  async similaritySearchVectorWithScore(
    query: number[],
    k: number
  ): Promise<[Document, number][]> {
    // ベクトル検索は現在未実装（必要に応じて実装）
    console.warn('similaritySearchVectorWithScore is not implemented for ChromaDB direct');
    return [];
  }
  
  _vectorstoreType(): string {
    return 'chromadb-direct';
  }

  // 統計情報取得メソッドを追加
  async getStats(): Promise<VectorStoreStats> {
    try {
      const stats = await this.chromaStore.getCollectionStats(this.collectionName);
      return {
        totalDocuments: stats?.count || 0,
        collectionName: this.collectionName,
        storeType: 'chromadb-direct'
      };
    } catch (error) {
      console.error('Failed to get ChromaDB stats:', error);
      return {
        totalDocuments: 0,
        collectionName: this.collectionName,
        storeType: 'chromadb-direct'
      };
    }
  }
}

export class VectorStoreFactory {
  private static memoryStores: Map<string, MemoryVectorStore> = new Map();
  private static chromaClient: DirectChromaStore | null = null;

  static async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    const vectorStoreType = process.env.VECTOR_STORE || 'chromadb';
    
    if (vectorStoreType === 'memory') {
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    } else if (vectorStoreType === 'pinecone') {
      return this.createPineconeStoreFromDocuments(docs, embeddings, config);
    } else {
      return this.createChromaStoreFromDocuments(docs, embeddings, config);
    }
  }

  // 統計情報取得メソッドを追加
  static async getVectorStoreStats(
    vectorStore: VectorStore,
    stakeholderId: string
  ): Promise<VectorStoreStats> {
    const storeType = vectorStore._vectorstoreType();
    
    switch (storeType) {
      case 'chromadb-direct':
        // ChromaVectorStoreWrapperにgetStats()メソッドを追加する必要がある
        const chromaWrapper = vectorStore as ChromaVectorStoreWrapper;
        return await chromaWrapper.getStats();
        
      case 'pinecone':
        // Pineconeの場合
        const pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY!,
        });
        const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
        const index = pinecone.index(indexName);
        const stats = await index.describeIndexStats();
        
        return {
          totalDocuments: stats.namespaces?.[stakeholderId]?.recordCount || 0,
          collectionName: stakeholderId,
          storeType: 'pinecone'
        };
        
      case 'memory':
        // メモリストアの場合（概算）
        return {
          totalDocuments: 20,
          collectionName: `ssr_${stakeholderId}`,
          storeType: 'memory'
        };
        
      default:
        return {
          totalDocuments: 10,
          collectionName: 'unknown',
          storeType: 'unknown'
        };
    }
  }

  private static async createMemoryStoreFromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    const storeKey = `ssr_${config.stakeholderId}`;
    
    console.log(`Creating memory store for ${storeKey} with ${docs.length} documents`);
    
    // 既存のストアがあれば削除
    if (this.memoryStores.has(storeKey)) {
      this.memoryStores.delete(storeKey);
    }
    
    const store = await MemoryVectorStore.fromDocuments(docs, embeddings);
    this.memoryStores.set(storeKey, store);
    
    // グローバルストレージにも保存
    const globalStores = (global as any).vectorStores || new Map();
    (global as any).vectorStores = globalStores;
    globalStores.set(storeKey, store);
    
    console.log(`Memory store created successfully`);
    return store;
  }

  private static async createChromaStoreFromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    const collectionName = `ssr_${config.stakeholderId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    
    console.log(`Creating ChromaDB store for collection: ${collectionName}`);
    console.log(`Number of documents: ${docs.length}`);
    
    if (docs.length === 0) {
      throw new Error('No documents to store');
    }
    
    try {
      // ChromaDB直接クライアントの初期化（シングルトン）
      if (!this.chromaClient) {
        this.chromaClient = new DirectChromaStore(embeddings);
        const isConnected = await this.chromaClient.testConnection();
        if (!isConnected) {
          throw new Error('Failed to connect to ChromaDB');
        }
      }
      
      // 既存のコレクションを削除（リセット）
      await this.chromaClient.deleteCollection(collectionName);
      
      // ドキュメントを追加
      await this.chromaClient.addDocuments(collectionName, docs);
      
      // ラッパーを返す
      const wrapper = new ChromaVectorStoreWrapper(
        embeddings,
        collectionName,
        this.chromaClient
      );
      
      console.log('ChromaDB store created successfully');
      return wrapper;
      
    } catch (error) {
      console.error('Error with ChromaDB store:', error);
      console.log('Falling back to memory store...');
      process.env.VECTOR_STORE = 'memory';
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    }
  }

  private static async createPineconeStoreFromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    console.log(`Creating Pinecone store for stakeholder: ${config.stakeholderId}`);
    console.log(`Number of documents: ${docs.length}`);

    if (!process.env.PINECONE_API_KEY) {
      console.error('PINECONE_API_KEY is not set. Falling back to memory store.');
      process.env.VECTOR_STORE = 'memory';
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    }

    try {
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
      
      const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
      const pineconeIndex = pinecone.index(indexName);
      
      // 既存のドキュメントをクリア（オプション）
      if (process.env.CLEAR_VECTOR_STORE === 'true') {
        try {
          await pineconeIndex.namespace(config.stakeholderId).deleteAll();
        } catch (error) {
          console.log('Namespace might not exist yet, continuing...');
        }
      }
      
      const vectorStore = await PineconeStore.fromDocuments(docs, embeddings, {
        pineconeIndex,
        namespace: config.stakeholderId,
      });
      
      console.log('Pinecone store created successfully');
      return vectorStore;
      
    } catch (error) {
      console.error('Error with Pinecone store:', error);
      console.log('Falling back to memory store...');
      process.env.VECTOR_STORE = 'memory';
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    }
  }
}