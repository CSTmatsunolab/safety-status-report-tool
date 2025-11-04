# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIとRAG（Retrieval-Augmented Generation）を活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSV、Excel、Word、画像ファイル（JPG, PNG等）など多様な形式に対応
- **OCR機能**: Google Cloud Vision APIを使用した画像・画像ベースPDFからのテキスト抽出
- **大容量ファイル対応 (AWS S3)**: 4MBを超えるファイルをAWS S3経由で安全に処理
- **RAG機能(Pinecone)**: 大量のドキュメントから関連情報を効率的に抽出
- **動的な情報抽出**: ドキュメント量とステークホルダーに応じた最適な情報量の調整
- **全文使用機能**: 重要なファイルを確実にAIに渡すための全文コンテキスト使用オプション
- **ステークホルダー別レポート**: カスタマイズ可能なステークホルダーグループ向けのレポート生成
- **ステークホルダー管理**: ステークホルダーの追加・編集・削除機能
- **構成カスタマイズ機能**: レポート構成の追加・編集・削除機能
- **レトリック戦略**: ステークホルダーに応じた説得手法の自動選択
- **AI活用**: Claude APIを使用した高品質なレポート作成
- **多様な出力形式**: PDF、HTML、Word（docx）形式でのダウンロード
- **編集機能**: 生成後のレポートを手動で編集可能
- **ダークモード機能**: ダークモードに切り替え可能

## 始め方

### 前提条件

- Node.js 18.0.0以上
- npm または yarn
- Anthropic Claude APIキー
- OpenAI APIキー（エンベディング用）
- Google Cloud Vision APIキー（OCR用）
- **AWS S3バケット**（大容量ファイル処理用）
- Pinecone APIキー

### インストール手順

#### 1. リポジトリのクローン
```bash
git clone https://github.com/CSTmatsunolab/safety-status-report-tool.git
cd safety-status-report-tool
```

#### 2. 依存関係のインストール
```bash
npm install
```

#### 3. 環境変数の設定

プロジェクトルートに`.env.local`ファイルを作成し、以下を追加：
```bash
# 必須
ANTHROPIC_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# OCR機能用（画像/画像ベースPDF処理に必要）
GOOGLE_CLOUD_VISION_KEY='{ "type": "service_account", ... }' # Google CloudからダウンロードしたJSONキーの内容

# ベクトルストア設定
VECTOR_STORE=pinecone # または 'memory'

# Pinecone使用時
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=ssr-index

# AWS S3設定 (4MB以上のファイル処理に必要)
AWS_REGION=your_s3_bucket_region
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_S3_BUCKET_NAME=your_s3_bucket_name

# S3クリーンアップAPI用 (Vercel Cronなどで使用)
CLEANUP_AUTH_TOKEN=your_secure_random_token
```

#### 4. Google Cloud Vision APIのセットアップ

- Google Cloud Consoleでプロジェクトを作成し、Vision APIを有効化します
- サービスアカウントキー（JSON）を作成し、`GOOGLE_CLOUD_VISION_KEY`環境変数に設定します

#### 5. AWS S3のセットアップ

- AWSコンソールでS3バケットを作成します
- IAMユーザーを作成し、S3バケットへの `PutObject`, `GetObject`, `DeleteObject`, `ListBucket` 権限を付与します
- バケットのCORS設定を行い、アプリケーションのドメインからの `PUT` リクエストを許可します
- IAMユーザーのアクセス情報を `.env.local` に設定します

#### 6. 開発サーバーの起動
```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

### Vercelへのデプロイ（推奨）

1. プロジェクトをVercelにインポートします
2. Vercelのプロジェクト設定で、上記の`.env.local`の内容を環境変数としてすべて登録します
3. **Cronジョブの設定**:
   - Vercelのダッシュボードで「Cron Jobs」タブに移動します
   - S3の一時ファイルを自動削除するため、以下のジョブを登録します（例: 1日1回実行）
     - スケジュール: `0 0 * * *`
     - エンドポイント: `https://your-deployment-url.vercel.app/api/s3-cleanup`
     - 方法: `POST`
     - Authorizationヘッダー: `Bearer [CLEANUP_AUTH_TOKENで設定した値]`

## 使い方

### 基本的な使用フロー

1. **ドキュメントのアップロード**: GSNファイル、議事録、仕様書などをアップロードします
2. **ステークホルダーの選択**: デフォルトまたはカスタムステークホルダーから対象を選択します
3. **構成の選択**: 推奨構成、またはカスタム構成を選択します
4. **ナレッジベース構築**: 「知識ベースを構築」ボタンをクリック（RAG使用時）
5. **レポート生成**: 「レポートを生成」ボタンをクリックします
6. **レポートの編集・出力**: 生成されたレポートを編集、またはPDF、HTML、Word形式でダウンロードします

### 全文使用機能について

各ファイルには「全文使用」トグルがあり、RAG（関連部分の抽出）を使わず、ファイルの全内容をAIのコンテキストに含めることができます。GSNファイルや短い重要文書はこれをONにすることを推奨します。

- **ON**: ファイルの全内容をAIに渡します（RAGを経由しない）
- **OFF**: RAGによって関連部分のみを抽出してAIに渡します（デフォルト）

**注意**: 全文使用ファイルの合計がコンテキスト制限（技術系: 約8万文字, その他: 約5万文字）を超えるとエラーになる場合があります。

### GSNファイルの明示的な指定

各ファイルに「GSN」チェックボックスがあり、GSNファイルを明示的に指定できます。GSNファイルが指定されると、レポート構成にGSN専用セクションが自動追加されます。

