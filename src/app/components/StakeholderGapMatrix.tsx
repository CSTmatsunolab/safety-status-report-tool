// src/app/components/StakeholderGapMatrix.tsx
// ステークホルダ間ギャップ行列: GSNノード・リスクが、どの読者のレポートにどの深さで書かれているかを並べて比較する
'use client';

import { useMemo, useState } from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import { useI18n } from './I18nProvider';
import { COVERAGE_BADGE_STYLES } from './heatmap-styles';
import { REPORT_COVERAGE_LABELS } from '@/lib/risk-heatmap';
import { GSN_RELEVANCE_LABELS } from '@/lib/gsn-categories';
import {
  GAP_FLAG_LABELS,
  GapCell,
  GapFlag,
  GapItemKind,
  GapMatrix,
  summarizeGapColumn,
} from '@/lib/stakeholder-gap';

const TEXTS = {
  ja: {
    summaryTitle: '読者ごとの伝達状況',
    required: '読者に必須の項目',
    unresolved: '未解決事項のうち記載あり',
    noProfile: '読者の要求が保存されていないため関連度は算出できません',
    pairTitle: '読者間の情報差',
    pairHint: '行の読者のレポートでは詳述しているが、列の読者のレポートでは触れていない項目の数（赤字＝うち未解決）。＋は記載の深さだけが違う項目。数字を押すと下の表をその項目に絞り込みます。',
    pairCorner: '詳述している読者 ＼ 触れていない読者',
    tableTitle: 'ギャップ行列',
    onlyGaps: 'ギャップのある項目のみ',
    all: 'すべて',
    gsn: 'GSNノード',
    risk: 'リスク',
    item: '項目',
    status: '状況',
    gaps: 'ギャップ',
    unresolvedBadge: '未解決',
    pairFilter: (from: string, to: string) => `${from} の方が ${to} より詳しく書かれている項目に絞り込み中`,
    clearFilter: '絞り込みを解除',
    noRows: '該当する項目はありません。',
    differentInputs: '比較したレポートの入力ファイルが一致していません。同じ文書から作ったレポートでないと、項目のIDや状況が対応しない場合があります。',
    legend:
      'セルは記載の深さ（詳述＝見出しで個別に取り上げた／言及のみ＝本文・表で触れた／なし）と、その読者への関連度（必須／関連／参考）。赤い枠は「読者に必須なのに記載なし」。',
    flagHelp: {
      missed: '少なくとも1人の読者にとって必須なのに、その読者のレポートで触れていない',
      silent: '未解決なのに、どのレポートでも触れていない',
      asymmetric: 'ある読者には詳述し、別の読者には触れていない',
      depth: '読者によって記載の深さが違う（詳述と言及のみ、言及のみとなし）',
    } as Record<GapFlag, string>,
  },
  en: {
    summaryTitle: 'Coverage by reader',
    required: 'Items required for the reader',
    unresolved: 'Unresolved items covered',
    noProfile: 'Relevance unavailable (reader requirements not saved)',
    pairTitle: 'Information gaps between readers',
    pairHint: 'Number of items detailed in the row reader’s report but not mentioned in the column reader’s report (red = unresolved). "+" counts items that differ only in depth. Click a number to filter the table below.',
    pairCorner: 'Detailed for ＼ Missing for',
    tableTitle: 'Gap matrix',
    onlyGaps: 'Only items with gaps',
    all: 'All',
    gsn: 'GSN nodes',
    risk: 'Risks',
    item: 'Item',
    status: 'Status',
    gaps: 'Gaps',
    unresolvedBadge: 'Unresolved',
    pairFilter: (from: string, to: string) => `Showing items covered in more depth for ${from} than for ${to}`,
    clearFilter: 'Clear filter',
    noRows: 'No matching items.',
    differentInputs: 'The compared reports were generated from different input files. Item IDs and statuses may not correspond.',
    legend:
      'Each cell shows coverage depth (Detailed = has its own heading / Mentioned = referred to in text or tables / No) and relevance to that reader (Required / Related / Reference). A red frame means required for the reader but not covered.',
    flagHelp: {
      missed: 'Required for at least one reader but not covered in that reader’s report',
      silent: 'Unresolved but not covered in any report',
      asymmetric: 'Detailed for some readers but not mentioned for others',
      depth: 'Covered at different depths (Detailed vs Mentioned, or Mentioned vs No)',
    } as Record<GapFlag, string>,
  },
};

