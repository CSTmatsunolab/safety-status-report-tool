// src/lib/amplify-config.ts
'use client';

import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';

// Amplifyの設定を初期化（一度だけ実行）
let isConfigured = false;

export function configureAmplify() {
  if (!isConfigured && typeof window !== 'undefined') {
    Amplify.configure(awsExports);
    isConfigured = true;
  }
}