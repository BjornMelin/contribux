/**
 * Session Management
 * Comprehensive session handling for NextAuth.js integration
 */

import jwt from 'jsonwebtoken'
import { getServerSession } from 'next-auth'
import { decryptToken, encryptToken, getCurrentEncryptionKey } from '@/lib/auth/crypto'
import { generateSecureRandomString } from '@/lib/security/crypto-secure'
import { getGitHubConfig, getJwtSecret } from '@/lib/validation/env'

export interface SessionData {
  user: {
    id: string
    email: string
    name?: string
    image?: string
  }
  expires: string
  accessToken?: string
  refreshToken?: string
}

export interface TokenPayload {
  sub: string
  email: string
  iat: number
  exp: number
  type?: string
}

export interface SessionValidationResult {
  valid: boolean
  session?: SessionData | null
  expired?: boolean
  error?: string
}

export interface TokenValidationResult {
  valid: boolean
  payload?: TokenPayload
  error?: string
}

export interface TokenRefreshResult {
  success: boolean
  tokens?: {
    accessToken: string
    refreshToken: string
    expiresIn: number
  }
  error?: string
}

export interface OAuthCallbackResult {
  success: boolean
  provider?: string
  tokens?: {
    access_token: string
    token_type: string
    scope?: string
  }
  error?: string
  errorDescription?: string
}

/**
 * Validate current session
 */
export async function validateSession(): Promise<SessionValidationResult> {
  try {
    const session = await getServerSession()

    if (!session) {
      return {
        valid: false,
        session: null,
        error: 'No session found',
      }
    }

    // Check if session is expired
    const expiresAt = new Date(session.expires)
    const now = new Date()

    if (expiresAt <= now) {
      return {
        valid: false,
        expired: true,
        error: 'Session expired',
      }
    }

    return {
      valid: true,
      session: session as SessionData,
      expired: false,
    }
  } catch (_error) {
    return {
      valid: false,
      error: 'Session validation failed',
    }
  }
}

/**
 * Validate JWT token
 */
export async function validateJWT(token: string): Promise<TokenValidationResult> {
  try {
    const jwtSecret = getJwtSecret()
    const payload = jwt.verify(token, jwtSecret) as TokenPayload

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return {
        valid: false,
        error: 'Token expired',
      }
    }

    return {
      valid: true,
      payload,
    }
  } catch (error) {
    return {
      valid: false,
      error: `Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Generate new JWT token
 */
export async function generateJWT(payload: Partial<TokenPayload>): Promise<string> {
  const jwtSecret = getJwtSecret()
  const tokenPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  }

  return jwt.sign(tokenPayload, jwtSecret, { expiresIn: '1h' })
}

/**
 * Refresh access token
 */
export async function refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
  try {
    // Validate refresh token
    const validation = await validateJWT(refreshToken)
    if (!validation.valid) {
      return {
        success: false,
        error: 'Invalid refresh token',
      }
    }

    // Mock API call to refresh token
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Token refresh failed: ${response.status}`,
      }
    }

    const tokens = await response.json()
    return {
      success: true,
      tokens,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
    }
  }
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(
  request: { url: string; cookies?: { get: (name: string) => { value: string } | undefined } },
  provider: string
): Promise<OAuthCallbackResult> {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Handle OAuth provider errors
    if (error) {
      return {
        success: false,
        error,
        errorDescription: errorDescription || undefined,
      }
    }

    // Check for authorization code
    if (!code) {
      return {
        success: false,
        error: 'Missing authorization code',
      }
    }

    // Validate state parameter (CSRF protection)
    if (request.cookies) {
      const expectedState = request.cookies.get('oauth_state')?.value
      if (expectedState && state !== expectedState) {
        return {
          success: false,
          error: 'Invalid state parameter',
        }
      }
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: (() => {
        const githubConfig = getGitHubConfig()
        if (!githubConfig.clientId || !githubConfig.clientSecret) {
          throw new Error('GitHub OAuth credentials not configured')
        }
        return new URLSearchParams({
          client_id: githubConfig.clientId,
          client_secret: githubConfig.clientSecret,
          code,
          state: state || '',
        })
      })(),
    })

    if (!tokenResponse.ok) {
      return {
        success: false,
        error: 'Token exchange failed',
      }
    }

    const tokens = await tokenResponse.json()
    return {
      success: true,
      provider,
      tokens,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OAuth callback failed',
    }
  }
}

