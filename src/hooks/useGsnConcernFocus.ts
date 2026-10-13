// src/hooks/useGsnConcernFocus.ts
// GSNノードヒートマップ用フック
// ステークホルダの関心事とGSNノードの対応をLLMで判定し、レポートで詳述するノードを選択・調整する

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stakeholder } from '@/types';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import {
  FocusGsnNode,
  GsnConcernMap,
  concernNames,
  selectFocusGsnNodes,
  stakeholderConcernKey,
} from '@/lib/gsn-concerns';

export function useGsnConcernFocus(
  gsnNodes: GsnHeatmapItem[] | null,
  stakeholder: Stakeholder | null,
  language: 'ja' | 'en'
) {
  // ステークホルダ（関心事）ごとの対応付け結果。GSNノードが再抽出されたら破棄する
  const [cache, setCache] = useState<Record<string, GsnConcernMap>>({});
  const [isMapping, setIsMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIds, setFocusIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [activeConcern, setActiveConcern] = useState<number | null>(null);
  // 応答が返る前にステークホルダやノードが変わった場合に古い結果を捨てるための世代番号
  const requestSeq = useRef(0);

  const concerns = useMemo(() => stakeholder?.concerns ?? [], [stakeholder]);
  const key = stakeholder ? stakeholderConcernKey(stakeholder) : null;
  const mapping = key ? cache[key] ?? null : null;

  useEffect(() => {
    setCache({});
    setError(null);
  }, [gsnNodes]);

  useEffect(() => {
    setActiveConcern(null);
  }, [key]);

  const map = useCallback(async () => {
    if (!gsnNodes || gsnNodes.length === 0 || !stakeholder || !key || stakeholder.concerns.length === 0) return;
    const seq = ++requestSeq.current;
    setIsMapping(true);
    setError(null);
    try {
      const response = await fetch('/api/map-gsn-concerns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: gsnNodes,
          stakeholder: { id: stakeholder.id, role: stakeholder.role, concerns: stakeholder.concerns },
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (seq !== requestSeq.current) return;
      setCache((prev) => ({ ...prev, [key]: data.mappings as GsnConcernMap }));
    } catch (e) {
      if (seq === requestSeq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === requestSeq.current) setIsMapping(false);
    }
  }, [gsnNodes, stakeholder, key, language]);

  // ステークホルダ選択時に未判定なら自動で対応付けする
  useEffect(() => {
    if (key && gsnNodes && gsnNodes.length > 0 && !cache[key]) {
      void map();
    }
    // map の再生成（言語変更等）では再実行しない。キャッシュ有無とキーで判定する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gsnNodes, cache]);

  const applyRule = useCallback(() => {
    if (!gsnNodes || !mapping) {
      setFocusIds(new Set());
      setReasons({});
      return;
    }
    const selected = selectFocusGsnNodes(gsnNodes, mapping, concerns);
    setFocusIds(new Set(selected.keys()));
    setReasons(Object.fromEntries(selected));
  }, [gsnNodes, mapping, concerns]);

  // 対応付け完了時・ステークホルダ変更時にルールで初期選択し直す（手動調整はリセット）
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

  // ノードID → 関係する関心事のインデックス
  const nodeConcerns = useMemo(
    () =>
      Object.fromEntries(Object.entries(mapping ?? {}).map(([id, m]) => [id, m.concernIdxs])) as Record<
        string,
        number[]
      >,
    [mapping]
  );

  // ヒートマップ表示用（inReport = このレポートで詳述する）。ステークホルダ未選択時は付けない
  const heatmapItems = useMemo(
    () =>
      (gsnNodes ?? []).map((node) => ({
        ...node,
        inReport: stakeholder ? focusIds.has(node.id) : undefined,
        concernIdxs: mapping ? mapping[node.id]?.concernIdxs ?? [] : undefined,
      })),
    [gsnNodes, stakeholder, focusIds, mapping]
  );

  // レポート生成に渡すデータ（対応付け済みのときのみ）
  const focusGsnNodes: FocusGsnNode[] | undefined =
    gsnNodes && stakeholder && mapping
      ? gsnNodes
          .filter((n) => focusIds.has(n.id))
          .map((n) => {
            const m = mapping[n.id];
            return {
              id: n.id,
              concerns: m ? concernNames(m, concerns) : [],
              reason: m?.reason || undefined,
            };
          })
      : undefined;

  return {
    concerns,
    mapping,
    nodeConcerns,
    heatmapItems,
    focusIds,
    reasons,
    isMapping,
    error,
    activeConcern,
    setActiveConcern,
    toggle,
    resetToRule: applyRule,
    remap: map,
    // focusGsnNodes: 詳述するノード、heatmapGsnConcerns / gsnNodeConcerns: レポート内ヒートマップの横軸
    generationParams: focusGsnNodes
      ? { focusGsnNodes, heatmapGsnConcerns: concerns, gsnNodeConcerns: nodeConcerns }
      : {},
  };
}
