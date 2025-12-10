// src/lib/chunk-logger.ts
// チャンク一覧を保存・出力するユーティリティ

import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 型定義
// ============================================

/**
 * チャンク情報
 */
export interface ChunkInfo {
  index: number;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  contentLength: number;
  contentPreview: string;
  contentFull: string;
  metadata: {
    fileType?: string;
    chunkingMethod?: string;
    isGSN?: boolean;
    isMinutes?: boolean;
    extractionMethod?: string;
  };
}

/**
 * ファイル別チャンク情報
 */
export interface FileChunkSummary {
  fileName: string;
  totalChunks: number;
  totalCharacters: number;
  chunkIndices: number[];
}

/**
 * チャンクログ全体
 */
export interface ChunkLogData {
  createdAt: string;
  totalFiles: number;
  totalChunks: number;
  totalCharacters: number;
  chunkingMethod: string;
  fileSummaries: FileChunkSummary[];
  chunks: ChunkInfo[];
}

// ============================================
// メイン機能
// ============================================

/**
 * チャンク一覧をログファイルに保存
 * ナレッジベース構築時に呼び出す
 */
export function saveChunkLog(
  documents: Document[],
  outputDir: string = './logs/chunks'
): string {
  // ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // タイムスタンプ
  const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, -5);
  
  // チャンク情報を構築
  const chunks: ChunkInfo[] = documents.map((doc, index) => ({
    index: index + 1,
    fileName: doc.metadata?.fileName || 'Unknown',
    chunkIndex: doc.metadata?.chunkIndex ?? index,
    totalChunks: doc.metadata?.totalChunks || 1,
    contentLength: doc.pageContent.length,
    contentPreview: doc.pageContent.substring(0, 200).replace(/\n/g, ' '),
    contentFull: doc.pageContent,
    metadata: {
      fileType: doc.metadata?.fileType,
      chunkingMethod: doc.metadata?.chunkingMethod,
      isGSN: doc.metadata?.isGSN || false,
      isMinutes: doc.metadata?.isMinutes || false,
      extractionMethod: doc.metadata?.extractionMethod,
    }
  }));

  // ファイル別サマリーを構築
  const fileMap = new Map<string, FileChunkSummary>();
  
  chunks.forEach(chunk => {
    const existing = fileMap.get(chunk.fileName);
    if (existing) {
      existing.totalChunks++;
      existing.totalCharacters += chunk.contentLength;
      existing.chunkIndices.push(chunk.chunkIndex);
    } else {
      fileMap.set(chunk.fileName, {
        fileName: chunk.fileName,
        totalChunks: 1,
        totalCharacters: chunk.contentLength,
        chunkIndices: [chunk.chunkIndex]
      });
    }
  });

  const fileSummaries = Array.from(fileMap.values());

  // ログデータを構築
  const logData: ChunkLogData = {
    createdAt: new Date().toISOString(),
    totalFiles: fileSummaries.length,
    totalChunks: chunks.length,
    totalCharacters: chunks.reduce((sum, c) => sum + c.contentLength, 0),
    chunkingMethod: chunks[0]?.metadata.chunkingMethod || 'unknown',
    fileSummaries,
    chunks
  };

  // JSONファイルとして保存
  const logPath = path.join(outputDir, `chunks_${timestamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify(logData, null, 2), 'utf-8');

  // 最新のログへのシンボリックリンク的なファイルも作成
  const latestPath = path.join(outputDir, 'chunks_latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(logData, null, 2), 'utf-8');

  console.log(`\n📁 Chunk log saved: ${logPath}`);
  console.log(`   Total files: ${logData.totalFiles}`);
  console.log(`   Total chunks: ${logData.totalChunks}`);
  console.log(`   Total characters: ${logData.totalCharacters.toLocaleString()}`);

  return logPath;
}

/**
 * チャンクログを読み込み
 */
export function loadChunkLog(logPath?: string): ChunkLogData | null {
  const targetPath = logPath || './logs/chunks/chunks_latest.json';
  
  if (!fs.existsSync(targetPath)) {
    console.error(`Chunk log not found: ${targetPath}`);
    return null;
  }

  const content = fs.readFileSync(targetPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * チャンク一覧をTSV形式で出力（スプレッドシート用）
 */
export function exportChunksToTSV(
  logPath?: string,
  outputPath?: string
): string | null {
  const logData = loadChunkLog(logPath);
  if (!logData) return null;

  const output = outputPath || './logs/chunks/chunks_for_labeling.tsv';
  
  // ヘッダー
  const headers = [
    'No.',
    'ファイル名',
    'チャンク番号',
    '文字数',
    '内容プレビュー（200文字）',
    'CxO関連度',
    'TechFellows関連度',
    'Architect関連度',
    'Product関連度',
    'Business関連度',
    'R&D関連度',
    'カテゴリ',
    'メモ'
  ];

  const rows = [headers.join('\t')];

  logData.chunks.forEach(chunk => {
    const row = [
      chunk.index.toString(),
      chunk.fileName,
      chunk.chunkIndex.toString(),
      chunk.contentLength.toString(),
      `"${chunk.contentPreview.replace(/"/g, '""')}"`,
      '', // CxO関連度（ラベリング用空欄）
      '', // TechFellows関連度
      '', // Architect関連度
      '', // Product関連度
      '', // Business関連度
      '', // R&D関連度
      '', // カテゴリ
      ''  // メモ
    ];
    rows.push(row.join('\t'));
  });

  fs.writeFileSync(output, rows.join('\n'), 'utf-8');
  console.log(`\n📄 TSV exported: ${output}`);
  console.log(`   ${logData.chunks.length} chunks ready for labeling`);

  return output;
}

