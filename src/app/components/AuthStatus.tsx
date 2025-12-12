// src/components/AuthStatus.tsx
'use client';

import React, { useState } from 'react';
import { FiUser, FiLogIn, FiLogOut, FiLoader } from 'react-icons/fi';
import { useAuth } from './AuthProvider';
import { useI18n } from './I18nProvider';
import { AuthModal } from './AuthModal';

export function AuthStatus() {
  const { user, status, signOut } = useAuth();
  const { language } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const t = {
    signIn: language === 'en' ? 'Sign In' : 'ログイン',
    signOut: language === 'en' ? 'Sign Out' : 'ログアウト',
    guest: language === 'en' ? 'Guest' : 'ゲスト',
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  };

  // ローディング中
  if (status === 'loading') {
    return (
      <div className="flex items-center text-gray-500 dark:text-gray-400">
        <FiLoader className="animate-spin mr-2" size={16} />
      </div>
    );
  }

  // ログイン済み
  if (status === 'authenticated' && user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
          <FiUser className="mr-1" size={16} />
          <span className="max-w-[150px] truncate">{user.email}</span>
        </div>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex items-center px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSigningOut ? (
            <FiLoader className="animate-spin mr-1" size={14} />
          ) : (
            <FiLogOut className="mr-1" size={14} />
          )}
          {t.signOut}
        </button>
      </div>
    );
  }

  // 未ログイン
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          <FiUser className="mr-1" size={16} />
          {t.guest}
        </span>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <FiLogIn className="mr-1" size={14} />
          {t.signIn}
        </button>
      </div>

      <AuthModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}