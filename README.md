# Safety Status Report (SSR) 自動生成ツール

GSNファイルや議事録などのドキュメントから、AIを活用してステークホルダー別のSafety Status Report（安全性状況報告書）を自動生成するNext.jsアプリケーションです。

## 主な機能

- **ファイルアップロード**: PDF、テキスト、CSVなど多様な形式に対応
- **ステークホルダー別レポート**: カスタマイズ可能なステークホルダーグループ向けのレポート生成
- **ステークホルダー管理**: ステークホルダーの追加・編集・削除機能
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

### 基本的な使用フロー

1. **ドキュメントのアップロード**
   - GSNファイル、議事録、仕様書などをドラッグ&ドロップまたは選択してアップロード

2. **ステークホルダーの選択**
   - デフォルトまたはカスタムステークホルダーから対象を選択

3. **レポート生成**
   - 「レポートを生成」ボタンをクリック
   - AIが選択されたステークホルダー向けにカスタマイズされたSSRを自動生成

4. **レポートの編集・出力**
   - 生成されたレポートをプレビュー画面で確認
   - 必要に応じて編集
   - PDF形式でダウンロード

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
│   │   │   ├── generate-report/
│   │   │   │   └── route.ts         # レポート生成API
│   │   │   ├── export-html/
│   │   │   │   └── route.ts         # html出力API
│   │   │   ├── export-docx/
│   │   │   │   └── route.ts         # docx出力API
│   │   │   ├── export-pdf/
│   │   │   │   └── route.ts         # PDF出力API
│   │   │   └── pdf-extract/
│   │   │       └── route.ts         # PDFテキスト抽出API
│   │   ├── components/
│   │   │   ├── FileUpload.tsx       # ファイルアップロードUI
│   │   │   ├── StakeholderSelect.tsx # ステークホルダー選択UI
│   │   │   ├── ReportPreview.tsx    # レポートプレビュー
│   │   │   └── ReportEditor.tsx     # レポート編集機能
│   │   ├── stakeholder-settings/
│   │   │   └── page.tsx             # ステークホルダー設定メインページ
│   │   ├── layout.tsx               # アプリケーションレイアウト
│   │   ├── page.tsx                 # メインページ
│   │   └── globals.css              # グローバルスタイル
│   ├── lib/
│   │   ├── stakeholders.ts          # ステークホルダー管理ロジック
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
- **`StakeholderSelect.tsx`**: デフォルトおよびカスタムステークホルダーから選択するUI
- **`ReportPreview.tsx`**: 生成されたレポートの表示とPDF出力機能
- **`ReportEditor.tsx`**: レポートをセクションごとに編集できるリッチエディタ

### `/src/app/stakeholder-settings/` - ステークホルダー設定ページ

- **`page.tsx`**: ステークホルダーの追加・編集・削除機能を提供するメインページ。ローカルストレージを使用してカスタムステークホルダー情報を永続化

### `/src/lib/` - ビジネスロジック

- **`stakeholders.ts`**: ステークホルダー管理のコアロジック
  - デフォルトステークホルダーの定義
  - カスタムステークホルダーの追加・更新・削除処理
  - ローカルストレージとの同期
- **`report-generator.ts`**: レトリック戦略の決定とレポート生成のコアロジック
- **`pdf-exporter.ts`**: HTMLからPDFへの変換処理、日本語フォント対応

### `/src/types/` - 型定義

- **`index.ts`**: アプリケーション全体で使用する型定義
  - `UploadedFile`: アップロードファイル情報
  - `Stakeholder`: ステークホルダー情報（デフォルト/カスタムフラグを含む）
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
- **データ永続化**: ローカルストレージ（カスタムステークホルダー用）
- **開発ツール**: Turbopack（高速開発サーバー）

## カスタマイズ

### プログラマティックなステークホルダーの追加

コード内でデフォルトステークホルダーを追加する場合は、`src/lib/stakeholders.ts` を編集します：

```typescript
export const PREDEFINED_STAKEHOLDERS: Stakeholder[] = [
  {
    id: 'new-stakeholder',
    role: '新しい役職名',
    concerns: ['関心事1', '関心事2', '関心事3'],
    isDefault: true  // デフォルトステークホルダーとして設定
  },
  // ...
];
```

### UIを使用したステークホルダーの追加

アプリケーション内の「ステークホルダー設定」ページ（`/stakeholder-settings`）から、GUIを使用してステークホルダーを追加・編集・削除できます。この方法で追加されたステークホルダーは、ブラウザのローカルストレージに保存されます。

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

### カスタムステークホルダーが表示されない場合
- ブラウザのローカルストレージをクリアして再度追加
- プライベートブラウジングモードでは永続化されません
- 異なるブラウザ間ではステークホルダー情報は共有されません
