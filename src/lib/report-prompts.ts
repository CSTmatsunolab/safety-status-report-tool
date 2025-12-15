// src/lib/report-prompts.ts

import { Stakeholder } from '@/types';
import { RhetoricStrategy } from './report-structures';

/**
 * レポート生成用のシステムプロンプトを生成
 */
export function generateSystemPrompt(): string {
  return `あなたは安全性レポートの専門ライターです。
提供されたGSNファイルと関連文書を詳細に分析し、ステークホルダー向けのSafety Status Report (SSR)を作成してください。

重要: 必ず提供された文書の内容に基づいてレポートを作成してください。一般的な内容ではなく、文書に記載されている具体的な情報（プロジェクト名、システム名、場所、日付、技術仕様など）を使用してください。

必須: 入力文書が英語やその他の言語で書かれていても、レポート全体を必ず日本語で作成してください。関連情報を正確に日本語に翻訳してください。`;
}

/**
 * ステークホルダー別のプロンプトセクションを生成
 */
export function generateStakeholderSection(stakeholder: Stakeholder, strategy: string): string {
  return `
ステークホルダー情報:
- 役職: ${stakeholder.role}
- 主な関心事: ${stakeholder.concerns.join(', ')}
- レトリック戦略: ${strategy}`;
}

/**
 * レポート作成ガイドラインを生成
 */
export function generateReportGuidelines(stakeholder: Stakeholder): string {
  return `
レポート作成のガイドライン:
- ${stakeholder.role}の視点と関心事に焦点を当てる
- 専門用語は必要に応じて使用するが、明確に説明する
- データと事実に基づいた客観的な分析を提供
- 具体的で実行可能な推奨事項を含める
- 文体は「である調」で統一すること（例：～である、～する、～となる）`;
}

/**
 * 出力形式の制約を生成
 */
export function generateFormatRestrictions(): string {
  return `
## 出力形式の制約（必ず守ること）
- Markdown記法は一切使用しないこと
  - 使用禁止: ##、###、**、*、-（箇条書き）、>、\`\`\`、\`、[]()、など
- 見出しは「1. セクション名」「1.1 サブセクション名」「1.1.1 項目名」の形式で記述
- 箇条書きが必要な場合は、番号付きリスト（1. 2. 3.）または「・」を使用
- 強調したい語句は「」（かぎ括弧）で囲むか、文脈で表現すること
- 表は罫線を使わず、項目ごとに改行して記述すること`;
}

/**
 * 不適切なファイル時の対応ガイドラインを生成
 */
export function generateInvalidFileGuidelines(): string {
  return `
## 提供文書が不適切な場合の対応
以下の条件に該当する場合のみ、文書が不適切と判断すること：
- 安全性、リスク、ハザード、システム評価、技術的な評価や検証に関する情報が一切含まれていない

重要な判定基準：
- テキスト形式のGSN記述（「G1は...」「S1は...」のような記述）は有効なGSNファイルである
- GSNは図表形式である必要はなく、テキストベースの構造記述で十分である
- GSNファイルがなくても、安全性レポートやリスク評価文書があればレポート作成は可能である
- 安全性レポート、リスク評価文書、実証実験報告書などは有効な文書である
- 部分的な情報でも、提供された情報から最大限のレポートを作成すること

文書が完全に不適切な場合のみ、以下の形式で応答すること：
1. 「提供された文書からはSafety Status Reportを作成することができません。」と明記
2. 理由を簡潔に説明（例：安全性に関する情報が含まれていない、等）
3. SSR作成に必要な文書の種類を案内：
   - GSN（Goal Structuring Notation）ファイル（テキスト形式推奨）
   - 安全性評価報告書
   - リスクアセスメント文書
   - 技術仕様書（安全性要件を含むもの）
   - テスト結果報告書
   - 事故・インシデント報告書
   - ハザード分析資料
4. 「上記のような安全性に関連する文書をアップロードしてください。」と促す

注意: 少しでも安全性に関連する情報が含まれている場合は、その情報を最大限活用してレポートを作成すること。ただし、提供文書に記載のない情報を創作・推測してはならない（ハルシネーション禁止）。不明な点は「文書に記載なし」と明記すること。`;
}

/**
 * 文書活用原則のプロンプトを生成
 */
export function generateDocumentUsagePrinciples(): string {
  return `
## 提供文書の活用原則
- 提供されたすべての文書から関連情報を漏れなく抽出し、優先的に使用すること
- 特に以下の要素を確実に取り込むこと:
  * 数値データ（統計値、測定値、発生件数、確率、パーセンテージなど）
  * 固有名詞（システム名、地名、組織名、規格名など）
  * 時系列情報（日付、期間、推移、変化傾向など）
  * リスクと対策の対応関係`;
}