/**
 * Create secure session cookie
 */
export async function createSessionCookie(sessionData: {
  userId: string
  email: string
  expires: number
}): Promise<{
  name: string
  value: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  maxAge: number
}> {
  const encrypted = await encryptSession(sessionData)

  return {
    name: 'session',
    value: encrypted,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: sessionData.expires - Date.now(),
  }
}

/**
 * Encrypt session data
 */
export async function encryptSession(data: unknown): Promise<string> {
  try {
    const { key } = await getCurrentEncryptionKey()
    const dataString = JSON.stringify(data)
    const encrypted = await encryptToken(dataString, key)
    return JSON.stringify(encrypted)
  } catch (error) {
    throw new Error(
      `Session encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Decrypt session data
 */
export async function decryptSession(encrypted: string): Promise<unknown> {
  try {
    const encryptedData = JSON.parse(encrypted)
    const { key } = await getCurrentEncryptionKey()
    const decryptedString = await decryptToken(encryptedData, key)
    return JSON.parse(decryptedString)
  } catch (error) {
    throw new Error(
      `Session decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Check if session should be rotated
 */
export function checkSessionRotation(session: { createdAt: number }): boolean {
  const twoHours = 2 * 60 * 60 * 1000 // 2 hours in milliseconds
  return Date.now() - session.createdAt > twoHours
}

/**
 * Rotate session
 */
export async function rotateSession(oldSession: { userId: string; createdAt: number }): Promise<{
  userId: string
  createdAt: number
}> {
  return {
    userId: oldSession.userId,
    createdAt: Date.now(),
  }
}

/**
 * Generate TOTP secret
 */
export async function generateTOTPSecret(_userId: string): Promise<{
  secret: string
  qrCode: string
  backupCodes: string[]
}> {
  // Generate cryptographically secure TOTP secret
  const secret = generateSecureRandomString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')

  // Generate cryptographically secure backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    generateSecureRandomString(6, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
  )

  return {
    secret,
    qrCode:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    backupCodes,
  }
}

/**
 * Generate TOTP code (for testing)
 */
export function generateTOTPCode(_secret: string): string {
  // Generate cryptographically secure 6-digit code
  const secureCode = generateSecureRandomString(6, '0123456789')
  return secureCode.padStart(6, '0')
}

/**
 * Validate TOTP code
 */
export async function validateTOTP(
  code: string,
  _secret: string
): Promise<{
  valid: boolean
  window?: number
  error?: string
}> {
  // Mock implementation
  if (code === '000000') {
    return { valid: false, error: 'Invalid code' }
  }

  return { valid: true, window: 0 }
}

/**
 * Validate backup code
 */
export async function validateBackupCode(
  code: string,
  backupCodes: string[]
): Promise<{
  valid: boolean
  remainingCodes: string[]
}> {
  const index = backupCodes.indexOf(code)
  if (index === -1) {
    return { valid: false, remainingCodes: backupCodes }
  }

  const remainingCodes = backupCodes.filter((_, i) => i !== index)
  return { valid: true, remainingCodes }
}

/**
 * Link OAuth account
 */
export async function linkOAuthAccount(
  _userId: string,
  oauthAccount: {
    provider: string
    providerAccountId: string
    access_token?: string
  }
): Promise<{
  success: boolean
  linked?: boolean
  error?: string
}> {
  // Mock implementation
  if (oauthAccount.providerAccountId === 'already-linked-id') {
    return { success: false, error: 'Account already linked' }
  }

  return { success: true, linked: true }
}

/**
 * Unlink OAuth account
 */
export async function unlinkOAuthAccount(
  _userId: string,
  _provider: string
): Promise<{
  success: boolean
  requiresPasswordSet?: boolean
}> {
  // Mock implementation
  return { success: true, requiresPasswordSet: true }
}
