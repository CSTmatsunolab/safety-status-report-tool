import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { createEmbeddings } from '@/lib/embeddings';

// グローバルストレージ（メモリストアの参照を保持）
const globalStores = (global as any).vectorStores || new Map();
(global as any).vectorStores = globalStores;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { files, stakeholder }: { files: UploadedFile[]; stakeholder: Stakeholder } = 
      await request.json();
    
    if (!stakeholder || !files || files.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.log('Generating report for:', stakeholder.role);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'memory');

    // エンベディングの初期化
    const embeddings = createEmbeddings();

    // ベクトルストアの取得（メモリストア）
    const storeKey = `ssr_${stakeholder.id.replace(/-/g, '_')}`;
    console.log('Looking for vector store with key:', storeKey); // デバッグ用
console.log('Available keys:', Array.from(globalStores.keys())); // デバッグ用

    const vectorStore = globalStores.get(storeKey);

    let contextContent = '';

    if (vectorStore && vectorStore instanceof MemoryVectorStore) {
      // 関連するドキュメントを検索
      console.log('Searching in vector store...');
      const searchQuery = stakeholder.concerns.join(' ');
      const relevantDocs = await vectorStore.similaritySearch(searchQuery, 5);
      
      if (relevantDocs.length > 0) {
        console.log(`Found ${relevantDocs.length} relevant documents`);
        contextContent = relevantDocs.map(doc => doc.pageContent).join('\n\n');
      } else {
        console.log('No relevant documents found, using all files');
        contextContent = files.map(f => f.content.substring(0, 10000)).join('\n\n');
      }
    } else {
      // ベクトルストアがない場合は全ファイルを使用
      console.log('No vector store found, using all file contents');
      contextContent = files.map(f => f.content.substring(0, 10000)).join('\n\n');
    }

    // 文字数制限（Claudeのコンテキスト制限対策）
    if (contextContent.length > 50000) {
      contextContent = contextContent.substring(0, 50000) + '...(省略)';
    }

    // レポート生成
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: `あなたは安全性レポートの専門ライターです。
提供されたGSNファイルと関連文書を詳細に分析し、${stakeholder.role}向けのSafety Status Report (SSR)を作成してください。

重要: 必ず提供された文書の内容に基づいてレポートを作成してください。一般的な内容ではなく、文書に記載されている具体的な情報（プロジェクト名、システム名、場所、日付、技術仕様など）を使用してください。

ステークホルダー情報:
- 役職: ${stakeholder.role}
- 主な関心事: ${stakeholder.concerns.join(', ')}

レポート作成のガイドライン:
- ${stakeholder.role}の視点と関心事に焦点を当てる
- 専門用語は必要に応じて使用するが、明確に説明する
- データと事実に基づいた客観的な分析を提供
- 具体的で実行可能な推奨事項を含める
- **文体は「である調」で統一すること（例：～である、～する、～となる）**

提供された文書の内容:
${contextContent}

上記の文書内容を基に、以下の構成でSSRを作成してください：

1. エグゼクティブサマリー
   - 文書から抽出した具体的なプロジェクト/システムの概要
   - 主要な発見事項（文書に記載されている具体的な内容）
   - ${stakeholder.role}に関連する重要ポイント

2. 安全性の現状分析
   - 文書に記載されている具体的な安全性評価結果
   - 識別されているリスクと課題（文書から直接引用）
   - 現在の対策状況

3. リスク評価と対策
   - 文書で特定されているリスク（具体的なリスクID、内容を含む）
   - 提案されている、または実施済みの対策
   - ${stakeholder.role}の視点から見た優先事項

4. 技術的詳細（${stakeholder.role}に関連する部分）
   - 文書に記載されている技術仕様や標準（ISO規格など）
   - システムアーキテクチャや実装の詳細
   - 検証結果やテストデータ

5. 推奨事項と次のステップ
   - 文書の分析に基づく具体的な改善提案
   - ${stakeholder.role}が取るべきアクション
   - タイムラインと優先順位

注意: レポートは提供された文書の内容を正確に反映し、具体的な事実とデータに基づいて作成してください。文体は必ず「である調」で統一し、「です・ます調」は使用しないこと。`
        }
      ]
    });

    const reportContent = message.content[0].type === 'text' ? message.content[0].text : '';

    const report: Report = {
      id: Math.random().toString(36).substr(2, 9),
      title: `${stakeholder.role}向け Safety Status Report`,
      stakeholder,
      content: reportContent,
      rhetoricStrategy: determineRhetoricStrategy(stakeholder),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { error: 'Report generation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function determineRhetoricStrategy(stakeholder: Stakeholder): string {
  // カスタムステークホルダーの場合、役職から推測
  if (stakeholder.id.startsWith('custom-')) {
    const role = stakeholder.role.toLowerCase();
    
    if (role.includes('品質') || role.includes('qa')) {
      return '品質重視型';
    } else if (role.includes('財務') || role.includes('経理')) {
      return '財務インパクト重視型';
    } else if (role.includes('法務') || role.includes('コンプライアンス')) {
      return '規制・法令遵守重視型';
    } else if (role.includes('人事') || role.includes('hr')) {
      return '人材・組織重視型';
    } else if (role.includes('顧客') || role.includes('カスタマー')) {
      return '顧客価値重視型';
    } else {
      return 'バランス型';
    }
  }
  
  // 既存のロジック
  const roleMap: { [key: string]: string } = {
    'r-and-d': '技術的詳細重視型',
    'product': '製品価値訴求型',
    'business': 'ビジネスインパクト重視型',
    'architect': 'システム設計重視型',
    'technical-fellows': '技術的卓越性重視型',
    'cxo': '戦略的価値重視型'
  };
  
  return roleMap[stakeholder.id] || 'バランス型';
}