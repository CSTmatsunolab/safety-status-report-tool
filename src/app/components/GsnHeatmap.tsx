// src/app/components/GsnHeatmap.tsx
// GSNノードヒートマップ（縦軸＝ステークホルダへの関連度 × 横軸＝達成状況）の描画コンポーネント
// - 関連度（必須/関連/参考）は、ステークホルダの要求（必要なカテゴリー＋重視する論証レイヤー）とノードの一致からルールで算出する
//   （src/lib/gsn-categories.ts の gsnRelevance）。ステークホルダを変えるとノードの行が変わる
// - セルの色はセルの位置（関連度×達成状況）で決まる優先度。右上（必須×未展開）ほど赤い
// - profile が無い場合は、縦軸を論証レイヤー（トップ/サブゴール/方針/証拠）にした中立表示にする
// - onToggle を渡すと、クリックで「詳述する／しない」を切り替える選択モードになる
'use client';

import { useState } from 'react';
import { useI18n } from './I18nProvider';
import {
  GSN_SEVERITY_LABELS,
  GSN_STATUS_LABELS,
  GsnHeatmapItem,
  GsnNodeKind,
  GsnStatus,
  gsnPriorityBand,
  gsnStatusBand,
  gsnStatusRank,
} from '@/lib/gsn-heatmap';
import {
  BAND_CELL_STYLES,
  CHIP_ACTIVE,
  CHIP_DOC_ONLY,
  CHIP_IN_REPORT,
  axisLabelClass,
  cellStateClass,
} from './heatmap-styles';
import {
  GSN_CATEGORY_IDS,
  GSN_LAYER_IDS,
  GSN_RELEVANCES,
  GSN_RELEVANCE_LABELS,
  GsnLayer,
  GsnRelevance,
  GsnRelevanceResult,
  StakeholderProfile,
  gsnCategoryLabel,
  gsnLayerLabel,
  gsnNodeLayer,
  gsnRelevance,
} from '@/lib/gsn-categories';

// ノード種別ごとのチップ形状（GSN表記に寄せる: Goal=四角 / Strategy=斜体の角張り / Solution=丸）
const KIND_SHAPES: Record<GsnNodeKind, string> = {
  goal: 'rounded-sm',
  strategy: 'rounded-none italic',
  solution: 'rounded-full',
  other: 'rounded',
};

// 横軸: 記載なし → 達成 → 未展開（右ほど悪い）
const STATUS_COLUMNS: (GsnStatus | null)[] = [null, 'achieved', 'partial', 'unachieved', 'undeveloped'];
const UNKNOWN_STATUS_CELL = 'bg-gray-200 dark:bg-gray-700';
// 「!」マーカーを付ける重大度（高・重大）
const SEVERE = 3;

