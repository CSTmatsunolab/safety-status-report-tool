# RAG 評価スクリプト - SSRツール用

SSRツールのRAG検索精度を評価するためのスクリプトです。

## 🎯 特徴

- **実際のツールと同じロジック**: `CustomStakeholderQueryEnhancer` でクエリを自動生成
- **動的K値計算**: ステークホルダーとチャンク数に基づいて最適なK値を自動計算
- **RRF検索**: 複数クエリをReciprocal Rank Fusionで統合
- **優先度自動設定**: `RAG評価データリスト.xlsx` から優先度を自動適用
- **7つの評価指標**: Precision@K, Recall@K, F1@K, MRR, nDCG@K, Coverage, K値達成率

---

## 📊 動的K値計算

SSRツールと同じ比率ベースのロジックでK値を自動計算します：

| ステークホルダー | 比率 | 説明 |
|------------------|------|------|
| cxo | 8% | 経営層：要点を絞る |
| business | 9% | 事業部門 |
| product | 11% | プロダクト：バランス型 |
| technical-fellows | 14% | 技術フェロー：詳細に参照 |
| architect | 14% | アーキテクト |
| r-and-d | 15% | 研究開発：最も多く参照 |

**例**: 総チャンク237件、CxOの場合
- targetK = 237 × 0.08 = 19件

---

## 📋 評価フロー

### 方法A: 部分評価（検索結果のみラベリング）

```
① export-csv → ② ラベリング → ③ convert-csv → ④ evaluate-rrf
```

### 方法B: 完全評価（全チャンクラベリング）【推奨】

```
┌─────────────────────────────────────────────────────────────────┐
│  ① 全チャンクCSV出力                                            │
│     npx ts-node rag-evaluator.ts export-all-csv \               │
│       --uuid <uuid>                                              │
│                                                                  │
│     ※ RAG評価データリスト.xlsx があれば優先度を自動設定         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ② Excelでラベリング確認（手作業）                              │
│     - CSVをExcelで開く                                          │
│     - 自動設定された優先度を確認                                 │
│     - 必要に応じて0に変更（無関係なチャンク）                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ③ Ground Truth JSON変換                                        │
│     npx ts-node rag-evaluator.ts convert-all-csv \              │
│       --input ./all-chunks.csv \                                 │
│       --uuid <uuid> \                                            │
│       --output ./ground-truth-all.json                           │
│                                                                  │
│     ※ relevance >= 2 のみを正解として変換                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ④ 評価実行                                                     │
│     npx ts-node rag-evaluator.ts evaluate-rrf \                  │
│       --uuid <uuid> \                                            │
│       --stakeholders ./stakeholders.json \                       │
│       --ground-truth ./ground-truth-all.json                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  📊 評価結果出力                                                 │
│     - evaluation-results/evaluation-rrf-result-{timestamp}.json  │
│     - evaluation-results/evaluation-rrf-report-{timestamp}.txt   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
cd rag-evaluation
npm install
```

### 2. 環境変数の設定

`.env.local` または環境変数で以下を設定：

```bash
PINECONE_API_KEY=your_pinecone_api_key
OPENAI_API_KEY=your_openai_api_key
PINECONE_INDEX_NAME=ssr-knowledge-base
```

### 3. 優先度ファイルの配置（オプション）

`RAG評価データリスト.xlsx` を配置すると、優先度が自動設定されます。

---

## 📖 コマンド一覧

### export-all-csv - 全チャンクCSV出力【推奨】

全チャンクをCSV形式で出力します。優先度ファイルがあれば自動設定されます。

```bash
npx ts-node rag-evaluator.ts export-all-csv \
  --uuid "f7842a18-90b1-709f-4483-64254980393a" \
  --output ./all-chunks.csv
```

**オプション:**
| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--uuid` | ユーザーUUID（必須） | - |
| `--output` | 出力ファイルパス | `./all-chunks-for-labeling.csv` |
| `--stakeholders` | ステークホルダーID | `cxo,technical-fellows` |
| `--priority` | 優先度ファイル | `./RAG評価データリスト.xlsx` |

**出力CSVの形式（横並び）:**

| 列名 | 説明 |
|------|------|
| chunk_id | チャンクの識別子 |
| file_name | ファイル名 |
| chunk_index | チャンクのインデックス |
| content_preview | チャンク内容 |
| relevance_cxo | CxO向け関連度（自動設定） |
| relevance_technical-fellows | TF向け関連度（自動設定） |

### convert-all-csv - 横並びCSV → JSON変換

ラベリング済みCSVをGround Truth JSONに変換します。
**relevance >= 2 のみを正解として変換します。**

```bash
npx ts-node rag-evaluator.ts convert-all-csv \
  --input ./all-chunks.csv \
  --uuid "f7842a18-90b1-709f-4483-64254980393a" \
  --output ./ground-truth-all.json
```

### evaluate-rrf - RRF方式で評価【推奨】

実際のツールと同じRRF検索方式・動的K値で評価を実行します。

```bash
# CxO + TFの2ステークホルダーで評価
npx ts-node rag-evaluator.ts evaluate-rrf \
  --uuid "f7842a18-90b1-709f-4483-64254980393a" \
  --stakeholders ./stakeholders.json \
  --ground-truth ./ground-truth-all.json

# 全6ステークホルダーで評価
npx ts-node rag-evaluator.ts evaluate-rrf \
  --uuid "f7842a18-90b1-709f-4483-64254980393a" \
  --stakeholders ./stakeholders-all.json \
  --ground-truth ./ground-truth-all.json
```

### export-csv - 検索結果CSV出力（部分評価用）

動的K値で検索を実行し、取得チャンクのみをCSV出力します。

```bash
npx ts-node rag-evaluator.ts export-csv \
  --uuid "f7842a18-90b1-709f-4483-64254980393a" \
  --stakeholders ./stakeholders.json \
  --output ./chunks-for-labeling.csv
