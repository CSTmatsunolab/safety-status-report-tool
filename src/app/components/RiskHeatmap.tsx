// src/app/components/RiskHeatmap.tsx
// リスクヒートマップ（発生確率 × 影響度 の 5×5 マトリクス）の描画コンポーネント
// アップロード文書の全リスクを配置し、このレポートで記載しているリスクを強調する
'use client';

import { isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { FiX } from 'react-icons/fi';
import { useI18n } from './I18nProvider';
import {
  RISK_HEATMAP_LANG,
  RiskBand,
  RiskHeatmapItem,
  RiskLevel,
  markReportMentions,
  parseHeatmapBlock,
  riskScore,
  scoreBand,
} from '@/lib/risk-heatmap';

const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];

const BAND_CELL_STYLES: Record<RiskBand, string> = {
  high: 'bg-red-400 dark:bg-red-700',
  medium: 'bg-orange-300 dark:bg-orange-600',
  low: 'bg-yellow-200 dark:bg-yellow-600',
  minimal: 'bg-green-200 dark:bg-green-700',
};

// このレポートで記載しているリスク / 文書にのみあるリスク のチップ
const CHIP_IN_REPORT =
  'border-2 border-gray-900 bg-white font-bold text-gray-900 shadow hover:bg-blue-50 dark:border-white dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800';
const CHIP_DOC_ONLY =
  'border border-dashed border-gray-500 bg-white/40 font-normal text-gray-600 hover:bg-white/80 dark:border-gray-400 dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-900/60';
const CHIP_ACTIVE = 'border-2 border-blue-600 bg-blue-600 font-bold text-white dark:border-sky-400 dark:bg-sky-400 dark:text-gray-900';

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
    note: '※ High=5 / Medium=3 / Low=1 として配置（文書記載値のみ使用）',
    bands: { high: '高', medium: '中', low: '低', minimal: '極低' },
    inReport: '本レポートで記載',
    docOnly: '文書のみ（本レポート未記載）',
    plotted: 'リスク一覧（クリック・ホバーでヒートマップ上の位置を強調）',
    position: (l: number, i: number, score: number) => `発生確率 ${l} × 影響度 ${i} = ${score}`,
    loading: 'リスクヒートマップを生成中…',
    close: '閉じる',
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
    note: '* High=5 / Medium=3 / Low=1 (documented values only)',
    bands: { high: 'High', medium: 'Medium', low: 'Low', minimal: 'Minimal' },
    inReport: 'Covered in this report',
    docOnly: 'Documents only (not in this report)',
    plotted: 'Risks (click or hover to highlight their position)',
    position: (l: number, i: number, score: number) => `Likelihood ${l} × Impact ${i} = ${score}`,
    loading: 'Generating risk heatmap…',
    close: 'Close',
  },
};

type RatedRisk = RiskHeatmapItem & { likelihood: RiskLevel; impact: RiskLevel };

// inReport が未判定（undefined）の場合は記載ありとして扱う
const isInReport = (risk: RiskHeatmapItem) => risk.inReport !== false;

interface RiskHeatmapProps {
  risks: RiskHeatmapItem[];
  title?: string;
}

