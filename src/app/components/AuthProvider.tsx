// src/components/AuthProvider.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  signIn, 
  signUp, 
  signOut, 
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
  fetchAuthSession
} from 'aws-amplify/auth';
import { configureAmplify } from '@/lib/amplify-config';

// ユーザー情報の型定義
export interface AuthUser {
  userId: string;      // Cognito User ID (sub)
  email: string;
}

// 認証状態の型定義
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

// コンテキストの型定義
interface AuthContextType {
  user: AuthUser | null;
  status: AuthStatus;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  resendConfirmationCode: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  getUserIdentifier: () => string;  // ブラウザIDまたはCognito User IDを返す
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Amplifyの初期化と現在のユーザーを確認
  useEffect(() => {
    configureAmplify();
    checkCurrentUser();
  }, []);

  // 現在のログイン状態を確認
  const checkCurrentUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      // IDトークンからemailを取得
      const idToken = session.tokens?.idToken;
      const email = idToken?.payload?.email as string || '';
      
      setUser({
        userId: currentUser.userId,
        email: email
      });
      setStatus('authenticated');
    } catch {
      // ログインしていない場合、初回アクセス時にモーダルを表示
      setUser(null);
      setStatus('unauthenticated');
      
      // 初回アクセス時のみモーダルを表示（localStorageでチェック）
      const hasVisited = localStorage.getItem('ssr-has-visited');
      if (!hasVisited) {
        setShowAuthModal(true);
        localStorage.setItem('ssr-has-visited', 'true');
      }
    }
  };

  // サインイン
  const handleSignIn = async (email: string, password: string) => {
    try {
      const result = await signIn({ username: email, password });
      
      if (result.isSignedIn) {
        await checkCurrentUser();
        return { success: true };
      } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        return { success: false, needsConfirmation: true, error: 'メール確認が必要です' };
      } else {
        return { success: false, error: '予期しないエラーが発生しました' };
      }
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      return { success: false, error: errorMessage };
    }
  };

  // サインアップ
  const handleSignUp = async (email: string, password: string) => {
    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email
          }
        }
      });
      return { success: true };
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      return { success: false, error: errorMessage };
    }
  };

  // サインアウト
  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setStatus('unauthenticated');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // サインアップ確認（確認コード入力）
  const handleConfirmSignUp = async (email: string, code: string) => {
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      return { success: true };
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      return { success: false, error: errorMessage };
    }
  };

  // 確認コード再送信
  const handleResendConfirmationCode = async (email: string) => {
    try {
      await resendSignUpCode({ username: email });
      return { success: true };
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      return { success: false, error: errorMessage };
    }
  };

  // パスワードリセット要求
  const handleResetPassword = async (email: string) => {
    try {
      await resetPassword({ username: email });
      return { success: true };
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      return { success: false, error: errorMessage };
    }
  };

  // パスワードリセット確認
  const handleConfirmResetPassword = async (email: string, code: string, newPassword: string) => {
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
      return { success: true };
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      return { success: false, error: errorMessage };
    }
  };

  // ユーザー識別子を取得（ログイン済み→Cognito ID、未ログイン→ブラウザID）
  const getUserIdentifier = (): string => {
    if (user) {
      return user.userId;
    }
    // 未ログイン時はブラウザIDを使用
    return getBrowserIdFromStorage();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        showAuthModal,
        setShowAuthModal,
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
        confirmSignUp: handleConfirmSignUp,
        resendConfirmationCode: handleResendConfirmationCode,
        resetPassword: handleResetPassword,
        confirmResetPassword: handleConfirmResetPassword,
        getUserIdentifier
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// フック
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ブラウザIDを取得（既存のbrowser-id.tsと連携）
function getBrowserIdFromStorage(): string {
  if (typeof window === 'undefined') {
    return 'server-side';
  }
  
  const BROWSER_ID_KEY = 'ssr-browser-id';
  let browserId = localStorage.getItem(BROWSER_ID_KEY);
  
  if (!browserId) {
    // crypto.randomUUID()を使用してUUIDを生成
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      browserId = crypto.randomUUID();
    } else {
      // フォールバック
      const timestamp = Date.now().toString(36);
      const randomPart = Math.random().toString(36).substr(2, 9);
      browserId = `${timestamp}-${randomPart}`;
    }
    localStorage.setItem(BROWSER_ID_KEY, browserId);
  }
  
  return browserId;
}

// エラーメッセージを日本語化
function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorName = error.name;
    const errorMessage = error.message;
    
    // よくあるエラーの日本語化
    if (errorName === 'UserNotFoundException' || errorMessage.includes('User does not exist')) {
      return 'このメールアドレスは登録されていません';
    }
    if (errorName === 'NotAuthorizedException' || errorMessage.includes('Incorrect username or password')) {
      return 'メールアドレスまたはパスワードが正しくありません';
    }
    if (errorName === 'UsernameExistsException' || errorMessage.includes('User already exists')) {
      return 'このメールアドレスは既に登録されています';
    }
    if (errorName === 'InvalidPasswordException' || errorMessage.includes('Password did not conform')) {
      return 'パスワードは8文字以上で入力してください';
    }
    if (errorName === 'CodeMismatchException' || errorMessage.includes('Invalid verification code')) {
      return '確認コードが正しくありません';
    }
    if (errorName === 'ExpiredCodeException' || errorMessage.includes('code has expired')) {
      return '確認コードの有効期限が切れています。再送信してください';
    }
    if (errorName === 'LimitExceededException' || errorMessage.includes('Attempt limit exceeded')) {
      return '試行回数の上限に達しました。しばらく待ってから再度お試しください';
    }
    if (errorName === 'UserNotConfirmedException') {
      return 'メールアドレスの確認が完了していません';
    }
    
    return errorMessage;
  }
  
  return '予期しないエラーが発生しました';
}