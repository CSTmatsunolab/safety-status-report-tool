// src/app/report-structure-settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ReportStructureTemplate } from '@/types';
import { DEFAULT_REPORT_STRUCTURES_JA, DEFAULT_REPORT_STRUCTURES_EN } from '@/lib/report-structures';
import { FiPlus, FiTrash2, FiX, FiCloud, FiHardDrive, FiLoader, FiArrowLeft, FiMove } from 'react-icons/fi';
import { useI18n } from '../components/I18nProvider';
import { useUserSettings } from '@/hooks/useUserSettings';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

export default function ReportStructureSettings() {
  const { language } = useI18n();
  const {
    customStructures,
    addCustomStructure,
    deleteCustomStructure,
    isLoading,
    isSyncing,
    error: settingsError,
    isAuthenticated,
  } = useUserSettings({ language });

  const [sectionsError, setSectionsError] = useState('');
  const [newStructure, setNewStructure] = useState<{
    name: string;
    description: string;
    sections: string[];
  }>({
    name: '',
    description: '',
    sections: [''],
  });
  const [actionError, setActionError] = useState<string | null>(null);

  // 言語に応じたデフォルト構成を取得
  const defaultStructures = language === 'en' ? DEFAULT_REPORT_STRUCTURES_EN : DEFAULT_REPORT_STRUCTURES_JA;

  // settingsErrorをactionErrorに反映
  useEffect(() => {
    if (settingsError) {
      setActionError(settingsError);
    }
  }, [settingsError]);

  const validateSections = (sections: string[]): string => {
    const validSections = sections.filter(s => s.trim());
    if (validSections.length === 0) {
      return language === 'en' 
        ? 'Please enter at least one section'
        : '少なくとも1つのセクションを入力してください';
    }
    return '';
  };

  // ドラッグ&ドロップ処理
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(newStructure.sections);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);

    setNewStructure({ ...newStructure, sections: items });
  };

  // セクション関連の操作
  const handleSectionChange = (index: number, value: string) => {
    const updated = [...newStructure.sections];
    updated[index] = value;
    setNewStructure({ ...newStructure, sections: updated });
    setSectionsError('');
  };

  const addSectionField = () => {
    setNewStructure({
      ...newStructure,
      sections: [...newStructure.sections, '']
    });
  };

  const removeSectionField = (index: number) => {
    const updated = newStructure.sections.filter((_, i) => i !== index);
    setNewStructure({ ...newStructure, sections: updated });
  };

  const addStructure = async () => {
    // セクションの検証
    const sectionsErr = validateSections(newStructure.sections);
    if (sectionsErr) {
      setSectionsError(sectionsErr);
      return;
    }

    if (newStructure.name.trim()) {
      const validSections = newStructure.sections.filter(s => s.trim());

      // IDは自動生成
      const structure: ReportStructureTemplate = {
        id: `custom_${Date.now()}`,
        name: newStructure.name,
        description: newStructure.description || '',
        sections: validSections,
        recommendedFor: [],
      };
      
      try {
        setActionError(null);
        await addCustomStructure(structure);
        setNewStructure({ name: '', description: '', sections: [''] });
        setSectionsError('');
      } catch {
        setActionError(
          language === 'en' 
            ? 'Failed to add report structure' 
            : 'レポート構成の追加に失敗しました'
        );
      }
    }
  };

  const handleDeleteStructure = async (id: string) => {
    const confirmMsg = language === 'en' 
      ? 'Are you sure you want to delete this report structure?'
      : 'このレポート構成を削除しますか？';
    
    if (confirm(confirmMsg)) {
      try {
        setActionError(null);
        await deleteCustomStructure(id);
      } catch {
        setActionError(
          language === 'en' 
            ? 'Failed to delete report structure' 
            : 'レポート構成の削除に失敗しました'
        );
      }
    }
  };

  // 言語に応じたテキスト
  const t = {
    settingsTitle: language === 'en' ? 'Report Structure Settings' : 'レポート構成設定',
    addNew: language === 'en' ? 'Add New Report Structure' : '新しいレポート構成を追加',
    structureName: language === 'en' ? 'Structure Name' : '構成名',
    namePlaceholder: language === 'en' ? 'e.g., Report for XX' : '例: ○○向けレポート',
    description: language === 'en' ? 'Description' : '説明',
    descriptionPlaceholder: language === 'en' ? 'Brief description of this structure' : 'この構成の特徴を簡単に説明',
    sections: language === 'en' ? 'Section Structure' : 'セクション構成',
    sectionPlaceholder: language === 'en' ? 'Enter section name' : 'セクション名を入力',
    addSection: language === 'en' ? '+ Add section' : '+ セクションを追加',
    sectionsHelp: language === 'en'
      ? 'Enter sections to include in the report in order'
      : 'レポートに含めるセクションを順番に入力してください',
    add: language === 'en' ? 'Add' : '追加',
    registeredStructures: language === 'en' ? 'Registered Structures' : '登録済み構成',
    defaultStructures: language === 'en' ? 'Default Structures' : 'デフォルト構成',
    customStructures: language === 'en' ? 'Custom Structures' : 'カスタム構成',
    systemDefined: language === 'en' ? 'System Defined' : 'システム定義',
    backToReport: language === 'en' ? 'Back to Report Generation' : 'レポート生成画面に戻る',
    required: '*',
    optional: language === 'en' ? '(optional)' : '（任意）',
    loading: language === 'en' ? 'Loading...' : '読み込み中...',
    syncingCloud: language === 'en' ? 'Syncing to cloud...' : 'クラウドに同期中...',
    storedInCloud: language === 'en' ? 'Stored in cloud (synced across devices)' : 'クラウドに保存（デバイス間で同期）',
    storedLocally: language === 'en' ? 'Stored locally (this browser only)' : 'ローカルに保存（このブラウザのみ）',
    noCustomStructures: language === 'en' ? 'No custom structures registered' : 'カスタム構成は登録されていません',
  };

  // ローディング中の表示
  if (isLoading) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
            <FiLoader className="animate-spin" size={24} />
            <span>{t.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <FiArrowLeft className="mr-2" />
              {t.backToReport}
            </Link>
          </div>
          
          {/* ストレージ状態インジケーター */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isAuthenticated 
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {isSyncing ? (
              <>
                <FiLoader className="animate-spin" size={14} />
                <span>{t.syncingCloud}</span>
              </>
            ) : isAuthenticated ? (
              <>
                <FiCloud size={14} />
                <span>{t.storedInCloud}</span>
              </>
            ) : (
              <>
                <FiHardDrive size={14} />
                <span>{t.storedLocally}</span>
              </>
            )}
          </div>
        </div>

        {/* タイトル */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          {t.settingsTitle}
        </h1>

        {/* エラーメッセージ */}
        {actionError && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <p className="text-red-700 dark:text-red-300">{actionError}</p>
              <button
                onClick={() => setActionError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <FiX />
              </button>
            </div>
          </div>
        )}

        {/* 新規追加フォーム */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t.addNew}</h2>
          
          <div className="space-y-4">
            {/* 構成名 */}
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.structureName} <span className="text-red-500 dark:text-red-400">{t.required}</span>
              </label>
              <input
                type="text"
                value={newStructure.name}
                onChange={(e) => setNewStructure({ ...newStructure, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                placeholder={t.namePlaceholder}
                disabled={isSyncing}
              />
            </div>

            {/* 説明（任意） */}
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.description} <span className="text-gray-400">{t.optional}</span>
              </label>
              <input
                type="text"
                value={newStructure.description}
                onChange={(e) => setNewStructure({ ...newStructure, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                placeholder={t.descriptionPlaceholder}
                disabled={isSyncing}
              />
            </div>

            {/* セクション構成 */}
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.sections} <span className="text-red-500 dark:text-red-400">{t.required}</span>
              </label>
              <p className="text-base text-gray-500 dark:text-gray-400 mb-3">
                {t.sectionsHelp}
              </p>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="sections">
                  {(dropProvided) => (
                    <div
                      ref={dropProvided.innerRef}
                      {...dropProvided.droppableProps}
                      className="space-y-2"
                    >
                      {newStructure.sections.map((section, index) => (
                        <Draggable
                          key={`section-${index}`}
                          draggableId={`section-${index}`}
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
                                onChange={(e) => handleSectionChange(index, e.target.value)}
                                placeholder={t.sectionPlaceholder}
                                className={`flex-1 px-3 py-2 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${
                                  sectionsError && !section.trim() ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                                }`}
                                disabled={isSyncing}
                              />

                              {newStructure.sections.length > 1 && (
                                <button
                                  onClick={() => removeSectionField(index)}
                                  className="ml-2 p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  type="button"
                                  disabled={isSyncing}
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

              {sectionsError && (
                <p className="mt-1 text-base text-red-600 dark:text-red-400">{sectionsError}</p>
              )}

              <button
                onClick={addSectionField}
                className="mt-3 text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                disabled={isSyncing}
              >
                {t.addSection}
              </button>
            </div>

            {/* 追加ボタン */}
            <button
              onClick={addStructure}
              disabled={
                !newStructure.name.trim() || 
                newStructure.sections.filter(s => s.trim()).length === 0 ||
                isSyncing
              }
              className="flex items-center px-4 py-2 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 disabled:text-white disabled:bg-gray-400 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
            >
              {isSyncing ? (
                <FiLoader className="animate-spin mr-2" />
              ) : (
                <FiPlus className="mr-2" />
              )}
              {t.add}
            </button>
          </div>
        </div>

        {/* 既存の構成一覧 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t.registeredStructures}</h2>
          
          <div className="space-y-6">
            {/* デフォルト構成 */}
            <div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
                {t.defaultStructures}
              </h3>
              <div className="space-y-3">
                {defaultStructures.map((structure) => (
                  <div key={structure.id} className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{structure.name}</h3>
                        {structure.description && (
                          <p className="text-base text-gray-600 dark:text-gray-300 mb-2">{structure.description}</p>
                        )}
                        <div className="mt-2">
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                            {language === 'en' ? 'Sections:' : 'セクション:'}
                          </p>
                          <ol className="text-base text-gray-600 dark:text-gray-300 list-decimal list-inside">
                            {structure.sections.map((section, index) => (
                              <li key={index}>{section}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                      <span className="text-base text-gray-400 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                        {t.systemDefined}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* カスタム構成 */}
            <div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
                {t.customStructures}
              </h3>
              {customStructures.length > 0 ? (
                <div className="space-y-3">
                  {customStructures.map((structure) => (
                    <div key={structure.id} className="border dark:border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{structure.name}</h3>
                          {structure.description && (
                            <p className="text-base text-gray-600 dark:text-gray-300 mb-2">{structure.description}</p>
                          )}
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                              {language === 'en' ? 'Sections:' : 'セクション:'}
                            </p>
                            <ol className="text-base text-gray-600 dark:text-gray-300 list-decimal list-inside">
                              {structure.sections.map((section, index) => (
                                <li key={index}>{section}</li>
                              ))}
                            </ol>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteStructure(structure.id)}
                          className="ml-4 p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                          disabled={isSyncing}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  {t.noCustomStructures}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* レポート生成画面に戻るボタン */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500 underline"
          >
            {t.backToReport}
          </Link>
        </div>
      </div>
    </div>
  );
}