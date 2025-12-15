import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium と puppeteer-core を外部パッケージとして扱う
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  
  // Chromiumバイナリをデプロイパッケージに含める
  outputFileTracingIncludes: {
    '/api/export-pdf': ['./node_modules/@sparticuz/chromium/**/*'],
  },
};

export default nextConfig;