const TEXTS = {
  ja: {
    title: 'GSNノードヒートマップ',
    relevanceAxis: (who?: string) => (who ? `${who} への関連度` : '関連度'),
    layerAxis: '論証レイヤー',
    statusAxis: '達成状況',
    status: '達成状況',
    severity: '重大度',
    severitySource: '重大度の出典',
    documented: '文書記載値',
    type: '種別',
    relevance: '関連度',
    layer: 'レイヤー',
    categories: 'カテゴリー',
    categoryFilter: 'カテゴリーで絞り込み',
    all: 'すべて',
    unknownStatus: '記載なし',
    aggregated: '・配下から集約',
    empty: 'GSNノードのデータがありません。',
    countNeutral: (total: number) => `GSNノード ${total}件`,
    count: (on: number, total: number, label: string) => `GSNノード ${total}件（うち${label} ${on}件）`,
    priority: '優先度',
    priorityLegend: ['高', '中', '低', '達成'],
    severeMark: '重大度 高以上',
    note: '※ 関連度は、必要とするカテゴリーと重視する論証レイヤーの両方に一致=必須、一方のみ=関連、どちらも不一致=参考（トップを重視する読者にはトップゴールは必須）。色は関連度×達成状況による優先度',
    noteNeutral: '※ ステークホルダを選ぶと、縦軸がそのステークホルダへの関連度（必須/関連/参考）に変わります。色は達成状況',
    inReport: '本レポートで言及',
    notInReport: '本レポート未言及',
    kinds: { goal: 'Goal', strategy: 'Strategy', solution: 'Solution', other: 'その他' },
    plotted: 'ノード一覧（クリック・ホバーでヒートマップ上の位置を強調）',
    plottedToggle: 'ノード一覧（クリックで詳述する／しないを切り替え、ホバーで位置を強調）',
  },
  en: {
    title: 'GSN Node Heatmap',
    relevanceAxis: (who?: string) => (who ? `Relevance to ${who}` : 'Relevance'),
    layerAxis: 'Argument layer',
    statusAxis: 'Status',
    status: 'Status',
    severity: 'Severity',
    severitySource: 'Severity source',
    documented: 'Documented value',
    type: 'Type',
    relevance: 'Relevance',
    layer: 'Layer',
    categories: 'Categories',
    categoryFilter: 'Filter by category',
    all: 'All',
    unknownStatus: 'Not documented',
    aggregated: ' / from child nodes',
    empty: 'No GSN node data.',
    countNeutral: (total: number) => `${total} GSN nodes`,
    count: (on: number, total: number, label: string) => `${total} GSN nodes (${label}: ${on})`,
    priority: 'Priority',
    priorityLegend: ['High', 'Medium', 'Low', 'Achieved'],
    severeMark: 'Severity High or above',
    note: '* Relevance: matches both a needed category and a focused argument layer = Required, only one = Related, neither = Reference (the top goal is Required for readers who focus on it). Color is the priority from relevance x status',
    noteNeutral: '* Select a stakeholder to switch the rows to relevance to that stakeholder (Required/Related/Reference). Color shows status',
    inReport: 'Mentioned in this report',
    notInReport: 'Not mentioned',
    kinds: { goal: 'Goal', strategy: 'Strategy', solution: 'Solution', other: 'Other' },
    plotted: 'Nodes (click or hover to highlight their position)',
    plottedToggle: 'Nodes (click to include/exclude, hover to highlight their position)',
  },
};

const PRIORITY_LEGEND_BANDS = ['high', 'medium', 'low', 'minimal'] as const;

// inReport が未判定（undefined）の場合は言及ありとして扱う
const isInReport = (node: GsnHeatmapItem) => node.inReport !== false;

type RowKey = GsnRelevance | GsnLayer;

