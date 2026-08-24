// src/app/components/GSNStructureView.tsx
// GSNとしてマークされたファイルを解析し、解析結果の構造をユーザーに表示する。
// 表示内容は Lambda がレポート生成時に認識する GSN 構造と同じパーサーから生成される。
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiEdit2,
  FiHelpCircle,
  FiMinusCircle,
  FiShare2,
  FiXCircle,
} from 'react-icons/fi';
import { Stakeholder, UploadedFile } from '@/types';
import {
  analyzeGSNFiles,
  buildHiCaseView,
  GSNAnalysis,
  GSNNode,
  GSNNodeStatus,
  GSNNodeType,
  GSNTreeNode,
  HiCaseNode,
  MandatorySafetyCore,
} from '@/lib/gsn';
import { useI18n } from './I18nProvider';
import GSNStructureEditor from './GSNStructureEditor';

interface GSNStructureViewProps {
  files: UploadedFile[];
  onUpdateContent?: (fileId: string, newContent: string) => void;
  stakeholders?: Stakeholder[];
}

// ============================================================
// 表示用の定義
// ============================================================

export const NODE_TYPE_STYLES: Record<GSNNodeType, string> = {
  Goal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  SubGoal: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  Strategy: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
  Context: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  Assumption: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  Solution: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  Evidence: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  Justification: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  Undeveloped: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
};

export function statusLabel(status: GSNNodeStatus, language: string): string {
  switch (status) {
    case 'achieved':
      return language === 'en' ? 'Achieved' : '達成';
    case 'partial':
      return language === 'en' ? 'Partial' : '部分達成';
    case 'unachieved':
      return language === 'en' ? 'Not achieved' : '未達成';
    default:
      return language === 'en' ? 'Unknown' : '不明';
  }
}

export function StatusIcon({ status, title }: { status: GSNNodeStatus; title: string }) {
  const common = 'shrink-0';
  switch (status) {
    case 'achieved':
      return <FiCheckCircle className={`${common} text-green-600 dark:text-green-400`} title={title} />;
    case 'partial':
      return <FiMinusCircle className={`${common} text-amber-500 dark:text-amber-400`} title={title} />;
    case 'unachieved':
      return <FiXCircle className={`${common} text-red-500 dark:text-red-400`} title={title} />;
    default:
      return <FiHelpCircle className={`${common} text-gray-400 dark:text-gray-500`} title={title} />;
  }
}

export const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

// ============================================================
// ルートコンポーネント
// ============================================================

