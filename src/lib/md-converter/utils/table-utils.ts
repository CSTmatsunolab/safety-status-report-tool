// lib/md-converter/utils/table-utils.ts
// テーブル生成・処理ユーティリティ

import { Document } from '@langchain/core/documents';

/**
 * 配列をMarkdownテーブルに変換
 */
export function arrayToMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return '';

  const maxCols = Math.max(...rows.map(row => row.length));
  if (maxCols === 0) return '';

  const normalizedRows = rows.map(row => {
    const normalized: string[] = [];
    for (let i = 0; i < maxCols; i++) {
      const cell = row[i];
      const cellStr = cell === null || cell === undefined ? '' : String(cell);
      normalized.push(cellStr.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
    }
    return normalized;
  });

  const header = `| ${normalizedRows[0].join(' | ')} |`;
  const separator = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
  const dataRows = normalizedRows.slice(1).map(row => `| ${row.join(' | ')} |`);

  return [header, separator, ...dataRows].join('\n');
}

/**
 * CSVの1行をパース
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * 行データからDocumentを生成
 */
export function createRowDocuments(rows: string[][], fileName: string, fileType: string): Document[] {
  if (rows.length <= 1) return [];

  const headers = rows[0];
  return rows.slice(1).map((row, index) => {
    const content = headers.map((h, i) => `${h}: ${row[i] || ''}`).join('\n');
    return new Document({
      pageContent: content,
      metadata: {
        source: fileName,
        fileType,
        converter: 'custom',
        line: index + 2
      }
    });
  });
}

/**
 * タブ区切りのテキストを Markdown 表に変換
 * Google Docs などからエクスポートされた表形式に対応
 */
export function convertTabSeparatedTables(text: string): string {
  // まず Google Docs 形式を検出・変換
  let md = convertGoogleDocsTableFormat(text);
  
  // 次に標準のタブ区切り形式を変換
  md = convertStandardTabSeparatedTables(md);
  
  return md;
}

/**
 * Google Docs形式の表を変換
 * パターン: 最初のセルがタブなし、続くセルがタブ付きで別行
 */
function convertGoogleDocsTableFormat(text: string): string {
  // CRLF → LF 正規化
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // タブで始まる行のブロックを探す
    if (i + 1 < lines.length && lines[i + 1].startsWith('\t')) {
      // 連続するタブ付き行を収集
      const block: string[] = [trimmed];
      let j = i + 1;
      
      while (j < lines.length && lines[j].startsWith('\t')) {
        block.push(lines[j].replace(/^\t/, '').trim());
        j++;
      }
      
      // 空のセルを除去
      const filteredBlock = block.filter(c => c !== '');
      
      // ブロックが表らしいかチェック（3個以上のセル）
      if (filteredBlock.length >= 3) {
        // 列数を推測（最初のいくつかのセルがヘッダー）
        const numColumns = guessColumnCount(filteredBlock);
        
        if (numColumns >= 2 && filteredBlock.length >= numColumns * 2) {
          // 表として変換
          const table = convertBlockToTable(filteredBlock, numColumns);
          result.push(table);
          i = j;
          continue;
        }
      }
      
      // 表ではない場合はそのまま出力
      result.push(line);
      i++;
    } else {
      result.push(line);
      i++;
    }
  }
  
  return result.join('\n');
}

/**
 * セルブロックから列数を推測
 */
function guessColumnCount(cells: string[]): number {
  // 一般的な表ヘッダーパターンを検出
  const commonHeaders = [
    ['コンポーネント', '責務', '入出力'],  // 3列
    ['項目', '内容', '備考'],               // 3列
    ['名前', '説明', '値'],                 // 3列
    ['ID', '名称', '状態'],                 // 3列
  ];
  
  // 最初の数セルでパターンマッチ
  for (const headers of commonHeaders) {
    let matches = 0;
    for (let i = 0; i < Math.min(headers.length, cells.length); i++) {
      if (cells[i].includes(headers[i]) || headers[i].includes(cells[i])) {
        matches++;
      }
    }
    if (matches >= 2) {
      return headers.length;
    }
  }
  
  // セル数が特定の倍数になるか確認
  for (const cols of [3, 4, 2, 5]) {
    if (cells.length % cols === 0 && cells.length / cols >= 2) {
      return cols;
    }
  }
  
  return 3;  // デフォルト3列
}

