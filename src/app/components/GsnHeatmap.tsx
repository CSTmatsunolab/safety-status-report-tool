// src/app/components/GsnHeatmap.tsx
// GSNノードヒートマップ（縦軸＝GSNの深さ × 横軸＝必要情報カテゴリー）の描画コンポーネント
// 横軸は固定のカテゴリー（src/lib/gsn-categories.ts）。どのカテゴリーにも入らないノードは「該当なし」列に置く
// セルの色はセル内ノードの最も悪い達成状況（未展開=赤 → 達成=緑）
// highlightCategories を渡すと、そのステークホルダが必要とするカテゴリーの列を強調する
// onToggle を渡すと、クリックで「詳述する／しない」を切り替える選択モードになる
'use client';

import { useState } from 'react';
import { useI18n } from './I18nProvider';
import {
  GSN_SEVERITY_LABELS,
  GSN_STATUS_LABELS,
  GsnHeatmapItem,
  GsnNodeKind,
  GsnStatus,
  computeGsnDepths,
  gsnStatusBand,
  gsnStatusRank,
  worstStatus,
} from '@/lib/gsn-heatmap';
import {
  BAND_CELL_STYLES,
  CHIP_ACTIVE,
  CHIP_DOC_ONLY,
  CHIP_IN_REPORT,
  axisLabelClass,
  cellStateClass,
} from './heatmap-styles';
import { GSN_CATEGORY_IDS, gsnCategoryLabel } from '@/lib/gsn-categories';

// ノード種別ごとのチップ形状（GSN表記に寄せる: Goal=四角 / Strategy=斜体の角張り / Solution=丸）
const KIND_SHAPES: Record<GsnNodeKind, string> = {
  goal: 'rounded-sm',
  strategy: 'rounded-none italic',
  solution: 'rounded-full',
  other: 'rounded',
};

// 列のキー: カテゴリーID と「該当なし」
const NO_CATEGORY = 'none';
const COLUMNS = [...GSN_CATEGORY_IDS, NO_CATEGORY];

// 達成状況が記載されていないノードだけのセル
const UNKNOWN_STATUS_CELL = 'bg-gray-200 dark:bg-gray-700';
const EMPTY_CELL = 'bg-gray-50 dark:bg-gray-800';

const STATUS_LEGEND: GsnStatus[] = ['undeveloped', 'unachieved', 'partial', 'achieved'];

const TEXTS = {
  ja: {
    title: 'GSNノードヒートマップ',
    depth: 'GSNの深さ',
    categoryAxis: '必要情報カテゴリー',
    needed: '必要',
    depthLabel: (d: number) => (d === 0 ? '0 トップ' : String(d)),
    depthUnknown: '不明',
    noCategory: '該当なし',
    status: '達成状況',
    severity: '重大度',
    severitySource: '重大度の出典',
    documented: '文書記載値',
    type: '種別',
    unknownStatus: '記載なし',
    empty: 'GSNノードのデータがありません。',
    countNeutral: (total: number) => `GSNノード ${total}件`,
    count: (on: number, total: number, label: string) => `GSNノード ${total}件（うち${label} ${on}件）`,
    note: '※ 縦軸はトップゴールからの段数、色はセル内で最も悪い達成状況。列見出しをクリックするとそのカテゴリーで絞り込み',
    noteUnknownDepth: '親子関係が読み取れないノードは「不明」の行に置いています',
    inReport: '本レポートで言及',
    notInReport: '本レポート未言及',
    kinds: { goal: 'Goal', strategy: 'Strategy', solution: 'Solution', other: 'その他' },
    plotted: 'ノード一覧（クリック・ホバーでヒートマップ上の位置を強調）',
    plottedToggle: 'ノード一覧（クリックで詳述する／しないを切り替え、ホバーで位置を強調）',
    depthOf: (d: number | null) => (d === null ? '深さ不明' : `深さ ${d}`),
  },
  en: {
    title: 'GSN Node Heatmap',
    depth: 'GSN depth',
    categoryAxis: 'Information categories',
    needed: 'Needed',
    depthLabel: (d: number) => (d === 0 ? '0 top' : String(d)),
    depthUnknown: 'Unknown',
    noCategory: 'None',
    status: 'Status',
    severity: 'Severity',
    severitySource: 'Severity source',
    documented: 'Documented value',
    type: 'Type',
    unknownStatus: 'Not documented',
    empty: 'No GSN node data.',
    countNeutral: (total: number) => `${total} GSN nodes`,
    count: (on: number, total: number, label: string) => `${total} GSN nodes (${label}: ${on})`,
    note: '* Rows are levels below the top goal; color is the worst status in the cell. Click a column header to filter by that category',
    noteUnknownDepth: 'Nodes whose parents cannot be read are placed in the "Unknown" row',
    inReport: 'Mentioned in this report',
    notInReport: 'Not mentioned',
    kinds: { goal: 'Goal', strategy: 'Strategy', solution: 'Solution', other: 'Other' },
    plotted: 'Nodes (click or hover to highlight their position)',
    plottedToggle: 'Nodes (click to include/exclude, hover to highlight their position)',
    depthOf: (d: number | null) => (d === null ? 'Depth unknown' : `Depth ${d}`),
  },
};

