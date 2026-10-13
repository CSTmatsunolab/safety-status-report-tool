// src/lib/gsn-concerns.ts
// GSNノードとステークホルダの関心事（Stakeholder.concerns）の対応付け
// 対応はLLM（/api/map-gsn-concerns）で決め、ここでは検証・初期選択を行う

import { Stakeholder } from '@/types';
import { GsnHeatmapItem } from './gsn-heatmap';

export type ConcernRelevance = 'high' | 'medium';

export interface GsnConcernMapping {
  // stakeholder.concerns のインデックス
  concernIdxs: number[];
  relevance: ConcernRelevance;
  reason: string;
}

// ノードID → 関心事との対応（関係の無いノードは含まない）
export type GsnConcernMap = Record<string, GsnConcernMapping>;

// レポート生成に渡す「詳述するノード」
export interface FocusGsnNode {
  id: string;
  concerns: string[];
  reason?: string;
}

const MAX_REASON_CHARS = 200;

/**
 * 対応付けAPIの応答JSONを検証付きでパースする
 * - 未知のノードID・範囲外の関心事インデックスは捨てる
 * - 不正なJSONは null
 */
export function parseConcernMappings(
  json: string,
  nodeIds: string[],
  concernCount: number
): GsnConcernMap | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const root = Array.isArray(parsed) ? { mappings: parsed } : parsed;
  if (!root || typeof root !== 'object') return null;
  const { mappings } = root as { mappings?: unknown };
  if (!Array.isArray(mappings)) return null;

  const known = new Set(nodeIds);
  const result: GsnConcernMap = {};
  for (const entry of mappings) {
    if (!entry || typeof entry !== 'object') continue;
    const m = entry as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!known.has(id)) continue;

    const idxs = Array.isArray(m.concerns)
      ? Array.from(
          new Set(
            m.concerns
              .map((v) => (typeof v === 'number' ? v : Number(v)))
              .filter((v) => Number.isInteger(v) && v >= 0 && v < concernCount)
          )
        ).sort((a, b) => a - b)
      : [];
    if (idxs.length === 0) continue;

    result[id] = {
      concernIdxs: idxs,
      relevance: m.relevance === 'high' ? 'high' : 'medium',
      reason: typeof m.reason === 'string' ? m.reason.trim().slice(0, MAX_REASON_CHARS) : '',
    };
  }
  return result;
}

/**
 * 関心事の対応から、レポートで詳述するノードを初期選択する
 * - relevance が high のノード
 * - medium のうち、達成状況が「達成」以外（未評価を含む）のノード
 * 戻り値: ノードID → 選定理由（「関心事: リスク管理 — 理由」）
 */
export function selectFocusGsnNodes(
  nodes: GsnHeatmapItem[],
  map: GsnConcernMap,
  concerns: string[]
): Map<string, string> {
  const selected = new Map<string, string>();
  for (const node of nodes) {
    const mapping = map[node.id];
    if (!mapping) continue;
    if (mapping.relevance === 'high' || node.status !== 'achieved') {
      selected.set(node.id, formatConcernReason(mapping, concerns));
    }
  }
  return selected;
}

export function concernNames(mapping: GsnConcernMapping, concerns: string[]): string[] {
  return mapping.concernIdxs.map((i) => concerns[i]).filter((c): c is string => !!c);
}

export function formatConcernReason(mapping: GsnConcernMapping, concerns: string[]): string {
  const names = concernNames(mapping, concerns).join('・');
  return mapping.reason ? `${names} — ${mapping.reason}` : names;
}

/**
 * 対応付け結果のキャッシュキー（カスタムステークホルダの関心事が編集された場合も別キーになる）
 */
export function stakeholderConcernKey(stakeholder: Stakeholder): string {
  return `${stakeholder.id}::${stakeholder.concerns.join('|')}`;
}
