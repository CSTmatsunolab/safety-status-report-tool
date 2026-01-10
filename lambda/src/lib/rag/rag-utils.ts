// src/lib/rag/rag-utils.ts
// RAG関連ユーティリティ - 動的K値計算、統計情報、ログ

import { Stakeholder, RRFStatistics, DocumentWithScore } from './types';

const DEBUG_LOGGING = process.env.DEBUG_LOGGING;

/**
 * 動的K値計算関数
 * ステークホルダーとドキュメント数に基づいて最適なK値を計算
 */
export function getDynamicK(
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string = 'pinecone'
): number {
  // ベース値: チャンク数の30%
  const baseK = Math.ceil(totalChunks * 0.3);
  
  // ステークホルダーIDベースの判定
  let roleMultiplier = 1.0;
  
  switch(stakeholder.id) {
    case 'technical-fellows':
    case 'architect':
    case 'r-and-d':
      // 技術系: より多くのドキュメントを参照
      roleMultiplier = 1.2;
      break;
    case 'cxo':
    case 'business':
      // ビジネス系: 要点を絞る
      roleMultiplier = 0.7;
      break;
    case 'product':
      // プロダクト: バランス
      roleMultiplier = 1.0;
      break;
    default:
      // カスタムステークホルダー用のフォールバック
      if (stakeholder.id.startsWith('custom_')) {
        roleMultiplier = getCustomStakeholderMultiplier(stakeholder);
      }
  }
  
  // ストアタイプ別の上限
  const limits: Record<string, number> = {
    'pinecone': 50,
    'memory': 20
  };
  
  const maxK = limits[storeType] || 50;
  const finalK = Math.ceil(Math.min(maxK, Math.max(5, baseK * roleMultiplier)));
  if (DEBUG_LOGGING) {
    console.log(`📊 Dynamic K calculation:
      Total chunks: ${totalChunks}
      Base K (30%): ${baseK}
      Stakeholder: ${stakeholder.id}
      Role multiplier: ${roleMultiplier}
      Store limit (${storeType}): ${maxK}
      Final K: ${finalK}
    `);
  }
  return finalK;
}

/**
 * カスタムステークホルダーの倍率を取得
 */
function getCustomStakeholderMultiplier(stakeholder: Stakeholder): number {
  const role = stakeholder.role.toLowerCase();
  
  // 技術系
  if (role.includes('技術') || role.includes('開発') || 
      role.includes('エンジニア') || role.includes('アーキテクト') ||
      role.includes('engineer') || role.includes('developer') ||
      role.includes('architect') || role.includes('technical')) {
    return 1.2;
  }
  
  // 経営系
  if (role.includes('経営') || role.includes('社長') || 
      role.includes('cxo') || role.includes('役員') ||
      role.includes('executive') || role.includes('director') ||
      role.includes('ceo') || role.includes('cto') || role.includes('cfo')) {
    return 0.7;
  }
  
  // リスク/セキュリティ系
  if (role.includes('リスク') || role.includes('セキュリティ') ||
      role.includes('品質') || role.includes('qa') ||
      role.includes('risk') || role.includes('security') ||
      role.includes('quality')) {
    return 1.1;
  }
  
  // デフォルト
  return 1.0;
}

/**
 * ステークホルダー別の重みを取得
 */
export function getWeightsForStakeholder(stakeholder: Stakeholder, queryCount: number): number[] {
  switch(stakeholder.id) {
    case 'technical-fellows':
    case 'architect':
    case 'r-and-d':
      // 技術系：最初のクエリ（完全な専門用語）を重視
      return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.5 : 1.0);
    
    case 'cxo':
    case 'business':
      // ビジネス系：シンプルなクエリを重視
      return Array(queryCount).fill(1.0).map((_, idx) => idx < 2 ? 1.2 : 0.8);
    
    case 'product':
      // プロダクト：バランス型だが最初を少し重視
      return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.2 : 1.0);
    
    default:
      // カスタムステークホルダーの処理
      if (stakeholder.id.startsWith('custom_')) {
        return getCustomStakeholderWeights(stakeholder, queryCount);
      }
      // デフォルト：均等な重み
      return Array(queryCount).fill(1.0);
  }
}

/**
 * カスタムステークホルダーの重み推定
 */
function getCustomStakeholderWeights(stakeholder: Stakeholder, queryCount: number): number[] {
  const idLower = stakeholder.id.toLowerCase();
  const roleLower = stakeholder.role.toLowerCase();
  
  // 技術系のキーワード
  if (idLower.includes('tech') || roleLower.includes('技術') ||
      idLower.includes('engineer') || roleLower.includes('エンジニア') ||
      idLower.includes('dev') || roleLower.includes('開発') ||
      idLower.includes('r-and-d') || roleLower.includes('研究')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.4 : 1.0);
  }
  
  // リスク関連 (Risk/Security/QA)
  if (idLower.includes('risk') || roleLower.includes('リスク') ||
      idLower.includes('security') || roleLower.includes('セキュリティ') ||
      idLower.includes('qa') || roleLower.includes('品質')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx === 0 ? 1.4 : 1.0);
  }

  // ビジネス関連 (Business)
  if (idLower.includes('business') || roleLower.includes('経営') || 
      idLower.includes('exec') || roleLower.includes('営業')) {
    return Array(queryCount).fill(1.0).map((_, idx) => idx < 2 ? 1.2 : 0.9);
  }
  
  // デフォルト：均等
  return Array(queryCount).fill(1.0);
}

/**
 * GSN要素を抽出するヘルパー関数
 */
export function extractGSNElements(text: string): string[] {
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const matches = text.match(gsnPattern);
  return matches ? [...new Set(matches)] : [];
}

