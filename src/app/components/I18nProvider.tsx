'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Import locale files
import ja from '@/locales/ja.json';
import en from '@/locales/en.json';

export type Language = 'ja' | 'en';

type LocaleData = typeof ja;

const locales: Record<Language, LocaleData> = {
  ja,
  en,
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: LocaleData;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  defaultLanguage?: Language;
}

export function I18nProvider({ children, defaultLanguage = 'ja' }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load saved language preference
    const saved = localStorage.getItem('language') as Language | null;
    if (saved && (saved === 'ja' || saved === 'en')) {
      setLanguageState(saved);
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  // Get nested value from object using dot notation
  const getNestedValue = (obj: Record<string, unknown>, path: string): string => {
    const keys = path.split('.');
    let value: unknown = obj;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return path; // Return key if not found
      }
    }
    
    return typeof value === 'string' ? value : path;
  };

  // Translation function with parameter interpolation
  const t = (key: string, params?: Record<string, string | number>): string => {
    const locale = locales[language];
    let text = getNestedValue(locale as unknown as Record<string, unknown>, key);
    
    // Replace parameters like {name} with actual values
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      });
    }
    
    return text;
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ language: defaultLanguage, setLanguage, t, locale: locales[defaultLanguage] }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, locale: locales[language] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

// Export language names for display
export const languageNames: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
};