'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileUpload } from './components/FileUpload';
import StakeholderSelect from './components/StakeholderSelect';
import ReportPreview from './components/ReportPreview';
import { ThemeToggle } from './components/ThemeToggle';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { PREDEFINED_STAKEHOLDERS } from '@/lib/stakeholders';
import { FiDatabase, FiCheckCircle, FiLoader, FiSettings } from 'react-icons/fi';
import ReportStructureSelector from './components/ReportStructureSelector';
import { ReportStructureTemplate } from '@/types';
import { getSimpleRecommendedStructure } from '@/lib/report-structures';

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

  useEffect(() => {
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
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
    // ファイルが追加されたら知識ベースの状態をリセット
    setKnowledgeBaseStatus('idle');
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
  const buildKnowledgeBase = async () => {
    if (!selectedStakeholder || files.length === 0) return;
    
    setIsKnowledgeBaseBuilding(true);
    setKnowledgeBaseStatus('building');
    
    try {
      const response = await fetch('/api/build-knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files,
          stakeholderId: selectedStakeholder.id,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Knowledge base building failed');
      }
      
      const result = await response.json();
      console.log('Knowledge base built:', result);
      setKnowledgeBaseStatus('ready');
    } catch (error) {
      console.error('Knowledge base building error:', error);
      setKnowledgeBaseStatus('error');
      alert('知識ベースの構築に失敗しました。');
    } finally {
      setIsKnowledgeBaseBuilding(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedStakeholder || !selectedStructure) return;
    // ファイルがある場合のみナレッジベース構築
    if (files.length > 0 && knowledgeBaseStatus !== 'ready') {
      await buildKnowledgeBase();
      if (knowledgeBaseStatus === 'error') return;
    }
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files,  // 空配列でもOK
          stakeholder: selectedStakeholder,
          fullTextFileIds: files
            .filter(file => file.includeFullText)
            .map(file => file.id),
          reportStructure: selectedStructure
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
    
    // 推奨構成を取得して設定
    const recommended = getSimpleRecommendedStructure(
      stakeholder.id, 
      files
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
            <Link href="/">Safety Status Report 自動生成ツール</Link>
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
          <div className="space-y-6">
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

              {/* RAG知識ベース構築ステータス */}
              {selectedStakeholder && files.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      RAG知識ベース
                    </span>
                    {knowledgeBaseStatus === 'idle' && (
                      <button
                        onClick={buildKnowledgeBase}
                        disabled={isKnowledgeBaseBuilding}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                      >
                        <FiDatabase />
                        構築する
                      </button>
                    )}
                    {knowledgeBaseStatus === 'building' && (
                      <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                        <FiLoader className="animate-spin" />
                        構築中...
                      </span>
                    )}
                    {knowledgeBaseStatus === 'ready' && (
                      <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                        <FiCheckCircle />
                        準備完了
                      </span>
                    )}
                    {knowledgeBaseStatus === 'error' && (
                      <span className="text-sm text-red-600 dark:text-red-400">
                        エラー
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    RAGを使用することで、大量のドキュメントから関連情報のみを抽出してレポートを生成します
                  </p>
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
                  : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:text-black dark:hover:bg-green-600'
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
                    <svg className="mx-auto h-12 w-12 sm:h-16 sm:w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
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