/**
 * RRF結果の統計情報を取得
 */
export function getRRFStatistics(documents: DocumentWithScore[]): RRFStatistics {
  if (documents.length === 0) {
    return {
      averageRRFScore: 0,
      averageQueryCoverage: 0,
      documentsByFile: new Map(),
      totalUniqueDocuments: 0
    };
  }
  
  const documentsByFile = new Map<string, number>();
  let totalRRFScore = 0;
  let totalQueryCoverage = 0;
  
  documents.forEach(doc => {
    totalRRFScore += doc.rrfScore || 0;
    totalQueryCoverage += doc.queryScores?.size || 0;
    
    const fileName = (doc.metadata?.fileName as string) || 'unknown';
    documentsByFile.set(fileName, (documentsByFile.get(fileName) || 0) + 1);
  });
  
  return {
    averageRRFScore: totalRRFScore / documents.length,
    averageQueryCoverage: totalQueryCoverage / documents.length,
    documentsByFile,
    totalUniqueDocuments: documents.length
  };
}

/**
 * デバッグ用：RRF結果の詳細を表示
 */
export function debugRRFResults(documents: DocumentWithScore[], queries: string[]): void {
  console.log('\n' + '='.repeat(50));
  console.log('📊 RRF Debug Information');
  console.log('='.repeat(50));
  
  const stats = getRRFStatistics(documents);
  
  console.log('\n📈 Statistics:');
  console.log(`  - Total documents: ${documents.length}`);
  console.log(`  - Average RRF Score: ${stats.averageRRFScore.toFixed(4)}`);
  console.log(`  - Average Query Coverage: ${stats.averageQueryCoverage.toFixed(2)}/${queries.length}`);
  
  console.log('\n📁 Documents by file:');
  stats.documentsByFile.forEach((count: number, file: string) => {
    console.log(`  - ${file}: ${count} chunks`);
  });
  
  console.log('\n🏆 Top 5 documents:');
  documents.slice(0, 5).forEach((doc, idx) => {
    const fileName = (doc.metadata?.fileName as string) || 'unknown';
    const chunkIndex = doc.metadata?.chunkIndex ?? 'N/A';
    console.log(`\n  ${idx + 1}. ${fileName} (chunk ${chunkIndex})`);
    console.log(`     RRF Score: ${doc.rrfScore.toFixed(4)}`);
    console.log(`     Query Coverage: ${doc.queryScores?.size || 0}/${queries.length} queries`);
    
    // GSN要素の抽出
    const gsnElements = extractGSNElements(doc.content);
    if (gsnElements.length > 0) {
      console.log(`     GSN Elements: ${gsnElements.slice(0, 5).join(', ')}${gsnElements.length > 5 ? '...' : ''}`);
    }
  });
  
  console.log('\n' + '='.repeat(50) + '\n');
}

/**
 * コンテンツの切り詰め（大きすぎるファイル用）
 */
export function truncateContent(
  text: string,
  maxChars: number = 50000,
  fileType: string = 'text'
): { content: string; truncated: boolean; originalLength: number } {
  if (text.length <= maxChars) {
    return {
      content: text,
      truncated: false,
      originalLength: text.length
    };
  }

  let truncatedContent = '';

  // マークダウンの場合はセクション単位で切り詰め
  if (fileType.includes('markdown') || fileType.includes('md')) {
    const sections = text.split(/(?=^#{1,3}\s)/m);
    let currentLength = 0;
    
    for (const section of sections) {
      if (currentLength + section.length > maxChars) {
        truncatedContent += '\n\n[内容が大きすぎるため省略されました]';
        break;
      }
      truncatedContent += section;
      currentLength += section.length;
    }
  }
  // テキストファイルは段落単位で切り詰め
  else if (fileType.includes('text') || fileType.includes('plain')) {
    const paragraphs = text.split('\n\n');
    let currentLength = 0;
    
    for (const paragraph of paragraphs) {
      if (currentLength + paragraph.length + 2 > maxChars) {
        truncatedContent += '\n\n[文書の続きは省略されました]';
        break;
      }
      truncatedContent += (currentLength > 0 ? '\n\n' : '') + paragraph;
      currentLength += paragraph.length + 2;
    }
  }
  // その他のファイルは文字単位で切り詰め
  else {
    truncatedContent = text.substring(0, maxChars) + '\n\n[内容が大きすぎるため省略されました]';
  }

  return {
    content: truncatedContent,
    truncated: true,
    originalLength: text.length
  };
}

/**
 * namespace生成
 */
export function generateNamespace(stakeholderId: string, userIdentifier?: string): string {
  if (!userIdentifier) {
    return stakeholderId;
  }
  return `${stakeholderId}_${userIdentifier}`;
}

/**
 * 検索結果のフォーマット
 */
export function formatSearchResults(documents: DocumentWithScore[]): string {
  if (documents.length === 0) {
    return '';
  }
  
  return documents
    .map(doc => doc.content)
    .join('\n\n---\n\n');
}

/**
 * K値達成率の計算とログ
 */
export function logKAchievementRate(
  actualCount: number,
  targetK: number,
  stakeholder: Stakeholder
): void {
  const achievementRate = (actualCount / targetK) * 100;
  if (DEBUG_LOGGING) {
    console.log(`📊 K値達成率:
      Target K: ${targetK}
      Actual: ${actualCount}
      Rate: ${achievementRate.toFixed(1)}%
      Stakeholder: ${stakeholder.id}
    `);
    
    if (achievementRate < 50) {
      console.warn(`⚠️ K値達成率が50%未満です。ナレッジベースのドキュメント数を確認してください。`);
    }
  }
}
