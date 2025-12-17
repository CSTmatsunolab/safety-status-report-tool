'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FileUpload } from './components/FileUpload';
import StakeholderSelect from './components/StakeholderSelect';
import ReportPreview from './components/ReportPreview';
import { SettingsMenu } from './components/SettingsMenu';
import { useI18n } from './components/I18nProvider';
import { useAuth } from './components/AuthProvider';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { getPredefinedStakeholders } from '@/lib/stakeholders';
import { FiDatabase, FiCheckCircle, FiLoader, FiTrash2 } from 'react-icons/fi';
import ReportStructureSelector from './components/ReportStructureSelector';
import { ReportStructureTemplate } from '@/types';
import { getSimpleRecommendedStructure } from '@/lib/report-structures';
import { getUserStorageKey } from '@/lib/browser-id';
import { useSectionGeneration } from '@/hooks/useSectionGeneration';

// =============================================================================
// 生成方式について
// - NEXT_PUBLIC_LAMBDA_FUNCTION_URL が設定されている場合: Lambda (ストリーミング)
// - 設定されていない場合: Next.js API (セクション分割)
// useSectionGenerationフックが自動で判定します
// =============================================================================

export default function Home() {
  const { t, language } = useI18n();
  const { getUserIdentifier, status: authStatus } = useAuth();
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState<Stakeholder | null>(null);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [isKnowledgeBaseBuilding, setIsKnowledgeBaseBuilding] = useState(false);
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [selectedStructure, setSelectedStructure] = useState<ReportStructureTemplate | null>(null);
  const [recommendedStructureId, setRecommendedStructureId] = useState<string>('');
  const [customStructures, setCustomStructures] = useState<ReportStructureTemplate[]>([]);
  const [userIdentifier, setUserIdentifier] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);

  // セクション分割生成フック
