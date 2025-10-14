'use client';

import { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import StakeholderSelect from './components/StakeholderSelect';
import ReportPreview from './components/ReportPreview';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { PREDEFINED_STAKEHOLDERS } from '@/lib/stakeholders';
import { FiDatabase, FiCheckCircle, FiLoader } from 'react-icons/fi';
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

    // カスタム構成を読み込む（新規追加）
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
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Safety Status Report 自動生成ツール
          </h1>
          <a
            href="/stakeholder-settings"
            className="text-blue-600 hover:text-blue-700 underline text-[20px]"
          >
            ⚙️ステークホルダー設定
          </a>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左側：入力セクション */}
          <div className="space-y-6">
            {/* ファイルアップロード */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className={`text-xl font-semibold mb-4 ${files.length > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                1. データアップロード
              </h2>
              <FileUpload 
                onUpload={handleFileUpload} 
                onRemove={handleFileRemove}
                onToggleFullText={handleToggleFullText}
                files={files} 
              />
            </div>
            
            {/* ステークホルダー選択 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className={`text-xl font-semibold mb-4 ${selectedStakeholder ? 'text-gray-900' : 'text-gray-400'}`}>
                2. ステークホルダー選択<span className="text-red-500">*</span>
              </h2>
              <StakeholderSelect
                stakeholders={stakeholders}
                selected={selectedStakeholder}
                onSelect={handleStakeholderSelect}
              />

              {/* RAG知識ベース構築ステータス */}
              {selectedStakeholder && files.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      RAG知識ベース
                    </span>
                    {knowledgeBaseStatus === 'idle' && (
                      <button
                        onClick={buildKnowledgeBase}
                        disabled={isKnowledgeBaseBuilding}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
                      >
                        <FiDatabase className="mr-1" />
                        構築する
                      </button>
                    )}
                    {knowledgeBaseStatus === 'building' && (
                      <span className="text-sm text-yellow-600 flex items-center">
                        <FiLoader className="mr-1 animate-spin" />
                        構築中...
                      </span>
                    )}
                    {knowledgeBaseStatus === 'ready' && (
                      <span className="text-sm text-green-600 flex items-center">
                        <FiCheckCircle className="mr-1" />
                        準備完了
                      </span>
                    )}
                    {knowledgeBaseStatus === 'error' && (
                      <span className="text-sm text-red-600">
                        エラー
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    RAGを使用することで、大量のドキュメントから関連情報のみを抽出してレポートを生成します
                  </p>
                </div>
              )}
            </div>

            {/* レポート構成選択 */}
            {selectedStakeholder && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className={`text-xl font-semibold mb-4 ${selectedStructure ? 'text-gray-900' : 'text-gray-400'}`}>
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
            <button
                onClick={handleGenerateReport}
                disabled={!selectedStakeholder || !selectedStructure || isGenerating || isKnowledgeBaseBuilding}
                className="mt-8 w-full bg-green-600 text-white py-6 px-10 text-xl font-bold rounded-xl shadow-lg hover:shadow-xl hover:bg-green-700 transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'レポート生成中...' : 'レポートを生成'}
            </button>
          </div>
          
          {/* 右側：プレビューセクション */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className={`text-xl font-semibold mb-4 ${generatedReport ? 'text-gray-900' : 'text-gray-400'}`}>
              レポートプレビュー
            </h2>
            {generatedReport ? (
              <ReportPreview 
                report={generatedReport} 
                onUpdate={setGeneratedReport}
              />
            ) : (
              <div className="text-center text-gray-500 py-12">
                レポートが生成されるとここに表示されます
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}