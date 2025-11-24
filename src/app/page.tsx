'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FileUpload } from './components/FileUpload';
import StakeholderSelect from './components/StakeholderSelect';
import ReportPreview from './components/ReportPreview';
import { ThemeToggle } from './components/ThemeToggle';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { PREDEFINED_STAKEHOLDERS } from '@/lib/stakeholders';
import { FiDatabase, FiCheckCircle, FiLoader, FiSettings, FiTrash2 } from 'react-icons/fi';
import ReportStructureSelector from './components/ReportStructureSelector';
import { ReportStructureTemplate } from '@/types';
import { getSimpleRecommendedStructure } from '@/lib/report-structures';
import { getBrowserId } from '@/lib/browser-id';

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState<Stakeholder | null>(null);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(PREDEFINED_STAKEHOLDERS);
  const [isKnowledgeBaseBuilding, setIsKnowledgeBaseBuilding] = useState(false);
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [selectedStructure, setSelectedStructure] = useState<ReportStructureTemplate | null>(null);
  const [recommendedStructureId, setRecommendedStructureId] = useState<string>('');
  const [customStructures, setCustomStructures] = useState<ReportStructureTemplate[]>([]);
  const [browserId, setBrowserId] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const id = getBrowserId();
    setBrowserId(id);
    console.log('Browser ID:', id);

    // カスタムステークホルダーを読み込む
    const saved = localStorage.getItem('customStakeholders');
    if (saved) {
      setStakeholders(JSON.parse(saved));
    }

    // カスタム構成を読み込む
    const savedStructures = localStorage.getItem('customReportStructures');
    if (savedStructures) {
      setCustomStructures(JSON.parse(savedStructures));
    }
  }, []);

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
    localStorage.setItem('customReportStructures', JSON.stringify(updatedStructures));
  };

  const handleDeleteCustomStructure = (structureId: string) => {
    const updatedStructures = customStructures.filter(s => s.id !== structureId);
    setCustomStructures(updatedStructures);
    localStorage.setItem('customReportStructures', JSON.stringify(updatedStructures));
    
    // 削除された構成が選択されていた場合はクリア
    if (selectedStructure?.id === structureId) {
      setSelectedStructure(null);
    }
  };

  // 知識ベースを構築する関数
  const buildKnowledgeBase = async (isTriggeredByReportGeneration = false) => {
    if (!selectedStakeholder || files.length === 0) return;

    if (knowledgeBaseStatus === 'idle' && !isTriggeredByReportGeneration) {
      const confirmMessage = 
        "「レポートを生成」ボタンを押すと、知識ベースは自動的に構築されます。\n\n" +
        "今ここで手動で構築すると、レポート生成時に再度処理が実行されるため、基本的には不要です。\n" +
        "（レポート生成をせずに、事前のデータ準備だけを行いたい場合は「OK」を押してください）\n\n" +
        "続行しますか？";
      
      if (!confirm(confirmMessage)) {
        return;
      }
    }

    setIsKnowledgeBaseBuilding(true);
    setKnowledgeBaseStatus('building');
    
    try {
      // リクエストサイズをチェック（デバッグ用）
      const requestBody = {
        files,  // 固定長と同じく、filesをそのまま使用
        stakeholderId: selectedStakeholder.id,
        browserId: browserId,
        // Max-Min用の追加パラメータ（最小限）
        chunkingStrategy: 'max-min',
        fullTextDocuments: files
          .filter((file) => file.includeFullText === true)
          .map((file) => file.name),
      };
      
      const requestSize = JSON.stringify(requestBody).length;
      console.log(`Request size: ${(requestSize / (1024 * 1024)).toFixed(2)} MB`);
      
      const response = await fetch('/api/build-knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        // エラーメッセージを改善
        let errorMessage = 'Knowledge base building failed';
        
        if (response.status === 413) {
          errorMessage = 
            'ファイルサイズが大きすぎます。以下の対策を試してください：\n' +
            '1. 大きなPDFファイルを複数の小さなファイルに分割\n' +
            '2. 画像を含むPDFの場合、テキストのみのPDFに変換\n' +
            '3. 一度に処理するファイル数を減らす';
        }
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('Knowledge base built:', result);
      if (result.namespace) {
        console.log('Namespace used:', result.namespace);
      }
      setKnowledgeBaseStatus('ready');
    } catch (error) {
      console.error('Knowledge base building error:', error);
      setKnowledgeBaseStatus('error');
      
      const errorMessage = error instanceof Error ? error.message : '知識ベースの構築に失敗しました。';
      alert(errorMessage);
    } finally {
      setIsKnowledgeBaseBuilding(false);
    }
  };

  const deleteKnowledgeBase = async () => {
    if (!selectedStakeholder) return;
    
    setIsDeleting(true);
    
    try {
      // まず現在のデータ状況を確認
      let vectorCount = 0;
      let hasData = false;
      
      try {
        const statsResponse = await fetch(
          `/api/delete-knowledge-base?stakeholderId=${selectedStakeholder.id}&browserId=${browserId}`,
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
        confirmMessage = 
          `【知識ベースの削除確認】\n\n` +
          `対象: ${selectedStakeholder.role}\n` +
          `現在のデータ: ${vectorCount.toLocaleString()} ベクトル\n\n` +
          `⚠️ この操作は取り消せません。本当に削除しますか？`;
      } else if (knowledgeBaseStatus === 'ready') {
        confirmMessage = 
          `【知識ベースのリセット確認】\n\n` +
          `対象: ${selectedStakeholder.role}\n` +
          `データをリセットしますか？`;
      } else {
        confirmMessage = 
          `【データベースのクリア確認】\n\n` +
          `対象: ${selectedStakeholder.role}\n` +
          `念のためクリア処理を実行しますか？`;
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
          browserId: browserId,
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
        alert(`${selectedStakeholder.role}の知識ベースは既にクリアされています。`);
      } else if (hasData) {
        alert(
          `削除完了\n\n` +
          `対象: ${selectedStakeholder.role}\n` +
          `削除されたデータ: ${vectorCount.toLocaleString()} ベクトル\n` +
          `残りのベクトル: ${result.remainingVectors || 0}`
        );
      } else {
        alert(`${selectedStakeholder.role}の知識ベースをクリアしました。`);
      }
      
    } catch (error) {
      console.error('Knowledge base deletion error:', error);
      alert(
        `削除に失敗しました\n\n` +
        `エラー: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsDeleting(false);
    }
  };


  const handleGenerateReport = async () => {
    if (!selectedStakeholder || !selectedStructure) return;
    // ファイルがある場合のみナレッジベース構築
    if (files.length > 0 && knowledgeBaseStatus !== 'ready') {
      await buildKnowledgeBase(true);
      if (knowledgeBaseStatus === 'error') return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files,
          stakeholder: selectedStakeholder,
          fullTextFileIds: files
            .filter(file => file.includeFullText)
            .map(file => file.id),
          reportStructure: selectedStructure,
          browserId: browserId,
        }),
      });

      if (!response.ok) {
        throw new Error('レポート生成に失敗しました');
      }
      
      const report = await response.json();
      setGeneratedReport(report);
    } catch (error) {
      console.error('Report generation failed:', error);
      alert('レポート生成に失敗しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStakeholderSelect = (stakeholder: Stakeholder) => {
    setSelectedStakeholder(stakeholder);
    setKnowledgeBaseStatus('idle');
    setIsDeleting(false);
    
    // 推奨構成を取得して設定
    const recommended = getSimpleRecommendedStructure(
      stakeholder
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
                Safety Status Report 自動生成ツール
              </span>
            </Link>

          </h1>
          <div className="flex items-center gap-4">
            <Link 
              href="/stakeholder-settings" 
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-base sm:text-lg transition-colors hover:underline">
              <FiSettings className="text-lg sm:text-xl" />
              <span>ステークホルダー設定</span>
            </Link>
            <ThemeToggle />
          </div>
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
                1. データアップロード
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
                2. ステークホルダー選択<span className="text-red-500 dark:text-red-400">*</span>
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
                      RAG知識ベース
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
                          構築する
                        </button>
                      )}
                      
                      {knowledgeBaseStatus === 'idle' && files.length === 0 && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          構築はファイルが必要
                        </span>
                      )}
                      
                      {knowledgeBaseStatus === 'building' && (
                        <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                          <FiLoader className="animate-spin" />
                          構築中...
                        </span>
                      )}
                      
                      {knowledgeBaseStatus === 'ready' && (
                        <>
                          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                            <FiCheckCircle />
                            準備完了
                          </span>
                          {files.length > 0 && (
                            <button
                              onClick={() => buildKnowledgeBase()}
                              disabled={isKnowledgeBaseBuilding || isDeleting}
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="知識ベースを再構築"
                            >
                              <FiDatabase />
                              再構築
                            </button>
                          )}
                        </>
                      )}
                      
                      {knowledgeBaseStatus === 'error' && (
                        <>
                          <span className="text-sm text-red-600 dark:text-red-400">
                            エラー
                          </span>
                          {files.length > 0 && (
                            <button
                              onClick={() => buildKnowledgeBase()}
                              disabled={isKnowledgeBaseBuilding || isDeleting}
                              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="再試行"
                            >
                              <FiDatabase />
                              再試行
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={deleteKnowledgeBase}
                        disabled={isDeleting || isKnowledgeBaseBuilding}
                        className="p-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`${selectedStakeholder.role}の知識ベースをリセット`}
                      >
                        {isDeleting ? (
                          <FiLoader className="w-4 h-4 animate-spin" />
                        ) : (
                          <span className="flex items-center gap-1">
                            <FiTrash2 className="w-4 h-4" />
                            データリセット                         
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1">
                    <p>
                      <span className="font-medium text-gray-600 dark:text-gray-300">ステークホルダー : {selectedStakeholder.role}</span> 
                    </p>
                    <p>
                      RAGを使用することで、大量のドキュメントから関連情報のみを抽出してレポートを生成します
                    </p>
                    {/* ステータスに応じた追加メッセージ */}
                    {knowledgeBaseStatus === 'idle' && files.length === 0 && (
                      <p className="text-amber-600 dark:text-amber-400">
                        構築にはファイルのアップロードが必要です。削除はいつでも実行できます。
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
                  3. レポート構成を選択
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

            {/* レポート生成ボタン */}
            <button
              onClick={handleGenerateReport}
              disabled={!selectedStakeholder || !selectedStructure || isGenerating || isKnowledgeBaseBuilding}
              className={`
                w-full py-4 sm:py-6 px-6 sm:px-10 
                text-lg sm:text-xl font-bold 
                rounded-lg sm:rounded-xl 
                shadow-lg hover:shadow-xl dark:hover:shadow-2xl
                transition-all duration-200
                ${!selectedStakeholder || !selectedStructure || isGenerating || isKnowledgeBaseBuilding
                  ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-60 text-white'
                  : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-700 dark:text-white dark:hover:bg-green-600'
                }
              `}
            >
              {isGenerating ? 'レポート生成中...' : 'レポートを生成'}
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
                レポートプレビュー
              </h2>
              {generatedReport ? (
                <ReportPreview 
                  report={generatedReport} 
                  onUpdate={setGeneratedReport}
                />
              ) : (
                <div className="text-center py-12 sm:py-16">
                  <div className="text-gray-400 dark:text-gray-500 space-y-2">
                    <Image
                      src="/file.svg"
                      alt="レポートプレビューアイコン"
                      width={32}
                      height={32}
                      className="mx-auto mb-4 opacity-50 dark:opacity-90"
                    />
                    <p className="text-sm sm:text-base">レポートが生成されると</p>
                    <p className="text-sm sm:text-base">ここに表示されます</p>
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