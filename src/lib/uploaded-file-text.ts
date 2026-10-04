// src/lib/uploaded-file-text.ts
// アップロードファイルを（サーバー側で）プレーンテキストに変換するヘルパー
// 変換の流儀は src/app/api/build-knowledge-base/route.ts に合わせている

import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { UploadedFile } from '@/types';
import { getFileFromS3 } from '@/lib/s3-utils';

function isDocx(file: UploadedFile): boolean {
  const type = file.metadata?.originalType ?? '';
  return file.name.toLowerCase().endsWith('.docx') || type.includes('wordprocessingml');
}

function isExcel(file: UploadedFile): boolean {
  const type = file.metadata?.originalType ?? '';
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    type.includes('excel') ||
    type.includes('spreadsheet')
  );
}

async function bufferToText(buffer: Buffer, file: UploadedFile): Promise<string> {
  if (isDocx(file)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (isExcel(file)) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map(
      (sheetName) => `## ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`
    ).join('\n\n');
  }
  return new TextDecoder().decode(buffer);
}

/**
 * アップロードファイルの本文テキストを取得する
 * - テキスト（md/txt/csv、抽出済みPDF・OCR）は content をそのまま使う
 * - Base64（docx/xlsx）はデコードしてテキスト化
 * - content が空で S3 にある大きなファイルは S3 から取得してテキスト化
 * - いずれも取れない場合はプレビュー文字列
 */
export async function getUploadedFileText(file: UploadedFile): Promise<string> {
  const metadata = file.metadata;

  if (file.content) {
    if (metadata?.isBase64) {
      return bufferToText(Buffer.from(file.content, 'base64'), file);
    }
    return file.content;
  }

  if (metadata?.s3Key) {
    try {
      return await bufferToText(await getFileFromS3(metadata.s3Key), file);
    } catch (error) {
      console.error(`Failed to fetch ${file.name} from S3:`, error);
    }
  }

  return metadata?.contentPreview ?? '';
}
