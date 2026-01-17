// src/lib/rag-utils.ts
// RAG関連ユーティリティ - 動的K値計算、統計情報、ログ
// 
// 注意: このファイルは以下の2つを統合したものです
// - src/lib/rag-utils.ts (ログ保存機能)
// - src/lib/rag/rag-utils.ts (RRF検索・統計機能)

import { Stakeholder, UploadedFile } from '@/types';
import { Document } from '@langchain/core/documents';
import fs from 'fs';
import path from 'path';

// ========================================
// 型定義
// ========================================

export interface RRFStatistics {
  averageRRFScore: number;
  averageQueryCoverage: number;
  documentsByFile: Map<string, number>;
  totalUniqueDocuments?: number;
}

export interface DocumentWithScore {
  content: string;
  metadata?: Record<string, unknown>;
  rrfScore: number;
  queryScores?: Map<string, number>;
}

interface DocumentDetail {
  index: number;
  metadata: {
    fileName: string;
    fileType: unknown;
    chunkIndex: number | undefined;
    totalChunks: number | undefined;
    isGSN: boolean;
    isMinutes: boolean;
    distance: number | undefined;
    score: number | undefined;
  };
  contentPreview: string;
  contentLength: number;
  gsnElements: string[];
}

type FileBreakdown = Record<string, { 
  count: number; 
  characters: number; 
  chunks: number[]; 
}>;

export interface RAGLogData {
  stakeholder: Stakeholder;
  searchQuery: string;
  enhancedQueries?: string[]; 
  k: number;
  totalChunks: number;
  vectorStoreType: string;
  relevantDocs: Document[];
  contextLength: number;
  fullTextFiles: UploadedFile[];
  timestamp: Date;
  rrfStatistics?: RRFStatistics;
}

// ========================================
// 環境変数
// ========================================

const DEBUG_LOGGING = process.env.DEBUG_LOGGING;

// ========================================
// 動的K値計算（ステークホルダー別設定方式）
// ========================================

/**
 * ステークホルダー別のK値設定
 * - ratio: ターゲット比率（総チャンク数に対する取得割合）
 * - minK: 最小取得数（チャンク数が少なくてもこの数は確保）
 * - maxK: 最大取得数（チャンク数が多くてもこの数まで）
 */
interface StakeholderKConfig {
  ratio: number;
  minK: number;
  maxK: number;
}

const STAKEHOLDER_K_CONFIG: Record<string, StakeholderKConfig> = {
  // 経営系：要点重視、最低15は確保
  'cxo':               { ratio: 0.25, minK: 15, maxK: 50 },
  'business':          { ratio: 0.30, minK: 15, maxK: 60 },
  
  // プロダクト：中間
  'product':           { ratio: 0.40, minK: 18, maxK: 80 },
  
  // 技術系：詳細必要、最低22〜25を確保
  'technical-fellows': { ratio: 0.55, minK: 22, maxK: 120 },
  'architect':         { ratio: 0.55, minK: 22, maxK: 120 },
  'r-and-d':           { ratio: 0.60, minK: 25, maxK: 120 },
};

// メモリストア用の上限係数（Pineconeの半分程度）
const MEMORY_STORE_MAX_FACTOR = 0.4;

/**
 * 動的K値計算関数
 * ステークホルダーとドキュメント数に基づいて最適なK値を計算
 * 
 * 戦略: ステークホルダー別の比率・最小値・最大値で制御
 * - 少ないチャンク数でも最小値により差がつく
 * - 技術系は高比率（55%〜60%）で十分な情報量
 * - 経営系は低比率（25%〜30%）で要点のみ
 * - 大規模時は最大値で制御（コスト抑制）
 */
export function getDynamicK(
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string = 'pinecone'
): number {
  // ========================================
  // 1. ステークホルダー設定を取得
  // ========================================
  const config = STAKEHOLDER_K_CONFIG[stakeholder.id] 
    ?? getCustomStakeholderKConfig(stakeholder);

  // ========================================
  // 2. ストアタイプによる上限調整
  // ========================================
  let effectiveMaxK = config.maxK;
  if (storeType === 'memory') {
    // メモリストアは上限を下げる
    effectiveMaxK = Math.ceil(config.maxK * MEMORY_STORE_MAX_FACTOR);
  }

  // ========================================
  // 3. K値計算
  // ========================================
  const targetK = Math.ceil(totalChunks * config.ratio);
  const finalK = Math.min(effectiveMaxK, Math.max(config.minK, targetK));

  // ========================================
  // 4. デバッグログ
  // ========================================
  if (DEBUG_LOGGING) {
    const actualRatio = totalChunks > 0 ? (finalK / totalChunks * 100).toFixed(1) : '0';
    console.log(`📊 Dynamic K calculation (stakeholder-based):
    Total chunks: ${totalChunks}
    Stakeholder: ${stakeholder.id}
    Config: ratio=${(config.ratio * 100).toFixed(0)}%, minK=${config.minK}, maxK=${config.maxK}
    Store type: ${storeType} (effective maxK: ${effectiveMaxK})
    Target K: ${targetK}
    Final K: ${finalK} (${actualRatio}% of chunks)
    `);
  }

  return finalK;
}

/**
 * カスタムステークホルダーのK値設定を取得
 */
