// src/app/components/GSNStructureEditor.tsx
// GSNの構造をフォームで編集する（ノード追加・編集・削除・親子付け替え）。
// 保存すると、編集結果をparser.tsが確実に再パースできる正規Markdownテーブルへ
// シリアライズし、file.content 全体を置き換える（テーブル外の自由記述は失われる）。
'use client';

import { useMemo, useState } from 'react';
import { FiAlertTriangle, FiEdit2, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi';
import {
  buildParsedGSN,
  deriveAnalysis,
  GSN_NODE_ID_PATTERN,
  GSNAnalysis,
  GSNNode,
  GSNNodeStatus,
  GSNNodeType,
  RiskSeverity,
  serializeGSNToMarkdown,
  suggestNextNodeId,
} from '@/lib/gsn';
import { SummarySection, MandatoryCoreSection, TreeSection, statusLabel, NODE_TYPE_STYLES } from './GSNStructureView';

const NODE_TYPES: GSNNodeType[] = [
  'Goal',
  'SubGoal',
  'Strategy',
  'Context',
  'Assumption',
  'Solution',
  'Evidence',
  'Justification',
  'Undeveloped',
];

const STATUSES: GSNNodeStatus[] = ['achieved', 'partial', 'unachieved', 'unknown'];
const SEVERITIES: RiskSeverity[] = ['critical', 'high', 'medium', 'low', 'unknown'];
const ASIL_LEVELS = ['', 'ASIL-QM', 'ASIL-A', 'ASIL-B', 'ASIL-C', 'ASIL-D'];

/** シリアライズ時の"値なし"目印（EMPTY_CELL_PLACEHOLDER）を編集フォーム上では空欄に戻す */
function normalizeEvidence(evidenceRefs: string[]): string {
  const value = evidenceRefs[0] || '';
  return value === '-' ? '' : value;
}

interface NodeFormState {
  id: string;
  type: GSNNodeType;
  description: string;
  status: GSNNodeStatus;
  severity: RiskSeverity;
  asilLevel: string;
  parentIds: string[];
  evidence: string;
  isOpenIssue: boolean;
  hasFailedVerification: boolean;
}

function nodeToForm(node: GSNNode): NodeFormState {
  return {
    id: node.id,
    type: node.type,
    description: node.description,
    status: node.status,
    severity: node.severity,
    asilLevel: node.asilLevel || '',
    parentIds: node.parentIds,
    evidence: normalizeEvidence(node.evidenceRefs),
    isOpenIssue: node.isOpenIssue,
    hasFailedVerification: node.hasFailedVerification,
  };
}

function formToNode(form: NodeFormState): GSNNode {
  const id = form.id.trim();
  return {
    id,
    type: form.type,
    description: form.description.trim(),
    status: form.status,
    severity: form.severity,
    asilLevel: form.asilLevel || undefined,
    parentIds: form.parentIds,
    childIds: [],
    evidenceRefs: form.evidence.trim() ? [form.evidence.trim()] : [],
    isOpenIssue: form.isOpenIssue,
    hasFailedVerification: form.hasFailedVerification,
    isUnverifiedRequirement: false, // 内容欄のキーワードから再パース時に自動導出される
    depth: (id.match(/\./g) || []).length + 1,
  };
}

/** candidateId が rootId の子孫（子・孫・…）であるかを判定する（循環参照防止に使う） */
function isDescendantOf(nodes: GSNNode[], candidateId: string, rootId: string): boolean {
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of nodes) {
      if (n.parentIds.includes(current) && !visited.has(n.id)) {
        if (n.id === candidateId) return true;
        visited.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return false;
}

interface GSNStructureEditorProps {
  fileId: string;
  fileName: string;
  initialNodes: GSNNode[];
  language: string;
  onSave: (fileId: string, newContent: string) => void;
  onCancel: () => void;
}

export default function GSNStructureEditor({
  fileId,
  fileName,
  initialNodes,
  language,
  onSave,
  onCancel,
}: GSNStructureEditorProps) {
  const [nodes, setNodes] = useState<GSNNode[]>(initialNodes);
  const [form, setForm] = useState<NodeFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // null かつ form!=null なら新規追加
  const [idTouched, setIdTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmedReplace, setConfirmedReplace] = useState(false);

  const analysis: GSNAnalysis = useMemo(() => {
    const parsed = buildParsedGSN(nodes);
    const derived = deriveAnalysis(parsed);
    return {
      ...derived,
      fileId,
      fileName,
      isPreviewOnly: false,
      hasNoContent: nodes.length === 0,
    };
  }, [nodes, fileId, fileName]);

  const t = (ja: string, en: string) => (language === 'en' ? en : ja);

  const openAddForm = () => {
    const type: GSNNodeType = 'Goal';
    setEditingId(null);
    setIdTouched(false);
    setFormError(null);
    setForm({
      id: suggestNextNodeId(nodes, type),
      type,
      description: '',
      status: 'unknown',
      severity: 'unknown',
      asilLevel: '',
      parentIds: [],
      evidence: '',
      isOpenIssue: false,
      hasFailedVerification: false,
    });
  };

  const openEditForm = (node: GSNNode) => {
    setEditingId(node.id);
    setIdTouched(true);
    setFormError(null);
    setForm(nodeToForm(node));
  };

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  };

  const handleTypeChange = (type: GSNNodeType) => {
    if (!form) return;
    const nextId = !idTouched ? suggestNextNodeId(nodes, type) : form.id;
    setForm({ ...form, type, id: nextId });
  };

  const handleAsilChange = (asilLevel: string) => {
    if (!form) return;
    // ASIL-C/D は重大度Highを含意する（detectSeverityの既存ルールと一致させる）
    const bumpSeverity = (asilLevel === 'ASIL-C' || asilLevel === 'ASIL-D') &&
      (form.severity === 'low' || form.severity === 'medium' || form.severity === 'unknown');
    setForm({ ...form, asilLevel, severity: bumpSeverity ? 'high' : form.severity });
  };

  const toggleParent = (parentId: string) => {
    if (!form) return;
    const has = form.parentIds.includes(parentId);
    setForm({
      ...form,
      parentIds: has ? form.parentIds.filter(id => id !== parentId) : [...form.parentIds, parentId],
    });
  };

  const handleSubmitForm = () => {
    if (!form) return;
    const id = form.id.trim();

    if (!id) {
      setFormError(t('ノードIDを入力してください', 'Enter a node ID'));
      return;
    }
    if (!GSN_NODE_ID_PATTERN.test(id)) {
      setFormError(
        t(
          'ノードIDの形式が正しくありません（例: G1, S1, C1, A1, Sn01, E1, J1, U1, G1.1）',
          'Invalid node ID format (e.g. G1, S1, C1, A1, Sn01, E1, J1, U1, G1.1)'
        )
      );
      return;
    }
    const isNew = editingId === null;
    const idCollides = nodes.some(n => n.id.toLowerCase() === id.toLowerCase() && n.id !== editingId);
    if (idCollides) {
      setFormError(t('同じIDのノードが既に存在します', 'A node with this ID already exists'));
      return;
    }
    if (!isNew && form.parentIds.some(pid => pid === id)) {
      setFormError(t('自分自身を親にすることはできません', 'A node cannot be its own parent'));
      return;
    }
    if (!isNew && form.parentIds.some(pid => isDescendantOf(nodes, pid, id))) {
      setFormError(
        t('選択した親ノードは、この構造では循環参照になります', 'The selected parent would create a circular reference')
      );
      return;
    }

    const newNode = formToNode({ ...form, id });

    setNodes(prev => {
      if (isNew) return [...prev, newNode];
      return prev.map(n => (n.id === editingId ? newNode : n));
    });
    closeForm();
  };

  const handleDelete = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    const childCount = nodes.filter(n => n.parentIds.includes(nodeId)).length;
    const message = childCount > 0
      ? t(
          `ノード ${nodeId} を削除しますか？ 子ノード${childCount}件は親を失い、トップレベル表示になります。`,
          `Delete node ${nodeId}? ${childCount} child node(s) will lose this parent link and move to the top level.`
        )
      : t(`ノード ${nodeId} を削除しますか？`, `Delete node ${nodeId}?`);

    if (!node || !confirm(message)) return;

    setNodes(prev =>
      prev
        .filter(n => n.id !== nodeId)
        .map(n => (n.parentIds.includes(nodeId) ? { ...n, parentIds: n.parentIds.filter(id => id !== nodeId) } : n))
    );
  };

  const handleSave = () => {
    if (!confirmedReplace) {
      const ok = confirm(
        t(
          '保存すると、このファイルの内容全体が編集後の構造から生成した表に置き換わります。テーブル以外の記述（ハザード分析の文章など）が含まれている場合は失われます。続行しますか？',
          'Saving will replace the entire file content with a table generated from the edited structure. Any text outside the table (e.g. hazard analysis notes) will be lost. Continue?'
        )
      );
      if (!ok) return;
      setConfirmedReplace(true);
    }
    onSave(fileId, serializeGSNToMarkdown(nodes));
  };

  const otherNodes = useMemo(
    () => (editingId ? nodes.filter(n => n.id !== editingId && !isDescendantOf(nodes, n.id, editingId)) : nodes),
    [nodes, editingId]
  );

  return (
    <div className="fixed inset-0 bg-black/50 bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {t('GSN構造を編集', 'Edit GSN structure')} — {fileName}
          </h3>
          <button onClick={onCancel} className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400" type="button">
            <FiX size={24} />
          </button>
        </div>

        <div className="mb-4 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <FiAlertTriangle className="shrink-0 mt-0.5" />
          <span>
            {t(
              '保存すると、このファイルの内容は編集後の構造から生成した表に置き換わります。テーブル以外の自由記述は失われます。',
              'Saving replaces the file content with a table generated from the edited structure. Free-form text outside the table is discarded.'
            )}
          </span>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('ノード一覧', 'Nodes')} ({nodes.length})
          </h4>
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600"
          >
            <FiPlus /> {t('ノードを追加', 'Add node')}
          </button>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {nodes.length === 0 && (
              <p className="p-3 text-sm text-gray-500 dark:text-gray-400">
                {t('ノードがありません。「ノードを追加」から作成してください。', 'No nodes yet. Use "Add node" to create one.')}
              </p>
            )}
            {[...nodes]
              .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
              .map(node => (
                <div key={node.id} className="flex items-center gap-2 p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <code className="shrink-0 font-mono text-gray-900 dark:text-gray-100">{node.id}</code>
                  <span className={`shrink-0 text-sm px-1.5 rounded ${NODE_TYPE_STYLES[node.type]}`}>{node.type}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                    {node.description || t('（記載なし）', '(no description)')}
                  </span>
                  <span className="shrink-0 text-gray-500 dark:text-gray-400">{statusLabel(node.status, language)}</span>
                  <button
                    type="button"
                    onClick={() => openEditForm(node)}
                    className="shrink-0 p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                    aria-label="edit"
                  >
                    <FiEdit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(node.id)}
                    className="shrink-0 p-1 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                    aria-label="delete"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('プレビュー（保存前の確認）', 'Preview (before saving)')}
          </h4>
          <SummarySection analysis={analysis} language={language} />
          <MandatoryCoreSection analysis={analysis} language={language} />
          {analysis.nodeCount > 0 && <TreeSection analysis={analysis} language={language} />}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
          >
            {t('キャンセル', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 px-3 py-2 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 rounded-md text-sm transition-colors"
          >
            <FiSave /> {t('保存', 'Save')}
          </button>
        </div>

        {/* ノード追加・編集フォーム */}
        {form && (
          <div className="fixed inset-0 bg-black/50 bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                  {editingId ? t('ノードを編集', 'Edit node') : t('ノードを追加', 'Add node')}
                </h4>
                <button onClick={closeForm} className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400" type="button">
                  <FiX size={20} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('ノードID', 'Node ID')} <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.id}
                    disabled={editingId !== null}
                    onChange={e => {
                      setIdTouched(true);
                      setForm({ ...form, id: e.target.value });
                    }}
                    placeholder="G1, S1, C1, A1, Sn01, E1, J1, U1, G1.1..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('種別', 'Type')}</label>
                  <select
                    value={form.type}
                    onChange={e => handleTypeChange(e.target.value as GSNNodeType)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                  >
                    {NODE_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('内容', 'Description')}</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('達成状況', 'Status')}</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as GSNNodeStatus })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{statusLabel(s, language)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
                    <select
                      value={form.severity}
                      onChange={e => setForm({ ...form, severity: e.target.value as RiskSeverity })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                    >
                      {SEVERITIES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ASIL</label>
                  <select
                    value={form.asilLevel}
                    onChange={e => handleAsilChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                  >
                    {ASIL_LEVELS.map(level => (
                      <option key={level} value={level}>{level || t('(なし)', '(none)')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('根拠', 'Evidence')}</label>
                  <input
                    type="text"
                    value={form.evidence}
                    onChange={e => setForm({ ...form, evidence: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('親ノード', 'Parent nodes')}
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-2 space-y-1">
                    {otherNodes.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500">{t('選択可能なノードがありません', 'No selectable nodes')}</p>
                    )}
                    {[...otherNodes]
                      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
                      .map(n => (
                        <label key={n.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={form.parentIds.includes(n.id)}
                            onChange={() => toggleParent(n.id)}
                          />
                          <code className="font-mono">{n.id}</code>
                          <span className="truncate">{n.description}</span>
                        </label>
                      ))}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.isOpenIssue}
                      onChange={e => setForm({ ...form, isOpenIssue: e.target.checked })}
                    />
                    {t('未解決事項', 'Open issue')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.hasFailedVerification}
                      onChange={e => setForm({ ...form, hasFailedVerification: e.target.checked })}
                    />
                    {t('検証失敗', 'Failed verification')}
                  </label>
                </div>

                {formError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
                >
                  {t('キャンセル', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitForm}
                  className="px-3 py-2 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 rounded-md text-sm transition-colors"
                >
                  {editingId ? t('更新', 'Update') : t('追加', 'Add')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
