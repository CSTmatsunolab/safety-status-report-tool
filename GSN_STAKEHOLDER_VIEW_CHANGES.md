# GSN-Based Stakeholder View Generation: 実装変更ドキュメント

**ブランチ:** `GSN-Based-Stakeholder-View-Generation`  
**作成日:** 2026-06-15  
**対応設計書:** `system_design.md`

---

## 概要

`system_design.md` に記述された研究設計「GSN-Based Stakeholder View Generation」を現行システムに実装した。

従来の **Flat RAG**（ステークホルダーの `reference ratio r` のみでチャンク数を調整）から、**GSNの階層構造・サブツリー構造を直接利用したステークホルダー別ビュー生成**へ拡張する。

---

## 設計方針（system_design.md より）

### ロール別ビュー定義

| ステークホルダー | 対象GSNノード | 抽象度 | Traversal Depth |
|---|---|---|---|
| CxO / 経営層 | 上位Goal、主要Strategy、未解決リスク | Executive | 2 |
| Business / Product | Goal〜中位Strategy、事業影響、残リスク | Business | 3 |
| Architect / Technical Fellows | Strategy、Context、Assumption、設計根拠 | Technical | 5 |
| R&D / Engineer | Solution/Evidence、検証結果、失敗原因 | Detailed | 全深度 |

### Mandatory Safety Core（設計上の重要方針）

> ステークホルダーを単一のサブツリーに閉じ込めると、重要な横断リスクを落とす危険がある。  
> そのため、ロール別ビューとは別に、全レポートに必ず含める **mandatory safety core** を設ける。

必須含有候補:
- 高severity hazard
- ASIL-D相当または最高リスク項目
- 未検証の安全要求
- open issue
- failed verification
- safety case全体の結論に影響するassumptionやcontext

---

## 変更ファイル一覧

### 新規作成ファイル

#### `lambda/src/lib/gsn/` （新規モジュール）

```
lambda/src/lib/gsn/
├── types.ts          # 型定義
├── parser.ts         # GSNテキストパーサー
├── mandatory-core.ts # Mandatory Safety Core抽出
├── stakeholder-view.ts # ロール別ビュー生成
└── index.ts          # モジュールエクスポート
```

#### 既存ファイルの変更

| ファイル | 変更種別 | 変更内容 |
|---|---|---|
| `lambda/src/index.ts` | 修正 | GSN-aware RAG統合、Mandatory Core注入 |
| `lambda/src/lib/rag/rrf-fusion.ts` | 修正 | `performGSNSubtreeAwareSearch()` 追加 |
| `lambda/src/lib/rag/index.ts` | 修正 | 新関数のエクスポート追加 |
| `lambda/src/lib/report-prompts.ts` | 修正 | `generateMandatoryCorePrompt()` 追加、`buildCompleteUserPrompt()` 拡張 |
| `lambda/src/lib/report-prompts-en.ts` | 修正 | 英語版に同様の変更を適用 |
| `evaluation/ssr-quality-eval/prompt_template.txt` | 修正 | 第9評価指標 `mandatory_core_coverage` 追加 |
| `evaluation/ssr-quality-eval/stakeholders.json` | 修正 | メトリクスリストに `mandatory_core_coverage` 追加 |
| `evaluation/ssr-quality-eval/evaluate.py` | 修正 | レポートテーブル列とメトリクス集計ループ更新 |

---

## 各ファイルの詳細

### `lambda/src/lib/gsn/types.ts`

GSN関連の型定義。

```typescript
// 主要な型
type GSNNodeType   = 'Goal' | 'SubGoal' | 'Strategy' | 'Context' | 'Assumption' | 'Solution' | ...
type GSNNodeStatus = 'achieved' | 'partial' | 'unachieved' | 'unknown'
type AbstractionLevel = 'executive' | 'business' | 'technical' | 'detailed'

interface GSNNode              // 個々のGSNノード情報
interface StakeholderGSNConfig // ステークホルダー別トラバーサル設定
interface MandatorySafetyCore  // 必須安全コア（6カテゴリ）
interface GSNView               // ステークホルダー別の選択済みビュー
interface ParsedGSN             // パース済みGSN全体
```

---

### `lambda/src/lib/gsn/parser.ts`

GSNのテキスト表現（Markdown）を構造化データに変換する。

**対応フォーマット:**
- Markdownテーブル形式（ノードID・種別・内容・達成状況列）
- ツリー表現（`G1 [Goal]` 形式）
- 未解決事項セクション（open issue自動検出）
- ハザード分析テキスト（severity自動検出）

