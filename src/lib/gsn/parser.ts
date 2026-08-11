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

// ============================================================
// ノードID
// ============================================================

// GSNの方言差を吸収するためのID接頭辞。
// 正規表現の交替は先頭一致なので、長い接頭辞（Sn, Sol, SG...）を必ず先に置くこと。
// ここを短い順にすると "Sn1" が "S" + "n1" として誤読される。
const NODE_ID_PREFIX = 'SG|Sn|Sol|St|Cx|As|Ev|Un|G|S|C|A|J|E|U';
const NODE_ID_BODY = `(?:${NODE_ID_PREFIX})\\d+(?:\\.\\d+)*`;

// 標準GSNノードIDパターン（例: G0, G1.1, S1, Sn01, C0, A0, J1, E1, U1）
// テーブル抽出・フォーム編集・シリアライズで共通利用する
export const GSN_NODE_ID_PATTERN = new RegExp(`^${NODE_ID_BODY}$`, 'i');

// 自由テキスト中のID参照用。lookbehindはSafari 16.3以前で構文エラーになるため、
// 直前の1文字を捕捉グループで消費する形にしている（IDは常にグループ2）。
const NODE_ID_REFERENCE = new RegExp(`(^|[^\\w.])(${NODE_ID_BODY})(?![\\w])`, 'gi');

// セル先頭のノードID（**G1** のようなMarkdown装飾を除去したうえで判定する）
const NODE_ID_AT_START = new RegExp(`^${NODE_ID_BODY}(?![\\w])`, 'i');

/** 自由テキストからノードID参照をすべて拾う */
function findNodeIdReferences(text: string): string[] {
  const ids: string[] = [];
  NODE_ID_REFERENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NODE_ID_REFERENCE.exec(text)) !== null) {
    ids.push(m[2]);
  }
  return ids;
}

