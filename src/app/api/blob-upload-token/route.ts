// src/app/api/blob-upload-token/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // ここで認証チェックなどを追加可能
        console.log(`Generating token for: ${pathname}`);
        
        return {
          allowedContentTypes: [
            'application/pdf',
            'image/*',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ],
          tokenPayload: JSON.stringify({
            uploadedAt: Date.now()
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed:', blob.url);
        console.log('File will be deleted after processing');
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Upload token generation failed:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}