// src/lib/google-cloud-auth.ts
import { ImageAnnotatorClient } from '@google-cloud/vision';

let cachedClient: ImageAnnotatorClient | null = null;

export function getVisionClient(): ImageAnnotatorClient {
  if (cachedClient) {
    return cachedClient;
  }

  if (process.env.GOOGLE_CLOUD_VISION_KEY) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_VISION_KEY);
      cachedClient = new ImageAnnotatorClient({ credentials });
    } catch (error) {
      console.error('Google Cloud認証情報の解析に失敗:', error);
      // フォールバック: デフォルトの認証方法を試す
      cachedClient = new ImageAnnotatorClient();
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // 通常のファイルベースの認証
      cachedClient = new ImageAnnotatorClient();
  } else {
    console.warn('Google Cloud Vision APIの認証情報が設定されていません');
    // 認証なしで初期化（エラーになる可能性あり）
    cachedClient = new ImageAnnotatorClient();
  }

  return cachedClient;
}