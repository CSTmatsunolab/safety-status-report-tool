// src/lib/user-identity.ts
'use client';

import { getBrowserId } from './browser-id';

/**
 * ユーザー識別子の型
 * - guest: ブラウザIDを使用（未ログイン）
 * - authenticated: Cognito User IDを使用（ログイン済み）
 */
export type UserIdentityType = 'guest' | 'authenticated';

export interface UserIdentity {
  type: UserIdentityType;
  id: string;
  email?: string;
}

/**
 * ステークホルダーIDとユーザー識別子からPineconeのnamespaceを生成
 * 
 * フォーマット:
 * - ゲスト: {stakeholderId}_{browserId}
 * - 認証済み: {stakeholderId}_{cognitoUserId}
 * 
 * @param stakeholderId ステークホルダーのID
 * @param userIdentifier ユーザー識別子（ブラウザIDまたはCognito User ID）
 * @returns Pinecone namespace
 */
export function generateNamespaceWithIdentity(
  stakeholderId: string,
  userIdentifier: string
): string {
  // カスタムステークホルダーの場合
  if (stakeholderId.startsWith('custom-') || stakeholderId.startsWith('custom_')) {
    const customId = stakeholderId.replace(/^custom[-_]/, '');
    return `custom_${customId}_${userIdentifier}`;
  }
  
  // 定義済みステークホルダーの場合
  return `${stakeholderId}_${userIdentifier}`;
}

/**
 * 現在のユーザー識別子を取得するヘルパー関数
 * AuthProviderのコンテキスト外で使用する場合
 * （主にサーバーサイドやAPI呼び出し時）
 * 
 * @param cognitoUserId ログイン済みの場合のCognito User ID
 * @returns ユーザー識別子
 */
export function getUserIdentifier(cognitoUserId?: string | null): string {
  if (cognitoUserId) {
    return cognitoUserId;
  }
  return getBrowserId();
}

/**
 * namespace文字列からユーザー識別子を抽出
 * 
 * @param namespace Pinecone namespace
 * @returns 抽出されたユーザー識別子
 */
export function extractUserIdentifierFromNamespace(namespace: string): string {
  // カスタムステークホルダーの場合: custom_{customId}_{userIdentifier}
  if (namespace.startsWith('custom_')) {
    const parts = namespace.split('_');
    if (parts.length >= 3) {
      // 最後の部分がuserIdentifier
      return parts.slice(2).join('_');
    }
  }
  
  // 通常のステークホルダーの場合: {stakeholderId}_{userIdentifier}
  const parts = namespace.split('_');
  if (parts.length >= 2) {
    return parts.slice(1).join('_');
  }
  
  return namespace;
}