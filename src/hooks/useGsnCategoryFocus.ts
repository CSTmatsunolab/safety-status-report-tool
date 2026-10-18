// src/hooks/useGsnCategoryFocus.ts
// GSNノードヒートマップ用フック
// 選択中のステークホルダの要求（必要なカテゴリー＋重視する論証レイヤー）を決め（既定は対応表、カスタムはLLMで判定）、
// 関連度（必須/関連/参考）から、レポートで詳述するノードを初期選択・調整する

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stakeholder } from '@/types';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import {
  FocusGsnNode,
  GSN_CATEGORY_IDS,
  GSN_LAYER_IDS,
  StakeholderProfile,
  gsnCategoryLabel,
  isPredefinedCategoryStakeholder,
  normalizeCategoryIds,
  normalizeLayerIds,
  profileForStakeholder,
  selectFocusGsnNodes,
  stakeholderCategoryKey,
} from '@/lib/gsn-categories';

export function useGsnCategoryFocus(
  gsnNodes: GsnHeatmapItem[] | null,
  stakeholder: Stakeholder | null,
  language: 'ja' | 'en'
) {
  // カスタムステークホルダの判定結果（キー: stakeholderCategoryKey）
  const [customMap, setCustomMap] = useState<Record<string, StakeholderProfile>>({});
  const [isMapping, setIsMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIds, setFocusIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // 応答が返る前にステークホルダが変わった場合に古い結果を捨てるための世代番号
  const requestSeq = useRef(0);

  const isCustom = !!stakeholder && !isPredefinedCategoryStakeholder(stakeholder);
  const key = stakeholder ? stakeholderCategoryKey(stakeholder) : null;
  const stakeholderProfile = useMemo(
    () => (stakeholder ? profileForStakeholder(stakeholder, customMap) : null),
    [stakeholder, customMap]
  );

  useEffect(() => {
    setActiveCategory(null);
    setError(null);
  }, [key]);

  const mapCustom = useCallback(async () => {
    if (!stakeholder || !key || !isCustom) return;
    const seq = ++requestSeq.current;
    setIsMapping(true);
    setError(null);
    try {
      const response = await fetch('/api/stakeholder-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeholder: { role: stakeholder.role, concerns: stakeholder.concerns },
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (seq !== requestSeq.current) return;
      setCustomMap((prev) => ({
        ...prev,
        [key]: { categories: normalizeCategoryIds(data.categoryIds) ?? [], layers: normalizeLayerIds(data.layers) ?? [] },
      }));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      // 判定できなかった場合は全カテゴリー・全レイヤーを必要として扱う
      setCustomMap((prev) => ({ ...prev, [key]: { categories: GSN_CATEGORY_IDS, layers: GSN_LAYER_IDS } }));
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === requestSeq.current) setIsMapping(false);
    }
  }, [stakeholder, key, isCustom, language]);

  // カスタムステークホルダを選択し、GSNノードがあって未判定なら自動で判定する
  useEffect(() => {
    if (isCustom && key && gsnNodes && gsnNodes.length > 0 && !customMap[key]) {
      void mapCustom();
    }
    // mapCustom の再生成（言語変更等）では再実行しない。キャッシュ有無とキーで判定する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom, key, gsnNodes, customMap]);

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
    isCustom,
    heatmapItems,
    focusIds,
    reasons,
    isMapping,
    error,
    activeCategory,
    setActiveCategory,
    toggle,
    resetToRule: applyRule,
    remap: mapCustom,
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
