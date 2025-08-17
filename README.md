# Safety Status Report 自動生成ツール

GSNファイルや議事録などのデータから、AIを活用してステークホルダー向けの安全性レポートを自動生成するNext.jsアプリケーションです。

## 始め方

### 前提条件

- Node.js 18.0.0以上
- npm または yarn
- OpenAI APIキー

### インストール手順

1. **リポジトリのクローン**
   ```bash
   git clone [repository-url]
   cd safety-status-report-tool
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   
   プロジェクトルートに`.env.local`ファイルを作成し、以下を追加：
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

5. **ブラウザでアクセス**
   
   [http://localhost:3000](http://localhost:3000) を開く

### ビルドと本番環境

```bash
# プロダクションビルド
npm run build

# 本番サーバーの起動
npm start
```

## フォルダ構成

```
safety-status-report-tool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/
│   │   │   │   └── route.ts
│   │   │   ├── generate-report/
│   │   │   │   └── route.ts
│   │   │   └── export-pdf/
│   │   │       └── route.ts
│   │   ├── components/
│   │   │   ├── FileUpload.tsx
│   │   │   ├── StakeholderSelect.tsx
│   │   │   ├── ReportPreview.tsx
│   │   │   └── ReportEditor.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── ai-analysis.ts
│   │   ├── report-generator.ts
│   │   └── pdf-exporter.ts
│   └── types/
│       └── index.ts
├── public/
├── .env.local
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## フォルダおよびファイルの説明

### `/src/app/` - アプリケーションのメインディレクトリ

#### `/src/app/api/` - APIエンドポイント
- **`analyze/route.ts`**: アップロードされたファイルをAIで分析し、ステークホルダーと主要情報を抽出
- **`generate-report/route.ts`**: 選択されたステークホルダー向けにカスタマイズされたレポートを生成
- **`export-pdf/route.ts`**: 生成されたレポートをPDF形式でエクスポート

#### `/src/app/components/` - Reactコンポーネント
- **`FileUpload.tsx`**: ドラッグ&ドロップ対応のファイルアップロードUI
- **`StakeholderSelect.tsx`**: AI分析で抽出されたステークホルダーを選択するコンポーネント
- **`ReportPreview.tsx`**: 生成されたレポートのプレビューと編集機能
- **`ReportEditor.tsx`**: レポートの詳細編集用エディタ（実装予定）

#### アプリケーションルートファイル
- **`page.tsx`**: メインページコンポーネント。全体のワークフローを管理
- **`layout.tsx`**: アプリケーション全体のレイアウト定義
- **`globals.css`**: グローバルスタイルシート

### `/src/lib/` - ユーティリティ関数とビジネスロジック

- **`ai-analysis.ts`**: AI分析のコアロジック（OpenAI API連携）
- **`report-generator.ts`**: レポート生成のレトリック戦略と文書構成ロジック
- **`pdf-exporter.ts`**: PDF生成とフォーマット処理

### `/src/types/` - TypeScript型定義

- **`index.ts`**: アプリケーション全体で使用する型定義
  - `UploadedFile`: アップロードファイルの型
  - `Stakeholder`: ステークホルダー情報の型
  - `AnalysisResult`: AI分析結果の型
  - `Report`: 生成レポートの型

### ルートディレクトリの設定ファイル

- **`next.config.js`**: Next.jsの設定（Turbopack有効化など）
- **`tailwind.config.ts`**: Tailwind CSSの設定
- **`tsconfig.json`**: TypeScriptコンパイラ設定
- **`package.json`**: プロジェクトの依存関係とスクリプト
- **`.env.local`**: 環境変数（APIキーなど）※Gitには含めない
- **`.gitignore`**: Git管理対象外ファイルの指定

### `/public/` - 静的ファイル

アイコン、画像、フォントなどの静的アセットを配置

## 主な機能

1. **ファイルアップロード**: GSNファイル、議事録のドラッグ&ドロップアップロード
2. **AI分析**: アップロードデータからステークホルダーと重要情報を自動抽出
3. **レポート生成**: 選択したステークホルダー向けにカスタマイズされたレポートを自動生成
4. **編集機能**: 生成されたレポートの手動編集
5. **PDF出力**: 完成レポートのPDF形式でのダウンロード

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **AI**: OpenAI API (GPT-4)
- **PDF生成**: @react-pdf/renderer, Puppeteer
- **開発ツール**: Turbopack（高速開発サーバー）