// lib/table-aware-chunking.ts
// テーブル構造を保持するチャンキング

export interface TableChunk {
  type: 'table';
  content: string;
  header: string;
  rows: string[];
  startIndex: number;
  endIndex: number;
}

export interface TextChunk {
  type: 'text';
  content: string;
  startIndex: number;
  endIndex: number;
}

export type ContentSegment = TableChunk | TextChunk;

/**
 * テーブルパターンの検出
 * - マークダウン形式（| 区切り）
 * - スペース/タブ区切りの表形式
 * - 連続する構造化データ行
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  
  // マークダウンテーブル
  if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
    return true;
  }
  
  // タブ区切り（3つ以上のセル）
  if (trimmed.split('\t').length >= 3) {
    return true;
  }
  
  // スペース区切りで構造化されたデータ行
  // パターン: ID/コード + 複数の値
  const idPatterns = [
    // ID パターン（M-001, R-002, H-003, TC-001, TD-01 etc.）
    /^[A-Z]{1,3}-\d{2,4}\b/,
    // 数字始まり（01, 001, 1. など）で続きがある
    /^\d{1,3}[.\s]\s*\S/,
    // 日付パターン
    /^\d{4}-\d{2}-\d{2}\b/,
  ];
  
  const hasIdPattern = idPatterns.some(p => p.test(trimmed));
  
  // 複数のスペース区切り値がある（2つ以上の連続スペースで区切られている）
  const spaceSeparatedValues = trimmed.split(/\s{2,}/).filter(v => v.trim());
  const hasMultipleValues = spaceSeparatedValues.length >= 3;
  
  // 数値を複数含む（表データの特徴）
  const numberCount = (trimmed.match(/\d+/g) || []).length;
  const hasMultipleNumbers = numberCount >= 2;
  
  // IDパターン + 複数値 OR 複数値 + 複数数値
  if (hasIdPattern && hasMultipleValues) {
    return true;
  }
  
  if (hasMultipleValues && hasMultipleNumbers && spaceSeparatedValues.length >= 4) {
    return true;
  }
  
  return false;
}

/**
 * テーブルヘッダーの検出
 */
function isTableHeader(line: string, nextLine?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  
  // マークダウンのセパレータ行
  if (/^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(trimmed)) {
    return false; // これはセパレータ
  }
  
  // ヘッダーらしいキーワードを含む
  const headerKeywords = [
    'ID', 'No', '番号', '名前', '名称', 'Name',
    '状態', 'Status', '担当', '期限', 'Date',
    'スコア', 'Score', '確率', '深刻度',
    '対策', 'リスク', 'ハザード', 'Hazard',
    'コスト', 'Cost', '進捗', '%', '対象'
  ];
  const hasHeaderKeyword = headerKeywords.some(kw => trimmed.includes(kw));
  
  // 次の行がテーブル行なら、この行はヘッダーの可能性
  if (nextLine && isTableRow(nextLine) && hasHeaderKeyword) {
    return true;
  }
  
  // | で区切られ、次の行がセパレータ
  if (trimmed.includes('|') && nextLine) {
    const nextTrimmed = nextLine.trim();
    if (/^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(nextTrimmed)) {
      return true;
    }
  }
  
  return false;
}

/**
 * クロスリファレンス部分の検出
 */
function isCrossReference(line: string): boolean {
  const trimmed = line.trim();
  const crossRefPatterns = [
    /^[•●◆■]\s*関連/,
    /^[•●◆■]\s*対策/,
    /^[•●◆■]\s*検証/,
    /^[•●◆■]\s*試験/,
    /^[•●◆■]\s*設計/,
    /^[•●◆■]\s*参照/,
    /関連・参照/,
    /クロスリファレンス/,
    /Cross.*Reference/i,
  ];
  return crossRefPatterns.some(p => p.test(trimmed));
}

/**
 * テキストをセグメント（テーブル / テキスト）に分割
 */
