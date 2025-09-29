import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile, Stakeholder, Report } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';


// グローバルストレージ（メモリストアの参照を保持）
const globalStores = (global as any).vectorStores || new Map();
(global as any).vectorStores = globalStores;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

//レトリック戦略の定義
enum RhetoricStrategy {
  DATA_DRIVEN = 'データ駆動型説得法',
  EMOTIONAL_APPEAL = '感情訴求型',
  LOGICAL_REASONING = '論理的推論型',
  AUTHORITY_BASED = '権威依拠型',
  PROBLEM_SOLUTION = '問題解決型',
  NARRATIVE = 'ナラティブ型'
}

// 動的K値計算関数
const getDynamicK = (
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string
): number => {
  // ベース値
  let baseK = Math.ceil(totalChunks * 0.3);
  
  // ステークホルダーIDベースの判定（より確実）
  let roleMultiplier = 1.0;
  
  // IDベースの判定
  switch(stakeholder.id) {
    case 'technical-fellows':
    case 'architect':
    case 'r-and-d':
      roleMultiplier = 1.2;
      break;
    case 'cxo':
    case 'business':
      roleMultiplier = 0.7;
      break;
    case 'product':
      roleMultiplier = 1.0;
      break;
  }

  // カスタムステークホルダー用のフォールバック
  if (stakeholder.id.startsWith('custom_')) {
    const role = stakeholder.role.toLowerCase();
    if (role.includes('技術') || role.includes('開発') || 
        role.includes('エンジニア') || role.includes('アーキテクト')) {
      roleMultiplier = 1.2;
    } else if (role.includes('経営') || role.includes('社長') || 
               role.includes('cxo') || role.includes('役員')) {
      roleMultiplier = 0.7;
    }
  }
  
  // ストアタイプ別の上限
  const limits: Record<string, number> = {
    'pinecone': 50,
    'chromadb-direct': 30,
    'memory': 20
  };
  
  const maxK = limits[storeType] || 20;
  const finalK = Math.ceil(Math.min(maxK, Math.max(5, baseK * roleMultiplier)));
  
  console.log(`Dynamic K calculation:
    Total chunks: ${totalChunks}
    Base K (30%): ${baseK}
    Role multiplier: ${roleMultiplier}
    Store limit: ${maxK}
    Final K: ${finalK}
  `);

  return finalK;
};

//戦略別のガイドライン取得
function getStrategyGuidelines(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- 具体的な数値やデータを多用する
- グラフや表で視覚的に示す
- 統計的な根拠を明確にする
- 客観的な事実に基づく論証`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- ステークホルダーの価値観に訴える
- 成功事例やストーリーを活用
- ビジョンや理想を描く
- 共感を呼ぶ表現を使用`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- 論理的な流れを重視
- 因果関係を明確に示す
- 段階的な説明を心がける
- 技術的な正確性を保つ`,
    
    [RhetoricStrategy.AUTHORITY_BASED]: `
- 業界標準や規格を引用
- 専門家の意見を参照
- ベストプラクティスを紹介
- 信頼性の高い情報源を使用`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- 問題を明確に定義
- 根本原因を分析
- 実現可能な解決策を提示
- 実装手順を具体的に説明`,
    
    [RhetoricStrategy.NARRATIVE]: `
- ストーリー形式で展開
- 時系列で経緯を説明
- 登場人物と役割を明確化
- 将来のビジョンへつなげる`
  };
  
  return guidelines[strategy];
}

