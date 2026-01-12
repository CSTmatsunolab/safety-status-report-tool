# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIを活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSV、Excel、Word、HTML、Markdown、画像ファイル（JPG, PNG等）など多様な形式に対応
- **推奨ファイル形式ガイド**: アップロードセクションからアクセス可能な品質向上ガイド
- **PDF変換推奨**: PDF形式の構造情報損失を警告し、DOCX/Markdown変換を案内
- **OCR機能**: Google Cloud Vision APIを使用した画像・画像ベースPDFからのテキスト抽出
- **大容量ファイル対応**: 4MBを超えるファイルも安全に処理
- **構造認識型チャンキング**: 見出し・表・セクションを認識した高精度な文書分割
- **Markdown統一変換**: DOCX/HTML/TXTをMarkdown形式に変換し、構造を保持
- **表の自動検出**: Markdownテーブル、タブ区切り表、HTMLテーブルを自動認識・保護
- **安全性ID強調**: H-001、SR-101、R-001などの安全性IDを太字で強調表示
- **知識ベース機能**: ハイブリッド検索（密ベクトル+疎ベクトル）による高精度な情報抽出
- **認証機能**: メールアドレスベースのユーザー認証（オプション）
- **ユーザー分離機能**: 認証ユーザーと未認証ユーザーで独立したデータ空間を提供
- **知識ベース管理**: UIから知識ベースの構築・削除が可能
- **登録済みファイル一覧**: 知識ベースに登録されているファイルとアップロード日時を表示
- **ファイル自動上書き**: 同じファイル名を再アップロードすると、古いデータを自動削除して更新
- **動的な情報抽出**: ドキュメント量とステークホルダーに応じた最適な情報量の調整
- **全文使用機能**: 重要なファイルを確実にAIに渡すための全文コンテキスト使用オプション
- **コスト保護機能**: 全文使用ファイルの文字数制限・ファイル数制限による自動コスト管理
- **ステークホルダー別レポート**: カスタマイズ可能なステークホルダーグループ向けのレポート生成
- **ステークホルダー管理**: ステークホルダーの追加・編集・削除機能
- **構成カスタマイズ機能**: レポート構成の追加・編集・削除機能
- **レトリック戦略**: ステークホルダーに応じた説得手法（データ駆動型、論理的推論型など）の自動選択
- **AI活用**: Claude APIを使用した高品質なレポート作成
- **ストリーミング生成**: リアルタイムでレポート生成状況を表示
- **読了時間最適化**: ステークホルダーに応じた適切なレポート分量の自動調整
- **多様な出力形式**: PDF、HTML、Word（docx）形式でのダウンロード
- **PDF日本語対応**: Google Fontsを使用した日本語ヘッダー/フッターの正確なレンダリング
- **レポート履歴機能**: 生成したレポートをクラウドに保存し、いつでも閲覧・エクスポート可能（ログイン必要）
- **履歴管理機能**: 日時でのソート、ステークホルダーでの絞り込みフィルター
- **編集機能**: 生成後のレポートを手動で編集可能
- **多言語対応 (i18n)**: 日本語と英語のUI・レポート出力に対応
- **ダークモード機能**: ダークモードに切り替え可能
- **設定メニュー**: 右上固定のハンバーガーメニューから各種設定にアクセス

## 始め方

### 前提条件

- Node.js 18.0.0以上
- npm または yarn
- Anthropic Claude APIキー
- OpenAI APIキー（エンベディング用）
- Google Cloud Vision APIキー（OCR用）
- **AWS S3バケット**（大容量ファイル処理用）
- **AWS Cognito User Pool**（認証機能用、オプション）
- **AWS SAM CLI**（Lambda Function デプロイ用）
- Pinecone APIキー

### インストール手順

#### 1. リポジトリのクローン
```bash
git clone https://github.com/CSTmatsunolab/safety-status-report-tool.git
cd safety-status-report-tool
```

#### 2. 依存関係のインストール
```bash
# Next.js (フロントエンド)
npm install

# Lambda Function
cd lambda
npm install
cd ..
```

#### 3. 環境変数の設定

##### Next.js用 (.env.local)
プロジェクトルートに`.env.local`ファイルを作成：
```bash
# 必須
ANTHROPIC_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Lambda Function URL（レポート生成用）
NEXT_PUBLIC_LAMBDA_FUNCTION_URL=https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws/

# OCR機能用（画像/画像ベースPDF処理に必要）
GOOGLE_CLOUD_VISION_KEY='{ "type": "service_account", ... }'

# チャンキング戦略設定
USE_ADVANCED_CHUNKING=true

# ベクトルストア設定
VECTOR_STORE=pinecone
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=ssr-index
CLEAR_NAMESPACE_BEFORE_INSERT=false

# AWS S3設定
APP_AWS_REGION=your_s3_bucket_region
APP_AWS_ACCESS_KEY_ID=your_aws_access_key_id
APP_AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
APP_AWS_S3_BUCKET_NAME=your_s3_bucket_name

# S3クリーンアップAPI用
CLEANUP_AUTH_TOKEN=your_secure_random_token
```