interface GsnHeatmapProps {
  nodes: GsnHeatmapItem[];
  title?: string;
  // 強調あり／なしの表示名（既定は「本レポートで言及／未言及」）。null は強調の区別を表示しない
  labels?: { on: string; off: string } | null;
  // 指定時はクリックで強調（inReport）を切り替える選択モードになる
  onToggle?: (id: string) => void;
  // ノードID → 強調の理由（一覧に表示）
  reasons?: Record<string, string>;
  // 読者（ステークホルダ）の要求。指定時は縦軸が関連度になる
  profile?: StakeholderProfile | null;
  // 縦軸の見出しに出す読者名（例: 「CxO / 経営層」）
  profileLabel?: string;
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
  profile,
  profileLabel,
  activeCategory: activeCategoryProp,
  onCategoryChange,
}: GsnHeatmapProps) {
  const { language } = useI18n();
  const t = TEXTS[language];
  const statusLabels = GSN_STATUS_LABELS[language];
  const severityLabels = GSN_SEVERITY_LABELS[language];
  const relevanceLabels = GSN_RELEVANCE_LABELS[language];
  const onLabel = labels?.on ?? t.inReport;
  const offLabel = labels?.off ?? t.notInReport;
  const neutral = labels === null;
  // クリックで固定する選択と、ホバー中の一時的な強調
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [localCategory, setLocalCategory] = useState<string | null>(null);
  const activeCategory = onCategoryChange ? activeCategoryProp ?? null : localCategory;
  const setActiveCategory = onCategoryChange ?? setLocalCategory;

  // 各ノードの関連度（profile があるとき）と行
  const relevances = new Map<string, GsnRelevanceResult>();
  if (profile) {
    for (const node of nodes) relevances.set(node.id, gsnRelevance(node, profile, language));
  }
  const rowOf = (node: GsnHeatmapItem): RowKey =>
    profile ? relevances.get(node.id)!.relevance : gsnNodeLayer(node);
  const rows: RowKey[] = profile ? GSN_RELEVANCES : GSN_LAYER_IDS;
  const rowLabel = (row: RowKey) =>
    profile ? relevanceLabels[row as GsnRelevance] : gsnLayerLabel(row as GsnLayer, language);
  const cellBand = (row: RowKey, status: GsnStatus | null) =>
    profile ? gsnPriorityBand(row as GsnRelevance, status) : gsnStatusBand(status);
  const rowRank = (node: GsnHeatmapItem) => rows.indexOf(rowOf(node));

  // 詳述する（言及あり）を先に、行の順（関連度の高い順）、その中は未達成度の高い順
  const sorted = [...nodes].sort(
    (a, b) =>
      Number(isInReport(b)) - Number(isInReport(a)) ||
      rowRank(a) - rowRank(b) ||
      gsnStatusRank(b.status) - gsnStatusRank(a.status)
  );
  const inReportCount = nodes.filter(isInReport).length;
  const selected = nodes.find((n) => n.id === selectedId);

  const activeId = hoveredId ?? selectedId;
  const active = nodes.find((n) => n.id === activeId);

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
    activeCategory !== null && !(node.categories ?? []).includes(activeCategory);
  const statusSuffix = (node: GsnHeatmapItem) =>
    neutral ? '' : `（${isInReport(node) ? onLabel : offLabel}）`;
  const chipClass = (node: GsnHeatmapItem) =>
    activeId === node.id ? CHIP_ACTIVE : neutral || isInReport(node) ? CHIP_IN_REPORT : CHIP_DOC_ONLY;
  const statusText = (node: GsnHeatmapItem) =>
    node.status ? `${statusLabels[node.status]}${node.statusAggregated ? t.aggregated : ''}` : t.unknownStatus;
  const categoryNames = (node: GsnHeatmapItem) =>
    (node.categories ?? []).map((c) => gsnCategoryLabel(c, language));
  const isSevere = (node: GsnHeatmapItem) => (node.severity ?? 0) >= SEVERE;
  const wantedCategories = new Set<string>(profile?.categories ?? []);
  const positionText = (node: GsnHeatmapItem) => {
    const r = relevances.get(node.id);
    return r ? `${relevanceLabels[r.relevance]}（${r.reason}）` : gsnLayerLabel(gsnNodeLayer(node), language);
  };

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

      {/* カテゴリーでの絞り込み（読者が必要とするカテゴリーは強調） */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-500 dark:text-gray-400">{t.categoryFilter}:</span>
        {[null, ...GSN_CATEGORY_IDS].map((cat) => {
          const isActive = activeCategory === cat;
          const isWanted = cat !== null && wantedCategories.has(cat);
          return (
            <button
              key={cat ?? 'all'}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveCategory(cat === null || isActive ? null : cat)}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : isWanted
                    ? 'bg-blue-600 font-semibold text-white hover:bg-blue-700 dark:bg-sky-400 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {cat === null ? t.all : gsnCategoryLabel(cat, language)}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-stretch gap-2" style={{ minWidth: `${6 + STATUS_COLUMNS.length * 7}rem` }}>
          {/* 縦軸ラベル */}
          <div className="flex items-center">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 [writing-mode:vertical-rl] rotate-180">
              {profile ? t.relevanceAxis(profileLabel) : t.layerAxis} →
            </span>
          </div>

          <div className="flex-1">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `5rem repeat(${STATUS_COLUMNS.length}, minmax(6rem, 1fr))` }}
            >
              {/* 横軸見出し（達成状況） */}
              <div />
              {STATUS_COLUMNS.map((status) => (
                <div
                  key={`x-${status ?? 'unknown'}`}
                  className={`${axisLabelClass(!!active && active.status === status)} min-h-8 px-1 text-center leading-tight`}
                >
                  {status ? statusLabels[status] : t.unknownStatus}
                </div>
              ))}

              {rows.map((row) => (
                <div key={`row-${row}`} className="contents">
                  <div className={axisLabelClass(!!active && rowOf(active) === row)}>{rowLabel(row)}</div>
                  {STATUS_COLUMNS.map((status) => {
                    const cellNodes = nodes.filter((n) => rowOf(n) === row && n.status === status);
                    const visibleCount = cellNodes.filter((n) => !isFilteredOut(n)).length;
                    const reportNodeCount = neutral
                      ? visibleCount
                      : cellNodes.filter((n) => isInReport(n) && !isFilteredOut(n)).length;
                    const isActiveCell = !!active && cellNodes.some((n) => n.id === active.id);
                    const band = cellBand(row, status);
                    const background = band ? BAND_CELL_STYLES[band] : UNKNOWN_STATUS_CELL;
                    const stateClass = cellStateClass(!!active, isActiveCell, reportNodeCount, visibleCount);

                    return (
                      <div
                        key={`cell-${row}-${status ?? 'unknown'}`}
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
                              title={`${node.text ? `${node.id}: ${node.text}` : node.id}（${statusText(node)}／${positionText(node)}）${statusSuffix(node)}`}
                              onClick={() => handleClick(node.id)}
                              {...hoverHandlers(node.id)}
                              className={`px-1.5 py-0.5 text-xs transition-all ${KIND_SHAPES[node.kind]} ${chipClass(node)} ${
                                isFilteredOut(node) ? 'opacity-25' : ''
                              }`}
                            >
                              {node.id}
                              {isSevere(node) && <span className="ml-0.5 text-red-600 dark:text-red-400">!</span>}
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
              {t.statusAxis} →
            </div>
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
        <span className="text-gray-500 dark:text-gray-400">{profile ? t.priority : t.status}:</span>
        {profile
          ? PRIORITY_LEGEND_BANDS.map((band, i) => (
              <span key={band} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-3 rounded-sm ${BAND_CELL_STYLES[band]}`} />
                {t.priorityLegend[i]}
              </span>
            ))
          : (['undeveloped', 'unachieved', 'partial', 'achieved'] as GsnStatus[]).map((status) => (
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
        <span className="flex items-center gap-1">
          <span className="font-bold text-red-600 dark:text-red-400">!</span>
          {t.severeMark}
        </span>
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
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{profile ? t.note : t.noteNeutral}</div>

      {/* ノード一覧（ヒートマップ上の位置と連動） */}
      <div className="mt-4">
        <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          {onToggle ? t.plottedToggle : t.plotted}
        </div>
        <ul className="m-0 list-none p-0 divide-y divide-gray-100 dark:divide-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
          {sorted.map((node) => {
            const band = cellBand(rowOf(node), node.status);
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
                    {isSevere(node) && <span className="ml-0.5 text-red-600 dark:text-red-400">!</span>}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{t.kinds[node.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{node.text ?? ''}</span>
                  {(node.categories ?? []).map((c) => (
                    <span
                      key={c}
                      className={`rounded px-1.5 py-0.5 ${
                        wantedCategories.has(c)
                          ? 'bg-blue-600 text-white dark:bg-sky-400 dark:text-gray-900'
                          : 'bg-blue-50 text-blue-800 dark:bg-sky-900/40 dark:text-sky-200'
                      }`}
                    >
                      {gsnCategoryLabel(c, language)}
                    </span>
                  ))}
                  <span className="text-gray-600 dark:text-gray-400">
                    {profile ? relevanceLabels[relevances.get(node.id)!.relevance] : gsnLayerLabel(gsnNodeLayer(node), language)} ／{' '}
                    {statusText(node)}
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
            <span className="text-gray-500 dark:text-gray-400">{t.layer}</span>
            <span>
              {gsnLayerLabel(gsnNodeLayer(selected), language)}
              {selected.parentIds && selected.parentIds.length > 0 ? `（← ${selected.parentIds.join(', ')}）` : ''}
            </span>
            {profile && (
              <>
                <span className="text-gray-500 dark:text-gray-400">{t.relevance}</span>
                <span>{positionText(selected)}</span>
              </>
            )}
            <span className="text-gray-500 dark:text-gray-400">{t.status}</span>
            <span>
              {statusText(selected)}
              {selected.rawStatus ? `（${t.documented}: ${selected.rawStatus}）` : ''}
            </span>
            {categoryNames(selected).length > 0 && (
              <>
                <span className="text-gray-500 dark:text-gray-400">{t.categories}</span>
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
