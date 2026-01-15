// lib/md-converter/utils/text-utils.ts
// テキスト処理ユーティリティ

/**
 * Buffer を文字列に変換
 */
export function bufferToString(content: string | Buffer): string {
  return typeof content === 'string' ? content : content.toString('utf-8');
}

/**
 * テキストの正規化（改行・空白の整理）
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * HTMLエンティティのデコード
 */
export function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&yen;': '¥', '&copy;': '©', '&reg;': '®',
    '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
    '&laquo;': '«', '&raquo;': '»',
    '&bull;': '•', '&middot;': '·'
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'gi'), char);
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
}