##### Lambda用 (template.yaml)
Lambda Function の環境変数は`lambda/template.yaml`で設定：
```yaml
Environment:
  Variables:
    ANTHROPIC_API_KEY: !Ref AnthropicApiKey
    OPENAI_API_KEY: !Ref OpenAIApiKey
    PINECONE_API_KEY: !Ref PineconeApiKey
    PINECONE_INDEX_NAME: safety-status-report-tool
    S3_BUCKET_NAME: your-s3-bucket-name
    ENABLE_HYBRID_SEARCH: 'true'
```

#### 4. Lambda Function のデプロイ

```bash
cd lambda

# ビルド
sam build

# デプロイ（初回は --guided オプション推奨）
sam deploy --guided

# 2回目以降
sam deploy
```

デプロイ後、出力される Lambda Function URL を `.env.local` の `NEXT_PUBLIC_LAMBDA_FUNCTION_URL` に設定します。

#### 5. Google Cloud Vision APIのセットアップ

- Google Cloud Consoleでプロジェクトを作成し、Vision APIを有効化します
- サービスアカウントキー（JSON）を作成し、`GOOGLE_CLOUD_VISION_KEY`環境変数に設定します

#### 6. AWS S3のセットアップ

- AWSコンソールでS3バケットを作成します
- IAMユーザーを作成し、S3バケットへの `PutObject`, `GetObject`, `DeleteObject`, `ListBucket` 権限を付与します
- バケットのCORS設定を行い、アプリケーションのドメインからの `PUT` リクエストを許可します
- IAMユーザーのアクセス情報を `.env.local` に設定します

#### 7. 開発サーバーの起動
```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

### ビルドと本番環境

```bash
# プロダクションビルド
npm run build