**検出ロジック:**
- `GSNNodeType`: IDパターン（`G1`→Goal, `S1`→Strategy, `Sn1`→Solution等）+ `[種別]`ヒントで判定
- `GSNNodeStatus`: 日英両対応（「達成」→achieved, 「部分達成」→partial, 等）
- `RiskSeverity`: キーワード一致（critical/serious/high/medium/low）
- ASIL等級: 正規表現 `/ASIL[-\s]?([A-D]|QM)/i`

---

### `lambda/src/lib/gsn/mandatory-core.ts`

`ParsedGSN` から `MandatorySafetyCore` を抽出する。

```typescript
function extractMandatorySafetyCore(parsedGSN: ParsedGSN): MandatorySafetyCore
function formatMandatorySafetyCore(core: MandatorySafetyCore): string  // LLM入力用テキスト
function getMandatoryCoreSummary(core: MandatorySafetyCore): string    // ログ用サマリー
```

抽出条件（設計書に準拠）:

| カテゴリ | 抽出条件 |
|---|---|
| `highSeverityHazards` | `severity === 'high' \| 'critical'` |
| `asilDItems` | `asilLevel === 'ASIL-D' \| 'ASIL-C'` |
| `unverifiedRequirements` | `isUnverifiedRequirement === true` または SubGoalで安全要件かつ部分達成以下 |
| `openIssues` | `isOpenIssue === true`（未解決事項セクションに言及されたノード含む） |
| `failedVerifications` | `hasFailedVerification === true` または Solutionで未達成 |
| `criticalAssumptions` | Context/Assumptionかつルートゴールの直下に接続 |

---

### `lambda/src/lib/gsn/stakeholder-view.ts`

ステークホルダーIDに対応したGSNビューを生成する。

**`STAKEHOLDER_GSN_CONFIGS` 設定表:**

| ID | traversalDepth | focusedNodeTypes | abstractionLevel |
|---|---|---|---|
| `cxo` | 2 | Goal, SubGoal, Strategy | executive |
| `business` | 3 | Goal, SubGoal, Strategy | business |
| `product` | 3 | Goal, SubGoal, Strategy | business |
| `technical-fellows` | 5 | Goal, SubGoal, Strategy, Context, Assumption | technical |
| `architect` | 5 | Goal, SubGoal, Strategy, Context, Assumption | technical |
| `r-and-d` | 全深度 | Solution, Evidence, SubGoal, Strategy | detailed |

**Mandatory Coreの統合:**  
`mergeWithMandatoryCore()` により、ロール別ビューのノードに必須コアノードを追加（重複除去あり）。CxOであっても高severityハザードやopen issueは必ず含まれる。

---

### `lambda/src/lib/rag/rrf-fusion.ts` — `performGSNSubtreeAwareSearch()`

従来の `performAdaptiveRRFSearch()` との違い:

| 項目 | Flat RRF（従来） | GSN Subtree-Aware（新規） |
|---|---|---|
| クエリ生成 | ステークホルダーのrole+concerns | GSNノード記述 + クエリヒント + stakeholderクエリ |
| 重み付け | ステークホルダー別固定重み | GSNノードクエリ1.5倍、ヒント1.2倍、通常1.0倍 |
| 必須コア | なし | Mandatory CoreノードIDと記述をクエリに追加 |
| メタデータ | dynamicK, queriesUsed等 | + gsnNodesUsed, mandatoryCoreItemsFound |

**フォールバック:** GSNファイルが存在しない場合、または GSNパースに失敗した場合は従来のflat RRFへ自動フォールバック。

---

### `lambda/src/index.ts` — 処理フローの変更

**変更前のフロー:**
```
RRF検索 → コンテキスト準備 → プロンプト構築 → Claude API
```

**変更後のフロー:**
```
コンテキスト準備（全文ファイル処理）
  └─ GSNファイルあり? ─Yes→ GSNパース → Mandatory Core抽出
                              → GSN View生成 → GSN Subtree-Aware RAG
                              → GSN View context & Mandatory Core をcontextPartsへ追加
                    ─No→  Flat RRF（従来通り）
→ プロンプト構築（hasMandatoryCore フラグ付き）
→ Claude API
```

---

### `lambda/src/lib/report-prompts.ts` / `report-prompts-en.ts` — Mandatory Coreプロンプト

**追加関数:** `generateMandatoryCorePrompt(hasMandatoryCore: boolean): string`

GSNファイルが存在する場合、プロンプト内に以下の必須記載指示を挿入する:

```
## Mandatory Safety Core（必須安全コア）

以下の情報は、ステークホルダーの役職・専門知識レベルに関わらず、
全レポートに必ず含めること。

### 必須記載項目
1. 高Severityハザード（High/Critical）
2. ASIL-D相当の最高リスク項目
3. 未検証の安全要求
4. Open Issues（未解決事項）
5. Failed Verification（検証失敗）
6. Safety Caseに影響するAssumption/Context

### 省略禁止規則
上記6項目のいずれかが提供文書に存在する場合、
ステークホルダーの抽象度設定に関わらず省略してはならない。
```

