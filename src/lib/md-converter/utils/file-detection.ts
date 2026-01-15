// lib/md-converter/utils/file-detection.ts
// ファイル形式判定ユーティリティ

/**
 * DOCXファイルかどうかを判定
 */
export function isDocxFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  );
}

/**
 * Excelファイルかどうかを判定
 */
export function isExcelFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel' ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  );
}

/**
 * CSVファイルかどうかを判定
 */
export function isCsvFile(fileType: string, fileName: string): boolean {
  return fileType === 'text/csv' || fileName.endsWith('.csv');
}

/**
 * JSONファイルかどうかを判定
 */
export function isJsonFile(fileType: string, fileName: string): boolean {
  return fileType === 'application/json' || fileName.endsWith('.json');
}

/**
 * HTMLファイルかどうかを判定
 */
export function isHtmlFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'text/html' ||
    fileName.endsWith('.html') ||
    fileName.endsWith('.htm')
  );
}

/**
 * テキストファイルかどうかを判定
 */
export function isTextFile(fileType: string, fileName: string): boolean {
  return fileType === 'text/plain' || fileName.endsWith('.txt');
}

/**
 * XMLファイルかどうかを判定
 */
export function isXmlFile(fileType: string, fileName: string): boolean {
  return (
    fileType === 'application/xml' ||
    fileType === 'text/xml' ||
    fileName.endsWith('.xml')
  );
}

/**
 * PDFファイルかどうかを判定
 */
export function isPdfFile(fileType: string, fileName: string): boolean {
  return fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

/**
 * Markdownファイルかどうかを判定
 */
export function isMarkdownFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.md');
}
