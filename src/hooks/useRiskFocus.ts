// src/hooks/useRiskFocus.ts
// レポート生成前のヒートマップ用フック
// アップロード文書からリスクを抽出し、ステークホルダごとに「記述すべきリスク」を選択・調整する
// GSNファイルが指定されていればGSNノード（重大度×達成状況、表示のみ）も同時に抽出する

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stakeholder, UploadedFile } from '@/types';
import { RiskHeatmapItem } from '@/lib/risk-heatmap';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import { selectFocusRisks } from '@/lib/stakeholder-risk-rules';

const filesKeyOf = (files: UploadedFile[]) => files.map((f) => f.id).join('|');

export function useRiskFocus(
  files: UploadedFile[],
  stakeholder: Stakeholder | null,
  language: 'ja' | 'en'
) {
  const [risks, setRisks] = useState<RiskHeatmapItem[] | null>(null);
  // null = 未抽出（GSNファイル未指定を含む）
  const [gsnNodes, setGsnNodes] = useState<GsnHeatmapItem[] | null>(null);
  const [gsnError, setGsnError] = useState<string | null>(null);
  const [extractedFilesKey, setExtractedFilesKey] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [focusIds, setFocusIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});

  // 抽出後にファイルが追加・削除された場合は結果が古い
  const isStale = risks !== null && extractedFilesKey !== filesKeyOf(files);

  const applyRule = useCallback(() => {
    if (!risks || !stakeholder) {
      setFocusIds(new Set());
      setReasons({});
      return;
    }
    const selected = selectFocusRisks(risks, stakeholder, language);
    setFocusIds(new Set(selected.keys()));
    setReasons(Object.fromEntries(selected));
  }, [risks, stakeholder, language]);

  // リスク抽出時・ステークホルダ変更時にルールで初期選択し直す（手動調整はリセット）
  useEffect(() => {
    applyRule();
  }, [applyRule]);

  const extract = useCallback(async () => {
    if (files.length === 0) return;
    setIsExtracting(true);
    setError(null);
    setGsnError(null);
    try {
      const response = await fetch('/api/extract-risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setRisks(data.risks as RiskHeatmapItem[]);
      setGsnNodes((data.gsnNodes as GsnHeatmapItem[] | null) ?? null);
      setGsnError(data.gsnError ?? null);
      setTruncated(!!data.truncated);
      setExtractedFilesKey(filesKeyOf(files));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsExtracting(false);
    }
  }, [files, language]);

  const toggle = useCallback((id: string) => {
    setFocusIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ヒートマップ表示用（inReport = このステークホルダのレポートで記述する）
  // ステークホルダ未選択時は inReport を付けない（全件を通常表示）
  const heatmapItems = useMemo(
    () =>
      (risks ?? []).map((risk) => ({
        ...risk,
        inReport: stakeholder ? focusIds.has(risk.id) : undefined,
      })),
    [risks, stakeholder, focusIds]
  );

  // レポート生成に渡すデータ（抽出結果が最新で、ステークホルダ選択済みのときのみ）
  // GSNノードはヒートマップの元データとしてのみ渡す（選択はしない）
  const generationParams =
    risks && stakeholder && !isStale
      ? {
          heatmapRisks: risks,
          focusRiskIds: risks.filter((r) => focusIds.has(r.id)).map((r) => r.id),
          ...(gsnNodes && gsnNodes.length > 0 ? { heatmapGsnNodes: gsnNodes } : {}),
        }
      : {};

  return {
    risks,
    gsnNodes,
    gsnError,
    heatmapItems,
    focusIds,
    reasons,
    isExtracting,
    error,
    truncated,
    isStale,
    extract,
    toggle,
    resetToRule: applyRule,
    generationParams,
  };
}