# 本番サーバーの起動
npm start
```

## 使い方

### 基本的な使用フロー

1. **ドキュメントのアップロード**: GSNファイル、議事録、仕様書などをアップロードします
2. **ステークホルダーの選択**: デフォルトまたはカスタムステークホルダーから対象を選択します
3. **構成の選択**: 推奨構成、またはカスタム構成を選択します
4. **ナレッジベース構築**: 「知識ベースを構築」ボタンをクリック（知識ベース使用時）
5. **レポート生成**: 「レポートを生成」ボタンをクリックします
6. **レポートの編集・出力**: 生成されたレポートを編集、またはPDF、HTML、Word形式でダウンロードします
7. **履歴に保存**: 「履歴に保存」ボタンをクリックして、レポートをクラウドに保存します（ログイン必要）

### 推奨ファイル形式

ファイル形式によって、AIがドキュメントの構造（表・見出し・リスト）をどれだけ正確に理解できるかが変わります。

| 形式 | 構造保持 | 推奨度 | 備考 |
|------|----------|--------|------|
| **Markdown (.md)** | ◎ 完全 | ⭐⭐⭐ | 最も推奨。構造が明確 |
| **Word (.docx)** | ◎ 完全 | ⭐⭐⭐ | 表・見出しを正確に認識 |
| **HTML (.html)** | ○ 良好 | ⭐⭐ | Webページからの変換に |
| **テキスト (.txt)** | △ 部分的 | ⭐ | タブ区切り表は認識可能 |
| **CSV / Excel** | ◎ 完全 | ⭐⭐⭐ | 表データに最適 |
| **PDF (.pdf)** | × 失われる | 非推奨 | 変換を推奨 |

PDFファイルをアップロードすると、ファイル名の横に警告アイコン（⚠️）が表示されます。クリックすると変換方法の案内が表示されます。

詳細は「アップロードガイド」（❓アイコンからアクセス）を参照してください。

### 知識ベース管理機能

#### 登録済みファイル一覧
ステークホルダーを選択すると、知識ベース管理エリアに「登録済みファイル」セクションが表示されます。

- **ファイル名とアップロード日時**: 知識ベースに登録されている全ファイルを確認可能
- **折りたたみ表示**: クリックで展開/折りたたみ
- **ファイル数表示**: 登録ファイル数がリアルタイムで表示

#### ファイル自動上書き機能
同じファイル名のドキュメントを再アップロードすると、古いデータが自動的に削除され、新しいデータで上書きされます。

- **重複防止**: 同名ファイルのベクトルデータが重複しない
- **最新データ維持**: 常に最新のファイル内容が知識ベースに反映
- **手動削除不要**: 更新時に古いデータの削除を意識する必要なし

#### 知識ベースの削除
「リセット」ボタンで、選択中のステークホルダーの知識ベースを削除できます。

- **削除確認**: 登録ファイル数を確認した上で削除を実行
- **ステークホルダー別管理**: 各ステークホルダーの知識ベースは独立して管理

### レポート履歴機能

#### 概要
生成したレポートをクラウド（AWS DynamoDB + S3）に保存し、いつでも閲覧・エクスポートできる機能です。ログインが必要です。

#### 保存される情報
- **レポート本文**: Markdownテキスト（S3に保存）
- **メタデータ**: タイトル、ステークホルダー、レトリック戦略、作成日時
- **入力ファイル情報**: アップロードしたファイル名 + 知識ベースに登録されたファイル名

#### 履歴の保存方法
1. レポート生成後、プレビューセクション右上の「履歴に保存」ボタンをクリック
2. 保存完了すると「保存完了」と表示されます

#### 履歴一覧ページ
設定メニュー（≡）から「レポート履歴」をクリックすると、保存済みレポートの一覧が表示されます。

##### 機能
- **日時ソート**: 「新しい順」「古い順」でソート切り替え
- **ステークホルダーフィルター**: 特定のステークホルダーで絞り込み
- **レポート詳細**: タイトルをクリックして詳細ページへ
- **削除**: 不要なレポートを削除

#### 履歴詳細ページ
各レポートの詳細ページでは以下の操作が可能です：

- **エクスポート**: Markdown、Word、HTML、PDF形式でダウンロード
- **印刷**: ブラウザの印刷機能でプリント
- **入力ファイル確認**: 折りたたみ式でファイル一覧を表示
  - 「全文使用」バッジ: 全文使用で処理されたファイル
  - 「RAG」バッジ: 知識ベースから検索されたファイル

### 全文使用機能について

#### 概要
アップロードした各ファイルに対して「全文使用」トグルスイッチを提供。これにより、特定のファイルの全内容を確実にAIのコンテキストに含めることができます。

#### GSNファイルの推奨設定
GSNファイルがアップロードされると、以下の推奨設定が表示されます：
- **GSNにチェック**: レポート構成にGSN分析セクションが追加されます
- **全文使用ON**: GSNは構造が重要なため、全文使用を推奨
- **D-Case Communicator**: GSNファイルは[D-Case Communicator](https://www.matsulab.org/dcase/login.html)で作成し、「Export LLM Input Text」機能で出力されるテキストファイルを使用することをお勧めします

#### 使用推奨ケース
- **GSNファイル**: 構造的な関係性が重要な文書（**特に推奨**）
- **数値データ**: CSV、Excelファイルなど数値が重要なファイル
- **小容量ファイル**: 5,000文字以下のファイル
- **重要な仕様書**: 詳細な技術仕様が記載された文書

#### 動作の仕組み
- **全文使用ON**: ファイルの全内容をそのままAIに渡す（知識ベースを経由しない）
- **全文使用OFF**: 知識ベースから関連部分のみを抽出してAIに渡す（デフォルト）

#### 対応ファイル形式
| 形式 | AIへの出力フォーマット |
|------|----------------------|
| txt | そのままテキスト |
| xlsx/xls | `=== Sheet 1: シート名 ===`（シート別） |
| docx | 抽出テキスト |
| pdf | `=== PDF Document: ファイル名 ===`<br>`(Total pages: N)`（ページ数付き） |

#### コンテキスト制限とコスト保護

##### 文字数制限
| 項目 | 制限値 |
|------|--------|
| 1ファイルあたり最大文字数 | 50,000文字 |
| 全体最大文字数 | 100,000文字 |
| 「大きいファイル」の閾値 | 50,000文字以上 |

##### ファイル数制限
- **大きいファイル（5万文字以上）の全文使用**: 最大2個まで
- 3個以上選択すると、最初の2個のみが全文使用され、残りは知識ベースから関連部分を抽出

##### 事前警告ダイアログ
レポート生成前に以下の確認が表示されます：

1. **切り詰め警告**: 5万文字を超えるファイルがある場合
   ```
   【確認】以下の全文使用ファイルは5万文字を超えています：
   ・data.csv（120,000文字）
   これらのファイルは5万文字まで切り詰められます。
   続行しますか？
   ```

2. **大きいファイル数の警告**: 大きいファイルが3個以上の場合
   ```
   【警告】大きなファイル（5万文字以上）の全文使用が3個選択されています。
   処理負荷を軽減するため、最初の2個のみが全文使用されます。
   残りのファイルは関連部分のみ抽出されます。
   続行しますか？
   ```

##### コスト目安
| 設定 | 1回あたりコスト目安 |
|------|---------------------|
| 推奨設定（5万文字制限） | 約 $0.54 |

#### 全文使用機能の注意点

##### メモリ不足エラー
大量のファイルで全文使用を有効にすると、コンテキスト制限を超える可能性があります。
- エラーメッセージが表示された場合は、一部のファイルの全文使用を無効にしてください
- 優先度の高いファイルのみ全文使用を有効にすることを推奨

##### パフォーマンス
- 全文使用を有効にしたファイルが多いと、レポート生成に時間がかかる場合があります
- 知識ベースを使用する方が、大量の文書から効率的に情報を抽出できます

### GSNファイルの明示的な指定

#### GSNチェックボックス
各アップロードファイルに「GSN」チェックボックスが追加され、GSNファイルを明示的に指定できます。

#### 使用方法
1. ファイルをアップロード
2. GSNファイルの横にある「GSN」チェックボックスにチェック
3. レポート構成にGSN専用セクションが自動追加される

#### GSNファイル形式の作成方法

##### D-Case Communicator（推奨）
1. [D-Case Communicator](https://www.matsulab.org/dcase/login.html)でGSNを作成
2. 「Export LLM Input Text」機能でテキストファイルを出力
3. 出力されたテキストファイルをアップロード

##### 手動でGSNテキストを作成
以下のフォーマットで記述：
```
G1: システムは安全に運用できる
→ S1

