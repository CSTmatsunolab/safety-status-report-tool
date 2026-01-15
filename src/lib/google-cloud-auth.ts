// src/lib/google-cloud-auth.ts
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let cachedClient: ImageAnnotatorClient | null = null;
let credentialsCache: object | null = null;

/**
 * Retrieve credentials from AWS Secrets Manager
 */
async function getCredentialsFromSecretsManager(): Promise<object | null> {
  // Return cached credentials if available
  if (credentialsCache) {
    return credentialsCache;
  }

  try {
    // Use APP_AWS_REGION to avoid Amplify build errors with AWS_ prefix
    const client = new SecretsManagerClient({ 
      region: process.env.APP_AWS_REGION || 'ap-northeast-1' 
    });
    
    const command = new GetSecretValueCommand({
      SecretId: process.env.GOOGLE_CLOUD_SECRET_NAME || 'ssr-prod-google-cloud-vision-key'
    });
    
    const response = await client.send(command);
    
    if (response.SecretString) {
      credentialsCache = JSON.parse(response.SecretString);
      console.log('Successfully loaded credentials from Secrets Manager');
      return credentialsCache;
    }
  } catch (error) {
    console.error('Failed to retrieve credentials from Secrets Manager:', error);
  }
  
  return null;
}

/**
 * Get Google Cloud Vision API client (async version)
 * Priority:
 * 1. AWS Secrets Manager (recommended for production)
 * 2. Environment variable GOOGLE_CLOUD_VISION_KEY (for development)
 * 3. GOOGLE_APPLICATION_CREDENTIALS file path (for local development)
 */
export async function getVisionClient(): Promise<ImageAnnotatorClient> {
  if (cachedClient) {
    return cachedClient;
  }

  // 1. Retrieve from AWS Secrets Manager (production)
  const secretCredentials = await getCredentialsFromSecretsManager();
  if (secretCredentials) {
    cachedClient = new ImageAnnotatorClient({ 
      credentials: secretCredentials as { client_email: string; private_key: string }
    });
    return cachedClient;
  }

  // 2. Retrieve from environment variable (development / backup)
  if (process.env.GOOGLE_CLOUD_VISION_KEY) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_VISION_KEY);
      console.log('Using credentials from environment variable');
      cachedClient = new ImageAnnotatorClient({ credentials });
      return cachedClient;
    } catch (error) {
      console.error('Failed to parse credentials from environment variable:', error);
    }
  }

  // 3. File-based authentication (local development)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Using credentials from GOOGLE_APPLICATION_CREDENTIALS file');
    cachedClient = new ImageAnnotatorClient();
    return cachedClient;
  }

  // Throw error if no credentials found
  throw new Error(
    'Google Cloud Vision API credentials are not configured.\n' +
    'Please set up one of the following:\n' +
    '1. AWS Secrets Manager secret "ssr-prod-google-cloud-vision-key"\n' +
    '2. Environment variable GOOGLE_CLOUD_VISION_KEY\n' +
    '3. Environment variable GOOGLE_APPLICATION_CREDENTIALS (file path)'
  );
}

/**
 * Get cached Vision client synchronously (for backward compatibility)
 * Note: This function only returns the cached client.
 * You must call getVisionClient() with await for the first initialization.
 */
export function getVisionClientSync(): ImageAnnotatorClient | null {
  return cachedClient;
}

/**
 * Clear client cache (for testing purposes)
 */
export function clearVisionClientCache(): void {
  cachedClient = null;
  credentialsCache = null;
}