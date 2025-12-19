// src/app/api/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

// GET: レポート一覧を取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const lastKey = searchParams.get('lastKey');

    const queryParams: {
      TableName: string;
      KeyConditionExpression: string;
      ExpressionAttributeValues: Record<string, string>;
      ScanIndexForward: boolean;
      Limit: number;
      ExclusiveStartKey?: Record<string, string>;
    } = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // 新しい順
      Limit: limit,
    };

    if (lastKey) {
      queryParams.ExclusiveStartKey = JSON.parse(lastKey);
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    return NextResponse.json({
      reports: result.Items || [],
      lastKey: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null,
    });
  } catch (error) {
    console.error('GET reports error:', error);
    return NextResponse.json(
      { error: 'Failed to get reports' },
      { status: 500 }
    );
  }
}

// POST: レポートを保存
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();  
    const { report, fileMetadata } = body;
    
    if (!report || !report.content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // レポートIDを生成（タイムスタンプベース）
    const reportId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    // S3にレポート本文を保存
    const s3Key = `reports/${userId}/${reportId}/report.md`;
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: report.content,
      ContentType: 'text/markdown; charset=utf-8',
    }));

    // ファイルメタデータを整形
    const files = (fileMetadata || []).map((file: {
      id: string;
      name: string;
      type: string;
      size?: number;
      originalType?: string;
      useFullText?: boolean;
      source?: 'uploaded' | 'knowledgebase';
      chunkCount?: number;
    }) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size || 0,
      originalType: file.originalType || 'unknown',
      useFullText: file.useFullText || false,
      source: file.source || 'uploaded',
      chunkCount: file.chunkCount || 0,
    }));
    
    console.log('files after map:', files);
    console.log('files.length:', files.length);

    // DynamoDBにメタデータを保存
    const reportMetadata = {
      userId,
      reportId,
      title: report.title,
      stakeholder: {
        id: report.stakeholder.id,
        role: report.stakeholder.role,
      },
      structure: report.structure || null,
      rhetoricStrategy: report.rhetoricStrategy,
      createdAt,
      s3Key,
      fileCount: files.length,
      files,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: reportMetadata,
    }));

    return NextResponse.json({
      success: true,
      reportId,
      createdAt,
    });
  } catch (error) {
    console.error('POST report error:', error);
    return NextResponse.json(
      { error: 'Failed to save report' },
      { status: 500 }
    );
  }
}