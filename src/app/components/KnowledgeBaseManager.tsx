// src/components/KnowledgeBaseManager.tsx
// 知識ベース管理用の専用コンポーネント

import { useState, useEffect, useCallback, useRef } from 'react';
import { FiDatabase, FiCheckCircle, FiLoader, FiTrash2, FiFile, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { Stakeholder } from '@/types';
import { useI18n } from './I18nProvider';

interface FileInfo {
  fileName: string;
  uploadedAt: string | null;
  chunkCount: number;
}

interface KnowledgeBaseManagerProps {
  stakeholder: Stakeholder | null;
  userIdentifier: string;
  filesCount: number;
  // 外部から制御する状態
  status: 'idle' | 'building' | 'ready' | 'error';
  isBuilding: boolean;
  isDeleting: boolean;
  // 外部のアクション
  onBuild: () => void;
  onDelete: () => void;
}

export function KnowledgeBaseManager({
  stakeholder,
  userIdentifier,
  filesCount,
  status,
  isBuilding,
  isDeleting,
  onBuild,
  onDelete,
}: KnowledgeBaseManagerProps) {
  const { language, t } = useI18n();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [vectorCount, setVectorCount] = useState<number | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [recentlyDeleted, setRecentlyDeleted] = useState(false);

  // テキスト
  const texts = {
    title: language === 'en' ? 'Knowledge Base' : '知識ベース',
    notBuilt: language === 'en' ? 'Not built' : '未構築',
    building: language === 'en' ? 'Building...' : '構築中...',
    ready: language === 'en' ? 'Ready' : '準備完了',
    error: language === 'en' ? 'Error' : 'エラー',
    deleting: language === 'en' ? 'Deleting...' : '削除中...',
    vectors: language === 'en' ? 'vectors' : 'ベクトル',
    stakeholderLabel: language === 'en' ? 'Stakeholder' : 'ステークホルダー',
    buildKnowledgeBase: language === 'en' ? 'Build' : '構築',
    rebuildKnowledgeBase: language === 'en' ? 'Rebuild' : '再構築',
    resetKnowledgeBase: language === 'en' ? 'Reset' : 'リセット',
    registeredFiles: language === 'en' ? 'Registered Files' : '登録済みファイル',
    filesCount: language === 'en' ? 'files' : '件',
    noFiles: language === 'en' ? 'No registered files' : '登録済みファイルなし',
    uploadedAt: language === 'en' ? 'Uploaded' : 'アップロード',
    unknownDate: language === 'en' ? 'Unknown date' : '日時不明',
    loadingFiles: language === 'en' ? 'Loading files...' : 'ファイル読み込み中...',
    checking: language === 'en' ? 'Checking...' : '確認中...',
    needsFiles: language === 'en' ? 'Upload files first' : 'ファイルをアップロードしてください',
    description: language === 'en' 
      ? 'Knowledge base extracts relevant information from your documents.'
      : '知識ベースはドキュメントから関連情報を抽出します。',
    syncDelayNotice: language === 'en'
      ? '* Changes may take a moment to reflect.'
      : '※ 反映に少し時間がかかることがあります。',
  };

  // 既存のベクトル数をチェック
  const checkVectorCount = useCallback(async () => {
    if (!stakeholder || !userIdentifier) return;
    
    try {
      const response = await fetch(
        `/api/delete-knowledge-base?stakeholderId=${stakeholder.id}&userIdentifier=${userIdentifier}`,
        { method: 'GET' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setVectorCount(data.vectorCount || 0);
      } else {
        setVectorCount(0);
      }
    } catch (error) {
      console.error('Failed to check knowledge base:', error);
      setVectorCount(0);
    } finally {
      setInitialCheckDone(true);
    }
  }, [stakeholder, userIdentifier]);

  // ファイル一覧を取得
  const fetchFiles = useCallback(async () => {
    if (!stakeholder || !userIdentifier) return;
    
    setLoadingFiles(true);
    try {
      const response = await fetch(
        `/api/list-knowledge-files?stakeholderId=${stakeholder.id}&userIdentifier=${userIdentifier}`,
        { method: 'GET' }
      );
      
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setLoadingFiles(false);
    }
  }, [stakeholder, userIdentifier]);

  // ステークホルダーが変更されたらリセット
  useEffect(() => {
    setFiles([]);
    setShowFiles(false);
    setVectorCount(null);
    setInitialCheckDone(false);
    setRecentlyDeleted(false);
    if (stakeholder && userIdentifier) {
      checkVectorCount();
      fetchFiles(); // 初回にファイル一覧も取得
    }
  }, [stakeholder, userIdentifier, checkVectorCount, fetchFiles]);

  // statusがreadyに変わったらベクトル数を再取得
  useEffect(() => {
    if (status === 'ready' && stakeholder && userIdentifier) {
      checkVectorCount();
      setFiles([]); // ファイル一覧をリセットして再取得を促す
      fetchFiles(); // 再取得
    }
  }, [status, stakeholder, userIdentifier, checkVectorCount, fetchFiles]);

  // 削除完了時（statusがidleに戻った時）にファイル一覧をクリア
  useEffect(() => {
    if (status === 'idle') {
      setFiles([]);
      setVectorCount(null);
      // 再度チェックしてファイル一覧を更新
      if (stakeholder && userIdentifier) {
        checkVectorCount();
        fetchFiles();
      }
    }
  }, [status, stakeholder, userIdentifier, checkVectorCount, fetchFiles]);

  // 削除中から削除完了への遷移を検知
  const prevIsDeletingRef = useRef(isDeleting);
  useEffect(() => {
    if (prevIsDeletingRef.current && !isDeleting) {
      // 削除が完了した
      setRecentlyDeleted(true);
      // 10秒後にフラグをリセット
      const timer = setTimeout(() => {
        setRecentlyDeleted(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
    prevIsDeletingRef.current = isDeleting;
  }, [isDeleting]);

  // ファイル一覧を展開したときにファイルを取得
  useEffect(() => {
    if (showFiles && files.length === 0 && initialCheckDone) {
      fetchFiles();
    }
  }, [showFiles, files.length, initialCheckDone, fetchFiles]);

  // 日付をフォーマット
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return texts.unknownDate;
    try {
      const date = new Date(dateString);
      return date.toLocaleString(language === 'en' ? 'en-US' : 'ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return texts.unknownDate;
    }
  };

  // stakeholderが未選択の場合は非表示
  if (!stakeholder) {
    return null;
  }

  const hasExistingData = vectorCount !== null && vectorCount > 0;
  // チェック完了後は常にファイルセクションを表示
  const showFileSection = initialCheckDone;

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 transition-all">
      
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-gray-700 dark:text-gray-300">
          {texts.title}
        </span>
        
        <div className="flex items-center gap-3">
          {/* ステータス表示と構築ボタン */}
          {!initialCheckDone && (
            <span className="text-base text-gray-400 flex items-center gap-1">
              <FiLoader className="w-4 h-4 animate-spin" />
              {texts.checking}
            </span>
          )}
          
          {initialCheckDone && status === 'idle' && filesCount > 0 && (
            <button
              onClick={onBuild}
              disabled={isBuilding || isDeleting}
              className="text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <FiDatabase className="w-4 h-4" />
              {texts.buildKnowledgeBase}
            </button>
          )}
          
          {status === 'building' && (
            <span className="text-base text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <FiLoader className="w-4 h-4 animate-spin" />
              {texts.building}
            </span>
          )}
          
          {status === 'ready' && (
            <>
              <span className="text-base text-green-600 dark:text-green-400 flex items-center gap-1">
                <FiCheckCircle className="w-4 h-4" />
                {texts.ready}
              </span>
              {filesCount > 0 && (
                <button
                  onClick={onBuild}
                  disabled={isBuilding || isDeleting}
                  className="text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                  title={texts.rebuildKnowledgeBase}
                >
                  <FiDatabase className="w-4 h-4" />
                  {texts.rebuildKnowledgeBase}
                </button>
              )}
            </>
          )}
          
          {status === 'error' && (
            <>
              <span className="text-base text-red-600 dark:text-red-400">
                {texts.error}
              </span>
              {filesCount > 0 && (
                <button
                  onClick={onBuild}
                  disabled={isBuilding || isDeleting}
                  className="text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <FiDatabase className="w-4 h-4" />
                  {texts.rebuildKnowledgeBase}
                </button>
              )}
            </>
          )}

          <button
            onClick={onDelete}
            disabled={isDeleting || isBuilding}
            className="text-base text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title={`${texts.resetKnowledgeBase} - ${stakeholder.role}`}
          >
            {isDeleting ? (
              <FiLoader className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FiTrash2 className="w-4 h-4" />
                {texts.resetKnowledgeBase}
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="text-base text-gray-500 dark:text-gray-400 mt-2 space-y-1">
        <p>
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {texts.stakeholderLabel}: {stakeholder.role}
          </span> 
        </p>
        <p>
          {texts.description}
        </p>
      </div>

      {/* ファイル一覧セクション */}
      {showFileSection && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              setShowFiles(!showFiles);
              if (!showFiles && files.length === 0) {
                fetchFiles();
              }
            }}
            className="flex items-center justify-between w-full text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg p-2 -mx-2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FiFile className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-base font-medium">
                {texts.registeredFiles}
                {!loadingFiles && ` (${files.length} ${texts.filesCount})`}
              </span>
            </div>
            {showFiles ? (
              <FiChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <FiChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {showFiles && (
            <div className="mt-2">
              {loadingFiles ? (
                <div className="flex items-center justify-center py-3 text-gray-500">
                  <FiLoader className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-base">{texts.loadingFiles}</span>
                </div>
              ) : files.length === 0 ? (
                <p className="text-base text-gray-500 dark:text-gray-400 py-2 text-center">
                  {texts.noFiles}
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {files.map((file, index) => (
                    <div
                      key={`${file.fileName}-${index}`}
                      className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
                    >
                      <FiFile className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-gray-800 dark:text-gray-200 truncate">
                          {file.fileName}
                        </p>
                        <p className="text-base text-gray-500 dark:text-gray-400">
                          {texts.uploadedAt}: {formatDate(file.uploadedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* 削除直後の注意メッセージ */}
              {recentlyDeleted && (
                <p className="text-base text-amber-600 dark:text-amber-400 mt-2 text-center">
                  {texts.syncDelayNotice}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}