### レポート構成のカスタマイズ機能

レポート構成選択画面で「カスタム構成を作成」をクリックすると、独自の構成を定義できます。

- セクションの順序をドラッグ&ドロップで並び替えできます
- 作成した構成はローカルストレージに保存され、次回以降も利用可能です

### OCR機能について

- **対応形式**: 画像ファイル（JPG, PNG等）、画像ベースPDF
- **仕組み**: PDFはまず埋め込みテキストを試し、文字が少ない場合（100文字未満）にGoogle Cloud Vision APIでOCRを実行します。画像ファイルは直接OCRを実行します
- **GSN処理**: GSNファイルと判定された場合、OCRテキストからGSN要素（G1, S1等）を識別し、自動で整形します

### RAG機能の詳細

- **検索クエリの高度化**: ステークホルダーの役割や関心事に基づき、同義語展開、専門用語追加、英語クエリなど、最大5つの検索パターンを自動生成します
- **動的な情報抽出**: 全体の文書量とステークホルダーのタイプ（技術系/経営系）に応じて、AIに渡す関連情報の量（K値）を動的に調整します
- **ベクトルストアの選択**: `.env.local`の`VECTOR_STORE`で`pinecone` (デフォルト), `memory` を選択可能です

### ステークホルダー管理

`/stakeholder-settings` ページで、カスタムステークホルダーの追加・削除が可能です。

**ID命名規則**: 英数字、ハイフン（-）、アンダースコア（_）のみ使用可能（3〜30文字）。大文字小文字は区別されます。

### RAGログ機能

RAG検索の結果は`logs/rag/`ディレクトリにJSON形式で自動保存されます。検索クエリ、取得したチャンク、スコアなどを確認でき、デバッグに役立ちます。

## フォルダ構成
```
safety-status-report-tool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── build-knowledge-base/
│   │   │   ├── generate-report/
│   │   │   ├── export-html/
│   │   │   ├── export-docx/
│   │   │   ├── export-pdf/
│   │   │   ├── pdf-extract/
│   │   │   ├── google-vision-ocr/
│   │   │   ├── excel-extract/
│   │   │   ├── docx-extract/
│   │   │   ├── s3-upload/         # [NEW]
│   │   │   ├── s3-process/        # [NEW]
│   │   │   └── s3-cleanup/        # [NEW]
│   │   │
│   │   ├── components/
│   │   │   ├── FileUpload.tsx
│   │   │   ├── StakeholderSelect.tsx
│   │   │   ├── ReportPreview.tsx
│   │   │   ├── ReportEditor.tsx
│   │   │   ├── ReportStructureSelector.tsx
│   │   │   └── ThemeToggle.tsx
│   │   │
│   │   ├── stakeholder-settings/
│   │   │   └── page.tsx
│   │   │
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── lib/
│   │   ├── config/
│   │   │   └── constants.ts
│   │   ├── stakeholders.ts
│   │   ├── vector-store.ts
│   │   ├── direct-chroma-store.ts
│   │   ├── embeddings.ts
│   │   ├── google-cloud-auth.ts
│   │   ├── text-processing.ts
│   │   ├── vision-api-utils.ts
│   │   ├── pdf-exporter.ts
│   │   ├── report-prompts.ts
│   │   ├── rag-utils.ts
│   │   ├── rhetoric-strategies.ts
│   │   ├── query-enhancer.ts
│   │   ├── report-structures.ts
│   │   └── s3-utils.ts            # [NEW]
│   │
│   └── types/
│       └── index.ts
│
├── logs/
│   └── rag/
│
├── public/
├── .env.local
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **AI/LLM**:
  - Anthropic Claude API (Claude 3 Haiku)
  - OpenAI API (text-embedding-3-small)
  - Google Cloud Vision API
- **RAG/ベクトルストア**:
  - Pinecone（デフォルト）
  - LangChain
- **ファイル処理**:
  - AWS S3 (SDK V3)
  - PDF生成: Puppeteer
  - PDF抽出: pdf-parse-new
  - Excel処理: xlsx
  - Word抽出: mammoth
  - Word生成: docx
- **UI**: React 18, react-dropzone, @hello-pangea/dnd
- **データ永続化**: ローカルストレージ, ベクトルストア, ファイルシステム（ログ用）

## トラブルシューティング

### レポートが期待通りに生成されない場合

- **GSN分析が不十分**: GSNファイルは「全文使用」をONにし、「GSN」チェックボックスをONにしてください
- **情報が不足**: RAGがうまく機能していない可能性があります。「ステークホルダー管理」で関心事をより具体的に設定してください

### OCR関連のエラー

- **認証エラー**: `GOOGLE_CLOUD_VISION_KEY`が正しいか、Vision APIが有効か確認してください
- **クォータ制限**: 無料枠の制限に達した可能性があります。時間をおいて試すか、画像（PNG/JPG）に変換してアップロードしてください
- **PDFページ数制限**: 4MB未満のPDFはOCR処理が最大5ページに制限されます

### AWS S3関連エラー

- **認証エラー (403)**: AWSのIAMキー、シークレット、リージョン、バケット名が正しいか、CORS設定が許可されているか確認してください
- **ファイルアップロード失敗**: `AWS_S3_BUCKET_NAME` と `AWS_REGION` が正しいか、IAMユーザーが `PutObject` 権限を持っているか確認してください

### 大きなファイルの処理

- 4MB以上のファイルはAWS S3を経由します。アップロードと処理に時間がかかる場合があります
- 画像ファイルは10MB以下を推奨します