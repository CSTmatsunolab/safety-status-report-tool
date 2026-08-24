# ステークホルダごとのレポート構造の違い

## 1. 基本方針

同じGSN(hicase化済み)構造から、hinode(higoal / histrategy / hievidence)の
open / close 判定・深さ・mandatory safety core の扱いを変えることで、
役職ごとに異なる粒度のレポートを生成する。

- **close** → 見出し1つ + 要約1段落のみ
- **open** → 見出し + 子要素を再帰的に展開
- **mandatory core** → 深さ・型の設定に関係なく、該当ノードへの祖先チェーンを強制的に開く

## 2. ステークホルダ別 hinode 開閉マッピング

| ステークホルダ | higoal | histrategy | hievidence | 深さ | mandatory coreの扱い |
|---|---|---|---|---|---|
| CxO | close | close | close | 1〜2段(最上位のみ) | 経路を強制開放するが、要約は件数・見出しレベルに圧縮(例:「重大リスク◯件」) |
| Business/Product | close | open | close | 3段程度 | 経路を強制開放し、要約に「何が/なぜ未解決か」を1文添える |
| Technical Fellows | open | open | close | 5段程度 | 経路を完全開放し、assumption自体も要約に圧縮せず本文に残す |
| Architect | open | open | close | 5段程度(担当領域中心) | 経路は開放するが、担当領域外のcoreは要約参照のみ |
| R&D/Engineer | open | open | open | 制限なし(最深部まで) | 経路を開放し、該当evidenceの再検証条件まで本文に展開 |

## 3. レポート構造としての現れ方

### CxO
```
1. 避回避機能の受容性(root goal)
   要約: [1段落。安全と言えるか/言えないかの結論のみ]
2. 手続き的実装の保証(HG2, closed)
   要約: [1段落]
   ⚠ mandatory core: 重大リスク1件(詳細はArchitect版参照)
3. 技術的実装の保証(HG1, closed)
   要約: [1段落]
```
- 見出し階層は浅い(1〜2階層)
- 本文はほぼ要約段落のみ、図表なし
- mandatory core項目は件数と参照リンクのみで表示

### Business/Product
```
2. 手続き的実装の保証(HG2, open)
   2.1 論拠: オペレーター指向回避の議論(HS1, open)
       要約: [議論の骨格。事業影響・マイルストーンに言及]
   2.2 位置情報に基づく手続き(HE2, closed)
       要約: [1段落]
```
- histrategyは開くが、hievidenceは閉じたまま
- 本文に事業影響・残リスクの言及を含める

### Technical Fellows / Architect
```
2. 手続き的実装の保証(HG2, open)
   2.1 論拠: オペレーター指向回避の議論(HS1, open)
       2.1.1 前提: RADARシステムは信頼できる(A2)
             ⚠ mandatory core: 未検証
       2.1.2 コンテキスト: 回避手続きの定義(C8, C9)
   2.2 位置情報に基づく手続き(HE2, closed)
       要約: [検証完了の1段落]
```
- higoal / histrategyまで開き、設計根拠(context/assumption)を本文に残す
- hievidenceは閉じ、検証結果は要約のみ
- Architectは担当領域内で完全展開、領域外は要約参照のみに留める

### R&D/Engineer
```
2.2 位置情報に基づく手続き(HE2, open)
    E1: 検証項目3.3.3(c) — [検証データ、失敗有無、再試験条件]
    E2: 検証項目3.3.3(e) — [検証データ、失敗有無、再試験条件]
```
- hievidenceまで完全に開き、生データ・再検証条件を本文に展開
- 議論の過程(histrategy)は要点のみで良い

## 4. 構造上の違いのまとめ

| 観点 | CxO | Business/Product | Technical Fellows/Architect | R&D/Engineer |
|---|---|---|---|---|
| 見出し階層の深さ | 浅い(1〜2) | 中程度(2〜3) | 深い(3〜4) | 最深部まで |
| 重視する内容 | 結論のみ | 議論の骨格+事業影響 | 設計根拠・前提条件 | 検証データそのもの |
| 証拠(hievidence)の扱い | 常にclose | 常にclose | close(要約のみ) | open(生データ展開) |
| mandatory coreの表現粒度 | 件数+参照リンク | 1文要約+参照 | 本文にそのまま展開 | 再検証条件まで展開 |
| レポート全体の分量 | 最小 | 小〜中 | 中〜大 | 最大 |

## 5. 設計上のポイント

1. **深さと型は独立した軸** — 深さが同じでも、型ごとにopen/closeを変えることで役職ごとの重視点を反映できる
2. **mandatory coreは全役職共通の下限ライン** — ただし「開いたときにどこまで詳細を見せるか」は役職ごとに調整する
3. **hinode境界で開閉するため、どの役職向けでも論証として尻切れにならない**(Theorem 5: 任意のviewは常に整形式な安全性証明である)

## 6. 論文定義との対応(実装済みの制約 / 2026-08-23)

論文(Formal Foundations for Hierarchical Safety Cases)の定義に合わせて、以下2点を実装済み。

1. **hievidenceは「完全展開済み(fully developed)の証拠連鎖」だけを閉じられる**
   配下に Undeveloped ノード / status=partial・unachieved / 検証失敗 のいずれかを含む証拠連鎖は、
   役職設定が close でも展開する(見出しに `[未完成の証拠連鎖 - 展開]` を付与)。
   status=unknown はパーサーの既定値なので未完成扱いにしない。
   深さ上限(maxDepth)はプロジェクト側の予算なので、この条件では上書きしない。
2. **context/assumption/justificationはhinodeの内部要素**
   型を持たないノードは、内包するhinodeの open/close を継承する。
   親が閉じている場合は独立見出しにせず、親の見出しに `◇ 内包する前提・文脈: ...` として注記し、
   親セクションの要約で触れさせる(depthで打ち切られた場合は従来どおり注記なしで落とす)。
   mandatory core に該当するノードは `⚠ mandatory core:` 注記側に寄せて二重列挙しない。

**未実装の差分**: 論文のhinodeは「hierarchisationでフラグメントを包んだ実体」であり、閉じると
フラグメント全体が1ノードになる。本実装のhinodeはノード単体の型ラベルで、close が止めるのは
同型連鎖の再帰のみ(Goal→Strategy等の型をまたぐ降下は常に見出しになる)。したがってCxOの圧縮は
実質 maxDepth=2 が担っている。フラグメント単位の閉じ・hinodeの入れ子・階層関係 ≤ は未実装。