// src/lib/restructure-prompts.ts
// 2パス目（アウトライン再構成）用プロンプト
//
// 【背景】
// GSNファイルがある場合、1パス目のレポートはGSNノード（hicase/GSNビュー）由来の
// アウトラインで生成される。これは安全論証の構造を忠実に反映する反面、
// 「エグゼクティブサマリー → 現状分析 → リスク評価 → 推奨事項」のような
// ステークホルダー向けの読みやすい構成にはなっていない。
//
// そこで1パス目の出力（ドラフト）をLLMに再入力し、
// ステークホルダーに設定されたレポート構成（report-structures.ts のテンプレート）へ
// 再編成する。これはあくまで「再編成」であり、新しい事実の追加は禁止する。
//
// 日本語版・英語版はコードベースの方針に従い並列に保守する（翻訳レイヤーではない）。

import { Stakeholder } from '../types';
import { RequiredSectionPlacement, formatRequiredPlacementsForPrompt } from './stakeholder-requirements';

export interface RestructureParams {
  /** 1パス目で生成されたGSNノード由来アウトラインのレポート本文 */
  draftContent: string;
  stakeholder: Stakeholder;
  /** 再構成先のセクション一覧（reportStructure.sections + gsnSections） */
  targetSections: string[];
  /** 再構成先テンプレートの名称・説明（任意） */
  structureName?: string;
  structureDescription?: string;
  /** Mandatory Safety Core がドラフトに含まれるか */
  hasMandatoryCore?: boolean;
  /**
   * ステークホルダー必須内容の配置先（stakeholder-requirements.ts の
   * mapRequiredSectionsToTemplate() の結果）。
   * 1パス目では独立見出しとして書かせているが、2パス目では新しい見出しを作らず
   * targetSections の既存見出しの本文へ取り込ませる。
   */
  requiredPlacements?: RequiredSectionPlacement[];
}

// ============================================================================
// 共通ユーティリティ
// ============================================================================

/**
 * 目標構成のセクション一覧を番号付きで整形する。
 * 既に "1." / "1.1" 等の採番を含む見出しはそのまま使い、二重採番を避ける。
 */
function formatTargetSections(sections: string[]): string {
  return sections
    .map((section, index) =>
      /^\d+(\.\d+)*\s/.test(section) ? `\n${section}` : `\n${index + 1}. ${section}`
    )
    .join('');
}

// ============================================================================
// 日本語版
// ============================================================================

export function generateRestructureSystemPrompt(): string {
  return `あなたは安全性レポート（Safety Status Report）の編集者です。

すでに完成しているレポートのドラフトを、指定された読者向けのレポート構成へ**再編成**することがあなたの唯一の仕事です。
あなたは執筆者ではなく編集者であり、ドラフトに書かれていない事実を新たに作り出す権限を持ちません。

SSRの本質: SSRは単なる情報の列挙ではなく「安全論証文書」です。再編成後も「なぜ安全と言えるのか」という論証の連鎖が読み取れる状態を維持してください。

言語: 出力は必ず日本語で作成してください。`;
}

