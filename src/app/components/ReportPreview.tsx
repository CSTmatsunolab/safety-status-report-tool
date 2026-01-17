// src/app/components/ReportPreview.tsx
'use client';

import { useState } from 'react';
import { FiDownload, FiEdit, FiPrinter, FiFileText, FiFile, FiCode } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Report } from '@/types';
import { useI18n } from './I18nProvider';

interface ReportPreviewProps {
  report: Report;
  onUpdate: (report: Report) => void;
}

export default function ReportPreview({ report, onUpdate }: ReportPreviewProps) {
  const { language } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(report.content);

  const handleSave = () => {
    onUpdate({
      ...report,
      content: editedContent,
      updatedAt: new Date()
    });
    setIsEditing(false);
  };

  // 後処理: ## 1. → 1. に修正（番号付きリストの誤ったMarkdown記法を修正）
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

  // Markdownエクスポート
  const handleExportMarkdown = () => {
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

  const handleExportDOCX = async () => {
    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, language }),
      });
      
      if (!response.ok) {
        throw new Error('DOCX export failed');
      }
      
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

  const handleExportHTML = async () => {
    try {
      const response = await fetch('/api/export-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, language }),
      });
      
      if (!response.ok) {
        throw new Error('HTML export failed');
      }
      
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

  // 印刷（Markdown対応）
  const handlePrint = () => {
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

  const handleExportPDF = async () => {
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, language }),
      });
      
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
    }
  };

  // 表示用のコンテンツ（後処理適用済み）
  const displayContent = fixNumberedLists(report.content);

  return (
    <div className="h-full flex flex-col">
      <div className="items-center mb-4">
        <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{report.title}</h3>
        <p className="text-base text-gray-700 dark:text-gray-300 mt-1">
          {language === 'en' ? 'Target' : '対象'}: {report.stakeholder.role} | 
          {language === 'en' ? 'Strategy' : '戦略'}: {report.rhetoricStrategy}
        </p><br/>
      </div>

      {/* エクスポートボタン */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* 編集ボタン */}
        <button
          onClick={() => setIsEditing(!isEditing)}
            className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-base transition-colors"
        >
          <FiEdit className="mr-1" />
          {isEditing 
            ? (language === 'en' ? 'Preview' : 'プレビュー')
            : (language === 'en' ? 'Edit' : '編集')}
        </button>
        
        {/* Markdown */}
        <button
          onClick={handleExportMarkdown}
            className="flex items-center px-3 py-2 bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500 rounded-md text-base transition-colors"
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
            className="flex items-center px-3 py-2 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-700 dark:text-white dark:hover:bg-orange-600 rounded-md text-base transition-colors"
        >
          <FiFileText className="mr-1" />
          HTML
        </button>
        
        {/* PDF */}
        <button
          onClick={handleExportPDF}
            className="flex items-center px-3 py-2 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 rounded-md text-base transition-colors"
        >
          <FiDownload className="mr-1" />
          PDF
        </button>
        
        {/* 印刷 */}
        <button
          onClick={handlePrint}
            className="flex items-center px-3 py-2 bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-700 dark:text-white dark:hover:bg-green-600 rounded-md text-base transition-colors"
        >
          <FiPrinter className="mr-1" />
          {language === 'en' ? 'Print' : '印刷'}
        </button>
        </div>
      </div>
      
      {/* コンテンツエリア */}
      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <div className="space-y-4">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-96 p-4 border rounded-md font-mono text-sm text-gray-800 bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setEditedContent(report.content);
                  setIsEditing(false);
                }}
                className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
              >
                {language === 'en' ? 'Cancel' : 'キャンセル'}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-md bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-700 dark:text-white dark:hover:bg-green-600 text-sm"
              >
                {language === 'en' ? 'Save' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-lg">
            <article className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}