const FLAG_STYLES: Record<GapFlag, string> = {
  missed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  silent: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
  asymmetric: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  depth: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

type KindFilter = 'all' | GapItemKind;

function CoverageCell({ cell, language }: { cell: GapCell; language: 'ja' | 'en' }) {
  const missed = cell.relevance === 'required' && cell.coverage === 'none';
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded px-1 py-1 ${missed ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-900/30' : ''}`}
      title={cell.reason}
    >
      <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${COVERAGE_BADGE_STYLES[cell.coverage]}`}>
        {REPORT_COVERAGE_LABELS[language][cell.coverage]}
      </span>
      {cell.relevance && (
        <span
          className={`text-xs ${
            cell.relevance === 'required'
              ? 'font-bold text-gray-900 dark:text-white'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {GSN_RELEVANCE_LABELS[language][cell.relevance]}
        </span>
      )}
    </div>
  );
}

export function StakeholderGapMatrix({ matrix }: { matrix: GapMatrix }) {
  const { language } = useI18n();
  const t = TEXTS[language];
  const [onlyGaps, setOnlyGaps] = useState(true);
  const [kind, setKind] = useState<KindFilter>('all');
  const [pair, setPair] = useState<[number, number] | null>(null);

  const summaries = useMemo(
    () => matrix.columns.map((_, i) => summarizeGapColumn(matrix, i)),
    [matrix]
  );

  const visibleRows = useMemo(() => {
    const pairIds = pair
      ? new Set([...matrix.pairs[pair[0]][pair[1]].ids, ...matrix.pairs[pair[0]][pair[1]].shallowerIds])
      : null;
    return matrix.rows.filter(
      (row) =>
        (kind === 'all' || row.kind === kind) &&
        (pairIds ? pairIds.has(row.id) : !onlyGaps || row.flags.length > 0)
    );
  }, [matrix, kind, onlyGaps, pair]);

  const tabClass = (active: boolean) =>
    `px-3 py-1 text-sm rounded-md transition-colors ${
      active
        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="space-y-6">
      {!matrix.sameInputs && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>{t.differentInputs}</span>
        </div>
      )}

      {/* 読者ごとの伝達状況 */}
      <section className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">{t.summaryTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matrix.columns.map((column, i) => {
            const s = summaries[i];
            return (
              <div key={column.reportId} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                <div className="font-medium text-gray-900 dark:text-white">{column.label}</div>
                <dl className="mt-2 space-y-1 text-sm">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">{t.required}</dt>
                    <dd className="text-gray-800 dark:text-gray-200">
                      {column.gsnProfile || column.riskProfile ? (
                        <>
                          {s.required}
                          {language === 'ja' ? '件 — ' : ' — '}
                          {(['detailed', 'mentioned', 'none'] as const).map((c, k) => (
                            <span key={c} className={c === 'none' && s.requiredByCoverage.none > 0 ? 'font-bold text-red-600 dark:text-red-400' : ''}>
                              {k > 0 && ' / '}
                              {REPORT_COVERAGE_LABELS[language][c]} {s.requiredByCoverage[c]}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">{t.noProfile}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">{t.unresolved}</dt>
                    <dd className="text-gray-800 dark:text-gray-200">
                      {s.unresolvedCovered} / {s.unresolved}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      {/* 読者間の情報差 */}
      <section className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">{t.pairTitle}</h2>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t.pairHint}</p>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-normal text-gray-500 dark:text-gray-400">{t.pairCorner}</th>
                {matrix.columns.map((c) => (
                  <th key={c.reportId} className="p-2 text-center font-medium text-gray-700 dark:text-gray-200">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.columns.map((from, i) => (
                <tr key={from.reportId} className="border-t border-gray-100 dark:border-gray-700">
                  <th className="p-2 text-left font-medium text-gray-700 dark:text-gray-200">{from.label}</th>
                  {matrix.columns.map((to, j) => {
                    if (i === j) {
                      return <td key={to.reportId} className="p-2 text-center text-gray-300 dark:text-gray-600">—</td>;
                    }
                    const p = matrix.pairs[i][j];
                    const active = pair?.[0] === i && pair?.[1] === j;
                    return (
                      <td key={to.reportId} className="p-1 text-center">
                        <button
                          onClick={() => setPair(active ? null : [i, j])}
                          disabled={p.ids.length + p.shallowerIds.length === 0}
                          className={`min-w-[4rem] rounded px-2 py-1 transition-colors disabled:cursor-default ${
                            active
                              ? 'bg-blue-600 text-white dark:bg-sky-400 dark:text-gray-900'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="font-bold">{p.ids.length}</span>
                          {p.unresolvedIds.length > 0 && (
                            <span className={active ? '' : 'text-red-600 dark:text-red-400'}> ({p.unresolvedIds.length})</span>
                          )}
                          {p.shallowerIds.length > 0 && (
                            <span className={`ml-1 text-xs ${active ? '' : 'text-gray-500 dark:text-gray-400'}`}>
                              +{p.shallowerIds.length}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ギャップ行列 */}
      <section className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.tableTitle}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(['all', 'gsn', 'risk'] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)} className={tabClass(kind === k)}>
                  {t[k]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={onlyGaps}
                onChange={(e) => setOnlyGaps(e.target.checked)}
                disabled={pair !== null}
              />
              {t.onlyGaps}
            </label>
          </div>
        </div>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t.legend}</p>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {(Object.keys(GAP_FLAG_LABELS[language]) as GapFlag[]).map((f) => (
            <span key={f} className={`rounded px-2 py-0.5 ${FLAG_STYLES[f]}`} title={t.flagHelp[f]}>
              {GAP_FLAG_LABELS[language][f]}: {t.flagHelp[f]}
            </span>
          ))}
        </div>

        {pair && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
            <span>{t.pairFilter(matrix.columns[pair[0]].label, matrix.columns[pair[1]].label)}</span>
            <button onClick={() => setPair(null)} className="ml-auto flex items-center gap-1 underline">
              <FiX size={14} />
              {t.clearFilter}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {t.item}
                </th>
                <th className="p-2 text-left font-medium text-gray-700 dark:text-gray-200">{t.status}</th>
                {matrix.columns.map((c) => (
                  <th key={c.reportId} className="p-2 text-center font-medium text-gray-700 dark:text-gray-200">
                    {c.label}
                  </th>
                ))}
                <th className="p-2 text-left font-medium text-gray-700 dark:text-gray-200">{t.gaps}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={matrix.columns.length + 3} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    {t.noRows}
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr key={`${row.kind}:${row.id}`} className="border-b border-gray-100 align-top dark:border-gray-700">
                  <td className="sticky left-0 z-10 max-w-xs bg-white p-2 dark:bg-gray-800">
                    <div className="font-mono font-bold text-gray-900 dark:text-white">{row.id}</div>
                    {row.text && <div className="text-xs text-gray-600 dark:text-gray-400">{row.text}</div>}
                  </td>
                  <td className="p-2 text-xs text-gray-700 dark:text-gray-300">
                    {row.unresolved && (
                      <span className="mb-1 inline-block rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">
                        {t.unresolvedBadge}
                      </span>
                    )}
                    <div>{row.statusText}</div>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={matrix.columns[i].reportId} className="p-1">
                      <CoverageCell cell={cell} language={language} />
                    </td>
                  ))}
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {row.flags.map((f) => (
                        <span key={f} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${FLAG_STYLES[f]}`} title={t.flagHelp[f]}>
                          {GAP_FLAG_LABELS[language][f]}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
