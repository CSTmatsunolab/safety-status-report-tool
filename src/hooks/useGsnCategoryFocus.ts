// src/hooks/useGsnCategoryFocus.ts
// GSNノードヒートマップ用フック
// 横軸は固定の必要情報カテゴリー。選択中のステークホルダが必要とするカテゴリーを決め（既定は対応表、
// カスタムはLLMで判定）、そのカテゴリーに入るノードを強調・レポートで詳述するノードとして選択・調整する

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stakeholder } from '@/types';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import {
  FocusGsnNode,
  GSN_CATEGORY_IDS,
  GsnCategoryId,
  categoriesForStakeholder,
  gsnCategoryLabel,
  isPredefinedCategoryStakeholder,
  selectFocusGsnNodes,
  stakeholderCategoryKey,
} from '@/lib/gsn-categories';

export function useGsnCategoryFocus(
  gsnNodes: GsnHeatmapItem[] | null,
  stakeholder: Stakeholder | null,
  language: 'ja' | 'en'
) {
  // カスタムステークホルダの判定結果（キー: stakeholderCategoryKey）
  const [customMap, setCustomMap] = useState<Record<string, GsnCategoryId[]>>({});
  const [isMapping, setIsMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIds, setFocusIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // 応答が返る前にステークホルダが変わった場合に古い結果を捨てるための世代番号
  const requestSeq = useRef(0);

  const isCustom = !!stakeholder && !isPredefinedCategoryStakeholder(stakeholder);
  const key = stakeholder ? stakeholderCategoryKey(stakeholder) : null;
  const stakeholderCategories = useMemo(
    () => (stakeholder ? categoriesForStakeholder(stakeholder, customMap) : null),
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
      setCustomMap((prev) => ({ ...prev, [key]: data.categoryIds as GsnCategoryId[] }));
    } catch (e) {
      if (seq !== requestSeq.current) return;
      // 判定できなかった場合は全カテゴリーを必要として扱う
      setCustomMap((prev) => ({ ...prev, [key]: GSN_CATEGORY_IDS }));
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
    if (!gsnNodes || !stakeholderCategories) {
      setFocusIds(new Set());
      setReasons({});
      return;
    }
    const selected = selectFocusGsnNodes(gsnNodes, stakeholderCategories, language);
    setFocusIds(new Set(selected.keys()));
    setReasons(Object.fromEntries(selected));
  }, [gsnNodes, stakeholderCategories, language]);

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
        inReport: stakeholderCategories ? focusIds.has(node.id) : undefined,
      })),
    [gsnNodes, stakeholderCategories, focusIds]
  );

  // レポート生成に渡すデータ（必要カテゴリーが決まっているときのみ）
  const focusGsnNodes: FocusGsnNode[] | undefined =
    gsnNodes && stakeholderCategories
      ? gsnNodes
          .filter((n) => focusIds.has(n.id))
          .map((n) => ({
            id: n.id,
            categories: (n.categories ?? [])
              .filter((c) => stakeholderCategories.includes(c as GsnCategoryId))
              .map((c) => gsnCategoryLabel(c, language)),
            reason: reasons[n.id],
          }))
      : undefined;

  return {
    stakeholderCategories,
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
    // focusGsnNodes: 詳述するノード、heatmapGsnStakeholderCategories: レポート内ヒートマップで強調する列
    generationParams:
      focusGsnNodes && stakeholderCategories
        ? { focusGsnNodes, heatmapGsnStakeholderCategories: stakeholderCategories }
        : {},
  };
}
