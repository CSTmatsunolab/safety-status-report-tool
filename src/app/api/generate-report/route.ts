import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile, Stakeholder, Report, ReportStructureTemplate } from '@/types';
import { VectorStoreFactory } from '@/lib/vector-store';
///*ログ部分
import fs from 'fs';
import path from 'path';

function saveRAGLog(data: {
  stakeholder: Stakeholder;
  searchQuery: string;
  k: number;
  totalChunks: number;
  vectorStoreType: string;
  relevantDocs: any[];
  contextLength: number;
  fullTextFiles: UploadedFile[];
  timestamp: Date;
}) {
  try {
    // ログディレクトリの作成
    const logDir = path.join(process.cwd(), 'logs', 'rag');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // タイムスタンプ付きファイル名
    const timestamp = data.timestamp.toISOString().replace(/:/g, '-').slice(0, -5);
    const fileName = `rag_${data.stakeholder.id}_${timestamp}.json`;
    const logPath = path.join(logDir, fileName);

    // ログデータの構造化
    const logData = {
      // 基本情報
      timestamp: data.timestamp.toISOString(),
      stakeholder: {
        id: data.stakeholder.id,
        role: data.stakeholder.role,
        concerns: data.stakeholder.concerns
      },
      
      // 検索パラメータ
      searchParams: {
        query: data.searchQuery,
        k: data.k,
        totalChunks: data.totalChunks,
        vectorStoreType: data.vectorStoreType
      },
      
      // 検索結果の統計
      statistics: {
        documentsFound: data.relevantDocs.length,
        totalCharacters: data.relevantDocs.reduce((sum, doc) => sum + doc.pageContent.length, 0),
        contextLength: data.contextLength,
        fullTextFilesCount: data.fullTextFiles.length,
        fullTextCharacters: data.fullTextFiles.reduce((sum, file) => sum + file.content.length, 0)
      },
      
      // ファイル別の統計
      fileBreakdown: (() => {
        const breakdown: { [key: string]: { count: number; characters: number; chunks: number[] } } = {};
        data.relevantDocs.forEach((doc, index) => {
          const fileName = doc.metadata?.fileName || 'Unknown';
          if (!breakdown[fileName]) {
            breakdown[fileName] = { count: 0, characters: 0, chunks: [] };
          }
          breakdown[fileName].count++;
          breakdown[fileName].characters += doc.pageContent.length;
          breakdown[fileName].chunks.push(doc.metadata?.chunkIndex || index);
        });
        return breakdown;
      })(),
      
      // ドキュメントタイプ別の統計
      documentTypes: {
        gsn: data.relevantDocs.filter(doc => doc.metadata?.isGSN).length,
        minutes: data.relevantDocs.filter(doc => doc.metadata?.isMinutes).length,
        other: data.relevantDocs.filter(doc => !doc.metadata?.isGSN && !doc.metadata?.isMinutes).length
      },
      
      // 検索結果の詳細（各ドキュメント）
      documents: data.relevantDocs.map((doc, index) => ({
        index: index + 1,
        metadata: {
          fileName: doc.metadata?.fileName || 'Unknown',
          fileType: doc.metadata?.fileType || 'Unknown',
          chunkIndex: doc.metadata?.chunkIndex,
          totalChunks: doc.metadata?.totalChunks,
          isGSN: doc.metadata?.isGSN || false,
          isMinutes: doc.metadata?.isMinutes || false,
          distance: doc.metadata?.distance,
          score: doc.metadata?.score
        },
        contentPreview: doc.pageContent.substring(0, 500),
        contentLength: doc.pageContent.length,
        // GSN要素の抽出（もしあれば）
        gsnElements: extractGSNElements(doc.pageContent)
      })),
      
      // 全文使用ファイルの情報
      fullTextFiles: data.fullTextFiles.map(file => ({
        name: file.name,
        type: file.type,
        contentLength: file.content.length,
        contentPreview: file.content.substring(0, 300)
      }))
    };

    // JSONファイルとして保存
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2), 'utf-8');
    
    // サマリーログも作成（簡易版）
    const summaryPath = path.join(logDir, 'summary.jsonl');
    const summaryLine = JSON.stringify({
      timestamp: data.timestamp.toISOString(),
      stakeholder: data.stakeholder.id,
      documentsFound: data.relevantDocs.length,
      contextLength: data.contextLength,
      logFile: fileName
    }) + '\n';
    
    fs.appendFileSync(summaryPath, summaryLine, 'utf-8');
    
    console.log(`✅ RAG検索結果を保存しました: ${logPath}`);
    console.log(`📊 サマリー: ${data.relevantDocs.length}件のドキュメント, ${data.contextLength.toLocaleString()}文字`);
    
    return logPath;
  } catch (error) {
    console.error('❌ ログファイルの保存に失敗:', error);
    return null;
  }
}

