import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { VectorStore } from '@langchain/core/vectorstores';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { generateNamespace } from './browser-id';

export interface VectorStoreConfig {
  stakeholderId: string;
  embeddings: Embeddings;
  browserId?: string;
}

// ベクトルストア統計情報のインターフェース
export interface VectorStoreStats {
  totalDocuments: number;
  collectionName: string;
  storeType: string;
  namespace: string;
}

export class VectorStoreFactory {
  private static memoryStores: Map<string, MemoryVectorStore> = new Map();

  static async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    // デフォルトをpineconeに設定
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    
    if (vectorStoreType === 'memory') {
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    } else {
      // デフォルトはPinecone
      return this.createPineconeStoreFromDocuments(docs, embeddings, config);
    }
  }

  static async getExistingStore(
    embeddings: Embeddings,
    stakeholderId: string,
    browserId?: string // ブラウザIDパラメータを追加
  ): Promise<VectorStore | null> {
    // デフォルトをpineconeに設定
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    
    // ブラウザIDを使用してユニークなネームスペースを生成
    const namespace = generateNamespace(stakeholderId, browserId);
    
    if (vectorStoreType === 'pinecone') {
      try {
        const pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY!,
        });
        
        const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
        const pineconeIndex = pinecone.index(indexName);
        
        console.log(`Getting existing Pinecone store with namespace: ${namespace}`);
        
        return await PineconeStore.fromExistingIndex(
          embeddings,
          {
            pineconeIndex,
            namespace: namespace, // ユニークなネームスペースを使用
          }
        );
      } catch (error) {
        console.error('Failed to connect to existing Pinecone store:', error);
        return null;
      }
    }
    
    // メモリストアの場合
    const storeKey = `ssr_${namespace}`;
    return this.memoryStores.get(storeKey) || null;
  }

  // 統計情報取得メソッド
  static async getVectorStoreStats(
    vectorStore: VectorStore,
    stakeholderId: string,
    browserId?: string // ブラウザIDパラメータを追加
  ): Promise<VectorStoreStats> {
    const storeType = vectorStore._vectorstoreType();
    const namespace = generateNamespace(stakeholderId, browserId);
    
    switch (storeType) {
      case 'pinecone':
        try {
          // Pineconeの場合
          const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!,
          });
          const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
          const index = pinecone.index(indexName);
          const stats = await index.describeIndexStats();
          
          return {
            totalDocuments: stats.namespaces?.[namespace]?.recordCount || 0,
            collectionName: namespace,
            storeType: 'pinecone',
            namespace: namespace
          };
        } catch (error) {
          console.error('Failed to get Pinecone stats:', error);
          return {
            totalDocuments: 0,
            collectionName: namespace,
            storeType: 'pinecone',
            namespace: namespace
          };
        }
        
      case 'memory':
        // メモリストアの場合
        return {
          totalDocuments: 20, // 概算値
          collectionName: `ssr_${namespace}`,
          storeType: 'memory',
          namespace: namespace
        };
        
      default:
        return {
          totalDocuments: 10,
          collectionName: 'unknown',
          storeType: 'unknown',
          namespace: namespace
        };
    }
  }

  private static async createMemoryStoreFromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    // ユニークなネームスペースを生成
    const namespace = generateNamespace(config.stakeholderId, config.browserId);
    const storeKey = `ssr_${namespace}`;
    
    console.log(`Creating memory store for namespace: ${namespace}`);
    console.log(`Store key: ${storeKey}`);
    console.log(`Number of documents: ${docs.length}`);
    
    // 既存のストアがあれば削除
    if (this.memoryStores.has(storeKey)) {
      console.log(`Deleting existing memory store for ${storeKey}`);
      this.memoryStores.delete(storeKey);
    }
    
    const store = await MemoryVectorStore.fromDocuments(docs, embeddings);
    this.memoryStores.set(storeKey, store);
    
    // グローバルストレージにも保存（Next.jsのホットリロード対策）
    const globalStores: Map<string, unknown> = 
      (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
    (global as { vectorStores?: Map<string, unknown> }).vectorStores = globalStores;
    globalStores.set(storeKey, store);
    
    console.log(`Memory store created successfully with namespace: ${namespace}`);
    return store;
  }

  private static async createPineconeStoreFromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: VectorStoreConfig
  ): Promise<VectorStore> {
    // ユニークなネームスペースを生成
    const namespace = generateNamespace(config.stakeholderId, config.browserId);
    
    console.log(`Creating Pinecone store with configuration:`);
    console.log(`- Namespace: ${namespace}`);
    console.log(`- StakeholderId: ${config.stakeholderId}`);
    console.log(`- BrowserId: ${config.browserId || 'auto-generated'}`);
    console.log(`- Number of documents: ${docs.length}`);

    if (!process.env.PINECONE_API_KEY) {
      console.error('PINECONE_API_KEY is not set. Falling back to memory store.');
      process.env.VECTOR_STORE = 'memory';
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    }

    if (!process.env.PINECONE_INDEX_NAME) {
      console.warn('PINECONE_INDEX_NAME is not set. Using default: ssr-index');
    }

    try {
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
      
      const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
      
      // インデックスの存在確認
      try {
        const indexList = await pinecone.listIndexes();
        const indexExists = indexList.indexes?.some(idx => idx.name === indexName);
        
        if (!indexExists) {
          console.error(`Pinecone index "${indexName}" does not exist.`);
          console.log('Available indexes:', indexList.indexes?.map(idx => idx.name).join(', '));
          throw new Error(`Index ${indexName} not found`);
        }
      } catch (listError) {
        console.error('Failed to list Pinecone indexes:', listError);
      }
      
      const pineconeIndex = pinecone.index(indexName);
      
      // 既存のネームスペースをクリア
      if (process.env.CLEAR_NAMESPACE_BEFORE_INSERT === 'true') {
        try {
          console.log(`Clearing existing vectors in namespace: ${namespace}`);
          await pineconeIndex.namespace(namespace).deleteAll();
          await new Promise(resolve => setTimeout(resolve, 1000)); // 削除の反映を待つ
        } catch (deleteError) {
          console.warn('Failed to clear namespace:', deleteError);
        }
      }
      
      // ドキュメントをPineconeに保存
      const vectorStore = await PineconeStore.fromDocuments(docs, embeddings, {
        pineconeIndex,
        namespace: namespace, // ユニークなネームスペースを使用
      });
      
      console.log(`Pinecone store created successfully with namespace: ${namespace}`);
      
      // インデックスの統計情報を表示
      try {
        const stats = await pineconeIndex.describeIndexStats();
        console.log('Pinecone index stats after insertion:');
        console.log(`- Total vectors: ${stats.totalRecordCount}`);
        console.log(`- Namespace "${namespace}" vectors: ${stats.namespaces?.[namespace]?.recordCount || 0}`);
      } catch (statsError) {
        console.warn('Failed to get index stats:', statsError);
      }
      
      // Pineconeのインデックス更新を待つ
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return vectorStore;
      
    } catch (error) {
      console.error('Error with Pinecone store:', error);
      
      // エラーの詳細をログ出力
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      console.log('Falling back to memory store...');
      process.env.VECTOR_STORE = 'memory';
      return this.createMemoryStoreFromDocuments(docs, embeddings, config);
    }
  }

  /**
   * すべてのメモリストアをクリア
   */
  static clearAllMemoryStores(): void {
    console.log(`Clearing ${this.memoryStores.size} memory stores`);
    this.memoryStores.clear();
    
    // グローバルストレージもクリア
    if ((global as { vectorStores?: Map<string, unknown> }).vectorStores) {
      (global as { vectorStores?: Map<string, unknown> }).vectorStores!.clear();
    }
  }

  /**
   * 特定のステークホルダーのメモリストアをクリア
   */
  static clearMemoryStore(stakeholderId: string, browserId?: string): void {
    const namespace = generateNamespace(stakeholderId, browserId);
    const storeKey = `ssr_${namespace}`;
    
    console.log(`Clearing memory store for ${storeKey}`);
    this.memoryStores.delete(storeKey);
    
    // グローバルストレージからも削除
    if ((global as { vectorStores?: Map<string, unknown> }).vectorStores) {
      (global as { vectorStores?: Map<string, unknown> }).vectorStores!.delete(storeKey);
    }
  }

  /**
   * デバッグ情報を取得
   */
  static getDebugInfo(): {
    memoryStores: string[];
    vectorStoreType: string;
    pineconeConfigured: boolean;
  } {
    return {
      memoryStores: Array.from(this.memoryStores.keys()),
      vectorStoreType: process.env.VECTOR_STORE || 'pinecone', // デフォルトはpinecone
      pineconeConfigured: !!process.env.PINECONE_API_KEY
    };
  }
}