export function segmentContent(text: string): ContentSegment[] {
  const lines = text.split('\n');
  const segments: ContentSegment[] = [];
  
  let currentTextLines: string[] = [];
  let currentTextStart = 0;
  let tableLines: string[] = [];
  let tableHeader = '';
  let tableStart = -1;
  let inTable = false;
  let inCrossRef = false;
  let crossRefLines: string[] = [];
  let crossRefStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i < lines.length - 1 ? lines[i + 1] : undefined;
    
    // クロスリファレンス部分の検出
    if (isCrossReference(line)) {
      // 前のテキストを保存
      if (currentTextLines.length > 0) {
        segments.push({
          type: 'text',
          content: currentTextLines.join('\n'),
          startIndex: currentTextStart,
          endIndex: i - 1
        });
        currentTextLines = [];
      }
      
      if (!inCrossRef) {
        inCrossRef = true;
        crossRefStart = i;
        crossRefLines = [];
      }
      crossRefLines.push(line);
      continue;
    }
    
    // クロスリファレンス終了
    if (inCrossRef && !isCrossReference(line) && line.trim()) {
      // クロスリファレンスは特別なテキストとして保存（後で低優先度にできる）
      segments.push({
        type: 'text',
        content: '【参照情報】\n' + crossRefLines.join('\n'),
        startIndex: crossRefStart,
        endIndex: i - 1
      });
      inCrossRef = false;
      crossRefLines = [];
      currentTextStart = i;
    }
    
    // テーブルヘッダーの検出
    if (!inTable && isTableHeader(line, nextLine)) {
      // 前のテキストを保存
      if (currentTextLines.length > 0) {
        segments.push({
          type: 'text',
          content: currentTextLines.join('\n'),
          startIndex: currentTextStart,
          endIndex: i - 1
        });
        currentTextLines = [];
      }
      
      inTable = true;
      tableStart = i;
      tableHeader = line;
      tableLines = [line];
      continue;
    }
    
    // テーブル行の検出
    if (!inTable && isTableRow(line)) {
      // 前のテキストを保存
      if (currentTextLines.length > 0) {
        segments.push({
          type: 'text',
          content: currentTextLines.join('\n'),
          startIndex: currentTextStart,
          endIndex: i - 1
        });
        currentTextLines = [];
      }
      
      inTable = true;
      tableStart = i;
      // 前の行がヘッダーかもしれないので確認
      if (i > 0 && !lines[i-1].trim().match(/^[•●◆■]/)) {
        tableHeader = lines[i-1];
        tableLines = [lines[i-1], line];
      } else {
        tableHeader = '';
        tableLines = [line];
      }
      continue;
    }
    
    // テーブル継続中
    if (inTable) {
      // マークダウンセパレータはスキップ
      if (/^\|?[\s\-:]+\|[\s\-:|]+\|?$/.test(line.trim())) {
        tableLines.push(line);
        continue;
      }
      
      // テーブル行が続く場合
      if (isTableRow(line) || (line.trim() && line.includes('|'))) {
        tableLines.push(line);
        continue;
      }
      
      // 空行はテーブル終了の可能性
      if (!line.trim()) {
        // 次の行もテーブル行なら継続
        if (nextLine && isTableRow(nextLine)) {
          tableLines.push(line);
          continue;
        }
        // テーブル終了
        segments.push({
          type: 'table',
          content: tableLines.join('\n'),
          header: tableHeader,
          rows: tableLines.filter(l => l.trim() && l !== tableHeader),
          startIndex: tableStart,
          endIndex: i - 1
        });
        inTable = false;
        tableLines = [];
        tableHeader = '';
        currentTextStart = i + 1;
        continue;
      }
      
      // テーブル以外の行 → テーブル終了
      segments.push({
        type: 'table',
        content: tableLines.join('\n'),
        header: tableHeader,
        rows: tableLines.filter(l => l.trim() && l !== tableHeader),
        startIndex: tableStart,
        endIndex: i - 1
      });
      inTable = false;
      tableLines = [];
      tableHeader = '';
      currentTextStart = i;
      currentTextLines = [line];
      continue;
    }
    
    // 通常のテキスト行
    if (currentTextLines.length === 0) {
      currentTextStart = i;
    }
    currentTextLines.push(line);
  }
  
  // 残りを保存
  if (inCrossRef && crossRefLines.length > 0) {
    segments.push({
      type: 'text',
      content: '【参照情報】\n' + crossRefLines.join('\n'),
      startIndex: crossRefStart,
      endIndex: lines.length - 1
    });
  } else if (inTable && tableLines.length > 0) {
    segments.push({
      type: 'table',
      content: tableLines.join('\n'),
      header: tableHeader,
      rows: tableLines.filter(l => l.trim() && l !== tableHeader),
      startIndex: tableStart,
      endIndex: lines.length - 1
    });
  } else if (currentTextLines.length > 0) {
    segments.push({
      type: 'text',
      content: currentTextLines.join('\n'),
      startIndex: currentTextStart,
      endIndex: lines.length - 1
    });
  }
  
  return segments;
}

/**
 * テーブルを適切なサイズのチャンクに分割
 * ヘッダーを各チャンクに付与
 */
export function chunkTable(table: TableChunk, maxRows: number = 10): string[] {
  const { header, rows } = table;
  
  if (rows.length <= maxRows) {
    // 小さいテーブルはそのまま
    return [table.content];
  }
  
  // 大きいテーブルは分割（ヘッダーを各チャンクに付与）
  const chunks: string[] = [];
  for (let i = 0; i < rows.length; i += maxRows) {
    const chunkRows = rows.slice(i, Math.min(i + maxRows, rows.length));
    const chunkContent = header 
      ? [header, ...chunkRows].join('\n')
      : chunkRows.join('\n');
    chunks.push(chunkContent);
  }
  
  return chunks;
}

/**
 * デバッグ用: セグメント情報を表示
 */
export function debugSegments(segments: ContentSegment[]): void {
  console.log('\n=== Content Segments ===');
  segments.forEach((seg, idx) => {
    console.log(`\n[${idx}] Type: ${seg.type}`);
    console.log(`    Lines: ${seg.startIndex}-${seg.endIndex}`);
    console.log(`    Preview: ${seg.content.substring(0, 100)}...`);
    if (seg.type === 'table') {
      console.log(`    Rows: ${seg.rows.length}`);
    }
  });
  console.log('\n========================\n');
}
