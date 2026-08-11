// src/lib/gsn/hicase-view.ts
// hicase（階層的セーフティケース）: ステークホルダー別 hinode open/closed 判定
//
// ⚠️ lambda/src/lib/gsn/hicase-view.ts のコピー（フロントエンドのステークホルダープレビュー用）。
// Next.js と Lambda は独立ビルドのため共有パッケージを持たない。
// どちらかを変更したら手動で同期すること（types.ts / parser.ts / mandatory-core.ts と同じ運用）。
//
// 設計元: hicase/report_structure.md
// higoal(Goal/SubGoal連鎖) / histrategy(Strategy連鎖) / hievidence(Solution/Evidence連鎖) の
// 3種のhinodeについて、ステークホルダーごとにopen(展開)/closed(見出し+要約に圧縮)を切り替える。
//
// 開閉判定のルール（素朴な「open/closed=全部見せる/全部隠す」ではないので注意）:
//   - ノードは到達したら必ず見出しとして出す（深さ予算の制約のみ受ける）。
//   - 「型のopen/close」が制御するのは、あるノードの子が「同じ型」に連続する場合の再帰だけ
//     （例: hievidence→hievidenceの連続）。型をまたぐ遷移（Goal→Strategy等）は常に見出しとして出る。
//   - Context/Assumption/Justification/Undeveloped は型を持たない（null）ため、常に「遷移」として扱う。
//   - mandatory safety coreは上記の深さ上限・同型closedブロックを上書きする。
//     ただし detailLevel が 'full'/'full-with-reverification' の場合のみ実際に見出しを強制的に開き、
//     'count'/'one-sentence' の場合は見出しを増やさず、直近の表示済み祖先に圧縮注記を付与する。

import {
  GSNNodeType,
  ParsedGSN,
  MandatorySafetyCore,
  HiNodeType,
  HiCaseStakeholderConfig,
  HiCaseNode,
  HiCaseView,
} from './types';

// ============================================================
// ステークホルダー別 hicase 設定
// ============================================================

export const HICASE_STAKEHOLDER_CONFIGS: Record<string, HiCaseStakeholderConfig> = {
  cxo: {
    stakeholderId: 'cxo',
    higoal: 'closed',
    histrategy: 'closed',
    hievidence: 'closed',
    maxDepth: 2,
    mandatoryCoreDetail: 'count',
    description: '結論のみ。mandatory coreは件数+見出しレベルに圧縮',
  },
  business: {
    stakeholderId: 'business',
    higoal: 'closed',
    histrategy: 'open',
    hievidence: 'closed',
    maxDepth: 3,
    mandatoryCoreDetail: 'one-sentence',
    description: '議論の骨格+事業影響。mandatory coreは1文要約+参照',
  },
  product: {
    stakeholderId: 'product',
    higoal: 'closed',
    histrategy: 'open',
    hievidence: 'closed',
    maxDepth: 3,
    mandatoryCoreDetail: 'one-sentence',
    description: '議論の骨格+製品品質。mandatory coreは1文要約+参照',
  },
  'technical-fellows': {
    stakeholderId: 'technical-fellows',
    higoal: 'open',
    histrategy: 'open',
    hievidence: 'closed',
    maxDepth: 5,
    mandatoryCoreDetail: 'full',
    description: '設計根拠・前提条件を本文に展開。mandatory coreは本文にそのまま展開',
  },
  architect: {
    // 「担当領域中心」の区別は担当領域メタデータが存在しないため未実装。
    // technical-fellowsと同一挙動とする（設計時にユーザー確認済み）。
    stakeholderId: 'architect',
    higoal: 'open',
    histrategy: 'open',
    hievidence: 'closed',
    maxDepth: 5,
    mandatoryCoreDetail: 'full',
    description: '設計根拠・アーキテクチャ判断を本文に展開。mandatory coreは本文にそのまま展開',
  },
  'r-and-d': {
    stakeholderId: 'r-and-d',
    higoal: 'open',
    histrategy: 'open',
    hievidence: 'open',
    maxDepth: Number.POSITIVE_INFINITY,
    mandatoryCoreDetail: 'full-with-reverification',
    description: '検証データ・再検証条件まで最深部を展開',
  },
};

