'use client';

import { useState } from 'react';
import { FiDownload, FiEdit, FiPrinter, FiFileText, FiFile } from 'react-icons/fi';
import { Report } from '@/types';

interface ReportPreviewProps {
  report: Report;
  onUpdate: (report: Report) => void;
}

export default function ReportPreview({ report, onUpdate }: ReportPreviewProps) {
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

  const handleExportDOCX = async () => {
    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report }),
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
      alert('Word出力に失敗しました');
    }
  };

  const handleExportHTML = async () => {
    try {
      const response = await fetch('/api/export-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report }),
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
      alert('HTML出力に失敗しました');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    body {
      font-family: 'Noto Sans JP', sans-serif;
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
    <p>対象: ${report.stakeholder.role} | 戦略: ${report.rhetoricStrategy}</p>
    <p>作成日: ${new Date(report.createdAt).toLocaleDateString('ja-JP')}</p>
  </div>
  <div class="content">${report.content}</div>
</body>
</html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // 印刷ダイアログを開く
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const handleExportPDF = async () => {
    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report }),
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
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
            対象: {report.stakeholder.role} | 
            戦略: {report.rhetoricStrategy}
          </p><br/>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center px-3 py-2 bg-gray-600 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-700 rounded-md text-sm text-white"
          >
            <FiEdit className="mr-1" />
            {isEditing ? 'プレビュー' : '編集'}
          </button>
          <button
            onClick={handleExportDOCX}
            className="flex items-center px-3 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-md text-sm"
          >
            <FiFile className="mr-1" />
            Word出力
          </button>
          <button
            onClick={handleExportHTML}
            className="flex items-center px-3 py-2 bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white rounded-md text-sm"
          >
            <FiFileText className="mr-1" />
            HTML出力
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-md text-sm"
          >
            <FiDownload className="mr-1" />
            PDF出力
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center px-3 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white rounded-md text-sm"
          >
            <FiPrinter className="mr-1" />
            印刷
          </button>
        </div>
      </div>
      
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
                className="px-4 py-2 text-black dark:text-gray-300 border border-black dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-600"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-lg text-gray-800 dark:text-gray-200 leading-relaxed">
              {report.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}