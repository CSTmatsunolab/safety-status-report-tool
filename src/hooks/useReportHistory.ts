// src/hooks/useReportHistory.ts
'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/app/components/AuthProvider';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Report, UploadedFile } from '@/types';

export interface ReportMetadata {
  userId: string;
  reportId: string;
  title: string;
  stakeholder: {
    id: string;
    role: string;
  };
  structure?: {
    id: string;
    name: string;
  };
  rhetoricStrategy: string;
  createdAt: string;
  s3Key: string;
  fileCount: number;
  files?: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    originalType?: string;
    useFullText?: boolean;
    source?: 'uploaded' | 'knowledgebase';
    chunkCount?: number;
    s3Key?: string;
  }>;
}

export interface ReportDetail extends ReportMetadata {
  content: string;
}

interface UseReportHistoryReturn {
  // 一覧
  reports: ReportMetadata[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadReports: () => Promise<void>;
  loadMore: () => Promise<void>;
  
  // 詳細
  getReport: (reportId: string) => Promise<ReportDetail | null>;
  
  // 保存
  saveReport: (report: Report, inputFiles?: UploadedFile[], userIdentifier?: string, structure?: { id: string; name: string }) => Promise<{ success: boolean; reportId?: string; error?: string }>;
  isSaving: boolean;
  
  // 削除
  deleteReport: (reportId: string) => Promise<boolean>;
  isDeleting: boolean;
  
  // 認証状態
  isAuthenticated: boolean;
}

export function useReportHistory(): UseReportHistoryReturn {
  const { user, status: authStatus } = useAuth();
  const [reports, setReports] = useState<ReportMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const isAuthenticated = authStatus === 'authenticated' && !!user;

  // 認証トークンを取得
  const getAuthToken = async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch {
      return null;
    }
  };

  // レポート一覧を取得
  const loadReports = useCallback(async () => {
    if (!isAuthenticated) {
      setReports([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/reports?limit=20', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load reports');
      }

      const data = await response.json();
      setReports(data.reports);
      setLastKey(data.lastKey);
      setHasMore(!!data.lastKey);
    } catch (err) {
      console.error('Load reports error:', err);
      setError('レポートの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // 追加読み込み
  const loadMore = useCallback(async () => {
    if (!isAuthenticated || !lastKey || isLoading) return;

    setIsLoading(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/reports?limit=20&lastKey=${encodeURIComponent(lastKey)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load more reports');
      }

      const data = await response.json();
      setReports(prev => [...prev, ...data.reports]);
      setLastKey(data.lastKey);
      setHasMore(!!data.lastKey);
    } catch (err) {
      console.error('Load more error:', err);
      setError('追加の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, lastKey, isLoading]);

  // レポート詳細を取得
  const getReport = useCallback(async (reportId: string): Promise<ReportDetail | null> => {
    if (!isAuthenticated) return null;

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/reports/${reportId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to get report');
      }

      return await response.json();
    } catch (err) {
      console.error('Get report error:', err);
      return null;
    }
  }, [isAuthenticated]);

  // レポートを保存
  const saveReport = useCallback(async (
    report: Report,
    inputFiles?: UploadedFile[],
    userIdentifier?: string,
    structure?: { id: string; name: string }
  ): Promise<{ success: boolean; reportId?: string; error?: string }> => {
    if (!isAuthenticated) {
      return { success: false, error: 'ログインが必要です' };
    }

    setIsSaving(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // 1. 現在セッションでアップロードしたファイルのメタデータ
      const uploadedFileMetadata = inputFiles?.map(file => {
        console.log('Processing uploaded file:', file.name, file);
        return {
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.metadata?.size || file.content?.length || 0,
          originalType: file.metadata?.originalType || 'unknown',
          useFullText: file.includeFullText === true,
          source: 'uploaded' as const,
        };
      }) || [];

      // 2. Pineconeからナレッジベースのファイル情報を取得
      let knowledgeBaseFiles: Array<{
        id: string;
        name: string;
        type: string;
        size: number;
        originalType: string;
        useFullText: boolean;
        source: 'knowledgebase';
        chunkCount?: number;
      }> = [];

      if (userIdentifier && report.stakeholder?.id) {
        try {
          console.log('Fetching knowledge base files...');
          const kbResponse = await fetch(
            `/api/list-knowledge-files?stakeholderId=${encodeURIComponent(report.stakeholder.id)}&userIdentifier=${encodeURIComponent(userIdentifier)}`
          );
          
          if (kbResponse.ok) {
            const kbData = await kbResponse.json();
            console.log('Knowledge base files:', kbData);
            
            if (kbData.files && Array.isArray(kbData.files)) {
              knowledgeBaseFiles = kbData.files.map((file: { fileName: string; chunkCount?: number; uploadedAt?: string }) => ({
                id: `kb_${file.fileName}`,
                name: file.fileName,
                type: 'knowledgebase',
                size: 0,
                originalType: 'unknown',
                useFullText: false,
                source: 'knowledgebase' as const,
                chunkCount: file.chunkCount || 0,
              }));
            }
          }
        } catch (kbError) {
          console.warn('Failed to fetch knowledge base files:', kbError);
          // ナレッジベースの取得に失敗しても続行
        }
      }

      // 3. アップロードファイルとナレッジベースファイルをマージ（重複排除）
      const uploadedFileNames = new Set(uploadedFileMetadata.map(f => f.name));
      const uniqueKbFiles = knowledgeBaseFiles.filter(f => !uploadedFileNames.has(f.name));
      
      const allFiles = [...uploadedFileMetadata, ...uniqueKbFiles];

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report: {
            title: report.title,
            content: report.content,
            stakeholder: report.stakeholder,
            rhetoricStrategy: report.rhetoricStrategy,
            structure: structure || null,
          },
          fileMetadata: allFiles,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save report');
      }

      const data = await response.json();
      
      // 一覧を更新
      await loadReports();

      return { success: true, reportId: data.reportId };
    } catch (err) {
      console.error('Save report error:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : '保存に失敗しました' 
      };
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, loadReports]);

  // レポートを削除
  const deleteReport = useCallback(async (reportId: string): Promise<boolean> => {
    if (!isAuthenticated) return false;

    setIsDeleting(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      // 一覧から削除
      setReports(prev => prev.filter(r => r.reportId !== reportId));

      return true;
    } catch (err) {
      console.error('Delete report error:', err);
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [isAuthenticated]);

  return {
    reports,
    isLoading,
    error,
    hasMore,
    loadReports,
    loadMore,
    getReport,
    saveReport,
    isSaving,
    deleteReport,
    isDeleting,
    isAuthenticated,
  };
}