# Formal Foundations for Hierarchical Safety Cases — 論文まとめ

**著者**: Ewen Denney, Ganesh Pai (NASA Ames Research Center), Iain Whiteside (Newcastle University)

## 1. 背景・動機

- 安全性証明(safety case)は、原子力・防衛・航空など安全重要分野で規制上必須になりつつある
- Goal Structuring Notation(GSN)という図式表記法が広く使われているが、**半形式的**であり、形式的な検証がされていない
- システム全体の安全性証明は膨大な情報(ハザード分析、要求分析、テスト、形式検証など)を集約するため、理解・査読・維持が困難
  - 例:空港監視の予備安全性証明は約200ページ
- 詳細化が進むほど階層構造が見えにくくなり、低レベルの主張がシステム安全性全体とどう関係するか把握しづらくなる
- 著者らのツール**AdvoCATE**は安全性証明の構築を自動化できるが、その裏付けとなる形式的仕様が実装に追いついていなかった

## 2. 提案:hicase(階層的セーフティケース)

GSNの基本要素(ゴール・戦略・証拠・コンテキスト・前提・正当化)を保ちつつ、**hinode(階層ノード)**という新しい概念を導入する。

### hinodeの3種類

| 種類 | 中身 | 役割 |
|---|---|---|
| **higoal** | ゴールの連鎖全体 | 高レベルの主張だけを見せ、全体像を把握させる |
| **histrategy** | 補助的な戦略の連鎖、または関連する戦略適用の集約 | 枝分かれを減らし、主論拠に集中させる |
| **hievidence** | 完全に展開された(未展開要素のない)証拠連鎖 | 検証済みで安定した部分を1ノードに圧縮する |

- 各hinodeは**open(開いた)/ closed(閉じた)**の2つのviewを持つ
- closedなhinodeは、通常のノード(goal/strategy/evidence)と同じ入出力の型を持つため、閉じても論証の接続関係が壊れない
- hinodeは入れ子にでき、木のあらゆる場所(ルート付近・中腹・葉付近を問わず)に作成できる

### 抽象化を制限する条件

- 入出力ノードの型が、通常のgoal/strategy/evidenceと整合していること
- 連結されていないフラグメントは抽象化できない(入力ゴールから全出力へのパスが必要)
- context・assumption・justificationは常にhinodeの中に置かれ、hinodeそのものにはならない(必ず葉)
- hinodeは他のhinodeに包含されうる(入れ子構造)

## 3. 形式化

### 3.1 平坦な安全性証明(Definition 1: Partial Safety Case)

安全性証明を、ラベル付き木 `⟨N, l, →⟩` として定義する。

- `N`:ノード集合
- `l : N → {s, g, e, a, j, c}`(strategy, goal, evidence, assumption, justification, context)
- `→`:接続関係(connector)
- 条件:各部分木の根はgoalである/接続はstrategyかgoalからしか出ない/goalはgoalに接続しない/strategyはstrategyやevidenceに接続しない、など

### 3.2 完全に展開された安全性証明(Definition 2: Fully Developed)

すべてのgoalから、いずれかのevidenceに到達できる場合、その安全性証明は「fully developed」であるという。

### 3.3 階層的安全性証明(Definition 3: Partial Hierarchical Safety Case)

平坦な安全性証明の定義に、階層関係 `≤`(半順序)を加えた `⟨N, l, →, ≤⟩` として定義する。`n < n′` は「ノードnがn′の中にある」ことを意味する。

- `→` と `≤` の間には5つの整合条件があり、これによって「階層をすべて展開すると元の平坦な安全性証明に戻る」ことが保証される
- 条件(5)により、higoal/histrategy/hievidenceになるための厳密な基準が定まる(内部構造から型が一意に決まる)

### 3.4 主要な性質・定理

| 定理 | 内容 |
|---|---|
| **Theorem 1(Mutual Exclusivity)** | 任意の階層ノードは、higoal/histrategy/hievidenceのうち1つの型としてしか成立しない(曖昧さがない) |
| **Theorem 2(Skeleton)** | hicaseにskeleton操作(階層を展開する操作)を適用すると、必ず整形式な平坦の安全性証明になる |
| **Theorem 3(Correctness of Hierarchisation)** | 安全性証明のフラグメントを新しいhinodeで包む操作(hierarchisation)は、常に整形式なhicaseを生成し、かつskeletonを保存する(元の平坦構造と論理的に同じ) |
| **Theorem 4(A Skeleton is a View)** | skeleton操作は、view(階層を通した特定の切り口)の特殊ケースである |
| **Theorem 5(A View is a Safety Case)** | 任意のview(hinodeの一部を開き、一部を閉じた状態)は、常にゴールを根に持つ整形式な安全性証明そのものになる |

### 3.5 view(Definition 9)

`≤`の下で互いに比較不可能な(incomparableな)ノード集合`N′`を選ぶことで、階層を通した特定の切り口(view)を定義する。skeletonはこのviewの特殊ケース(すべてのhinodeを開いた状態)にあたる。

### 3.6 hierarchisation(Definition 7・8)

- **Hierarchisable Fragment**:根がstrategyなら葉がstrategy/evidenceのみ、根がgoalなら葉がgoal/evidenceのみ、という条件を満たすフラグメントは階層化可能
- **Hierarchisation操作**:上記条件を満たすフラグメントを、新しいhinodeで包み込む操作。この操作を行っても、元の平坦な安全性証明との対応関係(skeleton)は保たれる(Theorem 3)

## 4. 実装(AdvoCATE)への適用

- 実際のUAS(無人航空機)の地上型検知・回避(GBDAA)機能の安全性証明を例に使用
- Fig.1(45ノードのフラットな構造)に対して階層化を適用し、hinodeを閉じていくことで**45ノード → 6ノード**まで圧縮
- open viewとclosed viewの実装は、論文のview定義(Definition 9)にほぼ一致する。唯一の違いは、AdvoCATEのopen viewは開いたhinodeの中身を可視のまま保持するのに対し、形式的なviewの定義自体には「可視性」の概念がない点

## 5. 関連研究との違い

| 比較対象 | 違い |
|---|---|
| Hiproofs(階層的証明木) | hicaseの着想元だが、ノードの型付けを持たず、より一般的なモデル |
| GSNのmodule概念 | moduleは他モジュールへの参照(away node)にすぎず、既存の議論構造を包み込むhinodeとは異なる。moduleは複数の根を持てるが、hinodeは常に単一の根を持つ |
| 深さベースの既存階層化手法[16] | hievidence相当は作れるが、histrategy(未完了の議論の抽象化)はできない |

## 6. 結論・今後の課題

- hicaseの理論的基盤(skeleton操作、view、階層化の正しさ)を形式的に定義・証明した
- 今後の課題:
  1. パターンやモジュールへのhierarchyの概念の拡張
  2. メタデータなどを用いた階層構造の自動学習(既存の安全性証明からhierarchical patternを抽出する)
- 形式的基盤とツールサポートの両方が、安全重要製品の認証における議論の信頼性向上に不可欠であるとしている