import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpackの設定をカスタマイズ
  webpack: (config, { isServer }) => {
    // ChromaDBの不要な依存関係の警告を抑制
    config.resolve.alias = {
      ...config.resolve.alias,
      '@chroma-core/default-embed': false,
    };

    if (isServer) {
      if (!config.externals) {
        config.externals = [];
      }
      if (Array.isArray(config.externals)) {
        config.externals.push('@chroma-core/default-embed');
      }
    }

    return config;
  },
};

export default nextConfig;