/**
 * セルブロックを Markdown 表に変換
 */
function convertBlockToTable(cells: string[], numColumns: number): string {
  const rows: string[][] = [];
  
  for (let i = 0; i < cells.length; i += numColumns) {
    const row: string[] = [];
    for (let j = 0; j < numColumns; j++) {
      const cell = cells[i + j] || '';
      row.push(cell.replace(/\|/g, '\\|').trim());
    }
    rows.push(row);
  }
  
  if (rows.length < 2) return cells.join(' ');
  
  const header = `| ${rows[0].join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const dataRows = rows.slice(1).map(row => `| ${row.join(' | ')} |`);
  
  return '\n' + [header, separator, ...dataRows].join('\n') + '\n';
}

/**
 * 標準のタブ区切り形式を変換（1行に複数セル）
 */
function convertStandardTabSeparatedTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let tableBuffer: string[][] = [];
  let inTable = false;
  let expectedColumns = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // タブを含む行を検出（ただしタブで始まる行は除外 - Google Docs形式で処理済み）
    if (trimmed.includes('\t') && !line.startsWith('\t')) {
      const cells = trimmed.split('\t').map(c => c.trim());
      
      if (cells.length >= 2) {
        if (!inTable) {
          inTable = true;
          expectedColumns = cells.length;
          tableBuffer = [cells];
        } else if (cells.length === expectedColumns || 
                   (cells.length >= 2 && Math.abs(cells.length - expectedColumns) <= 1)) {
          tableBuffer.push(cells);
        } else {
          if (tableBuffer.length >= 2) {
            result.push(convertTableBufferToMarkdown(tableBuffer));
          } else if (tableBuffer.length === 1) {
            result.push(tableBuffer[0].join(' '));
          }
          tableBuffer = [cells];
          expectedColumns = cells.length;
        }
        continue;
      }
    }
    
    if (inTable) {
      if (trimmed === '' && i + 1 < lines.length && 
          lines[i + 1].includes('\t') && !lines[i + 1].startsWith('\t')) {
        continue;
      }
      
      if (tableBuffer.length >= 2) {
        result.push(convertTableBufferToMarkdown(tableBuffer));
      } else if (tableBuffer.length === 1) {
        result.push(tableBuffer[0].join(' '));
      }
      
      tableBuffer = [];
      inTable = false;
      expectedColumns = 0;
    }
    
    result.push(line);
  }
  
  if (tableBuffer.length >= 2) {
    result.push(convertTableBufferToMarkdown(tableBuffer));
  } else if (tableBuffer.length === 1) {
    result.push(tableBuffer[0].join(' '));
  }
  
  return result.join('\n');
}

/**
 * 表バッファを Markdown 表に変換
 */
function convertTableBufferToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return '';
  
  // 最大列数を取得
  const maxCols = Math.max(...rows.map(row => row.length));
  if (maxCols === 0) return '';
  
  // 各行を正規化（列数を揃える）
  const normalizedRows = rows.map(row => {
    const normalized: string[] = [];
    for (let i = 0; i < maxCols; i++) {
      const cell = row[i] || '';
      normalized.push(cell.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
    }
    return normalized;
  });
  
  // Markdown 表を生成
  const header = `| ${normalizedRows[0].join(' | ')} |`;
  const separator = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
  const dataRows = normalizedRows.slice(1).map(row => `| ${row.join(' | ')} |`);
  
  return '\n' + [header, separator, ...dataRows].join('\n') + '\n';
}
