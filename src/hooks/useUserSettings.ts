// src/hooks/useUserSettings.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/components/AuthProvider';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Stakeholder, ReportStructureTemplate } from '@/types';
import { getPredefinedStakeholders } from '@/lib/stakeholders';
import { getUserStorageKey } from '@/lib/browser-id';

type SettingType = 'customStakeholders' | 'customReportStructures';

interface UseUserSettingsOptions {
  language?: 'ja' | 'en';
}

interface UseUserSettingsReturn {
  // カスタムステークホルダー
  customStakeholders: Stakeholder[];
  setCustomStakeholders: (stakeholders: Stakeholder[]) => Promise<void>;
  addCustomStakeholder: (stakeholder: Stakeholder) => Promise<void>;
  deleteCustomStakeholder: (id: string) => Promise<void>;
  
  // カスタム構成
  customStructures: ReportStructureTemplate[];
  setCustomStructures: (structures: ReportStructureTemplate[]) => Promise<void>;
  addCustomStructure: (structure: ReportStructureTemplate) => Promise<void>;
  deleteCustomStructure: (id: string) => Promise<void>;
  
  // 全ステークホルダー（定義済み + カスタム）
  allStakeholders: Stakeholder[];
  
  // 状態
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

// APIからのレスポンス型
interface ApiResponse<T> {
  data?: T;
  settings?: Record<string, T>;
  success?: boolean;
  error?: string;
}

export function useUserSettings(options: UseUserSettingsOptions = {}): UseUserSettingsReturn {
  const { language = 'ja' } = options;
  const { user, status: authStatus, getUserIdentifier } = useAuth();
  
  const [customStakeholders, setCustomStakeholdersState] = useState<Stakeholder[]>([]);
  const [customStructures, setCustomStructuresState] = useState<ReportStructureTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = authStatus === 'authenticated' && !!user;
  const userIdentifier = getUserIdentifier();
  const predefinedStakeholders = getPredefinedStakeholders(language);

  // 認証トークンを取得
  const getAuthToken = async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch {
      return null;
    }
  };

