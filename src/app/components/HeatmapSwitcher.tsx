// src/app/components/HeatmapSwitcher.tsx
// リスクヒートマップ／GSNノードヒートマップの切り替え（セグメントコントロール）
'use client';

import { useI18n } from './I18nProvider';

export type HeatmapKind = 'risk' | 'gsn';

interface HeatmapSwitcherProps {
  value: HeatmapKind;
  onChange: (kind: HeatmapKind) => void;
  // 件数（null は未抽出・データなし → タブを無効化）
  riskCount: number | null;
  gsnCount: number | null;
}

/**
 * データがある方を初期表示にする（両方あればリスク）
 */
export function defaultHeatmapKind(riskCount: number | null, gsnCount: number | null): HeatmapKind {
  return !riskCount && gsnCount ? 'gsn' : 'risk';
}

export function HeatmapSwitcher({ value, onChange, riskCount, gsnCount }: HeatmapSwitcherProps) {
  const { language } = useI18n();
  const en = language === 'en';
  const tabs: { kind: HeatmapKind; label: string; count: number | null }[] = [
    { kind: 'risk', label: en ? 'Risks' : 'リスク', count: riskCount },
    { kind: 'gsn', label: en ? 'GSN nodes' : 'GSNノード', count: gsnCount },
  ];

  return (
    <div
      role="tablist"
      aria-label={en ? 'Heatmap type' : 'ヒートマップの種類'}
      className="inline-flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg"
    >
      {tabs.map(({ kind, label, count }) => {
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={count === null}
            onClick={() => onChange(kind)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {label}
            {count !== null && <span className="text-xs opacity-70">({count})</span>}
          </button>
        );
      })}
    </div>
  );
}
