// src/components/SettingsMenu.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { 
  FiMenu, 
  FiX, 
  FiSettings, 
  FiGlobe, 
  FiSun, 
  FiMoon, 
  FiMonitor,
  FiChevronRight,
  FiUser,
  FiLogIn,
  FiLogOut,
  FiLoader
} from 'react-icons/fi';
import { useI18n, Language, languageNames } from './I18nProvider';
import { useAuth } from './AuthProvider';
import { AuthModal } from './AuthModal';

export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'language' | 'theme' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user, status, signOut, showAuthModal, setShowAuthModal } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveSubmenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setActiveSubmenu(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
    if (isOpen) {
      setActiveSubmenu(null);
    }
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setActiveSubmenu(null);
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    setActiveSubmenu(null);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
    setIsOpen(false);
  };

  const handleOpenAuthModal = () => {
    setIsOpen(false);
    setShowAuthModal(true);
  };

  const themes = [
    { value: 'light', icon: FiSun, labelKey: 'menu.themeLight' },
    { value: 'dark', icon: FiMoon, labelKey: 'menu.themeDark' },
    { value: 'system', icon: FiMonitor, labelKey: 'menu.themeSystem' },
  ];

  const languages: { value: Language; label: string }[] = [
    { value: 'ja', label: '日本語' },
    { value: 'en', label: 'English' },
  ];

  // 認証関連のテキスト
  const authText = {
    signIn: language === 'en' ? 'Sign In' : 'ログイン',
    signOut: language === 'en' ? 'Sign Out' : 'ログアウト',
    guest: language === 'en' ? 'Guest' : 'ゲスト',
    account: language === 'en' ? 'Account' : 'アカウント',
  };

  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
    );
  }

  return (
    <>
      <div className="fixed top-6 right-6 z-50 flex items-center gap-3" ref={menuRef}>
        {/* 認証ステータス表示 */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          {status === 'loading' ? (
            <FiLoader className="animate-spin text-gray-400" size={16} />
          ) : status === 'authenticated' && user ? (
            <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
              <FiUser className="mr-1.5 text-green-500" size={16} />
              <span className="max-w-[120px] truncate">{user.email}</span>
            </div>
          ) : (
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
              <FiUser className="mr-1.5" size={16} />
              <span>{authText.guest}</span>
            </div>
          )}
        </div>

        {/* Hamburger Button */}
        <button
          onClick={toggleMenu}
          className="
            p-4 rounded-xl
            bg-gray-100 hover:bg-gray-200
            dark:bg-gray-800 dark:hover:bg-gray-700
            text-gray-700 dark:text-gray-300
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-blue-500
            shadow-lg
          "
          aria-label="Settings menu"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <FiX className="w-10 h-10" />
          ) : (
            <FiMenu className="w-10 h-10" />
          )}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="
            absolute right-0 top-full mt-2 w-90
            bg-white dark:bg-gray-800
            rounded-xl shadow-lg dark:shadow-xl
            border border-gray-200 dark:border-gray-700
            py-3 z-50
            animate-in fade-in slide-in-from-top-2 duration-200
          ">
            {activeSubmenu === null ? (
              // Main Menu
              <>
                {/* 認証セクション */}
                <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
                  {status === 'authenticated' && user ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <FiUser className="text-green-500" size={18} />
                        <span className="font-medium truncate max-w-[200px]">{user.email}</span>
                      </div>
                      <button
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="
                          flex items-center gap-2 w-full px-3 py-2
                          text-sm text-red-600 dark:text-red-400
                          hover:bg-red-50 dark:hover:bg-red-900/20
                          rounded-lg transition-colors
                          disabled:opacity-50
                        "
                      >
                        {isSigningOut ? (
                          <FiLoader className="animate-spin" size={16} />
                        ) : (
                          <FiLogOut size={16} />
                        )}
                        <span>{authText.signOut}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <FiUser size={18} />
                        <span>{authText.guest}</span>
                      </div>
                      <button
                        onClick={handleOpenAuthModal}
                        className="
                          flex items-center gap-2 w-full px-3 py-2
                          text-sm text-blue-600 dark:text-blue-400
                          bg-blue-50 dark:bg-blue-900/20
                          hover:bg-blue-100 dark:hover:bg-blue-900/30
                          rounded-lg transition-colors font-medium
                        "
                      >
                        <FiLogIn size={16} />
                        <span>{authText.signIn}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Stakeholder Settings */}
                <Link
                  href="/stakeholder-settings"
                  className="
                    flex items-center gap-4 px-5 py-4
                    text-gray-700 dark:text-gray-200
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    transition-colors
                    text-base
                  "
                  onClick={() => setIsOpen(false)}
                >
                  <FiSettings className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                  <span>{t('menu.stakeholderSettings')}</span>
                </Link>

                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

                {/* Language Submenu Trigger */}
                <button
                  onClick={() => setActiveSubmenu('language')}
                  className="
                    flex items-center justify-between w-full px-5 py-4
                    text-gray-700 dark:text-gray-200
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    transition-colors
                    text-base
                  "
                >
                  <div className="flex items-center gap-4">
                    <FiGlobe className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    <span>{t('menu.language')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <span className="text-sm">{languageNames[language]}</span>
                    <FiChevronRight className="w-4 h-4" />
                  </div>
                </button>

                {/* Theme Submenu Trigger */}
                <button
                  onClick={() => setActiveSubmenu('theme')}
                  className="
                    flex items-center justify-between w-full px-5 py-4
                    text-gray-700 dark:text-gray-200
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    transition-colors
                    text-base
                  "
                >
                  <div className="flex items-center gap-4">
                    {theme === 'dark' ? (
                      <FiMoon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    ) : theme === 'light' ? (
                      <FiSun className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <FiMonitor className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    )}
                    <span>{t('menu.theme')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <span className="text-sm">
                      {theme === 'dark' ? t('menu.themeDark') : 
                       theme === 'light' ? t('menu.themeLight') : 
                       t('menu.themeSystem')}
                    </span>
                    <FiChevronRight className="w-4 h-4" />
                  </div>
                </button>
              </>
            ) : activeSubmenu === 'language' ? (
              // Language Submenu
              <>
                <button
                  onClick={() => setActiveSubmenu(null)}
                  className="
                    flex items-center gap-3 px-5 py-3 w-full
                    text-gray-500 dark:text-gray-400
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    text-base
                  "
                >
                  <FiChevronRight className="w-5 h-5 rotate-180" />
                  <span>{t('menu.language')}</span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                {languages.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleLanguageChange(value)}
                    className={`
                      flex items-center justify-between w-full px-5 py-4
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-base
                      ${language === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    <span>{label}</span>
                    {language === value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </>
            ) : (
              // Theme Submenu
              <>
                <button
                  onClick={() => setActiveSubmenu(null)}
                  className="
                    flex items-center gap-3 px-5 py-3 w-full
                    text-gray-500 dark:text-gray-400
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    text-base
                  "
                >
                  <FiChevronRight className="w-5 h-5 rotate-180" />
                  <span>{t('menu.theme')}</span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                {themes.map(({ value, icon: Icon, labelKey }) => (
                  <button
                    key={value}
                    onClick={() => handleThemeChange(value)}
                    className={`
                      flex items-center justify-between w-full px-5 py-4
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-base
                      ${theme === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <Icon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                      <span>{t(labelKey)}</span>
                    </div>
                    {theme === value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 認証モーダル */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  );
}