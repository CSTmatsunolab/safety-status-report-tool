// src/app/components/ReportStructureSelector.tsx
'use client';

import { useState, useEffect } from 'react';
import { FiPlus, FiCheck, FiX, FiMove, FiTrash2 } from 'react-icons/fi';
import { ReportStructureTemplate } from '@/types';
import { DEFAULT_REPORT_STRUCTURES } from '@/lib/report-structures';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface ReportStructureSelectorProps {
  selectedStructure: ReportStructureTemplate | null;
  onSelect: (structure: ReportStructureTemplate) => void;
  recommendedStructureId?: string;
  customStructures?: ReportStructureTemplate[];
  onAddCustomStructure?: (structure: ReportStructureTemplate) => void;
  onDeleteCustomStructure?: (structureId: string) => void;
}

export default function ReportStructureSelector({
  selectedStructure,
  onSelect,
  recommendedStructureId,
  customStructures = [],
  onAddCustomStructure,
  onDeleteCustomStructure
}: ReportStructureSelectorProps) {
  const [showCustomModal, setShowCustomModal] = useState(false);
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
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            レポート構成を選択
            {recommendedStructureId && (
              <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
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
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {structure.id === recommendedStructureId && (
                  <span className="absolute top-2 right-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                    推奨
                  </span>
                )}
                
                <div className="flex items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{structure.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{structure.description}</p>
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">構成内容:</p>
                      <div className="text-xs text-gray-700">
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
                    <FiCheck className="ml-3 text-blue-500 text-xl flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
            
            {/* カスタム構成 */}
            {customStructures.length > 0 && (
              <>
                <div className="border-t pt-3 mt-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">カスタム構成</h4>
                </div>
                {customStructures.map(structure => (
                  <div
                    key={structure.id}
                    onClick={() => onSelect(structure)}
                    className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedStructure?.id === structure.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">
                          {structure.name}
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                            カスタム
                          </span>
                        </h4>
                        {structure.description && (
                          <p className="text-sm text-gray-600 mt-1">{structure.description}</p>
                        )}
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">構成内容:</p>
                          <div className="text-xs text-gray-700">
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
                        <FiCheck className="ml-3 text-blue-500 text-xl flex-shrink-0" />
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
                          className="ml-2 p-1 text-red-500 hover:bg-red-50 rounded"
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

        {/* カスタム構成作成ボタン */}
        <div className="pt-4 border-t">
          <button
            onClick={() => setShowCustomModal(true)}
            className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 text-gray-600 hover:text-gray-700 transition-colors"
          >
            <FiPlus className="inline mr-2" />
            カスタム構成を作成
          </button>
        </div>
      </div>

      {/* カスタム構成作成モーダル */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">カスタムレポート構成を作成</h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  構成名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customStructure.name}
                  onChange={(e) => setCustomStructure({ ...customStructure, name: e.target.value })}
                  placeholder="例: 〜〜向けレポート"
                  className="w-full px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  説明（任意）
                </label>
                <input
                  type="text"
                  value={customStructure.description}
                  onChange={(e) => setCustomStructure({ ...customStructure, description: e.target.value })}
                  placeholder="この構成の特徴を簡単に説明"
                  className="w-full px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  セクション構成 <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
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
                            key={`${index}-${section}`}              // 可能なら安定IDを使う
                            draggableId={`${index}-${section}`}      // 安定しない場合は index ベースでもOK
                            index={index}
                          >
                            {(dragProvided, snapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={`flex items-center ${
                                  snapshot.isDragging ? 'bg-gray-50' : ''
                                }`}
                              >
                                {/* ここをドラッグハンドルにする */}
                                <span
                                  className="text-gray-400 mr-2 cursor-move flex items-center"
                                  {...dragProvided.dragHandleProps}
                                >
                                  <FiMove />
                                </span>

                                <span className="text-gray-500 mr-2 w-8">{index + 1}.</span>

                                <input
                                  type="text"
                                  value={section}
                                  onChange={(e) => handleCustomSectionChange(index, e.target.value)}
                                  placeholder="セクション名を入力"
                                  className="flex-1 px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500"
                                />

                                {customStructure.sections.length > 1 && (
                                  <button
                                    onClick={() => removeCustomSection(index)}
                                    className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded"
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
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700"
                >
                  + セクションを追加
                </button>
              </div>
            </div>

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleCustomStructureSubmit}
                disabled={!customStructure.name || customStructure.sections.filter(s => s.trim()).length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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