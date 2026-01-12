// csv-exporter.ts - CSV入出力とGround Truth変換
// BOM付きUTF-8でExcel互換

import * as fs from 'fs';
import {
  ChunkForLabeling,
  GroundTruth,
  GroundTruthEntry,
  RetrievedChunk,
} from './types';

// UTF-8 BOM
const UTF8_BOM = '\uFEFF';

/**
 * CSV行をパース（引用符対応）
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

/**
 * 文字列をCSV用にエスケープ
 */
function escapeCSVValue(value: string): string {
  // カンマ、改行、ダブルクォートを含む場合はダブルクォートで囲む
  if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * チャンク一覧をCSV形式で出力（BOM付きUTF-8）
 */
export function exportChunksToCSV(chunks: ChunkForLabeling[], outputPath: string): void {
  const headers = [
    'query_id',
    'query',
    'stakeholder_id',
    'chunk_id',
    'file_name',
    'chunk_index',
    'rank',
    'score',
    'content_preview',
    'relevance_score',
  ];

  const lines: string[] = [headers.join(',')];

  for (const chunk of chunks) {
    const row = [
      escapeCSVValue(chunk.queryId),
      escapeCSVValue(chunk.query),
      escapeCSVValue(chunk.stakeholderId),
      escapeCSVValue(chunk.chunkId),
      escapeCSVValue(chunk.fileName),
      chunk.chunkIndex.toString(),
      chunk.rank.toString(),
      chunk.score.toFixed(4),
      escapeCSVValue(chunk.contentPreview),
      chunk.relevanceScore !== undefined ? chunk.relevanceScore.toString() : '',
    ];
    lines.push(row.join(','));
  }

  // BOM付きUTF-8で出力（Excel互換）
  const csvContent = UTF8_BOM + lines.join('\r\n');
  fs.writeFileSync(outputPath, csvContent, 'utf-8');
  
  console.log(`✅ CSVファイルを出力しました: ${outputPath}`);
  console.log(`   ${chunks.length} 件のチャンク`);
  console.log(`   📌 Excelでダブルクリックで開けます`);
}

/**
 * 検索結果をラベリング用フォーマットに変換
 */
export function convertToLabelingFormat(
  queryId: string,
  query: string,
  stakeholderId: string,
  retrievedChunks: RetrievedChunk[]
): ChunkForLabeling[] {
  return retrievedChunks.map((chunk, index) => ({
    queryId,
    query,
    stakeholderId,
    chunkId: chunk.chunkId,
    fileName: chunk.fileName,
    chunkIndex: (chunk.metadata?.chunkIndex as number) || index,
    rank: chunk.rank,
    score: chunk.score,
    contentPreview: chunk.content || '',
  }));
}

/**
 * 区切り文字を自動検出
 */
function detectDelimiter(firstLine: string): ',' | '\t' {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

/**
 * 行をパース（区切り文字自動検出対応）
 */
function parseLine(line: string, delimiter: ',' | '\t'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

/**
 * 複数行フィールドを含むCSVを行単位に分割
 * ダブルクォート内の改行を正しく処理する
 */
function splitCSVLines(content: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // エスケープされたダブルクォート
        currentLine += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      // クォート外の改行は行の区切り
      lines.push(currentLine);
      currentLine = '';
      if (char === '\r' && nextChar === '\n') {
        i++; // \r\n の場合は \n もスキップ
      }
    } else if (char === '\r' && !inQuotes) {
      // \r 単独の改行
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  
  // 最後の行を追加
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * ラベリング済みCSV/TSVをGround Truth JSONに変換
 */
export function convertLabeledCSVToGroundTruth(
  csvPath: string,
  outputPath: string,
  description: string = ''
): void {
  let content = fs.readFileSync(csvPath, 'utf-8');
  
  // BOMを除去
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  // 複数行フィールドを考慮してCSVを分割
  const lines = splitCSVLines(content.trim());

  if (lines.length < 2) {
    throw new Error('CSVファイルにデータがありません');
  }

  // 区切り文字を自動検出
  const delimiter = detectDelimiter(lines[0]);
  console.log(`📊 区切り文字を検出: ${delimiter === ',' ? 'カンマ (CSV)' : 'タブ (TSV)'}`);
  console.log(`📊 検出された行数: ${lines.length} 行（ヘッダー含む）`);

  // ヘッダー解析
  const headers = parseLine(lines[0], delimiter);
  const queryIdIdx = headers.indexOf('query_id');
  const queryIdx = headers.indexOf('query');
  const stakeholderIdIdx = headers.indexOf('stakeholder_id');
  const chunkIdIdx = headers.indexOf('chunk_id');
  const fileNameIdx = headers.indexOf('file_name');
  const relevanceScoreIdx = headers.indexOf('relevance_score');

  if (queryIdIdx === -1 || chunkIdIdx === -1 || relevanceScoreIdx === -1) {
    throw new Error('必須列（query_id, chunk_id, relevance_score）が見つかりません');
  }

  // エントリをグループ化
  const entriesMap = new Map<string, GroundTruthEntry>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], delimiter);

    const queryId = cols[queryIdIdx];
    const query = cols[queryIdx] || '';
    const stakeholderId = cols[stakeholderIdIdx] || '';
    const chunkId = cols[chunkIdIdx];
    const fileName = cols[fileNameIdx] || '';
    const relevanceScoreStr = cols[relevanceScoreIdx];

    // relevance_scoreが空または無効な場合はスキップ
    if (!relevanceScoreStr || relevanceScoreStr.trim() === '') continue;

    const relevanceScore = parseInt(relevanceScoreStr, 10);
    if (isNaN(relevanceScore) || relevanceScore < 0 || relevanceScore > 3) {
      console.warn(`⚠️ 行${i + 1}の関連度スコアが無効です: ${relevanceScoreStr}`);
      continue;
    }

    // 関連度0は正解チャンクに含めない
    if (relevanceScore === 0) continue;

    if (!entriesMap.has(queryId)) {
      entriesMap.set(queryId, {
        queryId,
        query,
        stakeholderId,
        relevantChunks: [],
      });
    }

    const entry = entriesMap.get(queryId)!;
    entry.relevantChunks.push({
      chunkId,
      fileName,
      relevanceScore,
    });
  }

  const groundTruth: GroundTruth = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    description: description || `Converted from ${csvPath}`,
    entries: Array.from(entriesMap.values()),
  };

  fs.writeFileSync(outputPath, JSON.stringify(groundTruth, null, 2), 'utf-8');
  console.log(`✅ Ground Truth JSONを出力しました: ${outputPath}`);
  console.log(`   ${groundTruth.entries.length} 件のクエリ`);
  console.log(`   合計 ${groundTruth.entries.reduce((sum, e) => sum + e.relevantChunks.length, 0)} 件の正解チャンク`);
}