/**
 * GSN分析用プロンプトを生成
 */
export function generateGSNAnalysisPrompt(hasGSNFile: boolean): string {
  if (!hasGSNFile) {
    return '';
  }

  return `
## GSN（Goal Structuring Notation）の詳細分析

### GSNノードの評価方法
GSNファイルが提供されている場合、各ノードについて以下の形式で詳細な評価を行うこと。
すべてのノードについて評価を記述すること。情報が不足している場合は「評価不能」「文書に記載なし」と明記し、決して推測や創作をしないこと。

【ゴールノード（G）の評価】
各ゴールノードについて、以下の3点を記述すること：
1. 達成状況: 「達成」「部分達成」「未達成」「評価不能（情報不足）」のいずれか
2. 判断根拠: どのエビデンス・データ・文書に基づいてその判断をしたか具体的に記載。情報がない場合は「提供文書に該当情報なし」と明記
3. 課題/推奨事項: 完全達成に向けて不足している点や推奨される対策。評価不能の場合は「評価に必要な情報の追加が必要」と記載

例1（評価可能な場合）：
「G1: システムは安全に運用できる」
・達成状況: 部分達成
・判断根拠: E1のテスト結果で主要シナリオの95%をカバー、E2のリスク評価で高リスク項目3件に対策実施済み
・課題: 残り5%の未テストシナリオへの対応が必要

例2（情報不足の場合）：
「G5: システムは異常が発生しても、安全状態に移行できる」
・達成状況: 評価不能（情報不足）
・判断根拠: 提供文書にG5の詳細な論証構造およびエビデンスが含まれていない
・課題: ISO 26262に基づく機能安全の詳細論証とエビデンスの追加が必要

【ストラテジーノード（S）の評価】
各ストラテジーについて評価すること。情報不足の場合は「詳細不明」と明記：
1. 妥当性: この戦略でゴールを論証できるか（不明な場合は「判断に必要な情報なし」）
2. 網羅性: 必要な観点が漏れなくカバーされているか
3. 実効性: 実際の証拠で裏付けられているか

【エビデンスノード（E/Sn）の評価】
各エビデンスについて評価すること。詳細が不明な場合は「内容詳細は文書に記載なし」と明記：
1. 証拠の種類: テスト結果、分析レポート、第三者評価など（不明な場合は「種類不明」）
2. 証拠の強度: 十分/部分的/不十分/判断不能
3. 対応するゴールとの関連性: どのゴールをどの程度支持しているか

【コンテキストノード（C）の評価】
情報がある場合のみ評価。不明な場合は「文書に詳細記載なし」と明記：
1. 前提条件の妥当性
2. 適用範囲の明確性
3. 制約事項の影響

### GSN構造全体の評価
以下の観点でGSN全体を評価すること：
1. 論証の完全性: すべてのゴールが十分なエビデンスで支持されているか
2. 論理的整合性: ゴール→ストラテジー→サブゴール/エビデンスの流れに矛盾はないか
3. 未解決ノード: 詳細化されていないノード、エビデンスが不足しているノードの特定
4. 情報不足ノード: 提供文書では評価できなかったノードの一覧

### 評価サマリー
GSNセクションの最後に、以下の形式で評価サマリーを含めること：

主要ゴールの達成状況一覧:
・G1（トップゴール）: [達成状況] - [一文での根拠サマリー]
・G2: [達成状況] - [一文での根拠サマリー]
・G3: [達成状況] - [一文での根拠サマリー]
...

重要（ハルシネーション防止）: 
- すべてのノードについて評価を記述すること
- 情報が不足している場合は「評価不能（情報不足）」「文書に記載なし」と必ず明記すること
- 提供文書にない情報を推測・創作することは絶対に禁止
- 「構造の説明」だけでなく「達成状況の評価」を含めること
- 評価できないノードがあることは問題ではない。正直に「評価不能」と記載することが重要`;
}

/**
 * エビデンスベース記述のプロンプトを生成
 */
export function generateEvidenceBasedPrompt(): string {
  return `
## エビデンスベースの記述
- すべての主張は提供文書のエビデンスに基づくこと
- 文書に記載のない情報は「文書に記載なし」と明記し、推測や仮定値を作成しないこと
- 重要な数値や統計データは必ず原文から正確に引用すること`;
}

/**
 * リスク分析用プロンプトを生成
 */
export function generateRiskAnalysisPrompt(): string {
  return `
## リスク分析の徹底
- 識別されたすべてのリスクを漏れなく抽出し、以下の観点で整理:
  * リスクの具体的内容と発生メカニズム
  * 発生確率や影響度（文書に記載がある場合）
  * 実施済み/計画中の対策
  * 残存リスクとその受容可能性`;
}

