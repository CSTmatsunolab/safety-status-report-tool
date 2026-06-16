// lambda/src/lib/gsn/stakeholder-view.ts
// ステークホルダー別GSNビュー生成
//
// system_design.md のロール別ビュー定義:
// - CxO: 上位Goal、主要Strategy、未解決リスク、意思決定に必要なSafety Status
// - Business/Product: Goalから中位Strategy、事業影響、マイルストーン、残リスク
// - Architect/Technical Fellows: Strategy、Context、Assumption、設計根拠、技術的リスク
// - R&D/Engineer: Solution/Evidenceノード、検証結果、失敗原因、再試験条件

import {
  GSNNode,
  GSNNodeType,
  ParsedGSN,
  StakeholderGSNConfig,
  GSNView,
  MandatorySafetyCore,
} from './types';

// ============================================================
// ステークホルダー別設定
// ============================================================

const STAKEHOLDER_GSN_CONFIGS: Record<string, StakeholderGSNConfig> = {
  cxo: {
    stakeholderId: 'cxo',
    traversalDepth: 2,
    focusedNodeTypes: ['Goal', 'SubGoal', 'Strategy'],
    requiredNodeTypes: ['Goal'],
    abstractionLevel: 'executive',
    description: '上位Goal・主要Strategy・未解決リスク・意思決定に必要なSafety Statusに焦点',
  },
  business: {
    stakeholderId: 'business',
    traversalDepth: 3,
    focusedNodeTypes: ['Goal', 'SubGoal', 'Strategy'],
    requiredNodeTypes: ['Goal', 'SubGoal'],
    abstractionLevel: 'business',
    description: 'GoalからStrategy・事業影響・マイルストーン・残リスクに焦点',
  },
  product: {
    stakeholderId: 'product',
    traversalDepth: 3,
    focusedNodeTypes: ['Goal', 'SubGoal', 'Strategy'],
    requiredNodeTypes: ['Goal', 'SubGoal'],
    abstractionLevel: 'business',
    description: 'GoalからStrategy・製品品質・マイルストーン・残リスクに焦点',
  },
  'technical-fellows': {
    stakeholderId: 'technical-fellows',
    traversalDepth: 5,
    focusedNodeTypes: ['Goal', 'SubGoal', 'Strategy', 'Context', 'Assumption'],
    requiredNodeTypes: ['Strategy', 'Context', 'Assumption'],
    abstractionLevel: 'technical',
    description: 'Strategy・Context・Assumption・設計根拠・技術的リスクに焦点',
  },
  architect: {
    stakeholderId: 'architect',
    traversalDepth: 5,
    focusedNodeTypes: ['Goal', 'SubGoal', 'Strategy', 'Context', 'Assumption'],
    requiredNodeTypes: ['Strategy', 'Context'],
    abstractionLevel: 'technical',
    description: 'Strategy・Context・Assumption・アーキテクチャ根拠に焦点',
  },
  'r-and-d': {
    stakeholderId: 'r-and-d',
    traversalDepth: 999,
    focusedNodeTypes: ['Solution', 'Evidence', 'SubGoal', 'Strategy'],
    requiredNodeTypes: ['Solution', 'Evidence'],
    abstractionLevel: 'detailed',
    description: 'Solution/Evidenceノード・検証結果・失敗原因・再試験条件に焦点',
  },
};

// カスタムステークホルダーのデフォルト設定
const DEFAULT_CONFIG: StakeholderGSNConfig = {
  stakeholderId: 'default',
  traversalDepth: 3,
  focusedNodeTypes: ['Goal', 'SubGoal', 'Strategy', 'Solution'],
  requiredNodeTypes: ['Goal'],
  abstractionLevel: 'business',
  description: 'バランス型: Goal・Strategy・Solutionを中心に収集',
};

// ============================================================
// GSNビュー生成
// ============================================================

/**
 * ステークホルダーIDに対応するGSN設定を取得
 */
export function getStakeholderGSNConfig(stakeholderId: string): StakeholderGSNConfig {
  return STAKEHOLDER_GSN_CONFIGS[stakeholderId] ?? {
    ...DEFAULT_CONFIG,
    stakeholderId,
  };
}

/**
 * GSNをトラバースして指定深度・種別のノードを収集
 */
function traverseGSN(
  parsedGSN: ParsedGSN,
  rootIds: string[],
  maxDepth: number,
  focusedTypes: GSNNodeType[]
): GSNNode[] {
  const visited = new Set<string>();
  const result: GSNNode[] = [];

  function visit(nodeId: string, currentDepth: number) {
    if (visited.has(nodeId) || currentDepth > maxDepth) return;
    visited.add(nodeId);

    const node = parsedGSN.nodes.get(nodeId);
    if (!node) return;

    if (focusedTypes.includes(node.type)) {
      result.push(node);
    }

    // 子ノードを再帰的に訪問
    for (const childId of node.childIds) {
      visit(childId, currentDepth + 1);
    }
  }

  for (const rootId of rootIds) {
    visit(rootId, 1);
  }

  return result;
}

/**
 * Mandatory Safety Coreのノードを常に追加（重複除去）
 */
function mergeWithMandatoryCore(
  selectedNodes: GSNNode[],
  mandatoryCore: MandatorySafetyCore
): GSNNode[] {
  const ids = new Set(selectedNodes.map(n => n.id));
  const extras: GSNNode[] = [];

  const coreNodes = [
    ...mandatoryCore.highSeverityHazards,
    ...mandatoryCore.asilDItems,
    ...mandatoryCore.unverifiedRequirements,
    ...mandatoryCore.openIssues,
    ...mandatoryCore.failedVerifications,
    ...mandatoryCore.criticalAssumptions,
  ];

  for (const node of coreNodes) {
    if (!ids.has(node.id)) {
      extras.push(node);
      ids.add(node.id);
    }
  }

  return [...selectedNodes, ...extras];
}

