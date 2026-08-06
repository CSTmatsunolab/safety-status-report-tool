// src/lib/gsn/analyze.ts
// アップロードされたファイルをGSNとして解析し、UI表示用の構造にまとめる。
//
// パース自体は Lambda と同じ parser.ts / mandatory-core.ts を使うため、
// ここで表示される構造は Lambda がレポート生成時に見る構造と一致する。

import { UploadedFile } from '@/types';
import { GSNNode, GSNNodeStatus, GSNNodeType, MandatorySafetyCore, ParsedGSN } from './types';
import { parseGSN } from './parser';
import { extractMandatorySafetyCore } from './mandatory-core';

// 表示用のツリーノード
export interface GSNTreeNode {
  node: GSNNode;
  children: GSNTreeNode[];
  /** 親子関係の循環参照により展開を打ち切った場合 true */
  truncated: boolean;
}

export interface GSNAnalysis {
  fileId: string;
  fileName: string;
  parsed: ParsedGSN;
  core: MandatorySafetyCore;
  /** Mandatory Safety Core の重複を除いた実ノード数 */
  coreNodeCount: number;
  /** 表示用ツリー（親が存在しないノードをルートとする） */
  trees: GSNTreeNode[];
  typeCounts: { type: GSNNodeType; count: number }[];
  statusCounts: Record<GSNNodeStatus, number>;
  nodeCount: number;
  /** 親を持たない（トップレベルに表示される）ノード数 */
  rootCount: number;
  /** 親子関係が1つも取れなかった場合 true（テーブルに親列が無いGSN等） */
  hasNoEdges: boolean;
  /** S3保存された大きいファイルでプレビュー部分のみを解析した場合 true */
  isPreviewOnly: boolean;
  /** 解析対象にできるテキストが無かった場合 true */
  hasNoContent: boolean;
}

const NODE_TYPE_ORDER: GSNNodeType[] = [
  'Goal',
  'SubGoal',
  'Strategy',
  'Context',
  'Assumption',
  'Solution',
  'Evidence',
  'Justification',
  'Undeveloped',
];

/**
 * 親が（ノード集合の中に）存在しないノードをルートとしてツリーを構築する。
 *
 * parsedGSN.rootNodeIds は parentIds が空のノードのみを含むため、
 * 存在しない親IDを参照しているノードはどのツリーにも現れない。
 * 表示ではノードを取りこぼさないよう、そうしたノードもルートとして扱う。
 */
function buildTrees(parsed: ParsedGSN): GSNTreeNode[] {
  const nodes = parsed.nodes;

  const rootIds = Array.from(nodes.values())
    .filter(n => n.parentIds.every(pid => !nodes.has(pid)))
    .map(n => n.id);

  const build = (id: string, ancestors: Set<string>): GSNTreeNode => {
    const node = nodes.get(id)!;
    if (ancestors.has(id)) {
      return { node, children: [], truncated: true };
    }
    const nextAncestors = new Set(ancestors).add(id);
    const seen = new Set<string>();
    const children: GSNTreeNode[] = [];
    for (const childId of node.childIds) {
      if (seen.has(childId) || !nodes.has(childId)) continue;
      seen.add(childId);
      children.push(build(childId, nextAncestors));
    }
    return { node, children, truncated: false };
  };

  const trees = rootIds.map(id => build(id, new Set()));

  // ツリーに現れなかったノード（循環参照のみで構成された部分等）を末尾に追加
  const rendered = new Set<string>();
  const collect = (t: GSNTreeNode) => {
    rendered.add(t.node.id);
    t.children.forEach(collect);
  };
  trees.forEach(collect);

  for (const [id, node] of nodes) {
    if (!rendered.has(id)) {
      trees.push({ node, children: [], truncated: false });
    }
  }

  return trees.sort((a, b) => compareNodeIds(a.node.id, b.node.id));
}

/** G0 → G1 → G1.1 → G2 の順に並ぶよう、数値部分を数値として比較する */
export function compareNodeIds(a: string, b: string): number {
  const split = (id: string) => id.match(/\d+|[^\d]+/g) || [id];
  const pa = split(a);
  const pb = split(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Mandatory Safety Core に含まれるノードのユニーク件数 */
export function countCoreNodes(core: MandatorySafetyCore): number {
  const ids = new Set<string>();
  for (const list of Object.values(core)) {
    for (const node of list) ids.add(node.id);
  }
  return ids.size;
}

/**
 * パース済みGSNから表示用の集計構造を作る。
 *
 * テキストパース結果（analyzeGSNText）とフォーム編集中のライブプレビュー
 * （GSNStructureEditorがbuildParsedGSNで組み立てたParsedGSN）の両方から
 * 共通で使う。
 */
export function deriveAnalysis(
  parsed: ParsedGSN
): Omit<GSNAnalysis, 'fileId' | 'fileName' | 'isPreviewOnly' | 'hasNoContent'> {
  const core = extractMandatorySafetyCore(parsed);
  const allNodes = Array.from(parsed.nodes.values());

  const statusCounts: Record<GSNNodeStatus, number> = {
    achieved: 0,
    partial: 0,
    unachieved: 0,
    unknown: 0,
  };
  for (const node of allNodes) statusCounts[node.status]++;

  const typeCounts = NODE_TYPE_ORDER
    .map(type => ({ type, count: parsed.nodesByType.get(type)?.length ?? 0 }))
    .filter(t => t.count > 0);

  const trees = buildTrees(parsed);

  return {
    parsed,
    core,
    coreNodeCount: countCoreNodes(core),
    trees,
    rootCount: trees.length,
    typeCounts,
    statusCounts,
    nodeCount: allNodes.length,
    hasNoEdges: allNodes.every(n => n.childIds.length === 0),
  };
}

/** GSNテキストを解析して表示用の構造を返す */
export function analyzeGSNText(text: string): Omit<GSNAnalysis, 'fileId' | 'fileName' | 'isPreviewOnly' | 'hasNoContent'> {
  return deriveAnalysis(parseGSN(text));
}

/** GSNとしてマークされたファイルのテキストを取得する（大きいファイルはプレビューのみ） */
function getGSNSourceText(file: UploadedFile): { text: string; isPreviewOnly: boolean } {
  if (file.content && file.content.length > 0) {
    return { text: file.content, isPreviewOnly: false };
  }
  // S3に退避された大きいファイルは content が空でプレビューのみ手元にある
  const preview = typeof file.metadata?.contentPreview === 'string' ? file.metadata.contentPreview : '';
  return { text: preview, isPreviewOnly: preview.length > 0 };
}

/** GSNとしてマークされたファイル（type === 'gsn'）を解析する */
export function analyzeGSNFiles(files: UploadedFile[]): GSNAnalysis[] {
  return files
    .filter(f => f.type === 'gsn' || f.metadata?.isGSN || f.metadata?.userDesignatedGSN)
    .map(file => {
      const { text, isPreviewOnly } = getGSNSourceText(file);
      const analysis = analyzeGSNText(text);
      return {
        ...analysis,
        fileId: file.id,
        fileName: file.name,
        isPreviewOnly,
        hasNoContent: text.trim().length === 0,
      };
    });
}
