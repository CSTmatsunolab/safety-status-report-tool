//src/lib/vector-store.ts
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { VectorStore } from '@langchain/core/vectorstores';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';
import { generateNamespace } from './browser-id';
import { createSparseVector, type SparseValues } from './sparse-vector-utils';

export interface VectorStoreConfig {
  stakeholderId: string;
  embeddings: Embeddings;
  userIdentifier?: string;
}

// ベクトルストア統計情報のインターフェース
export interface VectorStoreStats {
  totalDocuments: number;
  collectionName: string;
  storeType: string;
  namespace: string;
}

type PineconeUpsertRecord = {
  id: string;
  values: number[];
  sparseValues?: SparseValues;
  metadata?: RecordMetadata;
};

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
    userIdentifier?: string
  ): Promise<VectorStore | null> {
    // デフォルトをpineconeに設定
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    
    // ユーザー識別子を使用してユニークなネームスペースを生成
    const namespace = generateNamespace(stakeholderId, userIdentifier);
    
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
            namespace: namespace,
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
    userIdentifier?: string
  ): Promise<VectorStoreStats> {
    const storeType = vectorStore._vectorstoreType();
    const namespace = generateNamespace(stakeholderId, userIdentifier);
    
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
    const namespace = generateNamespace(config.stakeholderId, config.userIdentifier);
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
    
    // グローバルストレージにも保存
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
    const namespace = generateNamespace(config.stakeholderId, config.userIdentifier);
    
    console.log(`Creating Pinecone store (Hybrid) with configuration:`);
    console.log(`- Namespace: ${namespace}`);
    console.log(`- StakeholderId: ${config.stakeholderId}`);
    console.log(`- UserIdentifier: ${config.userIdentifier || 'auto-generated'}`);
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
      
      
      // アップロードするファイルの古いベクトルを削除（重複防止）
      const fileNamesToUpload = [...new Set(docs.map(doc => doc.metadata?.fileName).filter(Boolean))] as string[];
      if (fileNamesToUpload.length > 0) {
        console.log(`Deleting existing vectors for ${fileNamesToUpload.length} files to prevent duplicates...`);
        
        for (const fileName of fileNamesToUpload) {
          try {
            // ファイル名をサニタイズ（ベクトルID生成時と同じ処理）
            const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
            const idPrefix = `${namespace}_${sanitizedFileName}_`;
            
            // prefixに一致するベクトルIDを取得（ページネーションで全件取得）
            const allVectorIds: string[] = [];
            let paginationToken: string | undefined = undefined;
            
            do {
              const listResponse = await pineconeIndex.namespace(namespace).listPaginated({
                prefix: idPrefix,
                limit: 100, // Pineconeの上限は100
                paginationToken: paginationToken,
              });
              
              const ids = listResponse.vectors?.map(v => v.id).filter((id): id is string => !!id) || [];
              allVectorIds.push(...ids);
              paginationToken = listResponse.pagination?.next;
            } while (paginationToken);
            
            if (allVectorIds.length > 0) {
              // 取得したIDで削除
              await pineconeIndex.namespace(namespace).deleteMany(allVectorIds);
              console.log(`  - Deleted ${allVectorIds.length} existing vectors for: ${fileName}`);
            } else {
              console.log(`  - No existing vectors found for: ${fileName}`);
            }
          } catch (deleteError) {
            console.warn(`  - Failed to delete vectors for ${fileName}:`, deleteError);
          }
        }
        // 削除の反映を待つ
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log(`Pinecone store created successfully with namespace: ${namespace}`);
      console.log(`Generating dense vectors for ${docs.length} documents...`);
      // 1. 全ドキュメントの密ベクトルを生成
      const denseVectors = await embeddings.embedDocuments(
        docs.map(doc => doc.pageContent)
      );

      console.log(`Generating sparse vectors (async) for ${docs.length} documents...`);
      
      // Promise.all を使って疎ベクトルを並列生成
      const sparseVectors = await Promise.all(
        docs.map(doc => createSparseVector(doc.pageContent))
      );

      console.log('Preparing for upsert...');
      // 2. Upsert用のVectorオブジェクト配列を作成
      const vectors: PineconeUpsertRecord[] = [];
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        
        // 3. メタデータから不要なフィールドを除外
        const { loc, pdfBuffer, gsnValidation, ...otherMetadata } = doc.metadata;
        
        // Pineconeが受け付けるメタデータのみを保持
        const cleanMetadata: RecordMetadata = {};
        
        for (const [key, value] of Object.entries(otherMetadata)) {
          // Pineconeが受け付ける型のみを保持
          if (value === null || value === undefined) {
            continue;
          }
          
          if (typeof value === 'string' || 
              typeof value === 'number' || 
              typeof value === 'boolean') {
            cleanMetadata[key] = value;
          } else if (Array.isArray(value) && 
                    value.every(item => typeof item === 'string')) {
            cleanMetadata[key] = value;
          } else {
            // オブジェクトや他の型は文字列化
            try {
              cleanMetadata[key] = JSON.stringify(value);
            } catch (e) {
              console.warn(`Skipping metadata field ${key}: cannot serialize`);
            }
          }
        }
        
        // pageContentを追加（検索用）
        cleanMetadata.pageContent = doc.pageContent;
        
        const originalFileName = (cleanMetadata.fileName as string) || 'unknown_file';
        const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9_.-]/g, '_'); 
        const vectorId = `${namespace}_${sanitizedFileName}_${doc.metadata.chunkIndex || i}`;

        vectors.push({
          id: vectorId,
          values: denseVectors[i],
          sparseValues: sparseVectors[i],
          metadata: cleanMetadata,
        });
      }

      // 5. Pineconeに一括Upsert
      // (本番環境では、100件ずつのバッチ処理に分けることを推奨)
      console.log(`Upserting ${vectors.length} hybrid vectors to namespace "${namespace}"...`);
      await pineconeIndex.namespace(namespace).upsert(vectors);

      console.log(`Pinecone store (Hybrid) created successfully with namespace: ${namespace}`);

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
      
      return new PineconeStore(embeddings, {
        pineconeIndex,
        namespace: namespace,
      });
      
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
  static clearMemoryStore(stakeholderId: string, userIdentifier?: string): void {
    const namespace = generateNamespace(stakeholderId, userIdentifier);
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
      vectorStoreType: process.env.VECTOR_STORE || 'pinecone',
      pineconeConfigured: !!process.env.PINECONE_API_KEY
    };
  }
}