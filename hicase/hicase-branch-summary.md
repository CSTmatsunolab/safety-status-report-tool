# hicaseブランチ実装まとめ

対象: `hicase` ブランチ（`main` から分岐後、2026-08-06〜2026-08-23の作業、+ 現在未コミットの追加分）

## 1. 背景・目的

同じGSN(Goal Structuring Notation)構造から、**役職(ステークホルダー)ごとに開示粒度の異なるSafety Status Report(SSR)を生成する**機能。単純な「経営層向けは短く/技術者向けは詳しく」ではなく、NASA Ames「Formal Foundations for Hierarchical Safety Cases」論文の hinode (higoal / histrategy / hievidence) open/closed の考え方を実装に落とし込んだ。設計の元になった資料は `hicase/report_structure.md` および同ディレクトリの参考論文PDF2本。

## 2. 作業の流れ(コミット単位)

### (1) GSN構造の表示処理 — 2026-08-06 (`d8a2ed8`)
- フロントエンドでアップロードしたGSN文書の構造を**生成前にプレビュー**できるようにするため、Lambda側の `gsn/parser.ts` を `src/lib/gsn/` に手動同期コピー。
- `GSNStructureView.tsx`（ツリー表示、種別/ステータス集計、Mandatory Safety Coreパネル）、`GSNStructureEditor.tsx`、`src/lib/gsn/analyze.ts`（ツリー構築・カウント）、`serialize.ts` を新規追加。
- 以降、`lambda/src/lib/gsn/` と `src/lib/gsn/` は**バイト単位で手動同期する運用**が確立(先頭コメント数行のみ差異許容)。

### (2) hicase設計書 — 2026-08-11 (`168d612`)
- `hicase/report_structure.md` を作成。ステークホルダー別の hinode 開閉マッピング表、レポート構造の具体例(CxO/Business/Technical Fellows/Architect/R&D)、設計原則を明文化。
- 参考論文2本(`Formal Foundations for Hierarchical Safety Cases.pdf` 等)を同ディレクトリに追加。

### (3) hicase実装 + GSNパーサー全面改善 — 2026-08-11 (`88354d2`)
最大の変更コミット(16ファイル、+2450/-465行)。2つの改善を同時に実施:

**a. GSNパーサーの全面書き換え**（`parser.ts`、lambda/src両方）
検証用GSN文書で Solution/Evidence の行が丸ごと消失し、単一ルートのはずが5ルートに割れるという精度問題を修正。
- 空セルを保持する行分割(列ずれ解消)
- 先頭セルがノードIDならヘッダー行と誤認しない判定
- 列見出しの優先順マッチ(`id`の部分一致が"Evidence"に誤ヒットする問題を解消)
- **ツリー記法のインデントから親子関係を復元**(従来は階層情報を一切使わずフラットに解析していた)
- 見出しからの種別推定、severityのstrict/loose 2段判定、`ng`部分一致など単語境界の修正
- ルートからのBFSで実depthを算出、存在しない親を参照するノードもルート扱い
- 兄弟表示順: Context/Assumption/Justification をStrategy枝より前に配置する `compareNodeIds` を整備
- 既知2バグ(ヘッダー誤判定・親ID切り詰め `Sn1`→`n1`)を解消。旧版評価データはこの書き換え前の解析結果なので単純比較不可。

**b. hicase(hinode open/closed)機能の新規実装**
- 型定義追加: `HiNodeType`, `HiCaseStakeholderConfig`, `HiCaseNode`, `HiCaseView`(`types.ts`)
- コアロジック新規: `hicase-view.ts` — ノードは到達すれば必ず見出しとして出し、「型のopen/close」は**同じ型が連続する場合の再帰のみ**を制御(型をまたぐ遷移は常に見出し化)。mandatory safety coreは該当ノードへの祖先チェーンを強制開放。
- アウトライン生成: `outline-generator.ts` に `generateOutlineFromHiCaseView` を追加(既存の `generateOutlineFromGSNView` はフォールバックとして温存)
- パイプライン統合: `lambda/src/index.ts` に `hicaseView` 構築を追加、失敗時は既存GSN try/catchでフォールバック
- プロンプト側: `report-prompts.ts`/`-en.ts` の見出し認識正規表現を、hicaseの階層採番付き見出し(`"2.1 S1: ..."`)に対応させて修正
- フロントエンド: `GSNStructureView.tsx` にステークホルダー選択→open/closed/強制開放バッジ表示のプレビューを追加

### (4) 構成外セクション生成の抑制 — 2026-08-19 (`676fc02`)
実文書での検証で、アウトライン7章に対し実際は9章+付録が生成される不具合が発覚。原因は、内容ガイド用プロンプト(`generateGSNAnalysisPrompt`等)が独自の`##`見出しを出力し、それが「レポート構成」と競合する**第2のセクション定義**として読まれていたこと。
- `generateGSNAnalysisPrompt` / `generateRiskAnalysisPrompt`: hicase由来アウトライン使用時は見出しを外し「記述内容の指針」として提示するよう変更
- `generateFigureRequirementsPrompt`: 図表の最低数を、実際に図表を置ける([要約のみ]でない)セクション数に連動させ、図表のためだけの章新設を防止
- `generateMandatoryCorePrompt`: `mandatoryCoreDetail`(CxOなら`count`、R&D等なら`full`)を反映して記述粒度を制御し、セクション新設の根拠にしないことを明記
- `generateOutlineFromHiCaseView`: Mandatory Safety Coreセクションをアウトライン末尾に明示追加(アウトラインに無いとAIが自作していたため)

