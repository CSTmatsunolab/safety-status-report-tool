'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from './I18nProvider';

export function Footer() {
  const { language } = useI18n();

  return (
    <footer className="bg-gray-900 dark:bg-black mt-12">
      <div className="w-full max-w-[1920px] mx-auto px-12 sm:px-16 lg:px-24 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 連絡先 */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">
              {language === 'en' ? 'Contact' : '連絡先'}
            </h3>
            <div className="w-7 h-0.5 bg-white/50 mb-6" />
            
            <div className="space-y-3 text-gray-300">
              <p>047-469-5709</p>
              <p>
                <a 
                  href="mailto:matsuno.yutaka@nihon-u.ac.jp" 
                  className="hover:text-blue-400 transition-colors"
                >
                  matsuno.yutaka@nihon-u.ac.jp
                </a>
              </p>
              <p>
                {language === 'en' 
                  ? 'Matsuno Laboratory, Department of Computer Science, College of Science and Technology, Nihon University' 
                  : '日本大学理工学部応用情報工学科 松野研究室'}
              </p>
              <div className="flex items-center flex-wrap gap-3">
                <p>
                  {language === 'en' 
                    ? '7-24-1 Narashinodai, Funabashi, Chiba 274-8501, Japan (Building 2, Room 243)' 
                    : '〒274-8501 千葉県船橋市習志野台7-24-1 2号館4階 243号室'}
                </p>
                <a 
                  href="https://www.google.com/maps/place/%E6%97%A5%E6%9C%AC%E5%A4%A7%E5%AD%A6%E7%90%86%E5%B7%A5%E5%AD%A6%E9%83%A8%E8%88%B9%E6%A9%8B%E6%A0%A1%E8%88%8E+%EF%BC%92%E5%8F%B7%E9%A4%A8/@35.7242914,140.0567542,15z"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-full transition-colors"
                >
                  {language === 'en' ? 'Access' : '交通アクセス'}
                </a>
              </div>
            </div>
          </div>

          {/* リンク */}
          <div className="md:text-right">
            <h3 className="text-lg font-bold text-white mb-4">
              {language === 'en' ? 'Links' : 'リンク'}
            </h3>
            <div className="w-7 h-0.5 bg-white/50 mb-6 md:ml-auto" />
            
            <div className="space-y-3 text-gray-300">
              <p>
                <Link 
                  href="/help.html" 
                  target="_blank"
                  className="hover:text-blue-400 transition-colors"
                >
                  {language === 'en' ? 'Help' : 'ヘルプ'}
                </Link>
              </p>
              <p>
                <Link 
                  href="/upload-guide.html" 
                  target="_blank"
                  className="hover:text-blue-400 transition-colors"
                >
                  {language === 'en' ? 'Upload Guide' : 'アップロードガイド'}
                </Link>
              </p>
              <p>
                <a 
                  href="https://cst.nihon-u.ac.jp/laboratory/applied_computer_science/matsuno/" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 transition-colors"
                >
                  {language === 'en' ? 'Matsuno Lab Website' : '松野研究室 Webサイト'}
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* コピーライト */}
        <div className="text-center pt-8 mt-8 border-t border-gray-700">
          <span className="text-sm text-gray-500">
            Copyright © {new Date().getFullYear()} Matsuno Lab. All Rights Reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}