//レポート構造の決定
function determineReportStructure(
  stakeholder: Stakeholder,
  strategy: RhetoricStrategy
): string[] {
  // 戦略に応じて構造を調整
  switch (strategy) {
    case RhetoricStrategy.DATA_DRIVEN:
      return [
        'エグゼクティブサマリー',
        'データ概要',
        '分析結果',
        'インサイト',
        '推奨事項',
        '実装計画'
      ];
      
    case RhetoricStrategy.PROBLEM_SOLUTION:
      return [
        'エグゼクティブサマリー',
        '問題の定義',
        '根本原因分析',
        '解決策の提案',
        '実装ロードマップ',
        '期待される成果'
      ];
      
    case RhetoricStrategy.NARRATIVE:
      return [
        'エグゼクティブサマリー',
        'プロジェクトの経緯',
        '現在の状況',
        '主要な課題',
        '提案する方向性',
        'アクションプラン'
      ];
      
    default:
      return [
        'エグゼクティブサマリー',
        '現状分析',
        'リスク評価',
        '推奨事項',
        '次のステップ'
      ];
  }
}

//改良版のレトリック戦略決定
 
function determineAdvancedRhetoricStrategy(stakeholder: Stakeholder): RhetoricStrategy {
  const role = stakeholder.role.toLowerCase();
  const concerns = stakeholder.concerns.join(' ').toLowerCase();
  
  // IDベースの判定を優先
  switch(stakeholder.id) {
    case 'technical-fellows':
    case 'architect':
      return RhetoricStrategy.LOGICAL_REASONING;
    case 'r-and-d':
      return RhetoricStrategy.AUTHORITY_BASED;
    case 'cxo':
    case 'business':
    case 'product':
      return RhetoricStrategy.DATA_DRIVEN;
  }
  
  // カスタムステークホルダー用の判定
  if (role.includes('技術') || role.includes('エンジニア') || role.includes('開発')) {
    return RhetoricStrategy.LOGICAL_REASONING;
  } else if (role.includes('営業') || role.includes('マーケティング')) {
    return RhetoricStrategy.EMOTIONAL_APPEAL;
  } else if (concerns.includes('リスク') || concerns.includes('安全')) {
    return RhetoricStrategy.PROBLEM_SOLUTION;
  } else if (role.includes('プロジェクト') || role.includes('pm')) {
    return RhetoricStrategy.NARRATIVE;
  }
  // デフォルトはデータ駆動型
  return RhetoricStrategy.DATA_DRIVEN;
}

// rhetoricStrategyフィールド用の表示名を返す関数
function getRhetoricStrategyDisplayName(strategy: RhetoricStrategy, stakeholder: Stakeholder): string {
  // デフォルトステークホルダー用の表示名
  const displayNameMap: { [key: string]: string } = {
    'technical-fellows': '技術的卓越性重視型',
    'architect': 'システム設計重視型',
    'r-and-d': '技術的詳細重視型',
    'cxo': '戦略的価値重視型',
    'business': 'ビジネスインパクト重視型',
    'product': '製品価値訴求型'
  };
  
  // カスタムステークホルダー用の細かい戦略名
  if (stakeholder.id.startsWith('custom_')) {
    const role = stakeholder.role.toLowerCase();
    if (role.includes('品質') || role.includes('qa')) return '品質重視型';
    if (role.includes('財務') || role.includes('経理')) return '財務インパクト重視型';
    if (role.includes('法務') || role.includes('コンプライアンス')) return '規制・法令遵守重視型';
    if (role.includes('人事') || role.includes('hr')) return '人材・組織重視型';
    if (role.includes('顧客') || role.includes('カスタマー')) return '顧客価値重視型';
  }
  
  // デフォルトステークホルダーの場合は事前定義された名前を返す
  if (displayNameMap[stakeholder.id]) {
    return displayNameMap[stakeholder.id];
  }
  
  // それ以外はEnum値をそのまま使用
  return strategy;
}

