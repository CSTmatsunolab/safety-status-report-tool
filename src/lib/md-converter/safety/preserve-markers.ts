// lib/md-converter/safety/preserve-markers.ts
// 保護マーカーとID抽出

/**
 * 図表番号パターン（様々なファイル形式に対応）
 */
const CAPTION_PATTERNS = [
  // 日本語（数字あり）
  /^表\s*[0-9０-９]+[.:：\s]/i,           // 表1: 表 1. 表１：
  /^図\s*[0-9０-９]+[.:：\s]/i,           // 図1: 図 1. 図１：
  /^リスト\s*[0-9０-９]+[.:：\s]/i,       // リスト1:
  /^一覧\s*[0-9０-９]+[.:：\s]/i,         // 一覧1:
  /^チャート\s*[0-9０-９]+[.:：\s]/i,     // チャート1:
  /^グラフ\s*[0-9０-９]+[.:：\s]/i,       // グラフ1:
  /^ダイアグラム\s*[0-9０-９]+[.:：\s]/i, // ダイアグラム1:
  /^コード\s*[0-9０-９]+[.:：\s]/i,       // コード1:
  /^ソースコード\s*[0-9０-９]+[.:：\s]/i, // ソースコード1:
  /^スニペット\s*[0-9０-９]+[.:：\s]/i,   // スニペット1:
  /^例\s*[0-9０-９]+[.:：\s]/i,           // 例1:
  /^サンプル\s*[0-9０-９]+[.:：\s]/i,     // サンプル1:
  
  // 日本語（「について」パターン - Wordの自動番号対応）
  /^表\s*.{0,30}について$/i,              // 表　ADR-101について
  /^図\s*.{0,30}について$/i,              // 図　システム構成について
  /^表\s*.{0,30}一覧$/i,                  // 表　コンポーネント一覧
  /^図\s*.{0,30}概要$/i,                  // 図　アーキテクチャ概要
  
  // 英語
  /^Table\s*[0-9]+[.:：\s]/i,             // Table 1: Table 1.
  /^Figure\s*[0-9]+[.:：\s]/i,            // Figure 1:
  /^Fig\.\s*[0-9]+[.:：\s]/i,             // Fig. 1:
  /^List\s*[0-9]+[.:：\s]/i,              // List 1:
  /^Listing\s*[0-9]+[.:：\s]/i,           // Listing 1:
  /^Chart\s*[0-9]+[.:：\s]/i,             // Chart 1:
  /^Diagram\s*[0-9]+[.:：\s]/i,           // Diagram 1:
  /^Graph\s*[0-9]+[.:：\s]/i,             // Graph 1:
  /^Code\s*[0-9]+[.:：\s]/i,              // Code 1:
  /^Snippet\s*[0-9]+[.:：\s]/i,           // Snippet 1:
  /^Example\s*[0-9]+[.:：\s]/i,           // Example 1:
  /^Sample\s*[0-9]+[.:：\s]/i,            // Sample 1:
  
  // 略称・記号パターン
  /^\[表\s*[0-9０-９]+\]/i,               // [表1]
  /^\[図\s*[0-9０-９]+\]/i,               // [図1]
  /^\[Table\s*[0-9]+\]/i,                 // [Table 1]
  /^\[Figure\s*[0-9]+\]/i,                // [Figure 1]
  /^\[Fig\.\s*[0-9]+\]/i,                 // [Fig. 1]
  /^\[Code\s*[0-9]+\]/i,                  // [Code 1]
  
  // 括弧付きパターン
  /^【表\s*[0-9０-９]+】/i,               // 【表1】
  /^【図\s*[0-9０-９]+】/i,               // 【図1】
  /^【コード\s*[0-9０-９]+】/i,           // 【コード1】
  
  // コロンなしパターン（番号の後に直接タイトル）
  /^表[0-9０-９]+\s+\S/,                  // 表1 コンポーネント一覧
  /^図[0-9０-９]+\s+\S/,                  // 図1 システム構成
  /^Table\s*[0-9]+\s+\S/i,                // Table 1 Components
  /^Figure\s*[0-9]+\s+\S/i,               // Figure 1 Architecture
];

/**
 * 図表番号パターンに一致するかチェック
 */
function isCaptionLine(line: string): boolean {
  let trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return false;  // 最低3文字
  
  // 太字マーカーを除去して判定（**表1** のようなパターン対応）
  trimmed = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  
  // 明確なパターンに一致
  if (CAPTION_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }
  
  // 「表」「図」で始まり、短い行（5〜50文字）で、文末が「。」でない
  // → 図表タイトルは通常「。」で終わらない
  if (/^[表図]/.test(trimmed) && 
      trimmed.length >= 5 && 
      trimmed.length <= 50 &&
      !trimmed.endsWith('。') &&
      !trimmed.endsWith('．')) {
    return true;
  }
  
  return false;
}

