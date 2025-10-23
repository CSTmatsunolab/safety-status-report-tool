'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Stakeholder } from '@/types';
import { PREDEFINED_STAKEHOLDERS } from '@/lib/stakeholders';
import { FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { ThemeToggle } from '../components/ThemeToggle';

export default function StakeholderSettings() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [concernsError, setConcernsError] = useState('');
  const [newStakeholder, setNewStakeholder] = useState({
    id: '',
    role: '',
    concerns: ['']
  });
  const [idError, setIdError] = useState('');

  useEffect(() => {
    // ローカルストレージから保存されたステークホルダーを読み込む
    const saved = localStorage.getItem('customStakeholders');
    if (saved) {
      setStakeholders(JSON.parse(saved));
    } else {
      setStakeholders(PREDEFINED_STAKEHOLDERS);
    }
  }, []);

  const saveToLocalStorage = (data: Stakeholder[]) => {
    localStorage.setItem('customStakeholders', JSON.stringify(data));
  };

  // ID検証関数（大文字小文字を区別）
  const validateId = (id: string): string => {
    if (!id.trim()) {
      return 'IDを入力してください';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
      return '英字、数字、ハイフン(-)、アンダースコア(_)のみ使用できます';
    }
    if (id.length < 3) {
      return 'IDは3文字以上にしてください';
    }
    if (id.length > 30) {
      return 'IDは30文字以内にしてください';
    }
    
    // Pineconeは大文字小文字を区別するため、そのままチェック
    const fullId = `custom_${id}`;
    
    if (stakeholders.some(s => s.id === fullId)) {
      return 'このIDは既に使用されています';
    }
    
    // デフォルトIDとの衝突チェック（念のため大文字小文字を無視）
    if (PREDEFINED_STAKEHOLDERS.some(s => s.id.toLowerCase() === id.toLowerCase())) {
      return 'このIDはシステムで予約されています';
    }
    
    return '';
  };

  const handleIdChange = (value: string) => {
    setNewStakeholder({ ...newStakeholder, id: value });
    setIdError(validateId(value));
  };

  const addStakeholder = () => {
    // IDの検証
    const idError = validateId(newStakeholder.id);
    if (idError) {
      setIdError(idError);
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
    if (confirm('このステークホルダーを削除しますか？')) {
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
    return '少なくとも1つの関心事を入力してください';
  }
  return '';
  };

  // カスタムステークホルダーのみを抽出
  const customStakeholders = stakeholders.filter(s => s.id.startsWith('custom_'));

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
                {/* ヘッダー */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white transition-colors">
                      <Link href="/">Safety Status Report 自動生成ツール</Link>
                  </h1>
                  <div className="flex items-center gap-4">
                    <ThemeToggle />
                  </div>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          ステークホルダー設定
        </h1>

        {/* 新規追加フォーム */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">新しいステークホルダーを追加</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                ID <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newStakeholder.id}
                onChange={(e) => handleIdChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 ${
                  idError ? 'border-red-500 dark:border-red-400' : 'border-gray-300'
                }`}
                placeholder="例: QA-Team, Security-Dept, KEIEI-KIKAKU"
                maxLength={30}
              />
              {idError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{idError}</p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                で識別するためのID。大文字小文字は区別されます。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                役職・部門名 <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newStakeholder.role}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500"
                placeholder="例: 品質保証部門"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                主な関心事 <span className="text-red-500 dark:text-red-400">*</span>
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
                    placeholder="関心事を入力"
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
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{concernsError}</p>
              )}
              <button
                onClick={addConcernField}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500"
              >
                + 関心事を追加
              </button>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                レポート生成時の検索精度に影響します。具体的に記入してください。<br/>
                精度向上のため、3つ以上の入力をおすすめします。
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
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-gray-600"
            >
              <FiPlus className="mr-2" />
              追加
            </button>
          </div>
        </div>

        {/* 既存のステークホルダー一覧 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">登録済みステークホルダー</h2>
          
          <div className="space-y-6">
            {/* デフォルトステークホルダー */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
                デフォルトステークホルダー
              </h3>
              <div className="space-y-3">
                {PREDEFINED_STAKEHOLDERS.map((stakeholder) => (
                  <div key={stakeholder.id} className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{stakeholder.role}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">ID: {stakeholder.id}</p>
                        <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                          {stakeholder.concerns.map((concern, index) => (
                            <li key={index}>{concern}</li>
                          ))}
                        </ul>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                        システム定義
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* カスタムステークホルダー */}
            {customStakeholders.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
                  カスタムステークホルダー
                </h3>
                <div className="space-y-3">
                  {customStakeholders.map((stakeholder) => (
                    <div key={stakeholder.id} className="border dark:border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{stakeholder.role}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">ID: {stakeholder.id}</p>
                          <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
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
            レポート生成画面に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}