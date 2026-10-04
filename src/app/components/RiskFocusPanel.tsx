// src/app/components/RiskFocusPanel.tsx
// レポート生成前のリスクヒートマップ表示パネル
// 選択中のステークホルダで記述すべきリスクを強調し、クリックで追加・除外できる
'use client';

import { FiLoader, FiRefreshCw, FiAlertTriangle, FiRotateCcw } from 'react-icons/fi';
import { Stakeholder } from '@/types';
import { RiskHeatmapItem } from '@/lib/risk-heatmap';
import { useI18n } from './I18nProvider';
import { RiskHeatmap } from './RiskHeatmap';

interface RiskFocusPanelProps {
  stakeholder: Stakeholder | null;
  risks: RiskHeatmapItem[] | null;
  heatmapItems: RiskHeatmapItem[];
  focusCount: number;
  reasons: Record<string, string>;
  isExtracting: boolean;
  error: string | null;
  truncated: boolean;
  isStale: boolean;
  onExtract: () => void;
  onToggle: (id: string) => void;
  onResetToRule: () => void;
}

export function RiskFocusPanel({
  stakeholder,
  risks,
  heatmapItems,
  focusCount,
  reasons,
  isExtracting,
  error,
  truncated,
  isStale,
  onExtract,
  onToggle,
  onResetToRule,
}: RiskFocusPanelProps) {
  const { language } = useI18n();
  const en = language === 'en';

  if (!risks && !isExtracting && !error) return null;

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            {en ? 'Risk Heatmap' : 'リスクヒートマップ'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {stakeholder
              ? en
                ? `Risks to cover for ${stakeholder.role} are highlighted (${focusCount}). Click a risk to include/exclude it; the selection is passed to report generation.`
                : `${stakeholder.role} のレポートで記述すべきリスクを強調しています（${focusCount}件）。クリックで追加・除外でき、選択内容はレポート生成に反映されます。`
              : en
                ? 'Select a stakeholder to highlight the risks their report should cover.'
                : 'ステークホルダを選択すると、そのレポートで記述すべきリスクが強調されます。'}
          </p>
        </div>
        <div className="flex gap-2">
          {stakeholder && risks && (
            <button
              type="button"
              onClick={onResetToRule}
              className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
            >
              <FiRotateCcw className="mr-1" />
              {en ? 'Reset to rule' : 'ルールに戻す'}
            </button>
          )}
          <button
            type="button"
            onClick={onExtract}
            disabled={isExtracting}
            className="flex items-center px-3 py-2 bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-700 dark:text-white dark:hover:bg-red-600 rounded-md text-sm transition-colors disabled:opacity-50"
          >
            {isExtracting ? <FiLoader className="mr-1 animate-spin" /> : <FiRefreshCw className="mr-1" />}
            {en ? 'Re-create' : '再作成'}
          </button>
        </div>
      </div>

      {isExtracting && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {en ? 'Extracting risks from the documents…' : '文書からリスクを抽出しています…'}
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {en ? 'Failed to create the risk heatmap: ' : 'リスクヒートマップの作成に失敗しました: '}
          {error}
        </div>
      )}

      {isStale && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
          {en
            ? 'Files have changed since this heatmap was created. Re-create it; until then the selection is not passed to report generation.'
            : 'ヒートマップ作成後にファイルが変更されました。再作成してください（再作成するまで選択内容はレポート生成に反映されません）。'}
        </div>
      )}

      {truncated && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {en
            ? '* Documents were too long and were truncated to 150,000 characters; some risks may be missing.'
            : '※ 文書が長いため150,000文字で打ち切って抽出しました。一部のリスクが漏れている可能性があります。'}
        </p>
      )}

      {risks && (
        <RiskHeatmap
          risks={heatmapItems}
          labels={
            stakeholder
              ? en
                ? { on: 'Cover in this report', off: 'Not covered' }
                : { on: 'このレポートで記述', off: '記述しない' }
              : null
          }
          onToggle={stakeholder ? onToggle : undefined}
          reasons={reasons}
        />
      )}
    </div>
  );
}
