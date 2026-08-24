// lambda/src/lib/gsn/outline-generator.ts
// GSNビューからステークホルダー固有のレポートアウトラインを動的生成
// GSN木構造の深さ優先順序でノードを見出しとして展開し、
// 固定テンプレートセクションを最小限（冒頭・末尾のみ）に抑える

import { GSNView, GSNNode, GSNNodeType, AbstractionLevel, MandatorySafetyCore, HiCaseNode, HiCaseView } from './types';

const MAX_SECTIONS = 25;
const NODE_DESC_MAX_CHARS = 60;
// closedなhinodeに吸収された前提・文脈の注記に載せる最大件数と、その説明の最大文字数
const ABSORBED_ITEMS_MAX = 4;
const ABSORBED_DESC_MAX_CHARS = 40;

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

function truncateAbsorbedDesc(desc: string): string {
  if (desc.length <= ABSORBED_DESC_MAX_CHARS) return desc;
  return desc.substring(0, ABSORBED_DESC_MAX_CHARS) + '…';
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

/**
 * hicaseノード1件分の見出しに付与するマーカーを組み立てる。
 * - 子が0件（要約のみで展開しない）の場合: [要約のみ]
 * - mandatory core強制開放の場合: [Mandatory Core - 強制開放]
 * - mandatory coreに該当するが自然に表示されている場合: [Mandatory Core]
 * - hievidenceがclosed設定だが証拠連鎖が未完成のため開かれた場合: [未完成の証拠連鎖 - 展開]
 */
function hiCaseMarkers(node: HiCaseNode, language: 'ja' | 'en'): string {
  const markers: string[] = [];
  if (node.children.length === 0) {
    markers.push(label('要約のみ', 'summary only', language));
  }
  if (node.isMandatoryCoreForced) {
    markers.push(label('Mandatory Core - 強制開放', 'Mandatory Core - forced open', language));
  } else if (node.isMandatoryCoreMember) {
    markers.push('Mandatory Core');
  }
  if (node.isForcedOpenByIncompleteEvidence) {
    markers.push(label('未完成の証拠連鎖 - 展開', 'incomplete evidence chain - expanded', language));
  }
  return markers.length > 0 ? ` [${markers.join(' / ')}]` : '';
}

/**
 * closedなhinodeに吸収されたContext/Assumption/Justificationを、
 * 見出し末尾の注記として列挙する（独立見出しにはせず、親の要約で触れさせるため）。
 */
function hiCaseAbsorbedSuffix(node: HiCaseNode, language: 'ja' | 'en'): string {
  const absorbed = node.absorbedNodes;
  if (absorbed.length === 0) return '';

  const shown = absorbed.slice(0, ABSORBED_ITEMS_MAX);
  const items = shown
    .map(a => (a.description ? `${a.id}: ${truncateAbsorbedDesc(a.description)}` : a.id))
    .join('; ');
  const rest = absorbed.length - shown.length;
  const more = rest > 0 ? label(` 他${rest}件`, ` +${rest} more`, language) : '';

  return label(
    ` ◇ 内包する前提・文脈: ${items}${more}`,
    ` ◇ embedded context/assumptions: ${items}${more}`,
    language
  );
}

/**
 * count/one-sentence層で、木に現れなかったmandatory coreノードの圧縮注記を末尾に付与する。
 */
function hiCaseAnnotationSuffix(node: HiCaseNode, language: 'ja' | 'en'): string {
  const annotation = node.mandatoryCoreAnnotation;
  if (!annotation) return '';
  if (annotation.oneSentenceItems.length > 0) {
    const text = annotation.oneSentenceItems.map(item => `${item.id}: ${item.text}`).join('; ');
    return ` ⚠ mandatory core: ${text}`;
  }
  return label(` ⚠ mandatory core: ${annotation.count}件`, ` ⚠ mandatory core: ${annotation.count} item(s)`, language);
}

function hiCaseNodeToSection(node: HiCaseNode, numberStr: string, language: 'ja' | 'en'): string {
  const base = node.node.description
    ? `${numberStr} ${node.node.id}: ${truncateDesc(node.node.description)}`
    : `${numberStr} ${node.node.id}`;
  return `${base}${hiCaseAnnotationSuffix(node, language)}${hiCaseAbsorbedSuffix(node, language)}${hiCaseMarkers(node, language)}`;
}

/**
 * hicaseビュー（ステークホルダー別のhinode open/closed判定済み木構造）から
 * 階層採番付きのレポートアウトラインを生成する。
 * 各見出しは既に "1", "2.1", "2.1.1" のようなドット番号を含むため、
 * generateStructurePrompt側では追加の連番を付与しない（report-prompts.ts参照）。
 *
 * mandatoryCore を渡した場合、generateOutlineFromGSNView と同様に
 * 末尾へ「Mandatory Safety Core」セクションを追加する。
 * generateMandatoryCorePrompt が「レポート構成に含まれるMandatory Safety Coreセクション」
 * への記述を指示するため、これを省くとAIが構成外セクションを自作する。
 */
export function generateOutlineFromHiCaseView(
  hicaseView: HiCaseView,
  language: 'ja' | 'en' = 'ja',
  mandatoryCore?: MandatorySafetyCore
): string[] {
  if (hicaseView.roots.length === 0) {
    return buildFallbackOutline(language);
  }

  const sections: string[] = [];
  const needsCoreSection = mandatoryCore !== undefined && hasMandatoryCoreItems(mandatoryCore);
  // Mandatory Safety Core セクション分の枠を確保してからノードを展開する
  const nodeSectionLimit = needsCoreSection ? MAX_SECTIONS - 1 : MAX_SECTIONS;

  function walk(nodes: HiCaseNode[], prefix: number[]) {
    nodes.forEach((node, index) => {
      if (sections.length >= nodeSectionLimit) return;
      const numberStr = [...prefix, index + 1].join('.');
      sections.push(hiCaseNodeToSection(node, numberStr, language));
      if (node.children.length > 0) {
        walk(node.children, [...prefix, index + 1]);
      }
    });
  }

  walk(hicaseView.roots, []);

  // 深いR&Dビュー等でMAX_SECTIONSを超える場合は打ち切られる
  // （既存のgenerateOutlineFromGSNViewと同じ上限・同じ挙動）
  if (sections.length === 0) {
    return buildFallbackOutline(language);
  }

  if (needsCoreSection) {
    // ルート直後の最上位章番号を採番し、hicase見出しと同じ「番号+スペース」形式に揃える
    const coreNumber = hicaseView.roots.length + 1;
    sections.push(
      `${coreNumber} ` +
        label('Mandatory Safety Core（必須安全コア）', 'Mandatory Safety Core', language)
    );
  }

  return sections.slice(0, MAX_SECTIONS);
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