const DEFAULT_HICASE_CONFIG: HiCaseStakeholderConfig = {
  stakeholderId: 'default',
  higoal: 'closed',
  histrategy: 'open',
  hievidence: 'closed',
  maxDepth: 3,
  mandatoryCoreDetail: 'one-sentence',
  description: 'バランス型: 議論の骨格を中心に展開',
};

export function getHiCaseStakeholderConfig(stakeholderId: string): HiCaseStakeholderConfig {
  return HICASE_STAKEHOLDER_CONFIGS[stakeholderId] ?? {
    ...DEFAULT_HICASE_CONFIG,
    stakeholderId,
  };
}

// ============================================================
// ノード種別 → hinodeカテゴリ
// ============================================================

export function categoryOfNodeType(type: GSNNodeType): HiNodeType | null {
  switch (type) {
    case 'Goal':
    case 'SubGoal':
      return 'higoal';
    case 'Strategy':
      return 'histrategy';
    case 'Solution':
    case 'Evidence':
      return 'hievidence';
    default:
      return null;
  }
}

// ============================================================
// Mandatory Core 関連の補助
// ============================================================

export function collectMandatoryCoreIds(core: MandatorySafetyCore): Set<string> {
  const ids = new Set<string>();
  const all = [
    ...core.highSeverityHazards,
    ...core.asilDItems,
    ...core.unverifiedRequirements,
    ...core.openIssues,
    ...core.failedVerifications,
    ...core.criticalAssumptions,
  ];
  for (const n of all) ids.add(n.id);
  return ids;
}

/** 各mandatory coreノードについて、祖先チェーン（全親、DAG対応）+自身のidを収集する */
export function collectForcedPathIds(parsedGSN: ParsedGSN, coreIds: Set<string>): Set<string> {
  const result = new Set<string>();

  function walkUp(nodeId: string, seen: Set<string>) {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    result.add(nodeId);
    const node = parsedGSN.nodes.get(nodeId);
    if (!node) return;
    for (const parentId of node.parentIds) {
      walkUp(parentId, seen);
    }
  }

  for (const id of coreIds) {
    walkUp(id, new Set<string>());
  }

  return result;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '…';
}

// ============================================================
// hicase木の構築
// ============================================================

interface BuildContext {
  parsedGSN: ParsedGSN;
  coreIds: Set<string>;
  forcedPathSet: Set<string>;
  config: HiCaseStakeholderConfig;
  visited: Set<string>;
  emittedIds: Set<string>;
  nodeById: Map<string, HiCaseNode>;
  allowForcedOverride: boolean;
}

function buildNode(ctx: BuildContext, nodeId: string, depth: number, forcedOpen: boolean): HiCaseNode | null {
  if (ctx.visited.has(nodeId)) return null;
  ctx.visited.add(nodeId);

  const node = ctx.parsedGSN.nodes.get(nodeId);
  if (!node) return null;

  const category = categoryOfNodeType(node.type);
  ctx.emittedIds.add(nodeId);

  const children: HiCaseNode[] = [];
  for (const childId of node.childIds) {
    if (ctx.visited.has(childId)) continue;
    const childNode = ctx.parsedGSN.nodes.get(childId);
    if (!childNode) continue;

    const childCategory = categoryOfNodeType(childNode.type);
    const depthBlocked = depth + 1 > ctx.config.maxDepth;
    const sameCategoryContinuation = category !== null && childCategory === category;
    const closedByCategory = sameCategoryContinuation && category !== null && ctx.config[category] === 'closed';
    const naturallyBlocked = depthBlocked || closedByCategory;

    const isForcedChild = naturallyBlocked && ctx.allowForcedOverride && ctx.forcedPathSet.has(childId);
    if (naturallyBlocked && !isForcedChild) continue;

    const built = buildNode(ctx, childId, depth + 1, isForcedChild);
    if (built) children.push(built);
  }

  const isOpen = category === null ? true : ctx.config[category] === 'open';

  const hiCaseNode: HiCaseNode = {
    node,
    hiNodeType: category,
    isOpen,
    isMandatoryCoreMember: ctx.coreIds.has(nodeId),
    isMandatoryCoreForced: forcedOpen,
    mandatoryCoreAnnotation: null,
    depth,
    children,
  };
  ctx.nodeById.set(nodeId, hiCaseNode);
  return hiCaseNode;
}