/** セルの装飾（**G1**、`G1`）を除いた先頭のノードIDを取り出す */
function extractNodeId(cell: string): string | null {
  const cleaned = cell.replace(/[*`_~【】]/g, '').trim();
  const m = cleaned.match(NODE_ID_AT_START);
  return m ? m[0] : null;
}

// ============================================================
// ノード種別判定
// ============================================================

// 種別ヒント（テーブルの「種別」列、ツリー記法の [Goal] 等、直前の見出し）の判定規則。
// 「前提条件」(Context) を「前提」(Assumption) より先に、
// 「サブゴール」を「ゴール」より先に判定する必要があるため順序が意味を持つ。
const TYPE_HINT_RULES: { re: RegExp; type: GSNNodeType }[] = [
  { re: /sub[-\s]?goal|サブゴール|下位目標|子ゴール/i, type: 'SubGoal' },
  { re: /strategy|戦略|方略|論証戦略/i, type: 'Strategy' },
  { re: /context|コンテキスト|文脈|前提条件|背景/i, type: 'Context' },
  { re: /assumption|仮定|前提|想定/i, type: 'Assumption' },
  { re: /justification|正当化|理由付け/i, type: 'Justification' },
  { re: /undeveloped|未展開|未詳細化|未実装/i, type: 'Undeveloped' },
  { re: /solution|evidence|エビデンス|証拠|解決策|裏付け/i, type: 'Solution' },
  { re: /goal|ゴール|目標|主張|claim/i, type: 'Goal' },
];

// IDの接頭辞からの判定（長い接頭辞を先に評価する）
const ID_PREFIX_RULES: { re: RegExp; type: GSNNodeType }[] = [
  { re: /^SG\d/i, type: 'SubGoal' },
  { re: /^(?:Sn|Sol)\d/i, type: 'Solution' },
  { re: /^St\d/i, type: 'Strategy' },
  { re: /^Cx\d/i, type: 'Context' },
  { re: /^As\d/i, type: 'Assumption' },
  { re: /^Ev\d/i, type: 'Evidence' },
  { re: /^Un\d/i, type: 'Undeveloped' },
  { re: /^G\d+\./i, type: 'SubGoal' },
  { re: /^G\d/i, type: 'Goal' },
  { re: /^S\d/i, type: 'Strategy' },
  { re: /^C\d/i, type: 'Context' },
  { re: /^A\d/i, type: 'Assumption' },
  { re: /^J\d/i, type: 'Justification' },
  { re: /^E\d/i, type: 'Evidence' },
  { re: /^U\d/i, type: 'Undeveloped' },
];

/** 種別ヒントがGSNのノード種別を名指ししているか（見出しを種別ヒントに使う際の判定） */
function looksLikeTypeHint(text: string): boolean {
  return TYPE_HINT_RULES.some(r => r.re.test(text));
}

function detectNodeType(nodeId: string, typeHint?: string): GSNNodeType {
  const hint = (typeHint || '').trim();

  if (hint) {
    for (const rule of TYPE_HINT_RULES) {
      if (!rule.re.test(hint)) continue;
      // ヒントが Goal でもIDがドット付き（G1.1）ならSubGoalとして扱う
      if (rule.type === 'Goal' && nodeId.includes('.')) return 'SubGoal';
      // 「Evidence」ヒントは通常Solutionノードだが、IDがE/Ev接頭辞なら独立したEvidence種別
      if (rule.type === 'Solution' && /^Ev?\d/i.test(nodeId)) return 'Evidence';
      return rule.type;
    }
  }

  for (const rule of ID_PREFIX_RULES) {
    if (rule.re.test(nodeId)) return rule.type;
  }

  return 'Goal';
}

// ============================================================
// ステータス・severity・フラグ判定
// ============================================================

// 「未達成」は「達成」を含み、「部分達成」も「達成」を含むため、
// 否定 → 部分 → 肯定 の順に判定する（順序を入れ替えると誤判定する）。
const STATUS_UNACHIEVED = /未達成|不達成|未実施|未着手|不合格|無効|棄却|失敗|not\s+achieved|unachieved|not\s+met|invalid|rejected|\bfail(?:ed|s)?\b/i;
const STATUS_PARTIAL = /部分達成|部分的|一部|未完了|未検証|進行中|実施中|検証中|検討中|対策中|暫定|保留|partial|in\s*progress|ongoing|pending|tbd/i;
const STATUS_ACHIEVED = /達成済?|完了|有効|十分|妥当|確認済|合格|achieved|complete|completed|satisfied|sufficient|valid|passed?\b|\bok\b/i;

function detectStatus(text: string): GSNNodeStatus {
  const t = (text || '').trim();
  if (!t) return 'unknown';
  if (STATUS_UNACHIEVED.test(t)) return 'unachieved';
  if (STATUS_PARTIAL.test(t)) return 'partial';
  if (STATUS_ACHIEVED.test(t)) return 'achieved';
  return 'unknown';
}

// severity判定は2段構え。
// - loose: 「severity」「リスク」等の専用列やハザード記述など、値そのものが重大度である文脈で使う
// - strict: ノードの全文（説明文を含む）に対して使う。"high-level" "critical path" のような
//           一般的な語の混入でMandatory Safety Coreが汚染されるのを防ぐため、
//           重大度を名指ししているマーカー付きの表現しか拾わない
const SEVERITY_LOOSE_RULES: { re: RegExp; severity: RiskSeverity }[] = [
  { re: /critical|catastrophic|致命的?|破局的?|甚大/i, severity: 'critical' },
  { re: /serious|severe|\bhigh\b|重大|危機的|深刻/i, severity: 'high' },
  { re: /medium|moderate|marginal|中程度|\b中\b/i, severity: 'medium' },
  { re: /\blow\b|negligible|minor|軽微|軽度/i, severity: 'low' },
];

// 「Severity: High」「重大度=中」「[Severity:Critical]」のように重大度を明示している表現
const SEVERITY_MARKER =
  /(?:severity|criticality|重大度|深刻度|危険度|リスク\s*レベル|risk\s*level)\s*[:：=＝]?\s*([^\s,、。|\]]+)/i;

function detectSeverityLoose(text: string): RiskSeverity {
  const t = text || '';
  for (const rule of SEVERITY_LOOSE_RULES) {
    if (rule.re.test(t)) return rule.severity;
  }
  return 'unknown';
}

function detectSeverityStrict(text: string): RiskSeverity {
  const t = text || '';

  const marker = t.match(SEVERITY_MARKER);
  if (marker) {
    const fromMarker = detectSeverityLoose(marker[1]);
    if (fromMarker !== 'unknown') return fromMarker;
  }

  // ASIL-D/C は最高リスク相当として扱う（従来動作を維持）
  if (/ASIL[-\s]?[CD]\b/i.test(t)) return 'high';

  // 一般語と紛れにくい重大度語彙のみ（ISO 26262 / MIL-STD-882 の分類語）
  if (/catastrophic|致命的|破局的/i.test(t)) return 'critical';
  if (/重大|危機的|深刻/i.test(t)) return 'high';
  if (/中程度/i.test(t)) return 'medium';
  if (/negligible|軽微|軽度/i.test(t)) return 'low';

  return 'unknown';
}

function detectASIL(text: string): string | undefined {
  const m = text.match(/ASIL[-\s]?([A-D]|QM)\b/i);
  return m ? `ASIL-${m[1].toUpperCase()}` : undefined;
}

// 「open」単体は "open loop" 等に誤反応するため、open issue/item のような複合語だけを見る
const OPEN_ISSUE_KEYWORDS =
  /未解決|要対応|要検討|対応中|対策中|検討中|未完了|未実施|未着手|未検証|残課題|課題あり|保留|open\s*(?:issue|item|point|action)|unresolved|outstanding|action\s+required|\btbd\b|\btodo\b/i;

/**
 * open issue 判定。
 *
 * 旧実装は `status !== 'achieved'` を条件にしていたため、達成状況列を持たない
 * Context/Strategy/Solution が軒並み open issue になり Mandatory Safety Core が
 * 埋め尽くされていた。ステータスが unknown（＝情報が無いだけ）のノードは
 * open issue とみなさない。
 */
function isOpenIssue(text: string, status: GSNNodeStatus): boolean {
  if (OPEN_ISSUE_KEYWORDS.test(text)) return true;
  return status === 'partial' || status === 'unachieved';
}

// 「ng」の部分一致は engineering / warning / testing 等に反応するため単語境界で判定する。
// 「failure」（故障モードの説明語）も検証失敗とは限らないので対象外にしている。
const FAILED_VERIFICATION_KEYWORDS =
  /不合格|検証失敗|試験失敗|テスト失敗|未合格|verification\s+failed|test\s+failed|\bfailed\b|(?:^|[^a-z0-9])ng(?![a-z0-9])/i;

function hasFailedVerification(text: string): boolean {
  return FAILED_VERIFICATION_KEYWORDS.test(text || '');
}

function isUnverifiedRequirement(text: string, status: GSNNodeStatus): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes('requirement') || t.includes('安全要件') || t.includes('安全要求') ||
      t.includes('要件') || t.includes('要求')) &&
    (status === 'partial' || status === 'unachieved' ||
      t.includes('未検証') || t.includes('未完了') || t.includes('unverified'))
  );
}

// フロントエンドのGSNStructureEditorが「内容」セルへ埋め込むタグ
// （severity/ASIL/open issue/検証失敗）と空セル用の目印「-」を、
// 表示・生成に使うdescriptionから取り除く（キーワード検出には生テキストのまま使う）
const EDITOR_TAG_PATTERN = /\s*\[(?:Severity:(?:Critical|High|Medium|Low)|ASIL-(?:QM|[A-D])|未解決|検証失敗)\]/gi;

// 値なしを表すセル（serialize.tsのEMPTY_CELL_PLACEHOLDERを含む）
const EMPTY_VALUE_PATTERN = /^(?:-+|—|なし|無し|N\/?A|none|null|該当なし)$/i;

function isEmptyValue(text: string): boolean {
  return !text || EMPTY_VALUE_PATTERN.test(text.trim());
}

function cleanDescriptionForDisplay(rawDescription: string): string {
  const stripped = rawDescription.replace(EDITOR_TAG_PATTERN, '').trim();
  return isEmptyValue(stripped) ? '' : stripped;
}

/** 根拠・参照列を個々の参照へ分解する */
function splitReferences(text: string): string[] {
  if (isEmptyValue(text)) return [];
  return text
    .split(/[,、;；\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !isEmptyValue(s));
}

// ============================================================
// Markdownテーブルの解析
// ============================================================

type ColumnKey = 'id' | 'type' | 'parent' | 'severity' | 'status' | 'desc' | 'evidence';

type ColumnMap = Record<ColumnKey, number>;

function emptyColumnMap(): ColumnMap {
  return { id: -1, type: -1, parent: -1, severity: -1, status: -1, desc: -1, evidence: -1 };
}

// 列見出しの判定規則。上から順に、まだ割り当てられていない列へ先着で割り当てる。
// 「id」の部分一致は "Evidence" にも当たってしまうため、ID列だけは語全体で判定する。
const COLUMN_MATCHERS: { key: ColumnKey; re: RegExp }[] = [
  { key: 'id', re: /^(?:ノード\s*id|node\s*id|nodeid|id|ノード|ノード番号|要素id|識別子|no\.?)$|ノード\s*id|node\s*id/i },
  { key: 'type', re: /種別|種類|タイプ|要素型|^type$|node\s*type/i },
  { key: 'parent', re: /親|上位|parent|supported\s*by|supports|接続元|関連ノード/i },
  { key: 'severity', re: /severity|criticality|重大度|深刻度|危険度|リスク|risk|asil/i },
  { key: 'status', re: /達成|状況|状態|ステータス|status|state|有効性|判定|進捗|強度|strength|結果|result/i },
  { key: 'desc', re: /内容|記述|説明|本文|description|content|statement|claim|安全目標|ゴール|テキスト|text/i },
  { key: 'evidence', re: /根拠|証拠|参照|エビデンス|evidence|reference|文書|document|link|備考/i },
];

function resolveColumns(headerCells: string[]): ColumnMap {
  const map = emptyColumnMap();
  const claimed = new Set<number>();

  for (const { key, re } of COLUMN_MATCHERS) {
    const idx = headerCells.findIndex((cell, i) => !claimed.has(i) && re.test(cell));
    if (idx >= 0) {
      map[key] = idx;
      claimed.add(idx);
    }
  }

  return map;
}

/**
 * テーブル行をセルへ分割する。
 *
 * 旧実装は `filter(c => c.length > 0)` で空セルを落としていたため、
 * 途中に空欄がある行は以降の列がすべて1つずつずれて別の列として読まれていた。
 * ここでは前後のパイプだけを外し、空セルを位置ごと保持する。
 */
function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;

  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return body
    .split('|')
    .map(c => c.replace(/<br\s*\/?>/gi, ' ').trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c) || c.length === 0);
}

/**
 * ヘッダー行かどうかを判定する。
 *
 * 旧実装は「セルのどれかが /ID|種別|Type/ に部分一致するか」だけを見ていたため、
 * `| Sn1 | Solution (Evidence) | ... |` のようなデータ行が
 * （"Evidence" に "id" が含まれるので）ヘッダーと誤判定され、行ごと失われていた。
 * 先頭セルがノードIDならデータ行と確定し、ヘッダー候補から除外する。
 */
function detectHeaderColumns(cells: string[]): ColumnMap | null {
  if (cells.length < 2) return null;
  if (extractNodeId(cells[0])) return null;

  const map = resolveColumns(cells);
  const matchedCount = (Object.keys(map) as ColumnKey[]).filter(k => map[k] >= 0).length;

  // 見出し語が1つだけの行は本文の表組みである可能性が高いのでヘッダーとみなさない
  return matchedCount >= 2 ? map : null;
}

/**
 * ヘッダー行が無いテーブル向けに列構成を推定する。
 * （旧実装はヘッダーが見つかるまでの行を丸ごと捨てていた）
 */
function inferColumns(cells: string[]): ColumnMap {
  const map = emptyColumnMap();
  map.id = 0;

  let next = 1;
  if (cells.length > 1 && looksLikeTypeHint(cells[1]) && cells[1].length <= 24) {
    map.type = 1;
    next = 2;
  }
  if (cells.length > next) map.desc = next;

  return map;
}

interface TableParseResult {
  nodes: GSNNode[];
}

function parseTableRows(text: string): TableParseResult {
  const nodes: GSNNode[] = [];
  const lines = text.split('\n');

  let columns: ColumnMap | null = null;
  // 「### Solution/Evidence ノード」のような見出しは、種別列が無い表の種別ヒントになる
  let headingHint = '';

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      headingHint = looksLikeTypeHint(heading[1]) ? heading[1] : '';
      columns = null;
      continue;
    }

    const cells = splitTableRow(line);
    if (!cells) {
      // 空行はテーブルの継続とみなし、本文行が来たらテーブル終了として列構成を破棄する
      if (line.trim().length > 0) columns = null;
      continue;
    }

    if (isSeparatorRow(cells)) continue;

    const header = detectHeaderColumns(cells);
    if (header) {
      columns = header;
      continue;
    }

    const map = columns ?? inferColumns(cells);

    const cell = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : '');

    const nodeId = extractNodeId(cell(map.id >= 0 ? map.id : 0));
    if (!nodeId || !GSN_NODE_ID_PATTERN.test(nodeId)) continue;

    const typeHint = cell(map.type) || headingHint;
    const descriptionRaw = cell(map.desc);
    const statusText = cell(map.status);
    const severityText = cell(map.severity);
    const parentText = cell(map.parent);
    const evidenceText = cell(map.evidence);

    // キーワード検出は行の全セルを対象にする。列マッピングに載らない列
    // （ASIL列・備考列など）にも severity / ASIL / 未解決の情報が入るため。
    const allText = [typeHint, ...cells].filter(t => t.length > 0).join(' ');

    // 達成状況列がある行では、その列が空でも説明文から状態を推測しない
    // （「対策中の項目を含む」のような説明文で誤ってpartialにしないため）。
    const status = detectStatus(map.status >= 0 ? statusText : descriptionRaw);

    // 専用のseverity/リスク列がある場合はその値をそのまま重大度として読む。
    // 無い場合は説明文全体から「重大度を名指ししている表現」だけを拾う。
    const severity = severityText
      ? (detectSeverityLoose(severityText) !== 'unknown'
          ? detectSeverityLoose(severityText)
          : detectSeverityStrict(allText))
      : detectSeverityStrict(allText);

    const description = cleanDescriptionForDisplay(descriptionRaw);

    // 親ノードID抽出（"Sn1"のような2文字接頭辞を切り詰めないこと）
    const parentIds = isEmptyValue(parentText)
      ? []
      : Array.from(new Set(findNodeIdReferences(parentText))).filter(pid => pid !== nodeId);

    nodes.push({
      id: nodeId,
      type: detectNodeType(nodeId, typeHint),
      description,
      status,
      severity,
      asilLevel: detectASIL(allText),
      parentIds,
      childIds: [],
      evidenceRefs: splitReferences(evidenceText),
      isOpenIssue: isOpenIssue(allText, status),
      hasFailedVerification: hasFailedVerification(allText),
      isUnverifiedRequirement: isUnverifiedRequirement(allText, status),
      depth: (nodeId.match(/\./g) || []).length + 1,
      rawText: allText,
    });
  }

  return { nodes };
}

// ============================================================
// ツリー記法（罫線・インデント）の解析
//
// 旧実装は `G1 [Goal]` のようなIDと種別を拾うだけで、インデントが表している
// 親子関係を一切使っていなかった。そのためツリー図しか持たないGSN文書は
// 完全にフラットな構造として解釈されていた。
// ============================================================

// 罫線・箇条書き記号など、ID手前に現れうる文字
const TREE_PREFIX_CHARS = '[\\s│┃┆┊├└┌┐┬┴┼┤─━╌╎▏|.*•·◦+>＞-]*';
const TREE_LINE_PATTERN = new RegExp(
  `^(${TREE_PREFIX_CHARS})(${NODE_ID_BODY})(?![\\w])\\s*(?:[\\[【]([^\\]】]{1,40})[\\]】])?\\s*(.*)$`,
  'i'
);
const BOX_DRAWING_PATTERN = /[│┃┆┊├└┌┐┬┴┼┤─━╌╎▏]/;
const REFERENCE_LINE_PATTERN =
  /^[\s│┃├└┌┬┼─━.*•·+>-]*(?:参照|参考|出典|根拠|エビデンス|証拠|reference|ref|evidence|source)\s*[:：]\s*(.+?)\s*$/i;

interface TreeLineHit {
  id: string;
  typeHint: string;
  rest: string;
  indent: number;
  lineIndex: number;
  /** 種別ブラケット付き、または罫線プレフィックス付き＝ツリー行だと確信できる */
  strong: boolean;
}

function collectTreeLineHits(lines: string[]): TreeLineHit[] {
  const hits: TreeLineHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|')) continue; // テーブル行はここでは扱わない
    if (/^#{1,6}\s/.test(line)) continue;

    const m = line.match(TREE_LINE_PATTERN);
    if (!m) continue;

    const prefix = m[1];
    hits.push({
      id: m[2],
      typeHint: (m[3] || '').trim(),
      rest: (m[4] || '').trim(),
      indent: prefix.length,
      lineIndex: i,
      strong: Boolean(m[3]) || BOX_DRAWING_PATTERN.test(prefix),
    });
  }

  return hits;
}

/**
 * ツリー行候補を採用するか決める。
 *
 * 種別ブラケットや罫線があるものは単独で採用する。
 * それ以外（`- G1 …` のような素の箇条書き）は、インデントの深さが2段階以上ある
 * 3行以上の連続ブロックを成している場合に限り採用する。
 * こうしないと「1. G1.2達成に向けて…」のような本文の言及まで階層として読んでしまう。
 */
function selectTreeLines(hits: TreeLineHit[]): TreeLineHit[] {
  const selected: TreeLineHit[] = [];

  let blockStart = 0;
  for (let i = 0; i <= hits.length; i++) {
    const isBreak = i === hits.length || (i > 0 && hits[i].lineIndex - hits[i - 1].lineIndex > 3);
    if (!isBreak) continue;

    const block = hits.slice(blockStart, i);
    blockStart = i;
    if (block.length === 0) continue;

    const indents = new Set(block.map(h => h.indent));
    const blockQualifies = block.length >= 3 && indents.size >= 2;

    for (const hit of block) {
      if (hit.strong || blockQualifies) selected.push(hit);
    }
  }

  return selected;
}

interface TreeNodeInfo {
  id: string;
  typeHint: string;
  description: string;
  parentId: string | null;
  evidenceRefs: string[];
}

/** 「…」/ "…" で囲まれた説明、無ければ行の残りをそのまま説明として使う */
function extractTreeDescription(rest: string): string {
  const quoted = rest.match(/[「『"“]([^」』"”]+)[」』"”]/);
  if (quoted) return quoted[1].trim();
  const plain = rest.replace(/^[:：\-–—\s]+/, '').trim();
  return isEmptyValue(plain) ? '' : plain;
}

function parseTreeStructure(text: string): TreeNodeInfo[] {
  const lines = text.split('\n');
  const selected = selectTreeLines(collectTreeLineHits(lines));
  if (selected.length === 0) return [];

  const selectedLineIndexes = new Set(selected.map(h => h.lineIndex));
  const results: TreeNodeInfo[] = [];
  const stack: { id: string; indent: number }[] = [];
  let previousLineIndex = -1;

  for (const hit of selected) {
    // 離れた位置の別ブロックは独立したツリーとして扱う（階層を引き継がない）
    if (previousLineIndex >= 0 && hit.lineIndex - previousLineIndex > 3) stack.length = 0;
    previousLineIndex = hit.lineIndex;

    while (stack.length > 0 && stack[stack.length - 1].indent >= hit.indent) stack.pop();
    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
    stack.push({ id: hit.id, indent: hit.indent });

    // 説明・参照は同じ行、無ければ次のノード行に当たるまでの後続行から拾う
    let description = extractTreeDescription(hit.rest);
    const evidenceRefs: string[] = [];

    // 説明・参照の探索は直後の数行だけに限る（ツリーの末尾ノードが
    // コードフェンスや後続の本文を説明として拾ってしまうのを防ぐ）
    const lookaheadEnd = Math.min(lines.length, hit.lineIndex + 5);
    for (let i = hit.lineIndex + 1; i < lookaheadEnd; i++) {
      if (selectedLineIndexes.has(i)) break;
      const following = lines[i];
      if (following.trim().length === 0) continue;
      if (following.trim().startsWith('|') || /^#{1,6}\s/.test(following) || /^\s*(?:```|~~~)/.test(following)) break;

      const ref = following.match(REFERENCE_LINE_PATTERN);
      if (ref) {
        evidenceRefs.push(...splitReferences(ref[1]));
        continue;
      }
      if (!description) {
        const stripped = following.replace(new RegExp(`^${TREE_PREFIX_CHARS}`), '');
        description = extractTreeDescription(stripped);
      }
    }

    results.push({
      id: hit.id,
      typeHint: hit.typeHint,
      description,
      parentId: parentId !== hit.id ? parentId : null,
      evidenceRefs,
    });
  }

  return results;
}

