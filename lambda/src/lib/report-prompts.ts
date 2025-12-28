// src/lib/report-prompts.ts

import { Stakeholder } from '../types';
import { RhetoricStrategy } from './rhetoric-strategies';

/**
 * レポート生成用のシステムプロンプトを生成
 */
export function generateSystemPrompt(): string {
  return `あなたは安全性レポートの専門ライターです。
提供されたGSNファイルと関連文書を詳細に分析し、ステークホルダー向けのSafety Status Report (SSR)を作成してください。

重要: 必ず提供された文書の内容に基づいてレポートを作成してください。一般的な内容ではなく、文書に記載されている具体的な情報（プロジェクト名、システム名、場所、日付、技術仕様など）を使用してください。

必須: 入力文書が英語やその他の言語で書かれていても、レポート全体を必ず日本語で作成してください。関連情報を正確に日本語に翻訳してください。

SSRの本質: SSRは単なる情報の列挙ではなく、「安全論証文書」です。なぜ安全と言えるのか、その論理的根拠を明確に示すことが最重要です。`;
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
 * ステークホルダーが経営層かどうかを判定
 */
function isExecutiveRole(role: string): boolean {
  const executiveKeywords = ['executive', '経営', 'cxo', 'ceo', 'cfo', 'cto', 'coo', '役員', '取締役', '社長', '部長'];
  return executiveKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

/**
 * ステークホルダーが規制当局かどうかを判定
 */
function isRegulatorRole(role: string): boolean {
  const regulatorKeywords = ['regulator', '規制', '認証', '監査', 'auditor', 'compliance', '当局', '検査'];
  return regulatorKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

/**
 * ステークホルダーが設計者/アーキテクトかどうかを判定
 */
function isArchitectRole(role: string): boolean {
  const architectKeywords = ['architect', '設計', 'エンジニア', 'engineer', 'developer', '開発'];
  return architectKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

/**
 * レポート作成ガイドラインを生成（ステークホルダー別詳細度対応）
 */
export function generateReportGuidelines(stakeholder: Stakeholder): string {
  const role = stakeholder.role;
  
  if (isExecutiveRole(role)) {
    return `
レポート作成のガイドライン（経営層向け）:
- ${role}の視点と関心事に焦点を当てる
- 経営判断に必要な情報を簡潔に提示する
- 技術的詳細は最小限にし、結論と影響を重視する
- 具体的で実行可能な推奨事項を含める
- 文体は「である調」で統一すること
- 全体で5-10ページを目安とし、簡潔にまとめる
- 各セクションは経営判断に必要な情報のみを含める`;
  }
  
  return `
レポート作成のガイドライン:
- ${role}の視点と関心事に焦点を当てる
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
- 部分的な情報でも、提供された情報から最大限のレポートを作成すること

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
 * GSN分析用プロンプトを生成（ステークホルダー別詳細度対応）
 */
export function generateGSNAnalysisPrompt(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  if (!hasGSNFile) {
    return '';
  }

  const role = stakeholder?.role || 'Safety Engineer';
  
  // CxO/経営層向け（簡潔版）
  if (isExecutiveRole(role)) {
    return `
## GSN分析（経営層向けサマリー）

### 重要: GSN分析は1ページ以内で簡潔にまとめること

以下の形式で「1つのセクション」にまとめること。各ノードを個別のサブセクションにしないこと。

1. GSN達成状況一覧（表形式）
   [図表: GSN達成状況一覧表]
   以下を1つの表にまとめる：
   ・ノードID（主要ゴールのみ: G1, G2, G3等）
   ・ゴール名称（簡潔に10文字程度）
   ・達成状況（達成/部分達成/未達成/評価不能）
   ・経営への影響度（高/中/低）

2. 論証構造の全体評価（3-5文で要約）
   ・最上位ゴールの達成状況と判断根拠
   ・主要サブゴールの状況
   ・論証の強みと弱み

3. 経営判断のための要点（箇条書き3-5項目）
   ・意思決定に必要な事項のみを簡潔に

4. 推奨アクション（箇条書き2-3項目）
   ・短期/中期/長期のアクション

### 禁止事項
- 各ノード（G1, G2, S1, S2...）を個別のサブセクション（2.1, 2.2, 2.3...）にしない
- 1つのノードに1ページ以上を使わない
- 技術的な詳細説明を長々と書かない`;
  }
  
  // 規制当局向け（規格準拠版）
  if (isRegulatorRole(role)) {
    return `
## GSN分析（規制当局向け）

### GSN分析の記述形式
規制当局向けには、規格適合の観点から論証の妥当性を示すこと。

1. GSN構造と規格適合状況
   [図表: GSNノード×規格要件対応表]
   ・各ゴールノードと対応する規格条項
   ・適合状況（適合/部分適合/非適合）
   ・根拠文書への参照

2. 主要ゴールの評価（表形式で簡潔に）
   [図表: ゴールノード評価一覧]
   ・ノードID、ゴール内容、達成状況、判断根拠、規格条項

3. エビデンスの監査可能性
   [図表: エビデンス一覧と検証状況]
   ・各エビデンスの種類、独立検証の有無、文書参照

4. 論証ギャップと是正計画
   ・未達成/評価不能ノードの一覧と是正計画`;
  }
  
  // Architect/設計者向け（詳細版）
  if (isArchitectRole(role)) {
    return `
## GSN詳細分析（設計者向け）

### 1. GSN構造の可視化
[図表: GSN階層構造図]

### 2. ゴールノード（G）の詳細評価
各ゴールノードについて以下を記述：
・達成状況: 達成/部分達成/未達成/評価不能
・判断根拠: エビデンスへの参照と評価理由
・技術的課題: 設計観点での課題と対策案
・関連コンポーネント: 影響を受けるシステム要素

### 3. ストラテジーノード（S）の評価
各ストラテジーについて：
・分解の妥当性（技術的観点）
・網羅性の評価
・設計への影響

### 4. エビデンスノード（E/Sn）の技術評価
各エビデンスについて：
・証拠の種類と技術的詳細
・テスト条件/解析条件
・カバレッジと限界

### 5. GSN-アーキテクチャ対応分析
[図表: GSNノード×コンポーネント対応表]

### 6. 論証ギャップの技術分析
・不足しているエビデンスと追加検証の提案`;
  }
  
  // Safety Engineer向け（技術詳細版）- デフォルト
  return `
## GSN詳細分析

### 1. GSN構造の可視化
[図表: GSN完全階層図]

### 2. ゴールノード（G）の評価
各ゴールノードについて、以下の3点を記述：
1. 達成状況: 「達成」「部分達成」「未達成」「評価不能」
2. 判断根拠: どのエビデンス・データに基づく判断か
3. 課題/推奨事項: 完全達成に向けて不足している点

### 3. ストラテジーノード（S）の評価
各ストラテジーについて：
1. 妥当性: この戦略でゴールを論証できるか
2. 網羅性: 必要な観点がカバーされているか
3. 実効性: 実際の証拠で裏付けられているか

### 4. エビデンスノード（E/Sn）の評価
各エビデンスについて：
1. 証拠の種類と強度
2. 対応するゴールとの関連性
3. カバレッジと限界

### 5. GSN構造全体の評価
1. 論証の完全性
2. 論理的整合性
3. 未解決ノード
4. 情報不足ノード

### 6. 論証ギャップ分析
[図表: 論証ギャップ一覧表]`;
}

/**
 * 図表要件のプロンプトを生成（ステークホルダー別）
 */
export function generateFigureRequirementsPrompt(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const minFigures = getMinimumFigureCount(role, hasGSNFile);
  
  let prompt = `
## 図表の要件（${role}向け）

SSRには図表を効果的に含めること。挿入位置を [図表: 説明] 形式で明示すること。

### コア必須図表（2個）
1. 安全性評価サマリ表
   [図表: 安全性評価結果一覧]

2. リスク対応関係表
   [図表: ハザード・対策対応表]`;

  // ステークホルダー別の推奨図表
  if (isExecutiveRole(role)) {
    prompt += `

### 経営層向け推奨図表
3. 安全性ダッシュボード（達成率、信号機形式のステータス）
4. リスクヒートマップ（ビジネスインパクト視点）`;
  } else if (isArchitectRole(role)) {
    prompt += `

### 設計者向け推奨図表
3. システムアーキテクチャ図
4. コンポーネント別リスクマッピング
5. 技術仕様適合表`;
  } else if (isRegulatorRole(role)) {
    prompt += `

### 規制当局向け推奨図表
3. 規格適合マトリクス
4. 認証ステータス表
5. 監査証跡サマリ`;
  } else {
    prompt += `

### 安全技術者向け推奨図表
3. 詳細リスク評価マトリクス
4. FMEA/ハザード分析表
5. 安全機能割当表
6. 検証カバレッジ表`;
  }

  // GSN関連図表
  if (hasGSNFile) {
    if (isExecutiveRole(role)) {
      prompt += `

### GSN関連図表（簡潔版）
・GSN達成状況一覧表（表形式、主要ゴールのみ）`;
    } else {
      prompt += `

### GSN関連図表
・GSN階層構造図
・GSNノード関係マトリクス`;
    }
  }

  prompt += `

### 図表数の目安
- 最低: ${minFigures}個
- 推奨: ${minFigures + 2}〜${minFigures + 4}個

### 原則
- 情報不足の場合は「情報不足のため図示不可」と明記
- 推測で図表を作成しない
- 図表番号とタイトルを付与`;

  return prompt;
}

/**
 * ステークホルダー別の最低図表数を取得
 */
function getMinimumFigureCount(role: string, hasGSN: boolean): number {
  const baseCount = 4;
  const gsnBonus = hasGSN ? 1 : 0;
  
  if (isExecutiveRole(role)) {
    return baseCount + gsnBonus;
  }
  if (isArchitectRole(role)) {
    return baseCount + gsnBonus + 2;
  }
  if (isRegulatorRole(role)) {
    return baseCount + gsnBonus + 1;
  }
  return baseCount + gsnBonus + 1;
}

/**
 * 情報不足時の対応プロンプトを生成
 */
export function generateInformationGapHandlingPrompt(): string {
  return `
## 情報不足時の対応

情報が不足している場合：
- 「【情報不足】○○に関するデータは提供文書に記載されていない」と明記
- 単に省略せず、何が不足しているかを明示
- 推測や創作で補わないこと`;
}

/**
 * エビデンスベース記述のプロンプトを生成
 */
export function generateEvidenceBasedPrompt(): string {
  return `
## エビデンスベースの記述
- すべての主張は提供文書のエビデンスに基づくこと
- 文書に記載のない情報は「文書に記載なし」と明記
- 重要な数値は原文から正確に引用`;
}

/**
 * リスク分析用プロンプトを生成
 */
export function generateRiskAnalysisPrompt(): string {
  return `
## リスク分析
- 識別されたリスクを以下の観点で整理:
  * リスクの内容と発生メカニズム
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
- 図表を [図表: 説明] 形式で挿入位置を示す
- 図表の主要な数値は本文でも言及`;
}

/**
 * 定量情報優先のプロンプトを生成
 */
export function generateQuantitativePrompt(): string {
  return `
## 定量的情報の優先
- 「多い」「少ない」より具体的な数値を使用
- 時系列データは変化の傾向を明確に記述`;
}

/**
 * 完全性と正確性のプロンプトを生成
 */
export function generateCompletenessPrompt(): string {
  return `
## 完全性と正確性
- 提供文書の重要情報を網羅的に活用
- 以下を必ず含める:
  * 安全性評価の結果と根拠
  * 未解決課題と制限事項
  * 改善提案と今後の方向性`;
}

/**
 * レトリック戦略別ガイドラインを生成
 */
export function getStrategyGuidelines(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- 具体的な数値やデータを多用
- グラフや表で視覚的に示す
- 統計的な根拠を明確に`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- ステークホルダーの価値観に訴える
- 成功事例やストーリーを活用
- 共感を呼ぶ表現を使用`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- 論理的な流れを重視
- 因果関係を明確に示す
- 段階的な説明`,

    [RhetoricStrategy.AUTHORITY_BASED]: `
- 業界標準や規格を引用
- 専門家の意見を参照
- ベストプラクティスを紹介`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- 問題を明確に定義
- 根本原因を分析
- 実現可能な解決策を提示`,
    
    [RhetoricStrategy.NARRATIVE]: `
- ストーリー形式で展開
- 時系列で経緯を説明
- 将来のビジョンへつなげる`
  };
  
  return guidelines[strategy];
}

/**
 * レポート構成指示のプロンプトを生成（ステークホルダー別）
 */
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
以下の構成でSSRを作成してください：
構成：${sectionsFormatted}`;

  if (hasGSN) {
    if (isExecutiveRole(role)) {
      prompt += '\n注意: GSN分析は1ページ以内で簡潔にまとめること。各ノードを個別セクションにしないこと。';
    } else {
      prompt += '\n注意: GSNファイルが含まれているため、GSN分析セクションを含めてください。';
    }
  }

  if (structureDescription) {
    prompt += `\n構成説明: ${structureDescription.slice(0, 500)}`;
  }

  if (isExecutiveRole(role)) {
    prompt += `\n
経営層向けレポートの注意事項:
- 全体で5-10ページを目安とする
- エグゼクティブサマリーは1-2ページ
- GSN分析は1ページ以内
- 技術的詳細より経営判断に必要な情報を優先
- 各セクションは簡潔に`;
  }

  prompt += `\n
注意事項:
- 文体は「である調」で統一
- Markdown記法は使用しない（##、**、*、-等は禁止）`;

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
    generateGSNAnalysisPrompt(hasGSN, stakeholder),
    generateFigureRequirementsPrompt(hasGSN, stakeholder),
    generateInformationGapHandlingPrompt(),
    generateEvidenceBasedPrompt(),
    generateRiskAnalysisPrompt(),
    generateChartInstructionPrompt(),
    generateQuantitativePrompt(),
    generateCompletenessPrompt(),
    `\n${strategy}の特徴を活かしてください：${getStrategyGuidelines(strategy)}`,
    `\n提供された文書の内容:\n${contextContent}`,
    generateStructurePrompt(reportSections, hasGSN, stakeholder, structureDescription)
  ];

  return parts.join('\n');
}