S1: システム安全と運用リスク制御に分けた議論
→ G2, G3

G2: システムは設計上安全である
→ Sn1

Sn1: 設計レビュー完了報告書
```

要素タイプ：
- `G`: Goal（ゴール）
- `S`: Strategy（戦略）
- `C`: Context（コンテキスト）
- `Sn`: Solution（ソリューション/エビデンス）
- `→`: 接続（親から子への関係）

### 構造認識型チャンキング

ドキュメントを効率的に処理するための高度なチャンキング（分割）戦略を採用しています。

#### 処理フロー
1. **Markdown変換**: DOCX/HTML/TXT → Markdown形式に統一
2. **構造抽出**: 見出し（#, ##, ###）でセクション分割
3. **表の保護**: Markdownテーブルは分割せず1チャンクとして保持
4. **Max-Min チャンキング**: 大きなセクションは意味的境界で分割

#### チャンキング設定
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| MIN_SECTION_SIZE | 300文字 | これ以下のセクションは次と結合 |
| MAX_SECTION_SIZE | 1,200文字 | これを超えたらMax-Minで分割 |

#### 保護される構造
- **Markdownテーブル**: `| ... | ... |` 形式
- **図表番号**: 「表1」「Figure 2」などのキャプション
- **安全性ID**: H-001, SR-101, R-001 などは**太字**で強調

### カスタムステークホルダー機能

#### 概要
ユーザーがカスタムステークホルダーを作成・編集・削除できる機能です。

#### 設定項目
| 項目 | 説明 | 例 |
|------|------|-----|
| 名前 | ステークホルダーの表示名 | 経営幹部 |
| 視点キーワード | 関心のあるキーワード（カンマ区切り） | コスト、リスク、ROI |
| 専門レベル | 専門的な知識の有無 | 専門家 / 非専門家 |
| 読了時間 | レポートの分量（分） | 3 / 5 / 10 |
| 主要関心事 | 優先的に報告すべき内容 | コスト削減効果とリスク評価 |

#### 使用方法
1. 設定メニュー（≡）から「ステークホルダー設定」を選択
2. 「新規ステークホルダー」または編集したいステークホルダーを選択
3. 各項目を設定して「保存」

### レポート構成のカスタマイズ機能

#### 概要
プリセットの構成に加えて、独自のレポート構成を作成・編集・削除できます。

#### 設定方法
1. 構成選択の「カスタム構成を作成」をクリック
2. 構成名を入力
3. セクションを追加・編集・削除・並び替え
4. 「構成を保存」をクリック

#### セクション設定項目
| 項目 | 説明 |
|------|------|
| セクション名 | レポートに表示される見出し |
| 検索クエリ | 知識ベースから情報を取得するためのクエリ |
| 説明 | セクションの目的・内容の説明 |

### 動的な情報抽出（Dynamic K値計算）

#### 概要
ドキュメント量とステークホルダーに応じて、最適な情報量を自動調整します。比率ベースのレンジ制御により、ステークホルダーごとに適切なチャンク数を取得します。

#### 設計思想
- **経営層（CxO）**: 要点を絞った簡潔な情報（8%）
- **技術系（Technical Fellows, Architect, R&D）**: 詳細な技術情報（14-15%）
- **中間層（Product, Business）**: バランスの取れた情報量（9-11%）

#### パラメータ設定

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| RATIO_MIN | 8% | 比率ベースの下限 |
| RATIO_MAX | 15% | 比率ベースの上限 |
| ABSOLUTE_MIN | 5 | 絶対下限（最低5チャンク取得） |
| ABSOLUTE_MAX | 50 | 絶対上限（Pinecone） |

#### ステークホルダー別ターゲット比率

| ステークホルダー | 比率 | 260チャンク時のK値 |
|-----------------|------|-------------------|
| CxO | 8% | 21 |
| Business | 9% | 24 |
| Product | 11% | 29 |
| Technical Fellows | 14% | 37 |
| Architect | 14% | 37 |
| R&D | 15% | 39 |

#### カスタムステークホルダーの自動判定

カスタムステークホルダーは、ロール名に含まれるキーワードで自動的に比率が決定されます：

| キーワード | 比率 |
|-----------|------|
| 技術, 開発, エンジニア, アーキテクト, engineer, developer, architect, technical | 14% |
| 経営, 社長, cxo, 役員, executive, director, ceo, cto, cfo | 8% |
| リスク, セキュリティ, 品質, qa, risk, security, quality | 12% |
| その他（デフォルト） | 11% |

#### K値計算式

```
1. rawMinK = totalChunks × 0.08
2. rawMaxK = totalChunks × 0.15
3. minK = max(ABSOLUTE_MIN, rawMinK)
4. maxK = max(minK, min(ABSOLUTE_MAX, rawMaxK))  // 逆転ガード
5. targetK = totalChunks × ステークホルダー比率
6. finalK = min(maxK, max(minK, targetK))
```

#### 計算例

**260チャンクの場合:**
```
minK = max(5, 260×0.08) = 21
maxK = max(21, min(50, 260×0.15)) = 39

