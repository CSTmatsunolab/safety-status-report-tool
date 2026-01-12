// csv-exporter.ts - CSV入出力とGround Truth変換
// BOM付きUTF-8でExcel互換

import * as fs from 'fs';
import * as XLSX from 'xlsx';
import {
  ChunkForLabeling,
  GroundTruth,
  GroundTruthEntry,
  RetrievedChunk,
} from './types';

// UTF-8 BOM
const UTF8_BOM = '\uFEFF';

// ============================================================
// 優先度マッピング読み込み（RAG評価データリスト.xlsx）
// ============================================================

/**
 * ステークホルダーIDとExcel列名の対応
 */
const STAKEHOLDER_COLUMN_MAP: Record<string, string> = {
  'cxo': 'CxO',
  'technical-fellows': 'Tech Fellows',
  'architect': 'Architect',
  'product': 'Product',
  'business': 'Business',
  'r-and-d': 'R&D',
};

/**
 * 優先度記号からスコアへの変換
 */
function prioritySymbolToScore(symbol: string): number {
  switch (symbol) {
    case '◎': return 3;
    case '○': return 2;
    case '△': return 1;
    default: return 0;
  }
}

/**
 * ファイル名の正規化（拡張子を除去して比較用に変換）
 */
function normalizeFileName(fileName: string): string {
  // 拡張子を除去し、小文字に変換
  return fileName.replace(/\.(pdf|md|txt|docx)$/i, '').toLowerCase();
}

/**
 * RAG評価データリスト.xlsxから優先度マッピングを読み込む
 */
export function loadPriorityMapping(
  xlsxPath: string
): Map<string, Record<string, number>> {
  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = 'ファイル一覧';
  const worksheet = workbook.Sheets[sheetName];
  
  if (!worksheet) {
    throw new Error(`シート "${sheetName}" が見つかりません`);
  }

  const data = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);
  
  // ファイル名 → {stakeholderId: score} のマッピング
  const mapping = new Map<string, Record<string, number>>();

  for (const row of data) {
    const fileName = row['ファイル名'];
    if (!fileName) continue;

    const normalizedName = normalizeFileName(fileName);
    const scores: Record<string, number> = {};

    for (const [stakeholderId, columnName] of Object.entries(STAKEHOLDER_COLUMN_MAP)) {
      const symbol = row[columnName] || '';
      scores[stakeholderId] = prioritySymbolToScore(symbol);
    }

    mapping.set(normalizedName, scores);
  }

  console.log(`📊 優先度マッピング読み込み完了: ${mapping.size} ファイル`);
  return mapping;
}

/**
 * チャンクのファイル名から優先度スコアを取得
 */
export function getPriorityScore(
  chunkFileName: string,
  stakeholderId: string,
  priorityMapping: Map<string, Record<string, number>>
): number {
  const normalizedName = normalizeFileName(chunkFileName);
  const scores = priorityMapping.get(normalizedName);
  
  if (!scores) {
    console.warn(`⚠️ 優先度マッピングに未登録: ${chunkFileName}`);
    return 1; // デフォルトは低優先度
  }

  return scores[stakeholderId] ?? 1;
}

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

    // 関連度0-1は正解チャンクに含めない（2以上のみ正解）
    // 0 = 無関係、1 = 背景情報程度（△）→ 除外
    // 2 = 重要（○）、3 = 必須（◎）→ 正解
    if (relevanceScore < 2) continue;

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

// ============================================================
// 全チャンクラベリング用（横並びフォーマット）
// ============================================================

/**
 * 全チャンクデータの型
 */
export interface AllChunkData {
  chunkId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
}

/**
 * 全チャンクをCSV形式で出力（横並びフォーマット）
 * 各ステークホルダーのrelevance列を横に並べる
 * priorityMappingが指定されていれば自動で優先度を設定
 */
