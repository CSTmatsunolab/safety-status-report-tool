// src/app/components/RiskFocusPanel.tsx
// レポート生成前のヒートマップ表示パネル（リスク／GSNノードを切り替え）
// リスク: 選択中のステークホルダで記述すべきリスクを強調し、クリックで追加・除外できる
// GSNノード: GSNの深さ×必要情報カテゴリーに配置し（色＝達成状況）、ステークホルダが必要とするカテゴリーの列とノードを強調・選択できる
'use client';

import { useEffect, useState } from 'react';
import { FiLoader, FiRefreshCw, FiAlertTriangle, FiRotateCcw, FiTarget } from 'react-icons/fi';
import { Stakeholder } from '@/types';
import { RiskHeatmapItem } from '@/lib/risk-heatmap';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import { useI18n } from './I18nProvider';
import { RiskHeatmap } from './RiskHeatmap';
import { GsnHeatmap } from './GsnHeatmap';
import { HeatmapKind, HeatmapSwitcher, defaultHeatmapKind } from './HeatmapSwitcher';
import type { useGsnCategoryFocus } from '@/hooks/useGsnCategoryFocus';
import type { useStakeholderProfile } from '@/hooks/useStakeholderProfile';
import { gsnCategoryLabel, gsnLayerLabel } from '@/lib/gsn-categories';
import { hasRiskCategories, riskWantedCategories } from '@/lib/risk-relevance';

interface RiskFocusPanelProps {
  stakeholder: Stakeholder | null;
  risks: RiskHeatmapItem[] | null;
  gsnNodes: GsnHeatmapItem[] | null;
  gsnError: string | null;
  // GSNファイルが指定されているか（GSNタブの案内表示に使う）
  hasGSNFile: boolean;
  // GSNノードの必要情報カテゴリーによる強調・選択
  gsnFocus: ReturnType<typeof useGsnCategoryFocus>;
  // 読者の要求（関連度の算出に使う。カスタムステークホルダの再判定もここから行う）
  stakeholderProfile: ReturnType<typeof useStakeholderProfile>;
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
  gsnNodes,
  gsnError,
  hasGSNFile,
  gsnFocus,
  stakeholderProfile,
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
  const riskCount = risks ? risks.length : null;
  // GSNタブは抽出済みなら（0件でも）選べるようにし、未抽出なら無効化する
  const gsnCount = gsnNodes ? gsnNodes.length : null;
  const [kind, setKind] = useState<HeatmapKind>('risk');

  const profile = stakeholderProfile.profile;
  // リスクの関連度は、読者の要求があり、リスクにカテゴリーが付いている（新しい抽出結果の）ときのみ出す
  const riskProfile = stakeholder && profile && risks && hasRiskCategories(risks) ? profile : null;
  const riskWanted = riskProfile
    ? riskWantedCategories(riskProfile).map((c) => gsnCategoryLabel(c, language)).join(en ? ', ' : '、') || '-'
    : '';

  // 抽出結果が変わったらデータがある方を表示する
  useEffect(() => {
    setKind(defaultHeatmapKind(riskCount, gsnCount));
  }, [riskCount, gsnCount]);

