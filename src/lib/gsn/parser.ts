// src/lib/gsn/parser.ts
// GSNテキストをパースしてノード構造を抽出
//
// ⚠️ lambda/src/lib/gsn/parser.ts のコピー（フロントエンド表示用）。
// UI に表示する構造が Lambda 側の実際の解析結果と一致している必要があるため、
// パースロジックを変更する場合は必ず両方を同じ内容に保つこと。

import {
  GSNNode,
  GSNNodeType,
  GSNNodeStatus,
  RiskSeverity,
  ParsedGSN,
} from './types';

// 標準GSNノードIDパターン（例: G0, G1.1, S1, Sn01, C0, A0, J1, E1, U1）
// テーブル抽出・フォーム編集・シリアライズで共通利用する
export const GSN_NODE_ID_PATTERN = /^(G\d+(\.\d+)*|S(?:n\d+|\d+)|C\d+(\.\d+)*|A\d+(\.\d+)*|J\d+|E\d+|U\d+)$/i;

// ============================================================
// ノード種別判定
// ============================================================

function detectNodeType(nodeId: string, typeHint?: string): GSNNodeType {
  const hint = (typeHint || '').toLowerCase();

  if (hint.includes('sub-goal') || hint.includes('subgoal')) return 'SubGoal';
  if (hint.includes('goal') && nodeId.includes('.')) return 'SubGoal';
  if (hint.includes('goal')) return 'Goal';
  if (hint.includes('strategy')) return 'Strategy';
  if (hint.includes('context')) return 'Context';
  if (hint.includes('assumption')) return 'Assumption';
  if (hint.includes('solution') || hint.includes('evidence')) return 'Solution';
  if (hint.includes('justification')) return 'Justification';
  if (hint.includes('undeveloped')) return 'Undeveloped';

  // IDパターンで判定
  if (/^G\d+\.\d/.test(nodeId)) return 'SubGoal';
  if (/^G\d+$/.test(nodeId)) return 'Goal';
  if (/^S\d+$/.test(nodeId)) return 'Strategy';
  if (/^C\d+$/.test(nodeId)) return 'Context';
  if (/^A\d+$/.test(nodeId)) return 'Assumption';
  if (/^Sn\d+$/i.test(nodeId)) return 'Solution';
  if (/^E\d+$/.test(nodeId)) return 'Evidence';
  if (/^J\d+$/.test(nodeId)) return 'Justification';
  if (/^U\d+$/.test(nodeId)) return 'Undeveloped';

  return 'Goal';
}

function detectStatus(text: string): GSNNodeStatus {
  const t = text.toLowerCase();
  if ((t.includes('達成') && !t.includes('部分') && !t.includes('未')) ||
      (t.includes('achieved') && !t.includes('not') && !t.includes('partial'))) {
    return 'achieved';
  }
  if (t.includes('部分達成') || t.includes('partial')) return 'partial';
  if (t.includes('未達成') || t.includes('not achieved') || t.includes('failed')) return 'unachieved';
  if (t.includes('進行中') || t.includes('検討中') || t.includes('in progress')) return 'partial';
  return 'unknown';
}

function detectSeverity(text: string): RiskSeverity {
  const t = text.toLowerCase();
  if (t.includes('critical') || t.includes('catastrophic') || t.includes('致命')) return 'critical';
  if (t.includes('serious') || t.includes('high') || t.includes('重大') ||
      t.includes('危機的') || t.includes('asil-d') || t.includes('asil d')) return 'high';
  if (t.includes('medium') || t.includes('moderate') || t.includes('marginal') ||
      t.includes('中程度')) return 'medium';
  if (t.includes('low') || t.includes('negligible') || t.includes('低')) return 'low';
  return 'unknown';
}

function detectASIL(text: string): string | undefined {
  const m = text.match(/ASIL[-\s]?([A-D]|QM)/i);
  return m ? `ASIL-${m[1].toUpperCase()}` : undefined;
}

function isOpenIssue(text: string, status: GSNNodeStatus): boolean {
  const t = text.toLowerCase();
  return status !== 'achieved' ||
    t.includes('open') ||
    t.includes('未解決') ||
    t.includes('要対応') ||
    t.includes('対策中') ||
    t.includes('検討中') ||
    t.includes('未完了');
}

function hasFailedVerification(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('fail') ||
    t.includes('不合格') ||
    t.includes('failed') ||
    t.includes('検証失敗') ||
    t.includes('ng');
}

function isUnverifiedRequirement(text: string, status: GSNNodeStatus): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes('requirement') || t.includes('安全要件') || t.includes('安全要求')) &&
    (status === 'partial' || status === 'unachieved' || t.includes('未検証') || t.includes('未完了'))
  );
}

// GSNStructureEditorが「内容」セルへ埋め込むタグ（serialize.tsのbuildContentCell参照）と
// 空セル用の目印（EMPTY_CELL_PLACEHOLDER）を、表示用のdescriptionから取り除く
const EDITOR_TAG_PATTERN = /\s*\[(?:Severity:(?:Critical|High|Medium|Low)|ASIL-(?:QM|[A-D])|未解決|検証失敗)\]/gi;