---

### `evaluation/ssr-quality-eval/prompt_template.txt` — 第10評価指標の追加

**追加メトリクス:** `mandatory_core_coverage`（必須安全コア網羅率）

**定義:** 高Severityハザード・ASIL-D相当・未検証安全要求・Open Issues・検証失敗・重要Assumption/Contextなど、安全判断上見落としが許されない項目（Mandatory Safety Core）が、ステークホルダーの役職・専門知識レベルに関わらずレポートに漏れなく記載されているか。

**スコア基準:**

| スコア | 基準 |
|---|---|
| 5 | 全ての重要安全情報が漏れなく記載されている |
| 4 | 概ね記載されているが、軽微な欠落（低impact項目1〜2件）がある |
| 3 | 一部重要項目が欠落または不明瞭で、安全判断に影響する可能性がある |
| 2 | 複数の重要項目が欠落し、安全判断が不完全になるリスクが高い |
| 1 | Mandatory Safety Coreがほぼ記載されておらず、安全判断に使えない |

---

### `evaluation/ssr-quality-eval/stakeholders.json` — metrics更新

`evaluation_config.metrics` 配列に追加:

```json
{
  "id": "mandatory_core_coverage",
  "name_ja": "必須コア網羅率",
  "description": "Mandatory Safety Core（高severity hazard、未検証要件、open issue等）が全ステークホルダーレポートに漏れなく記載されているか"
}
```

---

### `evaluation/ssr-quality-eval/evaluate.py` — レポート出力更新

- テーブルヘッダー列に `Mandatory Core` を追加
- `generate_report()` のメトリクスループに `mandatory_core_coverage` を追加

---

## 評価実験の意図（system_design.md より）

本実装により、以下の3手法を比較実験できるようになる:

| 手法 | 説明 |
|---|---|
| **Flat RAG** | チャンク数のみ調整（実装済み、フォールバック用） |
| **Reference-ratio-based RAG** | ステークホルダー別の `r` パラメータで制御（既存実装） |
| **GSN-subtree-aware RAG** | GSNノード構造・Mandatory Coreを活用（今回追加） |

**評価指標候補（system_design.mdより）:**
- traceability coverage
- critical risk omission rate → **`mandatory_core_coverage`** として実装
- role-appropriate abstraction → **`answer_relevance` + `simplification`** で測定
- cross-report consistency
- factual error rate → **`faithfulness`** で測定
- stakeholder-perceived usefulness → **`informativeness`** で測定

---

## 今後の対応事項

### デプロイ前に必要な作業

1. **Lambda ビルド**
   ```bash
   cd lambda
   npm run build
   ```

2. **SAM デプロイ**
   ```bash
   sam build && sam deploy
   ```

### 評価実験の実施

1. 各ステークホルダー向けSSRを生成（GSNファイルあり・なしの両条件）
2. 評価スクリプトを実行
   ```bash
   cd evaluation/ssr-quality-eval
   python evaluate.py --model claude --output-report
   ```
3. `mandatory_core_coverage` スコアを中心に3手法を比較

### 今後の拡張候補

- **GSNノードへの stakeholder relevance スコア付与**（現在は binary include/exclude）
- **GSNサブツリー単位でのembedding検索**（現在はテキストクエリベース）
- **cross-report consistency チェック**（複数ステークホルダー間の整合性自動検証）
- **カスタムステークホルダーへのGSN設定自動推定**（現在は role 名キーワードで簡易判定）

---

## ファイル変更サマリー

```
8 files changed, 487 insertions(+), 70 deletions(-)

新規ファイル（5):
  lambda/src/lib/gsn/types.ts
  lambda/src/lib/gsn/parser.ts
  lambda/src/lib/gsn/mandatory-core.ts
  lambda/src/lib/gsn/stakeholder-view.ts
  lambda/src/lib/gsn/index.ts

変更ファイル（8):
  lambda/src/index.ts                             +157行 -37行
  lambda/src/lib/rag/rrf-fusion.ts                +197行  -1行
  lambda/src/lib/rag/index.ts                     +  2行  -1行
  lambda/src/lib/report-prompts.ts                + 82行  -2行
  lambda/src/lib/report-prompts-en.ts             + 78行  -2行
  evaluation/ssr-quality-eval/prompt_template.txt + 28行   0行
  evaluation/ssr-quality-eval/stakeholders.json   +  3行  -1行
  evaluation/ssr-quality-eval/evaluate.py         +  5行  -4行
```
