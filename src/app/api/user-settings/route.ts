// src/app/api/user-settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  DeleteCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// DynamoDB クライアント初期化
const dynamoClient = new DynamoDBClient({
  region: process.env.APP_AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY || '',
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = 'ssr-user-settings';

// 設定タイプの定義
export type SettingType = 'customStakeholders' | 'customReportStructures';

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

// GET: ユーザー設定を取得
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
    const settingType = searchParams.get('type') as SettingType;

    if (!settingType) {
      // 全ての設定を取得
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }));

      const settings: Record<string, unknown> = {};
      result.Items?.forEach(item => {
        settings[item.settingType] = item.data;
      });

      return NextResponse.json({ settings });
    }

    // 特定の設定タイプを取得
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        settingType,
      },
    }));

    if (!result.Item) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: result.Item.data });
  } catch (error) {
    console.error('GET user settings error:', error);
    return NextResponse.json(
      { error: 'Failed to get user settings' },
      { status: 500 }
    );
  }
}

// PUT: ユーザー設定を保存/更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, data } = body as { type: SettingType; data: unknown };

    if (!type || data === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: type and data' },
        { status: 400 }
      );
    }

    // 設定タイプの検証
    const validTypes: SettingType[] = ['customStakeholders', 'customReportStructures'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid setting type' },
        { status: 400 }
      );
    }

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        userId,
        settingType: type,
        data,
        updatedAt: new Date().toISOString(),
      },
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT user settings error:', error);
    return NextResponse.json(
      { error: 'Failed to save user settings' },
      { status: 500 }
    );
  }
}

// DELETE: ユーザー設定を削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const settingType = searchParams.get('type') as SettingType;

    if (!settingType) {
      return NextResponse.json(
        { error: 'Missing required parameter: type' },
        { status: 400 }
      );
    }

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        settingType,
      },
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE user settings error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user settings' },
      { status: 500 }
    );
  }
}