CxO:      min(39, max(21, 260×0.08)) = 21 (8.1%)
Product:  min(39, max(21, 260×0.11)) = 29 (11.2%)
Tech:     min(39, max(21, 260×0.14)) = 37 (14.2%)
```

**50チャンクの場合:**
```
minK = max(5, 50×0.08) = 5
maxK = max(5, min(50, 50×0.15)) = 8

全ステークホルダー: 5〜8の範囲で調整
```
### 多言語対応

#### 対応言語
- 日本語（デフォルト）
- English

#### 切り替え方法
設定メニュー（≡）から「Language: 日本語/English」を選択

#### 対応範囲
- UI全体（ボタン、ラベル、メッセージ）
- 生成されるレポート
- エラーメッセージ

### PDF出力機能

#### 日本語対応
Google Fontsを使用することで、日本語フォントの正確なレンダリングを実現：
- **ヘッダー**: ドキュメントタイトルと日付
- **フッター**: ページ番号
- **本文**: 日本語テキストの正確な表示

#### 出力形式
- **PDF**: @react-pdf/rendererで生成
- **HTML**: シンタックスハイライト付き
- **Word (docx)**: docxライブラリで生成
- **Markdown**: 生テキスト

## プロジェクト構成

```
safety-status-report-tool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── build-knowledge-base/
│   │   │   │   └── route.ts          # ナレッジベース構築API
│   │   │   ├── delete-knowledge-base/
│   │   │   │   └── route.ts          # ナレッジベース削除API
│   │   │   ├── list-knowledge-files/
│   │   │   │   └── route.ts          # 登録済みファイル一覧API
│   │   │   ├── export-html/
│   │   │   │   └── route.ts          # HTML出力API
│   │   │   ├── export-docx/
│   │   │   │   └── route.ts          # Word出力API
│   │   │   ├── export-pdf/
│   │   │   │   └── route.ts          # PDF出力API
│   │   │   ├── pdf-extract/
│   │   │   │   └── route.ts          # PDFテキスト抽出API
│   │   │   ├── google-vision-ocr/
│   │   │   │   └── route.ts          # 画像OCR API
│   │   │   ├── excel-extract/
│   │   │   │   └── route.ts          # Excelテキスト抽出API
│   │   │   ├── docx-extract/
│   │   │   │   └── route.ts          # Wordテキスト抽出API
│   │   │   ├── s3-upload/
│   │   │   │   └── route.ts          # S3アップロードAPI
│   │   │   ├── s3-process/
│   │   │   │   └── route.ts          # S3ファイル処理API
│   │   │   ├── s3-cleanup/
│   │   │   │   └── route.ts          # S3クリーンアップAPI
│   │   │   └── reports/
│   │   │       ├── route.ts          # レポート履歴一覧・保存API
│   │   │       └── [reportId]/
│   │   │           └── route.ts      # レポート詳細・削除API
│   │   │
│   │   ├── components/
│   │   │   ├── FileUpload.tsx               # ファイルアップロードUI
│   │   │   ├── KnowledgeBaseManager.tsx     # 知識ベース管理UI
│   │   │   ├── StakeholderSelect.tsx        # ステークホルダー選択UI
│   │   │   ├── ReportPreview.tsx            # レポートプレビュー・編集
│   │   │   ├── ReportStructureSelector.tsx  # カスタム構成機能
│   │   │   ├── GenerationProgress.tsx       # 生成進捗表示
│   │   │   ├── StreamingPreview.tsx         # ストリーミングプレビュー
│   │   │   ├── ThemeProvider.tsx            # テーマ管理
│   │   │   ├── ThemeToggle.tsx              # ダークモード切り替え
│   │   │   ├── I18nProvider.tsx             # 多言語対応コンテキスト
│   │   │   ├── AuthProvider.tsx             # 認証コンテキスト
│   │   │   ├── AuthModal.tsx                # ログイン/サインアップモーダル
│   │   │   ├── AuthStatus.tsx               # 認証状態表示（※現在未使用）
│   │   │   └── SettingsMenu.tsx             # 設定メニュー（右上固定）
│   │   │   # ※ ReportEditor.tsx は ReportPreview.tsx に統合済み
│   │   │
│   │   ├── stakeholder-settings/
│   │   │   └── page.tsx             # ステークホルダー設定ページ
│   │   │
│   │   ├── history/
│   │   │   ├── page.tsx             # レポート履歴一覧ページ
│   │   │   └── [reportId]/
│   │   │       └── page.tsx         # レポート詳細ページ
│   │   │
│   │   ├── favicon.ico
│   │   ├── icon.png
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # メインページ
│   │   ├── not-found.tsx
│   │   └── globals.css
│   │
│   ├── hooks/
│   │   ├── useSectionGeneration.ts  # レポート生成カスタムフック
│   │   └── useReportHistory.ts      # レポート履歴カスタムフック
│   │
│   ├── lib/
│   │   ├── config/
│   │   │   └── constants.ts            # アプリケーション設定値
│   │   ├── amplify-config.ts           # 認証設定
│   │   ├── browser-id.ts               # ブラウザID管理
│   │   ├── chunking-strategies.ts      # チャンキング戦略セレクタ
│   │   ├── md-converter.ts             # Markdown変換（DOCX/HTML/TXT対応）
│   │   ├── table-aware-chunking.ts     # 表認識チャンキング
│   │   ├── max-min-chunking.ts         # Max-Min Semanticチャンキング
│   │   ├── sparse-vector-utils.ts      # 疎ベクトル生成
│   │   ├── rrf-fusion.ts               # RRF融合アルゴリズム
│   │   ├── stakeholders.ts             # ステークホルダー管理
│   │   ├── vector-store.ts             # ベクトルストア
│   │   ├── embeddings.ts               # エンベディング設定
│   │   ├── google-cloud-auth.ts        # Google Cloud認証
│   │   ├── text-processing.ts          # テキスト処理ユーティリティ
│   │   ├── vision-api-utils.ts         # Vision APIエラーハンドリング
│   │   ├── pdf-exporter.ts             # PDF出力処理
│   │   ├── report-prompts.ts           # 日本語プロンプトテンプレート
│   │   ├── report-prompts-en.ts        # 英語プロンプトテンプレート
│   │   ├── rag-utils.ts                # 検索ユーティリティ
│   │   ├── rhetoric-strategies.ts      # レトリック戦略
│   │   ├── query-enhancer.ts           # 検索クエリ拡張機能
│   │   ├── report-structures.ts        # レポート構成管理
│   │   ├── s3-utils.ts                 # S3ユーティリティ
│   │   └── date-utils.ts               # 日付ユーティリティ
│   │
│   ├── locales/
│   │   ├── ja.json                  # 日本語翻訳
│   │   └── en.json                  # 英語翻訳
│   │
│   └── types/
│       ├── index.ts                 # TypeScript型定義
│       └── wink-tokenizer.d.ts      # Winkトークナイザー型定義
│
├── lambda/                          # Lambda Function
│   ├── src/
│   │   ├── index.ts                 # メインハンドラー（ストリーミング）
│   │   ├── types.ts                 # 型定義
│   │   ├── wink-tokenizer.d.ts      # Winkトークナイザー型定義
│   │   └── lib/
│   │       ├── rag/
│   │       │   ├── index.ts             # RAGモジュールエクスポート
│   │       │   ├── types.ts             # RAG型定義
│   │       │   ├── query-enhancer.ts    # クエリ拡張
│   │       │   ├── rag-utils.ts         # RAGユーティリティ
│   │       │   ├── rrf-fusion.ts        # RRF検索
│   │       │   └── sparse-vector-utils.ts # 疎ベクトル生成
│   │       ├── report-prompts.ts        # 日本語プロンプト
│   │       ├── report-prompts-en.ts     # 英語プロンプト
│   │       └── rhetoric-strategies.ts   # レトリック戦略
│   │
│   ├── template.yaml                # SAMテンプレート
│   ├── samconfig.toml               # SAM設定
│   └── package.json                 # Lambda依存関係
│
├── public/
│   ├── help.html                    # ヘルプページ
│   └── upload-guide.html            # アップロードガイド（品質向上のヒント）
├── .env.local                       # 環境変数（Gitには含めない）
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## トラブルシューティング

