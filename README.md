# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIを活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSVなど多様な形式に対応
- **ステークホルダー別レポート**: 6つの役職グループ向けにカスタマイズされたレポート生成
- **AI活用**: Claude APIを使用した高品質なレポート作成
- **PDF出力**: 生成されたレポートをPDF形式でダウンロード
- **編集機能**: 生成後のレポートを手動で編集可能

## 始め方

### 前提条件

- Node.js 18.0.0以上
- npm または yarn
- Anthropic Claude APIキー

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
   ANTHROPIC_API_KEY=your_claude_api_key_here
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

## 使い方

1. **ドキュメントのアップロード**
   - GSNファイル、議事録、仕様書などをドラッグ&ドロップまたは選択してアップロード

2. **ステークホルダーの選択**
   - 以下の6つから対象を選択：
     - R&D Division / 研究開発部門
     - Product Division / 製品部門
     - Business Division / 事業部門
     - Architect / アーキテクト
     - Technical Fellows / 技術専門家
     - CxO / 経営層

3. **レポート生成**
   - 「レポートを生成」ボタンをクリック
   - AIが選択されたステークホルダー向けにカスタマイズされたSSRを自動生成

4. **レポートの編集・出力**
   - 生成されたレポートをプレビュー画面で確認
   - 必要に応じて編集
   - PDF形式でダウンロード

## フォルダ構成

```
safety-status-report-tool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate-report/
│   │   │   │   └── route.ts         # レポート生成API
│   │   │   ├── export-pdf/
│   │   │   │   └── route.ts         # PDF出力API
│   │   │   └── pdf-extract/
│   │   │       └── route.ts         # PDFテキスト抽出API
│   │   ├── components/
│   │   │   ├── FileUpload.tsx       # ファイルアップロードUI
│   │   │   ├── StakeholderSelect.tsx # ステークホルダー選択UI
│   │   │   ├── ReportPreview.tsx    # レポートプレビュー
│   │   │   └── ReportEditor.tsx     # レポート編集機能
│   │   ├── layout.tsx               # アプリケーションレイアウト
│   │   ├── page.tsx                 # メインページ
│   │   └── globals.css              # グローバルスタイル
│   ├── lib/
│   │   ├── stakeholders.ts          # 事前定義されたステークホルダー
│   │   ├── report-generator.ts      # レポート生成ロジック
│   │   └── pdf-exporter.ts          # PDF出力処理
│   └── types/
│       └── index.ts                 # TypeScript型定義
├── public/
├── .env.local                       # 環境変数（Gitには含めない）
├── .gitignore
├── next.config.js                   # Next.js設定
├── package.json
├── tailwind.config.ts              # Tailwind CSS設定
├── tsconfig.json                   # TypeScript設定
└── README.md

```

## フォルダおよびファイルの説明

### `/src/app/api/` - APIエンドポイント

- **`generate-report/route.ts`**: アップロードされたドキュメントと選択されたステークホルダー情報を基に、Claude APIを使用してSSRを生成
- **`export-pdf/route.ts`**: 生成されたレポートをPuppeteerを使用してPDF形式に変換
- **`pdf-extract/route.ts`**: PDFファイルからテキストを抽出（pdf-parseライブラリ使用）

### `/src/app/components/` - UIコンポーネント

- **`FileUpload.tsx`**: ドラッグ&ドロップ対応のファイルアップロードコンポーネント。PDFの場合は自動的にテキスト抽出
- **`StakeholderSelect.tsx`**: 6つの事前定義されたステークホルダーから選択するUI
- **`ReportPreview.tsx`**: 生成されたレポートの表示とPDF出力機能
- **`ReportEditor.tsx`**: レポートをセクションごとに編集できるリッチエディタ

### `/src/lib/` - ビジネスロジック

- **`stakeholders.ts`**: 6つのステークホルダーグループの定義（役職、関心事）
- **`report-generator.ts`**: レトリック戦略の決定とレポート生成のコアロジック
- **`pdf-exporter.ts`**: HTMLからPDFへの変換処理、日本語フォント対応

### `/src/types/` - 型定義

- **`index.ts`**: アプリケーション全体で使用する型定義
  - `UploadedFile`: アップロードファイル情報
  - `Stakeholder`: ステークホルダー情報
  - `Report`: 生成レポート情報

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **AI**: Anthropic Claude API (Claude 3 Haiku)
- **PDF処理**: 
  - 生成: Puppeteer
  - 抽出: pdf-parse
- **UI**: React 18
- **開発ツール**: Turbopack（高速開発サーバー）

## カスタマイズ

### ステークホルダーの追加・変更

`src/lib/stakeholders.ts` を編集して、新しいステークホルダーグループを追加できます：

```typescript
export const PREDEFINED_STAKEHOLDERS: Stakeholder[] = [
  {
    id: 'new-stakeholder',
    role: '新しい役職名',
    concerns: ['関心事1', '関心事2', '関心事3']
  },
  // ...
];
```

### レポートフォーマットの変更

`src/app/api/generate-report/route.ts` のプロンプトを編集して、レポートの構成や内容をカスタマイズできます。

## トラブルシューティング

### PDFファイルが読み込めない場合
- ブラウザのコンソールでエラーを確認
- PDFが画像ベースの場合、テキスト抽出ができない可能性があります

### レポート生成が遅い場合
- 大きなファイルは自動的に文字数制限（50,000文字）が適用されます
- Claude APIの応答が遅い場合は、しばらく待つか再試行してください

### 環境変数エラー
- `.env.local` ファイルが正しく作成されているか確認
- APIキーが有効であることを確認

## ライセンス

[ライセンス情報を記載]