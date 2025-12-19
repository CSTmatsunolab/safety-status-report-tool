// src/app/api/reports/[reportId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import { 
  S3Client, 
  GetObjectCommand, 
  DeleteObjectsCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// DynamoDB クライアント
const dynamoClient = new DynamoDBClient({
  region: process.env.APP_AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY || '',
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

// S3 クライアント
const s3Client = new S3Client({
  region: process.env.APP_AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY || '',
  },
});

const TABLE_NAME = 'ssr-reports';
const S3_BUCKET = process.env.APP_AWS_S3_BUCKET_NAME || 'safety-status-report-tool';

// Cognito JWT 検証用
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'ap-northeast-1_3jFiTDLjJ',
  tokenUse: 'id',
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '2oalmj35uv85tn4t5284boou64',
});

// JWT からユーザーIDを取得
async function getUserIdFromToken(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const payload = await verifier.verify(token);
    return payload.sub;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// GET: レポート詳細を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { reportId } = await params;

    // DynamoDBからメタデータを取得
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        reportId,
      },
    }));

    if (!result.Item) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // S3からレポート本文を取得
    let content = '';
    try {
      const s3Result = await s3Client.send(new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: result.Item.s3Key,
      }));
      content = await s3Result.Body?.transformToString('utf-8') || '';
    } catch (s3Error) {
      console.error('S3 get error:', s3Error);
    }

    return NextResponse.json({
      ...result.Item,
      content,
    });
  } catch (error) {
    console.error('GET report detail error:', error);
    return NextResponse.json(
      { error: 'Failed to get report' },
      { status: 500 }
    );
  }
}

// DELETE: レポートを削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { reportId } = await params;

    // まずメタデータを取得
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        reportId,
      },
    }));

    if (!result.Item) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // S3から関連ファイルを削除
    const s3Prefix = `reports/${userId}/${reportId}/`;
    
    try {
      // 該当フォルダ内のオブジェクトを一覧取得
      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: s3Prefix,
      }));

      if (listResult.Contents && listResult.Contents.length > 0) {
        // オブジェクトを一括削除
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: S3_BUCKET,
          Delete: {
            Objects: listResult.Contents.map(obj => ({ Key: obj.Key })),
          },
        }));
      }
    } catch (s3Error) {
      console.error('S3 delete error:', s3Error);
      // S3の削除に失敗してもDynamoDBの削除は続行
    }

    // DynamoDBからメタデータを削除
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        reportId,
      },
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE report error:', error);
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    );
  }
}
