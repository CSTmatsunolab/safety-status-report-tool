// src/app/components/FileUpload/FileValidation.ts

/**
 * マジックバイトの定義
 */
export const MAGIC_SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46],        // %PDF
  zip: [0x50, 0x4B],                     // PK (xlsx, docx, pptx)
  xls: [0xD0, 0xCF, 0x11, 0xE0],        // OLE2 (xls, doc)
  png: [0x89, 0x50, 0x4E, 0x47],        // PNG
  jpg: [0xFF, 0xD8, 0xFF],              // JPEG
  gif: [0x47, 0x49, 0x46],              // GIF
  webp: [0x52, 0x49, 0x46, 0x46],       // RIFF (WebP)
} as const;

/**
 * マジックバイトを照合するヘルパー関数
 */
function matchSignature(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((byte, i) => bytes[i] === byte);
}

/**
 * バリデーションエラーメッセージを生成
 */
function getValidationError(fileType: string, language: string): string {
  const messages: Record<string, { en: string; ja: string }> = {
    pdf: {
      en: 'PDF file is corrupted or invalid. Please check the file.',
      ja: 'PDFファイルが破損しているか、無効な形式です。ファイルを確認してください。'
    },
    xlsx: {
      en: 'Excel file (.xlsx) is corrupted or invalid. Please check the file.',
      ja: 'Excelファイル（.xlsx）が破損しているか、無効な形式です。ファイルを確認してください。'
    },
    xls: {
      en: 'Excel file (.xls) is corrupted or invalid. Please check the file.',
      ja: 'Excelファイル（.xls）が破損しているか、無効な形式です。ファイルを確認してください。'
    },
    docx: {
      en: 'Word file (.docx) is corrupted or invalid. Please check the file.',
      ja: 'Wordファイル（.docx）が破損しているか、無効な形式です。ファイルを確認してください。'
    },
    doc: {
      en: 'Word file (.doc) is corrupted or invalid. Please check the file.',
      ja: 'Wordファイル（.doc）が破損しているか、無効な形式です。ファイルを確認してください。'
    },
    png: {
      en: 'PNG file is corrupted or invalid. Please check the file.',
      ja: 'PNGファイルが破損しているか、無効な形式です。ファイルを確認してください。'
    },
    jpeg: {
      en: 'JPEG file is corrupted or invalid. Please check the file.',
      ja: 'JPEGファイルが破損しているか、無効な形式です。ファイルを確認してください。'
    },
    gif: {
      en: 'GIF file is corrupted or invalid. Please check the file.',
      ja: 'GIFファイルが破損しているか、無効な形式です。ファイルを確認してください。'
    },
    webp: {
      en: 'WebP file is corrupted or invalid. Please check the file.',
      ja: 'WebPファイルが破損しているか、無効な形式です。ファイルを確認してください。'
    }
  };

  const msg = messages[fileType];
  return msg ? (language === 'en' ? msg.en : msg.ja) : '';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * ファイル破損チェック（マジックバイトで検証）
 */
export async function validateFile(file: File, language: string): Promise<ValidationResult> {
  // 0バイトファイルのチェック
  if (file.size === 0) {
    return { 
      valid: false, 
      error: language === 'en' 
        ? 'File is empty (0 bytes).'
        : 'ファイルが空です（0バイト）。'
    };
  }

  const buffer = await file.slice(0, 8).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  // PDF
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.pdf)) {
      return { valid: false, error: getValidationError('pdf', language) };
    }
  }
  // Excel xlsx
  else if (fileName.endsWith('.xlsx') || fileType.includes('spreadsheetml')) {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.zip)) {
      return { valid: false, error: getValidationError('xlsx', language) };
    }
  }
  // Excel xls (OLE2形式)
  else if (fileName.endsWith('.xls') || fileType === 'application/vnd.ms-excel') {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.xls) && !matchSignature(bytes, MAGIC_SIGNATURES.zip)) {
      return { valid: false, error: getValidationError('xls', language) };
    }
  }
  // Word docx
  else if (fileName.endsWith('.docx') || fileType.includes('wordprocessingml')) {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.zip)) {
      return { valid: false, error: getValidationError('docx', language) };
    }
  }
  // Word doc (OLE2形式)
  else if (fileName.endsWith('.doc')) {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.xls)) {  // doc も OLE2形式
      return { valid: false, error: getValidationError('doc', language) };
    }
  }
  // PNG
  else if (fileName.endsWith('.png') || fileType === 'image/png') {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.png)) {
      return { valid: false, error: getValidationError('png', language) };
    }
  }
  // JPEG
  else if (fileName.match(/\.(jpg|jpeg)$/) || fileType === 'image/jpeg') {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.jpg)) {
      return { valid: false, error: getValidationError('jpeg', language) };
    }
  }
  // GIF
  else if (fileName.endsWith('.gif') || fileType === 'image/gif') {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.gif)) {
      return { valid: false, error: getValidationError('gif', language) };
    }
  }
  // WebP
  else if (fileName.endsWith('.webp') || fileType === 'image/webp') {
    if (!matchSignature(bytes, MAGIC_SIGNATURES.webp)) {
      return { valid: false, error: getValidationError('webp', language) };
    }
  }

  return { valid: true };
}

/**
 * PDFファイルかどうかを判定
 */
export function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

/**
 * 直接読み取り可能なファイルかどうかを判定
 */
export function isDirectlyReadable(file: File): boolean {
  const readableTypes = [
    'text/plain',
    'text/csv',
    'text/tab-separated-values',
    'text/markdown',
    'text/xml',
    'text/html',
    'application/json',
    'application/xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  
  const readableExtensions = ['.txt', '.csv', '.tsv', '.json', '.md', '.xml', '.html', '.htm', '.xlsx', '.xls', '.docx'];
  
  return readableTypes.includes(file.type) || 
         readableExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
}
