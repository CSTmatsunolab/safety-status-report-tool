// src/app/components/RiskHeatmap.tsx
// リスクヒートマップ（発生確率 × 影響度 の 5×5 マトリクス）の描画コンポーネント
// アップロード文書の全リスクを配置し、このレポートで記載しているリスクを強調する
'use client';

import { useState } from 'react';
import { useI18n } from './I18nProvider';
import {
  REPORT_COVERAGE_LABELS,
  ReportCoverage,
  RiskBand,
  RiskHeatmapItem,
  RiskLevel,
  riskScore,
  scoreBand,
} from '@/lib/risk-heatmap';
import {
  BAND_CELL_STYLES,
  COVERAGE_BADGE_STYLES,
  CHIP_ACTIVE,
  CHIP_DOC_ONLY,
  CHIP_IN_REPORT,
  axisLabelClass,
  cellStateClass,
} from './heatmap-styles';

const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];

const TEXTS = {
  ja: {
    title: 'リスクヒートマップ',
    likelihood: '発生確率',
    impact: '影響度',
    score: 'スコア',
    status: '対策状況',
    documented: '文書記載値',
    unrated: '評価なし（文書に発生確率・影響度の記載なし）',
    empty: 'レポート内に影響度・発生確率のデータがありません。',
    count: (inReport: number, total: number, plotted: number) =>
      `文書のリスク ${total}件（うち本レポートで記載 ${inReport}件）／ ${plotted}件をプロット`,
    countCoverage: (detailed: number, mentioned: number, total: number, plotted: number) =>
      `文書のリスク ${total}件（うち本レポートで詳述 ${detailed}件・言及のみ ${mentioned}件）／ ${plotted}件をプロット`,
    note: '※ High=5 / Medium=3 / Low=1 として配置（文書記載値のみ使用）',
    bands: { high: '高', medium: '中', low: '低', minimal: '極低' },
    inReport: '本レポートで記載',
    docOnly: '文書のみ（本レポート未記載）',
    plotted: 'リスク一覧（クリック・ホバーでヒートマップ上の位置を強調）',
    plottedToggle: 'リスク一覧（クリックで記載する／しないを切り替え、ホバーで位置を強調）',
    countNeutral: (total: number, plotted: number) => `文書のリスク ${total}件 ／ ${plotted}件をプロット`,
    countGeneric: (on: number, total: number, plotted: number, label: string) =>
      `文書のリスク ${total}件（うち${label} ${on}件）／ ${plotted}件をプロット`,
    position: (l: number, i: number, score: number) => `発生確率 ${l} × 影響度 ${i} = ${score}`,
  },
  en: {
    title: 'Risk Heatmap',
    likelihood: 'Likelihood',
    impact: 'Impact',
    score: 'Score',
    status: 'Status',
    documented: 'Documented value',
    unrated: 'Not rated (likelihood/impact not documented)',
    empty: 'No likelihood/impact data was found in this report.',
    count: (inReport: number, total: number, plotted: number) =>
      `${total} documented risks (${inReport} covered in this report) / ${plotted} plotted`,
    countCoverage: (detailed: number, mentioned: number, total: number, plotted: number) =>
      `${total} documented risks (detailed in this report: ${detailed}, mentioned only: ${mentioned}) / ${plotted} plotted`,
    note: '* High=5 / Medium=3 / Low=1 (documented values only)',
    bands: { high: 'High', medium: 'Medium', low: 'Low', minimal: 'Minimal' },
    inReport: 'Covered in this report',
    docOnly: 'Documents only (not in this report)',
    plotted: 'Risks (click or hover to highlight their position)',
    plottedToggle: 'Risks (click to include/exclude, hover to highlight their position)',
    countNeutral: (total: number, plotted: number) => `${total} documented risks / ${plotted} plotted`,
    countGeneric: (on: number, total: number, plotted: number, label: string) =>
      `${total} documented risks (${label}: ${on}) / ${plotted} plotted`,
    position: (l: number, i: number, score: number) => `Likelihood ${l} × Impact ${i} = ${score}`,
  },
};

type RatedRisk = RiskHeatmapItem & { likelihood: RiskLevel; impact: RiskLevel };

// inReport が未判定（undefined）の場合は記載ありとして扱う
const isInReport = (risk: RiskHeatmapItem) => risk.inReport !== false;

interface RiskHeatmapProps {
  risks: RiskHeatmapItem[];
  title?: string;
  // 強調あり／なしの表示名（既定は「本レポートで記載／文書のみ」）。null は強調の区別を表示しない
  labels?: { on: string; off: string } | null;
  // 指定時はクリックで強調（inReport）を切り替える選択モードになる
  onToggle?: (id: string) => void;
  // リスクID → 強調の理由（一覧に表示）
  reasons?: Record<string, string>;
}

