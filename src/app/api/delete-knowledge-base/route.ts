// src/app/api/delete-knowledge-base/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { generateNamespace } from '@/lib/browser-id';

// 指定されたステークホルダーのPineconeネームスペースを削除
export async function DELETE(request: NextRequest) {
  try {
    const { stakeholderId, userIdentifier, browserId } = await request.json();

    // 入力検証
    if (!stakeholderId) {
      return NextResponse.json(
        { error: 'Stakeholder ID is required' },
        { status: 400 }
      );
    }

    const identifier = userIdentifier || browserId;
    
    if (!identifier) {
      return NextResponse.json(
        { error: 'User identifier is required' },
        { status: 400 }
      );
    }

    // ネームスペースを生成
    const namespace = generateNamespace(stakeholderId, identifier);
    
    console.log(`Deleting knowledge base for namespace: ${namespace}`);

    // ベクトルストアタイプを確認
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    
    if (vectorStoreType === 'pinecone') {
      // Pinecone APIキーの確認
      if (!process.env.PINECONE_API_KEY) {
        return NextResponse.json(
          { error: 'Pinecone API key is not configured' },
          { status: 500 }
        );
      }

      try {
        // Pineconeクライアントの初期化
        const pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY,
        });
        
        const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
        const pineconeIndex = pinecone.index(indexName);
        
        // ネームスペース内のすべてのベクトルを削除
        console.log(`Deleting all vectors in namespace: ${namespace}`);
        try {
          await pineconeIndex.namespace(namespace).deleteAll();
        } catch (deleteError: unknown) {
          let errorMessage = '';
          if (typeof deleteError === 'object' && deleteError !== null && 'message' in deleteError) {
            errorMessage = (deleteError as { message: string }).message;
          } else if (deleteError) {
            errorMessage = deleteError.toString();
          }

          if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
            console.log(`Namespace ${namespace} is already empty or doesn't exist, treating as success`);
            return NextResponse.json({
              success: true,
              message: 'データは既に削除されているか、存在しません',
              namespace: namespace,
              wasAlreadyEmpty: true,
              remainingVectors: 0
            });
          }
          // その他のエラーは再スロー
          throw deleteError;
        }
        
        // 削除の反映を待つ
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 削除後の統計情報を取得
        const stats = await pineconeIndex.describeIndexStats();
        const remainingVectors = stats.namespaces?.[namespace]?.recordCount || 0;
        
        console.log(`Deletion complete. Remaining vectors in ${namespace}: ${remainingVectors}`);
        
        return NextResponse.json({
          success: true,
          message: `Knowledge base deleted successfully`,
          namespace: namespace,
          remainingVectors: remainingVectors,
          totalVectorsInIndex: stats.totalRecordCount
        });
        
      } catch (pineconeError) {
        console.error('Pinecone deletion error:', pineconeError);
        return NextResponse.json(
          { 
            error: 'Failed to delete from Pinecone',
            details: pineconeError instanceof Error ? pineconeError.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
      
    } else if (vectorStoreType === 'memory') {
      // メモリストアの場合
      try {
        // グローバルストレージから削除
        const storeKey = `ssr_${namespace.replace(/-/g, '_')}`;
        const globalStores: Map<string, unknown> = 
          (global as { vectorStores?: Map<string, unknown> }).vectorStores || new Map();
        
        if (globalStores.has(storeKey)) {
          globalStores.delete(storeKey);
          console.log(`Deleted memory store: ${storeKey}`);
          
          return NextResponse.json({
            success: true,
            message: 'Memory store deleted successfully',
            namespace: namespace,
            storeKey: storeKey
          });
        } else {
          return NextResponse.json({
            success: true,
            message: 'No memory store found to delete',
            namespace: namespace,
            storeKey: storeKey
          });
        }
        
      } catch (memoryError) {
        console.error('Memory store deletion error:', memoryError);
        return NextResponse.json(
          { 
            error: 'Failed to delete memory store',
            details: memoryError instanceof Error ? memoryError.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
      
    } else {
      return NextResponse.json(
        { error: 'Unknown vector store type' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Knowledge base deletion error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete knowledge base',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET メソッドで現在のデータ統計を取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stakeholderId = searchParams.get('stakeholderId');
    const userIdentifier = searchParams.get('userIdentifier') || searchParams.get('browserId');

    if (!stakeholderId || !userIdentifier) {
      return NextResponse.json(
        { error: 'Stakeholder ID and User Identifier are required' },
        { status: 400 }
      );
    }

    const namespace = generateNamespace(stakeholderId, userIdentifier);
    const vectorStoreType = process.env.VECTOR_STORE || 'pinecone';
    
    if (vectorStoreType === 'pinecone' && process.env.PINECONE_API_KEY) {
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });
      
      const indexName = process.env.PINECONE_INDEX_NAME || 'ssr-index';
      const pineconeIndex = pinecone.index(indexName);
      const stats = await pineconeIndex.describeIndexStats();
      
      return NextResponse.json({
        namespace: namespace,
        vectorCount: stats.namespaces?.[namespace]?.recordCount || 0,
        totalVectors: stats.totalRecordCount,
        allNamespaces: Object.keys(stats.namespaces || {})
      });
    }
    
    return NextResponse.json({
      namespace: namespace,
      vectorCount: 0,
      storeType: vectorStoreType
    });
    
  } catch (error) {
    console.error('Stats retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}