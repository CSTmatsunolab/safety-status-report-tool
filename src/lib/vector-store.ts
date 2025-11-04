import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { VectorStore } from '@langchain/core/vectorstores';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';

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

export class VectorStoreFactory {
  private static memoryStores: Map<string, MemoryVectorStore> = new Map();

  static async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone'; // デフォルトを 'pinecone' に変更
    
    if (vectorStoreType === 'memory') {
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    } else {
      return this.createPineconeStoreFromDocuments(docs, embeddings, config);
    }
  }

  static async getExistingStore(
    embeddings: Embeddings,
    stakeholderId: string
  ): Promise<VectorStore | null> {
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone'; // デフォルトを 'pinecone' に変更
    
    if (vectorStoreType === 'pinecone') {
      try {
        const pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY!,
        });
        
        const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
        const pineconeIndex = pinecone.index(indexName);
        
        return await PineconeStore.fromExistingIndex(
          embeddings,
          {
            pineconeIndex,
            namespace: stakeholderId,
          }
        );
      } catch (error) {
        console.error('Failed to connect to existing Pinecone store:', error);
        return null;
      }
    }
    
    // メモリストアの場合
    const storeKey = `ssr_${stakeholderId}`;
    return this.memoryStores.get(storeKey) || null;
  }

  // 統計情報取得メソッド
  static async getVectorStoreStats(
    vectorStore: VectorStore,
    stakeholderId: string
  ): Promise<VectorStoreStats> {
    const storeType = vectorStore._vectorstoreType();
    
    switch (storeType) {
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
        // メモリストアの場合
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
    const globalStores: Map<string, unknown> = 
      (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
    (global as { vectorStores?: Map<string, unknown> }).vectorStores = globalStores;
    globalStores.set(storeKey, store);
    
    console.log(`Memory store created successfully`);
    return store;
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
      
      const vectorStore = await PineconeStore.fromDocuments(docs, embeddings, {
        pineconeIndex,
        namespace: config.stakeholderId,
      });
      
      console.log('Pinecone store created successfully');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return vectorStore;
      
    } catch (error) {
      console.error('Error with Pinecone store:', error);
      console.log('Falling back to memory store...');
      process.env.VECTOR_STORE = 'memory';
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    }
  }
}