/**
 * ファイル別サマリーをコンソールに出力
 */
export function printFileSummary(logPath?: string): void {
  const logData = loadChunkLog(logPath);
  if (!logData) return;

  console.log('\n' + '═'.repeat(70));
  console.log('📊 Chunk Summary by File');
  console.log('═'.repeat(70));
  console.log(`Created: ${logData.createdAt}`);
  console.log(`Chunking Method: ${logData.chunkingMethod}`);
  console.log('─'.repeat(70));

  console.log('\n| No. | ファイル名 | チャンク数 | 文字数 |');
  console.log('|-----|-----------|-----------|--------|');

  logData.fileSummaries.forEach((file, idx) => {
    console.log(`| ${(idx + 1).toString().padStart(3)} | ${file.fileName.substring(0, 35).padEnd(35)} | ${file.totalChunks.toString().padStart(9)} | ${file.totalCharacters.toLocaleString().padStart(6)} |`);
  });

  console.log('─'.repeat(70));
  console.log(`合計: ${logData.totalFiles} ファイル, ${logData.totalChunks} チャンク, ${logData.totalCharacters.toLocaleString()} 文字`);
  console.log('═'.repeat(70) + '\n');
}

/**
 * 特定ファイルのチャンク詳細を表示
 */
export function printChunkDetails(
  fileName: string,
  logPath?: string
): void {
  const logData = loadChunkLog(logPath);
  if (!logData) return;

  const fileChunks = logData.chunks.filter(c => c.fileName === fileName);
  
  if (fileChunks.length === 0) {
    console.log(`No chunks found for file: ${fileName}`);
    return;
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`📄 Chunk Details: ${fileName}`);
  console.log('═'.repeat(70));

  fileChunks.forEach(chunk => {
    console.log(`\n--- Chunk ${chunk.chunkIndex} (${chunk.contentLength} chars) ---`);
    console.log(chunk.contentPreview + '...');
  });

  console.log('\n' + '═'.repeat(70) + '\n');
}

/**
 * Ground Truth用のJSONテンプレートを生成
 */