// セクション分割生成フック
  const {
    generateReport: generateReportBySection,
    isGenerating: isSectionGenerating,
    progress,
    error: sectionError,
    reset: resetSectionGeneration,
    streamingContent,  // ← 追加
  } = useSectionGeneration();


  
  // 認証状態が変わったらユーザー識別子を更新
  useEffect(() => {
    if (authStatus !== 'loading') {
      const id = getUserIdentifier();
      setUserIdentifier(id);
      console.log('User Identifier:', id, '(Auth Status:', authStatus, ')');
    }
  }, [authStatus, getUserIdentifier]);

  // 言語またはユーザー識別子が変わったらステークホルダーを更新
  useEffect(() => {
    if (!userIdentifier) return;
    
    const storageKey = getUserStorageKey('customStakeholders', userIdentifier);
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        const customStakeholders = JSON.parse(saved) as Stakeholder[];
        // カスタムステークホルダーがあるかチェック（custom_で始まるIDを持つもの）
        const hasCustom = customStakeholders.some(s => s.id.startsWith('custom_'));
        
        if (hasCustom) {
          // カスタムがある場合は、デフォルト部分だけ言語に応じて更新
          const predefined = getPredefinedStakeholders(language);
          const customOnly = customStakeholders.filter(s => s.id.startsWith('custom_'));
          setStakeholders([...predefined, ...customOnly]);
        } else {
          // 保存されているのがデフォルトのみなら言語に応じて更新
          setStakeholders(getPredefinedStakeholders(language));
        }
      } catch {
        setStakeholders(getPredefinedStakeholders(language));
      }
    } else {
      setStakeholders(getPredefinedStakeholders(language));
    }
  }, [language, userIdentifier]);

  // 言語が変わったら選択中のステークホルダーも更新
  useEffect(() => {
    if (selectedStakeholder && !selectedStakeholder.id.startsWith('custom_')) {
      // デフォルトステークホルダーの場合、言語に応じた版に更新
      const predefined = getPredefinedStakeholders(language);
      const updated = predefined.find(s => s.id === selectedStakeholder.id);
      if (updated && updated.role !== selectedStakeholder.role) {
        setSelectedStakeholder(updated);
      }
    }
  }, [language, selectedStakeholder]);

  // カスタム構成を読み込む
  useEffect(() => {
    if (!userIdentifier) return;
    
    const storageKey = getUserStorageKey('customReportStructures', userIdentifier);
    const savedStructures = localStorage.getItem(storageKey);
    if (savedStructures) {
      setCustomStructures(JSON.parse(savedStructures));
    }
  }, [userIdentifier]);

  // セクション生成エラーを監視
  useEffect(() => {
    if (sectionError) {
      setErrorMessage(sectionError);
    }
  }, [sectionError]);

  const handleFileUpload = (newFiles: UploadedFile[]) => {
    setFiles(prevFiles => {
      // 既存ファイルと新規ファイルを結合
      const allFiles = [...prevFiles, ...newFiles];
      
      // IDで重複を排除
      const uniqueMap = new Map<string, UploadedFile>();
      allFiles.forEach(file => {
        uniqueMap.set(file.id, file);
      });
      
      return Array.from(uniqueMap.values());
    });
  };

  const handleFileRemove = (id: string) => {
    setFiles(prevFiles => prevFiles.filter(f => f.id !== id));
    // ファイルが削除されたら知識ベースの状態をリセット
    setKnowledgeBaseStatus('idle');
  };
  
  const handleToggleFullText = (fileId: string, includeFullText: boolean) => {
    setFiles(prev =>
      prev.map(file => 
        file.id === fileId 
          ? { ...file, includeFullText } 
          : file
      )
    );
  };

  const handleToggleGSN = (fileId: string, isGSN: boolean) => {
    setFiles(prev =>
      prev.map(file => {
        if (file.id !== fileId) return file;
        
        const currentMetadata = file.metadata || {
          originalType: 'unknown',
          extractionMethod: 'text' as const,
          size: 0,
          userDesignatedGSN: false
        };
        
        return {
          ...file,
          type: (isGSN ? 'gsn' : 'other') as 'gsn' | 'minutes' | 'other',
          metadata: {
            ...currentMetadata,
            userDesignatedGSN: isGSN
          }
        };
      })
    );
  };

  // カスタム構成を追加する関数
  const handleAddCustomStructure = (structure: ReportStructureTemplate) => {
    const updatedStructures = [...customStructures, structure];
    setCustomStructures(updatedStructures);
    
    const storageKey = getUserStorageKey('customReportStructures', userIdentifier);
    localStorage.setItem(storageKey, JSON.stringify(updatedStructures));
  };

  const handleDeleteCustomStructure = (structureId: string) => {
    const updatedStructures = customStructures.filter(s => s.id !== structureId);
    setCustomStructures(updatedStructures);
    
    const storageKey = getUserStorageKey('customReportStructures', userIdentifier);
    localStorage.setItem(storageKey, JSON.stringify(updatedStructures));
    
    // 削除された構成が選択されていた場合はクリア
    if (selectedStructure?.id === structureId) {
      setSelectedStructure(null);
    }
  };

  // 知識ベースを構築する関数
  const buildKnowledgeBase = async (isTriggeredByReportGeneration = false) => {
    if (!selectedStakeholder || files.length === 0 || !userIdentifier) return;

    if (knowledgeBaseStatus === 'idle' && !isTriggeredByReportGeneration) {
      const confirmMessage = t('knowledgeBase.confirmBuild');
      
      if (!confirm(confirmMessage)) {
        return;
      }
    }

    setIsKnowledgeBaseBuilding(true);
    setKnowledgeBaseStatus('building');
    setErrorMessage(null);
    
    try {
      const response = await fetch('/api/build-knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files,
          stakeholderId: selectedStakeholder.id,
          userIdentifier: userIdentifier,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        // APIからのエラー詳細を取得
        let errorMsg = language === 'en' 
          ? 'Failed to build knowledge base.\n\n'
          : '知識ベースの構築に失敗しました。\n\n';
        
        if (result.error) {
          errorMsg += language === 'en' ? `Error: ${result.error}\n` : `エラー: ${result.error}\n`;
        }
        if (result.details) {
          errorMsg += language === 'en' ? `Details: ${result.details}\n` : `詳細: ${result.details}\n`;
        }
        
        // よくあるエラーに対する具体的なアドバイス
        if (result.details?.includes('quota') || result.details?.includes('Quota')) {
          errorMsg += language === 'en'
            ? '\n[Solution] Usage limit exceeded.\nEnable "Use Full Text" to generate without RAG.'
            : '\n【対処法】使用制限を超えています。\n「全文使用」をONにしてRAGを使わずに生成してください';
        } else if (result.details?.includes('timeout') || result.details?.includes('Timeout')) {
          errorMsg += language === 'en'
            ? '\n[Solution] Processing timed out.\n• Reduce file size\n• Reduce number of files'
            : '\n【対処法】処理がタイムアウトしました。\n・ファイルサイズを小さくしてください\n・ファイル数を減らしてください';
        }
        
        setErrorMessage(errorMsg);
        throw new Error(result.error || 'Knowledge base building failed');
      }
      
      console.log('Knowledge base built:', result);
      if (result.namespace) {
        console.log('Namespace used:', result.namespace);
      }
      
      // 警告がある場合は表示
      if (result.warnings && result.warnings.length > 0) {
        setWarningMessages(result.warnings);
      }
      
      setKnowledgeBaseStatus('ready');
    } catch (error) {
      console.error('Knowledge base building error:', error);
      setKnowledgeBaseStatus('error');
      
      if (!errorMessage) {
        setErrorMessage(t('knowledgeBase.buildFailed'));
      }
    } finally {
      setIsKnowledgeBaseBuilding(false);
    }
  };

  const deleteKnowledgeBase = async () => {
    if (!selectedStakeholder || !userIdentifier) return;
    
    setIsDeleting(true);
    
    try {
      // まず現在のデータ状況を確認
      let vectorCount = 0;
      let hasData = false;
      
      try {
        const statsResponse = await fetch(
          `/api/delete-knowledge-base?stakeholderId=${selectedStakeholder.id}&userIdentifier=${userIdentifier}`,
          { method: 'GET' }
        );
        
        if (statsResponse.ok) {
          const stats = await statsResponse.json();
          vectorCount = stats.vectorCount || 0;
          hasData = vectorCount > 0;
        }
      } catch (error) {
        console.log('Stats check skipped:', error);
      }
      
      let confirmMessage;
      if (hasData) {
        confirmMessage = t('knowledgeBase.confirmDelete', {
          role: selectedStakeholder.role,
          count: vectorCount.toLocaleString()
        });
      } else if (knowledgeBaseStatus === 'ready') {
        confirmMessage = t('knowledgeBase.confirmReset', {
          role: selectedStakeholder.role
        });
      } else {
        confirmMessage = t('knowledgeBase.confirmClear', {
          role: selectedStakeholder.role
        });
      }
      
      if (!confirm(confirmMessage)) {
        setIsDeleting(false);
        return;
      }
      
      // 削除実行
      const response = await fetch('/api/delete-knowledge-base', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeholderId: selectedStakeholder.id,
          userIdentifier: userIdentifier,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Knowledge base deletion failed');
      }
      
      const result = await response.json();
      if (!response.ok && !result.wasAlreadyEmpty) {
        throw new Error(result.error || 'Knowledge base deletion failed');
      }
      
      console.log('Knowledge base deleted:', result);
      
      setKnowledgeBaseStatus('idle');
      
      if (result.wasAlreadyEmpty) {
        alert(t('knowledgeBase.alreadyCleared', { role: selectedStakeholder.role }));
      } else if (hasData) {
        alert(t('knowledgeBase.deleteComplete', {
          role: selectedStakeholder.role,
          count: vectorCount.toLocaleString(),
          remaining: result.remainingVectors || 0
        }));
      } else {
        alert(t('knowledgeBase.cleared', { role: selectedStakeholder.role }));
      }
      
    } catch (error) {
      console.error('Knowledge base deletion error:', error);
      alert(t('knowledgeBase.deleteFailed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    } finally {
      setIsDeleting(false);
    }
  };

  // =============================================================================
  // レポート生成（セクション分割方式）
  // =============================================================================
  const handleGenerateReportBySection = async () => {
    if (!selectedStakeholder || !selectedStructure || !userIdentifier) return;
    
    setErrorMessage(null);
    setWarningMessages([]);
    resetSectionGeneration();
    
    // ファイルがある場合のみナレッジベース構築
    if (files.length > 0 && knowledgeBaseStatus !== 'ready') {
      await buildKnowledgeBase(true);
      if (knowledgeBaseStatus === 'error') return;
    }
    
    // 大きいファイルの確認（既存のロジックを維持）
    const LARGE_CONTENT_THRESHOLD = 50000;
    const MAX_LARGE_FULL_TEXT_FILES = 2;
    const MAX_CONTENT_CHARS_PER_FILE = 50000;

    const fullTextFiles = files.filter(f => f.includeFullText);

    const oversizedFiles = fullTextFiles.filter(f => {
      const metadata = f.metadata as { originalContentLength?: number };
      const contentLength = metadata?.originalContentLength || f.content.length;
      return contentLength > MAX_CONTENT_CHARS_PER_FILE;
    });

    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles
        .map(f => {
          const metadata = f.metadata as { originalContentLength?: number };
          const contentLength = metadata?.originalContentLength || f.content.length;
          return language === 'en'
            ? `• ${f.name} (${contentLength.toLocaleString()} chars)`
            : `・${f.name}（${contentLength.toLocaleString()}文字）`;
        })
        .join('\n');
      
      const confirmMsg = language === 'en'
        ? `[Confirmation] The following full-text files exceed 50,000 characters:\n\n${fileList}\n\nThese files will be truncated to 50,000 characters.\nContinue?`
        : `【確認】以下の全文使用ファイルは5万文字を超えています：\n\n${fileList}\n\nこれらのファイルは5万文字まで切り詰められます。\n続行しますか？`;
      
      if (!confirm(confirmMsg)) return;
    }

    const largeFullTextFiles = fullTextFiles.filter(f => {
      const metadata = f.metadata as { originalContentLength?: number; s3Key?: string };
      const contentLength = metadata?.originalContentLength || f.content.length;
      return contentLength >= LARGE_CONTENT_THRESHOLD || metadata?.s3Key;
    });

    if (largeFullTextFiles.length > MAX_LARGE_FULL_TEXT_FILES) {
      const confirmMsg = language === 'en'
        ? `[Warning] ${largeFullTextFiles.length} large files (50,000+ chars or S3 stored) are selected for full text use.\n\nTo reduce processing load, only the first ${MAX_LARGE_FULL_TEXT_FILES} will use full text.\nThe rest will use RAG to extract relevant parts.\n\nContinue?`
        : `【警告】大きなファイル（5万文字以上またはS3保存）の全文使用が${largeFullTextFiles.length}個選択されています。\n\n処理負荷を軽減するため、最初の${MAX_LARGE_FULL_TEXT_FILES}個のみが全文使用されます。\n残りのファイルはRAGで関連部分のみ抽出されます。\n\n続行しますか？`;
      
      if (!confirm(confirmMsg)) return;
    }

    // セクション分割生成を実行
    const report = await generateReportBySection({
      files,
      stakeholder: selectedStakeholder,
      reportStructure: selectedStructure,
      userIdentifier,
      language,
    });

    if (report) {
      setGeneratedReport(report);
    }
  };

// =============================================================================
  // レポート生成ハンドラー
  // useSectionGenerationフックがLambda/Next.js APIを自動判定
  // =============================================================================
  const handleGenerateReport = handleGenerateReportBySection;

  // 生成中フラグ
  const isCurrentlyGenerating = isSectionGenerating;

  const handleStakeholderSelect = (stakeholder: Stakeholder) => {
    setSelectedStakeholder(stakeholder);
    setKnowledgeBaseStatus('idle');
    setIsDeleting(false);
    
    // 推奨構成を取得して設定（言語を渡す）
    const recommended = getSimpleRecommendedStructure(
      stakeholder,
      language
    );
    setRecommendedStructureId(recommended.id);
    setSelectedStructure(recommended); // 自動選択
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white transition-colors">
            
            <Link 
              href="/" 
              className="flex items-center gap-3" 
            >
              <span>
                {t('app.title')}
              </span>
            </Link>

          </h1>
          {/* ハンバーガーメニュー（設定をまとめて配置） */}
          <SettingsMenu />
        </div>
        
        {/* メインコンテンツ - 2カラムグリッド */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
          {/* 左側：入力セクション */}
          <div className="space-y-6 mb-8 xl:mb-0">
            {/* 1. データアップロード */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 transition-all">
              <h2 className={`text-lg sm:text-xl font-semibold mb-4 transition-colors ${
                files.length > 0 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {t('steps.dataUpload')}
              </h2>
              <FileUpload 
                onUpload={handleFileUpload} 
                onRemove={handleFileRemove}
                onToggleFullText={handleToggleFullText}
                onToggleGSN={handleToggleGSN}
                files={files} 
              />
            </div>
            
            {/* 2. ステークホルダー選択 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 transition-all">
              <h2 className={`text-lg sm:text-xl font-semibold mb-4 transition-colors ${
                selectedStakeholder 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {t('steps.stakeholderSelect')}<span className="text-red-500 dark:text-red-400">*</span>
              </h2>
              <StakeholderSelect
                stakeholders={stakeholders}
                selected={selectedStakeholder}
                onSelect={handleStakeholderSelect}
              />

              {selectedStakeholder && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 transition-all">
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('knowledgeBase.title')}
                    </span>
                    
                    <div className="flex items-center gap-3">
                      {/* ステータス表示と構築ボタン */}
                      {knowledgeBaseStatus === 'idle' && files.length > 0 && (
                        <button
                          onClick={() => buildKnowledgeBase()}
                          disabled={isKnowledgeBaseBuilding || isDeleting}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <FiDatabase />
                          {t('knowledgeBase.build')}
                        </button>
                      )}
                      
                      {knowledgeBaseStatus === 'idle' && files.length === 0 && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {t('knowledgeBase.needsFiles')}
                        </span>
                      )}
                      
                      {knowledgeBaseStatus === 'building' && (
                        <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                          <FiLoader className="animate-spin" />
                          {t('knowledgeBase.building')}
                        </span>
                      )}
                      
                      {knowledgeBaseStatus === 'ready' && (
                        <>
                          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                            <FiCheckCircle />
                            {t('knowledgeBase.ready')}
                          </span>
                          {files.length > 0 && (
                            <button
                              onClick={() => buildKnowledgeBase()}
                              disabled={isKnowledgeBaseBuilding || isDeleting}
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                              title={t('knowledgeBase.rebuild')}
                            >
                              <FiDatabase />
                              {t('knowledgeBase.rebuild')}
                            </button>
                          )}
                        </>
                      )}
                      
                      {knowledgeBaseStatus === 'error' && (
                        <>
                          <span className="text-sm text-red-600 dark:text-red-400">
                            {t('knowledgeBase.error')}
                          </span>
                          {files.length > 0 && (
                            <button
                              onClick={() => buildKnowledgeBase()}
                              disabled={isKnowledgeBaseBuilding || isDeleting}
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                              title={t('knowledgeBase.retry')}
                            >
                              <FiDatabase />
                              {t('knowledgeBase.retry')}
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={deleteKnowledgeBase}
                        disabled={isDeleting || isKnowledgeBaseBuilding}
                        className="p-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`${t('knowledgeBase.dataReset')} - ${selectedStakeholder.role}`}
                      >
                        {isDeleting ? (
                          <FiLoader className="w-4 h-4 animate-spin" />
                        ) : (
                          <span className="flex items-center gap-1">
                            <FiTrash2 className="w-4 h-4" />
                            {t('knowledgeBase.dataReset')}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1">
                    <p>
                      <span className="font-medium text-gray-600 dark:text-gray-300">
                        {t('knowledgeBase.stakeholder')}: {selectedStakeholder.role}
                      </span> 
                    </p>
                    <p>
                      {t('knowledgeBase.description')}
                    </p>
                    {/* ステータスに応じた追加メッセージ */}
                    {knowledgeBaseStatus === 'idle' && files.length === 0 && (
                      <p className="text-amber-600 dark:text-amber-400">
                        {t('knowledgeBase.needsUpload')}
                      </p>
                    )}
                  </div>

                </div>
              )}
            </div>

            {/* 3. レポート構成選択 */}
            {selectedStakeholder && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 transition-all">
                <h2 className={`text-lg sm:text-xl font-semibold mb-4 transition-colors ${
                  selectedStructure 
                    ? 'text-gray-900 dark:text-white' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {t('steps.reportStructure')}
                </h2>
                <ReportStructureSelector
                  selectedStructure={selectedStructure}
                  onSelect={setSelectedStructure}
                  recommendedStructureId={recommendedStructureId}
                  customStructures={customStructures}
                  onAddCustomStructure={handleAddCustomStructure}
                  onDeleteCustomStructure={handleDeleteCustomStructure}
                  files={files}
                />
              </div>
            )}

            {/* エラーメッセージ表示 */}
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-red-800 dark:text-red-200 font-medium mb-2">
                      {language === 'en' ? 'An error occurred' : 'エラーが発生しました'}
                    </h4>
                    <pre className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{errorMessage}</pre>
                  </div>
                  <button
                    onClick={() => setErrorMessage(null)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* 警告メッセージ表示 */}
            {warningMessages.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                      {language === 'en' ? 'Warning' : '警告'}
                    </h4>
                    <ul className="text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside space-y-1">
                      {warningMessages.map((msg, index) => (
                        <li key={index}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={() => setWarningMessages([])}
                    className="text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-200"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* セクション生成進捗表示 */}
            { isSectionGenerating && progress && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-blue-800 dark:text-blue-200 font-medium mb-3">
                  {language === 'en' ? 'Generating Report...' : 'レポート生成中...'}
                </h4>
                
                {/* Lambda使用時：ストリーミング進捗表示 */}
                {progress.usingLambda && progress.status === 'generating' && (
                  <div className="space-y-3">
                    {/* スピナーとメッセージ */}
                    <div className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
                      <div className="relative">
                        <div className="w-8 h-8 border-4 border-blue-200 dark:border-blue-700 rounded-full"></div>
                        <div className="w-8 h-8 border-4 border-blue-600 dark:border-blue-400 rounded-full animate-spin absolute top-0 left-0 border-t-transparent"></div>
                      </div>
                      <div>
                        <p className="font-medium">
                          {progress.lambdaProgress?.message || 
                            (language === 'en' ? 'Processing...' : '処理中...')
                          }
                        </p>
                      </div>
                    </div>
                    
                    {/* リアルタイム進捗バー */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
                        <span>
                          {progress.lambdaProgress?.status === 'searching' && (language === 'en' ? 'Searching...' : '検索中...')}
                          {progress.lambdaProgress?.status === 'preparing' && (language === 'en' ? 'Preparing...' : '準備中...')}
                          {progress.lambdaProgress?.status === 'building' && (language === 'en' ? 'Building...' : '構築中...')}
                          {progress.lambdaProgress?.status === 'generating' && (language === 'en' ? 'Generating...' : '生成中...')}
                          {progress.lambdaProgress?.status === 'finalizing' && (language === 'en' ? 'Finalizing...' : '仕上げ中...')}
                          {!progress.lambdaProgress?.status && (language === 'en' ? 'Starting...' : '開始中...')}
                        </span>
                        <span>{progress.lambdaProgress?.percent || 0}%</span>
                      </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${progress.lambdaProgress?.percent || 0}%` }}
                        />
                      </div>
                    </div>
                    
                    {/* 処理ステップ */}
                    <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1 pt-2">
                      <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 10 ? 'opacity-100' : 'opacity-40'}>
                        {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 10 ? '✓' : '○'} {language === 'en' ? 'RAG search from knowledge base' : '知識ベースからRAG検索'}
                      </p>
                      <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 30 ? 'opacity-100' : 'opacity-40'}>
                        {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 30 ? '✓' : '○'} {language === 'en' ? 'Prepare context' : 'コンテキスト準備'}
                      </p>
                      <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 50 ? 'opacity-100' : 'opacity-40'}>
                        {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 50 ? '✓' : '○'} {language === 'en' ? 'Build prompt' : 'プロンプト構築'}
                      </p>
                      <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 60 ? 'opacity-100' : 'opacity-40'}>
                        {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 60 ? '✓' : '○'} {language === 'en' ? 'Generate report with Claude AI' : 'Claude AIでレポート生成'}
                      </p>
                      <p className={progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 90 ? 'opacity-100' : 'opacity-40'}>
                        {progress.lambdaProgress?.percent && progress.lambdaProgress.percent >= 90 ? '✓' : '○'} {language === 'en' ? 'Finalize report' : 'レポート仕上げ'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Next.js API使用時：コンテキスト準備中 */}
                {!progress.usingLambda && progress.status === 'preparing' && (
                  <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <FiLoader className="animate-spin" />
                    <span>
                      {language === 'en' 
                        ? 'Preparing context (RAG search + file loading)...'
                        : 'コンテキスト準備中（RAG検索 + ファイル読み込み）...'
                      }
                    </span>
                  </div>
                )}

                {/* Next.js API使用時：セクション生成中 */}
                {!progress.usingLambda && progress.status === 'generating' && (
                  <>
                    {/* 全体進捗バー */}
                    <div className="mb-3">
                      <div className="flex justify-between text-sm text-blue-700 dark:text-blue-300 mb-1">
                        <span>
                          {language === 'en' 
                            ? `Section ${progress.currentSection} of ${progress.totalSections}`
                            : `${progress.totalSections}セクション中 ${progress.currentSection}セクション目`
                          }
                        </span>
                        <span>{Math.round((progress.completedSections.length / progress.totalSections) * 100)}%</span>
                      </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                        <div 
                          className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(progress.completedSections.length / progress.totalSections) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* 現在生成中のセクション */}
                    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                      <FiLoader className="animate-spin" />
                      <span>
                        {language === 'en' 
                          ? `Generating: ${progress.sectionName}`
                          : `生成中: ${progress.sectionName}`
                        }
                      </span>
                    </div>

                    {/* 完了したセクション一覧 */}
                    {progress.completedSections.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                          {language === 'en' ? 'Completed:' : '完了:'}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {progress.completedSections.map((section) => (
                            <span 
                              key={section}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded text-xs"
                            >
                              <FiCheckCircle className="w-3 h-3" />
                              {section}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            
            {/* レポート生成ボタン */}
            <button
              onClick={handleGenerateReport}
              disabled={!selectedStakeholder || !selectedStructure || isCurrentlyGenerating || isKnowledgeBaseBuilding}
              className={`
                w-full py-4 sm:py-6 px-6 sm:px-10 
                text-lg sm:text-xl font-bold 
                rounded-lg sm:rounded-xl 
                shadow-lg hover:shadow-xl dark:hover:shadow-2xl
                transition-all duration-200
                ${!selectedStakeholder || !selectedStructure || isCurrentlyGenerating || isKnowledgeBaseBuilding
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-60 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-700 dark:text-white dark:hover:bg-green-600'
                }
              `}
            >
              {isCurrentlyGenerating ? t('report.generating') : t('report.generate')}
            </button>
          </div>
          
          {/* 右側：プレビューセクション */}
          <div className="lg:sticky lg:top-8 h-fit">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 transition-all">
              <h2 className={`text-lg sm:text-xl font-semibold mb-4 transition-colors ${
                generatedReport 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {t('report.preview')}
              </h2>

              {/* ストリーミング中のプレビュー */}
              {progress.usingLambda && isSectionGenerating && streamingContent ? (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {language === 'en' ? 'Streaming...' : 'ストリーミング中...'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                      {streamingContent.length.toLocaleString()} {language === 'en' ? 'chars' : '文字'}
                    </span>
                  </div>
                  <div className="max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
                      {streamingContent}
                      <span className="inline-block w-0.5 h-4 bg-green-500 animate-pulse ml-0.5 align-middle"></span>
                    </pre>
                  </div>
                </div>
              ) : generatedReport ? (
                <ReportPreview 
                  report={generatedReport} 
                  onUpdate={setGeneratedReport}
                />
              ) : (
                <div className="text-center py-12 sm:py-16">
                  <div className="text-gray-400 dark:text-gray-500 space-y-2">
                    <Image
                      src="/file.svg"
                      alt={language === 'en' ? 'Report Preview Icon' : 'レポートプレビューアイコン'}
                      width={32}
                      height={32}
                      className="mx-auto mb-4 opacity-50 dark:opacity-90"
                    />
                    <p className="text-sm sm:text-base">{t('report.previewEmpty')}</p>
                    <p className="text-sm sm:text-base">{t('report.previewEmptyHint')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
