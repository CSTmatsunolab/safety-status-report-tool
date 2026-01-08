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
import { GenerationProgress } from './components/GenerationProgress';
import { StreamingPreview } from './components/StreamingPreview';
import { UploadedFile, Stakeholder, Report } from '@/types';
import ReportStructureSelector from './components/ReportStructureSelector';
import { KnowledgeBaseManager } from './components/KnowledgeBaseManager';
import { ReportStructureTemplate } from '@/types';
import { getSimpleRecommendedStructure } from '@/lib/report-structures';
import { useSectionGeneration } from '@/hooks/useSectionGeneration';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useReportHistory } from '@/hooks/useReportHistory';
import { FiSave, FiCheck, FiHelpCircle} from 'react-icons/fi';

export default function Home() {
  const { t, language } = useI18n();
  const { getUserIdentifier, status: authStatus } = useAuth();
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState<Stakeholder | null>(null);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [isKnowledgeBaseBuilding, setIsKnowledgeBaseBuilding] = useState(false);
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [selectedStructure, setSelectedStructure] = useState<ReportStructureTemplate | null>(null);
  const [recommendedStructureId, setRecommendedStructureId] = useState<string>('');
  const [userIdentifier, setUserIdentifier] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);

  // ユーザー設定フック（カスタムステークホルダー & カスタム構成）
  const {
    allStakeholders: stakeholders,
    customStructures,
    addCustomStructure,
    deleteCustomStructure,
    isLoading: isSettingsLoading,
    error: settingsError,
  } = useUserSettings({ language });

  // セクション生成フック
  const {
    generateReport: generateReportBySection,
    isGenerating: isSectionGenerating,
    progress,
    error: sectionError,
    reset: resetSectionGeneration,
    streamingContent,
  } = useSectionGeneration();

  // レポート履歴フック
  const { saveReport, isSaving, isAuthenticated } = useReportHistory();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'resave'>('idle');

  // 履歴に保存
  const handleSaveToHistory = async () => {
    if (!isAuthenticated) {
      alert(language === 'en' 
        ? 'Please login to save reports to history' 
        : '履歴に保存するにはログインが必要です');
      return;
    }
    if (!generatedReport) return;

    setSaveStatus('saving');
    const structureInfo = selectedStructure ? { id: selectedStructure.id, name: selectedStructure.name } : undefined;
    const result = await saveReport(generatedReport, files, userIdentifier, structureInfo);
    
    if (result.success) {
      setSaveStatus('saved');
      // 3秒後に「再保存」表示に切り替え
      setTimeout(() => setSaveStatus('resave'), 3000);
    } else {
      setSaveStatus('error');
      alert(result.error || (language === 'en' ? 'Failed to save' : '保存に失敗しました'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 保存ボタンの表示内容
  const getSaveButtonContent = () => {
    switch (saveStatus) {
      case 'saving':
        return {
          text: language === 'en' ? 'Saving...' : '保存中...',
          icon: <FiSave className="mr-1 animate-pulse" />,
          className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-white',
        };
      case 'saved':
        return {
          text: language === 'en' ? 'Saved!' : '保存完了',
          icon: <FiCheck className="mr-1" />,
          className: 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-white',
        };
      case 'error':
        return {
          text: language === 'en' ? 'Error' : 'エラー',
          icon: <FiSave className="mr-1" />,
          className: 'bg-red-100 text-red-800 dark:bg-red-700 dark:text-white',
        };
      case 'resave':
        return {
          text: language === 'en' ? 'Re-save' : '再保存',
          icon: <FiSave className="mr-1" />,
          className: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500',
        };
      default:
        return {
          text: language === 'en' ? 'Save to History' : '履歴に保存',
          icon: <FiSave className="mr-1" />,
          className: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-700 dark:text-white dark:hover:bg-indigo-600',
        };
    }
  };

  // 認証状態が変わったらユーザー識別子を更新
  useEffect(() => {
    if (authStatus !== 'loading') {
      const id = getUserIdentifier();
      setUserIdentifier(id);
    }
  }, [authStatus, getUserIdentifier]);

  // セクション生成エラーを監視
  useEffect(() => {
    if (sectionError) {
      setErrorMessage(sectionError);
    }
  }, [sectionError]);

  // 設定エラーを監視
  useEffect(() => {
    if (settingsError) {
      setErrorMessage(settingsError);
    }
  }, [settingsError]);

  const handleFileUpload = (newFiles: UploadedFile[]) => {
    setFiles(prevFiles => {
      const allFiles = [...prevFiles, ...newFiles];
      const uniqueMap = new Map<string, UploadedFile>();
      allFiles.forEach(file => {
        uniqueMap.set(file.id, file);
      });
      return Array.from(uniqueMap.values());
    });
  };

  const handleFileRemove = (id: string) => {
    setFiles(prevFiles => prevFiles.filter(f => f.id !== id));
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
  const handleAddCustomStructure = async (structure: ReportStructureTemplate) => {
    try {
      await addCustomStructure(structure);
    } catch (error) {
      console.error('Failed to add custom structure:', error);
      setErrorMessage(
        language === 'en'
          ? 'Failed to save custom structure'
          : 'カスタム構成の保存に失敗しました'
      );
    }
  };

  const handleDeleteCustomStructure = async (structureId: string) => {
    try {
      await deleteCustomStructure(structureId);
      
      if (selectedStructure?.id === structureId) {
        setSelectedStructure(null);
      }
    } catch (error) {
      console.error('Failed to delete custom structure:', error);
      setErrorMessage(
        language === 'en'
          ? 'Failed to delete custom structure'
          : 'カスタム構成の削除に失敗しました'
      );
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
      
      if (response.status === 504) {
        const errorMsg = language === 'en'
          ? 'Knowledge base building timed out (504 Gateway Timeout).\n\n[Solution]\n• Reduce file size\n• Reduce number of files\n• Upload fewer files at a time'
          : '知識ベースの構築がタイムアウトしました（504 Gateway Timeout）。\n\n【対処法】\n・ファイルサイズを小さくしてください\n・ファイル数を減らしてください\n・一度にアップロードするファイル数を少なくしてください';
        setErrorMessage(errorMsg);
        throw new Error('Gateway Timeout');
      }
      
      // JSONパースを試みる
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        const errorMsg = language === 'en'
          ? 'Failed to build knowledge base. Server returned an invalid response.\n\n[Solution]\n• Reduce file size\n• Reduce number of files'
          : '知識ベースの構築に失敗しました。サーバーから無効なレスポンスが返されました。\n\n【対処法】\n・ファイルサイズを小さくしてください\n・ファイル数を減らしてください';
        setErrorMessage(errorMsg);
        throw new Error('Invalid response');
      }
      
      if (!response.ok) {
        let errorMsg = language === 'en' 
          ? 'Failed to build knowledge base.\n\n'
          : '知識ベースの構築に失敗しました。\n\n';
        
        if (result.error) {
          errorMsg += language === 'en' ? `Error: ${result.error}\n` : `エラー: ${result.error}\n`;
        }
        if (result.details) {
          errorMsg += language === 'en' ? `Details: ${result.details}\n` : `詳細: ${result.details}\n`;
        }
        
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
      let fileCount = 0;
      let hasData = false;
      
      // ファイル数を取得
      try {
        const filesResponse = await fetch(
          `/api/list-knowledge-files?stakeholderId=${selectedStakeholder.id}&userIdentifier=${userIdentifier}`,
          { method: 'GET' }
        );
        
        if (filesResponse.ok) {
          const filesData = await filesResponse.json();
          fileCount = filesData.totalFiles || 0;
          hasData = fileCount > 0;
        } else {
          console.log('list-knowledge-files response not ok:', filesResponse.status);
          throw new Error('API returned non-ok status');
        }
      } catch (error) {
        console.log('Files check failed, falling back to vector count:', error);
        // フォールバック: ベクトル数で確認（ファイル数は不明なので「データあり」のみ判定）
        try {
          const statsResponse = await fetch(
            `/api/delete-knowledge-base?stakeholderId=${selectedStakeholder.id}&userIdentifier=${userIdentifier}`,
            { method: 'GET' }
          );
          if (statsResponse.ok) {
            const stats = await statsResponse.json();
            const vectorCount = stats.vectorCount || 0;
            hasData = vectorCount > 0;
            // ベクトル数からファイル数を推定（正確ではないが目安として）
            // 通常1ファイルあたり数チャンクなので、概算で表示
            fileCount = hasData ? Math.max(1, Math.ceil(vectorCount / 5)) : 0;
            console.log('Fallback: estimated file count from vectors:', fileCount);
          }
        } catch {
          console.log('Stats check also failed');
        }
      }
      
      let confirmMessage;
      if (hasData) {
        confirmMessage = t('knowledgeBase.confirmDelete', {
          role: selectedStakeholder.role,
          count: fileCount.toString()
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
          count: fileCount.toString()
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

  // レポート生成
  const handleGenerateReport = async () => {
    if (!selectedStakeholder || !selectedStructure || !userIdentifier) return;
    
    setErrorMessage(null);
    setWarningMessages([]);
    resetSectionGeneration();
    
    // ファイルがある場合のみナレッジベース構築
    if (files.length > 0 && knowledgeBaseStatus !== 'ready') {
      await buildKnowledgeBase(true);
      if (knowledgeBaseStatus === 'error') return;
    }
    
    // 大きいファイルの確認
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
        ? `[Warning] ${largeFullTextFiles.length} large files (50,000+ chars) are selected for full text use.\n\nTo reduce processing load, only the first ${MAX_LARGE_FULL_TEXT_FILES} will use full text.\nThe rest will use relevant parts extraction.\n\nContinue?`
        : `【警告】大きなファイル（5万文字以上）の全文使用が${largeFullTextFiles.length}個選択されています。\n\n処理負荷を軽減するため、最初の${MAX_LARGE_FULL_TEXT_FILES}個のみが全文使用されます。\n残りのファイルは関連部分のみ抽出されます。\n\n続行しますか？`;
      
      if (!confirm(confirmMsg)) return;
    }

    // レポート生成を実行
    const report = await generateReportBySection({
      files,
      stakeholder: selectedStakeholder,
      reportStructure: selectedStructure,
      userIdentifier,
      language,
    });

    if (report) {
      setGeneratedReport(report);
      setSaveStatus('idle'); // 新しいレポートが生成されたらリセット
    }
  };

  // 生成中フラグ
  const isCurrentlyGenerating = isSectionGenerating;

  const handleStakeholderSelect = (stakeholder: Stakeholder) => {
    setSelectedStakeholder(stakeholder);
    setKnowledgeBaseStatus('idle');
    setIsDeleting(false);
    
    const recommended = getSimpleRecommendedStructure(
      stakeholder,
      language
    );
    setRecommendedStructureId(recommended.id);
    setSelectedStructure(recommended);
  };

  // ローディング中の表示
  if (isSettingsLoading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 dark:text-gray-400">
              {language === 'en' ? 'Loading...' : '読み込み中...'}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white transition-colors">
            <Link href="/" className="flex items-center gap-3">
              <span>{t('app.title')}</span>
            </Link>
          </h1>
          <SettingsMenu />
        </div>
        
        {/* メインコンテンツ - 2カラムグリッド */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
          {/* 左側：入力セクション */}
          <div className="space-y-6 mb-8 xl:mb-0">
            {/* 1. データアップロード */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 transition-all">
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg sm:text-xl font-semibold transition-colors ${
                  files.length > 0 
                    ? 'text-gray-900 dark:text-white' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {t('steps.dataUpload')}
                </h2>
                <a
                  href="/upload-guide.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title={language === 'en' ? 'Tips for better quality' : '品質向上のヒント'}
                >
                  <FiHelpCircle size={20} />
                  {language === 'en' ? 'Tips for better quality' : '品質向上のヒント'}
                </a>
              </div>
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
                <KnowledgeBaseManager
                  stakeholder={selectedStakeholder}
                  userIdentifier={userIdentifier}
                  filesCount={files.length}
                  status={knowledgeBaseStatus}
                  isBuilding={isKnowledgeBaseBuilding}
                  isDeleting={isDeleting}
                  onBuild={() => buildKnowledgeBase()}
                  onDelete={deleteKnowledgeBase}
                />
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
                    <pre className="text-base text-red-700 dark:text-red-300 whitespace-pre-wrap">{errorMessage}</pre>
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
                    <ul className="text-base text-yellow-700 dark:text-yellow-300 list-disc list-inside space-y-1">
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

            {/* 生成進捗表示 */}
            {isSectionGenerating && progress && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-blue-800 dark:text-blue-200 font-medium mb-3">
                  {language === 'en' ? 'Generating Report...' : 'レポート生成中...'}
                </h4>
                <GenerationProgress progress={progress} language={language} />
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
              {/* カードヘッダー: タイトル + 保存ボタン */}
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg sm:text-xl font-semibold transition-colors ${
                  generatedReport 
                    ? 'text-gray-900 dark:text-white' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {t('report.preview')}
                </h2>
                {/* 履歴に保存ボタン - レポート生成済みの時のみ表示 */}
                {generatedReport && (
                  <button
                    onClick={handleSaveToHistory}
                    disabled={isSaving || saveStatus === 'saving'}
                    className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors disabled:opacity-50 ${getSaveButtonContent().className}`}
                  >
                    {getSaveButtonContent().icon}
                    {getSaveButtonContent().text}
                  </button>
                )}
              </div>

              {/* ストリーミング中のプレビュー */}
              {isSectionGenerating && streamingContent ? (
                <StreamingPreview content={streamingContent} language={language} />
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
                    <p className="text-base sm:text-base">{t('report.previewEmpty')}</p>
                    <p className="text-base sm:text-base">{t('report.previewEmptyHint')}</p>
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