/**
 * 図表挿入指示のプロンプトを生成
 */
export function generateChartInstructionPrompt(): string {
  return `
## 図表の取り扱い
- 図表を積極的に挿入し、以下の形式で挿入位置を示す：
  [図表: 説明]
  例：[図表: リスクレベル別の対策状況を示す棒グラフ]
- 図表で示すべきデータがある場合、その主要な数値を本文でも言及すること
- グラフの傾向（上昇/下降/横ばい等）を文章で説明すること`;
}

/**
 * 定量情報優先のプロンプトを生成
 */
export function generateQuantitativePrompt(): string {
  return `
## 定量的情報の優先
- 「多い」「少ない」等の定性表現より、具体的な数値を使用すること
- 統計的分析結果（信頼区間、標準偏差等）がある場合、その意味を解説すること
- 時系列データは変化の傾向と転換点を明確に記述すること`;
}

/**
 * 完全性と正確性のプロンプトを生成
 */
export function generateCompletenessPrompt(): string {
  return `
## 完全性と正確性の確保
- 提供文書の重要情報を網羅的に活用すること
- 特に以下は必ず含めること:
  * 安全性評価の結果と根拠
  * 未解決課題と制限事項
  * 前提条件と適用範囲
  * 改善提案と今後の方向性`;
}

/**
 * レトリック戦略別ガイドラインを生成
 */
export function getStrategyGuidelines(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- 具体的な数値やデータを多用する
- グラフや表で視覚的に示す
- 統計的な根拠を明確にする
- 客観的な事実に基づく論証`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- ステークホルダーの価値観に訴える
- 成功事例やストーリーを活用
- ビジョンや理想を描く
- 共感を呼ぶ表現を使用`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- 論理的な流れを重視
- 因果関係を明確に示す
- 段階的な説明を心がける
- 技術的な正確性を保つ
- 具体的な数値やデータで裏付ける
- 測定可能な指標を提示`,

    [RhetoricStrategy.AUTHORITY_BASED]: `
- 業界標準や規格を引用
- 専門家の意見を参照
- ベストプラクティスを紹介
- 信頼性の高い情報源を使用`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- 問題を明確に定義
- 根本原因を分析
- 実現可能な解決策を提示
- 実装手順を具体的に説明`,
    
    [RhetoricStrategy.NARRATIVE]: `
- ストーリー形式で展開
- 時系列で経緯を説明
- 登場人物と役割を明確化
- 将来のビジョンへつなげる`
  };
  
  return guidelines[strategy];
}

/**
 * レポート構成指示のプロンプトを生成
 */
export function generateStructurePrompt(
  reportSections: string[],
  hasGSN: boolean,
  structureDescription?: string
): string {
  const sectionsFormatted = reportSections.map((section, index) => 
    `\n${index + 1}. ${section}`
  ).join('');

  let prompt = `
以下の構成でSSRを作成してください：
構成：${sectionsFormatted}`;

  if (hasGSN) {
    prompt += '\n注意: GSNファイルが含まれているため、GSN分析セクションを含めてください。';
  }

  if (structureDescription) {
    prompt += `\n構成説明: ${structureDescription.slice(0, 500)}`;
  }

  prompt += `\n
注意事項:
- レポートは提供された文書の内容を正確に反映し、具体的な事実とデータに基づいて作成すること
- 文体は必ず「である調」で統一し、「です・ます調」は使用しないこと
- Markdown記法は一切使用しないこと（##、**、*、-等は禁止）`;

  return prompt;
}

/**
 * 完全なユーザープロンプトを組み立て
 */
export function buildCompleteUserPrompt(params: {
  stakeholder: Stakeholder;
  strategy: RhetoricStrategy;
  contextContent: string;
  reportSections: string[];
  hasGSN: boolean;
  structureDescription?: string;
}): string {
  const { stakeholder, strategy, contextContent, reportSections, hasGSN, structureDescription } = params;

  const parts = [
    generateSystemPrompt(),
    generateFormatRestrictions(),
    generateInvalidFileGuidelines(),
    generateStakeholderSection(stakeholder, strategy),
    generateReportGuidelines(stakeholder),
    generateDocumentUsagePrinciples(),
    generateGSNAnalysisPrompt(hasGSN),
    generateEvidenceBasedPrompt(),
    generateRiskAnalysisPrompt(),
    generateChartInstructionPrompt(),
    generateQuantitativePrompt(),
    generateCompletenessPrompt(),
    `\n${strategy}の特徴を活かしてください：${getStrategyGuidelines(strategy)}`,
    `\n提供された文書の内容:\n${contextContent}`,
    generateStructurePrompt(reportSections, hasGSN, structureDescription)
  ];

  return parts.join('\n');
}