// inReport が未判定（undefined）の場合は言及ありとして扱う
const isInReport = (node: GsnHeatmapItem) => node.inReport !== false;

interface GsnHeatmapProps {
  nodes: GsnHeatmapItem[];
  title?: string;
  // 強調あり／なしの表示名（既定は「本レポートで言及／未言及」）。null は強調の区別を表示しない
  labels?: { on: string; off: string } | null;
  // 指定時はクリックで強調（inReport）を切り替える選択モードになる
  onToggle?: (id: string) => void;
  // ノードID → 強調の理由（一覧に表示）
  reasons?: Record<string, string>;
  // ステークホルダが必要とするカテゴリーのID（列を強調する）
  highlightCategories?: string[] | null;
  // 強調の説明（例: 「CxO が必要」）。未指定なら「必要」
  highlightLabel?: string;
  // 絞り込み中のカテゴリー（null = すべて）。onCategoryChange が無ければ内部で保持する
  activeCategory?: string | null;
  onCategoryChange?: (id: string | null) => void;
}

export function GsnHeatmap({
  nodes,
  title,
  labels,
  onToggle,
  reasons,
  highlightCategories,
  highlightLabel,
  activeCategory: activeCategoryProp,
  onCategoryChange,
}: GsnHeatmapProps) {
  const { language } = useI18n();
  const t = TEXTS[language];
  const statusLabels = GSN_STATUS_LABELS[language];
  const severityLabels = GSN_SEVERITY_LABELS[language];
  const onLabel = labels?.on ?? t.inReport;
  const offLabel = labels?.off ?? t.notInReport;
  const neutral = labels === null;
  // クリックで固定する選択と、ホバー中の一時的な強調
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [localCategory, setLocalCategory] = useState<string | null>(null);
  const activeCategory = onCategoryChange ? activeCategoryProp ?? null : localCategory;
  const setActiveCategory = onCategoryChange ?? setLocalCategory;

  const highlighted = new Set(highlightCategories ?? []);
  const hasHighlight = highlighted.size > 0;
  // ノードが置かれる列（どのカテゴリーにも入らないノードは「該当なし」）
  const columnsOf = (node: GsnHeatmapItem): string[] => {
    const ids = (node.categories ?? []).filter((c) => COLUMNS.includes(c));
    return ids.length > 0 ? ids : [NO_CATEGORY];
  };
  const columnLabel = (col: string) => (col === NO_CATEGORY ? t.noCategory : gsnCategoryLabel(col, language));

  const depths = computeGsnDepths(nodes);
  const knownDepths = Object.values(depths).filter((d): d is number => d !== null);
  const maxDepth = knownDepths.length > 0 ? Math.max(...knownDepths) : -1;
  const hasUnknownDepth = Object.values(depths).some((d) => d === null);
  const rows: (number | null)[] = [
    ...Array.from({ length: maxDepth + 1 }, (_, d) => d),
    ...(hasUnknownDepth ? [null] : []),
  ];

  // 詳述する（言及あり）を先に、深さ順、その中は未達成度の高い順
  const sorted = [...nodes].sort(
    (a, b) =>
      Number(isInReport(b)) - Number(isInReport(a)) ||
      (depths[a.id] ?? Infinity) - (depths[b.id] ?? Infinity) ||
      gsnStatusRank(b.status) - gsnStatusRank(a.status)
  );
  const inReportCount = nodes.filter(isInReport).length;
  const selected = nodes.find((n) => n.id === selectedId);

  const activeId = hoveredId ?? selectedId;
  const active = nodes.find((n) => n.id === activeId);
  const activeColumns = active ? columnsOf(active) : [];

  const toggleSelected = (id: string) => setSelectedId(selectedId === id ? null : id);
  const handleClick = (id: string) => (onToggle ? onToggle(id) : toggleSelected(id));
  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredId(id),
    onMouseLeave: () => setHoveredId(null),
    onFocus: () => setHoveredId(id),
    onBlur: () => setHoveredId(null),
  });
  // カテゴリーで絞り込み中に、そのノードが対象外か
  const isFilteredOut = (node: GsnHeatmapItem) =>
    activeCategory !== null && !columnsOf(node).includes(activeCategory);
  const statusSuffix = (node: GsnHeatmapItem) =>
    neutral ? '' : `（${isInReport(node) ? onLabel : offLabel}）`;
  const chipClass = (node: GsnHeatmapItem) =>
    activeId === node.id ? CHIP_ACTIVE : neutral || isInReport(node) ? CHIP_IN_REPORT : CHIP_DOC_ONLY;
  const statusText = (node: GsnHeatmapItem) => (node.status ? statusLabels[node.status] : t.unknownStatus);
  const categoryNames = (node: GsnHeatmapItem) =>
    (node.categories ?? []).map((c) => gsnCategoryLabel(c, language));

  if (nodes.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">{t.empty}</p>;
  }

  return (
    <figure className="not-prose my-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-gray-900 dark:text-white">{title ?? t.title}</span>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {neutral ? t.countNeutral(nodes.length) : t.count(inReportCount, nodes.length, onLabel)}
        </span>
      </figcaption>

      <div className="overflow-x-auto">
        <div className="flex items-stretch gap-2" style={{ minWidth: `${6 + COLUMNS.length * 7}rem` }}>
          {/* 縦軸ラベル */}
          <div className="flex items-center">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 [writing-mode:vertical-rl] rotate-180">
              ← {t.depth}
            </span>
          </div>

          <div className="flex-1">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `4rem repeat(${COLUMNS.length}, minmax(6rem, 1fr))` }}
            >
              {/* 横軸見出し（クリックでそのカテゴリーに絞り込み。ステークホルダが必要とする列は強調） */}
              <div />
              {COLUMNS.map((col) => {
                const isActiveCol = activeCategory === col || activeColumns.includes(col);
                const isNeeded = highlighted.has(col);
                return (
                  <button
                    key={`x-${col}`}
                    type="button"
                    aria-pressed={activeCategory === col}
                    onClick={() => setActiveCategory(activeCategory === col ? null : col)}
                    title={isNeeded ? `${columnLabel(col)}（${highlightLabel ?? t.needed}）` : columnLabel(col)}
                    className={`${axisLabelClass(isActiveCol)} min-h-8 flex-col gap-0.5 px-1 text-center leading-tight hover:underline ${
                      isNeeded && !isActiveCol ? 'border-b-4 border-blue-600 font-bold text-blue-800 dark:border-sky-400 dark:text-sky-200' : ''
                    } ${hasHighlight && !isNeeded && !isActiveCol ? 'opacity-50' : ''}`}
                  >
                    <span>{columnLabel(col)}</span>
                    {isNeeded && (
                      <span className="rounded bg-blue-600 px-1 text-[10px] font-medium text-white dark:bg-sky-400 dark:text-gray-900">
                        {highlightLabel ?? t.needed}
                      </span>
                    )}
                  </button>
                );
              })}

              {rows.map((depth) => (
                <div key={`row-${depth ?? 'unknown'}`} className="contents">
                  <div className={axisLabelClass(!!active && depths[active.id] === depth)}>
                    {depth === null ? t.depthUnknown : t.depthLabel(depth)}
                  </div>
                  {COLUMNS.map((col) => {
                    const cellNodes = nodes.filter(
                      (n) => depths[n.id] === depth && columnsOf(n).includes(col)
                    );
                    const reportNodeCount = neutral ? cellNodes.length : cellNodes.filter(isInReport).length;
                    const isActiveCell = !!active && cellNodes.some((n) => n.id === active.id);
                    const band = gsnStatusBand(worstStatus(cellNodes));
                    const background =
                      cellNodes.length === 0 ? EMPTY_CELL : band ? BAND_CELL_STYLES[band] : UNKNOWN_STATUS_CELL;
                    // カテゴリーで絞り込み中は他の列を、ステークホルダ選択中は不要な列を薄くする
                    const filtered = !active && activeCategory !== null && activeCategory !== col;
                    const unneeded = !active && activeCategory === null && hasHighlight && !highlighted.has(col);
                    const stateClass = filtered
                      ? 'border-transparent opacity-20'
                      : `${cellStateClass(!!active, isActiveCell, reportNodeCount, cellNodes.length)} ${unneeded ? 'opacity-40' : ''}`;

                    return (
                      <div
                        key={`cell-${depth ?? 'unknown'}-${col}`}
                        className={`relative min-h-14 rounded border-2 p-1 transition-all ${background} ${stateClass}`}
                      >
                        {reportNodeCount > 0 && (
                          <span className="absolute right-1 top-0.5 rounded-full bg-gray-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900">
                            {reportNodeCount}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1 pt-4">
                          {cellNodes.map((node) => (
                            <button
                              key={node.id}
                              type="button"
                              title={`${node.text ? `${node.id}: ${node.text}` : node.id}（${statusText(node)}）${statusSuffix(node)}`}
                              onClick={() => handleClick(node.id)}
                              {...hoverHandlers(node.id)}
                              className={`px-1.5 py-0.5 text-xs transition-all ${KIND_SHAPES[node.kind]} ${chipClass(node)}`}
                            >
                              {node.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-1 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
              {t.categoryAxis} →
            </div>
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
        <span className="text-gray-500 dark:text-gray-400">{t.status}:</span>
        {STATUS_LEGEND.map((status) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${BAND_CELL_STYLES[gsnStatusBand(status)!]}`} />
            {statusLabels[status]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className={`inline-block h-3 w-3 rounded-sm ${UNKNOWN_STATUS_CELL}`} />
          {t.unknownStatus}
        </span>
        {(['goal', 'strategy', 'solution'] as GsnNodeKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1">
            <span className={`px-1 text-[10px] ${KIND_SHAPES[kind]} ${CHIP_IN_REPORT}`}>
              {kind === 'goal' ? 'G' : kind === 'strategy' ? 'S' : 'Sn'}
            </span>
            {t.kinds[kind]}
          </span>
        ))}
        {!neutral && (
          <>
            <span className="flex items-center gap-1">
              <span className={`rounded px-1 text-[10px] ${CHIP_IN_REPORT}`}>G-x</span>
              {onLabel}
            </span>
            <span className="flex items-center gap-1">
              <span className={`rounded px-1 text-[10px] ${CHIP_DOC_ONLY}`}>G-x</span>
              {offLabel}
            </span>
          </>
        )}
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {t.note}
        {hasUnknownDepth ? `／${t.noteUnknownDepth}` : ''}
      </div>

      {/* ノード一覧（ヒートマップ上の位置と連動） */}
      <div className="mt-4">
        <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          {onToggle ? t.plottedToggle : t.plotted}
        </div>
        <ul className="m-0 list-none p-0 divide-y divide-gray-100 dark:divide-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
          {sorted.map((node) => {
            const band = gsnStatusBand(node.status);
            const isActive = activeId === node.id;
            const inReport = neutral || isInReport(node);
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => handleClick(node.id)}
                  {...hoverHandlers(node.id)}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-sky-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  } ${isFilteredOut(node) ? 'opacity-25' : inReport ? '' : 'opacity-60'}`}
                >
                  {onToggle && (
                    <input
                      type="checkbox"
                      checked={inReport}
                      readOnly
                      tabIndex={-1}
                      className="pointer-events-none h-3.5 w-3.5 flex-shrink-0"
                    />
                  )}
                  <span
                    className={`inline-block h-3 w-3 flex-shrink-0 rounded-sm ${band ? BAND_CELL_STYLES[band] : UNKNOWN_STATUS_CELL}`}
                  />
                  <span className={`${inReport ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                    {node.id}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{t.kinds[node.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{node.text ?? ''}</span>
                  {categoryNames(node).map((name) => (
                    <span
                      key={name}
                      className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800 dark:bg-sky-900/40 dark:text-sky-200"
                    >
                      {name}
                    </span>
                  ))}
                  <span className="text-gray-600 dark:text-gray-400">
                    {t.depthOf(depths[node.id])} ／ {statusText(node)}
                  </span>
                  {!neutral && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        inReport
                          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                          : 'border border-dashed border-gray-400 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {inReport ? onLabel : offLabel}
                    </span>
                  )}
                  {reasons?.[node.id] && inReport && (
                    <span className="basis-full pl-6 text-blue-700 dark:text-sky-300">{reasons[node.id]}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 選択中のノード詳細 */}
      {selected && !onToggle && (
        <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200">
          <div className="font-semibold">
            {selected.id}
            {selected.text ? `: ${selected.text}` : ''}
            {!neutral && (
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                （{isInReport(selected) ? onLabel : offLabel}）
              </span>
            )}
          </div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-gray-500 dark:text-gray-400">{t.type}</span>
            <span>{selected.type ?? t.kinds[selected.kind]}</span>
            <span className="text-gray-500 dark:text-gray-400">{t.depth}</span>
            <span>
              {t.depthOf(depths[selected.id])}
              {selected.parentIds && selected.parentIds.length > 0 ? `（← ${selected.parentIds.join(', ')}）` : ''}
            </span>
            <span className="text-gray-500 dark:text-gray-400">{t.status}</span>
            <span>
              {statusText(selected)}
              {selected.rawStatus ? `（${t.documented}: ${selected.rawStatus}）` : ''}
            </span>
            {categoryNames(selected).length > 0 && (
              <>
                <span className="text-gray-500 dark:text-gray-400">{t.categoryAxis}</span>
                <span>{categoryNames(selected).join(language === 'ja' ? '、' : ', ')}</span>
              </>
            )}
            {(selected.severity || selected.rawSeverity) && (
              <>
                <span className="text-gray-500 dark:text-gray-400">{t.severity}</span>
                <span>
                  {selected.severity ? severityLabels[selected.severity] : '-'}
                  {selected.rawSeverity ? `（${t.documented}: ${selected.rawSeverity}）` : ''}
                  {selected.severitySource ? ` — ${t.severitySource}: ${selected.severitySource}` : ''}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}
