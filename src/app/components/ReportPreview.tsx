// src/app/components/ReportPreview.tsx
'use client';

import { useState } from 'react';
import { FiDownload, FiEdit, FiPrinter, FiFileText, FiFile, FiCode } from 'react-icons/fi';
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

  // プレーンテキストをMarkdown形式に変換
  const convertToMarkdown = (text: string): string => {
    const lines = text.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // 1. セクション番号のパターン（例: "1. セクション名", "2. 概要"）
      // 行頭が数字+ピリオド+スペースで始まり、短め（80文字以下）の行
      if (/^(\d+)\.\s+(.+)$/.test(line) && line.length <= 80) {
        const match = line.match(/^(\d+)\.\s+(.+)$/);
        if (match) {
          line = `## ${match[1]}. ${match[2]}`;
        }
      }
      // 2. サブセクション番号のパターン（例: "1.1 サブセクション", "2.3.1 詳細"）
      else if (/^(\d+\.\d+(?:\.\d+)?)\s+(.+)$/.test(line) && line.length <= 80) {
        const match = line.match(/^(\d+\.\d+(?:\.\d+)?)\s+(.+)$/);
        if (match) {
          line = `### ${match[1]} ${match[2]}`;
        }
      }
      // 3. 箇条書きパターン（・、•、‣、※）
      else if (/^[・•‣※]\s*(.+)$/.test(line)) {
        const match = line.match(/^[・•‣※]\s*(.+)$/);
        if (match) {
          line = `- ${match[1]}`;
        }
      }
      // 4. 番号付きリスト（括弧付き: (1), (2), ①, ②）
      else if (/^[（(](\d+)[)）]\s*(.+)$/.test(line)) {
        const match = line.match(/^[（(](\d+)[)）]\s*(.+)$/);
        if (match) {
          line = `${match[1]}. ${match[2]}`;
        }
      }
      else if (/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.+)$/.test(line)) {
        const circleNums: { [key: string]: string } = {
          '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
          '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10'
        };
        const match = line.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.+)$/);
        if (match) {
          line = `${circleNums[match[1]]}. ${match[2]}`;
        }
      }

      result.push(line);
    }

    // タイトルを先頭に追加
    const titleLine = `# ${report.title}\n\n`;
    return titleLine + result.join('\n');
  };

  // Markdownエクスポート
  const handleExportMarkdown = () => {
    const markdownContent = convertToMarkdown(report.content);
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

  const handlePrint = () => {
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
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-lg text-gray-800 dark:text-gray-200 leading-relaxed text-sm">
              {report.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}