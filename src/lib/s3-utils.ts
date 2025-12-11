// src/lib/s3-utils.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.APP_AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.APP_AWS_S3_BUCKET_NAME!;
const UPLOAD_EXPIRY_SECONDS = 3600; // 1時間
const DOWNLOAD_EXPIRY_SECONDS = 7200; // 2時間

/**
 * アップロード用のPresigned URLを生成
 */
export async function generateUploadPresignedUrl(
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<{ uploadUrl: string; key: string }> {
  // ユニークなキーを生成（タイムスタンプ + ランダム文字列）
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `uploads/${timestamp}-${randomStr}/${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    ContentLength: fileSize,
    // メタデータを追加
    Metadata: {
      originalName: fileName,
      uploadTimestamp: timestamp.toString(),
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_EXPIRY_SECONDS,
  });

  return { uploadUrl, key };
}

/**
 * ダウンロード用のPresigned URLを生成
 */
export async function generateDownloadPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: DOWNLOAD_EXPIRY_SECONDS,
  });

  return downloadUrl;
}

/**
 * S3からファイルを取得
 */
export async function getFileFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error('File not found in S3');
  }

  // StreamをBufferに変換
  const chunks: Uint8Array[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

/**
 * S3からファイルを削除
 */
export async function deleteFileFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * 古いファイルをクリーンアップ（定期実行用）
 */
export async function cleanupOldFiles(olderThanHours: number = 24): Promise<number> {
  const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
  let deletedCount = 0;

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'uploads/',
    });

    const response = await s3Client.send(listCommand);

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key && object.LastModified) {
          const lastModified = new Date(object.LastModified).getTime();
          
          if (lastModified < cutoffTime) {
            await deleteFileFromS3(object.Key);
            deletedCount++;
            console.log(`Deleted old file: ${object.Key}`);
          }
        }
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old files:', error);
    return deletedCount;
  }
}

/**
 * ファイルサイズの検証
 */
export function validateFileSize(size: number, maxSizeMB: number = 100): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return size <= maxSizeBytes;
}

/**
 * ファイルタイプの検証
 */
export function validateFileType(type: string): boolean {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'text/csv',
  ];

  return allowedTypes.includes(type);
}