function getCustomStakeholderKConfig(stakeholder: Stakeholder): StakeholderKConfig {
  const role = stakeholder.role.toLowerCase();
  
  // 技術系 → 技術系設定
  if (role.includes('技術') || role.includes('開発') || 
      role.includes('エンジニア') || role.includes('アーキテクト') ||
      role.includes('engineer') || role.includes('developer') ||
      role.includes('architect') || role.includes('technical') ||
      role.includes('研究') || role.includes('research')) {
    return { ratio: 0.55, minK: 22, maxK: 120 };
  }
  
  // 経営系 → 経営系設定
  if (role.includes('経営') || role.includes('社長') || 
      role.includes('cxo') || role.includes('役員') ||
      role.includes('executive') || role.includes('director') ||
      role.includes('ceo') || role.includes('cto') || role.includes('cfo')) {
    return { ratio: 0.25, minK: 15, maxK: 50 };
  }
  
  // リスク/セキュリティ/品質系 → やや技術寄り
  if (role.includes('リスク') || role.includes('セキュリティ') ||
      role.includes('品質') || role.includes('qa') ||
      role.includes('risk') || role.includes('security') ||
      role.includes('quality')) {
    return { ratio: 0.45, minK: 20, maxK: 100 };
  }
  
  // デフォルト → プロダクト相当
  return { ratio: 0.40, minK: 18, maxK: 80 };
}

// ========================================
// ステークホルダー別の重み
// ========================================

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

// ========================================
// GSN・テキスト処理
// ========================================

/**
 * GSN要素を抽出するヘルパー関数
 */
export function extractGSNElements(text: string): string[] {
  const gsnPattern = /\b([GgSsCcJj]\d+)\b/g;
  const matches = text.match(gsnPattern);
  return matches ? [...new Set(matches)] : [];
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

// ========================================
// RRF統計・デバッグ
// ========================================

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
  if (!DEBUG_LOGGING) return;
  
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

// ========================================
// Namespace・フォーマット
// ========================================

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

// ========================================
// K値設定のエクスポート（テスト・デバッグ用）
// ========================================

/**
 * 現在のK値設定を取得（デバッグ用）
 */
export function getKConfigForStakeholder(stakeholder: Stakeholder): StakeholderKConfig {
  return STAKEHOLDER_K_CONFIG[stakeholder.id] 
    ?? getCustomStakeholderKConfig(stakeholder);
}

/**
 * 全ステークホルダーのK値設定を取得（デバッグ用）
 */
export function getAllKConfigs(): Record<string, StakeholderKConfig> {
  return { ...STAKEHOLDER_K_CONFIG };
}

// ========================================
// ログ保存機能
// ========================================

/**
 * RAGログを保存する関数
 */
export function saveRAGLog(data: RAGLogData): string | null {
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

    const serializeMap = (map: Map<string, number> | undefined): Record<string, number> | undefined => {
      if (!map) return undefined;
      return Object.fromEntries(map);
    };

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
        enhancedQueries: data.enhancedQueries,
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
        fullTextCharacters: data.fullTextFiles.reduce((sum, file) => sum + file.content.length, 0),

        rrfStatistics: data.rrfStatistics ? {
          averageRRFScore: data.rrfStatistics.averageRRFScore,
          averageQueryCoverage: data.rrfStatistics.averageQueryCoverage,
          documentsByFile: serializeMap(data.rrfStatistics.documentsByFile)
        } : undefined
      },
      
      // ファイル別の統計
      fileBreakdown: buildFileBreakdown(data.relevantDocs),
      
      // ドキュメントタイプ別の統計
      documentTypes: {
        gsn: data.relevantDocs.filter(doc => doc.metadata?.isGSN).length,
        minutes: data.relevantDocs.filter(doc => doc.metadata?.isMinutes).length,
        other: data.relevantDocs.filter(doc => !doc.metadata?.isGSN && !doc.metadata?.isMinutes).length
      },
      
      // 検索結果の詳細
      documents: buildDocumentDetails(data.relevantDocs),
      
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
    
    // サマリーログも作成
    saveSummaryLog(data, fileName, logDir);
    
    if (DEBUG_LOGGING) {
      console.log(`RAG検索結果を保存しました: ${logPath}`);
      console.log(`サマリー: ${data.relevantDocs.length}件のドキュメント, ${data.contextLength.toLocaleString()}文字`);
    }
    
    return logPath;
  } catch (error) {
    console.error('ログファイルの保存に失敗:', error);
    return null;
  }
}

/**
 * ファイル別の統計情報を構築
 */
function buildFileBreakdown(relevantDocs: Document[]): FileBreakdown {
  const breakdown: FileBreakdown = {};

  relevantDocs.forEach((doc, index) => {
    const fileName = doc.metadata?.fileName || 'Unknown';
    if (!breakdown[fileName]) {
      breakdown[fileName] = { count: 0, characters: 0, chunks: [] };
    }
    breakdown[fileName].count++;
    breakdown[fileName].characters += doc.pageContent.length;
    breakdown[fileName].chunks.push(doc.metadata?.chunkIndex ?? index);
  });
  
  return breakdown;
}

/**
 * ドキュメントの詳細情報を構築
 */
function buildDocumentDetails(relevantDocs: Document[]): DocumentDetail[] {
  return relevantDocs.map((doc, index) => ({
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
    gsnElements: extractGSNElements(doc.pageContent)
  }));
}

/**
 * サマリーログを保存
 */
function saveSummaryLog(data: RAGLogData, fileName: string, logDir: string): void {
  const summaryPath = path.join(logDir, 'summary.jsonl');
  const summaryLine = JSON.stringify({
    timestamp: data.timestamp.toISOString(),
    stakeholder: data.stakeholder.id,
    documentsFound: data.relevantDocs.length,
    contextLength: data.contextLength,
    logFile: fileName
  }) + '\n';
  
  fs.appendFileSync(summaryPath, summaryLine, 'utf-8');
}