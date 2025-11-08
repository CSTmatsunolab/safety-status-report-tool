// src/components/KnowledgeBaseManager.tsx
// 知識ベース管理用の専用コンポーネント

import { useState, useEffect, useCallback } from 'react';
import { FiDatabase, FiCheckCircle, FiLoader, FiTrash2, FiInfo } from 'react-icons/fi';
import { Stakeholder } from '@/types';

interface KnowledgeBaseManagerProps {
  stakeholder: Stakeholder | null;
  browserId: string;
  filesCount: number;
  onBuildComplete?: () => void;
  onDeleteComplete?: () => void;
}

export function KnowledgeBaseManager({
  stakeholder,
  browserId,
  filesCount,
  onBuildComplete,
  onDeleteComplete
}: KnowledgeBaseManagerProps) {
  const [status, setStatus] = useState<'idle' | 'building' | 'ready' | 'error' | 'deleting'>('idle');
  const [stats, setStats] = useState<{ vectorCount: number } | null>(null);
  const [showStats, setShowStats] = useState(false);

  // 既存の知識ベースをチェック
  const checkExistingKnowledgeBase = useCallback(async () => {
    if (!stakeholder || !browserId) return;
    
    try {
      const response = await fetch(
        `/api/delete-knowledge-base?stakeholderId=${stakeholder.id}&browserId=${browserId}`,
        { method: 'GET' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        if (data.vectorCount > 0) {
          setStatus('ready');
        }
      }
    } catch (error) {
      console.error('Failed to check knowledge base:', error);
    }
  }, [stakeholder, browserId]);

    // ステークホルダーが変更されたらステータスをリセット
  useEffect(() => {
    setStatus('idle');
    setStats(null);
    if (stakeholder && browserId) {
      checkExistingKnowledgeBase();
    }
  }, [stakeholder, browserId, checkExistingKnowledgeBase]);
  
  // 知識ベースを構築
  const buildKnowledgeBase = async () => {
    if (!stakeholder || filesCount === 0) return;
    
    setStatus('building');
    
    try {
      const response = await fetch('/api/build-knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [], // 実際のファイルデータは親コンポーネントから渡す
          stakeholderId: stakeholder.id,
          browserId: browserId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Knowledge base building failed');
      }
      
      const result = await response.json();
      console.log('Knowledge base built:', result);
      
      setStatus('ready');
      await checkExistingKnowledgeBase();
      onBuildComplete?.();
      
    } catch (error) {
      console.error('Knowledge base building error:', error);
      setStatus('error');
      alert('知識ベースの構築に失敗しました。');
    }
  };

  // 知識ベースを削除
  const deleteKnowledgeBase = async () => {
    if (!stakeholder) return;
    
    const namespace = `${stakeholder.id}_${browserId.substring(0, 8)}...`;
    const vectorCount = stats?.vectorCount || 0;
    
    const confirmMessage = 
      `【知識ベース削除の確認】\n\n` +
      `ステークホルダー: ${stakeholder.role}\n` +
      `ネームスペース: ${namespace}\n` +
      `ベクトル数: ${vectorCount.toLocaleString()}\n\n` +
      `この操作は取り消せません。本当に削除しますか？`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    setStatus('deleting');
    
    try {
      const response = await fetch('/api/delete-knowledge-base', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeholderId: stakeholder.id,
          browserId: browserId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Knowledge base deletion failed');
      }
      
      const result = await response.json();
      console.log('Knowledge base deleted:', result);
      
      setStatus('idle');
      setStats(null);
      onDeleteComplete?.();
      
      alert(
        `削除が完了しました。\n\n` +
        `削除されたネームスペース: ${result.namespace}\n` +
        `残りのベクトル数: ${result.remainingVectors}`
      );
      
    } catch (error) {
      console.error('Knowledge base deletion error:', error);
      setStatus('ready'); // エラー時は元の状態に戻す
      alert('知識ベースの削除に失敗しました。');
    }
  };

  if (!stakeholder || filesCount === 0) {
    return null;
  }

  const namespace = `${stakeholder.id}_${browserId.substring(0, 8)}...`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
          知識ベース管理
        </h3>
        
        <div className="flex items-center gap-2">
          {/* ステータス表示 */}
          {status === 'idle' && (
            <span className="text-gray-500">未構築</span>
          )}
          {status === 'building' && (
            <>
              <FiLoader className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-blue-500">構築中...</span>
            </>
          )}
          {status === 'ready' && (
            <>
              <FiCheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-500">
                準備完了
                {stats && ` (${stats.vectorCount.toLocaleString()}ベクトル)`}
              </span>
            </>
          )}
          {status === 'error' && (
            <span className="text-red-500">エラー</span>
          )}
          {status === 'deleting' && (
            <>
              <FiLoader className="w-5 h-5 animate-spin text-red-500" />
              <span className="text-red-500">削除中...</span>
            </>
          )}
          
          {/* 情報ボタン */}
          {stats && (
            <button
              onClick={() => setShowStats(!showStats)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="詳細情報"
            >
              <FiInfo className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* 詳細情報 */}
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <p>
          <span className="font-medium">ネームスペース:</span> {namespace}
        </p>
        <p>
          <span className="font-medium">ステークホルダー:</span> {stakeholder.role}
        </p>
        
        {showStats && stats && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded">
            <p>
              <span className="font-medium">ベクトル数:</span> {stats.vectorCount.toLocaleString()}
            </p>
            <p className="mt-1 text-xs">
              このブラウザ専用のデータ空間です。他のユーザーやブラウザとは完全に分離されています。
            </p>
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className="mt-4 space-y-2">
        {status === 'idle' && (
          <button
            onClick={buildKnowledgeBase}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            <FiDatabase className="w-5 h-5" />
            知識ベースを構築
          </button>
        )}
        
        {status === 'ready' && (
          <>
            <button
              onClick={buildKnowledgeBase}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <FiDatabase className="w-5 h-5" />
              知識ベースを再構築
            </button>
            
            <button
              onClick={deleteKnowledgeBase}
              className="w-full px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
            >
              <FiTrash2 className="w-5 h-5" />
              RAG知識ベースをリセット
            </button>
          </>
        )}
        
        {status === 'error' && (
          <>
            <button
              onClick={buildKnowledgeBase}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <FiDatabase className="w-5 h-5" />
              知識ベースを再構築
            </button>
            
            <button
              onClick={deleteKnowledgeBase}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              <FiTrash2 className="w-5 h-5" />
              クリア
            </button>
          </>
        )}
      </div>
    </div>
  );
}