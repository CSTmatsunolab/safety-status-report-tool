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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

  // 後処理: ## 1. → 1. に修正（番号付きリストの誤ったMarkdown記法を修正）
  // ReportPreviewと同じロジック
  const fixNumberedLists = (text: string): string => {
    const lines = text.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // ## 数字. で始まる行をチェック
      const match = line.match(/^## (\d+)\. (.+)$/);
      if (match) {
        const num = match[1];
        const content = match[2];
        
        // セクション見出しかどうかを判定
        const isSectionHeading = isSectionTitle(content, num);
        
        if (!isSectionHeading) {
          // リスト項目の場合は ## を削除
          line = `${num}. ${content}`;
        }
      }
      
      result.push(line);
    }
    
    return result.join('\n');
  };

  // セクション見出しかどうかを判定
  const isSectionTitle = (content: string, num: string): boolean => {
    // 日本語のセクション見出しキーワード
    const jaSectionKeywords = [
      'エグゼクティブサマリー',
      '現状分析',
      'リスク評価',
      '推奨事項',
      '次のステップ',
      '付録',
      '概要',
      '背景',
      '目的',
      '結論',
      'まとめ',
      '分析',
      '評価',
      '提言',
      '対策',
    ];
    
    // 英語のセクション見出しキーワード
    const enSectionKeywords = [
      'Executive Summary',
      'Current Status',
      'Risk Assessment',
      'Recommendations',
      'Next Steps',
      'Appendix',
      'Overview',
      'Background',
      'Purpose',
      'Conclusion',
      'Summary',
      'Analysis',
      'Evaluation',
    ];
    
    // 数字が1桁で、セクションキーワードを含む場合はセクション見出し
    if (parseInt(num) <= 10) {
      for (const keyword of [...jaSectionKeywords, ...enSectionKeywords]) {
        if (content.includes(keyword)) {
          return true;
        }
      }
    }
    
    // 短い見出し（30文字以下）で太字やその他の装飾がない場合はセクション見出しの可能性が高い
    if (content.length <= 30 && !content.startsWith('**')) {
      return true;
    }
    
    return false;
  };

  // MarkdownをHTMLに変換（印刷用）
  const convertMarkdownToHtml = (markdown: string): string => {
    const lines = markdown.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    const processTable = (rows: string[]): string => {
      if (rows.length < 2) return rows.join('\n');
      
      let tableHtml = '<table>';
      
      // ヘッダー行
      const headerCells = rows[0].split('|').filter(cell => cell.trim() !== '');
      tableHtml += '<thead><tr>';
      headerCells.forEach(cell => {
        tableHtml += `<th>${cell.trim()}</th>`;
      });
      tableHtml += '</tr></thead>';
      
      // ボディ行（区切り行をスキップ）
      tableHtml += '<tbody>';
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].split('|').filter(cell => cell.trim() !== '');
        if (cells.length > 0) {
          tableHtml += '<tr>';
          cells.forEach(cell => {
            tableHtml += `<td>${cell.trim()}</td>`;
          });
          tableHtml += '</tr>';
        }
      }
      tableHtml += '</tbody></table>';
      
      return tableHtml;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 表の検出（|で始まる行）
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
      } else {
        // 表の終了
        if (inTable) {
          result.push(processTable(tableRows));
          inTable = false;
          tableRows = [];
        }
        
        let processedLine = line;
        
        // 見出し
        if (processedLine.match(/^### (.+)$/)) {
          processedLine = processedLine.replace(/^### (.+)$/, '<h3>$1</h3>');
        } else if (processedLine.match(/^## (.+)$/)) {
          processedLine = processedLine.replace(/^## (.+)$/, '<h2>$1</h2>');
        } else if (processedLine.match(/^# (.+)$/)) {
          processedLine = processedLine.replace(/^# (.+)$/, '<h1>$1</h1>');
        }
        // リスト項目
        else if (processedLine.match(/^- (.+)$/)) {
          processedLine = processedLine.replace(/^- (.+)$/, '<li>$1</li>');
        }
        // 番号付きリスト
        else if (processedLine.match(/^(\d+)\. (.+)$/)) {
          processedLine = processedLine.replace(/^(\d+)\. (.+)$/, '<li>$2</li>');
        }
        
        // インライン要素
        processedLine = processedLine.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        processedLine = processedLine.replace(/\*(.+?)\*/g, '<em>$1</em>');
        processedLine = processedLine.replace(/`(.+?)`/g, '<code>$1</code>');
        
        result.push(processedLine);
      }
    }
    
    // 最後に表が残っていた場合
    if (inTable && tableRows.length > 0) {
      result.push(processTable(tableRows));
    }
    
    // 連続するliをulで囲む
    let html = result.join('\n');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // 段落処理（空行で区切られたテキストをpタグで囲む）
    html = html.split('\n\n').map(para => {
      const trimmed = para.trim();
      if (trimmed === '' || 
          trimmed.startsWith('<h') || 
          trimmed.startsWith('<li') || 
          trimmed.startsWith('<ul') ||
          trimmed.startsWith('<table')) {
        return para;
      }
      return `<p>${para}</p>`;
    }).join('\n');
    
    return html;
  };

  // エクスポート: Markdown
  const handleExportMarkdown = () => {
    if (!report) return;
    const titleLine = `# ${report.title}\n\n`;
    const fixedContent = fixNumberedLists(report.content);
    const markdownContent = titleLine + fixedContent;
    
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
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

  // 印刷（Markdown対応）
  const handlePrint = () => {
    if (!report) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const fixedContent = fixNumberedLists(report.content);
    const htmlContent = convertMarkdownToHtml(fixedContent);

    const printHtml = `
<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    body {
      font-family: ${language === 'en' ? "'Segoe UI', sans-serif" : "'Noto Sans JP', 'Hiragino Sans', sans-serif"};
      line-height: 1.8;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20mm;
    }
    h1 { font-size: 24px; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    h2 { font-size: 20px; margin-top: 24px; margin-bottom: 12px; color: #1a1a1a; }
    h3 { font-size: 16px; margin-top: 16px; margin-bottom: 8px; color: #333; }
    .metadata { color: #666; font-size: 14px; margin-bottom: 30px; }
    .content { }
    p { margin: 12px 0; }
    ul, ol { margin: 12px 0; padding-left: 24px; }
    li { margin: 6px 0; }
    strong { font-weight: 600; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    @media print {
      body { margin: 0; padding: 10mm; }
      h1 { page-break-after: avoid; }
      h2, h3 { page-break-after: avoid; }
      ul, ol, table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <div class="metadata">
    <p>${language === 'en' ? 'Target' : '対象'}: ${report.stakeholder.role} | ${language === 'en' ? 'Strategy' : '戦略'}: ${report.rhetoricStrategy}</p>
    <p>${language === 'en' ? 'Created' : '作成日'}: ${new Date(report.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ja-JP')}</p>
  </div>
  <div class="content">${htmlContent}</div>
</body>
</html>`;

    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
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
    backToHistory: language === 'en' ? 'Back to History' : '履歴に戻る',
    loading: language === 'en' ? 'Loading...' : '読み込み中...',
    notFound: language === 'en' ? 'Report not found' : 'レポートが見つかりません',
    delete: language === 'en' ? 'Delete' : '削除',
    print: language === 'en' ? 'Print' : '印刷',
    inputFiles: language === 'en' ? 'Input Files' : '入力ファイル',
  };

  // 未ログイン
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

  // 表示用のコンテンツ（後処理適用済み）
  const displayContent = fixNumberedLists(report.content);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
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

          {/* レポート本文 - ReactMarkdownでレンダリング */}
          <div className="p-6">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-lg">
              <article className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {displayContent}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}