/**
 * ステークホルダー用クエリヒントを生成
 */
function generateQueryHints(
  config: StakeholderGSNConfig,
  selectedNodes: GSNNode[],
  mandatoryCore: MandatorySafetyCore
): string[] {
  const hints: string[] = [];

  // ステータス別のノードIDでクエリ生成
  const partialNodes = selectedNodes.filter(n => n.status === 'partial' || n.status === 'unachieved');
  if (partialNodes.length > 0) {
    hints.push(`${partialNodes.slice(0, 3).map(n => n.id).join(' ')} 未達成 対策`);
  }

  // 抽象度別のクエリ追加
  switch (config.abstractionLevel) {
    case 'executive':
      hints.push('安全性 経営リスク 意思決定 未解決');
      hints.push('Safety Goal 達成状況 リスクサマリー');
      break;
    case 'business':
      hints.push('事業影響 マイルストーン 残リスク スケジュール');
      hints.push('製品安全 リリース判断 対策状況');
      break;
    case 'technical':
      hints.push('アーキテクチャ 設計根拠 技術的リスク Strategy Context');
      hints.push('安全要件 システム設計 検証方針');
      break;
    case 'detailed':
      hints.push('検証結果 テスト 失敗原因 再試験 Evidence Solution');
      hints.push('実装詳細 技術課題 ASIL');
      break;
  }

  // Mandatory Coreに関するクエリ
  if (mandatoryCore.highSeverityHazards.length > 0) {
    hints.push('高リスクハザード 対策状況 残存リスク');
  }
  if (mandatoryCore.openIssues.length > 0) {
    hints.push('未解決事項 open issue 対応計画');
  }
  if (mandatoryCore.unverifiedRequirements.length > 0) {
    hints.push('未検証安全要件 検証完了予定');
  }

  return [...new Set(hints)];
}

/**
 * ステークホルダー別GSNビューを生成
 */
export function generateStakeholderGSNView(
  stakeholderId: string,
  parsedGSN: ParsedGSN,
  mandatoryCore: MandatorySafetyCore
): GSNView {
  const config = getStakeholderGSNConfig(stakeholderId);

  // 深度・種別に基づいてノードを収集
  const baseNodes = traverseGSN(
    parsedGSN,
    parsedGSN.rootNodeIds,
    config.traversalDepth,
    config.focusedNodeTypes
  );

  // 必須ノード種別が含まれているか確認し、補完
  for (const requiredType of config.requiredNodeTypes) {
    const typeNodes = parsedGSN.nodesByType.get(requiredType) || [];
    for (const node of typeNodes) {
      if (!baseNodes.find(n => n.id === node.id)) {
        baseNodes.push(node);
      }
    }
  }

  // Mandatory Coreを統合
  const selectedNodes = mergeWithMandatoryCore(baseNodes, mandatoryCore);

  // クエリヒント生成
  const queryHints = generateQueryHints(config, selectedNodes, mandatoryCore);

  // ビューサマリー生成
  const achievedCount = selectedNodes.filter(n => n.status === 'achieved').length;
  const partialCount = selectedNodes.filter(n => n.status === 'partial').length;
  const unachievedCount = selectedNodes.filter(n => n.status === 'unachieved').length;

  const summary = [
    `GSNビュー (${config.description})`,
    `対象ノード数: ${selectedNodes.length}件`,
    `達成: ${achievedCount}件 / 部分達成: ${partialCount}件 / 未達成: ${unachievedCount}件`,
  ].join(' | ');

  return {
    stakeholderId,
    selectedNodes,
    mandatoryCore,
    queryHints,
    summary,
  };
}

/**
 * GSNビューをRAGクエリ用のテキストに変換
 */
export function gsnViewToQueryText(view: GSNView): string {
  const parts: string[] = [];

  // 優先度の高いノード（未達成・部分達成）を先頭に
  const priorityNodes = view.selectedNodes
    .filter(n => n.status !== 'achieved')
    .slice(0, 10);

  if (priorityNodes.length > 0) {
    parts.push('未解決・部分達成ノード:');
    parts.push(priorityNodes.map(n => `${n.id}: ${n.description}`).join('\n'));
  }

  // クエリヒント
  parts.push(...view.queryHints);

  return parts.join('\n');
}

/**
 * GSNビューをコンテキスト文字列に変換（LLMへの入力用）
 */
export function gsnViewToContextText(view: GSNView): string {
  const lines: string[] = [
    `=== GSN ステークホルダービュー (${view.stakeholderId}) ===`,
    view.summary,
    '',
  ];

  // ノード一覧（深度・種別でグループ化）
  const byType = new Map<GSNNodeType, GSNNode[]>();
  for (const node of view.selectedNodes) {
    const list = byType.get(node.type) || [];
    list.push(node);
    byType.set(node.type, list);
  }

  const typeOrder: GSNNodeType[] = ['Goal', 'SubGoal', 'Strategy', 'Context', 'Assumption', 'Solution', 'Evidence'];
  for (const type of typeOrder) {
    const nodes = byType.get(type);
    if (!nodes || nodes.length === 0) continue;

    lines.push(`### ${type} ノード`);
    for (const node of nodes) {
      const statusLabel = { achieved: '✓', partial: '△', unachieved: '✗', unknown: '?' }[node.status];
      lines.push(`- [${statusLabel}] ${node.id}: ${node.description}${node.asilLevel ? ` [${node.asilLevel}]` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
