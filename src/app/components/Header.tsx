'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from './I18nProvider';
import { SettingsMenu } from './SettingsMenu';

export function Header() {
  const { t } = useI18n();

  return (
    <header className="bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="w-full max-w-[1920px] mx-auto px-12 sm:px-16 lg:px-24 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white transition-colors">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/D-CaseMark.png"
                alt="D-Case Mark"
                width={64}
                height={64}
                className="w-14 h-14 sm:w-16 sm:h-16"
              />
              <span>{t('app.title')}</span>
            </Link>
          </h1>
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}
