// src/app/components/ReportStructureSelector.tsx
'use client';

import { useState, useEffect } from 'react';
import { FiPlus, FiCheck, FiX, FiMove, FiTrash2, FiInfo } from 'react-icons/fi';
import { ReportStructureTemplate, UploadedFile } from '@/types';
import { DEFAULT_REPORT_STRUCTURES, buildFinalReportStructure } from '@/lib/report-structures';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface ReportStructureSelectorProps {
  selectedStructure: ReportStructureTemplate | null;
  onSelect: (structure: ReportStructureTemplate) => void;
  recommendedStructureId?: string;
  customStructures?: ReportStructureTemplate[];
  onAddCustomStructure?: (structure: ReportStructureTemplate) => void;
  onDeleteCustomStructure?: (structureId: string) => void;
  files?: UploadedFile[];
}

export default function ReportStructureSelector({
  selectedStructure,
  onSelect,
  recommendedStructureId,
  customStructures = [],
  onAddCustomStructure,
  onDeleteCustomStructure,
  files = []
}: ReportStructureSelectorProps) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [expandedGSNInfo, setExpandedGSNInfo] = useState<string | null>(null);
  const [customStructure, setCustomStructure] = useState<ReportStructureTemplate>({
    id: 'custom',
    name: '',
    description: '',
    sections: ['']
  });

  // 推奨構成がある場合、自動選択
  useEffect(() => {
    if (recommendedStructureId && !selectedStructure) {
      const recommended = DEFAULT_REPORT_STRUCTURES.find(s => s.id === recommendedStructureId);
      if (recommended) {
        onSelect(recommended);
      }
    }
  }, [recommendedStructureId, selectedStructure, onSelect]);

  // GSNファイルの検出
  const hasGSNFile = files.some(f => 
    f.type === 'gsn' || f.name.toLowerCase().includes('gsn') || (f.metadata as { isGSN?: boolean })?.isGSN
  );

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(customStructure.sections);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);

    setCustomStructure({ ...customStructure, sections: items });
  };

  const handleCustomSectionChange = (index: number, value: string) => {
    const newSections = [...customStructure.sections];
    newSections[index] = value;
    setCustomStructure({ ...customStructure, sections: newSections });
  };

  const addCustomSection = () => {
    setCustomStructure({
      ...customStructure,
      sections: [...customStructure.sections, '']
    });
  };

  const removeCustomSection = (index: number) => {
    const newSections = customStructure.sections.filter((_, i) => i !== index);
    setCustomStructure({ ...customStructure, sections: newSections });
  };

  const handleCustomStructureSubmit = () => {
    if (customStructure.name && customStructure.sections.filter(s => s.trim()).length > 0) {
      const finalStructure = {
        ...customStructure,
        id: `custom_${Date.now()}`,
        sections: customStructure.sections.filter(s => s.trim())
      };
      onSelect(finalStructure);
      
      // カスタム構成を保存
      if (onAddCustomStructure) {
        onAddCustomStructure(finalStructure);
      }
      
      setShowCustomModal(false);
      // リセット
      setCustomStructure({
        id: 'custom',
        name: '',
        description: '',
        sections: ['']
      });
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            レポート構成を選択
            {recommendedStructureId && (
              <span className="ml-2 text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded">
                推奨構成を自動選択済み
              </span>
            )}
          </h3>
          
          <div className="grid gap-3">
            {/* デフォルト構成 */}
            {DEFAULT_REPORT_STRUCTURES.map(structure => (
              <div
                key={structure.id}
                onClick={() => onSelect(structure)}
                className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedStructure?.id === structure.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                }`}
              >
                {/* 推奨バッジは緑 */}
                {structure.id === recommendedStructureId && (
                  <span className="absolute top-2 right-2 text-xs bg-green-100 text-green-800 dark:bg-green-700 dark:text-white px-2 py-1 rounded">
                    推奨
                  </span>
                )}
                
                <div className="flex items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {structure.name}
                      {/* 情報アイコンはグレー */}
                      {((structure.gsnSections && structure.gsnSections.length > 0) || 
                        (structure.recommendedFor && structure.recommendedFor.length > 0)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); 
                            setExpandedGSNInfo(prev => {
                              return prev === structure.id ? null : structure.id;
                            });
                          }}
                          className="ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
                          aria-label="詳細情報を表示"
                          title="クリックして推奨対象とGSNセクションを表示"
                        >
                          <FiInfo size={14} />
                        </button>
                      )}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{structure.description}</p>

                    {/* クリックで展開される詳細情報 */}
                    {expandedGSNInfo === structure.id && (
                      <div className="mt-2 space-y-2">
                        {/* 推奨ステークホルダー（情報ボックスをグレー系に変更） */}
                        {structure.recommendedFor && structure.recommendedFor.length > 0 && (
                          <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded text-xs">
                            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                              推奨ステークホルダー：
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {structure.recommendedFor.map((stakeholderId) => {
                                const displayNames: { [key: string]: string } = {
                                  // デフォルトステークホルダー
                                  'cxo': 'CxO/経営層',
                                  'business': '事業部門',
                                  'technical-fellows': '技術専門家',
                                  'architect': 'アーキテクト',
                                  'r-and-d': 'R&D',
                                  'product': '製品部門',
                                  
                                  // 追加の推奨対象
                                  'risk-manager': 'リスク・安全管理者',
                                  'project-manager': 'プロジェクトマネージャー',
                                  'qa': '品質保証部門',
                                  'security': 'セキュリティ部門',
                                  'compliance': 'コンプライアンス部門',
                                  'finance': '財務部門',
                                  'hr': '人事部門',
                                  'marketing': 'マーケティング部門',
                                  'sales': '営業部門',
                                  'operations': 'オペレーション部門',
                                  'legal': '法務部門'
                                };
                                return (
                                  <span
                                    key={stakeholderId}
                                    className="bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600"
                                  >
                                    {displayNames[stakeholderId] || stakeholderId}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* GSNセクション（情報ボックスをグレー系に変更） */}
                        {structure.gsnSections && structure.gsnSections.length > 0 && (
                          <div className="p-2 bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded text-xs">
                            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                              GSNファイルがある場合の追加セクション：
                            </p>
                            <ul className="text-gray-700 dark:text-gray-400 space-y-1">
                              {structure.gsnSections.map((section, idx) => (
                                <li key={idx}>• {section}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">基本構成:</p>
                      <div className="text-xs text-gray-700 dark:text-gray-300">
                        {structure.sections.map((section, idx) => (
                          <span key={idx}>
                            {idx > 0 && ' → '}
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* 選択中のチェックマークは青 */}
                  {selectedStructure?.id === structure.id && (
                    <FiCheck className="ml-3 text-blue-500 dark:text-blue-400 text-xl flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
            
            {/* カスタム構成 */}
            {customStructures.length > 0 && (
              <>
                <div className="border-t dark:border-gray-700 pt-3 mt-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">カスタム構成</h4>
                </div>
                {customStructures.map(structure => (
                  <div
                    key={structure.id}
                    onClick={() => onSelect(structure)}
                    className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedStructure?.id === structure.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {structure.name}
                          <span className="ml-2 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                            カスタム
                          </span>
                        </h4>
                        {structure.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{structure.description}</p>
                        )}
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">構成内容:</p>
                          <div className="text-xs text-gray-700 dark:text-gray-300">
                            {structure.sections.map((section, idx) => (
                              <span key={idx}>
                                {idx > 0 && ' → '}
                                {section}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {selectedStructure?.id === structure.id && (
                        <FiCheck className="ml-3 text-blue-500 dark:text-blue-400 text-xl flex-shrink-0" />
                      )}
                      {/* 削除ボタン */}
                      {onDeleteCustomStructure && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('この構成を削除しますか？')) {
                              onDeleteCustomStructure(structure.id);
                            }
                          }}
                          className="ml-2 p-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                          <FiTrash2 />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 最終的なレポート構成プレビュー */}
        {selectedStructure && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              最終的なレポート構成
            </h4>
            
            <ol className="space-y-1 text-sm">
              {buildFinalReportStructure(selectedStructure, files).map((section, idx) => (
                <li key={idx} className="flex items-center">
                  <span className="text-gray-500 dark:text-gray-400 mr-2">{idx + 1}.</span>
                  <span className={
                    selectedStructure.gsnSections?.includes(section)
                      ? "text-blue-600 dark:text-blue-400 font-medium" // GSNセクションは青（情報）
                      : "text-gray-700 dark:text-gray-300"
                  }>
                    {section}
                  </span>
                  {selectedStructure.gsnSections?.includes(section) && (
                    <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                      GSN分析
                    </span>
                  )}
                </li>
              ))}
            </ol>
            
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              章数: {buildFinalReportStructure(selectedStructure, files).length}章
              {hasGSNFile && selectedStructure.gsnSections && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  （GSNセクション{selectedStructure.gsnSections.length}章を含む）
                </span>
              )}
            </div>
          </div>
        )}

        {/* カスタム構成作成ボタン */}
        <div className="pt-4 border-t dark:border-gray-700">
          <button
            onClick={() => setShowCustomModal(true)}
            className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-white dark:bg-gray-800"
          >
            <FiPlus className="inline mr-2" />
            カスタム構成を作成
          </button>
        </div>
      </div>

      {/* カスタム構成作成モーダル */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">カスタムレポート構成を作成</h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  構成名 <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={customStructure.name}
                  onChange={(e) => setCustomStructure({ ...customStructure, name: e.target.value })}
                  placeholder="例: ～～向けレポート"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  説明（任意）
                </label>
                <input
                  type="text"
                  value={customStructure.description}
                  onChange={(e) => setCustomStructure({ ...customStructure, description: e.target.value })}
                  placeholder="この構成の特徴を簡単に説明"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  セクション構成 <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  レポートに含めるセクションを順番に入力してください
                </p>
                
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="sections">
                    {(dropProvided) => (
                      <div
                        ref={dropProvided.innerRef}
                        {...dropProvided.droppableProps}
                        className="space-y-2"
                      >
                        {customStructure.sections.map((section, index) => (
                          <Draggable
                            key={`${index}-${section}`}
                            draggableId={`${index}-${section}`}
                            index={index}
                          >
                            {(dragProvided, snapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={`flex items-center ${
                                  snapshot.isDragging ? 'bg-gray-50 dark:bg-gray-700' : ''
                                }`}
                              >
                                <span
                                  className="text-gray-400 dark:text-gray-500 mr-2 cursor-move flex items-center"
                                  {...dragProvided.dragHandleProps}
                                >
                                  <FiMove />
                                </span>

                                <span className="text-gray-500 dark:text-gray-400 mr-2 w-8">{index + 1}.</span>

                                <input
                                  type="text"
                                  value={section}
                                  onChange={(e) => handleCustomSectionChange(index, e.target.value)}
                                  placeholder="セクション名を入力"
                                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                                />

                                {customStructure.sections.length > 1 && (
                                  <button
                                    onClick={() => removeCustomSection(index)}
                                    className="ml-2 p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                    type="button"
                                  >
                                    <FiX />
                                  </button>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {dropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                
                <button
                  onClick={addCustomSection}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  + セクションを追加
                </button>
              </div>

              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>注意:</strong> GSNファイルがアップロードされた場合、カスタム構成でも自動的にGSN分析セクションが追加される場合があります。
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => setShowCustomModal(false)}
                className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCustomStructureSubmit}
                disabled={!customStructure.name || customStructure.sections.filter(s => s.trim()).length === 0}
                className="flex items-center px-3 py-2 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 disabled:text-white disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-sm transition-colors"
              >
                この構成を使用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}