/**
 * 指定位置から次の非空行を探す
 */
function findNextNonEmptyLine(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < lines.length && i < startIndex + 3; i++) {
    const trimmed = lines[i].trim();
    if (trimmed !== '') {
      return trimmed;
    }
  }
  return null;
}

/**
 * 指定位置から数行先に表があるかチェック
 */
function findTableAhead(lines: string[], startIndex: number, maxLines: number): boolean {
  for (let i = startIndex; i < lines.length && i < startIndex + maxLines; i++) {
    const trimmed = lines[i].trim();
    if (/^\|/.test(trimmed)) {
      return true;  // 表が見つかった
    }
    if (trimmed !== '' && !isCaptionLine(trimmed)) {
      return false;  // 表以外の内容が見つかった
    }
  }
  return false;
}

/**
 * 保護マーカーを追加（表と図表番号を一緒に保護）
 * - 表の直前にある図表番号（キャプション）
 * - 表の直後にある図表番号（キャプション）
 * - 図表番号と表の間に空行があっても対応
 */
export function addPreserveMarkers(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;
  let pendingCaption: string[] = [];  // 図表番号（複数行対応）

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const isTableRow = /^\|/.test(trimmedLine);
    const isCaption = isCaptionLine(trimmedLine);
    const isEmpty = trimmedLine === '';
    
    // 先読み：この行から数行先に表があるか確認
    const tableAhead = findTableAhead(lines, i + 1, 3);  // 最大3行先まで

    if (isTableRow && !inTable) {
      // 表の開始
      inTable = true;
      result.push('<!-- PRESERVE_START -->');
      
      // 保留中の図表番号があれば先に追加
      if (pendingCaption.length > 0) {
        pendingCaption.forEach(cap => result.push(cap));
        pendingCaption = [];
      }
      
      result.push(line);
    } else if (!isTableRow && inTable) {
      // 表の終了の可能性
      
      // 空行の場合は次の行もチェック
      if (isEmpty) {
        const nextNonEmptyLine = findNextNonEmptyLine(lines, i + 1);
        if (nextNonEmptyLine && isCaptionLine(nextNonEmptyLine)) {
          // 表の直後に図表番号がある → 図表番号も含めて保護を継続
          result.push(line);  // 空行を追加
          continue;
        }
      }
      
      // 図表番号の場合は表と一緒に保護
      if (isCaption) {
        result.push(line);  // 図表番号を追加
        result.push('<!-- PRESERVE_END -->');
        inTable = false;
        continue;
      }
      
      // 通常の表終了
      result.push('<!-- PRESERVE_END -->');
      inTable = false;
      
      // 現在の行が次の表の図表番号かチェック
      if (isCaption && tableAhead) {
        pendingCaption.push(line);
      } else {
        result.push(line);
      }
    } else if (isCaption && tableAhead && !inTable) {
      // 表の直前にある図表番号 → 保留して次の表と一緒に保護
      pendingCaption.push(line);
    } else if (isEmpty && pendingCaption.length > 0 && tableAhead) {
      // 図表番号の後の空行で、まだ表が来る → 保留に追加
      pendingCaption.push(line);
    } else {
      // 通常の行
      if (pendingCaption.length > 0 && !isTableRow && !tableAhead) {
        // 保留中の図表番号があるが、表が来なかった → 通常出力
        pendingCaption.forEach(cap => result.push(cap));
        pendingCaption = [];
      }
      result.push(line);
    }
  }

  // 最後の処理
  if (pendingCaption.length > 0) {
    pendingCaption.forEach(cap => result.push(cap));
  }
  if (inTable) {
    result.push('<!-- PRESERVE_END -->');
  }

  return result.join('\n');
}

/**
 * 保護ブロックの抽出
 */
export function extractPreservedBlocks(text: string): {
  preservedBlocks: string[];
  remainingText: string;
} {
  const blocks: string[] = [];
  const pattern = /<!-- PRESERVE_START -->([\s\S]*?)<!-- PRESERVE_END -->/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const block = match[1].trim();
    if (block) blocks.push(block);
  }

  const remaining = text
    .replace(pattern, '\n[TABLE_BLOCK]\n')
    .replace(/\n{3,}/g, '\n\n');

  return { preservedBlocks: blocks, remainingText: remaining };
}

/**
 * 安全性IDの抽出
 */
export function extractSafetyIds(text: string): string[] {
  const ids: string[] = [];
  const hazardMatches = text.match(/H-\d{3}/g) || [];
  const srMatches = text.match(/SR-\d{3}/g) || [];
  const riskMatches = text.match(/R-\d{3}/g) || [];
  const gsnMatches = text.match(/\b(G\d+(?:\.\d+)*|S\d+(?:\.\d+)*|Sn\d+|C\d+)\b/g) || [];

  ids.push(...hazardMatches, ...srMatches, ...riskMatches, ...gsnMatches);
  return [...new Set(ids)];
}
