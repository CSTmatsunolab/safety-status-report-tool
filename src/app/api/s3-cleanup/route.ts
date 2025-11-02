// src/app/api/s3-cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldFiles } from '@/lib/s3-utils';

// Vercel Cronジョブまたは外部スケジューラーから呼び出すAPIエンドポイント
export async function POST(request: NextRequest) {
  try {
    // 認証トークンのチェック（セキュリティのため）
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CLEANUP_AUTH_TOKEN;
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 24時間以上古いファイルを削除
    const deletedCount = await cleanupOldFiles(24);

    return NextResponse.json({
      success: true,
      deletedFiles: deletedCount,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('S3 cleanup error:', error);
    
    return NextResponse.json(
      { 
        error: 'Cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
