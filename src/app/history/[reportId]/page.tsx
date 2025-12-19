// src/app/history/[reportId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  FiArrowLeft, 
  FiDownload, 
  FiFile, 
  FiFileText, 
  FiPrinter, 
  FiTrash2, 
  FiLoader,
  FiClock,
  FiUser,
  FiCode,
  FiChevronDown,
  FiChevronUp,
  FiDatabase
} from 'react-icons/fi';
import { useI18n } from '../../components/I18nProvider';
import { useAuth } from '../../components/AuthProvider';
import { SettingsMenu } from '../../components/SettingsMenu';
import { useReportHistory, ReportDetail } from '@/hooks/useReportHistory';

export default function ReportDetailPage() {
  const { language } = useI18n();
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const params = useParams();
  const reportId = params.reportId as string;
  
  const { getReport, deleteReport, isDeleting, isAuthenticated } = useReportHistory();
  
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFilesExpanded, setIsFilesExpanded] = useState(false);

  // レポート詳細を読み込み
  useEffect(() => {
    const loadReport = async () => {
      if (authStatus !== 'authenticated') return;
      
      setIsLoading(true);
      setError(null);
      
      const data = await getReport(reportId);
      if (data) {
        setReport(data);
      } else {
        setError(language === 'en' ? 'Report not found' : 'レポートが見つかりません');
      }
      
      setIsLoading(false);
    };

    loadReport();
  }, [authStatus, reportId, getReport, language]);

  // 削除処理
  const handleDelete = async () => {
    if (!report) return;
    
    const confirmMsg = language === 'en'
      ? `Are you sure you want to delete "${report.title}"?`
      : `「${report.title}」を削除しますか？`;
    
    if (!confirm(confirmMsg)) return;

    const success = await deleteReport(report.reportId);
    if (success) {
      router.push('/history');
    } else {
      alert(language === 'en' ? 'Failed to delete report' : 'レポートの削除に失敗しました');
    }
  };

  // エクスポート: Markdown
  const handleExportMarkdown = () => {
    if (!report) return;
    const blob = new Blob([report.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // エクスポート: DOCX
  const handleExportDOCX = async () => {
    if (!report) return;
    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report: {
            title: report.title,
            content: report.content,
            stakeholder: report.stakeholder,
            rhetoricStrategy: report.rhetoricStrategy,
            createdAt: report.createdAt,
          },
          language 
        }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('DOCX export failed:', error);
      alert(language === 'en' ? 'Word export failed' : 'Word出力に失敗しました');
    }
  };

  // エクスポート: HTML
  const handleExportHTML = async () => {
    if (!report) return;
    try {
      const response = await fetch('/api/export-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report: {
            title: report.title,
            content: report.content,
            stakeholder: report.stakeholder,
            rhetoricStrategy: report.rhetoricStrategy,
            createdAt: report.createdAt,
          },
          language 
        }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('HTML export failed:', error);
      alert(language === 'en' ? 'HTML export failed' : 'HTML出力に失敗しました');
    }
  };

  // エクスポート: PDF
  const handleExportPDF = async () => {
    if (!report) return;
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          report: {
            title: report.title,
            content: report.content,
            stakeholder: report.stakeholder,
            rhetoricStrategy: report.rhetoricStrategy,
            createdAt: report.createdAt,
          },
          language 
        }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF export failed:', error);
      alert(language === 'en' ? 'PDF export failed' : 'PDF出力に失敗しました');
    }
  };

  // 印刷
  const handlePrint = () => {
    if (!report) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    body {
      font-family: ${language === 'en' ? "'Segoe UI', sans-serif" : "'Noto Sans JP', sans-serif"};
      line-height: 1.8;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20mm;
    }
    h1 { font-size: 24px; margin-bottom: 10px; }
    .metadata { color: #666; font-size: 14px; margin-bottom: 30px; }
    .content { white-space: pre-wrap; }
    @media print {
      body { margin: 0; padding: 10mm; }
    }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <div class="metadata">
    <p>${language === 'en' ? 'Target' : '対象'}: ${report.stakeholder.role} | ${language === 'en' ? 'Strategy' : '戦略'}: ${report.rhetoricStrategy}</p>
    <p>${language === 'en' ? 'Created' : '作成日'}: ${new Date(report.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ja-JP')}</p>
  </div>
  <div class="content">${report.content}</div>
</body>
</html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  // 日時フォーマット
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // テキスト
  const texts = {
    appTitle: language === 'en' ? 'Safety Status Report Generator' : 'Safety Status Report 自動生成ツール',
    backToHistory: language === 'en' ? 'Back to History' : '履歴に戻る',
    loading: language === 'en' ? 'Loading...' : '読み込み中...',
    notFound: language === 'en' ? 'Report not found' : 'レポートが見つかりません',
    delete: language === 'en' ? 'Delete' : '削除',
    print: language === 'en' ? 'Print' : '印刷',
    inputFiles: language === 'en' ? 'Input Files' : '入力ファイル',
    noFiles: language === 'en' ? 'No input files' : '入力ファイルなし',
  };

  // 未ログイン時
  if (authStatus === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            {language === 'en' ? 'Please login to view this report' : 'このレポートを見るにはログインしてください'}
          </p>
          <Link
            href="/"
            className="inline-block mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {language === 'en' ? 'Go to Home' : 'ホームへ'}
          </Link>
        </div>
      </main>
    );
  }

  // ローディング
  if (isLoading || authStatus === 'loading') {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
          <FiLoader className="animate-spin text-gray-400" size={32} />
          <span className="ml-3 text-gray-500">{texts.loading}</span>
        </div>
      </main>
    );
  }

  // エラー/Not Found
  if (error || !report) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/history"
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8"
          >
            <FiArrowLeft className="mr-2" />
            {texts.backToHistory}
          </Link>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400">{error || texts.notFound}</p>
          </div>
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

        {/* ナビゲーション */}
        <Link
          href="/history"
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <FiArrowLeft className="mr-2" />
          {texts.backToHistory}
        </Link>

        {/* レポートカード */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          {/* ヘッダー部分 */}
          <div className="p-6 border-b dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {report.title}
            </h2>
            
            {/* メタ情報 */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center">
                <FiUser className="mr-2" />
                {report.stakeholder.role}
              </span>
              <span className="flex items-center">
                <FiClock className="mr-2" />
                {formatDate(report.createdAt)}
              </span>
              <span className="flex items-center">
                <FiFile className="mr-2" />
                {report.fileCount} {language === 'en' ? 'files' : 'ファイル'}
              </span>
            </div>
          </div>

          {/* エクスポートボタン */}
          <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex flex-wrap gap-2">
              {/* Markdown */}
              <button
                onClick={handleExportMarkdown}
                className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
              >
                <FiCode className="mr-1" />
                Markdown
              </button>
              
              {/* Word */}
              <button
                onClick={handleExportDOCX}
                className="flex items-center px-3 py-2 bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-700 dark:text-white dark:hover:bg-purple-600 rounded-md text-sm transition-colors"
              >
                <FiFile className="mr-1" />
                Word
              </button>
              
              {/* HTML */}
              <button
                onClick={handleExportHTML}
                className="flex items-center px-3 py-2 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-600 rounded-md text-sm transition-colors"
              >
                <FiFileText className="mr-1" />
                HTML
              </button>
              
              {/* PDF */}
              <button
                onClick={handleExportPDF}
                className="flex items-center px-3 py-2 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 rounded-md text-sm transition-colors"
              >
                <FiDownload className="mr-1" />
                PDF
              </button>
              
              {/* 印刷 */}
              <button
                onClick={handlePrint}
                className="flex items-center px-3 py-2 bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-700 dark:text-white dark:hover:bg-green-600 rounded-md text-sm transition-colors"
              >
                <FiPrinter className="mr-1" />
                {texts.print}
              </button>

              {/* 削除 */}
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center px-3 py-2 bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-700 dark:text-white dark:hover:bg-red-600 rounded-md text-sm transition-colors disabled:opacity-50 ml-auto"
              >
                <FiTrash2 className="mr-1" />
                {texts.delete}
              </button>
            </div>
          </div>

          {/* 入力ファイル情報 - 折りたたみ式 */}
          {report.files && report.files.length > 0 && (
            <div className="border-b dark:border-gray-700">
              <button
                onClick={() => setIsFilesExpanded(!isFilesExpanded)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FiFile className="text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {texts.inputFiles} ({report.files.length})
                  </span>
                </div>
                {isFilesExpanded ? (
                  <FiChevronUp className="text-gray-500 dark:text-gray-400" />
                ) : (
                  <FiChevronDown className="text-gray-500 dark:text-gray-400" />
                )}
              </button>
              
              {isFilesExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  {report.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {file.source === 'knowledgebase' || file.type === 'knowledgebase' ? (
                          <FiDatabase className="text-blue-500 flex-shrink-0" />
                        ) : (
                          <FiFile className="text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {file.useFullText && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            {language === 'en' ? 'Full Text' : '全文使用'}
                          </span>
                        )}
                        {(file.source === 'knowledgebase' || file.type === 'knowledgebase') && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                            {language === 'en' ? 'RAG' : 'RAG'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* レポート本文 */}
          <div className="p-6">
            <div className="prose dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-lg text-gray-800 dark:text-gray-200 leading-relaxed">
                {report.content}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}