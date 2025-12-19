// src/app/history/page.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiFileText, FiTrash2, FiClock, FiUser, FiFile, FiLoader, FiArrowLeft, FiAlertCircle } from 'react-icons/fi';
import { useI18n } from '../components/I18nProvider';
import { useAuth } from '../components/AuthProvider';
import { SettingsMenu } from '../components/SettingsMenu';
import { useReportHistory, ReportMetadata } from '@/hooks/useReportHistory';

export default function HistoryPage() {
  const { t, language } = useI18n();
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const {
    reports,
    isLoading,
    error,
    hasMore,
    loadReports,
    loadMore,
    deleteReport,
    isDeleting,
    isAuthenticated,
  } = useReportHistory();

  // 初回読み込み
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadReports();
    }
  }, [authStatus, loadReports]);

  // 削除処理
  const handleDelete = async (report: ReportMetadata) => {
    const confirmMsg = language === 'en'
      ? `Are you sure you want to delete "${report.title}"?`
      : `「${report.title}」を削除しますか？`;
    
    if (!confirm(confirmMsg)) return;

    const success = await deleteReport(report.reportId);
    if (!success) {
      alert(language === 'en' ? 'Failed to delete report' : 'レポートの削除に失敗しました');
    }
  };

  // 日時フォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'en' ? 'en-US' : 'ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // テキスト
  const texts = {
    pageTitle: language === 'en' ? 'Report History' : 'レポート履歴',
    appTitle: language === 'en' ? 'Safety Status Report Generator' : 'Safety Status Report 自動生成ツール',
    backToHome: language === 'en' ? 'Back to Home' : 'ホームに戻る',
    noReports: language === 'en' ? 'No reports saved yet' : '保存されたレポートはありません',
    noReportsHint: language === 'en' 
      ? 'Generate a report and click "Save to History" to save it here.'
      : 'レポートを生成して「履歴に保存」をクリックすると、ここに保存されます。',
    loginRequired: language === 'en' ? 'Login required to view history' : '履歴を見るにはログインが必要です',
    loginButton: language === 'en' ? 'Login' : 'ログイン',
    loadMore: language === 'en' ? 'Load More' : 'もっと読み込む',
    loading: language === 'en' ? 'Loading...' : '読み込み中...',
    files: language === 'en' ? 'files' : 'ファイル',
  };

  // 未ログイン時
  if (authStatus === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              <Link href="/">{texts.appTitle}</Link>
            </h1>
            <SettingsMenu />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
            <FiAlertCircle className="mx-auto text-yellow-500 mb-4" size={48} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {texts.loginRequired}
            </h2>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {texts.backToHome}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ローディング時
  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
          <FiLoader className="animate-spin text-gray-400" size={32} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            <Link href="/">{texts.appTitle}</Link>
          </h1>
          <SettingsMenu />
        </div>

        {/* サブヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <FiArrowLeft className="mr-2" />
              {texts.backToHome}
            </Link>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {texts.pageTitle}
            </h2>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* レポート一覧 */}
        {isLoading && reports.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <FiLoader className="animate-spin text-gray-400" size={32} />
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
            <FiFileText className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {texts.noReports}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {texts.noReportsHint}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.reportId}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="p-4 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* タイトル */}
                      <Link
                        href={`/history/${report.reportId}`}
                        className="block group"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                          {report.title}
                        </h3>
                      </Link>

                      {/* メタ情報 */}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center">
                          <FiUser className="mr-1" />
                          {report.stakeholder.role}
                        </span>
                        <span className="flex items-center">
                          <FiClock className="mr-1" />
                          {formatDate(report.createdAt)}
                        </span>
                        {report.fileCount > 0 && (
                          <span className="flex items-center">
                            <FiFile className="mr-1" />
                            {report.fileCount} {texts.files}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* アクションボタン */}
                    <div className="flex items-center gap-2 ml-4">
                      <Link
                        href={`/history/${report.reportId}`}
                        className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <FiFileText size={20} />
                      </Link>
                      <button
                        onClick={() => handleDelete(report)}
                        disabled={isDeleting}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                      >
                        <FiTrash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* もっと読み込むボタン */}
            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  {isLoading ? texts.loading : texts.loadMore}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
