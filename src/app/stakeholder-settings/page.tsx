'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Stakeholder } from '@/types';
import { PREDEFINED_STAKEHOLDERS } from '@/lib/stakeholders';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX } from 'react-icons/fi';

export default function StakeholderSettings() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStakeholder, setNewStakeholder] = useState({
    role: '',
    concerns: ['']
  });

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

  const addStakeholder = () => {
    if (newStakeholder.role.trim()) {
      const stakeholder: Stakeholder = {
        id: `custom-${Date.now()}`,
        role: newStakeholder.role,
        concerns: newStakeholder.concerns.filter(c => c.trim())
      };
      const updated = [...stakeholders, stakeholder];
      setStakeholders(updated);
      saveToLocalStorage(updated);
      setNewStakeholder({ role: '', concerns: [''] });
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

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          ステークホルダー設定
        </h1>

        {/* 新規追加フォーム */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">新しいステークホルダーを追加</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                役職・部門名
              </label>
              <input
                type="text"
                value={newStakeholder.role}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, role: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500"
                placeholder="例: 品質保証部門"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                主な関心事
              </label>
              {newStakeholder.concerns.map((concern, index) => (
                <div key={index} className="flex mb-2">
                  <input
                    type="text"
                    value={concern}
                    onChange={(e) => updateConcern(index, e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500"
                    placeholder="関心事を入力"
                  />
                  {newStakeholder.concerns.length > 1 && (
                    <button
                      onClick={() => removeConcernField(index)}
                      className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <FiX />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addConcernField}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + 関心事を追加
              </button>
            </div>

            <button
              onClick={addStakeholder}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <FiPlus className="mr-2" />
              追加
            </button>
          </div>
        </div>

        {/* 既存のステークホルダー一覧 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">登録済みステークホルダー</h2>
          
          <div className="space-y-4">
            {stakeholders.map((stakeholder) => (
              <div key={stakeholder.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg">{stakeholder.role}</h3>
                    <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                      {stakeholder.concerns.map((concern, index) => (
                        <li key={index}>{concern}</li>
                      ))}
                    </ul>
                  </div>
                  {!PREDEFINED_STAKEHOLDERS.some(ps => ps.id === stakeholder.id) && (
                    <button
                      onClick={() => deleteStakeholder(stakeholder.id)}
                      className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <FiTrash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ホームに戻るボタン */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            レポート生成画面に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}