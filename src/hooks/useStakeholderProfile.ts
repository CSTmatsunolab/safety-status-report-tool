// src/hooks/useStakeholderProfile.ts
// 選択中のステークホルダの要求（必要なカテゴリー＋重視する論証レイヤー）を決めるフック
// - 既定ステークホルダは対応表（STAKEHOLDER_PROFILE_MAP）、カスタムは /api/stakeholder-categories でLLM判定してキャッシュする
// - リスク・GSNノードの両ヒートマップの関連度（必須/関連/参考）の算出に使う

import { useCallback, useMemo, useRef, useState } from 'react';
import { Stakeholder } from '@/types';
import {
  GSN_CATEGORY_IDS,
  GSN_LAYER_IDS,
  StakeholderProfile,
  isPredefinedCategoryStakeholder,
  normalizeCategoryIds,
  normalizeLayerIds,
  profileForStakeholder,
  stakeholderCategoryKey,
} from '@/lib/gsn-categories';

export function useStakeholderProfile(stakeholder: Stakeholder | null, language: 'ja' | 'en') {
  // カスタムステークホルダの判定結果（キー: stakeholderCategoryKey）
  const [customMap, setCustomMap] = useState<Record<string, StakeholderProfile>>({});
  const [isMapping, setIsMapping] = useState(false);
  // 判定に失敗したステークホルダのキーとエラー（別のステークホルダに切り替えたら表示しない）
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // 応答が返る前にステークホルダが変わった場合に古い結果を捨てるための世代番号
  const requestSeq = useRef(0);
  // 判定中のキー（同じステークホルダの重複リクエストを防ぐ）
  const inFlightKey = useRef<string | null>(null);

  const isCustom = !!stakeholder && !isPredefinedCategoryStakeholder(stakeholder);
  const key = stakeholder ? stakeholderCategoryKey(stakeholder) : null;
  const profile = useMemo(
    () => (stakeholder ? profileForStakeholder(stakeholder, customMap) : null),
    [stakeholder, customMap]
  );

  const remap = useCallback(async () => {
    if (!stakeholder || !key || !isCustom) return;
    const seq = ++requestSeq.current;
    inFlightKey.current = key;
    setIsMapping(true);
    setFailure(null);
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
      setFailure({ key, message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (seq === requestSeq.current) {
        setIsMapping(false);
        inFlightKey.current = null;
      }
    }
  }, [stakeholder, key, isCustom, language]);

  /**
   * カスタムステークホルダで未判定なら判定する（ヒートマップのデータが揃ったときに呼ぶ）
   */
  const ensureMapped = useCallback(() => {
    if (isCustom && key && !customMap[key] && inFlightKey.current !== key) void remap();
  }, [isCustom, key, customMap, remap]);

  return {
    profile,
    isCustom,
    isMapping,
    error: failure && failure.key === key ? failure.message : null,
    remap,
    ensureMapped,
  };
}