function cleanDescriptionForDisplay(rawDescription: string): string {
  const stripped = rawDescription.replace(EDITOR_TAG_PATTERN, '').trim();
  return stripped === '-' ? '' : stripped;
}

// ============================================================
// テーブルからのノード抽出
// ============================================================

function parseTableRows(section: string): GSNNode[] {
  const nodes: GSNNode[] = [];
  const lines = section.split('\n');

  let headerFound = false;
  let headers: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);

    // ヘッダー行の検出（複数テーブルに対応: 新しいヘッダーが現れたら列マッピングをリセット）
    if (cells.some(c =>
      /ノードID|NodeID|ID/i.test(c) || /種別|Type/i.test(c)
    )) {
      headers = cells.map(c => c.toLowerCase());
      headerFound = true;
      continue;
    }

    // 区切り行スキップ
    if (cells.every(c => /^[-:]+$/.test(c))) continue;

    if (!headerFound) continue;

    // ノードIDらしいセルを探す
    const idColIdx = headers.findIndex(h => h.includes('id') || h.includes('ノード'));
    const typeColIdx = headers.findIndex(h => h.includes('種別') || h.includes('type'));
    const descColIdx = headers.findIndex(h =>
      h.includes('内容') || h.includes('content') || h.includes('description') ||
      h.includes('安全目標') || h.includes('説明') || h.includes('証拠')
    );
    const statusColIdx = headers.findIndex(h =>
      h.includes('達成') || h.includes('status') || h.includes('有効')
    );
    const parentColIdx = headers.findIndex(h => h.includes('親') || h.includes('parent'));
    const evidenceColIdx = headers.findIndex(h =>
      h.includes('根拠') || h.includes('evidence') || h.includes('参照')
    );

    const nodeIdRaw = idColIdx >= 0 ? cells[idColIdx] : cells[0];
    if (!nodeIdRaw || !/^[GSCASEJUsnGgSsCcAaEeJjUu]/.test(nodeIdRaw)) continue;

    // IDをクリーニング
    const nodeId = nodeIdRaw.replace(/\s+/g, '').replace(/[^\w.]/g, '');
    if (!nodeId) continue;

    // 標準GSNノードIDパターンのみ受け付ける（AEB・ASIL等の誤検出を防止）
    if (!GSN_NODE_ID_PATTERN.test(nodeId)) continue;

    const typeHint = typeColIdx >= 0 ? cells[typeColIdx] : '';
    const descriptionRaw = descColIdx >= 0 ? (cells[descColIdx] || '') : '';
    const statusText = statusColIdx >= 0 ? (cells[statusColIdx] || '') : '';
    const parentText = parentColIdx >= 0 ? (cells[parentColIdx] || '') : '';
    const evidenceText = evidenceColIdx >= 0 ? (cells[evidenceColIdx] || '') : '';

    const allText = [nodeId, typeHint, descriptionRaw, statusText, parentText, evidenceText].join(' ');
    const status = detectStatus(statusText || descriptionRaw);
    const severity = detectSeverity(allText);
    // GSNStructureEditorが「内容」セルに埋め込むタグ（severity/ASIL/open issue/検証失敗）は
    // 上のキーワード検出にのみ使い、表示用のdescriptionからは取り除く
    const description = cleanDescriptionForDisplay(descriptionRaw);

    // 親ノードID抽出
    const parentIds: string[] = [];
    const parentMatches = parentText.match(/[GSCASEJUsnGgSsCcAaEeJjUu]\d+(\.\d+)*/g);
    if (parentMatches) parentIds.push(...parentMatches);

    nodes.push({
      id: nodeId,
      type: detectNodeType(nodeId, typeHint),
      description,
      status,
      severity,
      asilLevel: detectASIL(allText),
      parentIds,
      childIds: [],
      evidenceRefs: evidenceText ? [evidenceText] : [],
      isOpenIssue: isOpenIssue(allText, status),
      hasFailedVerification: hasFailedVerification(allText),
      isUnverifiedRequirement: isUnverifiedRequirement(allText, status),
      depth: (nodeId.match(/\./g) || []).length + 1,
      rawText: allText,
    });
  }

  return nodes;
}

// ============================================================
// メインパース関数
// ============================================================