/** 木に現れなかったmandatory coreノードを、直近の表示済み祖先に圧縮注記として付与する */
function attachAnnotation(ctx: BuildContext, coreId: string) {
  if (ctx.emittedIds.has(coreId)) return;

  const coreNode = ctx.parsedGSN.nodes.get(coreId);
  if (!coreNode) return;

  function findEmittedAncestor(nodeId: string, seen: Set<string>): string | null {
    if (seen.has(nodeId)) return null;
    seen.add(nodeId);
    if (ctx.emittedIds.has(nodeId)) return nodeId;
    const node = ctx.parsedGSN.nodes.get(nodeId);
    if (!node) return null;
    for (const parentId of node.parentIds) {
      const found = findEmittedAncestor(parentId, seen);
      if (found) return found;
    }
    return null;
  }

  let ancestorId: string | null = null;
  const seen = new Set<string>();
  for (const parentId of coreNode.parentIds) {
    ancestorId = findEmittedAncestor(parentId, seen);
    if (ancestorId) break;
  }
  if (!ancestorId) return;

  const target = ctx.nodeById.get(ancestorId);
  if (!target) return;

  if (!target.mandatoryCoreAnnotation) {
    target.mandatoryCoreAnnotation = { count: 0, oneSentenceItems: [] };
  }
  target.mandatoryCoreAnnotation.count += 1;
  if (ctx.config.mandatoryCoreDetail === 'one-sentence') {
    target.mandatoryCoreAnnotation.oneSentenceItems.push({
      id: coreId,
      text: truncate(coreNode.description || coreId, 80),
    });
  }
}

/**
 * パース済みGSN + mandatory core からステークホルダー別のhicaseビューを構築する。
 */
export function buildHiCaseView(
  parsedGSN: ParsedGSN,
  mandatoryCore: MandatorySafetyCore,
  stakeholderId: string
): HiCaseView {
  const config = getHiCaseStakeholderConfig(stakeholderId);
  const coreIds = collectMandatoryCoreIds(mandatoryCore);
  const forcedPathSet = collectForcedPathIds(parsedGSN, coreIds);
  const allowForcedOverride = config.mandatoryCoreDetail === 'full' || config.mandatoryCoreDetail === 'full-with-reverification';

  const ctx: BuildContext = {
    parsedGSN,
    coreIds,
    forcedPathSet,
    config,
    visited: new Set<string>(),
    emittedIds: new Set<string>(),
    nodeById: new Map<string, HiCaseNode>(),
    allowForcedOverride,
  };

  const roots: HiCaseNode[] = [];
  for (const rootId of parsedGSN.rootNodeIds) {
    const built = buildNode(ctx, rootId, 1, false);
    if (built) roots.push(built);
  }

  if (config.mandatoryCoreDetail === 'count' || config.mandatoryCoreDetail === 'one-sentence') {
    for (const coreId of coreIds) {
      attachAnnotation(ctx, coreId);
    }
  }

  return {
    stakeholderId,
    roots,
    mandatoryCoreDetail: config.mandatoryCoreDetail,
  };
}
