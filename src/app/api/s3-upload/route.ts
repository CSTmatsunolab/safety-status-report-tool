// src/app/api/s3-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateUploadPresignedUrl, validateFileSize, validateFileType } from '@/lib/s3-utils';

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileType, fileSize } = await request.json();

    // 入力検証
    if (!fileName || !fileType || !fileSize) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // ファイルサイズの検証（最大100MB）
    if (!validateFileSize(fileSize, 100)) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit of 100MB' },
        { status: 413 }
      );
    }

    // ファイルタイプの検証
    if (!validateFileType(fileType)) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 415 }
      );
    }

    // Presigned URLを生成
    const { uploadUrl, key } = await generateUploadPresignedUrl(
      fileName,
      fileType,
      fileSize
    );

    return NextResponse.json({
      success: true,
      uploadUrl,
      key,
      expiresIn: 3600, // 1時間
    });

  } catch (error) {
    console.error('S3 upload URL generation error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate upload URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}