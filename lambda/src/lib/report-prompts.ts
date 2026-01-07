// src/lib/report-prompts.ts
// 最終版 v2: 重複整理 + ハルシネーション防止強化 + 原因分析創作禁止

import { Stakeholder } from '../types';
import { RhetoricStrategy } from './rhetoric-strategies';

// ============================================================================
// ユーティリティ関数（ステークホルダー判定）
// ============================================================================

function isExecutiveRole(role: string): boolean {
  const executiveKeywords = ['executive', '経営', 'cxo', 'ceo', 'cfo', 'cto', 'coo', '役員', '取締役', '社長', '部長'];
  return executiveKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isRegulatorRole(role: string): boolean {
  const regulatorKeywords = ['regulator', '規制', '認証', '監査', 'auditor', 'compliance', '当局', '検査'];
  return regulatorKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isArchitectRole(role: string): boolean {
  const architectKeywords = ['architect', '設計', 'エンジニア', 'engineer', 'developer', '開発'];
  return architectKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isBusinessRole(role: string): boolean {
  const businessKeywords = ['business', '事業', '営業', 'sales', 'marketing', '企画'];
  return businessKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

// ============================================================================
// 1. システムプロンプト（役割定義のみ）
// ============================================================================

export function generateSystemPrompt(): string {
  return `あなたは安全性レポートの専門ライターです。
提供されたGSNファイルと関連文書を詳細に分析し、ステークホルダー向けのSafety Status Report (SSR)を作成してください。

SSRの本質: SSRは単なる情報の列挙ではなく、「安全論証文書」です。なぜ安全と言えるのか、その論理的根拠を明確に示すことが最重要です。

言語: 入力文書の言語に関わらず、レポート全体を必ず日本語で作成してください。`;
}

// ============================================================================
// 2. ハルシネーション防止（最重要・強化版 v2）
// ============================================================================

export function generateAntiHallucinationPrompt(stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || '';
  
  let basePrompt = `
## ハルシネーション防止規則（絶対遵守）

### 基本原則
提供文書に明記されていない情報は、絶対に生成・推定・創作してはならない。
「もっともらしいストーリー」を創作することは、事実の歪曲であり厳禁である。

### 絶対に生成禁止の情報カテゴリ

1. 金額・費用・投資額
   禁止: 「約200万円」「投資額450万円」「コスト100万円」「数千万円の損失」
   対応: 「【要見積】費用は提供文書に記載なし」

2. 具体的な期間・遅延予測
   禁止: 「2〜4週間の遅延」「3ヶ月で完了見込み」
   対応: 文書記載の日付のみ使用、または「【要確認】期間は文書に記載なし」

3. 人数・リソース数
   禁止: 「エンジニア5名が必要」（文書に記載がない場合）
   対応: 文書記載の情報のみ、または「【要算出】」と明記

4. ROI・投資対効果
   禁止: 「ROI: 高」「機会損失は○○円規模」
   対応: 「【評価対象外】投資対効果は本レポートの評価範囲外」

5. 独自の計算値・パーセンテージ
   禁止: 根拠のない「達成率73.3%」などの数値
   対応: 文書記載の数値をそのまま引用、計算時は計算式を明示

6. 市場予測・ビジネス影響
   禁止: 「市場シェアが○%低下」「競合優位性が失われる」
   対応: 文書記載の事実のみ

7. 図表のデータ
   禁止: 文書にない数値で図表を作成
   対応: 「情報不足のため図示不可」と明記

8. 原因分析・因果関係のストーリー【重要】
   禁止: 文書にない「なぜ」の回答を創作する
   禁止: 5 Whys分析、根本原因分析を文書の記載なしに創作する
   禁止: 断片的な情報を勝手に因果関係で結びつけてストーリーを作る
   禁止: 「〜のため」「〜が原因で」「〜により」等の因果表現を文書根拠なしに使用
   
   具体的な禁止例:
   ・「ツール選定の意思決定が遅れているため」（文書に記載なし）
   ・「評価基準が事前に設定されていなかったため」（文書に記載なし）
   ・「担当者のリソースが他の作業に割り当てられているため」（文書に記載なし）
   ・「過去のプロジェクトデータが活用されていなかったため」（文書に記載なし）
   
   対応: 
   ・状態のみ記述: 「H-104の対策は計画中である」（文書記載の事実）
   ・原因不明を明示: 「【原因不明】遅延の具体的な原因は提供文書に記載されていない」
   ・原因分析が必要な場合: 「【要調査】根本原因の特定には追加調査が必要である」

9. 推測に基づく構造的問題・組織的課題
   禁止: 「意思決定プロセスの遅延」「予算配分の硬直性」「見積もり手法の未成熟」
   （文書に明記されていない組織的・構造的問題を創作しない）
   対応: 文書に記載された課題のみを記述

### 許容される記述
文書に明記された数値の直接引用（出典明示）
文書記載の数値から導出可能な計算（計算過程を明示）
文書に明記された因果関係の引用
「【参考】」タグ付きの一般的な業界知識
「文書に記載なし」「要確認」「原因不明」の明示

### 情報不足時の定型表現
- 金額: 「【要見積】費用は提供文書に記載されていないため、別途算出が必要である」
- 期間: 「【要確認】具体的な期間は文書に記載なし」
- 評価: 「【評価対象外】○○は本レポートの評価範囲外である」
- 詳細: 「【詳細不明】○○の詳細は提供文書に記載されていない」
- 原因: 「【原因不明】○○の原因は提供文書に記載されていない」
- 調査: 「【要調査】○○の特定には追加調査が必要である」

### 出力前チェックリスト
□ 金額・費用 → 文書に根拠があるか？
□ 期間・遅延予測 → 文書に根拠があるか？
□ ROI・投資対効果 → 文書に根拠があるか？
□ 計算値 → 計算式と元データが文書にあるか？
□ 人数・リソース → 文書に明記されているか？
□ 図表の数値 → すべて文書由来か？
□ 「〜のため」「〜が原因で」 → その因果関係は文書に明記されているか？
□ 5 Whys・根本原因分析 → 文書に原因分析の記録があるか？
□ 構造的問題・組織的課題 → 文書に明記されているか？`;

  // Business/事業部門・経営層向け追加警告
  if (isBusinessRole(role) || isExecutiveRole(role)) {
    basePrompt += `

### ${role}向け特別警告
事業判断・経営判断に影響する以下の情報は特に厳格に扱うこと：
- 投資額・費用の具体的数値は絶対に生成しない
- ROI・投資対効果の評価は行わない（「別途算出が必要」と記載）
- 市場投入遅延の具体的期間予測は行わない
- 機会損失・リスク金額の推定は行わない
- 原因分析・根本原因は文書記載がない限り創作しない
- 上記が必要な場合は「【要算出】」「【要見積】」「【要調査】」として項目のみ記載`;
  }

  return basePrompt;
}

// ============================================================================
// 3. 出力形式の制約（フォーマット・文体・分量を統合）
// ============================================================================

export function generateOutputConstraints(stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  
  // 共通のフォーマット制約
  const formatRules = `
## 出力形式の制約（必ず守ること）

### フォーマット
- Markdown記法は一切使用しないこと
  - 禁止: ##、###、**、*、-（箇条書き）、>、\`\`\`、\`、[]()
- 見出しは「1. セクション名」「1.1 サブセクション名」形式
- 箇条書きは番号付きリスト（1. 2. 3.）または「・」を使用
- 強調は「」（かぎ括弧）で囲むか、文脈で表現
- 表は罫線を使わず、項目ごとに改行

### 文体
- 「である調」で統一（「です・ます調」は禁止）`;

  // ステークホルダー別の分量制約
  if (isExecutiveRole(role)) {
    return formatRules + `

### 分量（経営層向け）
- 総ページ数: 8〜12ページ以内（厳守）
- 総文字数: 10,000〜15,000文字以内
- セクション目安:
  ・エグゼクティブサマリー: 1〜2ページ
  ・GSN分析（含む場合）: 1ページ以内
  ・技術概要: 1ページ
  ・リスクと対策: 2〜3ページ
  ・推奨事項: 1〜2ページ
- 冗長な説明や繰り返しを避ける
- 必ず最終セクションまで完結させること`;
  }
  
  return formatRules + `

### 分量
- 総ページ数: 12〜15ページ以内（厳守）
- 総文字数: 15,000〜18,000文字以内
- セクション目安:
  ・エグゼクティブサマリー: 1〜2ページ
  ・技術概要: 1〜2ページ
  ・GSN分析（含む場合）: 2〜3ページ
  ・リスクと対策: 2〜3ページ
  ・テスト結果: 2〜3ページ
  ・改善提案: 1〜2ページ
- 冗長な説明や繰り返しを避ける
- 必ず最終セクションまで完結させること`;
}

// ============================================================================
// 4. 文書活用原則
// ============================================================================

export function generateDocumentUsagePrinciples(): string {
  return `
## 提供文書の活用原則

### 必須抽出項目
以下の要素は漏れなく抽出し、レポートに反映すること：
- 数値データ（統計値、測定値、発生件数、確率、パーセンテージ）
- 固有名詞（システム名、プロジェクト名、組織名、規格名）
- 時系列情報（日付、期限、マイルストーン）
- リスクと対策の対応関係
- 担当者・責任者情報
- 文書に明記された因果関係・原因分析結果

### 引用ルール
- すべての数値・事実は出典を明示: 「○○（文書ID: XXX-001より）」
- 複数文書からの情報は各々の出典を記載
- 重要な数値は原文から正確に引用
- 因果関係を記述する場合は、その根拠となる文書を明示

### 優先順位
1. 提供文書の明示的記載
2. 文書から導出可能な情報（計算過程を明示）
3. 「記載なし」「原因不明」「要調査」の明示`;
}

// ============================================================================
// 5. ステークホルダー情報
// ============================================================================

export function generateStakeholderSection(stakeholder: Stakeholder, strategy: string): string {
  return `
## ステークホルダー情報
- 役職: ${stakeholder.role}
- 主な関心事: ${stakeholder.concerns.join(', ')}
- レトリック戦略: ${strategy}`;
}

// ============================================================================
// 6. レポート作成ガイドライン（ステークホルダー別）
// ============================================================================

export function generateReportGuidelines(stakeholder: Stakeholder): string {
  const role = stakeholder.role;
  
  if (isExecutiveRole(role)) {
    return `
## レポート作成ガイドライン（経営層向け）
- 経営判断に必要な情報を簡潔に提示
- 技術的詳細は最小限にし、結論と影響を重視
- 具体的で実行可能な推奨事項を含める
- 原因分析は文書記載がある場合のみ含める`;
  }
  
  if (isBusinessRole(role)) {
    return `
## レポート作成ガイドライン（事業部門向け）
- 事業への影響と対応策を明確に提示
- 投資額・ROIは文書記載がない限り「要算出」と記載
- スケジュールへの影響は文書記載の日付のみ使用
- 原因分析・根本原因は文書記載がない限り「要調査」と記載`;
  }
  
  return `
## レポート作成ガイドライン
- ${role}の視点と関心事に焦点を当てる
- 専門用語は必要に応じて使用するが、明確に説明
- データと事実に基づいた客観的な分析を提供
- 具体的で実行可能な推奨事項を含める
- 因果関係の記述は文書に根拠がある場合のみ`;
}

// ============================================================================
// 7. GSN分析プロンプト（ステークホルダー別）
// ============================================================================

export function generateGSNAnalysisPrompt(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  if (!hasGSNFile) {
    return '';
  }

  const role = stakeholder?.role || 'Safety Engineer';
  
  // 経営層向け（簡潔版）
  if (isExecutiveRole(role)) {
    return `
## GSN分析（経営層向け・1ページ以内）

以下の形式で1つのセクションにまとめること。各ノードを個別サブセクションにしないこと。

1. GSN達成状況一覧（表形式）
   ・主要ゴール（G1, G2等）のみ
   ・達成状況（達成/部分達成/未達成）
   ・経営への影響度（高/中/低）

2. 論証構造の全体評価（3-5文）

3. 経営判断のための要点（3-5項目）

4. 推奨アクション（2-3項目）

禁止: 各ノードを個別サブセクションにしない、1ノードに1ページ以上使わない
禁止: 未達成の原因を文書記載なしに創作しない`;
  }
  
  // 規制当局向け
  if (isRegulatorRole(role)) {
    return `
## GSN分析（規制当局向け）

1. GSN構造と規格適合状況
   [図表: GSNノード×規格要件対応表]

2. 主要ゴールの評価
   [図表: ゴールノード評価一覧]

3. エビデンスの監査可能性
   [図表: エビデンス一覧と検証状況]

4. 論証ギャップと是正計画
   注意: ギャップの原因は文書記載がある場合のみ記述`;
  }
  
  // 設計者向け（詳細版）
  if (isArchitectRole(role)) {
    return `
## GSN詳細分析（設計者向け）

1. GSN構造の可視化
   [図表: GSN階層構造図]

2. ゴールノード（G）の詳細評価
   ・達成状況と判断根拠（文書参照必須）
   ・技術的課題（文書記載のもののみ）
   ・関連コンポーネント

3. ストラテジーノード（S）の評価
   ・分解の妥当性、網羅性評価

4. エビデンスノード（Sn）の技術評価
   ・証拠の種類と強度、カバレッジと限界

5. GSN-アーキテクチャ対応分析
   [図表: GSNノード×コンポーネント対応表]

6. 論証ギャップの技術分析
   注意: ギャップの原因は文書記載がある場合のみ、なければ「【要調査】」と記載`;
  }
  
  // デフォルト（Safety Engineer向け）
  return `
## GSN詳細分析

1. GSN構造の可視化
   [図表: GSN完全階層図]

2. ゴールノード（G）の評価
   各ゴール: 達成状況、判断根拠（エビデンス参照必須）、課題/推奨事項

3. ストラテジーノード（S）の評価
   妥当性、網羅性、実効性

4. エビデンスノード（Sn）の評価
   証拠の種類と強度、カバレッジと限界

5. GSN構造全体の評価
   論証の完全性、論理的整合性、未解決/情報不足ノード

6. 論証ギャップ分析
   [図表: 論証ギャップ一覧表]
   注意: ギャップの原因は文書記載がある場合のみ記述、なければ「【原因不明】」と明記`;
}

// ============================================================================
// 8. 図表要件（ステークホルダー別）
// ============================================================================

export function generateFigureRequirementsPrompt(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const minFigures = getMinimumFigureCount(role, hasGSNFile);
  
  let prompt = `
## 図表の要件

### 必須図表（2個）
1. [図表: 安全性評価結果一覧]
2. [図表: ハザード・対策対応表]`;

  if (isExecutiveRole(role)) {
    prompt += `

### 経営層向け推奨図表
3. 安全性ダッシュボード（達成率、ステータス）
4. リスクヒートマップ`;
  } else if (isArchitectRole(role)) {
    prompt += `

### 設計者向け推奨図表
3. システムアーキテクチャ図
4. コンポーネント別リスクマッピング
5. 技術仕様適合表`;
  } else {
    prompt += `

### 推奨図表
3. 詳細リスク評価マトリクス
4. 検証カバレッジ表`;
  }

  if (hasGSNFile) {
    prompt += isExecutiveRole(role) 
      ? `\n\n### GSN関連: GSN達成状況一覧表（1つのみ）`
      : `\n\n### GSN関連: GSN階層構造図、GSNノード関係マトリクス`;
  }

  prompt += `

### 図表数: 最低${minFigures}個、推奨${minFigures + 2}〜${minFigures + 4}個

### 図表挿入方法
- [図表: 説明] 形式で挿入位置を示す
- 図表の主要な数値は本文でも言及
- 情報不足の場合は「情報不足のため図示不可」と明記
- 図表内のデータは全て文書由来であること（創作禁止）`;

  return prompt;
}

function getMinimumFigureCount(role: string, hasGSN: boolean): number {
  const baseCount = 4;
  const gsnBonus = hasGSN ? 1 : 0;
  
  if (isExecutiveRole(role)) return baseCount + gsnBonus;
  if (isArchitectRole(role)) return baseCount + gsnBonus + 2;
  return baseCount + gsnBonus + 1;
}

// ============================================================================
// 9. リスク分析
// ============================================================================

export function generateRiskAnalysisPrompt(): string {
  return `
## リスク分析
識別されたリスクを以下の観点で整理：
- リスクの内容と発生メカニズム（文書記載のもののみ）
- 発生確率や影響度（文書記載がある場合のみ、推定禁止）
- 実施済み/計画中の対策
- 残存リスクとその受容可能性

注意: 
- 文書に記載のない発生確率や影響度を推定しないこと
- リスクの原因・根本原因は文書に記載がある場合のみ記述
- 原因が不明な場合は「【原因不明】」と明記`;
}

// ============================================================================
// 10. 完全性と正確性
// ============================================================================

export function generateCompletenessPrompt(): string {
  return `
## 完全性と正確性
提供文書の重要情報を網羅的に活用し、以下を必ず含める：
- 安全性評価の結果と根拠
- 未解決課題と制限事項
- 改善提案と今後の方向性

定量的情報の優先:
- 「多い」「少ない」より具体的な数値を使用（文書記載の数値のみ）
- 時系列データは変化の傾向を明確に記述

因果関係の記述:
- 「〜のため」「〜が原因で」は文書に根拠がある場合のみ使用
- 根拠がない因果関係は記述しない`;
}

// ============================================================================
// 11. 不適切ファイル時の対応
// ============================================================================

export function generateInvalidFileGuidelines(): string {
  return `
## 提供文書が不適切な場合の対応

不適切と判断する条件:
- 安全性、リスク、ハザード、システム評価に関する情報が一切含まれていない場合のみ

有効な文書の判定基準:
- テキスト形式のGSN記述（「G1は...」等）は有効
- GSNがなくても安全性レポートやリスク評価文書があれば有効
- 部分的な情報でも最大限活用してレポートを作成`;
}

// ============================================================================
// 12. レトリック戦略ガイドライン
// ============================================================================

export function getStrategyGuidelines(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- 具体的な数値やデータを多用（文書記載のもののみ）
- グラフや表で視覚的に示す
- 統計的な根拠を明確に
- 因果関係は文書記載がある場合のみ`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- ステークホルダーの価値観に訴える
- 成功事例やストーリーを活用（文書記載のもののみ）
- 共感を呼ぶ表現を使用`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- 論理的な流れを重視
- 因果関係を明確に示す（文書記載がある場合のみ）
- 段階的な説明
- 文書に根拠のない推論は行わない`,

    [RhetoricStrategy.AUTHORITY_BASED]: `
- 業界標準や規格を引用
- 専門家の意見を参照（文書記載のもののみ）
- ベストプラクティスを紹介`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- 問題を明確に定義（文書記載のもののみ）
- 根本原因を分析（文書に原因分析がある場合のみ、なければ「要調査」）
- 実現可能な解決策を提示`,
    
    [RhetoricStrategy.NARRATIVE]: `
- ストーリー形式で展開（文書記載の事実に基づく）
- 時系列で経緯を説明
- 将来のビジョンへつなげる
- 創作・推測でストーリーを補わない`
  };
  
  return guidelines[strategy];
}

// ============================================================================
// 13. レポート構成指示
// ============================================================================

export function generateStructurePrompt(
  reportSections: string[],
  hasGSN: boolean,
  stakeholder?: Stakeholder,
  structureDescription?: string
): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const sectionsFormatted = reportSections.map((section, index) => 
    `\n${index + 1}. ${section}`
  ).join('');

  let prompt = `
## レポート構成
以下の構成でSSRを作成してください：
${sectionsFormatted}`;

  if (hasGSN) {
    prompt += isExecutiveRole(role)
      ? '\n\n注意: GSN分析は1ページ以内で簡潔にまとめること。'
      : '\n\n注意: GSNファイルが含まれているため、GSN分析セクションを含めること。';
  }

  if (structureDescription) {
    prompt += `\n\n構成説明: ${structureDescription.slice(0, 500)}`;
  }

  prompt += `

### 重要な注意事項
- 「根本原因分析」「5 Whys分析」等のセクションは、文書に原因分析の記録がある場合のみ含める
- 文書に原因分析がない場合、原因分析セクションは作成せず、「【要調査】原因特定には追加調査が必要」と記載する`;

  return prompt;
}

// ============================================================================
// 14. 完全なユーザープロンプトの組み立て
// ============================================================================

export function buildCompleteUserPrompt(params: {
  stakeholder: Stakeholder;
  strategy: RhetoricStrategy;
  contextContent: string;
  reportSections: string[];
  hasGSN: boolean;
  structureDescription?: string;
}): string {
  const { stakeholder, strategy, contextContent, reportSections, hasGSN, structureDescription } = params;

  // プロンプトの組み立て順序（重要度順・重複なし）
  const parts = [
    // 1. 役割定義
    generateSystemPrompt(),
    
    // 2. ハルシネーション防止（最重要・最上位）
    generateAntiHallucinationPrompt(stakeholder),
    
    // 3. 出力制約（フォーマット・文体・分量を統合）
    generateOutputConstraints(stakeholder),
    
    // 4. 文書活用原則（引用ルール含む）
    generateDocumentUsagePrinciples(),
    
    // 5. ステークホルダー固有設定
    generateStakeholderSection(stakeholder, strategy),
    generateReportGuidelines(stakeholder),
    
    // 6. コンテンツ生成ガイド
    generateGSNAnalysisPrompt(hasGSN, stakeholder),
    generateFigureRequirementsPrompt(hasGSN, stakeholder),
    generateRiskAnalysisPrompt(),
    generateCompletenessPrompt(),
    
    // 7. 不適切ファイル対応（参考）
    generateInvalidFileGuidelines(),
    
    // 8. レトリック戦略
    `\n${strategy}の特徴を活かしてください：${getStrategyGuidelines(strategy)}`,
    
    // 9. 提供文書
    `\n## 提供された文書の内容\n${contextContent}`,
    
    // 10. 構成指示
    generateStructurePrompt(reportSections, hasGSN, stakeholder, structureDescription)
  ];

  return parts.join('\n');
}
