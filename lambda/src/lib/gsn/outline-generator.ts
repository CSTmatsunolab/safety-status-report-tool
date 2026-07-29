// lambda/src/lib/gsn/outline-generator.ts
// GSNビューからステークホルダー固有のレポートアウトラインを動的生成
// GSN木構造の深さ優先順序でノードを見出しとして展開し、
// 固定テンプレートセクションを最小限（冒頭・末尾のみ）に抑える

import { GSNView, GSNNode, GSNNodeType, AbstractionLevel, MandatorySafetyCore } from './types';

const MAX_SECTIONS = 25;
const NODE_DESC_MAX_CHARS = 60;

function label(ja: string, en: string, language: 'ja' | 'en'): string {
  return language === 'en' ? en : ja;
}

function resolveFrame(stakeholderId: string): AbstractionLevel {
  if (stakeholderId === 'cxo') return 'executive';
  if (stakeholderId === 'business' || stakeholderId === 'product') return 'business';
  if (stakeholderId === 'architect' || stakeholderId === 'technical-fellows') return 'technical';
  return 'detailed';
}

function truncateDesc(desc: string): string {
  if (desc.length <= NODE_DESC_MAX_CHARS) return desc;
  return desc.substring(0, NODE_DESC_MAX_CHARS) + '…';
}

function hasMandatoryCoreItems(mc: MandatorySafetyCore): boolean {
  return (
    mc.highSeverityHazards.length > 0 ||
    mc.asilDItems.length > 0 ||
    mc.unverifiedRequirements.length > 0 ||
    mc.openIssues.length > 0 ||
    mc.failedVerifications.length > 0 ||
    mc.criticalAssumptions.length > 0
  );
}

/**
 * ノードIDと説明からセクション見出し文字列を生成する
 */
function nodeToSection(node: GSNNode): string {
  if (!node.description) return node.id;
  return `${node.id}: ${truncateDesc(node.description)}`;
}

/**
 * フレームに応じて見出しとして展開するノードタイプを返す
 */
function getVisibleNodeTypes(frame: AbstractionLevel): GSNNodeType[] {
  switch (frame) {
    case 'executive':
      return ['Goal', 'SubGoal'];
    case 'business':
      return ['Goal', 'SubGoal', 'Strategy'];
    case 'technical':
      return ['Goal', 'SubGoal', 'Strategy', 'Context', 'Assumption'];
    case 'detailed':
      return ['Goal', 'SubGoal', 'Strategy', 'Context', 'Assumption', 'Solution', 'Evidence', 'Undeveloped'];
  }
}

/**
 * フレームに応じたノード上限数
 * MAX_SECTIONS から冒頭1・末尾2〜3・Mandatory Core最大5を引いた残り
 */
function getNodeLimit(frame: AbstractionLevel): number {
  switch (frame) {
    case 'executive': return 8;
    case 'business':  return 12;
    case 'technical': return 15;
    case 'detailed':  return 17;
  }
}

/**
 * 選択ノードをGSN木構造の深さ優先順序で並べ替える。
 * 親→子の順序を保ち、同一の親を持つ兄弟はID辞書順に並べる。
 * フレームに適合しないノードタイプは除外する。
 */
function orderNodesByHierarchy(nodes: GSNNode[], frame: AbstractionLevel): GSNNode[] {
  const visibleTypes = getVisibleNodeTypes(frame);
  const eligible = nodes.filter(n => visibleTypes.includes(n.type));
  if (eligible.length === 0) return [];

  const nodeMap = new Map(eligible.map(n => [n.id, n]));
  const eligibleIds = new Set(eligible.map(n => n.id));

  // 選択セット内に親を持たないノードをルートとして扱う
  const roots = eligible
    .filter(n => !n.parentIds.some(pid => eligibleIds.has(pid)))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const visited = new Set<string>();
  const result: GSNNode[] = [];

  function dfs(node: GSNNode) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    result.push(node);

    const children = node.childIds
      .filter(cid => eligibleIds.has(cid) && !visited.has(cid))
      .map(cid => nodeMap.get(cid)!)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    for (const child of children) {
      dfs(child);
    }
  }

  for (const root of roots) dfs(root);

  // DFS で到達しなかった孤立ノードを末尾に追加
  for (const node of eligible) {
    if (!visited.has(node.id)) result.push(node);
  }

  return result;
}

/**
 * GSNビューからステークホルダー向けレポートアウトラインを生成する。
 * GSNファイルが存在する場合に、固定テンプレートの代わりに使用される。
 *
 * 構成方針:
 *   1. エグゼクティブサマリー（固定・冒頭のみ）
 *   2. GSNノードを木構造の深さ優先順で展開（フレーム別フィルタ適用）
 *   3. Mandatory Safety Core セクション（該当ノードが存在する場合）
 *   4. フレーム別の末尾セクション（推奨事項・改善提案等）
 */
export function generateOutlineFromGSNView(
  view: GSNView,
  stakeholderId: string,
  language: 'ja' | 'en' = 'ja'
): string[] {
  const { selectedNodes, mandatoryCore } = view;
  const frame = resolveFrame(stakeholderId);

  if (selectedNodes.length === 0) {
    return buildFallbackOutline(language);
  }

  // ── GSN階層順にノードのみを展開（固定セクションなし）──
  const orderedNodes = orderNodesByHierarchy(selectedNodes, frame);
  const nodeLimit = getNodeLimit(frame);

  if (orderedNodes.length === 0) {
    return buildFallbackOutline(language);
  }

  const sections = orderedNodes.slice(0, nodeLimit).map(nodeToSection);

  // Mandatory Safety Core は常に末尾セクションとして追加（対象項目がある場合）
  if (hasMandatoryCoreItems(mandatoryCore)) {
    sections.push(label('Mandatory Safety Core（必須安全コア）', 'Mandatory Safety Core', language));
  }

  // 重複除去・上限適用
  return [...new Set(sections)].slice(0, MAX_SECTIONS);
}

function buildFallbackOutline(language: 'ja' | 'en'): string[] {
  return [
    label('GSN概要（ノード一覧）', 'GSN Overview (Node List)', language),
  ];
}

/**
 * アウトラインに含まれるGSNノードオブジェクトを返す（文字列変換前）。
 * RAGクエリ生成で「見出しになるノード全てにクエリを生成」するために使用する。
 */
export function getOutlineNodes(
  view: GSNView,
  stakeholderId: string,
): GSNNode[] {
  const { selectedNodes } = view;
  const frame = resolveFrame(stakeholderId);
  const orderedNodes = orderNodesByHierarchy(selectedNodes, frame);
  const nodeLimit = getNodeLimit(frame);
  return orderedNodes.slice(0, nodeLimit);
}

/**
 * 生成されたアウトラインがGSN由来かどうかを判定する。
 * generateStructurePrompt での追加注記に使用。
 */
export function isGSNDerivedOutline(sections: string[]): boolean {
  return sections.some(s =>
    /^[GSCASEJUsn]\d/.test(s) ||
    s.includes('Goal') ||
    s.includes('Strategy') ||
    s.includes('Mandatory Safety Core')
  );
}
