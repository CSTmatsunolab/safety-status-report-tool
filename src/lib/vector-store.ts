import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { VectorStore } from '@langchain/core/vectorstores';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';

export interface VectorStoreConfig {
  stakeholderId: string;
  embeddings: Embeddings;
}

export class VectorStoreFactory {
  private static memoryStores: Map<string, MemoryVectorStore> = new Map();

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
    
    console.log(`Memory store created successfully`);
    return store;
  }

  private static async createChromaStoreFromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    const collectionName = `ssr_${config.stakeholderId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    
    console.log(`Creating Chroma store for collection: ${collectionName}`);
    console.log(`Number of documents: ${docs.length}`);
    
    if (docs.length === 0) {
      throw new Error('No documents to store');
    }
    
    try {
      console.log('Attempting to create Chroma store...');
    
      const chromaStore = new Chroma(embeddings, {
        url: process.env.CHROMA_URL || 'http://localhost:8000',
        collectionName: collectionName,
      });
      
      // ドキュメントを追加
      await chromaStore.addDocuments(docs);
      
      console.log('Chroma store created and documents added successfully');
      return chromaStore as unknown as VectorStore;
      
    } catch (error) {
      console.error('Error with Chroma store:', error);
      console.log('Falling back to memory store...');
      process.env.VECTOR_STORE = 'memory';
      // エラーが発生した場合はメモリストアにフォールバック
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
        await pineconeIndex.namespace(config.stakeholderId).deleteAll();
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