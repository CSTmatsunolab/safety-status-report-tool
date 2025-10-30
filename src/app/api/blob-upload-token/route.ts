// src/app/api/blob-upload-token/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as HandleUploadBody;
    
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('BLOB_READ_WRITE_TOKEN is not set');
      return NextResponse.json(
        { error: 'Blob storage is not configured' },
        { status: 500 }
      );
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        console.log(`Generating token for: ${pathname}`);
        return {
          allowedContentTypes: ['application/pdf', 'image/*', 'text/*'],
          tokenPayload: JSON.stringify({ uploadedAt: Date.now() }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Upload completed:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
    
  } catch (error: any) {
    console.error('Token generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate token', details: error?.message },
      { status: 500 }
    );
  }
}