### レポート生成関連

#### Lambda Function URLが設定されていないエラー
- **症状**: 「Lambda Function URLが設定されていません」エラー
- **対処法**:
  1. `sam deploy` でLambda Functionをデプロイ
  2. 出力されたFunction URLを`.env.local`に設定
  3. 本番環境の場合は環境変数に`NEXT_PUBLIC_LAMBDA_FUNCTION_URL`を設定

### 知識ベース関連

#### リクエストサイズエラー（2MB超過）
- **症状**: "Request size exceeds 2MB"エラー
- **対処法**: バッチサイズを小さくする（vector-store.tsでbatchSize=30に設定）

### 検索精度の向上

#### 症状
- 重要な情報が検索されない
- 関連性の低い文書が多く含まれる

#### 対処法
1. **ハイブリッド検索の有効化**: GSN要素の検索精度が向上
2. **全文使用オプションの活用**: 確実に含めたい重要文書は「全文使用」を有効化
3. **ファイル形式の最適化**: PDFよりDOCXやMarkdownを使用

### 全文使用関連

#### コンテキスト超過エラー
- **症状**: レポート生成時にエラーが発生
- **対処法**:
  1. 全文使用ファイル数を2個以下に減らす
  2. 大きいファイルはRAG（全文使用OFF）で処理する
  3. 警告ダイアログで「キャンセル」を選択し、設定を見直す

