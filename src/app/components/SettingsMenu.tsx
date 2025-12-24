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
  FiLoader,
  FiExternalLink,
  FiHelpCircle,
  FiMessageSquare,
  FiClock
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

  // セクションヘッダーのテキスト
  const sectionText = {
    generalSettings: language === 'en' ? 'General Settings' : '一般設定',
    externalLinks: language === 'en' ? 'External Links' : '外部リンク',
    help: language === 'en' ? 'Help / Usage Guide' : 'ヘルプ / 使い方',
    feedback: language === 'en' ? 'Feedback' : 'フィードバック',
    feedbackDesc: language === 'en' ? 'Send feedback or suggestions' : 'ご意見・ご要望はこちら',
    gsnCreate: language === 'en' ? 'Create GSN here' : 'GSN作成はこちら',
    history: language === 'en' ? 'Report History' : 'レポート履歴',
  };

  if (!mounted) {
    return (
      <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
    );
  }

  return (
    <>
      <div className="fixed top-6 right-6 z-50 flex items-center gap-4" ref={menuRef}>
        {/* 認証ステータス表示 */}
        <div className="hidden sm:flex items-center gap-3 px-5 py-3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
          {status === 'loading' ? (
            <FiLoader className="animate-spin text-gray-400" size={24} />
          ) : status === 'authenticated' && user ? (
            <div className="flex items-center text-lg text-gray-700 dark:text-gray-300">
              <FiUser className="mr-2 text-green-500" size={24} />
              <span className="max-w-[180px] truncate font-medium">{user.email}</span>
            </div>
          ) : (
            <div className="flex items-center text-lg text-gray-500 dark:text-gray-400">
              <FiUser className="mr-2" size={24} />
              <span className="font-medium">{authText.guest}</span>
            </div>
          )}
        </div>

        {/* Hamburger Button */}
        <button
          onClick={toggleMenu}
          className="
            p-5 rounded-2xl
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
            <FiX className="w-12 h-12" />
          ) : (
            <FiMenu className="w-12 h-12" />
          )}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="
            absolute right-0 top-full mt-3
            w-[420px] max-w-[calc(100vw-1.5rem)]
            bg-white dark:bg-gray-800
            rounded-2xl shadow-xl dark:shadow-2xl
            border border-gray-200 dark:border-gray-700
            py-4 z-50
            animate-in fade-in slide-in-from-top-2 duration-200
            max-h-[80vh] overflow-y-auto
          ">
            {activeSubmenu === null ? (
              // Main Menu
              <>
                {/* 認証セクション */}
                <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                  {status === 'authenticated' && user ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-xl text-gray-700 dark:text-gray-300">
                        <FiUser className="text-green-500 flex-shrink-0" size={28} />
                        <span className="font-semibold truncate max-w-[280px]">{user.email}</span>
                      </div>
                      <button
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="
                          flex items-center gap-3 w-full px-4 py-3
                          text-lg text-red-600 dark:text-red-400
                          hover:bg-red-50 dark:hover:bg-red-900/20
                          rounded-xl transition-colors
                          disabled:opacity-50
                        "
                      >
                        {isSigningOut ? (
                          <FiLoader className="animate-spin flex-shrink-0" size={24} />
                        ) : (
                          <FiLogOut size={24} className="flex-shrink-0" />
                        )}
                        <span className="font-medium">{authText.signOut}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-xl text-gray-500 dark:text-gray-400">
                        <FiUser size={28} className="flex-shrink-0" />
                        <span className="font-medium">{authText.guest}</span>
                      </div>
                      <button
                        onClick={handleOpenAuthModal}
                        className="
                          flex items-center gap-3 w-full px-4 py-3
                          text-lg text-blue-600 dark:text-blue-400
                          bg-blue-50 dark:bg-blue-900/20
                          hover:bg-blue-100 dark:hover:bg-blue-900/30
                          rounded-xl transition-colors font-semibold
                        "
                      >
                        <FiLogIn size={24} className="flex-shrink-0" />
                        <span>{authText.signIn}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Stakeholder Settings */}
                <Link
                  href="/stakeholder-settings"
                  className="
                    flex items-center gap-5 px-6 py-5
                    text-gray-700 dark:text-gray-200
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    transition-colors
                    text-xl
                  "
                  onClick={() => setIsOpen(false)}
                >
                  <FiSettings className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <span>{t('menu.stakeholderSettings')}</span>
                </Link>

                {/* Report History */}
                <Link
                  href="/history"
                  className="
                    flex items-center gap-5 px-6 py-5
                    text-gray-700 dark:text-gray-200
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    transition-colors
                    text-xl
                  "
                  onClick={() => setIsOpen(false)}
                >
                  <FiClock className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <span>{sectionText.history}</span>
                </Link>

                {/* 一般設定セクション */}
                <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                  <div className="px-6 py-3">
                    <span className="text-base font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {sectionText.generalSettings}
                    </span>
                  </div>

                  {/* Language Submenu Trigger */}
                  <button
                    onClick={() => setActiveSubmenu('language')}
                    className="
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                    "
                  >
                    <div className="flex items-center gap-5">
                      <FiGlobe className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span>{t('menu.language')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                      <span className="text-lg">{languageNames[language]}</span>
                      <FiChevronRight className="w-6 h-6" />
                    </div>
                  </button>

                  {/* Theme Submenu Trigger */}
                  <button
                    onClick={() => setActiveSubmenu('theme')}
                    className="
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                    "
                  >
                    <div className="flex items-center gap-5">
                      {theme === 'dark' ? (
                        <FiMoon className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      ) : theme === 'light' ? (
                        <FiSun className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      ) : (
                        <FiMonitor className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      )}
                      <span>{t('menu.theme')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                      <span className="text-lg">
                        {theme === 'dark' ? t('menu.themeDark') : 
                         theme === 'light' ? t('menu.themeLight') : 
                         t('menu.themeSystem')}
                      </span>
                      <FiChevronRight className="w-6 h-6" />
                    </div>
                  </button>
                </div>

                {/* 外部リンクセクション */}
                <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                  <div className="px-6 py-3">
                    <span className="text-base font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {sectionText.externalLinks}
                    </span>
                  </div>

                  {/* D-Case Communicator Link */}
                  <a
                    href="https://www.matsulab.org/dcase/login.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                    "
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="flex items-center gap-5">
                      <FiExternalLink className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <div className="flex flex-col items-start">
                        <span>D-Case Communicator</span>
                        <span className="text-base text-gray-500 dark:text-gray-400">
                          {sectionText.gsnCreate}
                        </span>
                      </div>
                    </div>
                    <FiChevronRight className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  </a>

                  {/* Help Link */}
                  <a
                    href="/help.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                    "
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="flex items-center gap-5">
                      <FiHelpCircle className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span>{sectionText.help}</span>
                    </div>
                    <FiChevronRight className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  </a>

                  {/* Feedback Link */}
                  <a
                    href="https://docs.google.com/forms/d/e/1FAIpQLSepn_bBSMh9QQuWc_n9j5wT_SjY70RKM2n8A4ujdiDUg98_QA/viewform?usp=header"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                    "
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="flex items-center gap-5">
                      <FiMessageSquare className="w-8 h-8 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <div className="flex flex-col items-start">
                        <span>{sectionText.feedback}</span>
                        <span className="text-base text-gray-500 dark:text-gray-400">
                          {sectionText.feedbackDesc}
                        </span>
                      </div>
                    </div>
                    <FiChevronRight className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  </a>
                </div>
              </>
            ) : activeSubmenu === 'language' ? (
              // Language Submenu
              <>
                <button
                  onClick={() => setActiveSubmenu(null)}
                  className="
                    flex items-center gap-4 px-6 py-4 w-full
                    text-gray-500 dark:text-gray-400
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    text-xl
                  "
                >
                  <FiChevronRight className="w-7 h-7 rotate-180" />
                  <span>{t('menu.language')}</span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
                {languages.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleLanguageChange(value)}
                    className={`
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                      ${language === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    <span>{label}</span>
                    {language === value && (
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
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
                    flex items-center gap-4 px-6 py-4 w-full
                    text-gray-500 dark:text-gray-400
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    text-xl
                  "
                >
                  <FiChevronRight className="w-7 h-7 rotate-180" />
                  <span>{t('menu.theme')}</span>
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
                {themes.map(({ value, icon: Icon, labelKey }) => (
                  <button
                    key={value}
                    onClick={() => handleThemeChange(value)}
                    className={`
                      flex items-center justify-between w-full px-6 py-5
                      text-gray-700 dark:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      transition-colors
                      text-xl
                      ${theme === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    <div className="flex items-center gap-5">
                      <Icon className="w-8 h-8 text-gray-500 dark:text-gray-400" />
                      <span>{t(labelKey)}</span>
                    </div>
                    {theme === value && (
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
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