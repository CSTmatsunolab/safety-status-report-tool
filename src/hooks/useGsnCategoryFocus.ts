// src/hooks/useGsnCategoryFocus.ts
// GSNノードヒートマップ用フック
// 選択中のステークホルダの要求（useStakeholderProfile）とノードの一致から求めた関連度（必須/関連/参考）をもとに、
// レポートで詳述するノードを初期選択・調整する

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stakeholder } from '@/types';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import {
  FocusGsnNode,
  StakeholderProfile,
  gsnCategoryLabel,
  selectFocusGsnNodes,
  stakeholderCategoryKey,
} from '@/lib/gsn-categories';

export function useGsnCategoryFocus(
  gsnNodes: GsnHeatmapItem[] | null,
  stakeholder: Stakeholder | null,
  // 読者の要求（useStakeholderProfile で決める）
  stakeholderProfile: StakeholderProfile | null,
  language: 'ja' | 'en'
) {
  const [focusIds, setFocusIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const key = stakeholder ? stakeholderCategoryKey(stakeholder) : null;

  useEffect(() => {
    setActiveCategory(null);
  }, [key]);

  const applyRule = useCallback(() => {
    if (!gsnNodes || !stakeholderProfile) {
      setFocusIds(new Set());
      setReasons({});
      return;
    }
    const selected = selectFocusGsnNodes(gsnNodes, stakeholderProfile, language);
    setFocusIds(new Set(selected.keys()));
    setReasons(Object.fromEntries(selected));
  }, [gsnNodes, stakeholderProfile, language]);

  // 抽出時・ステークホルダ変更時にルールで初期選択し直す（手動調整はリセット）
  useEffect(() => {
    applyRule();
  }, [applyRule]);

  const toggle = useCallback((id: string) => {
    setFocusIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ヒートマップ表示用（inReport = このレポートで詳述する）。ステークホルダ未選択時は付けない
  const heatmapItems = useMemo(
    () =>
      (gsnNodes ?? []).map((node) => ({
        ...node,
        inReport: stakeholderProfile ? focusIds.has(node.id) : undefined,
      })),
    [gsnNodes, stakeholderProfile, focusIds]
  );

  // レポート生成に渡すデータ（要求が決まっているときのみ）
  const focusGsnNodes: FocusGsnNode[] | undefined =
    gsnNodes && stakeholderProfile
      ? gsnNodes
          .filter((n) => focusIds.has(n.id))
          .map((n) => ({
            id: n.id,
            categories: (n.categories ?? [])
              .filter((c) => (stakeholderProfile.categories as string[]).includes(c))
              .map((c) => gsnCategoryLabel(c, language)),
            reason: reasons[n.id],
          }))
      : undefined;

  return {
    stakeholderProfile,
    heatmapItems,
    focusIds,
    reasons,
    activeCategory,
    setActiveCategory,
    toggle,
    resetToRule: applyRule,
    // focusGsnNodes: 詳述するノード、heatmapGsnStakeholderCategories/Layers: レポート内ヒートマップの関連度の算出に使う要求
    generationParams:
      focusGsnNodes && stakeholderProfile
        ? {
            focusGsnNodes,
            heatmapGsnStakeholderCategories: stakeholderProfile.categories,
            heatmapGsnStakeholderLayers: stakeholderProfile.layers,
          }
        : {},
  };
}