export function buildRestructurePrompt(params: RestructureParams): string {
  const {
    draftContent,
    stakeholder,
    targetSections,
    structureName,
    structureDescription,
    hasMandatoryCore = false,
    requiredPlacements = [],
  } = params;

  const sectionsFormatted = formatTargetSections(targetSections);
  const concerns = stakeholder.concerns?.length
    ? stakeholder.concerns.map(c => `- ${c}`).join('\n')
    : '- （特に指定なし）';

  const requiredSectionRule = requiredPlacements.length > 0
    ? `
## 読者固有の必須記述内容（既存セクション内に配置・省略絶対禁止）
以下は、この読者が判断を下すために不可欠な記述である。ドラフト（1パス目）には対応する記述が含まれている。
**これらのために新しいセクションを作ってはならない。下記で指定した既存セクションの本文の中に必ず書くこと**:

${formatRequiredPlacementsForPrompt(requiredPlacements, 'ja')}

- 指定セクション内では、必要に応じて \`###\` の小見出し（例: \`### 3.2 残存リスクと受容判断\`）を立ててよいが、
  「再構成後のレポート構成」に無い \`##\` セクションを新設してはならない
- ドラフト内の該当記述が複数箇所に分散している場合は、指定されたセクションに集約すること
- ドラフトに該当する記述が見つからない項目は、「本レポートの範囲では確認できない」旨を1文で記すにとどめ、**独自に判断・数値・提案を創作してはならない**
- 分量調整のためにこれらの記述を削除してはならない
`
    : '';

  const mandatoryCoreRule = hasMandatoryCore
    ? `
## Mandatory Safety Core（最優先・省略絶対禁止）
ドラフト中で以下に該当する記述は、役職や構成の都合にかかわらず**必ず再構成後のレポートにも残すこと**:
- 高severityハザード、ASIL-C/D 相当の項目
- 未検証・未達成の要求、検証失敗の記録
- 未解決の課題（オープンイシュー）、成立が確認できていない前提（Assumption）
- 「[Mandatory Core]」「未完成の証拠連鎖」「強制開放」等の注記が付いていた内容

これらは要約してもよいが、**事実・件数・深刻度を弱めたり、丸めて消したりしてはならない**。
該当する記述が複数セクションに分散する場合は、リスク・課題を扱うセクションに集約してよい。
`
    : '';

  return `# タスク: レポートのアウトライン再構成

以下に、GSN（Goal Structuring Notation）の論証構造に沿って生成されたSSRのドラフトがあります。
このドラフトの**内容はそのまま活かしたまま**、読者向けに設定された下記のレポート構成へ再編成してください。

## 絶対規則（最重要・厳守）

### 1. 新しい情報を作らない
- ドラフトに書かれていない事実・数値・日付・固有名詞・ID・評価・結論を**一切追加してはならない**
- ドラフトの記述から推測・敷衍した内容（原因の推定、将来予測、未記載の対策提案など）を書いてはならない
- ドラフトに記載のない情報が構成上求められる場合は、その旨（例: 「本ドラフトの範囲では該当する記録は確認できない」）を1文で記すにとどめること
- 数値・ハザードID（H-001等）・要求ID（SR-101等）・GSNノードID（G1, S2, Sn3等）・日付は**ドラフトの表記を一字一句そのまま**転記すること

### 2. 情報を落とさない
- ドラフトの実質的な情報は、いずれかのセクションに必ず配置すること
- 分量調整のための要約・圧縮は許可するが、**リスク・未達成事項・未解決課題・検証失敗の記述を削除してはならない**
- ドラフトに含まれる表・図表・箇条書きは、可能な限りそのままの形で適切なセクションへ移設すること（表のセルの値を書き換えないこと）

### 3. 構成は下記の指定に厳密に従う
- 下記「再構成後のレポート構成」に記載されたセクションのみを作成すること
- セクションの順序を入れ替えないこと、章番号は下記の番号に厳密に従うこと
- ドラフト側の見出し（GSNノード由来の章立て）を、そのまま章として転記してはならない。ドラフトの章立ては**情報源であって構成の指定ではない**
- 一覧にないセクション（トレーサビリティ分析、参考文献一覧、まとめ・結論 等）を独自に追加してはならない
- ただし「付録」は、略語一覧・用語集など読者の理解を補助する情報がドラフト内にある場合に限り、最終章の後に1つだけ追加してよい
${mandatoryCoreRule}${requiredSectionRule}
## 読者（ステークホルダー）
- 役職: ${stakeholder.role}
- 主要な関心事:
${concerns}

再編成にあたっては、この読者の関心事に直結する情報を各セクションの冒頭に配置し、
関心の薄い技術的詳細は後方のセクションまたは箇条書きへ集約すること。
ただし「関心が薄い」ことを理由に安全上重要な事実（上記Mandatory Safety Core相当）を省略してはならない。

## 再構成後のレポート構成${structureName ? `（${structureName}）` : ''}
以下の構成でレポートを再構成してください：
${sectionsFormatted}${structureDescription ? `\n\n構成説明: ${structureDescription.slice(0, 500)}` : ''}

## セクションへの割り当て方針
- 「エグゼクティブサマリー」に相当するセクション: ドラフト全体の結論（安全性の総合的な達成状況、重大リスク、未解決課題の件数）を、ドラフトに記載のある事実のみで3〜6文にまとめること。ここで新しい判断を下さないこと
- 「現状分析」「データ概要」等: ドラフトのGoal/SubGoalセクションの達成状況を統合して記述すること
- 「リスク評価」「リスク詳細分析」等: ドラフトのハザード・未達成事項・検証失敗・未解決の前提を集約すること
- 「推奨事項」「次のステップ」「アクションプラン」等: **ドラフトに明示的に記載されている対応策・残作業・完了予定のみ**を整理すること。ドラフトに対応策の記載がない場合は、未解決である旨を記すにとどめ、独自の提案を創作しないこと
- 「GSN〜」を含むセクション: ドラフトのGSN論証構造（Goal-Strategy-Evidenceの対応関係、ノードIDの参照）を、その構造が読み取れる形で残すこと
- 1つのセクションに割り当て先が定まらない情報は、最も関連の深いセクションの本文中で扱うこと

## 出力形式
- Markdown形式で、レポート本文のみを出力すること
- 見出しは \`## 1. セクション名\` の形式（下位見出しが必要な場合は \`### 1.1 ...\`）
- 見出しは体言止め（名詞句）とし、GSNノードID（G1, S2 等）を見出しに含めないこと。ノードIDへの言及は本文中で行うこと
- 「再構成しました」「以下がレポートです」等の前置き・後書き・メタコメントを一切出力しないこと
- 元ドラフトへの言及（「ドラフトでは〜」等）を本文に含めないこと。完成したレポートとして自然に読める文章にすること

---

## 再構成の対象となるドラフト（このドラフトの内容のみを情報源とすること）

${draftContent}`;
}