### (5) 分量指定由来の構成外セクション修正 — 2026-08-19 (`60216c4`)
同根の問題の第2波。分量ブロックの「セクション目安」と冗長防止規則の「役割分担表」が、構成遵守ルールが名指しで禁止しているセクション名(エグゼクティブサマリー等)をそのまま列挙しており、**同一プロンプト内で自己矛盾**していた。
- `generateOutputConstraints`: hicase由来構成では固定セクション名を列挙せず、確定済み見出し数(展開セクション数×目安文字数＋[要約のみ]見出し数×目安文字数)から分量を算出。「分量目標のために章を追加してはならない」「構成遵守ルールを優先」を明記
- `generateRedundancyPreventionPrompt`: 役割分担表をノード種別ベース(Goal/Strategy/Context/Solution/Mandatory Core/[要約のみ])に差し替え

## 3. 未コミットの追加作業(論文準拠化 / 2026-08-23)

`hicase/report_structure.md` に「6. 論文定義との対応」を追記し、論文の形式的定義に合わせて2点を実装(作業ツリーに変更あり、未コミット):

1. **hievidenceのclose条件を厳格化** — 配下にUndeveloped/partial/unachieved/検証失敗を含まない「完全展開済み(fully developed)の証拠連鎖」のみをclose可能とし、そうでない場合は役職設定に関わらず展開して見出しに `[未完成の証拠連鎖 - 展開]` を付与(`isFullyDevelopedEvidenceChain`)。
2. **Context/Assumption/Justification/Undeveloped の親hinode継承** — これらは独自の型を持たないため、内包する親hinodeのopen/closedを継承。親がclosedなら独立見出しにせず `absorbedNodes` として吸収し、親の見出しに `◇ 内包する前提・文脈:` の注記を付与(mandatory core該当分は重複を避け `⚠ mandatory core:` 側に寄せる)。
3. UIバッジ(`GSNStructureView.tsx`)、マーカー説明(`report-prompts*.ts`)も追随して更新。

**既知の未実装差分**: 論文のhinodeは「フラグメントをまとめて包む実体」で閉じるとフラグメント全体が1ノードになるが、本実装は**ノード単体の型ラベル**でありcloseは同型連鎖の再帰のみを止める(型をまたぐ降下は常に見出し化)。フラグメント単位の閉じ・hinodeの入れ子・階層関係の演算子は未実装。CxOの圧縮は実質 `maxDepth=2` が担っている。

## 4. 全体アーキテクチャ(3段フォールバック)

```
hicaseView 構築成功 → generateOutlineFromHiCaseView（役職別open/closed反映）
       ↓ 失敗
generateOutlineFromGSNView（旧・GSN全体アウトライン、役職差なし）
       ↓ GSN解析自体が失敗 / GSNファイル無し
静的テンプレート（report-structures.ts、フラットRAG）
```
RAG検索(`performGSNSubtreeAwareSearch`)や `generateStakeholderGSNView` は変更していない。hicaseは**アウトライン生成(見出し構造)にのみ影響する独立レイヤー**として追加された。

## 5. ステークホルダー別の開閉マッピング(設計の核)

| ステークホルダー | higoal | histrategy | hievidence | 深さ | mandatory coreの扱い |
|---|---|---|---|---|---|
| CxO | close | close | close | 1〜2段 | 件数+参照リンクに圧縮 |
| Business/Product | close | open | close | 3段程度 | 1文要約+参照 |
| Technical Fellows | open | open | close | 5段程度 | 本文にそのまま展開 |
| Architect | open | open | close | 5段程度 | 本文にそのまま展開(担当領域中心は未実装、Technical Fellowsと同一設定) |
| R&D/Engineer | open | open | open | 制限なし | 再検証条件まで展開 |

## 6. 影響ファイル一覧(手動同期含む)

- `lambda/src/lib/gsn/{parser,types,hicase-view,outline-generator,mandatory-core,index}.ts` ⇄ `src/lib/gsn/{同名}.ts`(手動同期、独立ビルド)
- `lambda/src/lib/report-prompts.ts` / `report-prompts-en.ts`(日英で構成遵守ルール・分量指定・冗長防止ロジックを個別実装)
- `lambda/src/index.ts`(パイプライン統合)
- `src/app/components/GSNStructureView.tsx`, `src/app/page.tsx`(プレビューUI)
- `hicase/report_structure.md`(設計書)

## 7. スライド化する際の切り口案

1. 課題設定: 役職ごとに欲しい情報粒度が違う → 単一GSNからどう出し分けるか
2. 理論的裏付け: Hierarchical Safety Cases論文のhinode open/close概念
3. アーキテクチャ図: 3段フォールバック
4. 実装のポイント: 型境界のopen/close、mandatory coreの強制開放と圧縮表現
5. つまずいた点と対処: 構成外セクション生成問題(2回の修正が必要だった)とその原因(プロンプト内の第2のセクション定義との衝突)
6. 論文準拠のブラッシュアップ: fully developed evidence chain / context-assumption継承
7. 今後の課題: フラグメント単位の閉じ、hinodeの入れ子、Architectの担当領域絞り込み