/**
 * Ground Truth JSONの検証
 */
export function validateGroundTruth(groundTruth: GroundTruth): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!groundTruth.version) {
    errors.push('versionが設定されていません');
  }

  if (!groundTruth.entries || !Array.isArray(groundTruth.entries)) {
    errors.push('entriesが配列ではありません');
    return { valid: false, errors };
  }

  for (let i = 0; i < groundTruth.entries.length; i++) {
    const entry = groundTruth.entries[i];

    if (!entry.queryId) {
      errors.push(`entries[${i}]: queryIdが設定されていません`);
    }

    if (!entry.query) {
      errors.push(`entries[${i}]: queryが設定されていません`);
    }

    if (!entry.relevantChunks || !Array.isArray(entry.relevantChunks)) {
      errors.push(`entries[${i}]: relevantChunksが配列ではありません`);
      continue;
    }

    for (let j = 0; j < entry.relevantChunks.length; j++) {
      const chunk = entry.relevantChunks[j];

      if (!chunk.chunkId) {
        errors.push(`entries[${i}].relevantChunks[${j}]: chunkIdが設定されていません`);
      }

      if (typeof chunk.relevanceScore !== 'number' || chunk.relevanceScore < 0 || chunk.relevanceScore > 3) {
        errors.push(`entries[${i}].relevantChunks[${j}]: relevanceScoreが無効です (0-3の範囲で指定)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Ground Truth JSONファイルを読み込み
 */
export function loadGroundTruth(filePath: string): GroundTruth {
  const content = fs.readFileSync(filePath, 'utf-8');
  const groundTruth: GroundTruth = JSON.parse(content);

  const validation = validateGroundTruth(groundTruth);
  if (!validation.valid) {
    throw new Error(`Ground Truth検証エラー:\n${validation.errors.join('\n')}`);
  }

  return groundTruth;
}

/**
 * Ground Truthテンプレートを生成
 */
export function generateGroundTruthTemplate(outputPath: string): void {
  const template: GroundTruth = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    description: 'Ground Truth Template',
    entries: [
      {
        queryId: 'q1_example',
        query: 'サンプルクエリ',
        stakeholderId: 'example-stakeholder',
        relevantChunks: [
          {
            chunkId: 'chunk_001',
            fileName: 'example.pdf',
            relevanceScore: 3,
          },
          {
            chunkId: 'chunk_002',
            fileName: 'example.pdf',
            relevanceScore: 2,
          },
        ],
      },
    ],
  };

  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`✅ Ground Truthテンプレートを出力しました: ${outputPath}`);
}