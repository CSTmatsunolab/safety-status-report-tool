# GSN-Based Stakeholder View Generation: Future Work Memo

作成日: 2026-06-13

## 背景

現在の論文では、stakeholder profile と reference ratio `r` により、RAGで取得する証拠量や粒度を制御している。この方式は有効な初期設計だが、GSNが入力として利用できる場合には、GSNが本来持つ階層構造とサブツリー構造をより直接的に使える可能性がある。

## 中心アイデア

ステークホルダーをGSNの階層、ノード種別、またはサブツリーにマッピングし、そのマッピングに基づいて安全報告書の粒度と抽象度を制御する。

この方向では、stakeholder adaptation を単なる「取得チャンク数の調整」ではなく、GSN上の stakeholder-specific view generation として定義できる。これにより、GSNがどのように報告書構造やtraceabilityに寄与するかをより明確に説明できる。

## 想定されるロール別ビュー

- CxO: 上位Goal、主要Strategy、未解決リスク、意思決定に必要なSafety Status
- Business/Product: Goalから中位Strategy、事業影響、マイルストーン、残リスク
- Architect/Technical Fellows: Strategy、Context、Assumption、設計根拠、技術的リスク
- R&D/Engineer: Solution/Evidenceノード、検証結果、失敗原因、再試験条件

## 重要な設計上の注意

ステークホルダーを単一のサブツリーに閉じ込めると、重要な横断リスクを落とす危険がある。そのため、ロール別ビューとは別に、全レポートに必ず含める mandatory safety core を設けるべきである。

mandatory safety core の候補:

- 高severity hazard
- ASIL-D相当または最高リスク項目
- 未検証の安全要求
- open issue
- failed verification
- safety case全体の結論に影響するassumptionやcontext

この設計により、ロール別報告による情報非対称や重要情報の隠れを抑制できる。

## 実装案

1. GSN nodeまたはsubtreeに stakeholder relevance を付与する。
2. stakeholderごとに traversal depth、node type、必須ノード種別を定義する。
3. 選択されたGSN viewから linked evidence を取得する。
4. GSN viewを report outline に変換する。
5. linked evidenceを用いて、各ロールに適した抽象度でSafety Status Reportを生成する。

## 評価案

flat RAG、reference-ratio-based RAG、GSN-subtree-aware RAGを比較する。

評価指標の候補:

- traceability coverage
- critical risk omission rate
- role-appropriate abstraction
- cross-report consistency
- factual error rate
- stakeholder-perceived usefulness

## 研究上の位置づけ

この方向は、現在の stakeholder-adaptive RAG from documents を stakeholder-specific GSN view generation へ発展させるものである。RE@Next!後の拡張研究として、GSNの構造を活かしたrequirements communication、selective traceability、stakeholder alignmentの研究に接続しやすい。