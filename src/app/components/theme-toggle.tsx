'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { FiSun, FiMoon, FiMonitor } from 'react-icons/fi';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffectを使用してクライアントサイドでのみマウント
  useEffect(() => {
    setMounted(true);
  }, []);

  // サーバーサイドレンダリング時は何も表示しない
  if (!mounted) {
    return (
      <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
    );
  }

  const themes = [
    { value: 'light', icon: FiSun, label: 'ライト' },
    { value: 'dark', icon: FiMoon, label: 'ダーク' },
    { value: 'system', icon: FiMonitor, label: 'システム' }
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`
            flex items-center justify-center
            w-9 h-9 rounded-md
            transition-all duration-200
            ${theme === value 
              ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' 
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }
          `}
          title={label}
          aria-label={`${label}モードに切り替え`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

// よりシンプルな単一ボタンバージョン
export function ThemeToggleSimple() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse">
        <div className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="
        p-2 rounded-lg
        bg-gray-100 hover:bg-gray-200
        dark:bg-gray-800 dark:hover:bg-gray-700
        text-gray-700 dark:text-gray-300
        transition-colors duration-200
      "
      title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
    >
      {theme === 'dark' ? (
        <FiSun className="w-5 h-5" />
      ) : (
        <FiMoon className="w-5 h-5" />
      )}
    </button>
  );
}