export default function GSNStructureView({ files, onUpdateContent, stakeholders = [] }: GSNStructureViewProps) {
  const { language } = useI18n();
  const analyses = useMemo(() => analyzeGSNFiles(files), [files]);
  const [previewStakeholderId, setPreviewStakeholderId] = useState<string | null>(null);

  if (analyses.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FiShare2 className="text-orange-500 dark:text-orange-400" />
          {language === 'en' ? 'GSN Structure' : 'GSN構造'}
        </h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {language === 'en'
            ? `${analyses.length} GSN file${analyses.length > 1 ? 's' : ''}`
            : `GSNファイル ${analyses.length}件`}
        </span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {language === 'en'
          ? 'The structure parsed from the file(s) marked as GSN. Report generation uses this same structure to build the outline and the mandatory safety core.'
          : 'GSNとしてマークしたファイルから解析した構造です。レポート生成でも同じ構造からアウトラインとMandatory Safety Coreが作られます。'}
      </p>

      {stakeholders.length > 0 && (
        <HiCasePreviewSelector
          stakeholders={stakeholders}
          selectedId={previewStakeholderId}
          onSelect={setPreviewStakeholderId}
          language={language}
        />
      )}

      <div className="space-y-4">
        {analyses.map((analysis, index) => (
          <GSNFilePanel
            key={analysis.fileId}
            analysis={analysis}
            language={language}
            defaultOpen={index === 0}
            onUpdateContent={onUpdateContent}
            previewStakeholderId={previewStakeholderId}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ステークホルダー別 hicase プレビュー選択
// ============================================================

function HiCasePreviewSelector({
  stakeholders,
  selectedId,
  onSelect,
  language,
}: {
  stakeholders: Stakeholder[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  language: string;
}) {
  return (
    <div className="mb-4 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {language === 'en'
          ? 'Preview report structure for a stakeholder (hicase open/closed)'
          : 'ステークホルダー別のレポート構造プレビュー（hicase open/closed）'}
      </h4>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            selectedId === null
              ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-900/50 dark:text-blue-200'
              : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {language === 'en' ? 'No preview (full structure)' : 'プレビューなし（全体構造）'}
        </button>
        {stakeholders.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              selectedId === s.id
                ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-900/50 dark:text-blue-200'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {s.role}
          </button>
        ))}
      </div>
      {selectedId !== null && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {language === 'en'
            ? 'Badges below show whether each node is expanded ("open"), collapsed to a one-paragraph summary ("closed"), or forced open because it is part of the Mandatory Safety Core.'
            : '以下のバッジは各ノードが展開される（open）か、要約のみに圧縮される（closed）か、Mandatory Safety Coreのため強制的に開かれる（強制開放）かを示します。'}
        </p>
      )}
    </div>
  );
}

// ============================================================
// ファイル単位のパネル
// ============================================================

function GSNFilePanel({
  analysis,
  language,
  defaultOpen,
  onUpdateContent,
  previewStakeholderId,
}: {
  analysis: GSNAnalysis;
  language: string;
  defaultOpen: boolean;
  onUpdateContent?: (fileId: string, newContent: string) => void;
  previewStakeholderId?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showEditor, setShowEditor] = useState(false);
  const parsed = analysis.nodeCount > 0;
  const editable = !analysis.isPreviewOnly && !analysis.hasNoContent && !!onUpdateContent;

  const hicaseView = useMemo(() => {
    if (!previewStakeholderId || !parsed) return null;
    return buildHiCaseView(analysis.parsed, analysis.core, previewStakeholderId);
  }, [analysis.parsed, analysis.core, previewStakeholderId, parsed]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="w-full flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {isOpen ? (
            <FiChevronDown className="shrink-0 text-gray-500 dark:text-gray-400" />
          ) : (
            <FiChevronRight className="shrink-0 text-gray-500 dark:text-gray-400" />
          )}
          <span className="font-medium text-gray-900 dark:text-white truncate">{analysis.fileName}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {parsed ? (
            <>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {language === 'en' ? `${analysis.nodeCount} nodes` : `${analysis.nodeCount}ノード`}
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                <StatusIcon
                  status={analysis.parsed.overallStatus}
                  title={statusLabel(analysis.parsed.overallStatus, language)}
                />
                {statusLabel(analysis.parsed.overallStatus, language)}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
              <FiAlertTriangle />
              {language === 'en' ? 'Not detected' : '未検出'}
            </span>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              title={
                language === 'en'
                  ? 'Edit the GSN structure (add/edit/delete nodes)'
                  : 'GSN構造を編集する（ノードの追加・編集・削除）'
              }
              className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-200 dark:hover:bg-blue-900/80"
            >
              <FiEdit2 size={12} />
              {language === 'en' ? 'Edit' : '編集'}
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {analysis.isPreviewOnly && (
            <Notice tone="amber">
              {language === 'en'
                ? 'This file was stored in S3 because of its size, so only the beginning of the text is available in the browser. The structure below is parsed from that preview — report generation reads the full file. Editing is disabled because the full text is not available in the browser.'
                : 'このファイルはサイズが大きいためS3に保存され、ブラウザ上には先頭部分のみが残っています。以下の構造はその先頭部分のみを解析した結果です（レポート生成時は全文が読み込まれます）。全文がブラウザ上にないため、編集はできません。'}
            </Notice>
          )}

          {analysis.hasNoContent ? (
            <Notice tone="red">
              {language === 'en'
                ? 'No text could be read from this file, so GSN parsing is not possible. Check that text extraction succeeded.'
                : 'このファイルからテキストを取得できていないため、GSNを解析できません。テキスト抽出が成功しているか確認してください。'}
            </Notice>
          ) : !parsed ? (
            <NotDetectedHelp language={language} />
          ) : (
            <>
              <SummarySection analysis={analysis} language={language} />
              <MandatoryCoreSection analysis={analysis} language={language} />
              <TreeSection analysis={analysis} language={language} hicaseView={hicaseView} />
            </>
          )}
        </div>
      )}

      {showEditor && onUpdateContent && (
        <GSNStructureEditor
          fileId={analysis.fileId}
          fileName={analysis.fileName}
          initialNodes={Array.from(analysis.parsed.nodes.values())}
          language={language}
          onSave={(fileId, newContent) => {
            onUpdateContent(fileId, newContent);
            setShowEditor(false);
            setIsOpen(true);
          }}
          onCancel={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  const styles =
    tone === 'red'
      ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
      : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';

  return (
    <div className={`border rounded-lg p-3 text-sm flex items-start gap-2 ${styles}`}>
      <FiAlertTriangle className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function NotDetectedHelp({ language }: { language: string }) {
  return (
    <div className="space-y-3">
      <Notice tone="amber">
        {language === 'en'
          ? 'No GSN nodes were detected in this file. Report generation will fall back to the flat (non-GSN) retrieval and the static section template.'
          : 'このファイルからGSNノードを検出できませんでした。レポート生成では GSN を使わないフラットな検索と静的なセクション構成にフォールバックします。'}
      </Notice>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
        <p className="font-medium text-gray-700 dark:text-gray-300">
          {language === 'en' ? 'Recognized formats:' : '認識できる記述形式:'}
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            {language === 'en'
              ? 'A Markdown table with an ID column (Node ID / ID) and ideally Type, Description, Status, Parent and Evidence columns'
              : 'ノードID列（ノードID / ID）を持つMarkdownテーブル（種別・内容・達成状況・親ノード・根拠の列があるとより正確に解析されます）'}
          </li>
          <li>
            {language === 'en'
              ? 'Tree notation such as `G1 [Goal]`, `S1 [Strategy]`, `Sn01 [Solution/Evidence]`'
              : 'ツリー表記（例: `G1 [Goal]`、`S1 [Strategy]`、`Sn01 [Solution/Evidence]`）'}
          </li>
          <li>
            {language === 'en'
              ? 'Node IDs must follow the standard pattern: G0, G1.1, S1, Sn01, C0, A0, J1, E1, U1'
              : 'ノードIDは標準パターンに従う必要があります: G0, G1.1, S1, Sn01, C0, A0, J1, E1, U1'}
          </li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================
// サマリー
// ============================================================

export function SummarySection({ analysis, language }: { analysis: GSNAnalysis; language: string }) {
  const statuses: GSNNodeStatus[] = ['achieved', 'partial', 'unachieved', 'unknown'];

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {language === 'en' ? 'Node types' : 'ノード種別'}
        </h4>
        <div className="flex flex-wrap gap-2">
          {analysis.typeCounts.map(({ type, count }) => (
            <span
              key={type}
              className={`text-sm px-2 py-0.5 rounded ${NODE_TYPE_STYLES[type]}`}
            >
              {type} {count}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {language === 'en' ? 'Achievement status' : '達成状況'}
        </h4>
        <div className="flex flex-wrap gap-3">
          {statuses
            .filter(s => analysis.statusCounts[s] > 0)
            .map(s => (
              <span key={s} className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                <StatusIcon status={s} title={statusLabel(s, language)} />
                {statusLabel(s, language)} {analysis.statusCounts[s]}
              </span>
            ))}
        </div>
      </div>

      {analysis.hasNoEdges ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {language === 'en'
            ? 'No parent-child relationships were found, so nodes are listed flat. Add a parent column to the GSN table to see the hierarchy.'
            : '親子関係が検出されなかったため、ノードをフラットに一覧表示しています。GSNテーブルに親ノード列を追加すると階層が表示されます。'}
        </p>
      ) : (
        analysis.rootCount > 1 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {language === 'en'
              ? `${analysis.rootCount} nodes have no parent link and are shown at the top level. If that is unexpected, check the parent column of the GSN table.`
              : `${analysis.rootCount}個のノードは親が解析されず、トップレベルに表示されています。意図しない場合はGSNテーブルの親ノード列を確認してください。`}
          </p>
        )
      )}
    </div>
  );
}

// ============================================================
// Mandatory Safety Core
// ============================================================

export function MandatoryCoreSection({ analysis, language }: { analysis: GSNAnalysis; language: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const core = analysis.core;

  type CoreCategory = { key: keyof MandatorySafetyCore; label: string; nodes: GSNNode[] };

  const categories: CoreCategory[] = ([
    {
      key: 'highSeverityHazards',
      label: language === 'en' ? 'High / critical severity' : '高Severityハザード',
      nodes: core.highSeverityHazards,
    },
    {
      key: 'asilDItems',
      label: language === 'en' ? 'ASIL-C / ASIL-D items' : 'ASIL-C/D相当項目',
      nodes: core.asilDItems,
    },
    {
      key: 'unverifiedRequirements',
      label: language === 'en' ? 'Unverified safety requirements' : '未検証の安全要求',
      nodes: core.unverifiedRequirements,
    },
    {
      key: 'openIssues',
      label: language === 'en' ? 'Open issues' : 'Open Issues（未解決事項）',
      nodes: core.openIssues,
    },
    {
      key: 'failedVerifications',
      label: language === 'en' ? 'Failed verifications' : '検証失敗',
      nodes: core.failedVerifications,
    },
    {
      key: 'criticalAssumptions',
      label: language === 'en' ? 'Critical assumptions / contexts' : '重要なAssumption/Context',
      nodes: core.criticalAssumptions,
    },
  ] as CoreCategory[]).filter(c => c.nodes.length > 0);

  if (categories.length === 0) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm text-green-800 dark:text-green-200 flex items-start gap-2">
        <FiCheckCircle className="shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Mandatory Safety Core: </span>
          {language === 'en'
            ? 'No critical unresolved safety items were detected.'
            : '重大な未解決安全課題は検出されませんでした。'}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-red-100/60 dark:hover:bg-red-900/40 transition-colors"
      >
        {isOpen ? (
          <FiChevronDown className="shrink-0 text-red-700 dark:text-red-300" />
        ) : (
          <FiChevronRight className="shrink-0 text-red-700 dark:text-red-300" />
        )}
        <FiAlertTriangle className="shrink-0 text-red-600 dark:text-red-400" />
        <span className="text-sm text-red-800 dark:text-red-200">
          <span className="font-semibold">Mandatory Safety Core</span>
          {' — '}
          {language === 'en'
            ? `${analysis.coreNodeCount} node(s) that must appear in every stakeholder's report`
            : `全ステークホルダーのレポートに必ず含まれる ${analysis.coreNodeCount} ノード`}
        </span>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          {categories.map(category => (
            <div key={category.key}>
              <h5 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                {category.label} ({category.nodes.length})
              </h5>
              <ul className="space-y-1">
                {category.nodes.map(node => (
                  <li key={node.id} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <code className="shrink-0 font-mono text-sm bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded px-1">
                      {node.id}
                    </code>
                    <span className="min-w-0">
                      {node.description || (language === 'en' ? '(no description)' : '（記載なし）')}
                      {node.asilLevel && (
                        <span className="ml-1 text-sm text-red-700 dark:text-red-300">[{node.asilLevel}]</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ツリー表示
// ============================================================

export function TreeSection({
  analysis,
  language,
  hicaseView,
}: {
  analysis: GSNAnalysis;
  language: string;
  hicaseView?: { roots: HiCaseNode[] } | null;
}) {
  // Mandatory Safety Core に含まれるノードはツリー上でも印を付ける
  const coreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of Object.values(analysis.core)) {
      for (const node of list) ids.add(node.id);
    }
    return ids;
  }, [analysis.core]);

  // hicaseView がある場合、ノードid -> HiCaseNode のマップを作る（バッジ・展開状態に使用）
  const hicaseById = useMemo(() => {
    if (!hicaseView) return null;
    const map = new Map<string, HiCaseNode>();
    const walk = (n: HiCaseNode) => {
      map.set(n.node.id, n);
      n.children.forEach(walk);
    };
    hicaseView.roots.forEach(walk);
    return map;
  }, [hicaseView]);

  // closedなhinodeの要約に吸収され、レポートでは独立見出しにならないノード
  const absorbedIds = useMemo(() => {
    if (!hicaseView) return null;
    const ids = new Set<string>();
    const walk = (n: HiCaseNode) => {
      n.absorbedNodes.forEach(a => ids.add(a.id));
      n.children.forEach(walk);
    };
    hicaseView.roots.forEach(walk);
    return ids;
  }, [hicaseView]);

  // 展開可能なノード（子を持つノード）のID
  const expandableIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (t: GSNTreeNode) => {
      if (t.children.length > 0) ids.push(t.node.id);
      t.children.forEach(walk);
    };
    analysis.trees.forEach(walk);
    return ids;
  }, [analysis.trees]);

  // 初期展開状態: hicaseViewがあればisOpen(=子が実際に存在する)ノードを展開、なければ従来通り2階層目まで
  const initialExpanded = useMemo(() => {
    const ids = new Set<string>();
    if (hicaseById) {
      const walk = (t: GSNTreeNode) => {
        const hc = hicaseById.get(t.node.id);
        if (t.children.length > 0 && hc && hc.children.length > 0) ids.add(t.node.id);
        t.children.forEach(walk);
      };
      analysis.trees.forEach(walk);
      return ids;
    }
    const walk = (t: GSNTreeNode, depth: number) => {
      if (t.children.length > 0 && depth < 2) ids.add(t.node.id);
      t.children.forEach(c => walk(c, depth + 1));
    };
    analysis.trees.forEach(t => walk(t, 0));
    return ids;
  }, [analysis.trees, hicaseById]);

  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  // プレビュー対象ステークホルダーの切り替え時は展開状態を再計算する
  useEffect(() => {
    setExpanded(initialExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hicaseById]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {language === 'en' ? 'Structure' : '構造ツリー'}
        </h4>
        {expandableIds.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setExpanded(new Set(expandableIds))}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {language === 'en' ? 'Expand all' : 'すべて展開'}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {language === 'en' ? 'Collapse all' : 'すべて折りたたむ'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        {analysis.trees.map((tree, index) => (
          <TreeNodeRow
            key={`${tree.node.id}-${index}`}
            tree={tree}
            path={`${index}`}
            expanded={expanded}
            onToggle={toggle}
            coreIds={coreIds}
            language={language}
            hicaseById={hicaseById}
            absorbedIds={absorbedIds}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNodeRow({
  tree,
  path,
  expanded,
  onToggle,
  coreIds,
  language,
  hicaseById,
  absorbedIds,
}: {
  tree: GSNTreeNode;
  path: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  coreIds: Set<string>;
  language: string;
  hicaseById?: Map<string, HiCaseNode> | null;
  absorbedIds?: Set<string> | null;
}) {
  const { node, children } = tree;
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isCore = coreIds.has(node.id);
  const hicaseNode = hicaseById?.get(node.id) ?? null;
  const isAbsorbed = absorbedIds?.has(node.id) ?? false;

  return (
    <div>
      <div
        className={`flex items-start gap-2 py-1 px-2 rounded ${
          isCore ? 'bg-red-50/70 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="shrink-0 mt-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label={isExpanded ? 'collapse' : 'expand'}
          >
            {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          </button>
        ) : (
          <span className="shrink-0 w-[14px]" />
        )}

        <StatusIcon status={node.status} title={statusLabel(node.status, language)} />

        <code className="shrink-0 font-mono text-sm text-gray-900 dark:text-gray-100">{node.id}</code>

        <span className={`shrink-0 text-sm px-1.5 rounded ${NODE_TYPE_STYLES[node.type]}`}>{node.type}</span>

        <span className="min-w-0 text-sm text-gray-700 dark:text-gray-300 break-words">
          {node.description || (
            <span className="text-gray-400 dark:text-gray-500">
              {language === 'en' ? '(no description)' : '（記載なし）'}
            </span>
          )}
        </span>

        <span className="flex items-center gap-1 ml-auto shrink-0">
          {node.asilLevel && (
            <span className="text-sm px-1.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
              {node.asilLevel}
            </span>
          )}
          {node.severity !== 'unknown' && (
            <span className={`text-sm px-1.5 rounded ${SEVERITY_STYLES[node.severity]}`}>{node.severity}</span>
          )}
          {node.hasFailedVerification && (
            <span
              className="text-sm px-1.5 rounded bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
              title={language === 'en' ? 'Failed verification' : '検証失敗'}
            >
              {language === 'en' ? 'Failed' : '検証失敗'}
            </span>
          )}
          {node.isOpenIssue && !node.hasFailedVerification && (
            <span
              className="text-sm px-1.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
              title={language === 'en' ? 'Open issue' : '未解決事項'}
            >
              Open
            </span>
          )}
          {isCore && (
            <span
              className="text-sm px-1.5 rounded bg-red-600 text-white dark:bg-red-500"
              title={
                language === 'en'
                  ? 'Included in the Mandatory Safety Core'
                  : 'Mandatory Safety Core に含まれます'
              }
            >
              Core
            </span>
          )}
          {hicaseNode?.isForcedOpenByIncompleteEvidence && (
            <span
              className="text-sm px-1.5 rounded bg-orange-500 text-white dark:bg-orange-600"
              title={
                language === 'en'
                  ? 'Evidence chain is not fully developed (undeveloped / unachieved / failed items), so it stays expanded'
                  : '証拠連鎖が完全展開済みでない（未展開・未達成・検証失敗を含む）ため展開されます'
              }
            >
              {language === 'en' ? 'incomplete evidence' : '未完成の証拠'}
            </span>
          )}
          {!hicaseNode && isAbsorbed && (
            <span
              className="text-sm px-1.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
              title={
                language === 'en'
                  ? 'Not a heading in this stakeholder\'s report — folded into the enclosing section\'s summary'
                  : 'このステークホルダー向けレポートでは見出しにならず、内包する節の要約に吸収されます'
              }
            >
              {language === 'en' ? 'absorbed' : '要約に吸収'}
            </span>
          )}
          {hicaseNode?.isMandatoryCoreForced && (
            <span
              className="text-sm px-1.5 rounded bg-amber-500 text-white dark:bg-amber-600"
              title={
                language === 'en'
                  ? 'Forced open because it is part of the Mandatory Safety Core'
                  : 'Mandatory Safety Coreのため強制的に開かれています'
              }
            >
              {language === 'en' ? 'forced open' : '強制開放'}
            </span>
          )}
          {hicaseNode && (
            <span
              className={`text-sm px-1.5 rounded ${
                hicaseNode.children.length > 0
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}
              title={
                language === 'en'
                  ? hicaseNode.children.length > 0
                    ? 'Expanded in this stakeholder\'s report'
                    : 'Collapsed to a one-paragraph summary in this stakeholder\'s report'
                  : hicaseNode.children.length > 0
                    ? 'このステークホルダー向けレポートでは展開されます'
                    : 'このステークホルダー向けレポートでは要約のみに圧縮されます'
              }
            >
              {hicaseNode.children.length > 0
                ? (language === 'en' ? 'open' : '展開')
                : (language === 'en' ? 'closed' : '要約')}
            </span>
          )}
        </span>
      </div>

      {hicaseNode?.mandatoryCoreAnnotation && (
        <p className="ml-6 text-sm text-amber-700 dark:text-amber-300">
          ⚠ mandatory core:{' '}
          {hicaseNode.mandatoryCoreAnnotation.oneSentenceItems.length > 0
            ? hicaseNode.mandatoryCoreAnnotation.oneSentenceItems.map(i => `${i.id}: ${i.text}`).join('; ')
            : language === 'en'
              ? `${hicaseNode.mandatoryCoreAnnotation.count} item(s)`
              : `${hicaseNode.mandatoryCoreAnnotation.count}件`}
        </p>
      )}

      {hicaseNode && hicaseNode.absorbedNodes.length > 0 && (
        <p className="ml-6 text-sm text-sky-700 dark:text-sky-300">
          ◇ {language === 'en' ? 'embedded context/assumptions' : '内包する前提・文脈'}:{' '}
          {hicaseNode.absorbedNodes
            .map(a => (a.description ? `${a.id}: ${a.description}` : a.id))
            .join('; ')}
        </p>
      )}

      {tree.truncated && (
        <p className="ml-6 text-sm text-amber-600 dark:text-amber-400">
          {language === 'en'
            ? '(circular parent-child reference — expansion stopped here)'
            : '（親子関係が循環しているため、ここで展開を打ち切りました）'}
        </p>
      )}

      {hasChildren && isExpanded && (
        <div className="ml-4 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-1">
          {children.map((child, index) => (
            <TreeNodeRow
              key={`${path}-${child.node.id}-${index}`}
              tree={child}
              path={`${path}-${index}`}
              expanded={expanded}
              onToggle={onToggle}
              coreIds={coreIds}
              language={language}
              hicaseById={hicaseById}
              absorbedIds={absorbedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
