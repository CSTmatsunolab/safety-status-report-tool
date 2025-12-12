// src/components/AuthModal.tsx
'use client';

import React, { useState } from 'react';
import { FiX, FiEye, FiEyeOff, FiLoader, FiGlobe } from 'react-icons/fi';
import { useAuth } from './AuthProvider';
import { useI18n, Language } from './I18nProvider';

type AuthMode = 'signIn' | 'signUp' | 'confirmSignUp' | 'forgotPassword' | 'confirmResetPassword';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
}

// 英数記号のみ許可する正規表現（ASCII印字可能文字）
const ASCII_ONLY_REGEX = /^[\x20-\x7E]*$/;

// 英数記号以外を除去するフィルター
const filterToAscii = (value: string): string => {
  return value.split('').filter(char => ASCII_ONLY_REGEX.test(char)).join('');
};

// パスワードバリデーション: 英字（小文字）と数字を含む8文字以上
const validatePassword = (password: string, language: 'en' | 'ja'): string | null => {
  if (password.length < 8) {
    return language === 'en' 
      ? 'Password must be at least 8 characters' 
      : 'パスワードは8文字以上で入力してください';
  }
  if (!/[a-z]/.test(password)) {
    return language === 'en' 
      ? 'Password must contain at least one lowercase letter' 
      : 'パスワードには小文字の英字を含めてください';
  }
  if (!/[0-9]/.test(password)) {
    return language === 'en' 
      ? 'Password must contain at least one number' 
      : 'パスワードには数字を含めてください';
  }
  return null;
};

