// src/lib/amplify-config.ts
'use client';

import { Amplify, type ResourcesConfig } from 'aws-amplify';

// Amplifyの設定を初期化（一度だけ実行）
let isConfigured = false;

function getAmplifyConfigFromEnv(): ResourcesConfig | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
  const identityPoolId = process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID;

  if (!userPoolId || !userPoolClientId) {
    return null;
  }

  if (identityPoolId) {
    return {
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          identityPoolId,
          loginWith: {
            email: true,
          },
        },
      },
    };
  }

  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          email: true,
        },
      },
    },
  };
}

export function configureAmplify(): boolean {
  if (isConfigured || typeof window === 'undefined') {
    return isConfigured;
  }

  const config = getAmplifyConfigFromEnv();
  if (!config) {
    console.info('Amplify auth is not configured. Running in local guest mode.');
    return false;
  }

  Amplify.configure(config);
  isConfigured = true;
  return true;
}