export function generateGroundTruthTemplate(
  logPath?: string,
  outputPath?: string
): string | null {
  const logData = loadChunkLog(logPath);
  if (!logData) return null;

  const output = outputPath || './logs/chunks/ground-truth-template.json';

  // ステークホルダー定義
  const stakeholders = [
    { id: 'cxo', role: '経営層（CxO）', concerns: ['リスク管理', 'プロジェクト進捗', '意思決定支援'] },
    { id: 'technical-fellows', role: '技術フェロー', concerns: ['GSN分析', '技術的リスク', 'Evidence検証'] },
    { id: 'architect', role: 'アーキテクト', concerns: ['システム設計', 'GSN構造', 'トレーサビリティ'] },
    { id: 'product', role: 'プロダクトマネージャー', concerns: ['機能要件', '検証進捗', 'スケジュール'] },
    { id: 'business', role: '事業部門', concerns: ['ビジネスインパクト', 'コスト', '規制対応'] },
    { id: 'r-and-d', role: '研究開発', concerns: ['新技術', '検証手法', '技術課題'] }
  ];

  // テンプレート生成
  const template = {
    version: '2.0',
    createdAt: new Date().toISOString(),
    createdBy: '評価者名を入力',
    documentSet: {
      description: 'SSRツール評価用テストデータ',
      totalDocuments: logData.totalFiles,
      totalChunks: logData.totalChunks
    },
    items: stakeholders.map(sh => ({
      evaluationId: `eval_${sh.id}_001`,
      stakeholder: sh,
      expectedInformation: [
        `${sh.role}が必要とする情報1`,
        `${sh.role}が必要とする情報2`
      ],
      relevantChunks: [
        {
          fileName: logData.chunks[0]?.fileName || 'example.pdf',
          chunkIndex: 0,
          relevanceScore: 3,
          category: '例：リスク管理',
          reason: '正解とする理由を記入'
        }
      ]
    })),
    _availableChunks: logData.fileSummaries.map(f => ({
      fileName: f.fileName,
      chunkIndices: f.chunkIndices,
      totalChunks: f.totalChunks
    })),
    _instructions: {
      relevanceScore: {
        '0': '無関係',
        '1': 'やや関連 - 背景情報',
        '2': '関連 - 重要な補足情報',
        '3': '非常に関連 - 必須情報'
      },
      usage: [
        '1. _availableChunks を参照して、各ファイルのチャンク番号を確認',
        '2. chunks_for_labeling.tsv でチャンク内容を確認',
        '3. 各ステークホルダーの relevantChunks に正解を追加',
        '4. _availableChunks と _instructions は評価時に削除可能'
      ]
    }
  };

  fs.writeFileSync(output, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`\n📝 Ground truth template generated: ${output}`);

  return output;
}

// ============================================
// CLI
// ============================================

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'summary':
    printFileSummary(args[1]);
    break;
    
  case 'export-tsv':
    exportChunksToTSV(args[1], args[2]);
    break;
    
  case 'details':
    if (!args[1]) {
      console.error('Usage: chunk-logger.ts details <fileName>');
      process.exit(1);
    }
    printChunkDetails(args[1], args[2]);
    break;
    
  case 'generate-template':
    generateGroundTruthTemplate(args[1], args[2]);
    break;
    
  case 'help':
  default:
    console.log(`
Chunk Logger - チャンク一覧管理ツール
=====================================

Usage:
  npx ts-node chunk-logger.ts <command> [options]

Commands:
  summary [logPath]              ファイル別チャンク数サマリーを表示
  export-tsv [logPath] [output]  ラベリング用TSVファイルを出力
  details <fileName> [logPath]   特定ファイルのチャンク詳細を表示
  generate-template [logPath]    Ground Truthテンプレートを生成
  help                           このヘルプを表示

Examples:
  npx ts-node chunk-logger.ts summary
  npx ts-node chunk-logger.ts export-tsv
  npx ts-node chunk-logger.ts details "Risk_Analysis_Report.pdf"
  npx ts-node chunk-logger.ts generate-template
`);
}