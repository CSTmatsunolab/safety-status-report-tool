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
import { isExecutiveRole } from './report-prompts';
import { HiCaseMandatoryCoreDetail } from './gsn/types';

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
   * hicase の Mandatory Core 圧縮設定（HiCaseStakeholderConfig.mandatoryCoreDetail）。
   * 1パス目と同じ値を渡すこと。'count' / 'one-sentence' の読者では、
   * ドラフトに機序（原因・発生条件・閾値・対策手段の詳細）が残っていても2パス目で転記しない。
   */
  mandatoryCoreDetail?: HiCaseMandatoryCoreDetail;
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
 * 再構成後の分量上限。
 *
 * 1パス目には分量規則（report-prompts.ts の generateOutlineDerivedVolumeRules 等）があるが、
 * 2パス目には従来まったく分量の規定が無く、「情報を落とさない」規則だけが働いていたため、
 * 再編成のたびにドラフトより長くなる（＝読者にとって不要な記述が増える）傾向があった。
 * 再編成は並べ替えであって加筆ではないので、ドラフト長を上限として明示する。
 */
function buildVolumeRule(draftContent: string, executive: boolean, language: 'ja' | 'en'): string {
  const draftLen = draftContent.length;
  const round500 = (n: number) => Math.max(500, Math.round(n / 500) * 500);
  // 経営層は判断に不要な詳細を件数へ圧縮できるため、より強く絞る
  const ratioLo = executive ? 0.6 : 0.8;
  const ratioHi = executive ? 0.8 : 1.0;
  // ドラフトが極端に短い場合（生成失敗・プレースホルダ等）は具体的な文字数目安を出さない。
  // 丸めの影響で "約500〜500文字" のような無意味な指示になるため。
  const showRange = draftLen >= 2000;
  const lo = round500(draftLen * ratioLo);
  // 上限側は切り捨て。切り上げるとドラフト長を超える目安が出て、直上の「超えてはならない」と矛盾する
  const hi = Math.max(lo, Math.max(500, Math.floor((draftLen * ratioHi) / 500) * 500));

  if (language === 'en') {
    const target = showRange
      ? `\n- Target: approx. ${lo}-${hi} characters. Restructuring is a rearrangement of information, not an expansion`
      : '\n- Restructuring is a rearrangement of information, not an expansion';
    return `
## Length (strict)
- The restructured report **must not be longer than the draft** (approx. ${draftLen} characters)${target}
- If you exceed the target, cut by condensing the "may be condensed" material above and by cross-referencing - never by dropping risks, unmet items, open issues, or failed verification
`;
  }

  const target = showRange
    ? `\n- 目安: 約${lo}〜${hi}文字。再編成は情報の並べ替えであり、加筆ではない`
    : '\n- 再編成は情報の並べ替えであり、加筆ではない';

  return `
## 分量（厳守）
- 再構成後のレポートの総文字数は、**ドラフト（約${draftLen}文字）を超えてはならない**${target}
- 目安を超える場合は、上記「圧縮してよい情報」の集約と相互参照によって削減すること。リスク・未達成事項・未解決課題・検証失敗を削って調整してはならない
`;
}

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
    mandatoryCoreDetail = 'full',
    requiredPlacements = [],
  } = params;

  const sectionsFormatted = formatTargetSections(targetSections);
  const executive = isExecutiveRole(stakeholder.role);
  const volumeRule = buildVolumeRule(draftContent, executive, 'ja');
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

  // 1パス目と同じ「結論のみ・機序は書かない」制約を2パス目にも課す。
  // 2パス目は事実の追加を禁止しているが削除は制限しているため、
  // ドラフト側に機序が残っていると素通りする。ここで明示的に転記を禁じる。
  const conclusionOnlyRule =
    mandatoryCoreDetail === 'count' || mandatoryCoreDetail === 'one-sentence'
      ? `
### 記述の深さ（結論のみ・機序は転記しない）
この読者設定では、Mandatory Safety Core の各項目は**結論**のみを残し、**機序**を転記してはならない。

- 残すもの: 項目のID・名称、深刻度／ASIL等級、状態、件数・割合・カバレッジ、期限・完了予定、受容状況と承認主体
- 転記しないもの: 失敗・性能限界の技術的原因、発生条件の内訳（照明・天候・走行状況・個別の試験シナリオ名）、
  技術的な閾値・測定値、対策の技術的手段の詳細、試験手法の説明
- 例: ドラフトに「センサーフュージョンの静止物判定ロジック改修を実施中」とあれば、「対策を実施中（完了予定: ○○）」と書くこと
- 「〜が原因で不合格である」は機序であり、「不合格である」まで縮めること

**この機序の削除は、上記「情報を落とさない」規則の明示的な例外である。**
ただし削れるのは機序の説明だけであり、項目そのもの・件数・深刻度・状態・期限を落としてはならない。
また、機序を削った分を他の記述で埋め合わせてはならない（削った分だけ短くなるのが正しい）。
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
${conclusionOnlyRule}`
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
- **件数からの復元禁止（特に重要）**: ドラフトが件数・割合のみを述べている項目（例:「8件中5件が検証完了」「対策完了率37.5%」）について、
  個々のID・名称・Severity・ASIL・期日・担当者を列挙した表やリストを新たに作ってはならない。ドラフトに個別の記載がない限り、**件数・割合のまま**記述すること
