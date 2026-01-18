// src/app/history/page.tsx
'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  FiFileText, 
  FiTrash2, 
  FiClock, 
  FiUser, 
  FiFile, 
  FiLoader, 
  FiArrowLeft, 
  FiAlertCircle,
  FiArrowUp,
  FiArrowDown,
  FiFilter,
  FiChevronDown,
  FiCheck,
  FiCloud,
  FiHardDrive,
  FiSquare,
  FiCheckSquare,
  FiMinusSquare
} from 'react-icons/fi';
import { useI18n } from '../components/I18nProvider';
import { useAuth } from '../components/AuthProvider';
import { useReportHistory, ReportMetadata } from '@/hooks/useReportHistory';

type SortOrder = 'newest' | 'oldest';

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
    deleteReports,
    isDeleting,
    isAuthenticated,
  } = useReportHistory();

  // ソート・フィルター状態
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [stakeholderFilter, setStakeholderFilter] = useState<string>('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 選択状態管理
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 初回読み込み
  useEffect(() => {
    if (authStatus === 'authenticated') {
      loadReports();
    }
  }, [authStatus, loadReports]);


  // ユニークなステークホルダー一覧を取得
  const uniqueStakeholders = useMemo(() => {
    const stakeholderMap = new Map<string, string>();
    reports.forEach(report => {
      if (!stakeholderMap.has(report.stakeholder.id)) {
        stakeholderMap.set(report.stakeholder.id, report.stakeholder.role);
      }
    });
    return Array.from(stakeholderMap.entries()).map(([id, role]) => ({ id, role }));
  }, [reports]);

  // フィルタリング・ソート済みレポート
  const filteredAndSortedReports = useMemo(() => {
    let result = [...reports];

    // ステークホルダーフィルター
    if (stakeholderFilter !== 'all') {
      result = result.filter(r => r.stakeholder.id === stakeholderFilter);
    }

    // ソート
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [reports, stakeholderFilter, sortOrder]);

  const selectionState = useMemo(() => {
    const filteredIds = new Set(filteredAndSortedReports.map(r => r.reportId));
    const selectedInFiltered = [...selectedIds].filter(id => filteredIds.has(id));
    
    return {
      // フィルター内での選択数
      selectedInFilterCount: selectedInFiltered.length,
      // 全体での選択数
      totalSelectedCount: selectedIds.size,
      // フィルター内の総数
      totalFiltered: filteredAndSortedReports.length,
      // フィルター内が全選択されているか
      isAllSelected: selectedInFiltered.length === filteredAndSortedReports.length && filteredAndSortedReports.length > 0,
      // フィルター内で一部選択されているか
      isSomeSelected: selectedInFiltered.length > 0 && selectedInFiltered.length < filteredAndSortedReports.length,
      // フィルター外にも選択があるか
      hasSelectionsOutsideFilter: selectedIds.size > selectedInFiltered.length,
    };
  }, [selectedIds, filteredAndSortedReports]);

  // 個別選択トグル
  const handleToggleSelect = (reportId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reportId)) {
        newSet.delete(reportId);
      } else {
        newSet.add(reportId);
      }
      return newSet;
    });
  };

  // 全選択/全解除トグル（フィルター適用後のアイテムのみ）
  const handleToggleSelectAll = () => {
    if (selectionState.isAllSelected) {
      // 全解除：フィルター内のアイテムのみ解除
      const filteredIds = new Set(filteredAndSortedReports.map(r => r.reportId));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        filteredIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // 全選択：フィルター内のアイテムを追加
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        filteredAndSortedReports.forEach(r => newSet.add(r.reportId));
        return newSet;
      });
    }
  };

  // 選択モード終了
  const handleExitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  // 一括削除処理（フィルターに関係なく全ての選択を削除）
  const handleBulkDelete = async () => {
    const selectedCount = selectionState.totalSelectedCount;
    if (selectedCount === 0) return;

    // フィルター外の選択がある場合は追加の警告
    const warningMsg = selectionState.hasSelectionsOutsideFilter
      ? (language === 'en'
          ? `\n\nNote: This includes ${selectedCount - selectionState.selectedInFilterCount} report(s) not shown in current filter.`
          : `\n\n※ 現在のフィルター外の ${selectedCount - selectionState.selectedInFilterCount} 件も含まれます。`)
      : '';

    const confirmMsg = language === 'en'
      ? `Are you sure you want to delete ${selectedCount} selected report(s)?${warningMsg}\n\nThis action cannot be undone.`
      : `選択した ${selectedCount} 件のレポートを削除しますか？${warningMsg}\n\nこの操作は取り消せません。`;
    
    if (!confirm(confirmMsg)) return;

    // 全ての選択されたIDを削除対象にする
    const idsToDelete = [...selectedIds];

    const result = await deleteReports(idsToDelete);
    
    if (result.deletedCount > 0) {
      // 削除成功したIDを選択から除去
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        idsToDelete.forEach(id => newSet.delete(id));
        return newSet;
      });
    }

    // 結果を通知
    if (result.failedCount > 0) {
      const msg = language === 'en'
        ? `Deleted ${result.deletedCount} report(s). Failed to delete ${result.failedCount} report(s).`
        : `${result.deletedCount} 件削除しました。${result.failedCount} 件の削除に失敗しました。`;
      alert(msg);
    } else if (result.deletedCount > 0) {
      // 全て成功した場合は選択モードを終了
      if (selectedIds.size === result.deletedCount) {
        setIsSelectMode(false);
      }
    }
  };

  // 削除処理（単体）
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
    backToReport: language === 'en' ? 'Back to Home' : 'レポート生成画面に戻る',
    noReports: language === 'en' ? 'No reports saved yet' : '保存されたレポートはありません',
    noReportsHint: language === 'en' 
      ? 'Generate a report and click "Save to History" to save it here.'
      : 'レポートを生成して「履歴に保存」をクリックすると、ここに保存されます。',
    noFilteredReports: language === 'en' ? 'No reports match the filter' : '条件に一致するレポートはありません',
    loginRequired: language === 'en' ? 'Login required to view history' : '履歴を見るにはログインが必要です',
    loginButton: language === 'en' ? 'Login' : 'ログイン',
    loadMore: language === 'en' ? 'Load More' : 'もっと読み込む',
    loading: language === 'en' ? 'Loading...' : '読み込み中...',
    files: language === 'en' ? 'files' : 'ファイル',
    sortNewest: language === 'en' ? 'Newest first' : '新しい順',
    sortOldest: language === 'en' ? 'Oldest first' : '古い順',
    filterAll: language === 'en' ? 'All stakeholders' : 'すべて',
    filterLabel: language === 'en' ? 'Filter' : '絞り込み',
    sortLabel: language === 'en' ? 'Sort' : '並び替え',
    syncingCloud: language === 'en' ? 'Syncing...' : '同期中...',
    storedInCloud: language === 'en' ? 'Cloud Storage' : 'クラウド保存',
    storedLocally: language === 'en' ? 'Local Storage' : 'ローカル保存',
    // 一括削除関連
    selectMode: language === 'en' ? 'Select' : '選択',
    cancelSelect: language === 'en' ? 'Cancel' : 'キャンセル',
    selectAll: language === 'en' ? 'Select All' : 'すべて選択',
    deselectAll: language === 'en' ? 'Deselect All' : '選択解除',
    deleteSelected: language === 'en' ? 'Delete Selected' : '選択を削除',
    selected: language === 'en' ? 'selected' : '件選択中',
    selectedInFilter: language === 'en' ? 'in filter' : 'フィルター内',
    selectedTotal: language === 'en' ? 'total' : '合計',
    deleting: language === 'en' ? 'Deleting...' : '削除中...',
    clearSelection: language === 'en' ? 'Clear All' : '選択をクリア',
  };

  // 未ログイン時
  if (authStatus === 'unauthenticated') {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
            <FiAlertCircle className="mx-auto text-yellow-500 mb-4" size={48} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {texts.loginRequired}
            </h2>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {texts.backToReport}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ローディング時
  if (authStatus === 'loading') {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
          <FiLoader className="animate-spin text-gray-400" size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">

        {/* ヘッダー上部 - 戻るボタン & ストレージ状態 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <FiArrowLeft className="mr-2" />
              {texts.backToReport}
            </Link>
          </div>
          
          {/* ストレージ状態インジケーター */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isAuthenticated 
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}>
            {isLoading ? (
              <>
                <FiLoader className="animate-spin" size={14} />
                <span>{texts.syncingCloud}</span>
              </>
            ) : isAuthenticated ? (
              <>
                <FiCloud size={14} />
                <span>{texts.storedInCloud}</span>
              </>
            ) : (
              <>
                <FiHardDrive size={14} />
                <span>{texts.storedLocally}</span>
              </>
            )}
          </div>
        </div>

        {/* タイトル行 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {texts.pageTitle}
          </h1>
          
          {/* 選択モードボタン */}
          {reports.length > 0 && (
            <div className="flex items-center gap-2">
              {isSelectMode ? (
                <button
                  onClick={handleExitSelectMode}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  {texts.cancelSelect}
                </button>
              ) : (
                <button
                  onClick={() => setIsSelectMode(true)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {texts.selectMode}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 選択モード時の操作バー */}
        {isSelectMode && filteredAndSortedReports.length > 0 && (
          <div className="mb-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                {/* 全選択チェックボックス */}
                <button
                  onClick={handleToggleSelectAll}
                  className="flex items-center gap-2 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200"
                >
                  {selectionState.isAllSelected ? (
                    <FiCheckSquare size={20} />
                  ) : selectionState.isSomeSelected ? (
                    <FiMinusSquare size={20} />
                  ) : (
                    <FiSquare size={20} />
                  )}
                  <span className="text-sm font-medium">
                    {selectionState.isAllSelected ? texts.deselectAll : texts.selectAll}
                  </span>
                </button>
                
                {/* 選択件数表示（フィルター内と全体） */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-blue-600 dark:text-blue-400">
                    {selectionState.selectedInFilterCount} / {selectionState.totalFiltered} {texts.selectedInFilter}
                  </span>
                  {selectionState.hasSelectionsOutsideFilter && (
                    <>
                      <span className="text-gray-400">|</span>
                      <span className="text-blue-700 dark:text-blue-300 font-medium">
                        {texts.selectedTotal}: {selectionState.totalSelectedCount}
                      </span>
                    </>
                  )}
                </div>

                {/* 選択クリアボタン */}
                {selectionState.totalSelectedCount > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
                  >
                    {texts.clearSelection}
                  </button>
                )}
              </div>

              {/* 一括削除ボタン */}
              <button
                onClick={handleBulkDelete}
                disabled={selectionState.totalSelectedCount === 0 || isDeleting}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectionState.totalSelectedCount === 0 || isDeleting
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : 'bg-red-500 dark:bg-red-600 text-white hover:bg-red-600 dark:hover:bg-red-700'
                }`}
              >
                {isDeleting ? (
                  <FiLoader className="animate-spin" size={16} />
                ) : (
                  <FiTrash2 size={16} />
                )}
                {isDeleting ? texts.deleting : texts.deleteSelected}
                {selectionState.totalSelectedCount > 0 && !isDeleting && ` (${selectionState.totalSelectedCount})`}
              </button>
            </div>
            
            {/* フィルター外の選択がある場合の通知 */}
            {selectionState.hasSelectionsOutsideFilter && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {language === 'en' 
                    ? ` ${selectionState.totalSelectedCount - selectionState.selectedInFilterCount} report(s) selected in other filters will also be deleted.`
                    : ` 他のフィルターで選択した ${selectionState.totalSelectedCount - selectionState.selectedInFilterCount} 件も削除対象に含まれます。`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ソート・フィルターツールバー */}
        {reports.length > 0 && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* ソート */}
              <div className="flex items-center gap-2">
                <span className="text-base text-gray-500 dark:text-gray-400">
                  {texts.sortLabel}:
                </span>
                <button
                  onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-base bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {sortOrder === 'newest' ? (
                    <>
                      <FiArrowDown size={14} />
                      {texts.sortNewest}
                    </>
                  ) : (
                    <>
                      <FiArrowUp size={14} />
                      {texts.sortOldest}
                    </>
                  )}
                </button>
              </div>

              {/* フィルター */}
              {uniqueStakeholders.length > 1 && (
                <div className="flex items-center gap-2">
                  <FiFilter className="text-gray-400" size={14} />
                  <span className="text-base text-gray-500 dark:text-gray-400">
                    {texts.filterLabel}:
                  </span>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="
                        flex items-center gap-2 px-3 py-1.5 rounded-md text-base
                        bg-gray-100 dark:bg-gray-700
                        text-gray-700 dark:text-gray-300
                        hover:bg-gray-200 dark:hover:bg-gray-600
                        transition-colors cursor-pointer min-w-[180px]
                      "
                    >
                      <span className="flex-1 text-left truncate">
                        {stakeholderFilter === 'all' 
                          ? texts.filterAll 
                          : uniqueStakeholders.find(s => s.id === stakeholderFilter)?.role || texts.filterAll}
                      </span>
                      <FiChevronDown 
                        className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
                        size={16} 
                      />
                    </button>
                    
                    {/* ドロップダウンメニュー */}
                    {isDropdownOpen && (
                      <div className="
                        absolute top-full left-0 mt-1 z-50
                        bg-white dark:bg-gray-800
                        border border-gray-200 dark:border-gray-600
                        rounded-lg shadow-lg
                        min-w-[220px] max-h-[300px] overflow-y-auto
                      ">
                        {/* すべて */}
                        <button
                          onClick={() => {
                            setStakeholderFilter('all');
                            setIsDropdownOpen(false);
                          }}
                          className={`
                            w-full flex items-center gap-2 px-4 py-3 text-base text-left
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            ${stakeholderFilter === 'all' 
                              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                              : 'text-gray-700 dark:text-gray-300'}
                          `}
                        >
                          {stakeholderFilter === 'all' && <FiCheck size={16} />}
                          <span className={stakeholderFilter === 'all' ? '' : 'ml-6'}>{texts.filterAll}</span>
                        </button>
                        
                        {/* ステークホルダー一覧 */}
                        {uniqueStakeholders.map(({ id, role }) => (
                          <button
                            key={id}
                            onClick={() => {
                              setStakeholderFilter(id);
                              setIsDropdownOpen(false);
                            }}
                            className={`
                              w-full flex items-center gap-2 px-4 py-3 text-base text-left
                              hover:bg-gray-100 dark:hover:bg-gray-700
                              ${stakeholderFilter === id 
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                                : 'text-gray-700 dark:text-gray-300'}
                            `}
                          >
                            {stakeholderFilter === id && <FiCheck size={16} />}
                            <span className={stakeholderFilter === id ? '' : 'ml-6'}>{role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 件数表示 */}
              <div className="ml-auto text-base text-gray-500 dark:text-gray-400">
                {filteredAndSortedReports.length} / {reports.length} {language === 'en' ? 'reports' : '件'}
              </div>
            </div>
          </div>
        )}

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
        ) : filteredAndSortedReports.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
            <FiFilter className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {texts.noFilteredReports}
            </h3>
            <button
              onClick={() => setStakeholderFilter('all')}
              className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {language === 'en' ? 'Clear filter' : 'フィルターを解除'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedReports.map((report) => {
              const isSelected = selectedIds.has(report.reportId);
              
              return (
                <div
                  key={report.reportId}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow ${
                    isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
                  }`}
                >
                  <div className="p-4 sm:p-6">
                    <div className="flex items-start justify-between">
                      {/* チェックボックス */}
                      {isSelectMode && (
                        <button
                          onClick={() => handleToggleSelect(report.reportId)}
                          className="mr-4 mt-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {isSelected ? (
                            <FiCheckSquare size={22} className="text-blue-600 dark:text-blue-400" />
                          ) : (
                            <FiSquare size={22} />
                          )}
                        </button>
                      )}
                      
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
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base text-gray-500 dark:text-gray-400">
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

                      {/* アクションボタン（選択モードでない時のみ表示） */}
                      {!isSelectMode && (
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
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

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
    </div>
  );
}