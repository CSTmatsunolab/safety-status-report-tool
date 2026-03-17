'use client';

import Link from 'next/link';

export function Footer() {

  return (
    <footer className="bg-gray-900 dark:bg-black mt-12">
      <div className="w-full max-w-[1920px] mx-auto px-12 sm:px-16 lg:px-24 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">
              Contact
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
                Matsuno Laboratory, Department of Computer Science, College of Science and Technology, Nihon University
              </p>
              <div className="flex items-center flex-wrap gap-3">
                <p>
                  7-24-1 Narashinodai, Funabashi, Chiba 274-8501, Japan (Building 2, Room 243)
                </p>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="md:text-right">
            <h3 className="text-lg font-bold text-white mb-4">
              Links
            </h3>
            <div className="w-7 h-0.5 bg-white/50 mb-6 md:ml-auto" />
            
            <div className="space-y-3 text-gray-300">
              <p>
                <Link 
                  href="/help.html" 
                  target="_blank"
                  className="hover:text-blue-400 transition-colors"
                >
                  Help
                </Link>
              </p>
              <p>
                <Link 
                  href="/upload-guide.html" 
                  target="_blank"
                  className="hover:text-blue-400 transition-colors"
                >
                  Upload Guide
                </Link>
              </p>
              <p>
                <a 
                  href="https://www.matsulab.org/" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 transition-colors"
                >
                  Matsuno Lab Website
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center pt-8 mt-8 border-t border-gray-700">
          <span className="text-sm text-gray-500">
            Copyright © {new Date().getFullYear()} Matsuno Lab. All Rights Reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}