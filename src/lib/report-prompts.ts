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
提供された文書がSSR作成に適さない場合（安全性に関する情報がない、GSNや技術文書でない等）は、以下の形式で応答すること：

1. 「提供された文書からはSafety Status Reportを作成することができません。」と明記
2. 理由を簡潔に説明（例：安全性に関する情報が含まれていない、等）
3. SSR作成に必要な文書の種類を案内：
   - GSN（Goal Structuring Notation）ファイル
   - 安全性評価報告書
   - リスクアセスメント文書
   - 技術仕様書（安全性要件を含むもの）
   - テスト結果報告書
   - 事故・インシデント報告書
   - ハザード分析資料
4. 「上記のような安全性に関連する文書をアップロードしてください。」と促す

この場合、無理にレポートを作成せず、適切な文書の提供を求めること。`;
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
## 構造化された内容の分析
- GSNファイルが提供されている場合:
  - 各Goal（G）ノードに対して、その目標が達成されているかを評価する
  - Strategy（S）ノードの妥当性と実効性を検証する
  - Solution（Sn）やContext（C）が適切に裏付けとなっているか確認する
  - 未達成または不十分なノードがある場合、そのギャップと対策を明記する
  - GSN構造全体の論理的整合性を評価する
- その他の構造化文書（フローチャート、階層構造など）が提供されている場合:
  - その構造を理解し、要素間の関係性をレポートに反映させる
  - 構造の完全性と妥当性について評価する`;
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