```

### convert-csv - CSV → JSON変換（部分評価用）

```bash
npx ts-node rag-evaluator.ts convert-csv \
  --input ./chunks-for-labeling.csv \
  --output ./ground-truth.json
```

### show-queries - クエリ生成確認

ステークホルダーから生成されるクエリを確認します。

```bash
npx ts-node rag-evaluator.ts show-queries \
  --stakeholders ./stakeholders.json
```

---

## 📊 評価指標

| 指標 | 説明 | 数式 |
|------|------|------|
| **Precision@K** | 取得したK件のうち、正解だった割合 | `\|Hit(K)\| / K` |
| **Recall@K** | 正解チャンクのうち、K件以内に取得できた割合 | `\|Hit(K)\| / \|Relevant\|` |
| **F1@K** | PrecisionとRecallの調和平均 | `2 * P * R / (P + R)` |
| **MRR** | 最初の正解が出現した順位の逆数の平均 | `1/\|Q\| * Σ(1/rank)` |
| **nDCG@K** | 正解の順位に重みをつけた品質指標 | `DCG@K / IDCG@K` |
| **Coverage** | どれだけ多様なファイルから情報を取得できたか | `\|Files_hit\| / \|Files_all\|` |
| **K値達成率** | 目標のK件を取得できたクエリの割合 | `Success / \|Queries\|` |

---

## 📝 関連度スコアの基準

| スコア | 記号 | 意味 | Ground Truth |
|--------|------|------|--------------|
| **3** | ◎ | 必須（高優先度） | ✅ 正解 |
| **2** | ○ | 重要（中優先度） | ✅ 正解 |
| **1** | △ | 背景情報程度（低優先度） | ❌ 除外 |
| **0** | - | 無関係 | ❌ 除外 |

**注**: Ground Truth変換時、`relevance >= 2` のみを正解として扱います。

---

## 📁 ファイル構成

```
rag-evaluation/
├── rag-evaluator.ts          # メインスクリプト（CLIエントリーポイント）
├── csv-exporter.ts           # CSV入出力・Ground Truth変換
├── metrics.ts                # 評価指標計算ロジック
├── types.ts                  # 型定義
├── query-enhancer-copy.ts    # クエリ生成ロジック（SSRツールからコピー）
├── rag-utils-copy.ts         # 動的K値計算ロジック（SSRツールからコピー）
│
├── stakeholders.json         # ステークホルダー定義（CxO + TFの2種）
├── stakeholders-all.json     # ステークホルダー定義（全6種）
├── RAG評価データリスト.xlsx   # 優先度マッピング（オプション）
│
├── package.json              # 依存関係
├── package-lock.json         # 依存関係ロック
├── tsconfig.json             # TypeScript設定
├── README.md                 # このファイル
│
├── evaluation-results/       # 評価結果出力ディレクトリ（自動生成）
│   ├── evaluation-rrf-result-*.json
│   └── evaluation-rrf-report-*.txt
│
└── (生成ファイル - Git除外推奨)
    ├── all-chunks.csv        # 全チャンクCSV
    └── ground-truth-all.json # Ground Truth JSON
```

---

## 🔍 部分評価 vs 完全評価

| 方式 | 部分評価 | 完全評価 |
|------|---------|---------|
| コマンド | `export-csv` | `export-all-csv` |
| ラベリング対象 | 取得K件のみ | 全チャンク（237件） |
| Recall計算 | 不正確（分母=取得K件） | 正確（分母=全正解数） |
| 作業時間 | 短い | 長い |
| 推奨用途 | 簡易テスト | **論文・正式評価** |

---

## 📈 評価結果の解釈

| 指標 | 良い値 | 解釈 |
|------|--------|------|
| Precision@K | 80%+ | 取得チャンクの質が高い |
| Recall@K | 設計次第 | 動的K値で意図的に絞っている場合は低くてもOK |
| nDCG@K | 0.7+ | 高優先度チャンクが上位に配置されている |
| MRR | 1.0 | 最重要チャンクが常に1位 |

---

## ⚠️ 注意事項

1. **環境変数**: Pinecone/OpenAI APIキーが必要です
2. **UUID**: 評価対象のユーザーUUIDを指定してください
3. **優先度ファイル**: `RAG評価データリスト.xlsx` のシート名は `ファイル一覧` である必要があります
4. **生成ファイル**: 以下はGitから除外推奨

```gitignore
# .gitignore
node_modules/
evaluation-results/
all-chunks.csv
ground-truth-all.json
ground-truth.json
chunks-for-labeling.csv
```

---

## 📋 クイックスタート

```bash
# 1. セットアップ
cd rag-evaluation
npm install

# 2. 全チャンクCSV出力（優先度自動設定）
#    ※ RAG評価データリスト.xlsx があれば自動で優先度が設定されます
npx ts-node rag-evaluator.ts export-all-csv \
  --uuid "your-uuid-here" \
  --output ./all-chunks.csv

# 3. Excelで確認・必要に応じて調整
#    - all-chunks.csv をExcelで開く
#    - 無関係なチャンクがあれば relevance を 0 に変更
#    - 保存（CSV UTF-8形式）

# 4. Ground Truth変換（relevance >= 2 のみ正解として変換）
npx ts-node rag-evaluator.ts convert-all-csv \
  --input ./all-chunks.csv \
  --uuid "your-uuid-here" \
  --output ./ground-truth-all.json

# 5. 評価実行
npx ts-node rag-evaluator.ts evaluate-rrf \
  --uuid "your-uuid-here" \
  --stakeholders ./stakeholders.json \
  --ground-truth ./ground-truth-all.json
```