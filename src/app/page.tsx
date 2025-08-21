'use client';

import { useState } from 'react';
import FileUpload from './components/FileUpload';
import StakeholderSelect from './components/StakeholderSelect';
import ReportPreview from './components/ReportPreview';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { PREDEFINED_STAKEHOLDERS } from '@/lib/stakeholders';

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState<Stakeholder | null>(null);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileUpload = (newFiles: UploadedFile[]) => {
    setFiles([...files, ...newFiles]);
  };

  const handleGenerateReport = async () => {
    if (!selectedStakeholder || files.length === 0) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files,
          stakeholder: selectedStakeholder,
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

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Safety Status Report 自動生成ツール
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左側：入力セクション */}
          <div className="space-y-6">
            {/* ファイルアップロード */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className={`text-xl font-semibold mb-4 ${files.length > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                1. データアップロード
              </h2>
              <FileUpload onUpload={handleFileUpload} files={files} />
            </div>
            
            {/* ステークホルダー選択 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className={`text-xl font-semibold mb-4 ${selectedStakeholder ? 'text-gray-900' : 'text-gray-400'}`}>
                2. ステークホルダー選択
              </h2>
              <StakeholderSelect
                stakeholders={PREDEFINED_STAKEHOLDERS}
                selected={selectedStakeholder}
                onSelect={setSelectedStakeholder}
              />
              
              <button
                onClick={handleGenerateReport}
                disabled={!selectedStakeholder || files.length === 0 || isGenerating}
                className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'レポート生成中...' : 'レポートを生成'}
              </button>
            </div>
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