export function exportAllChunksToCSV(
  chunks: AllChunkData[],
  stakeholderIds: string[],
  outputPath: string,
  priorityMapping?: Map<string, Record<string, number>>
): void {
  // ヘッダー作成
  const headers = [
    'chunk_id',
    'file_name',
    'chunk_index',
    'content_preview',
    ...stakeholderIds.map(id => `relevance_${id}`),
  ];

  const lines: string[] = [headers.join(',')];

  for (const chunk of chunks) {
    // 優先度マッピングがあれば自動設定、なければ空
    const relevanceScores = stakeholderIds.map(stakeholderId => {
      if (priorityMapping) {
        return getPriorityScore(chunk.fileName, stakeholderId, priorityMapping).toString();
      }
      return '';
    });

    const row = [
      escapeCSVValue(chunk.chunkId),
      escapeCSVValue(chunk.fileName),
      chunk.chunkIndex.toString(),
      escapeCSVValue(chunk.content),
      ...relevanceScores,
    ];
    lines.push(row.join(','));
  }

  // BOM付きUTF-8で出力（Excel互換）
  const csvContent = UTF8_BOM + lines.join('\r\n');
  fs.writeFileSync(outputPath, csvContent, 'utf-8');
  
  console.log(`✅ 全チャンクCSVを出力しました: ${outputPath}`);
  console.log(`   ${chunks.length} 件のチャンク`);
  console.log(`   ステークホルダー列: ${stakeholderIds.join(', ')}`);
  if (priorityMapping) {
    console.log(`   📌 優先度を自動設定しました（RAG評価データリスト.xlsxより）`);
    console.log(`   📌 内容を確認し、関係なさそうなチャンクは0に変更してください`);
  }
  console.log(`   📌 Excelでダブルクリックで開けます`);
}

/**
 * 横並びCSVをGround Truth JSONに変換
 */
export function convertAllChunksCSVToGroundTruth(
  csvPath: string,
  outputPath: string,
  uuid: string,
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

  // ヘッダー解析
  const headers = parseLine(lines[0], ',');
  const chunkIdIdx = headers.indexOf('chunk_id');
  const fileNameIdx = headers.indexOf('file_name');
  
  // relevance_* 列を検出
  const relevanceColumns: { stakeholderId: string; index: number }[] = [];
  headers.forEach((header, index) => {
    if (header.startsWith('relevance_')) {
      const stakeholderId = header.replace('relevance_', '');
      relevanceColumns.push({ stakeholderId, index });
    }
  });

  if (chunkIdIdx === -1) {
    throw new Error('chunk_id 列が見つかりません');
  }

  if (relevanceColumns.length === 0) {
    throw new Error('relevance_* 列が見つかりません');
  }

  console.log(`📊 検出された行数: ${lines.length} 行（ヘッダー含む）`);
  console.log(`📊 ステークホルダー列: ${relevanceColumns.map(c => c.stakeholderId).join(', ')}`);

  // ステークホルダーごとにエントリを作成
  const entriesMap = new Map<string, GroundTruthEntry>();

  for (const { stakeholderId } of relevanceColumns) {
    entriesMap.set(stakeholderId, {
      queryId: `rrf_${stakeholderId}`,
      query: `[RRF] ${stakeholderId}`,
      stakeholderId,
      relevantChunks: [],
    });
  }

  // 各行を処理
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], ',');
    const baseChunkId = cols[chunkIdIdx]; // uuid_file.md_3 形式
    const fileName = cols[fileNameIdx] || '';

    for (const { stakeholderId, index } of relevanceColumns) {
      const relevanceScoreStr = cols[index];

      // 空または無効な場合はスキップ
      if (!relevanceScoreStr || relevanceScoreStr.trim() === '') continue;

      const relevanceScore = parseInt(relevanceScoreStr, 10);
      if (isNaN(relevanceScore) || relevanceScore < 0 || relevanceScore > 3) {
        console.warn(`⚠️ 行${i + 1}の${stakeholderId}関連度スコアが無効です: ${relevanceScoreStr}`);
        continue;
      }

      // 関連度0-1は正解チャンクに含めない（2以上のみ正解）
      // 0 = 無関係、1 = 背景情報程度（△）→ 除外
      // 2 = 重要（○）、3 = 必須（◎）→ 正解
      if (relevanceScore < 2) continue;

      // chunk_idをステークホルダー用に変換
      // baseChunkId: uuid_file.md_3
      // fullChunkId: stakeholder_uuid_file.md_3
      const fullChunkId = `${stakeholderId}_${baseChunkId}`;

      const entry = entriesMap.get(stakeholderId)!;
      entry.relevantChunks.push({
        chunkId: fullChunkId,
        fileName,
        relevanceScore,
      });
    }
  }

  const groundTruth: GroundTruth = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    description: description || `Converted from ${csvPath} (all chunks)`,
    entries: Array.from(entriesMap.values()),
  };

  fs.writeFileSync(outputPath, JSON.stringify(groundTruth, null, 2), 'utf-8');
  console.log(`✅ Ground Truth JSONを出力しました: ${outputPath}`);
  
  for (const entry of groundTruth.entries) {
    console.log(`   ${entry.stakeholderId}: ${entry.relevantChunks.length} 件の正解チャンク`);
  }
}