import type { NextConfig } from "next";

const packageJson = require('./package.json');

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: packageJson.version,
  },
};

export default nextConfig;