- ドラフトがIDのみを挙げている項目（例:「1件（H-203）が検討中」）について、そのIDの名称・属性・評価・残存リスクを補ってはならない。ドラフトにある語（この例では「検討中」）をそのまま使うこと
- **表を作成する前の確認**: その表の全セルの値がドラフト中に文字列として存在するか1セルずつ確認すること。存在しないセルが1つでもある場合、その表を作ってはならない（該当する列を削るか、表をやめて文章で記述する）

### 2. 情報を落とさない（対象は限定される）
- ドラフトの実質的な情報は、いずれかのセクションに必ず配置すること
- **削除・省略が禁止される情報**: リスク、未達成・未完了の事項、未検証の要求、検証失敗、未解決課題、成立が確認できていない前提。これらは分量調整のためであっても削ってはならない
- **圧縮してよい情報**: 達成済み・合格済み・受容済み・対策完了の項目、および低Severity・低ASILで判断を要しない項目。これらは個別に列挙せず、件数への集約（例:「5件が検証完了」）を優先すること
- ドラフトに含まれる表・図表・箇条書きは、可能な限りそのままの形で適切なセクションへ移設すること（表のセルの値を書き換えないこと）。**ドラフトに無い表を新たに起こすことは禁止する**

### 3. 構成は下記の指定に厳密に従う
- 下記「再構成後のレポート構成」に記載されたセクションのみを作成すること
- セクションの順序を入れ替えないこと、章番号は下記の番号に厳密に従うこと
- ドラフト側の見出し（GSNノード由来の章立て）を、そのまま章として転記してはならない。ドラフトの章立ては**情報源であって構成の指定ではない**
- 一覧にないセクション（トレーサビリティ分析、参考文献一覧、まとめ・結論 等）を独自に追加してはならない
- ただし「付録」は、略語一覧・用語集など読者の理解を補助する情報がドラフト内にある場合に限り、最終章の後に1つだけ追加してよい
- 付録の用語集を引き継ぐ場合、**レポート本文中に実際に出現する語のみ**を残し、本文で使っていない語の行は削除すること

### 4. 同じ事実を繰り返さない
- 同一の事実（ハザードID・要求ID・テストID・担当者名・期限・金額）の詳細は、**最も関連の深い1つのセクションにのみ**記述すること
- 他のセクションから同じ事実に触れる必要がある場合は、詳細を再掲せず「（第X項参照）」と相互参照すること
- エグゼクティブサマリーは例外とし、結論として要点に触れてよい。ただし内訳・担当者名・個別の期限は書かないこと
- 担当者名と作業レベルのタスク割当は、対応策・次のステップを扱う**1つのセクションにのみ**記述すること
- ドラフト側で同じ内容が複数箇所に繰り返されている場合、再構成後は1箇所に統合すること（ドラフトの重複をそのまま持ち越さない）
${volumeRule}${mandatoryCoreRule}${requiredSectionRule}
## 読者（ステークホルダー）
- 役職: ${stakeholder.role}
- 主要な関心事:
${concerns}