#### APIコストが高い
- **対処法**:
  1. 全文使用ファイル数を最小限に抑える
  2. 5万文字以上のファイルは自動的に切り詰められるため、過度な心配は不要
  3. RAGを活用して関連部分のみを抽出する

### セクション分割生成関連

#### コンテキスト準備でエラーが発生
- **症状**: 「文書コンテンツがありません」エラー
- **対処法**:
  1. ファイルをアップロードしているか確認
  2. 「全文使用」を有効にしたファイルがあるか確認
  3. 知識ベースが構築されているか確認

#### 一部のセクションが生成されない
- **症状**: セクション生成が途中で停止
- **対処法**:
  1. ネットワーク接続を確認
  2. ページをリロードして再試行

### 多言語対応関連

#### 言語が切り替わらない
- **対処法**:
  1. ブラウザのlocalStorageをクリア
  2. ページをリロード
  3. 再度言語を選択

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **認証**: AWS Cognito
- **AI/LLM**: 
  - Anthropic Claude API (Claude 3.5 Haiku) - レポート生成
  - OpenAI API (text-embedding-3-small) - エンベディング
  - Google Cloud Vision API - OCR処理
- **ベクトルストア**:
  - Pinecone（ハイブリッド検索対応）
  - LangChain - ベクトルストア抽象化
  - Kuromoji - 日本語トークナイザー
  - WinkTokenizer - 英語トークナイザー
- **サーバーレス**:
  - AWS Lambda (Function URL, ストリーミング対応)
  - AWS SAM (デプロイ管理)
- **ファイル処理**:
  - AWS S3 - 大容量ファイル処理
  - PDF生成: @react-pdf/renderer
  - PDF抽出: pdf-parse
  - OCR: @google-cloud/vision
  - Excel処理: xlsx
  - Word抽出: mammoth
  - Word生成: docx
  - HTML→Markdown: turndown
- **UI**: React 19
- **多言語対応**: カスタムi18nプロバイダー（React Context）
- **データ永続化**: 
  - ローカルストレージ（カスタムステークホルダー用、ブラウザID、言語設定）
  - Pineconeベクトルストア（ドキュメント用）