  // API経由でデータを取得
  const fetchFromApi = async <T>(type: SettingType): Promise<T | null> => {
    const token = await getAuthToken();
    if (!token) return null;

    try {
      const response = await fetch(`/api/user-settings?type=${type}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch from API');
      }

      const result: ApiResponse<T> = await response.json();
      return result.data || null;
    } catch (err) {
      console.error(`Failed to fetch ${type} from API:`, err);
      return null;
    }
  };

  // API経由でデータを保存
  const saveToApi = async <T>(type: SettingType, data: T): Promise<boolean> => {
    const token = await getAuthToken();
    if (!token) return false;

    try {
      const response = await fetch('/api/user-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, data }),
      });

      if (!response.ok) {
        throw new Error('Failed to save to API');
      }

      return true;
    } catch (err) {
      console.error(`Failed to save ${type} to API:`, err);
      return false;
    }
  };

  // LocalStorageからデータを取得
  const fetchFromLocalStorage = <T>(type: SettingType): T | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      const storageKey = getUserStorageKey(type, userIdentifier);
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  // LocalStorageにデータを保存
  const saveToLocalStorage = <T>(type: SettingType, data: T): void => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getUserStorageKey(type, userIdentifier);
    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  // LocalStorageからDynamoDBへデータを移行
  const migrateLocalStorageToApi = async (): Promise<void> => {
    if (!isAuthenticated) return;

    // カスタムステークホルダーの移行
    const localStakeholders = fetchFromLocalStorage<Stakeholder[]>('customStakeholders');
    if (localStakeholders) {
      const customOnly = localStakeholders.filter(s => s.id.startsWith('custom_'));
      if (customOnly.length > 0) {
        const apiStakeholders = await fetchFromApi<Stakeholder[]>('customStakeholders');
        if (!apiStakeholders || apiStakeholders.length === 0) {
          await saveToApi('customStakeholders', customOnly);
          console.log('Migrated custom stakeholders to DynamoDB');
        }
      }
    }

    // カスタム構成の移行
    const localStructures = fetchFromLocalStorage<ReportStructureTemplate[]>('customReportStructures');
    if (localStructures && localStructures.length > 0) {
      const apiStructures = await fetchFromApi<ReportStructureTemplate[]>('customReportStructures');
      if (!apiStructures || apiStructures.length === 0) {
        await saveToApi('customReportStructures', localStructures);
        console.log('Migrated custom structures to DynamoDB');
      }
    }
  };

  // 初期データの読み込み
  const loadSettings = useCallback(async () => {
    if (authStatus === 'loading') return;
    
    setIsLoading(true);
    setError(null);

    try {
      if (isAuthenticated) {
        // 認証済み: DynamoDBから取得（LocalStorageは移行用にのみ使用）
        await migrateLocalStorageToApi();
        
        const [apiStakeholders, apiStructures] = await Promise.all([
          fetchFromApi<Stakeholder[]>('customStakeholders'),
          fetchFromApi<ReportStructureTemplate[]>('customReportStructures'),
        ]);

        setCustomStakeholdersState(apiStakeholders || []);
        setCustomStructuresState(apiStructures || []);
      } else {
        // 未認証: LocalStorageから取得
        const localStakeholders = fetchFromLocalStorage<Stakeholder[]>('customStakeholders');
        const localStructures = fetchFromLocalStorage<ReportStructureTemplate[]>('customReportStructures');

        // カスタムのみを抽出
        const customOnly = localStakeholders?.filter(s => s.id.startsWith('custom_')) || [];
        
        setCustomStakeholdersState(customOnly);
        setCustomStructuresState(localStructures || []);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('設定の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, isAuthenticated, userIdentifier]);

  // 認証状態が変わったら再読み込み
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // カスタムステークホルダーを設定
  const setCustomStakeholders = async (stakeholders: Stakeholder[]): Promise<void> => {
    setIsSyncing(true);
    setError(null);

    try {
      const customOnly = stakeholders.filter(s => s.id.startsWith('custom_'));
      
      if (isAuthenticated) {
        const success = await saveToApi('customStakeholders', customOnly);
        if (!success) {
          throw new Error('Failed to save to API');
        }
      } else {
        // 未認証時はLocalStorageに保存（定義済み + カスタム）
        const dataToSave = [...predefinedStakeholders, ...customOnly];
        saveToLocalStorage('customStakeholders', dataToSave);
      }
      
      setCustomStakeholdersState(customOnly);
    } catch (err) {
      console.error('Failed to set custom stakeholders:', err);
      setError('ステークホルダーの保存に失敗しました');
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  // カスタムステークホルダーを追加
  const addCustomStakeholder = async (stakeholder: Stakeholder): Promise<void> => {
    const updated = [...customStakeholders, stakeholder];
    await setCustomStakeholders(updated);
  };

  // カスタムステークホルダーを削除
  const deleteCustomStakeholder = async (id: string): Promise<void> => {
    const updated = customStakeholders.filter(s => s.id !== id);
    await setCustomStakeholders(updated);
  };

  // カスタム構成を設定
  const setCustomStructures = async (structures: ReportStructureTemplate[]): Promise<void> => {
    setIsSyncing(true);
    setError(null);

    try {
      if (isAuthenticated) {
        const success = await saveToApi('customReportStructures', structures);
        if (!success) {
          throw new Error('Failed to save to API');
        }
      } else {
        saveToLocalStorage('customReportStructures', structures);
      }
      
      setCustomStructuresState(structures);
    } catch (err) {
      console.error('Failed to set custom structures:', err);
      setError('レポート構成の保存に失敗しました');
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  // カスタム構成を追加
  const addCustomStructure = async (structure: ReportStructureTemplate): Promise<void> => {
    const updated = [...customStructures, structure];
    await setCustomStructures(updated);
  };

  // カスタム構成を削除
  const deleteCustomStructure = async (id: string): Promise<void> => {
    const updated = customStructures.filter(s => s.id !== id);
    await setCustomStructures(updated);
  };

  // 全ステークホルダー（定義済み + カスタム）
  const allStakeholders = [...predefinedStakeholders, ...customStakeholders];

  return {
    customStakeholders,
    setCustomStakeholders,
    addCustomStakeholder,
    deleteCustomStakeholder,
    customStructures,
    setCustomStructures,
    addCustomStructure,
    deleteCustomStructure,
    allStakeholders,
    isLoading,
    isSyncing,
    error,
    isAuthenticated,
  };
}