再編成にあたっては、この読者の関心事に直結する情報を各セクションの冒頭に配置し、
関心の薄い技術的詳細は後方のセクションまたは箇条書きへ集約すること。
ただし「関心が薄い」ことを理由に安全上重要な事実（上記Mandatory Safety Core相当）を省略してはならない。
${executive ? `
経営層向けの絞り込み（Mandatory Safety Core には適用しない）:
- GSNの管理番号（G/S/Sn/C/A/U）の一覧、規格の条項番号（例: Part 3〜6）、分析手法名（HARA/HAZOP/FTA等）は判断材料にならない。本文の必要箇所での言及にとどめ、一覧表・解説を作らないこと
- 達成済み・合格済み・受容済みの項目、およびSeverityがMedium以下／ASIL-A・Bで対策完了の項目は、件数への集約にとどめること
- 作業レベルのタスク（試験場の確保、担当割当等）は個人名を含めて列挙せず、経営が判断を下す事項と判断期限を優先すること
` : ''}
## 再構成後のレポート構成${structureName ? `（${structureName}）` : ''}
以下の構成でレポートを再構成してください：
${sectionsFormatted}${structureDescription ? `\n\n構成説明: ${structureDescription.slice(0, 500)}` : ''}

## セクションへの割り当て方針
- 「エグゼクティブサマリー」に相当するセクション: ドラフト全体の結論（安全性の総合的な達成状況、重大リスク、未解決課題の件数）を、ドラフトに記載のある事実のみで3〜6文にまとめること。ここで新しい判断を下さないこと
- 「現状分析」「データ概要」等: ドラフトのGoal/SubGoalセクションの達成状況を統合して記述すること
- 「リスク評価」「リスク詳細分析」等: ドラフトのハザード・未達成事項・検証失敗・未解決の前提を集約すること
- 「推奨事項」「次のステップ」「アクションプラン」等: **ドラフトに明示的に記載されている対応策・残作業・完了予定のみ**を整理すること。ドラフトに対応策の記載がない場合は、未解決である旨を記すにとどめ、独自の提案を創作しないこと
- 「GSN〜」を含むセクション: ドラフトのGSN論証構造（Goal-Strategy-Evidenceの対応関係）を、その構造が読み取れる形で残すこと。ノードIDは本文中の必要な箇所でのみ言及し、**全ノードを網羅した一覧表を作ってはならない**${executive ? '。経営層向けでは最上位ゴールと第2階層の主要ゴールの達成状況に限定し、Strategy/Context/Assumption/Justification を行として列挙しないこと' : ''}
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
    mandatoryCoreDetail = 'full',
    requiredPlacements = [],
  } = params;

  const sectionsFormatted = formatTargetSections(targetSections);
  const executive = isExecutiveRole(stakeholder.role);
  const volumeRule = buildVolumeRule(draftContent, executive, 'en');
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

  // Same "conclusions only, no mechanism" constraint as pass 1. Pass 2 forbids adding facts
  // but constrains removal, so mechanism left in the draft otherwise passes straight through.
  const conclusionOnlyRule =
    mandatoryCoreDetail === 'count' || mandatoryCoreDetail === 'one-sentence'
      ? `
### Depth of description (conclusions only - do not carry over the mechanism)
For this reader setting, keep only the **conclusion** of each Mandatory Safety Core item; never carry over the **mechanism**.

- Keep: item ID and name, severity / ASIL level, status, counts, ratios, coverage, deadlines and target dates, acceptance status and who must approve
- Do not carry over: the technical cause of a failure or performance limit, the breakdown of triggering conditions
  (lighting, weather, driving situation, names of individual test scenarios), technical thresholds and measured values,
  the engineering detail of a countermeasure, descriptions of test method
- Example: where the draft says "reworking the static-object decision logic in sensor fusion", write "mitigation in progress (target completion: ...)"
- "It failed because ..." is mechanism; shorten it to "it failed"

**Removing mechanism is an explicit exception to the "do not lose information" rule above.**
Only the explanation of mechanism may go: never the item itself, its count, its severity, its status, or its deadline.
Do not backfill the removed text with other material - the section is supposed to get shorter by exactly that much.
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
${conclusionOnlyRule}`
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
- **Never reconstruct detail from a count (especially important)**: where the draft states only a count or ratio (e.g. "5 of 8 requirements verified", "countermeasure completion rate 37.5%"),
  do not build a table or list enumerating the individual IDs, names, severities, ASILs, dates, or owners. Unless the draft states them individually, **keep it as the count or ratio**