// ============================================================
// 兄弟ノードの並び順
// ============================================================

/** G0 → G1 → G1.1 → G2 の順に並ぶよう、ID中の数値部分を数値として比較する */
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

// 同じ親に付く兄弟ノードの表示順。
//
// childIds はノードの発見順（＝文書中の表の並び順）で積まれるため、
// 「### Context ノード」の表が Strategy の表より後ろにあるだけで、
// G1 の直下に付く C1 が S1 のサブツリー全体の下（＝一番下）に表示されていた。
// GSNでは Context / Assumption / Justification はゴールに付随する注釈で、
// 論証の枝（Strategy → SubGoal → Solution）より前に置くのが慣例なので、
// 文書中の記載順ではなく役割の順に並べ直す。
const SIBLING_TYPE_ORDER: Record<GSNNodeType, number> = {
  Context: 0,
  Assumption: 0,
  Justification: 0,
  Strategy: 1,
  Goal: 2,
  SubGoal: 2,
  Undeveloped: 3,
  Solution: 4,
  Evidence: 4,
};

/** 兄弟ノードを「役割の順 → ID順」で並べる */
function sortSiblingIds(childIds: string[], nodes: Map<string, GSNNode>): string[] {
  const orderOf = (id: string) => {
    const node = nodes.get(id);
    return node ? SIBLING_TYPE_ORDER[node.type] : Number.MAX_SAFE_INTEGER;
  };
  return [...childIds].sort((a, b) => orderOf(a) - orderOf(b) || compareNodeIds(a, b));
}