// ============================================================================
// 英語版
// ============================================================================

export function generateRestructureSystemPromptEN(): string {
  return `You are an editor of Safety Status Reports (SSR).

Your only task is to **reorganize** an already-completed report draft into a specified reader-facing report structure.
You are an editor, not an author: you have no authority to introduce facts that are not present in the draft.

Nature of an SSR: an SSR is not a mere enumeration of information but a *safety assurance argument*. After reorganization, the chain of reasoning for "why this is safe" must still be traceable.

Language: Write the entire output in English.`;
}

export function buildRestructurePromptEN(params: RestructureParams): string {
  const {
    draftContent,
    stakeholder,
    targetSections,
    structureName,
    structureDescription,
    hasMandatoryCore = false,
    requiredPlacements = [],
  } = params;

  const sectionsFormatted = formatTargetSections(targetSections);
  const concerns = stakeholder.concerns?.length
    ? stakeholder.concerns.map(c => `- ${c}`).join('\n')
    : '- (not specified)';

  const requiredSectionRule = requiredPlacements.length > 0
    ? `
## Reader-specific required content (placed inside existing sections - never omit)
The following material is indispensable for this reader's decisions, and the draft (pass 1) contains it.
**Do not create new sections for it.** Write it inside the existing sections indicated below:

${formatRequiredPlacementsForPrompt(requiredPlacements, 'en')}

- Within the indicated section you may add a \`###\` sub-heading (e.g. \`### 3.2 Residual Risk and Acceptance Decision\`),
  but never introduce a \`##\` section that is not in the target report structure
- Where the relevant statements are scattered across the draft, consolidate them into the indicated section
- For any item the draft does not cover, state in a single sentence that it cannot be confirmed within the scope of this report - **never invent a judgment, figure, or proposal**
- Never delete this material for the sake of length
`
    : '';

  const mandatoryCoreRule = hasMandatoryCore
    ? `
## Mandatory Safety Core (highest priority - never omit)
Any of the following present in the draft **must survive into the restructured report**, regardless of the reader's role or the target structure:
- High-severity hazards and ASIL-C/D level items
- Unverified or unmet requirements, and records of failed verification
- Open issues, and assumptions that have not been confirmed to hold
- Content annotated as "[Mandatory Core]", "incomplete evidence chain", or "force-expanded"

These may be condensed, but you **must not weaken or round away the facts, counts, or severity**.
If such statements are scattered across several sections, you may consolidate them into the risk/issue section.
`
    : '';

  return `# Task: Restructure the report outline

Below is a draft SSR that was generated following the argument structure of a GSN (Goal Structuring Notation) file.
**Preserve its content as-is** while reorganizing it into the reader-facing report structure specified below.

## Absolute rules (highest priority)

### 1. Do not create new information
- **Never add** any fact, number, date, proper noun, ID, assessment, or conclusion that is not in the draft
- Do not write anything inferred or extrapolated from the draft (presumed causes, future projections, countermeasures not documented)
- If the target structure calls for information the draft does not contain, state that in a single sentence (e.g. "no corresponding record is available within the scope of this report") and nothing more
- Copy numbers, hazard IDs (e.g. H-001), requirement IDs (e.g. SR-101), GSN node IDs (G1, S2, Sn3, ...) and dates **verbatim** from the draft

### 2. Do not lose information
- Every substantive piece of information in the draft must land in one of the sections
- Condensing for length is allowed, but you **must not delete** statements about risks, unmet items, open issues, or failed verification
- Move tables, figures, and lists from the draft into the appropriate section as intact as possible (never alter the values in table cells)

### 3. Follow the specified structure strictly
- Produce only the sections listed under "Target report structure" below
- Do not reorder sections; follow the numbering exactly as given
- Do not carry over the draft's own headings (the GSN-node-derived chapters) as chapters. The draft's outline is **a source of information, not a specification of structure**
- Do not invent sections that are not listed (traceability analysis, references, conclusion, etc.)
- One "Appendix" may be added after the final chapter, and only if the draft contains supporting material such as an abbreviation list or glossary
${mandatoryCoreRule}${requiredSectionRule}
## Reader (stakeholder)
- Role: ${stakeholder.role}
- Primary concerns:
${concerns}

Place the information that speaks directly to these concerns at the beginning of each section, and consolidate less relevant technical detail into later sections or bullet lists.
However, low relevance is never a reason to omit safety-critical facts (see Mandatory Safety Core above).

## Target report structure${structureName ? ` (${structureName})` : ''}
Reorganize the report into the following structure:
${sectionsFormatted}${structureDescription ? `\n\nStructure description: ${structureDescription.slice(0, 500)}` : ''}

## How to map content into sections
- "Executive Summary" type section: summarize the draft's overall conclusions (overall safety achievement status, critical risks, number of open issues) in 3-6 sentences, using only facts stated in the draft. Do not introduce new judgments here
- "Current State Analysis" / "Data Overview" type sections: consolidate the achievement status from the draft's Goal/SubGoal sections
- "Risk Assessment" / "Detailed Risk Analysis" type sections: gather hazards, unmet items, failed verifications, and unresolved assumptions from the draft
- "Recommendations" / "Next Steps" / "Action Plan" type sections: organize **only the countermeasures, remaining work, and target dates explicitly stated in the draft**. Where the draft records no countermeasure, simply state that the item is unresolved - do not invent proposals
- Sections containing "GSN": retain the draft's GSN argument structure (Goal-Strategy-Evidence relationships, node ID references) in a form where that structure remains legible
- Information that fits no single section should be handled within the body of the most closely related section

## Output format
- Output the report body only, in Markdown
- Headings in the form \`## 1. Section Name\` (use \`### 1.1 ...\` for sub-headings where needed)
- Use noun-phrase headings, and do not put GSN node IDs (G1, S2, ...) in headings; refer to node IDs in the body text instead
- Do not output any preamble, postscript, or meta-commentary ("Here is the restructured report", etc.)
- Do not refer to the draft itself ("the draft states that ...") - the output must read as a finished report

---

## Draft to be restructured (use it as the sole source of information)

${draftContent}`;
}
