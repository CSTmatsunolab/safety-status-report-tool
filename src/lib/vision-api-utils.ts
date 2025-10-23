// src/lib/vision-api-utils.ts
import { OCR_CONFIG } from '@/lib/config/constants';

/**
 * OCR信頼度をチェックして警告メッセージを生成
 */
export function getConfidenceWarning(confidence: number): string | null {
  if (confidence < OCR_CONFIG.lowConfidenceWarning) {
    return `OCR信頼度が低い（${confidence}%）ため、一部の文字が正しく認識されていない可能性があります。`;
  } else if (confidence < OCR_CONFIG.minConfidenceThreshold) {
    return `OCR信頼度は${confidence}%です。認識精度に注意してください。`;
  }
  return null;
}

/**
 * Vision APIのエラーをハンドリングして適切なレスポンスを生成
 */
export function handleVisionAPIError(
  error: unknown, 
  fileName: string, 
  fallbackText: string = ''
): {
  text: string;
  success: boolean;
  error: string;
  details?: string;
  requiresOcr?: boolean;
  message?: string;
} {
  console.error('Vision API error:', error);
  

  let errorMessage = 'Unknown error';
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    errorMessage = (error as { message: string }).message;
  } else if (error) {
    errorMessage = error.toString();
  }
  // エラーコードに基づいて適切なメッセージを生成  
  if (errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      text: fallbackText,
      success: false,
      error: 'OCR quota exceeded',
      requiresOcr: true,
      message: `Google Cloud Vision APIのクォータ制限に達しました。
埋め込みテキストのみ抽出しました。
完全なテキストが必要な場合は、以下の方法をお試しください：
1. 時間をおいて再度アップロード
2. Google DriveでPDFを開き、Googleドキュメントに変換
3. 画像として保存してアップロード`
    };
  }
  
  if (errorMessage.includes('auth') || errorMessage.includes('UNAUTHENTICATED')) {
    return {
      text: fallbackText,
      success: false,
      error: 'Authentication failed',
      details: 'Google Cloud Vision APIの認証に失敗しました'
    };
  }
  
  if (errorMessage.includes('INVALID_ARGUMENT')) {
    return {
      text: fallbackText,
      success: false,
      error: 'Invalid file format',
      details: 'ファイル形式が正しくありません'
    };
  }
  
  // その他のエラー
  return {
    text: fallbackText,
    success: false,
    error: 'Vision API error',
    details: errorMessage,
    requiresOcr: true,
    message: `OCR処理中にエラーが発生しました。
埋め込みテキストのみ抽出しました。`
  };
}