// ============================================================
// メインパース関数
// ============================================================

/** 同一IDが複数の表・ツリーに現れた場合、情報量の多い方を残す形でマージする */
function mergeNode(existing: GSNNode, incoming: GSNNode): void {
  if (!existing.description && incoming.description) existing.description = incoming.description;
  if (existing.status === 'unknown' && incoming.status !== 'unknown') existing.status = incoming.status;
  if (existing.severity === 'unknown' && incoming.severity !== 'unknown') existing.severity = incoming.severity;
  if (!existing.asilLevel && incoming.asilLevel) existing.asilLevel = incoming.asilLevel;
  if (existing.parentIds.length === 0 && incoming.parentIds.length > 0) {
    existing.parentIds = [...incoming.parentIds];
  }
  for (const ref of incoming.evidenceRefs) {
    if (!existing.evidenceRefs.includes(ref)) existing.evidenceRefs.push(ref);
  }
  existing.isOpenIssue = existing.isOpenIssue || incoming.isOpenIssue;
  existing.hasFailedVerification = existing.hasFailedVerification || incoming.hasFailedVerification;
  existing.isUnverifiedRequirement = existing.isUnverifiedRequirement || incoming.isUnverifiedRequirement;
  if (incoming.rawText) {
    existing.rawText = existing.rawText ? `${existing.rawText} ${incoming.rawText}` : incoming.rawText;
  }
}

