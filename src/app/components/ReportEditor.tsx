'use client';

import { useState, useEffect } from 'react';
import { FiBold, FiItalic, FiUnderline, FiList, FiAlignLeft, FiAlignCenter, FiAlignRight, FiSave, FiX } from 'react-icons/fi';
import { Report } from '@/types';

interface ReportEditorProps {
  report: Report;
  onSave: (updatedReport: Report) => void;
  onCancel: () => void;
}

interface Section {
  id: string;
  title: string;
  content: string;
}

export default function ReportEditor({ report, onSave, onCancel }: ReportEditorProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSection, setActiveSection] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    // レポート内容をセクションに分割
    const parsedSections = parseReportContent(report.content);
    setSections(parsedSections);
    if (parsedSections.length > 0) {
      setActiveSection(parsedSections[0].id);
    }
  }, [report]);

  const parseReportContent = (content: string): Section[] => {
    // 簡単な実装：見出しで分割
    const sectionRegex = /^#+\s+(.+)$/gm;
    const sections: Section[] = [];
    let lastIndex = 0;
    let match;

    while ((match = sectionRegex.exec(content)) !== null) {
      if (lastIndex < match.index) {
        const sectionContent = content.substring(lastIndex, match.index).trim();
        if (sections.length > 0 && sectionContent) {
          sections[sections.length - 1].content = sectionContent;
        }
      }
      
      sections.push({
        id: `section-${sections.length}`,
        title: match[1],
        content: ''
      });
      
      lastIndex = sectionRegex.lastIndex;
    }

    // 最後のセクションの内容を追加
    if (lastIndex < content.length && sections.length > 0) {
      sections[sections.length - 1].content = content.substring(lastIndex).trim();
    }

    // セクションがない場合は全体を1つのセクションとして扱う
    if (sections.length === 0) {
      sections.push({
        id: 'section-0',
        title: 'レポート',
        content: content
      });
    }

    return sections;
  };

  const updateSection = (sectionId: string, content: string) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId ? { ...section, content } : section
    ));
    setIsDirty(true);
  };

  const addSection = () => {
    const newSection: Section = {
      id: `section-${sections.length}`,
      title: '新しいセクション',
      content: ''
    };
    setSections([...sections, newSection]);
    setActiveSection(newSection.id);
    setIsDirty(true);
  };

  const deleteSection = (sectionId: string) => {
    if (sections.length > 1) {
      setSections(prev => prev.filter(s => s.id !== sectionId));
      setIsDirty(true);
    }
  };

  const handleSave = () => {
    // セクションを結合してレポート内容を再構築
    const updatedContent = sections
      .map(section => `## ${section.title}\n\n${section.content}`)
      .join('\n\n');

    onSave({
      ...report,
      content: updatedContent,
      updatedAt: new Date()
    });
  };

  const insertFormatting = (format: string) => {
    const section = sections.find(s => s.id === activeSection);
    if (!section) return;

    // 簡単な実装：テキストの最後に書式を追加
    let formattedText = section.content;
    switch (format) {
      case 'bold':
        formattedText += ' **太字テキスト** ';
        break;
      case 'italic':
        formattedText += ' *斜体テキスト* ';
        break;
      case 'underline':
        formattedText += ' <u>下線テキスト</u> ';
        break;
      case 'list':
        formattedText += '\n- リスト項目1\n- リスト項目2\n- リスト項目3\n';
        break;
    }
    
    updateSection(activeSection, formattedText);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-lg">
      {/* ヘッダー */}
      <div className="border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">レポート編集</h2>
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              <FiSave className="mr-2" />
              保存
            </button>
            <button
              onClick={onCancel}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <FiX className="mr-2" />
              キャンセル
            </button>
          </div>
        </div>
      </div>

      {/* ツールバー */}
      <div className="border-b px-6 py-2 bg-gray-50">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => insertFormatting('bold')}
            className="p-2 hover:bg-gray-200 rounded"
            title="太字"
          >
            <FiBold />
          </button>
          <button
            onClick={() => insertFormatting('italic')}
            className="p-2 hover:bg-gray-200 rounded"
            title="斜体"
          >
            <FiItalic />
          </button>
          <button
            onClick={() => insertFormatting('underline')}
            className="p-2 hover:bg-gray-200 rounded"
            title="下線"
          >
            <FiUnderline />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-2" />
          <button
            onClick={() => insertFormatting('list')}
            className="p-2 hover:bg-gray-200 rounded"
            title="リスト"
          >
            <FiList />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-2" />
          <button className="p-2 hover:bg-gray-200 rounded" title="左揃え">
            <FiAlignLeft />
          </button>
          <button className="p-2 hover:bg-gray-200 rounded" title="中央揃え">
            <FiAlignCenter />
          </button>
          <button className="p-2 hover:bg-gray-200 rounded" title="右揃え">
            <FiAlignRight />
          </button>
        </div>
      </div>

      {/* エディター本体 */}
      <div className="flex-1 flex overflow-hidden">
        {/* サイドバー：セクション一覧 */}
        <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-sm text-gray-700">セクション</h3>
            <button
              onClick={addSection}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + 追加
            </button>
          </div>
          <div className="space-y-2">
            {sections.map((section) => (
              <div
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`p-3 rounded cursor-pointer transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-100 border-blue-300 border'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex justify-between items-start">
                  <h4 className="font-medium text-sm">{section.title}</h4>
                  {sections.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSection(section.id);
                      }}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* メインエディター */}
        <div className="flex-1 p-6 overflow-y-auto">
          {sections.map((section) => (
            <div
              key={section.id}
              className={`${activeSection === section.id ? 'block' : 'hidden'}`}
            >
              <input
                type="text"
                value={section.title}
                onChange={(e) => {
                  setSections(prev => prev.map(s => 
                    s.id === section.id ? { ...s, title: e.target.value } : s
                  ));
                  setIsDirty(true);
                }}
                className="text-2xl font-bold mb-4 w-full px-2 py-1 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none"
              />
              <textarea
                value={section.content}
                onChange={(e) => updateSection(section.id, e.target.value)}
                className="w-full h-96 p-4 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="ここにレポート内容を入力..."
              />
            </div>
          ))}
        </div>
      </div>

      {/* ステータスバー */}
      <div className="border-t px-6 py-2 bg-gray-50">
        <div className="flex justify-between text-sm text-gray-600">
          <span>
            {isDirty && '● 未保存の変更があります'}
          </span>
          <span>
            文字数: {sections.reduce((acc, s) => acc + s.content.length, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}