export function RiskHeatmap({ risks, title, labels, onToggle, reasons }: RiskHeatmapProps) {
  const { language } = useI18n();
  const t = TEXTS[language];
  const onLabel = labels?.on ?? t.inReport;
  const offLabel = labels?.off ?? t.docOnly;
  const neutral = labels === null;
  // レポート内の表示では、本文での扱いの深さ（詳述／言及のみ／なし）を示す
  const coverageMode = labels === undefined && risks.some((r) => r.coverage !== undefined);
  const coverageOf = (risk: RiskHeatmapItem): ReportCoverage => risk.coverage ?? (isInReport(risk) ? 'mentioned' : 'none');
  const countOf = (coverage: ReportCoverage) => risks.filter((r) => coverageOf(r) === coverage).length;
  const mentionLabel = (risk: RiskHeatmapItem) =>
    coverageMode && coverageOf(risk) !== 'none'
      ? REPORT_COVERAGE_LABELS[language][coverageOf(risk)]
      : isInReport(risk)
        ? onLabel
        : offLabel;
  const statusSuffix = (risk: RiskHeatmapItem) => (neutral ? '' : `（${mentionLabel(risk)}）`);
  // クリックで固定する選択と、ホバー中の一時的な強調
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 本レポートで記載しているリスクを先に、その中はスコアの高い順
  const rated = risks
    .filter((r): r is RatedRisk => r.likelihood !== null && r.impact !== null)
    .sort(
      (a, b) =>
        Number(isInReport(b)) - Number(isInReport(a)) ||
        riskScore(b.likelihood, b.impact) - riskScore(a.likelihood, a.impact)
    );
  const unrated = risks.filter((r) => r.likelihood === null || r.impact === null);
  const inReportCount = risks.filter(isInReport).length;
  const selected = risks.find((r) => r.id === selectedId);

  const activeId = hoveredId ?? selectedId;
  const active = rated.find((r) => r.id === activeId);

  const toggleSelected = (id: string) => setSelectedId(selectedId === id ? null : id);
  const handleClick = (id: string) => (onToggle ? onToggle(id) : toggleSelected(id));
  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredId(id),
    onMouseLeave: () => setHoveredId(null),
    onFocus: () => setHoveredId(id),
    onBlur: () => setHoveredId(null),
  });

  if (risks.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">{t.empty}</p>;
  }

  return (
    <figure className="not-prose my-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-gray-900 dark:text-white">{title ?? t.title}</span>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {neutral
            ? t.countNeutral(risks.length, rated.length)
            : labels
            ? t.countGeneric(inReportCount, risks.length, rated.length, onLabel)
            : coverageMode
            ? t.countCoverage(countOf('detailed'), countOf('mentioned'), risks.length, rated.length)
            : t.count(inReportCount, risks.length, rated.length)}
        </span>
      </figcaption>

      <div className="overflow-x-auto">
        <div className="flex min-w-[28rem] items-stretch gap-2">
          {/* 縦軸ラベル */}
          <div className="flex items-center">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 [writing-mode:vertical-rl] rotate-180">
              {t.impact} →
            </span>
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] gap-1.5">
              {[...LEVELS].reverse().map((impact) => (
                <div key={`row-${impact}`} className="contents">
                  <div className={axisLabelClass(active?.impact === impact)}>{impact}</div>
                  {LEVELS.map((likelihood) => {
                    const score = riskScore(likelihood, impact);
                    const cellRisks = rated.filter(
                      (r) => r.likelihood === likelihood && r.impact === impact
                    );
                    const reportRiskCount = cellRisks.filter(isInReport).length;
                    const isActiveCell =
                      active?.likelihood === likelihood && active?.impact === impact;

                    const stateClass = cellStateClass(!!active, isActiveCell, reportRiskCount, cellRisks.length);

                    return (
                      <div
                        key={`cell-${impact}-${likelihood}`}
                        className={`relative min-h-16 rounded border-2 p-1 transition-all ${BAND_CELL_STYLES[scoreBand(score)]} ${stateClass}`}
                      >
                        <span className="absolute left-1 top-0.5 text-[10px] text-gray-700/70 dark:text-white/60">
                          {score}
                        </span>
                        {reportRiskCount > 0 && (
                          <span className="absolute right-1 top-0.5 rounded-full bg-gray-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900">
                            {reportRiskCount}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1 pt-4">
                          {cellRisks.map((risk) => (
                            <button
                              key={risk.id}
                              type="button"
                              title={`${risk.name ? `${risk.id}: ${risk.name}` : risk.id}${statusSuffix(risk)}`}
                              onClick={() => handleClick(risk.id)}
                              {...hoverHandlers(risk.id)}
                              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                                activeId === risk.id
                                  ? CHIP_ACTIVE
                                  : isInReport(risk)
                                    ? CHIP_IN_REPORT
                                    : CHIP_DOC_ONLY
                              }`}
                            >
                              {risk.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* 横軸目盛 */}
              <div />
              {LEVELS.map((likelihood) => (
                <div key={`x-${likelihood}`} className={axisLabelClass(active?.likelihood === likelihood)}>
                  {likelihood}
                </div>
              ))}
            </div>
            <div className="mt-1 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
              {t.likelihood} →
            </div>
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
        {(['high', 'medium', 'low', 'minimal'] as RiskBand[]).map((band) => (
          <span key={band} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${BAND_CELL_STYLES[band]}`} />
            {t.bands[band]}
          </span>
        ))}
        {!neutral && (
          <>
            <span className="flex items-center gap-1">
              <span className={`rounded px-1 text-[10px] ${CHIP_IN_REPORT}`}>R-x</span>
              {onLabel}
            </span>
            <span className="flex items-center gap-1">
              <span className={`rounded px-1 text-[10px] ${CHIP_DOC_ONLY}`}>R-x</span>
              {offLabel}
            </span>
          </>
        )}
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.note}</div>

      {/* リスク一覧（ヒートマップ上の位置と連動） */}
      {rated.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">{onToggle ? t.plottedToggle : t.plotted}</div>
          <ul className="m-0 list-none p-0 divide-y divide-gray-100 dark:divide-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
            {rated.map((risk) => {
              const score = riskScore(risk.likelihood, risk.impact);
              const band = scoreBand(score);
              const isActive = activeId === risk.id;
              const inReport = isInReport(risk);
              return (
                <li key={risk.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(risk.id)}
                    {...hoverHandlers(risk.id)}
                    className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-sky-900/40'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    } ${inReport ? '' : 'opacity-60'}`}
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
                    <span className={`inline-block h-3 w-3 flex-shrink-0 rounded-sm ${BAND_CELL_STYLES[band]}`} />
                    <span className={`${inReport ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                      {risk.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{risk.name ?? ''}</span>
                    {reasons?.[risk.id] && inReport && (
                      <span className="text-blue-700 dark:text-sky-300">{reasons[risk.id]}</span>
                    )}
                    <span className="text-gray-600 dark:text-gray-400">
                      {t.position(risk.likelihood, risk.impact, score)}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                      {t.bands[band]}
                    </span>
                    {!neutral && (
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          COVERAGE_BADGE_STYLES[coverageMode ? coverageOf(risk) : inReport ? 'detailed' : 'none']
                        }`}
                      >
                        {mentionLabel(risk)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 選択中のリスク詳細 */}
      {selected && !onToggle && (
        <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200">
          <div className="font-semibold">
            {selected.id}
            {selected.name ? `: ${selected.name}` : ''}
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              （{mentionLabel(selected)}）
            </span>
          </div>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-gray-500 dark:text-gray-400">{t.likelihood}</span>
            <span>
              {selected.likelihood ?? '-'}
              {selected.rawLikelihood ? `（${t.documented}: ${selected.rawLikelihood}）` : ''}
            </span>
            <span className="text-gray-500 dark:text-gray-400">{t.impact}</span>
            <span>
              {selected.impact ?? '-'}
              {selected.rawImpact ? `（${t.documented}: ${selected.rawImpact}）` : ''}
            </span>
            {selected.likelihood !== null && selected.impact !== null && (
              <>
                <span className="text-gray-500 dark:text-gray-400">{t.score}</span>
                <span>{riskScore(selected.likelihood, selected.impact)}</span>
              </>
            )}
            {selected.status && (
              <>
                <span className="text-gray-500 dark:text-gray-400">{t.status}</span>
                <span>{selected.status}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 評価なしのリスク */}
      {unrated.length > 0 && (
        <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
          <div className="mb-1 font-medium">{t.unrated}</div>
          <ul className="list-disc pl-5">
            {unrated.map((risk) => (
              <li key={risk.id} className={isInReport(risk) ? 'font-bold' : 'text-gray-500 dark:text-gray-400'}>
                {onToggle ? (
                  <button type="button" onClick={() => onToggle(risk.id)} className="text-left hover:underline">
                    <input
                      type="checkbox"
                      checked={isInReport(risk)}
                      readOnly
                      tabIndex={-1}
                      className="pointer-events-none mr-1 h-3 w-3 align-middle"
                    />
                    {risk.id}
                    {risk.name ? `: ${risk.name}` : ''}
                    {statusSuffix(risk)}
                  </button>
                ) : (
                  <>
                    {risk.id}
                    {risk.name ? `: ${risk.name}` : ''}
                    {statusSuffix(risk)}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