export function parseGSN(text: string): ParsedGSN {
  const nodes = new Map<string, GSNNode>();

  // 1. テーブルセクションからノードを抽出（最も情報量が多いので優先）
  for (const node of parseTableRows(text).nodes) {
    const existing = nodes.get(node.id);
    if (existing) mergeNode(existing, node);
    else nodes.set(node.id, node);
  }

  // 2. ツリー記法から構造（親子関係）と不足情報を補完する。
  //    テーブルに明示された親子関係の方が信頼できるため、
  //    親が未設定のノードにのみツリー由来の親を与える。
  for (const treeNode of parseTreeStructure(text)) {
    const existing = nodes.get(treeNode.id);
    if (existing) {
      if (!existing.description && treeNode.description) existing.description = treeNode.description;
      if (existing.parentIds.length === 0 && treeNode.parentId) existing.parentIds = [treeNode.parentId];
      for (const ref of treeNode.evidenceRefs) {
        if (!existing.evidenceRefs.includes(ref)) existing.evidenceRefs.push(ref);
      }
      continue;
    }

    const rawText = [treeNode.id, treeNode.typeHint, treeNode.description].filter(Boolean).join(' ');
    nodes.set(treeNode.id, {
      id: treeNode.id,
      type: detectNodeType(treeNode.id, treeNode.typeHint),
      description: treeNode.description,
      status: 'unknown',
      severity: detectSeverityStrict(rawText),
      asilLevel: detectASIL(rawText),
      parentIds: treeNode.parentId ? [treeNode.parentId] : [],
      childIds: [],
      evidenceRefs: [...treeNode.evidenceRefs],
      isOpenIssue: isOpenIssue(rawText, 'unknown'),
      hasFailedVerification: hasFailedVerification(rawText),
      isUnverifiedRequirement: false,
      depth: (treeNode.id.match(/\./g) || []).length + 1,
      rawText,
    });
  }

  // 3. 未解決事項セクションからopen issueを補完。
  //    旧実装は見出し以降の2000文字を無条件に読んでいたため後続セクションの
  //    ノード言及まで巻き込んでいた。次の見出しまでで区切る。
  const openIssueSection = text.match(
    /(?:未解決事項|未解決課題|残課題|オープンイシュー|open\s+issues?|outstanding\s+issues?)[^\n]*\n([\s\S]{0,3000}?)(?=\n#{1,6}\s|$)/i
  );
  if (openIssueSection) {
    for (const id of findNodeIdReferences(openIssueSection[1])) {
      const node = nodes.get(id);
      if (!node) continue;
      node.isOpenIssue = true;
      // テーブルで明示されたステータスの方が強い根拠なので、unknown のときだけ格下げする
      if (node.status === 'unknown') node.status = 'partial';
    }
  }

  // 4. 高severity情報をhazard analysisテキストから補完
  const hazardPattern = /\b(?:H|HZ|HAZ)-?\d+[\s\S]{0,300}?(?=\b(?:H|HZ|HAZ)-?\d+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = hazardPattern.exec(text)) !== null) {
    const hazardText = match[0];
    const severity = detectSeverityLoose(hazardText);
    if (severity !== 'high' && severity !== 'critical') continue;

    // 関連するノードにseverityを反映
    for (const ref of findNodeIdReferences(hazardText)) {
      const node = nodes.get(ref);
      if (node && (node.severity === 'unknown' || node.severity === 'low')) {
        node.severity = severity;
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

  // 1b. 兄弟ノードの並び順を整える（発見順＝表の並び順に引きずられないようにする）
  for (const [, node] of nodes) {
    node.childIds = sortSiblingIds(node.childIds, nodes);
  }

  // 2. 型別インデックスを構築
  for (const [, node] of nodes) {
    const list = nodesByType.get(node.type) || [];
    list.push(node);
    nodesByType.set(node.type, list);
  }

  // 3. ルートノードを特定。
  //    存在しない親IDだけを参照しているノード（表記ゆれ・記載漏れ）も、
  //    どのツリーからも辿れなくなるとレポートから丸ごと欠落するためルート扱いにする。
  const rootNodeIds: string[] = [];
  for (const [id, node] of nodes) {
    if (node.parentIds.every(pid => !nodes.has(pid))) {
      rootNodeIds.push(id);
    }
  }

  // 4. 親子関係の実際の深さを計算（IDのドット数ではなくツリー上の深さ）
  computeDepths(nodes, rootNodeIds);

  // 5. 全体ステータスを計算（ルートノードのステータスから）
  let overallStatus: GSNNode['status'] = 'unknown';
  if (rootNodeIds.length > 0) {
    const rootStatuses = rootNodeIds.map(id => nodes.get(id)?.status || 'unknown');
    if (rootStatuses.every(s => s === 'achieved')) overallStatus = 'achieved';
    else if (rootStatuses.some(s => s === 'unachieved')) overallStatus = 'unachieved';
    else overallStatus = 'partial';
  }

  return { nodes, rootNodeIds, nodesByType, overallStatus };
}

/** ルートからの幅優先探索で各ノードの深さを決める（循環参照があっても停止する） */
function computeDepths(nodes: Map<string, GSNNode>, rootNodeIds: string[]): void {
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = rootNodeIds.map(id => ({ id, depth: 1 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodes.get(id);
    if (!node) continue;
    node.depth = depth;

    for (const childId of node.childIds) {
      if (!visited.has(childId)) queue.push({ id: childId, depth: depth + 1 });
    }
  }

  // 循環参照のみで構成されるなどして到達できなかったノードはIDのドット数から推定する
  for (const [id, node] of nodes) {
    if (!visited.has(id)) node.depth = (id.match(/\./g) || []).length + 1;
  }
}
