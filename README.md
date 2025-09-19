# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIとRAG（Retrieval-Augmented Generation）を活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSV、Excel（xls/xlsx）など多様な形式に対応
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
   
   # ベクトルストア設定
   VECTOR_STORE=chromadb または 'pinecone', 'memory'
   
   # ChromaDB使用時（デフォルト）
   CHROMA_URL=http://localhost:8000
   
   # Pinecone使用時
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX_NAME=ssr-index
   ```

4. **ChromaDBの起動（ChromaDB使用時）**
   ```bash
   # 別ターミナルでChromaDBを起動
   docker run -p 8000:8000 chromadb/chroma
   ```

5. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

6. **ブラウザでアクセス**
   
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
│   │   │   │   └── route.ts         # PDFテキスト抽出API
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
│   │   ├── stakeholders.ts          # ステークホルダー管理ロジック
│   │   ├── vector-store.ts          # ベクトルストア管理
│   │   ├── direct-chroma-store.ts   # ChromaDB直接実装
│   │   ├── embeddings.ts            # エンベディング設定
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
- **RAG/ベクトルストア**:
  - ChromaDB（デフォルト）
  - Pinecone（オプション）
  - LangChain - ベクトルストア抽象化
- **ファイル処理**:
  - PDF生成: Puppeteer
  - PDF抽出: pdf-parse-new
  - Excel処理: xlsx
  - Word生成: docx
- **UI**: React 18
- **データ永続化**: 
  - ローカルストレージ（カスタムステークホルダー用）
  - ベクトルストア（ドキュメント用）

## トラブルシューティング

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

### レポート生成が遅い場合
- ベクトルストアの検索に時間がかかっている可能性があります
- ChromaDBからPineconeへの切り替えを検討してください
- Claude APIの応答が遅い場合は、しばらく待つか再試行してください

### カスタムステークホルダーが表示されない場合
- ブラウザのローカルストレージをクリアして再度追加
- プライベートブラウジングモードでは永続化されません
- 異なるブラウザ間ではステークホルダー情報は共有されません
