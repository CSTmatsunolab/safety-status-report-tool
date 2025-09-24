# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIとRAG（Retrieval-Augmented Generation）を活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSV、Excel、画像ファイル（JPG, PNG等）など多様な形式に対応
- **OCR機能**: Google Cloud Vision APIを使用した画像・画像ベースPDFからのテキスト抽出
- **RAG機能**: 大量のドキュメントから関連情報を効率的に抽出
- **動的な情報抽出**: ドキュメント量とステークホルダーに応じた最適な情報量の調整
- **ステークホルダー別レポート**: カスタマイズ可能なステークホルダーグループ向けのレポート生成
- **ステークホルダー管理**: ステークホルダーの追加・編集・削除機能
- **AI活用**: Claude APIを使用した高品質なレポート作成
- **多様な出力形式**: PDF、HTML、Word（docx）形式でのダウンロード
- **編集機能**: 生成後のレポートを手動で編集可能

## 始め方

### 前提条件

- Node.js 18.0.0以上
- npm または yarn
- Anthropic Claude APIキー
- OpenAI APIキー（エンベディング用）
- Google Cloud Vision APIキー（OCR用）
- ChromaDB（ローカルインストール）または Pinecone APIキー

### インストール手順

1. **リポジトリのクローン**
   ```bash
   git clone https://github.com/CSTmatsunolab/safety-status-report-tool.git
   cd safety-status-report-tool
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   
   プロジェクトルートに`.env.local`ファイルを作成し、以下を追加：
   ```bash
   # 必須
   ANTHROPIC_API_KEY=your_claude_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   
   # OCR機能用（画像/画像ベースPDF処理に必要）
   GOOGLE_CLOUD_VISION_KEY='{
     "type": "service_account",
     "project_id": "your-project-id",
     "private_key_id": "your-key-id",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "your-service-account@your-project-id.iam.gserviceaccount.com",
     "client_id": "your-client-id",
     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
     "token_uri": "https://oauth2.googleapis.com/token",
     "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
     "client_x509_cert_url": "your-cert-url"
   }'
   
   # ベクトルストア設定
   VECTOR_STORE=chromadb # または 'pinecone', 'memory'
   
   # ChromaDB使用時（デフォルト）
   CHROMA_URL=http://localhost:8000
   
   # Pinecone使用時
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX_NAME=ssr-index
   ```

4. **Google Cloud Vision APIのセットアップ**
   
   a. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
   
   b. Vision APIを有効化：
   ```bash
   # Google Cloud CLIを使用する場合
   gcloud services enable vision.googleapis.com
   ```
   
   c. サービスアカウントキーを作成：
   - IAMと管理 > サービスアカウント
   - 新しいサービスアカウントを作成
   - JSONキーをダウンロード
   - キーの内容を`GOOGLE_CLOUD_VISION_KEY`環境変数に設定

5. **ChromaDBの起動（ChromaDB使用時）**
   ```bash
   # 別ターミナルでChromaDBを起動
   docker run -p 8000:8000 chromadb/chroma
   ```

6. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

7. **ブラウザでアクセス**
   
   [http://localhost:3000](http://localhost:3000) を開く

### ビルドと本番環境

```bash
# プロダクションビルド
npm run build

# 本番サーバーの起動
npm start
```

## 使い方

### 基本的な使用フロー

1. **ドキュメントのアップロード**
   - GSNファイル、議事録、仕様書などをドラッグ&ドロップまたは選択してアップロード
   - 複数ファイルの同時アップロードに対応
   - **画像ファイル（JPG, PNG等）やスキャンPDFも自動的にOCR処理**

2. **ステークホルダーの選択**
   - デフォルトまたはカスタムステークホルダーから対象を選択

3. **ナレッジベース構築（自動）**
   - アップロードされたファイルが自動的にチャンク分割され、ベクトルストアに保存

4. **レポート生成**
   - 「レポートを生成」ボタンをクリック
   - RAGが関連情報を抽出し、AIがステークホルダー向けにカスタマイズされたSSRを生成

5. **レポートの編集・出力**
   - 生成されたレポートをプレビュー画面で確認
   - 必要に応じて編集
   - PDF、HTML、Word（docx）形式でダウンロード

### OCR機能について

#### 対応形式
- **画像ファイル**: JPG, JPEG, PNG, GIF, BMP, TIFF(Google Cloud Vision対応の画像タイプ)
- **画像ベースPDF**: スキャンされたPDFや画像として保存されたPDF

#### OCR処理の仕組み
1. **PDFファイル**:
   - まず埋め込みテキストの抽出を試みる
   - テキストが100文字未満の場合、Google Cloud Vision APIでOCR実行
   - 最大5ページまで処理（API制限）

2. **画像ファイル**:
   - 直接Google Cloud Vision APIでテキスト抽出
   - 日本語・英語の両方に対応

#### GSNファイルの特別処理
GSNファイルと判定された場合（ファイル名に"GSN"を含む）、以下の整形を自動実行：
- GSN要素（G1, S1, C1等）の識別と整形
- 接続関係（→）の明確化
- 余分な空白の削除

### OCR設定のカスタマイズ

`src/lib/config/constants.ts`で以下の設定を調整可能：

```typescript
// PDFのOCR処理最大ページ数（Vision API制限: 最大5ページ）
export const PDF_OCR_MAX_PAGES = 5;