- Where the draft gives only an ID (e.g. "1 item (H-203) under consideration"), do not supply that item's name, attributes, assessment, or residual risk. Use the draft's own wording ("under consideration" in this example)
- **Check before building any table**: verify cell by cell that every value exists as text in the draft. If even one cell does not, do not build that table (drop the column, or write it as prose instead)

### 2. Do not lose information (scope is limited)
- Every substantive piece of information in the draft must land in one of the sections
- **Never delete or omit**: risks, unmet or incomplete items, unverified requirements, failed verification, open issues, and assumptions not confirmed to hold - not even to meet a length target
- **May be condensed**: items that are achieved, passed, accepted, or fully mitigated, and low-severity / ASIL-A-B items that require no decision. Prefer collapsing these into a count (e.g. "5 requirements verified") rather than enumerating them
- Move tables, figures, and lists from the draft into the appropriate section as intact as possible (never alter the values in table cells). **Never introduce a table that is not in the draft**

### 3. Follow the specified structure strictly
- Produce only the sections listed under "Target report structure" below
- Do not reorder sections; follow the numbering exactly as given
- Do not carry over the draft's own headings (the GSN-node-derived chapters) as chapters. The draft's outline is **a source of information, not a specification of structure**
- Do not invent sections that are not listed (traceability analysis, references, conclusion, etc.)
- One "Appendix" may be added after the final chapter, and only if the draft contains supporting material such as an abbreviation list or glossary
- If you carry over a glossary, keep **only terms that actually occur in the report body** and delete rows for terms you did not use

### 4. Do not repeat the same fact
- State the detail of any given fact (hazard ID, requirement ID, test ID, owner name, deadline, amount) in **exactly one section** - the most closely related one
- Where another section needs to touch on the same fact, cross-reference it ("see section X") instead of restating the detail
- The Executive Summary is the exception and may state the key points as conclusions, but without breakdowns, owner names, or individual deadlines
- Owner names and task-level assignments belong in **one section only** - the one covering countermeasures / next steps
- Where the draft itself repeats the same content in several places, consolidate it into one place; do not carry the draft's duplication over
${volumeRule}${mandatoryCoreRule}${requiredSectionRule}
## Reader (stakeholder)
- Role: ${stakeholder.role}
- Primary concerns:
${concerns}

Place the information that speaks directly to these concerns at the beginning of each section, and consolidate less relevant technical detail into later sections or bullet lists.
However, low relevance is never a reason to omit safety-critical facts (see Mandatory Safety Core above).
${executive ? `
Narrowing for executive readers (never applies to the Mandatory Safety Core):
- GSN reference numbers (G/S/Sn/C/A/U) as a list, standard clause numbers (e.g. Part 3-6), and analysis method names (HARA/HAZOP/FTA) are not decision material. Mention them only where the body needs them; do not build a table or an explanation of them
- Items that are achieved, passed, accepted, or that are Medium-or-lower severity / ASIL-A-B with countermeasures complete should be collapsed into a count
- Do not enumerate task-level work (booking a test site, assigning an owner) with individual names; prioritize the decisions the executive must make and their deadlines
` : ''}
## Target report structure${structureName ? ` (${structureName})` : ''}
Reorganize the report into the following structure:
${sectionsFormatted}${structureDescription ? `\n\nStructure description: ${structureDescription.slice(0, 500)}` : ''}

## How to map content into sections
- "Executive Summary" type section: summarize the draft's overall conclusions (overall safety achievement status, critical risks, number of open issues) in 3-6 sentences, using only facts stated in the draft. Do not introduce new judgments here
- "Current State Analysis" / "Data Overview" type sections: consolidate the achievement status from the draft's Goal/SubGoal sections
- "Risk Assessment" / "Detailed Risk Analysis" type sections: gather hazards, unmet items, failed verifications, and unresolved assumptions from the draft
- "Recommendations" / "Next Steps" / "Action Plan" type sections: organize **only the countermeasures, remaining work, and target dates explicitly stated in the draft**. Where the draft records no countermeasure, simply state that the item is unresolved - do not invent proposals
- Sections containing "GSN": retain the draft's GSN argument structure (Goal-Strategy-Evidence relationships) in a form where that structure remains legible. Refer to node IDs only where the body needs them, and **never build a table enumerating every node**${executive ? '. For executive readers, limit this to the achievement status of the top-level goal and the main second-level goals; do not list Strategy / Context / Assumption / Justification nodes as rows' : ''}
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
