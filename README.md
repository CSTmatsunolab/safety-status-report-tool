# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIを活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSV、Excel、Word、画像ファイル（JPG, PNG等）など多様な形式に対応
- **OCR機能**: Google Cloud Vision APIを使用した画像・画像ベースPDFからのテキスト抽出
- **大容量ファイル対応**: 4MBを超えるファイルも安全に処理
- **高度なチャンキング戦略**: Max-Min Semanticチャンキングによる最適な文書分割
- **知識ベース機能**: ハイブリッド検索（密ベクトル+疎ベクトル）による高精度な情報抽出
- **認証機能**: メールアドレスベースのユーザー認証（オプション）
- **ユーザー分離機能**: 認証ユーザーと未認証ユーザーで独立したデータ空間を提供
- **知識ベース管理**: UIから知識ベースの構築・削除が可能
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

### レポート構成のカスタマイズ機能

#### カスタム構成の作成
レポート生成時に、独自のレポート構成を作成・保存・管理できます。

##### 機能詳細
- **ドラッグ&ドロップ**: セクションの順序をドラッグで簡単に並び替え
- **動的セクション管理**: セクションの追加・削除が自由自在
- **永続化**: 作成したカスタム構成はローカルストレージに保存され、次回以降も利用可能
- **削除機能**: 不要になったカスタム構成は個別に削除可能

##### 使用方法
1. レポート構成選択画面で「カスタム構成を作成」をクリック
2. 構成名と説明を入力
3. セクション名を順番に入力（ドラッグで順序変更可能）
4. 「この構成を使用」をクリック

#### GSNセクションの自動追加
GSNファイルがアップロードされると、選択した構成に応じて適切なGSN分析セクションが自動的に追加されます。

##### 構成別のGSN追加セクション
- **経営向けレポート**: 
  - GSN目標達成状況サマリー
  - 主要リスク制御戦略
- **技術詳細レポート**: 
  - GSN構造分析
  - Goal-Strategy-Evidence対応表
  - 技術的ギャップ分析
- **問題解決型レポート**: 
  - 未達成Goal分析
  - 対策Strategy提案
- **リスク重視レポート**: 
  - GSNコンテキスト分析
  - 未解決Assumptionリスト

#### 動的構成プレビュー
- GSNファイルの有無により、最終的なレポート構成がリアルタイムで更新
- GSN分析セクションは青色のバッジで視覚的に識別
- 総章数とGSNセクション数が明確に表示

#### 推奨ステークホルダーの可視化
各レポート構成に推奨ステークホルダーが設定され、UIで確認できます。

##### 拡張された推奨マッピング
| レポート構成 | 推奨ステークホルダー |
|---|---|
| **経営向けレポート** | CxO/経営層, 事業部門 |
| **技術詳細レポート** | 技術専門家, アーキテクト, R&D |
| **データ駆動型** | CxO/経営層, 事業部門, 財務部門, 営業部門 |
| **問題解決型** | 製品部門, リスク・安全管理者, 品質保証部門, オペレーション部門 |
| **ナラティブ型** | プロジェクトマネージャー, マーケティング部門, 人事部門 |
| **リスク重視** | リスク・安全管理者, セキュリティ部門, コンプライアンス部門, 法務部門 |

#### インタラクティブな情報表示
- 情報アイコン（ⓘ）をクリックで詳細情報を展開表示
- 推奨ステークホルダーとGSNセクションを統合表示
- モバイルフレンドリーなタップ操作対応

### ステークホルダー別の読了時間設定
忙しいステークホルダーに配慮し、自動的にレポートの分量を調整します：

| ステークホルダー | 目標読了時間 | 全体文字数 | セクション文字数（7セクション時） |
|-----------------|-------------|-----------|--------------------------------|
| CxO / 経営層 | 5分 | 2,500文字 | ~360文字 |
| 事業部門 | 7分 | 3,500文字 | ~500文字 |
| 製品部門 | 10分 | 5,000文字 | ~710文字 |
| R&D部門 | 12分 | 6,600文字 | ~940文字 |
| 技術専門家 | 15分 | 9,000文字 | ~1,300文字 |
| アーキテクト | 15分 | 9,000文字 | ~1,300文字 |

### Dynamic K値（検索文書数）の自動調整

#### 概要
ステークホルダーとコーパスサイズに基づいて、最適な検索文書数を自動計算します。

#### 計算ロジック
```
基本K値 = 総チャンク数 × 30%
最終K値 = 基本K値 × ステークホルダー係数

ステークホルダー係数:
- Technical Fellows: 1.2 (詳細情報重視)
- CxO: 0.8 (要約重視)
- Engineer: 1.0 (標準)
```

