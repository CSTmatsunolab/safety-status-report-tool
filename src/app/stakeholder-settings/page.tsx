'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Stakeholder } from '@/types';
import { getPredefinedStakeholders } from '@/lib/stakeholders';
import { FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { useI18n } from '../components/I18nProvider';
import { SettingsMenu } from '../components/SettingsMenu';

export default function StakeholderSettings() {
  const { language } = useI18n();
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [concernsError, setConcernsError] = useState('');
  const [newStakeholder, setNewStakeholder] = useState({
    id: '',
    role: '',
    concerns: ['']
  });
  const [idError, setIdError] = useState('');

  // 言語に応じたデフォルトステークホルダーを取得
  const predefinedStakeholders = getPredefinedStakeholders(language);

  useEffect(() => {
    // ローカルストレージから保存されたステークホルダーを読み込む
    const saved = localStorage.getItem('customStakeholders');
    if (saved) {
      try {
        const customStakeholders = JSON.parse(saved) as Stakeholder[];
        const hasCustom = customStakeholders.some(s => s.id.startsWith('custom_'));
        
        if (hasCustom) {
          // カスタムがある場合は、デフォルト部分だけ言語に応じて更新
          const customOnly = customStakeholders.filter(s => s.id.startsWith('custom_'));
          setStakeholders([...predefinedStakeholders, ...customOnly]);
        } else {
          setStakeholders(predefinedStakeholders);
        }
      } catch {
        setStakeholders(predefinedStakeholders);
      }
    } else {
      setStakeholders(predefinedStakeholders);
    }
  }, [language, predefinedStakeholders]);

  const saveToLocalStorage = (data: Stakeholder[]) => {
    localStorage.setItem('customStakeholders', JSON.stringify(data));
  };

  // ID検証関数（大文字小文字を区別）
  const validateId = (id: string): string => {
    if (!id.trim()) {
      return language === 'en' ? 'Please enter an ID' : 'IDを入力してください';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
      return language === 'en' 
        ? 'Only letters, numbers, hyphens (-), and underscores (_) are allowed'
        : '英字、数字、ハイフン(-)、アンダースコア(_)のみ使用できます';
    }
    if (id.length < 3) {
      return language === 'en' ? 'ID must be at least 3 characters' : 'IDは3文字以上にしてください';
    }
    if (id.length > 30) {
      return language === 'en' ? 'ID must be 30 characters or less' : 'IDは30文字以内にしてください';
    }
    
    // Pineconeは大文字小文字を区別するため、そのままチェック
    const fullId = `custom_${id}`;
    
    if (stakeholders.some(s => s.id === fullId)) {
      return language === 'en' ? 'This ID is already in use' : 'このIDは既に使用されています';
    }
    
    // デフォルトIDとの衝突チェック（念のため大文字小文字を無視）
    if (predefinedStakeholders.some(s => s.id.toLowerCase() === id.toLowerCase())) {
      return language === 'en' ? 'This ID is reserved by the system' : 'このIDはシステムで予約されています';
    }
    
    return '';
  };

  const handleIdChange = (value: string) => {
    setNewStakeholder({ ...newStakeholder, id: value });
    setIdError(validateId(value));
  };

  const addStakeholder = () => {
    // IDの検証
    const idValidationError = validateId(newStakeholder.id);
    if (idValidationError) {
      setIdError(idValidationError);
      return;
    }

    // 関心事の検証
    const validConcerns = newStakeholder.concerns.filter(c => c.trim());
    const concernsErr = validateConcerns(newStakeholder.concerns);
    if (concernsErr) {
      setConcernsError(concernsErr);
      return;
    }

    if (newStakeholder.role.trim()) {
      const stakeholder: Stakeholder = {
        id: `custom_${newStakeholder.id}`,
        role: newStakeholder.role,
        concerns: validConcerns  // 空白のみの関心事を除外
      };
      const updated = [...stakeholders, stakeholder];
      setStakeholders(updated);
      saveToLocalStorage(updated);
      setNewStakeholder({ id: '', role: '', concerns: [''] });
      setIdError('');
      setConcernsError('');
    }
  };

  const deleteStakeholder = (id: string) => {
    const confirmMsg = language === 'en' 
      ? 'Are you sure you want to delete this stakeholder?'
      : 'このステークホルダーを削除しますか？';
    
    if (confirm(confirmMsg)) {
      const updated = stakeholders.filter(s => s.id !== id);
      setStakeholders(updated);
      saveToLocalStorage(updated);
    }
  };

  const updateConcern = (index: number, value: string) => {
    const updatedConcerns = [...newStakeholder.concerns];
    updatedConcerns[index] = value;
    setNewStakeholder({ ...newStakeholder, concerns: updatedConcerns });
  };

  const addConcernField = () => {
    setNewStakeholder({
      ...newStakeholder,
      concerns: [...newStakeholder.concerns, '']
    });
  };

  const removeConcernField = (index: number) => {
    const updatedConcerns = newStakeholder.concerns.filter((_, i) => i !== index);
    setNewStakeholder({ ...newStakeholder, concerns: updatedConcerns });
  };

  const validateConcerns = (concerns: string[]): string => {
    const validConcerns = concerns.filter(c => c.trim());
    if (validConcerns.length === 0) {
      return language === 'en' 
        ? 'Please enter at least one concern'
        : '少なくとも1つの関心事を入力してください';
    }
    return '';
  };

  // カスタムステークホルダーのみを抽出
  const customStakeholders = stakeholders.filter(s => s.id.startsWith('custom_'));

  // 言語に応じたテキスト
  const t = {
    pageTitle: language === 'en' ? 'Safety Status Report Generator' : 'Safety Status Report 自動生成ツール',
    settingsTitle: language === 'en' ? 'Stakeholder Settings' : 'ステークホルダー設定',
    addNew: language === 'en' ? 'Add New Stakeholder' : '新しいステークホルダーを追加',
    id: 'ID',
    idPlaceholder: language === 'en' ? 'e.g., QA-Team, Security-Dept' : '例: QA-Team, Security-Dept, KEIEI-KIKAKU',
    idHelp: language === 'en' 
      ? 'ID for identification. Case-sensitive.'
      : 'で識別するためのID。大文字小文字は区別されます。',
    roleName: language === 'en' ? 'Role / Department Name' : '役職・部門名',
    rolePlaceholder: language === 'en' ? 'e.g., Quality Assurance Department' : '例: 品質保証部門',
    concerns: language === 'en' ? 'Key Concerns' : '主な関心事',
    concernPlaceholder: language === 'en' ? 'Enter a concern' : '関心事を入力',
    addConcern: language === 'en' ? '+ Add concern' : '+ 関心事を追加',
    concernsHelp: language === 'en'
      ? 'Affects search accuracy during report generation. Be specific.\nWe recommend entering 3 or more for better accuracy.'
      : 'レポート生成時の検索精度に影響します。具体的に記入してください。\n精度向上のため、3つ以上の入力をおすすめします。',
    add: language === 'en' ? 'Add' : '追加',
    registeredStakeholders: language === 'en' ? 'Registered Stakeholders' : '登録済みステークホルダー',
    defaultStakeholders: language === 'en' ? 'Default Stakeholders' : 'デフォルトステークホルダー',
    customStakeholders: language === 'en' ? 'Custom Stakeholders' : 'カスタムステークホルダー',
    systemDefined: language === 'en' ? 'System Defined' : 'システム定義',
    backToReport: language === 'en' ? 'Back to Report Generation' : 'レポート生成画面に戻る',
    required: '*',
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white transition-colors">
            <Link href="/">{t.pageTitle}</Link>
          </h1>
          <div className="flex items-center gap-4">
            <SettingsMenu />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          {t.settingsTitle}
        </h1>

        {/* 新規追加フォーム */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t.addNew}</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-base font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t.id} <span className="text-red-500 dark:text-red-400">{t.required}</span>
              </label>
              <input
                type="text"
                value={newStakeholder.id}
                onChange={(e) => handleIdChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 ${
                  idError ? 'border-red-500 dark:border-red-400' : 'border-gray-300'
                }`}
                placeholder={t.idPlaceholder}
                maxLength={30}
              />
              {idError && (
                <p className="mt-1 text-base text-red-600 dark:text-red-400">{idError}</p>
              )}
              <p className="mt-1 text-base text-gray-500 dark:text-gray-400">
                {t.idHelp}
              </p>
            </div>

            <div>
              <label className="block text-base font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t.roleName} <span className="text-red-500 dark:text-red-400">{t.required}</span>
              </label>
              <input
                type="text"
                value={newStakeholder.role}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500"
                placeholder={t.rolePlaceholder}
              />
            </div>

            <div>
              <label className="block text-base font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t.concerns} <span className="text-red-500 dark:text-red-400">{t.required}</span>
              </label>
              {newStakeholder.concerns.map((concern, index) => (
                <div key={index} className="flex mb-2">
                  <input
                    type="text"
                    value={concern}
                    onChange={(e) => {
                      updateConcern(index, e.target.value);
                      setConcernsError('');
                    }}
                    className={`flex-1 px-3 py-2 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 ${
                      concernsError && !concern.trim() ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder={t.concernPlaceholder}
                  />
                  {newStakeholder.concerns.length > 1 && (
                    <button
                      onClick={() => removeConcernField(index)}
                      className="ml-2 p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 rounded"
                    >
                      <FiX />
                    </button>
                  )}
                </div>
              ))}
              {concernsError && (
                <p className="mt-1 text-base text-red-600 dark:text-red-400">{concernsError}</p>
              )}
              <button
                onClick={addConcernField}
                className="text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500"
              >
                {t.addConcern}
              </button>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                {t.concernsHelp}
              </p>
            </div>

            <button
              onClick={addStakeholder}
              disabled={
                !newStakeholder.id || 
                !newStakeholder.role.trim() || 
                !!idError ||
                newStakeholder.concerns.filter(c => c.trim()).length === 0
              }
              className="flex items-center px-4 py-2 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 disabled:text-white disabled:bg-gray-400 disabled:cursor-not-allowed dark:disabled:bg-gray-600"
            >
              <FiPlus className="mr-2" />
              {t.add}
            </button>
          </div>
        </div>

        {/* 既存のステークホルダー一覧 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{t.registeredStakeholders}</h2>
          
          <div className="space-y-6">
            {/* デフォルトステークホルダー */}
            <div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
                {t.defaultStakeholders}
              </h3>
              <div className="space-y-3">
                {predefinedStakeholders.map((stakeholder) => (
                  <div key={stakeholder.id} className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{stakeholder.role}</h3>
                        <p className="text-base text-gray-500 dark:text-gray-400 mb-2">ID: {stakeholder.id}</p>
                        <ul className="mt-2 text-base text-gray-600 dark:text-gray-300 list-disc list-inside">
                          {stakeholder.concerns.map((concern, index) => (
                            <li key={index}>{concern}</li>
                          ))}
                        </ul>
                      </div>
                      <span className="text-base text-gray-400 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                        {t.systemDefined}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* カスタムステークホルダー */}
            {customStakeholders.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
                  {t.customStakeholders}
                </h3>
                <div className="space-y-3">
                  {customStakeholders.map((stakeholder) => (
                    <div key={stakeholder.id} className="border dark:border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{stakeholder.role}</h3>
                          <p className="text-base text-gray-500 dark:text-gray-400 mb-2">ID: {stakeholder.id}</p>
                          <ul className="mt-2 text-base text-gray-600 dark:text-gray-300 list-disc list-inside">
                            {stakeholder.concerns.map((concern, index) => (
                              <li key={index}>{concern}</li>
                            ))}
                          </ul>
                        </div>
                        <button
                          onClick={() => deleteStakeholder(stakeholder.id)}
                          className="ml-4 p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 rounded"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ホームに戻るボタン */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500 underline"
          >
            {t.backToReport}
          </Link>
        </div>
      </div>
    </main>
  );
}