export function RiskHeatmap({ risks, title }: RiskHeatmapProps) {
  const { language } = useI18n();
  const t = TEXTS[language];
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
  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredId(id),
    onMouseLeave: () => setHoveredId(null),
    onFocus: () => setHoveredId(id),
    onBlur: () => setHoveredId(null),
  });

  if (risks.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">{t.empty}</p>;
  }

  const axisLabelClass = (isActive: boolean) =>
    `flex items-center justify-center rounded text-xs transition-colors ${
      isActive
        ? 'bg-gray-900 font-bold text-white dark:bg-white dark:text-gray-900'
        : 'text-gray-600 dark:text-gray-400'
    }`;

  return (
    <figure className="not-prose my-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-gray-900 dark:text-white">{title ?? t.title}</span>
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {t.count(inReportCount, risks.length, rated.length)}
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

                    // セルの状態: 強調中 > 本レポート記載あり > 文書のみ > 空
                    let stateClass: string;
                    if (active) {
                      stateClass = isActiveCell
                        ? 'z-10 scale-105 border-gray-900 opacity-100 shadow-lg outline-4 outline-offset-2 outline-blue-600 dark:border-white dark:outline-sky-400'
                        : 'border-transparent opacity-25';
                    } else if (reportRiskCount > 0) {
                      stateClass = 'border-gray-900 opacity-100 shadow-md dark:border-white';
                    } else if (cellRisks.length > 0) {
                      stateClass = 'border-dashed border-gray-500 opacity-60 dark:border-gray-400';
                    } else {
                      stateClass = 'border-transparent opacity-25';
                    }

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
                              title={`${risk.name ? `${risk.id}: ${risk.name}` : risk.id}（${isInReport(risk) ? t.inReport : t.docOnly}）`}
                              onClick={() => toggleSelected(risk.id)}
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
        <span className="flex items-center gap-1">
          <span className={`rounded px-1 text-[10px] ${CHIP_IN_REPORT}`}>R-x</span>
          {t.inReport}
        </span>
        <span className="flex items-center gap-1">
          <span className={`rounded px-1 text-[10px] ${CHIP_DOC_ONLY}`}>R-x</span>
          {t.docOnly}
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.note}</div>

      {/* リスク一覧（ヒートマップ上の位置と連動） */}
      {rated.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">{t.plotted}</div>
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
                    onClick={() => toggleSelected(risk.id)}
                    {...hoverHandlers(risk.id)}
                    className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-sky-900/40'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    } ${inReport ? '' : 'opacity-60'}`}
                  >
                    <span className={`inline-block h-3 w-3 flex-shrink-0 rounded-sm ${BAND_CELL_STYLES[band]}`} />
                    <span className={`${inReport ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                      {risk.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{risk.name ?? ''}</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {t.position(risk.likelihood, risk.impact, score)}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                      {t.bands[band]}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        inReport
                          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                          : 'border border-dashed border-gray-400 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {inReport ? t.inReport : t.docOnly}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 選択中のリスク詳細 */}
      {selected && (
        <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200">
          <div className="font-semibold">
            {selected.id}
            {selected.name ? `: ${selected.name}` : ''}
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              （{isInReport(selected) ? t.inReport : t.docOnly}）
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
                {risk.id}
                {risk.name ? `: ${risk.name}` : ''}
                {`（${isInReport(risk) ? t.inReport : t.docOnly}）`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

interface RiskHeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  risks: RiskHeatmapItem[];
}

export function RiskHeatmapModal({ isOpen, onClose, risks }: RiskHeatmapModalProps) {
  const { language } = useI18n();
  const t = TEXTS[language];

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white dark:bg-gray-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t.title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <FiX size={20} />
          </button>
        </div>
        <RiskHeatmap risks={risks} />
      </div>
    </div>
  );
}

function RiskHeatmapBlock({ json, reportContent }: { json: string; reportContent: string }) {
  const { language } = useI18n();
  const data = parseHeatmapBlock(json);

  if (!data) {
    return (
      <div className="not-prose my-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4 text-sm text-gray-500 dark:text-gray-400">
        {TEXTS[language].loading}
      </div>
    );
  }
  return <RiskHeatmap risks={markReportMentions(data.risks, reportContent)} title={data.title} />;
}

function isHeatmapCode(className?: string): boolean {
  return !!className?.split(/\s+/).includes(`language-${RISK_HEATMAP_LANG}`);
}

function nodeText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(nodeText).join('');
  return '';
}

/**
 * ReactMarkdown 用: ```risk-heatmap ブロックをヒートマップとして描画する
 * reportContent はレポート全文（本レポートで記載しているリスクの判定に使う）
 */
export function createRiskHeatmapMarkdownComponents(reportContent: string): Components {
  return {
    // node は DOM に渡さないよう取り除く
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pre({ children, node, ...props }) {
      // ヒートマップは <pre> で包まずにそのまま描画する
      if (isValidElement(children)) {
        const child = children as ReactElement<{ className?: string; children?: ReactNode }>;
        if (isHeatmapCode(child.props.className)) {
          return <RiskHeatmapBlock json={nodeText(child.props.children)} reportContent={reportContent} />;
        }
      }
      return <pre {...props}>{children}</pre>;
    },
  };
}