### 多言語対応 (i18n)

#### 概要
アプリケーションは日本語と英語の両方に対応しています。言語設定に応じて、UI、レポート出力、エクスポートファイル（PDF、Word、HTML）のラベルが切り替わります。

#### 言語の切り替え方法
1. 画面右上に固定されたハンバーガーメニュー（≡）をクリック
2. 「Language / 言語」を選択
3. 「日本語」または「English」を選択

#### 対応範囲
- **UI全般**: ボタン、ラベル、メッセージ、エラー表示
- **ステークホルダー**: 名前と関心事が言語に応じて切り替わる
- **レポート構成テンプレート**: セクション名が言語に応じて切り替わる
- **レトリック戦略名**: 「ビジネスインパクト重視型」↔「Business Impact Focus」など
- **生成レポート**: 選択した言語でレポートが出力される
- **出力ファイル**: PDF、Word、HTMLのラベル（対象、戦略、作成日など）

#### 入力ファイルの言語
入力ファイル（PDF、GSNファイル等）がどの言語で書かれていても、設定された出力言語でレポートが生成されます。

### 設定メニュー

画面右上に固定されたハンバーガーメニュー（≡）から以下の設定にアクセスできます：

- **ログイン / ログアウト**: 認証（メール認証）
- **ステークホルダー設定**: カスタムステークホルダーの追加・管理
- **言語 (Language)**: 日本語 / English の切り替え
- **テーマ (Theme)**: ライト / ダーク / システム設定の切り替え

### 認証機能

#### 概要
メールアドレスベースの認証機能を提供します。認証は**オプション**であり、未認証でも基本機能は利用可能です。

#### 認証状態による動作の違い
| 状態 | ユーザー識別子 | データ永続性 |
|------|--------------|-------------|
| **認証済み** | ユーザーID | 永続的（どのブラウザからでもアクセス可能） |
| **未認証** | ブラウザID (UUID) | ブラウザ固有（localStorage依存） |

### OCR機能について

- **対応形式**: 画像ファイル（JPG, PNG等）、画像ベースPDF
- **仕組み**: PDFはまず埋め込みテキストを試し、文字が少ない場合（100文字未満）にOCRを実行します
- **PDF前処理**: 不要な改行を除去し、段落を適切に結合する高度な前処理

## フォルダ構成
```
safety-status-report-tool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── build-knowledge-base/
│   │   │   │   └── route.ts          # ナレッジベース構築API
│   │   │   ├── delete-knowledge-base/
│   │   │   │   └── route.ts          # ナレッジベース削除API
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
│   │   │   └── s3-cleanup/
│   │   │       └── route.ts          # S3クリーンアップAPI
│   │   │
│   │   ├── components/
│   │   │   ├── FileUpload.tsx               # ファイルアップロードUI
│   │   │   ├── KnowledgeBaseManager.tsx     # 知識ベース管理UI
│   │   │   ├── StakeholderSelect.tsx        # ステークホルダー選択UI
│   │   │   ├── ReportPreview.tsx            # レポートプレビュー
│   │   │   ├── ReportEditor.tsx             # レポート編集機能
│   │   │   ├── ReportStructureSelector.tsx  # カスタム構成機能
│   │   │   ├── GenerationProgress.tsx       # 生成進捗表示
│   │   │   ├── StreamingPreview.tsx         # ストリーミングプレビュー
│   │   │   ├── ThemeProvider.tsx            # テーマ管理
│   │   │   ├── ThemeToggle.tsx              # ダークモード切り替え
│   │   │   ├── I18nProvider.tsx             # 多言語対応コンテキスト
│   │   │   ├── AuthProvider.tsx             # 認証コンテキスト
│   │   │   ├── AuthModal.tsx                # ログイン/サインアップモーダル
│   │   │   ├── AuthStatus.tsx               # 認証状態表示
│   │   │   └── SettingsMenu.tsx             # 設定メニュー（右上固定）
│   │   │
│   │   ├── stakeholder-settings/
│   │   │   └── page.tsx             # ステークホルダー設定ページ
│   │   │
│   │   ├── favicon.ico
│   │   ├── icon.png
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # メインページ
│   │   ├── not-found.tsx
│   │   └── globals.css
│   │
│   ├── hooks/
│   │   └── useSectionGeneration.ts  # レポート生成カスタムフック
│   │
│   ├── lib/
│   │   ├── config/
│   │   │   └── constants.ts            # アプリケーション設定値
│   │   ├── amplify-config.ts           # 認証設定
│   │   ├── browser-id.ts               # ブラウザID管理
│   │   ├── chunking-strategies.ts      # チャンキング戦略セレクタ
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