  if (!risks && !isExtracting && !error) return null;

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-lg p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {en ? 'Heatmap' : 'ヒートマップ'}
            </h2>
            {risks && (
              <HeatmapSwitcher value={kind} onChange={setKind} riskCount={riskCount} gsnCount={gsnCount} />
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {kind === 'gsn'
              ? stakeholder && gsnFocus.stakeholderProfile
                ? en
                  ? `GSN nodes are placed by relevance to ${stakeholder.role} (vertical) and status (horizontal). Relevance comes from the categories they need (${gsnFocus.stakeholderProfile.categories.map((c) => gsnCategoryLabel(c, language)).join(', ') || '-'}) and the argument layers they focus on (${gsnFocus.stakeholderProfile.layers.map((l) => gsnLayerLabel(l, language)).join(', ') || '-'}); ${gsnFocus.focusIds.size} nodes are selected to detail. Click a node to include/exclude it; the selection is passed to report generation.`
                  : `GSNノードを ${stakeholder.role} への関連度（縦軸）×達成状況（横軸）に配置しています。関連度は、必要とするカテゴリー（${gsnFocus.stakeholderProfile.categories.map((c) => gsnCategoryLabel(c, language)).join('、') || '-'}）と重視する論証レイヤー（${gsnFocus.stakeholderProfile.layers.map((l) => gsnLayerLabel(l, language)).join('、') || '-'}）から算出しています（詳述 ${gsnFocus.focusIds.size}件）。クリックで追加・除外でき、選択内容はレポート生成に反映されます。`
                : en
                  ? 'GSN nodes are placed by argument layer (vertical) and status (horizontal). Select a stakeholder to switch the rows to relevance to that stakeholder.'
                  : 'GSNノードを論証レイヤー（縦軸）×達成状況（横軸）に配置しています。ステークホルダを選択すると、縦軸がそのステークホルダへの関連度（必須/関連/参考）に変わります。'
              : stakeholder && riskProfile
              ? en
                ? `Risks are placed by impact x likelihood (same for every reader), and the chip outline shows relevance to ${stakeholder.role} (Required/Related/Reference, from the categories they need: ${riskWanted}). Risks to cover are highlighted (${focusCount}). Click a risk to include/exclude it; the selection is passed to report generation.`
                : `リスクを影響度×発生確率（読者によらず共通）に配置し、チップの枠で ${stakeholder.role} への関連度（必須/関連/参考。必要とするカテゴリー: ${riskWanted}）を示しています。記述すべきリスクを強調しています（${focusCount}件）。クリックで追加・除外でき、選択内容はレポート生成に反映されます。`
              : stakeholder
              ? en
                ? `Risks to cover for ${stakeholder.role} are highlighted (${focusCount}). Click a risk to include/exclude it; the selection is passed to report generation.`
                : `${stakeholder.role} のレポートで記述すべきリスクを強調しています（${focusCount}件）。クリックで追加・除外でき、選択内容はレポート生成に反映されます。`
              : en
                ? 'Select a stakeholder to highlight the risks their report should cover.'
                : 'ステークホルダを選択すると、そのレポートで記述すべきリスクが強調されます。'}
          </p>
        </div>
        <div className="flex gap-2">
          {stakeholder && stakeholderProfile.isCustom && risks && (
            <button
              type="button"
              onClick={() => void stakeholderProfile.remap()}
              disabled={stakeholderProfile.isMapping}
              className="flex items-center px-3 py-2 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-700 dark:text-white dark:hover:bg-blue-600 rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {stakeholderProfile.isMapping ? <FiLoader className="mr-1 animate-spin" /> : <FiTarget className="mr-1" />}
              {en ? 'Re-assess needs' : '必要情報を再判定'}
            </button>
          )}
          {kind === 'risk' && stakeholder && risks && (
            <button
              type="button"
              onClick={onResetToRule}
              className="flex items-center px-3 py-2 bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 rounded-md text-sm transition-colors"
            >
              <FiRotateCcw className="mr-1" />
              {en ? 'Reset to rule' : 'ルールに戻す'}
            </button>
          )}
          {kind === 'gsn' && stakeholder && gsnNodes && gsnNodes.length > 0 && gsnFocus.stakeholderProfile && (
            <button
              type="button"
              onClick={gsnFocus.resetToRule}
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

      {risks && !isExtracting && gsnNodes === null && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {gsnError
            ? en
              ? `* GSN node heatmap is unavailable: ${gsnError}`
              : `※ GSNノードヒートマップを作成できませんでした: ${gsnError}`
            : hasGSNFile
              ? en
                ? '* A GSN file was designated after this heatmap was created. Re-create it to show the GSN node heatmap.'
                : '※ ヒートマップ作成後にGSNファイルが指定されました。再作成するとGSNノードヒートマップが表示されます。'
              : en
                ? '* To show the GSN node heatmap, check "GSN File" on a file and re-create.'
                : '※ GSNノードヒートマップは、ファイル一覧で「GSNファイル」にチェックを付けて再作成すると表示されます。'}
        </p>
      )}

      {truncated && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {en
            ? '* Documents were too long and were truncated to 150,000 characters; some risks may be missing.'
            : '※ 文書が長いため150,000文字で打ち切って抽出しました。一部のリスクが漏れている可能性があります。'}
        </p>
      )}

      {risks && stakeholder && stakeholderProfile.isMapping && (
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          {en
            ? `Assigning the information categories ${stakeholder.role} needs from their concerns…`
            : `${stakeholder.role} の関心事から必要な情報カテゴリーを判定しています…`}
        </p>
      )}
      {risks && stakeholder && stakeholderProfile.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {en ? 'Failed to assess the stakeholder needs (all categories and layers are treated as needed): ' : '必要情報の判定に失敗しました（全カテゴリー・全レイヤーを必要として扱います）: '}
          {stakeholderProfile.error}
        </div>
      )}

      {risks && kind === 'gsn' && (
        <>
          {gsnError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              {en ? 'Failed to extract GSN nodes: ' : 'GSNノードの抽出に失敗しました: '}
              {gsnError}
            </div>
          )}
          {gsnNodes &&
            (stakeholder && gsnFocus.stakeholderProfile ? (
              <GsnHeatmap
                nodes={gsnFocus.heatmapItems}
                labels={en ? { on: 'Detail in this report', off: 'Not detailed' } : { on: 'このレポートで詳述', off: '詳述しない' }}
                onToggle={gsnFocus.toggle}
                reasons={gsnFocus.reasons}
                profile={gsnFocus.stakeholderProfile}
                profileLabel={stakeholder.role}
                activeCategory={gsnFocus.activeCategory}
                onCategoryChange={gsnFocus.setActiveCategory}
              />
            ) : (
              <GsnHeatmap
                nodes={gsnNodes}
                labels={null}
                activeCategory={gsnFocus.activeCategory}
                onCategoryChange={gsnFocus.setActiveCategory}
              />
            ))}
        </>
      )}

      {risks && kind === 'risk' && (
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
          profile={riskProfile}
          profileLabel={stakeholder?.role}
        />
      )}
    </div>
  );
}
