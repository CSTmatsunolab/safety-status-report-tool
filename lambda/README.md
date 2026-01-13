# Lambda SSR Reporter

Safety Status Report を生成する AWS Lambda Function です。ストリーミングレスポンスに対応しています。

## クイックスタート

### 初回デプロイ

```bash
cd lambda

# 依存関係をインストール
npm install

# ビルド & デプロイ（初回は --guided で対話形式）
sam build
sam deploy --guided
```

### 2回目以降のデプロイ

```bash
cd lambda

# コード変更時は必ず sam build が必要
sam build
sam deploy
```

> **重要**: `sam deploy` だけではダメです。TypeScriptのコードを変更した場合は、必ず `sam build` を先に実行してください。

## デプロイ後の設定

デプロイ完了後、出力される **Lambda Function URL** をコピーして、Next.jsアプリの環境変数に設定します：

```bash
# .env.local または Amplify環境変数
NEXT_PUBLIC_LAMBDA_FUNCTION_URL=https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws/
```

## 環境変数（SAMパラメータ）

| パラメータ | 説明 | 必須 |
|-----------|------|------|
| AnthropicApiKey | Anthropic API キー（Claude用） | ✅ |
| OpenAIApiKey | OpenAI API キー（エンベディング用） | ✅ |
| PineconeApiKey | Pinecone API キー | ✅ |
| PineconeIndexName | Pinecone インデックス名 | デフォルト: `safety-status-report-tool` |
| S3BucketName | S3 バケット名 | ✅ |

## プロジェクト構成

```
lambda/
├── src/
│   ├── index.ts                 # メインハンドラー（ストリーミング）
│   ├── types.ts                 # 型定義
│   ├── wink-tokenizer.d.ts      # WinkTokenizer型定義
│   └── lib/
│       ├── rag/
│       │   ├── index.ts             # RAGモジュールエクスポート
│       │   ├── types.ts             # RAG型定義
│       │   ├── query-enhancer.ts    # クエリ拡張（5クエリ自動生成＋英語クエリ）
│       │   ├── rag-utils.ts         # RAGユーティリティ
│       │   ├── rrf-fusion.ts        # RRF検索・動的K値計算
│       │   └── sparse-vector-utils.ts # 疎ベクトル生成（Kuromoji/Wink）
│       ├── report-prompts.ts        # 日本語プロンプト
│       ├── report-prompts-en.ts     # 英語プロンプト
│       └── rhetoric-strategies.ts   # レトリック戦略
│
├── package.json
├── tsconfig.json
├── template.yaml                # SAMテンプレート
├── samconfig.toml               # SAM設定（デプロイ後に生成）
└── README.md
```

## 処理フロー

```
リクエスト受信
    ↓
1. RRF検索（5クエリ自動生成 + 動的K値）
    ↓
2. コンテキスト準備
   - S3からファイル取得(18MB以上の場合)
   - XLSX → シート別テキスト
   - DOCX → テキスト抽出
   - PDF → ページ数付きテキスト
    ↓
3. プロンプト構築
    ↓
4. Claude API（ストリーミング）
    ↓
5. SSEでリアルタイム送信
```

## ストリームイベント形式

Server-Sent Events (SSE) 形式でレスポンスを返します：

```typescript
// 進捗イベント
{
  type: 'progress',
  status: 'searching' | 'preparing' | 'building' | 'generating' | 'finalizing',
  message: string,
  percent: number
}

// テキストストリーミングイベント
{
  type: 'text',
  content: string  // 生成されたテキストの断片
}

// 完了イベント
{
  type: 'complete',
  report: {
    title: string,
    content: string,
    stakeholder: Stakeholder,
    rhetoricStrategy: string
  }
}

// エラーイベント
{
  type: 'error',
  message: string,
  details?: string
}
```

## フロントエンド連携

`src/hooks/useSectionGeneration.ts` を使用してLambda Functionを呼び出します：

```typescript
const { 
  generateReport, 
  isGenerating, 
  progress,
  streamingContent 
} = useSectionGeneration();

await generateReport({
  files,
  stakeholder,
  reportStructure,
  userIdentifier,
  language: 'ja'
});
```

## トラブルシューティング

### ビルドエラー

```bash
# node_modules を削除して再インストール
rm -rf node_modules
npm install
sam build
```

### デプロイエラー

```bash
# キャッシュをクリア
rm -rf .aws-sam
sam build
sam deploy
```

### 依存関係の追加

新しいnpmパッケージを追加した場合：

```bash
npm install <package-name>
sam build   # 必須！
sam deploy
```

## ローカルテスト

```bash
# SAMローカル実行（Docker必要）
sam local invoke SSRGeneratorFunction -e events/test-event.json
```

## 主要な依存関係

| パッケージ | 用途 |
|-----------|------|
| @anthropic-ai/sdk | Claude API |
| @pinecone-database/pinecone | ベクトル検索 |
| @aws-sdk/client-s3 | S3ファイル取得 |
| openai | エンベディング生成 |
| kuromoji | 日本語トークナイザー |
| wink-tokenizer | 英語トークナイザー |
| xlsx | Excelファイル処理 |
| mammoth | Wordファイル処理 |
| pdf-parse | PDFファイル処理 |