// src/app/components/heatmap-styles.ts
// リスク／GSNノードヒートマップで共有するスタイル定義

import type { RiskBand } from '@/lib/risk-heatmap';

export const BAND_CELL_STYLES: Record<RiskBand, string> = {
  high: 'bg-red-400 dark:bg-red-700',
  medium: 'bg-orange-300 dark:bg-orange-600',
  low: 'bg-yellow-200 dark:bg-yellow-600',
  minimal: 'bg-green-200 dark:bg-green-700',
};

// このレポートで記載しているリスク / 文書にのみあるリスク のチップ
export const CHIP_IN_REPORT =
  'border-2 border-gray-900 bg-white font-bold text-gray-900 shadow hover:bg-blue-50 dark:border-white dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800';
export const CHIP_DOC_ONLY =
  'border border-dashed border-gray-500 bg-white/40 font-normal text-gray-600 hover:bg-white/80 dark:border-gray-400 dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-900/60';
// 一覧の「本レポートでの記載」バッジ（詳述＝塗り、言及のみ＝枠線、なし＝点線）
export const COVERAGE_BADGE_STYLES = {
  detailed: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
  mentioned: 'border border-gray-900 text-gray-900 dark:border-white dark:text-gray-100',
  none: 'border border-dashed border-gray-400 text-gray-500 dark:text-gray-400',
} as const;
export const CHIP_ACTIVE = 'border-2 border-blue-600 bg-blue-600 font-bold text-white dark:border-sky-400 dark:bg-sky-400 dark:text-gray-900';

export const axisLabelClass = (isActive: boolean) =>
  `flex items-center justify-center rounded text-xs transition-colors ${
    isActive
      ? 'bg-gray-900 font-bold text-white dark:bg-white dark:text-gray-900'
      : 'text-gray-600 dark:text-gray-400'
  }`;

// セルの状態クラス: 強調中 > 本レポート記載あり > 文書のみ > 空
export function cellStateClass(hasActive: boolean, isActiveCell: boolean, reportCount: number, count: number): string {
  if (hasActive) {
    return isActiveCell
      ? 'z-10 scale-105 border-gray-900 opacity-100 shadow-lg outline-4 outline-offset-2 outline-blue-600 dark:border-white dark:outline-sky-400'
      : 'border-transparent opacity-25';
  }
  if (reportCount > 0) return 'border-gray-900 opacity-100 shadow-md dark:border-white';
  if (count > 0) return 'border-dashed border-gray-500 opacity-60 dark:border-gray-400';
  return 'border-transparent opacity-25';
}