- **ホスティング**: AWS Amplify

## セキュリティ考慮事項

- **認証**: セキュアな認証。パスワードは認証サービス側で管理され、アプリケーションには保存されません
- **ユーザー分離**: 認証済みユーザーと未認証ユーザーで完全に分離
- **データアクセス**: 各ユーザーは自身のネームスペースのデータにのみアクセス可能
- **APIキー管理**: 環境変数で管理し、フロントエンドには露出させない

---

## RAG 評価スクリプト

`rag-evaluation/` ディレクトリには、RAG（Retrieval-Augmented Generation）システムの検索品質を評価するためのスクリプトが含まれています。

### 概要

SSRツールと同じRRF検索方式・動的K値計算を使用して、ステークホルダー別の検索精度を評価します。

### ディレクトリ構成

```
rag-evaluation/
├── README.md                    # 詳細なドキュメント
├── rag-evaluator.ts             # メイン評価スクリプト
├── csv-exporter.ts              # CSV出力・変換ユーティリティ
├── metrics.ts                   # 評価指標（Precision, Recall, nDCG等）
├── query-enhancer-copy.ts       # クエリ生成（本体からコピー）
├── rag-utils-copy.ts            # RAGユーティリティ（本体からコピー）
├── types.ts                     # 型定義
├── stakeholders-all.json        # 評価対象全ステークホルダー設定
├── stakeholders.json            # 2ステークホルダー版（CxO + Technical Fellows）
├── package.json                 # 依存関係
├── tsconfig.json                # TypeScript設定
├── .env.local                       # 環境変数（Gitには含めない）
└── evaluation-results/          # 評価結果出力（.gitignore対象）
```

### 評価フロー

```
1. ナレッジベース構築
   SSRツール側で各ステークホルダーにPDFをアップロード
       ↓
2. CSV出力（ラベリング用）
   npx ts-node rag-evaluator.ts export-csv \
     --uuid <your-uuid> \
     --stakeholders ./stakeholders.json
       ↓
3. 手動ラベリング
   Excelで relevance_score 列に 0-3 を入力
   （0: 無関係, 1: やや関連, 2: 関連, 3: 非常に関連）
       ↓
4. Ground Truth JSON 変換
   npx ts-node rag-evaluator.ts convert-csv \
     --input ./labeled.csv \
     --output ./ground-truth.json
       ↓
5. 評価実行
   npx ts-node rag-evaluator.ts evaluate-rrf \
     --uuid <your-uuid> \
     --stakeholders ./stakeholders.json \
     --ground-truth ./ground-truth.json
```

### 主要コマンド

| コマンド | 説明 |
|---------|------|
| `export-csv` | 検索結果をCSV形式で出力（ラベリング用） |
| `convert-csv` | ラベリング済みCSVをGround Truth JSONに変換 |
| `evaluate-rrf` | RRF方式での評価（推奨・本番と同じ動作） |
| `show-queries` | ステークホルダーから生成されるクエリを確認 |

### 評価指標

| 指標 | 説明 |
|------|------|
| Precision@K | 取得したK件中の正解率 |
| Recall@K | 全正解中の取得率 |
| F1@K | PrecisionとRecallの調和平均 |
| MRR | 最初の正解が出現する順位の逆数 |
| nDCG@K | 順位を考慮した正解品質スコア |

### セットアップ

```bash
cd rag-evaluation
npm install

# PINECONEの環境変数を設定（rag-evaluation/.env.local）
# PINECONE_API_KEY=...
# OPENAI_API_KEY=...
# PINECONE_INDEX_NAME=...
```

### 使用例

```bash
# クエリ確認
npx ts-node rag-evaluator.ts show-queries \
  --stakeholders ./stakeholders.json

# CSV出力
npx ts-node rag-evaluator.ts export-csv \
  --uuid "ユーザーID" \
  --stakeholders ./stakeholders.json \
  --output ./chunks-for-labeling.csv

# JSON 変換
  npx ts-node rag-evaluator.ts convert-csv \
    --input ./chunks-for-labeling.csv \
    --output ./ground-truth.json

# 評価実行
npx ts-node rag-evaluator.ts evaluate-rrf \
  --uuid "ユーザーID" \
  --stakeholders ./stakeholders.json \
  --ground-truth ./ground-truth.json
```

### 注意事項

- `chunks-*.csv`, `chunks-*.json`, `ground-truth.json`, `evaluation-results/` は `.gitignore` で除外
- 評価結果は毎回生成可能なため、Gitにコミットする必要はありません