export async function POST(request: NextRequest) {
  try {
    const { files, stakeholder }: { files: UploadedFile[]; stakeholder: Stakeholder } = 
      await request.json();
    
    if (!stakeholder) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }
    const safeFiles = files || [];

    console.log('Generating report for:', stakeholder.role);
    console.log('Using vector store:', process.env.VECTOR_STORE || 'memory');

    // 全文使用ファイルとRAG対象ファイルを分離
    const fullTextFiles = safeFiles.filter(f => f.includeFullText);
    const ragTargetFiles = safeFiles.filter(f => !f.includeFullText);
    
    console.log(`Files breakdown: ${fullTextFiles.length} full-text, ${ragTargetFiles.length} RAG target`);

    const storeKey = `ssr_${stakeholder.id.replace(/-/g, '_')}`;
    const vectorStore = globalStores.get(storeKey);
    let contextContent = '';

    // RAG検索（ベクトルストアが存在すれば実行）
    if (vectorStore && typeof vectorStore.similaritySearch === 'function') {
      console.log('Found vector store, searching...');
      
      try {
          // 統計情報を取得
        const stats = await VectorStoreFactory.getVectorStoreStats(
          vectorStore, 
          stakeholder.id
        );
          console.log('Vector store stats:', stats);
        
        if (stats.totalDocuments > 0) {
          const k = getDynamicK(stats.totalDocuments, stakeholder, stats.storeType);
          const searchQuery = `${stakeholder.role} ${stakeholder.concerns.join(' ')}`;
          console.log(`Searching with query: "${searchQuery}" and k=${k}`);
          
          const relevantDocs = await vectorStore.similaritySearch(searchQuery, k);
          
          if (relevantDocs.length > 0) {
            console.log(`Found ${relevantDocs.length} relevant documents from RAG`);
            contextContent = '=== RAG抽出内容 ===\n\n' + 
              relevantDocs
                .map((doc: any) => doc.pageContent)
                .join('\n\n---\n\n');
          }
        }
      } catch (error) {
        console.error('Error during vector search:', error);
      }
    }

    // 全文使用ファイルを追加
    if (fullTextFiles.length > 0) {
      console.log(`Adding ${fullTextFiles.length} full-text files to context`);
      
      const fullTextContent = fullTextFiles
        .map(file => `=== ファイル: ${file.name} (全文) ===\n\n${file.content}`)
        .join('\n\n---\n\n');
      
      if (contextContent) {
        contextContent += '\n\n\n' + fullTextContent;
      } else {
        contextContent = fullTextContent;
      }
    }

    // フォールバック処理
    if (!contextContent) {
      console.log('No content found, using fallback');
      contextContent = safeFiles.map(f => f.content.substring(0, 10000)).join('\n\n');
    }

    // 文字数制限
    const MAX_CONTEXT = stakeholder.role.includes('技術') ? 80000 : 50000;
    if (contextContent.length > MAX_CONTEXT) {
      contextContent = contextContent.substring(0, MAX_CONTEXT) + '\n\n...(文字数制限により省略)';
    }

    // 高度なレトリック戦略を決定
    const strategy = determineAdvancedRhetoricStrategy(stakeholder);
    const reportStructure = determineReportStructure(stakeholder, strategy);
    const strategyGuidelines = getStrategyGuidelines(strategy);

    console.log(`Using rhetoric strategy: ${strategy}`);
    console.log(`Report structure: ${reportStructure.join(', ')}`);

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
- レトリック戦略: ${strategy}

レポート作成のガイドライン:
- ${stakeholder.role}の視点と関心事に焦点を当てる
- 専門用語は必要に応じて使用するが、明確に説明する
- データと事実に基づいた客観的な分析を提供
- 具体的で実行可能な推奨事項を含める
- **文体は「である調」で統一すること（例：～である、～する、～となる）**

${strategy}の特徴を活かしてください：
${strategyGuidelines}

図表が効果的な箇所では、以下の形式で挿入位置を示してください：
[図表: 説明]
例：[図表: リスクレベル別の対策状況を示す棒グラフ]

提供された文書の内容:
${contextContent}

以下の構成でSSRを作成してください：
${reportStructure.map((section, index) => `\n${index + 1}. ${section}`).join('')}

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
      rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder),
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