// 埋め込みテキストを採用する最小文字数
export const MIN_EMBEDDED_TEXT_LENGTH = 100;

// OCR信頼度の閾値
export const OCR_CONFIG = {
  minConfidenceThreshold: 70, // 許容する最小信頼度（%）
  lowConfidenceWarning: 50,   // 低信頼度警告の閾値（%）
};
```

### RAG機能の詳細

#### 動的な情報抽出
- チャンク総数の30%を基準に、関連情報を動的に抽出
- 技術者向けは1.5倍、経営層向けは0.8倍に調整
- ベクトルストアの種類に応じた上限設定（ChromaDB: 30、Pinecone: 50、メモリ: 20）

#### ベクトルストアの選択
- **ChromaDB**（デフォルト）: ローカル環境で動作、セットアップが簡単
- **Pinecone**: クラウドベース、大規模データに最適
- **メモリ**: 開発・テスト用、永続化なし

### ステークホルダー管理

ステークホルダー設定ページ（`/stakeholder-settings`）では、以下の操作が可能です：

#### ステークホルダーの追加
1. 「新しいステークホルダーを追加」ボタンをクリック
2. 以下の情報を入力：
   - **役職名**: ステークホルダーの役職（例：プロジェクトマネージャー）
   - **関心事**: ステークホルダーが重視する項目（複数追加可能）
3. 「保存」ボタンをクリック

#### ステークホルダーの編集
1. 編集したいステークホルダーの「編集」ボタンをクリック
2. 役職名や関心事を修正
3. 「更新」ボタンをクリック

#### ステークホルダーの削除
1. 削除したいステークホルダーの「削除」ボタンをクリック
2. 確認ダイアログで「削除」を選択

**注意**: デフォルトのステークホルダー（初期設定の6つ）は削除できません。

## デフォルトステークホルダー

システムには以下の6つのデフォルトステークホルダーが設定されています：

- **CxO / 経営層**: ビジネスへの影響、リスク管理、戦略的意思決定
- **Technical Fellows / 技術専門家**: 技術的詳細、実装の妥当性、イノベーション
- **Architect / アーキテクト**: システム設計、統合性、技術スタック
- **Business Division / 事業部門**: 市場価値、顧客満足度、収益性
- **Product Division / 製品部門**: 製品品質、ユーザー体験、競合優位性
- **R&D Division / 研究開発部門**: 技術革新、研究成果、将来性

## フォルダ構成

```
safety-status-report-tool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── build-knowledge-base/
│   │   │   │   └── route.ts         # ナレッジベース構築API
│   │   │   ├── generate-report/
│   │   │   │   └── route.ts         # レポート生成API（RAG対応）
│   │   │   ├── export-html/
│   │   │   │   └── route.ts         # HTML出力API
│   │   │   ├── export-docx/
│   │   │   │   └── route.ts         # Word出力API
│   │   │   ├── export-pdf/
│   │   │   │   └── route.ts         # PDF出力API
│   │   │   ├── pdf-extract/
│   │   │   │   └── route.ts         # PDFテキスト抽出API（OCR対応）
│   │   │   ├── google-vision-ocr/
│   │   │   │   └── route.ts         # 画像OCR API
│   │   │   └── excel-extract/
│   │   │       └── route.ts         # Excelテキスト抽出API
│   │   │
│   │   ├── components/
│   │   │   ├── FileUpload.tsx       # ファイルアップロードUI
│   │   │   ├── StakeholderSelect.tsx # ステークホルダー選択UI
│   │   │   ├── ReportPreview.tsx    # レポートプレビュー
│   │   │   └── ReportEditor.tsx     # レポート編集機能
│   │   │
│   │   ├── stakeholder-settings/
│   │   │   └── page.tsx             # ステークホルダー設定メインページ
│   │   │
│   │   ├── layout.tsx               # アプリケーションレイアウト
│   │   ├── page.tsx                 # メインページ
│   │   └── globals.css              # グローバルスタイル
│   │
│   ├── lib/
│   │   ├── config/
│   │   │   └── constants.ts         # アプリケーション設定値
│   │   ├── stakeholders.ts          # ステークホルダー管理ロジック
│   │   ├── vector-store.ts          # ベクトルストア管理
│   │   ├── direct-chroma-store.ts   # ChromaDB直接実装
│   │   ├── embeddings.ts            # エンベディング設定
│   │   ├── google-cloud-auth.ts     # Google Cloud認証
│   │   ├── text-processing.ts       # テキスト処理ユーティリティ
│   │   ├── vision-api-utils.ts      # Vision APIエラーハンドリング
│   │   └── pdf-exporter.ts          # PDF出力処理
│   │
│   └── types/
│       └── index.ts                 # TypeScript型定義
│
├── public/
├── .env.local                       # 環境変数（Gitには含めない）
├── .gitignore
├── next.config.js                   # Next.js設定
├── package.json
├── tailwind.config.ts              # Tailwind CSS設定
├── tsconfig.json                   # TypeScript設定
└── README.md
```

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **AI/LLM**: 
  - Anthropic Claude API (Claude 3 Haiku) - レポート生成
  - OpenAI API (text-embedding-3-small) - エンベディング
  - Google Cloud Vision API - OCR処理
- **RAG/ベクトルストア**:
  - ChromaDB（デフォルト）
  - Pinecone（オプション）
  - LangChain - ベクトルストア抽象化
- **ファイル処理**:
  - PDF生成: Puppeteer
  - PDF抽出: pdf-parse-new
  - OCR: @google-cloud/vision
  - Excel処理: xlsx
  - Word生成: docx
- **UI**: React 18
- **データ永続化**: 
  - ローカルストレージ（カスタムステークホルダー用）
  - ベクトルストア（ドキュメント用）

## トラブルシューティング

### OCR関連のエラー

#### Google Cloud Vision API認証エラー
```
Error: 7 UNAUTHENTICATED
```
- サービスアカウントキーが正しく設定されているか確認
- 環境変数`GOOGLE_CLOUD_VISION_KEY`にJSONキー全体が設定されているか確認
- Vision APIが有効化されているか確認

#### APIクォータ制限エラー
```
Error: 8 RESOURCE_EXHAUSTED
```
- 無料枠の制限に達した可能性があります
- Google Cloud Consoleでクォータを確認
- 時間をおいて再試行するか、有料プランにアップグレード

#### PDFページ数制限エラー
```
Error: 3 INVALID_ARGUMENT: At most 5 pages in one call please.
```
- Google Cloud Vision APIは1回の呼び出しで最大5ページまで
- 対処法：
  1. PDFを5ページ以下に分割
  2. 各ページを画像（PNG/JPG）として保存
  3. 重要なページのみ抽出

#### 画像ベースPDFからテキストを抽出できない場合
以下の方法を試してください：
1. **PDFを画像として保存**: 各ページをPNG/JPG形式で保存し、画像ファイルとしてアップロード
2. **Google Drive経由**: PDFをGoogle Driveで開き、Googleドキュメントに変換
3. **Adobe Acrobat**: OCR処理を実行後、テキストPDFとして保存

### ChromaDB接続エラー
- ChromaDBが起動しているか確認（`docker ps`）
- ポート8000が使用可能か確認
- `CHROMA_URL`環境変数が正しく設定されているか確認

### エンベディングエラー
- OpenAI APIキーが有効か確認
- APIの利用制限に達していないか確認

### 大きなファイルの処理
- ファイルは1000文字ごとのチャンクに分割されます
- 非常に大きなファイルは処理に時間がかかる場合があります
- コンテキスト制限により、技術者向けは80,000文字、その他は50,000文字まで
- 画像ファイルは10MB以下を推奨

### レポート生成が遅い場合
- ベクトルストアの検索に時間がかかっている可能性があります
- ChromaDBからPineconeへの切り替えを検討してください
- Claude APIの応答が遅い場合は、しばらく待つか再試行してください

### カスタムステークホルダーが表示されない場合
- ブラウザのローカルストレージをクリアして再度追加
- プライベートブラウジングモードでは永続化されません
- 異なるブラウザ間ではステークホルダー情報は共有されません

### GSNファイルのOCR精度を上げるには
1. **高解像度でスキャン**: 300DPI以上を推奨
2. **鮮明な画像**: ぼやけや歪みがないことを確認
3. **テキスト形式で作成**: 可能であれば、GSN要素を手動でテキストファイルに入力
   ```
   G1: 実証実験期間中、安全に特定運行ができる
   → S1

   S1: システム安全と運行時の残存リスク制御に分けた議論
   → G2, G3
   ```

## 制限事項

- **PDF OCR**: 最大5ページまで（Google Cloud Vision API制限）
- **画像サイズ**: 10MB以下推奨
- **対応言語**: 日本語・英語
- **同時アップロード**: ブラウザのメモリに依存