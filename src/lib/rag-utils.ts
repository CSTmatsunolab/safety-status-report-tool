// src/lib/rag-utils.ts

import { Stakeholder, UploadedFile } from '@/types';
import fs from 'fs';
import path from 'path';

/**
 * 動的K値計算関数
 */
export function getDynamicK(
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string
): number {
  // ベース値
  let baseK = Math.ceil(totalChunks * 0.3);
  
  // ステークホルダーIDベースの判定
  let roleMultiplier = 1.0;
  
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
 * RAGログデータの型定義
 */
export interface RAGLogData {
  stakeholder: Stakeholder;
  searchQuery: string;
  k: number;
  totalChunks: number;
  vectorStoreType: string;
  relevantDocs: any[];
  contextLength: number;
  fullTextFiles: UploadedFile[];
  timestamp: Date;
}

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
    
    console.log(`✅ RAG検索結果を保存しました: ${logPath}`);
    console.log(`📊 サマリー: ${data.relevantDocs.length}件のドキュメント, ${data.contextLength.toLocaleString()}文字`);
    
    return logPath;
  } catch (error) {
    console.error('❌ ログファイルの保存に失敗:', error);
    return null;
  }
}

/**
 * ファイル別の統計情報を構築
 */
function buildFileBreakdown(relevantDocs: any[]): Record<string, any> {
  const breakdown: { [key: string]: { count: number; characters: number; chunks: number[] } } = {};
  
  relevantDocs.forEach((doc, index) => {
    const fileName = doc.metadata?.fileName || 'Unknown';
    if (!breakdown[fileName]) {
      breakdown[fileName] = { count: 0, characters: 0, chunks: [] };
    }
    breakdown[fileName].count++;
    breakdown[fileName].characters += doc.pageContent.length;
    breakdown[fileName].chunks.push(doc.metadata?.chunkIndex || index);
  });
  
  return breakdown;
}

/**
 * ドキュメントの詳細情報を構築
 */
function buildDocumentDetails(relevantDocs: any[]): any[] {
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