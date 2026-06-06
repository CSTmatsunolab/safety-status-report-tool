import { NextRequest, NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

type CognitoVerifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifier: CognitoVerifier | null = null;

function getCognitoConfig(): { userPoolId: string; clientId: string } | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId =
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ||
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    return null;
  }

  return { userPoolId, clientId };
}

function getVerifier(): CognitoVerifier | null {
  const config = getCognitoConfig();
  if (!config) {
    return null;
  }

  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: 'id',
      clientId: config.clientId,
    });
  }

  return verifier;
}

export function isCognitoAuthConfigured(): boolean {
  return getCognitoConfig() !== null;
}

export async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const tokenVerifier = getVerifier();
  if (!tokenVerifier) {
    return null;
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const payload = await tokenVerifier.verify(authHeader.substring(7));
    return payload.sub;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function requireAuthenticatedUserId(request: NextRequest): Promise<string | NextResponse> {
  const userId = await getAuthenticatedUserId(request);
  return userId || unauthorizedResponse();
}

export function sanitizeScopeIdentifier(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9._:-]/g, '_');
}

export function isS3KeyInUserScope(key: string, userIdentifier: string): boolean {
  const scopedPrefix = `uploads/${sanitizeScopeIdentifier(userIdentifier)}/`;
  return key.startsWith(scopedPrefix);
}

export async function resolveRequestUserIdentifier(
  request: NextRequest,
  suppliedIdentifier?: string | null
): Promise<{ userIdentifier: string; authenticated: boolean } | { error: NextResponse }> {
  if (isCognitoAuthConfigured()) {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return { error: unauthorizedResponse() };
    }
    return { userIdentifier: userId, authenticated: true };
  }

  return {
    userIdentifier: suppliedIdentifier?.trim() || 'local-guest',
    authenticated: false,
  };
}