// GSN要素を抽出するヘルパー関数
function extractGSNElements(text: string): string[] {
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const matches = text.match(gsnPattern);
  return matches ? [...new Set(matches)] : [];
}
//*/

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
- 技術的な正確性を保つ
- 具体的な数値やデータで裏付ける
- 測定可能な指標を提示`,

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
    const { files, stakeholder, fullTextFileIds, reportStructure }: { 
      files: UploadedFile[]; 
      stakeholder: Stakeholder;
      fullTextFileIds?: string[];
      reportStructure?: ReportStructureTemplate; // 追加
    } = await request.json();
    
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
    const vectorStoreType = process.env.VECTOR_STORE || 'memory';

    // ベクターストアタイプに基づいて処理
    if (vectorStoreType === 'pinecone' || vectorStoreType === 'chromadb') {
      // 永続ストア（Pinecone/ChromaDB）の場合
      try {
        const { createEmbeddings } = await import('@/lib/embeddings');
        const embeddings = createEmbeddings();
        
        // VectorStoreFactoryを使って既存のインデックスから取得
        const vectorStore = await VectorStoreFactory.getExistingStore(
          embeddings,
          stakeholder.id
        );
        
        if (vectorStore) {
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
///*ログ部分
              const logPath = saveRAGLog({
                stakeholder,
                searchQuery,
                k,
                totalChunks: stats.totalDocuments,
                vectorStoreType: stats.storeType,
                relevantDocs,
                contextLength: contextContent.length,
                fullTextFiles,
                timestamp: new Date()
              });
//*/
            }
          }
        }
      } catch (error) {
        console.error('Vector store error:', error);
      }
    } else {
      // メモリストアの場合
      const storeKey = `ssr_${stakeholder.id.replace(/-/g, '_')}`;
      const vectorStore = globalStores.get(storeKey);
      
      if (vectorStore && typeof vectorStore.similaritySearch === 'function') {
        console.log('Found memory store, searching...');
        
        try {
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

///*ログ部分
              const logPath = saveRAGLog({
                stakeholder,
                searchQuery,
                k,
                totalChunks: stats.totalDocuments,
                vectorStoreType: stats.storeType,
                relevantDocs,
                contextLength: contextContent.length,
                fullTextFiles,
                timestamp: new Date()
              });
//*/
            }
          }
        } catch (error) {
          console.error('Error during vector search:', error);
        }
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
    const reportSections = reportStructure?.sections || determineReportStructure(stakeholder, strategy);
    const structureDescription = (reportStructure?.description ?? '').slice(0, 500);
    const strategyGuidelines = getStrategyGuidelines(strategy);

    console.log(`Using rhetoric strategy: ${strategy}`);
    console.log(`Report structure: ${reportSections.join(', ')}`);

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

## 提供文書の活用原則
- 提供されたすべての文書から関連情報を漏れなく抽出し、優先的に使用すること
- 特に以下の要素を確実に取り込むこと:
  * 数値データ（統計値、測定値、発生件数、確率、パーセンテージなど）
  * 固有名詞（システム名、地名、組織名、規格名など）
  * 時系列情報（日付、期間、推移、変化傾向など）
  * リスクと対策の対応関係

## 構造化された内容の分析
- **GSNファイルが提供されている場合**:
  - 各Goal（G）ノードに対して、その目標が達成されているかを評価する
  - Strategy（S）ノードの妥当性と実効性を検証する
  - Solution（Sn）やContext（C）が適切に裏付けとなっているか確認する
  - 未達成または不十分なノードがある場合、そのギャップと対策を明記する
  - GSN構造全体の論理的整合性を評価する
- **その他の構造化文書（フローチャート、階層構造など）が提供されている場合**:
  - その構造を理解し、要素間の関係性をレポートに反映させる
  - 構造の完全性と妥当性について評価する

## エビデンスベースの記述
- すべての主張は提供文書のエビデンスに基づくこと
- 文書に記載のない情報は「文書に記載なし」と明記し、推測や仮定値を作成しないこと
- 重要な数値や統計データは必ず原文から正確に引用すること

## リスク分析の徹底
- 識別されたすべてのリスクを漏れなく抽出し、以下の観点で整理:
  * リスクの具体的内容と発生メカニズム
  * 発生確率や影響度（文書に記載がある場合）
  * 実施済み/計画中の対策
  * 残存リスクとその受容可能性

## 図表の取り扱い
- 図表を積極的に挿入し、以下の形式で挿入位置を示す：
  [図表: 説明]
  例：[図表: リスクレベル別の対策状況を示す棒グラフ]
- 図表で示すべきデータがある場合、その主要な数値を本文でも言及すること
- グラフの傾向（上昇/下降/横ばい等）を文章で説明すること

## 定量的情報の優先
- 「多い」「少ない」等の定性表現より、具体的な数値を使用すること
- 統計的分析結果（信頼区間、標準偏差等）がある場合、その意味を解説すること
- 時系列データは変化の傾向と転換点を明確に記述すること

## 完全性と正確性の確保
- 提供文書の重要情報を網羅的に活用すること
- 特に以下は必ず含めること:
  * 安全性評価の結果と根拠
  * 未解決課題と制限事項
  * 前提条件と適用範囲
  * 改善提案と今後の方向性


${strategy}の特徴を活かしてください：
${strategyGuidelines}

提供された文書の内容:
${contextContent}

以下の構成でSSRを作成してください：
構成：${reportSections.map((section, index) => `\n${index + 1}. ${section}`).join('')}
構成説明: ${structureDescription || '（説明なし）'}

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