export function AuthModal({ isOpen, onClose, initialMode = 'signIn' }: AuthModalProps) {
  const { language, setLanguage } = useI18n();
  const { signIn, signUp, confirmSignUp, resendConfirmationCode, resetPassword, confirmResetPassword } = useAuth();
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showLangMenu, setShowLangMenu] = useState(false);

  // 全テキストを言語設定に連動
  const t = {
    // タイトル
    signIn: language === 'en' ? 'Sign In' : 'ログイン',
    signUp: language === 'en' ? 'Sign Up' : '新規登録',
    confirmEmail: language === 'en' ? 'Confirm Email' : 'メール確認',
    resetPassword: language === 'en' ? 'Reset Password' : 'パスワードリセット',
    
    // ラベル
    email: language === 'en' ? 'Email' : 'メールアドレス',
    password: language === 'en' ? 'Password' : 'パスワード',
    confirmPassword: language === 'en' ? 'Confirm Password' : 'パスワード（確認）',
    newPassword: language === 'en' ? 'New Password' : '新しいパスワード',
    confirmationCode: language === 'en' ? 'Confirmation Code' : '確認コード',
    
    // ボタン
    signInButton: language === 'en' ? 'Sign In' : 'ログイン',
    signUpButton: language === 'en' ? 'Sign Up' : '登録する',
    verifyCode: language === 'en' ? 'Verify Code' : 'コードを確認',
    sendResetCode: language === 'en' ? 'Send Reset Code' : 'リセットコードを送信',
    resetPasswordButton: language === 'en' ? 'Reset Password' : 'パスワードをリセット',
    resendCode: language === 'en' ? 'Resend code' : 'コードを再送信',
    continueAsGuest: language === 'en' ? 'Continue as Guest' : 'ゲストとして続ける',
    
    // リンクテキスト
    forgotPassword: language === 'en' ? 'Forgot password?' : 'パスワードを忘れた方',
    noAccount: language === 'en' ? "Don't have an account?" : 'アカウントをお持ちでない方',
    haveAccount: language === 'en' ? 'Already have an account?' : '既にアカウントをお持ちの方',
    backToSignIn: language === 'en' ? 'Back to Sign In' : 'ログインに戻る',
    
    // ヒント・説明
    passwordHint: language === 'en' 
      ? '8+ characters with lowercase letters and numbers' 
      : '小文字の英字と数字を含む8文字以上',
    emailPlaceholder: language === 'en' ? 'your@email.com' : 'example@email.com',
    inputHint: language === 'en'
      ? 'Only letters, numbers, and symbols'
      : '半角英数記号のみ',
    
    // メッセージ
    passwordMismatch: language === 'en' ? 'Passwords do not match' : 'パスワードが一致しません',
    codeSent: language === 'en' ? 'Confirmation code has been sent to your email' : '確認コードをメールに送信しました',
    signUpSuccess: language === 'en' ? 'Please check your email for the confirmation code' : '確認コードをメールに送信しました。メールをご確認ください',
    resetCodeSent: language === 'en' ? 'Password reset code has been sent to your email' : 'パスワードリセットコードをメールに送信しました',
    passwordResetSuccess: language === 'en' ? 'Password has been reset. Please sign in' : 'パスワードがリセットされました。ログインしてください',
    emailConfirmed: language === 'en' ? 'Email confirmed. Please sign in.' : 'メール確認が完了しました。ログインしてください。',
  };

  if (!isOpen) return null;

  // メールアドレス入力ハンドラー（英数記号のみ許可）
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterToAscii(e.target.value);
    setEmail(filtered);
    setError('');
  };

  // パスワード入力ハンドラー（英数記号のみ許可）
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterToAscii(e.target.value);
    setPassword(filtered);
    setError('');
  };

  // 確認用パスワード入力ハンドラー（英数記号のみ許可）
  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterToAscii(e.target.value);
    setConfirmPassword(filtered);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // パスワードのバリデーション（サインアップ・パスワードリセット時）
    if (mode === 'signUp' || mode === 'confirmResetPassword') {
      const passwordError = validatePassword(password, language);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setIsLoading(true);

    try {
      switch (mode) {
        case 'signIn': {
          const result = await signIn(email, password);
          if (result.success) {
            onClose();
          } else if (result.needsConfirmation) {
            setMode('confirmSignUp');
            setMessage(t.codeSent);
          } else {
            setError(result.error || '');
          }
          break;
        }
        case 'signUp': {
          if (password !== confirmPassword) {
            setError(t.passwordMismatch);
            break;
          }
          const result = await signUp(email, password);
          if (result.success) {
            setMode('confirmSignUp');
            setMessage(t.signUpSuccess);
          } else {
            setError(result.error || '');
          }
          break;
        }
        case 'confirmSignUp': {
          const result = await confirmSignUp(email, confirmationCode);
          if (result.success) {
            const signInResult = await signIn(email, password);
            if (signInResult.success) {
              onClose();
            } else {
              setMode('signIn');
              setMessage(t.emailConfirmed);
            }
          } else {
            setError(result.error || '');
          }
          break;
        }
        case 'forgotPassword': {
          const result = await resetPassword(email);
          if (result.success) {
            setMode('confirmResetPassword');
            setMessage(t.resetCodeSent);
          } else {
            setError(result.error || '');
          }
          break;
        }
        case 'confirmResetPassword': {
          const result = await confirmResetPassword(email, confirmationCode, password);
          if (result.success) {
            setMode('signIn');
            setMessage(t.passwordResetSuccess);
            setPassword('');
            setConfirmationCode('');
          } else {
            setError(result.error || '');
          }
          break;
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setIsLoading(true);
    const result = await resendConfirmationCode(email);
    setIsLoading(false);
    if (result.success) {
      setMessage(t.codeSent);
    } else {
      setError(result.error || '');
    }
  };

  const toggleLanguage = (lang: Language) => {
    setLanguage(lang);
    setShowLangMenu(false);
  };

  // 共通のinputスタイル
  const inputClassName = "w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors";

  const renderForm = () => {
    switch (mode) {
      case 'signIn':
        return (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className={inputClassName}
                placeholder={t.emailPlaceholder}
                autoComplete="email"
                required
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {t.inputHint}
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.password}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  className={`${inputClassName} pr-12`}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {isLoading ? <FiLoader className="animate-spin mr-2" /> : null}
              {t.signInButton}
            </button>
            <div className="mt-4 text-center text-sm">
              <button
                type="button"
                onClick={() => { setMode('forgotPassword'); setError(''); setMessage(''); }}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t.forgotPassword}
              </button>
            </div>
            <div className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              {t.noAccount}{' '}
              <button
                type="button"
                onClick={() => { setMode('signUp'); setError(''); setMessage(''); }}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                {t.signUp}
              </button>
            </div>
          </>
        );

      case 'signUp':
        return (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className={inputClassName}
                placeholder={t.emailPlaceholder}
                autoComplete="email"
                required
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {t.inputHint}
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.password}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  className={`${inputClassName} pr-12`}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t.passwordHint}
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.confirmPassword}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  className={`${inputClassName} pr-12`}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {isLoading ? <FiLoader className="animate-spin mr-2" /> : null}
              {t.signUpButton}
            </button>
            <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
              {t.haveAccount}{' '}
              <button
                type="button"
                onClick={() => { setMode('signIn'); setError(''); setMessage(''); }}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                {t.signIn}
              </button>
            </div>
          </>
        );

      case 'confirmSignUp':
        return (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {email}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.confirmationCode}
              </label>
              <input
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value.replace(/[^0-9]/g, ''))}
                className={`${inputClassName} text-center text-2xl tracking-widest`}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || confirmationCode.length < 6}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {isLoading ? <FiLoader className="animate-spin mr-2" /> : null}
              {t.verifyCode}
            </button>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t.resendCode}
              </button>
            </div>
          </>
        );

      case 'forgotPassword':
        return (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className={inputClassName}
                placeholder={t.emailPlaceholder}
                autoComplete="email"
                required
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {t.inputHint}
              </p>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {isLoading ? <FiLoader className="animate-spin mr-2" /> : null}
              {t.sendResetCode}
            </button>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode('signIn'); setError(''); setMessage(''); }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t.backToSignIn}
              </button>
            </div>
          </>
        );

      case 'confirmResetPassword':
        return (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {email}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.confirmationCode}
              </label>
              <input
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value.replace(/[^0-9]/g, ''))}
                className={`${inputClassName} text-center text-2xl tracking-widest`}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t.newPassword}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  className={`${inputClassName} pr-12`}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t.passwordHint}
              </p>
            </div>
            <button
              type="submit"
              disabled={isLoading || confirmationCode.length < 6}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {isLoading ? <FiLoader className="animate-spin mr-2" /> : null}
              {t.resetPasswordButton}
            </button>
          </>
        );
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'signIn': return t.signIn;
      case 'signUp': return t.signUp;
      case 'confirmSignUp': return t.confirmEmail;
      case 'forgotPassword': return t.resetPassword;
      case 'confirmResetPassword': return t.resetPassword;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {getTitle()}
          </h2>
          <div className="flex items-center gap-2">
            {/* 言語切り替えボタン */}
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <FiGlobe size={16} />
                <span>{language === 'ja' ? '日本語' : 'EN'}</span>
              </button>
              {showLangMenu && (
                <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => toggleLanguage('en')}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg transition-colors ${language === 'en' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => toggleLanguage('ja')}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg transition-colors ${language === 'ja' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    日本語
                  </button>
                </div>
              )}
            </div>
            {/* 閉じるボタン */}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* エラーメッセージ */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* 成功メッセージ */}
          {message && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
              {message}
            </div>
          )}

          {renderForm()}

          {/* ゲストとして続けるボタン（サインイン画面のみ） */}
          {mode === 'signIn' && (
            <div className="mt-4 pt-4 border-t dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                {t.continueAsGuest}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}