export function parseGSN(text: string): ParsedGSN {
  const nodes = new Map<string, GSNNode>();

  // 1. テーブルセクションからノードを抽出
  const tableNodes = parseTableRows(text);
  for (const node of tableNodes) {
    if (!nodes.has(node.id)) {
      nodes.set(node.id, node);
    }
  }

  // 2. ツリー表現からノードIDを補完（テーブルに登録されていないもの）
  const treePattern = /([GSCgscSn][n\d]+(?:\.\d+)*)\s*\[(Goal|Sub-Goal|Strategy|Context|Assumption|Solution\/Evidence|Solution|Evidence|Undeveloped)\]/gi;
  let match;
  while ((match = treePattern.exec(text)) !== null) {
    const id = match[1];

    // 説明テキストを近傍から取得
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const lineEnd = text.indexOf('\n', match.index);
    const line = text.slice(lineStart, lineEnd > 0 ? lineEnd : undefined);

    // 同じ行で説明を探し、見つからない場合は次の行も確認（G0 [Goal] の次行に説明がある場合等）
    let descMatch = line.match(/「([^」]+)」/);
    if (!descMatch && lineEnd > 0) {
      const nextLineEnd = text.indexOf('\n', lineEnd + 1);
      const nextLine = text.slice(lineEnd + 1, nextLineEnd > 0 ? nextLineEnd : undefined);
      descMatch = nextLine.match(/「([^」]+)」/);
    }
    const description = descMatch ? descMatch[1] : '';

    // テーブルに登録済みでdescriptionが空の場合はツリーの説明で補完
    if (nodes.has(id)) {
      const existing = nodes.get(id)!;
      if (!existing.description && description) {
        existing.description = description;
      }
      continue;
    }

    nodes.set(id, {
      id,
      type: detectNodeType(id, match[2]),
      description,
      status: 'unknown',
      severity: 'unknown',
      parentIds: [],
      childIds: [],
      evidenceRefs: [],
      isOpenIssue: false,
      hasFailedVerification: false,
      isUnverifiedRequirement: false,
      depth: (id.match(/\./g) || []).length + 1,
    });
  }

  // 3. 未解決事項セクションからopen issueを補完
  const openIssueSection = text.match(/未解決事項[\s\S]{0,2000}/);
  if (openIssueSection) {
    const issuePattern = /([GSCgscSn][n\d]+(?:\.\d+)*)/g;
    while ((match = issuePattern.exec(openIssueSection[0])) !== null) {
      const id = match[1];
      const node = nodes.get(id);
      if (node) {
        node.isOpenIssue = true;
        if (node.status === 'unknown' || node.status === 'achieved') {
          node.status = 'partial';
        }
      }
    }
  }

  // 4. 高severity情報をhazard analysisテキストから補完
  const hazardPattern = /H-\d+[\s\S]{0,300}?(?=H-\d+|$)/g;
  while ((match = hazardPattern.exec(text)) !== null) {
    const hazardText = match[0];
    const severity = detectSeverity(hazardText);
    if (severity === 'high' || severity === 'critical') {
      // 関連するGoalノードにseverityを反映
      const nodeRefs = hazardText.match(/[GSCgsc]\d+(\.\d+)*/g);
      if (nodeRefs) {
        for (const ref of nodeRefs) {
          const node = nodes.get(ref);
          if (node && (node.severity === 'unknown' || node.severity === 'low')) {
            node.severity = severity;
          }
        }
      }
    }
  }

  // 5〜8. 親子関係・型別インデックス・ルート判定・全体ステータスの構築
  return buildParsedGSN(Array.from(nodes.values()));
}

// ============================================================
// ノード配列からのParsedGSN構築（親子関係・インデックス・全体ステータス）
//
// テキストパース結果（上のparseGSN）とフォーム編集結果（GSNStructureEditor）の
// 両方から共通で使う。childIdsとparentIdsの整合性はここで作り直すため、
// 渡されたノードのchildIdsは無視して良い（parentIdsのみが信頼できる入力）。
// ============================================================

export function buildParsedGSN(nodeList: GSNNode[]): ParsedGSN {
  const nodes = new Map<string, GSNNode>();
  const nodesByType = new Map<GSNNodeType, GSNNode[]>();

  // 0. childIdsをリセットしてMapに登録（parentIdsのみを信頼できる入力として扱う）
  for (const node of nodeList) {
    nodes.set(node.id, { ...node, childIds: [] });
  }

  // 1. 親子関係からchildIdsを更新
  for (const [, node] of nodes) {
    for (const parentId of node.parentIds) {
      const parent = nodes.get(parentId);
      if (parent && !parent.childIds.includes(node.id)) {
        parent.childIds.push(node.id);
      }
    }
  }

  // 2. 型別インデックスを構築
  for (const [, node] of nodes) {
    const list = nodesByType.get(node.type) || [];
    list.push(node);
    nodesByType.set(node.type, list);
  }

  // 3. ルートノード（親がいない）を特定
  const rootNodeIds: string[] = [];
  for (const [id, node] of nodes) {
    if (node.parentIds.length === 0) {
      rootNodeIds.push(id);
    }
  }

  // 4. 全体ステータスを計算（ルートノードのステータスから）
  let overallStatus: GSNNode['status'] = 'unknown';
  if (rootNodeIds.length > 0) {
    const rootStatuses = rootNodeIds.map(id => nodes.get(id)?.status || 'unknown');
    if (rootStatuses.every(s => s === 'achieved')) overallStatus = 'achieved';
    else if (rootStatuses.some(s => s === 'unachieved')) overallStatus = 'unachieved';
    else overallStatus = 'partial';
  }

  return { nodes, rootNodeIds, nodesByType, overallStatus };
}
