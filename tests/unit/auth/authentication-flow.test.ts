/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import jwt from 'jsonwebtoken'
import { 
  validateSession,
  refreshToken,
  validateJWT,
  handleOAuthCallback,
  type SessionData,
  type TokenPayload
} from '@/lib/auth/session-management'
import { authConfig } from '@/lib/auth'

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn()
}))

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
    decode: vi.fn()
  }
}))

describe('Authentication Flow Tests', () => {
  const mockSession: SessionData = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://example.com/avatar.jpg'
    },
    expires: new Date(Date.now() + 3600000).toISOString(),
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret-key-for-testing-only'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Session Validation', () => {
    it('should validate active session', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)
      
      const result = await validateSession()
      
      expect(result.valid).toBe(true)
      expect(result.session).toEqual(mockSession)
      expect(result.expired).toBe(false)
    })

    it('should detect expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expires: new Date(Date.now() - 1000).toISOString()
      }
      vi.mocked(getServerSession).mockResolvedValueOnce(expiredSession)
      
      const result = await validateSession()
      
      expect(result.valid).toBe(false)
      expect(result.expired).toBe(true)
      expect(result.error).toBe('Session expired')
    })

    it('should handle missing session', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null)
      
      const result = await validateSession()
      
      expect(result.valid).toBe(false)
      expect(result.session).toBeNull()
      expect(result.error).toBe('No session found')
    })

    it('should handle session validation errors', async () => {
      vi.mocked(getServerSession).mockRejectedValueOnce(new Error('Database error'))
      
      const result = await validateSession()
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Session validation failed')
    })
  })

  describe('JWT Token Handling', () => {
    const mockPayload: TokenPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    }

    it('should validate valid JWT token', async () => {
      const token = 'valid.jwt.token'
      vi.mocked(jwt.verify).mockReturnValueOnce(mockPayload as any)
      
      const result = await validateJWT(token)
      
      expect(result.valid).toBe(true)
      expect(result.payload).toEqual(mockPayload)
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET)
    })

    it('should reject expired JWT token', async () => {
      const expiredPayload = {
        ...mockPayload,
        exp: Math.floor(Date.now() / 1000) - 1000
      }
      vi.mocked(jwt.verify).mockReturnValueOnce(expiredPayload as any)
      
      const result = await validateJWT('expired.jwt.token')
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token expired')
    })

    it('should handle malformed JWT', async () => {
      vi.mocked(jwt.verify).mockImplementationOnce(() => {
        throw new Error('jwt malformed')
      })
      
      const result = await validateJWT('malformed.token')
      
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid token')
    })

    it('should generate new JWT token', async () => {
      const newToken = 'new.jwt.token'
      vi.mocked(jwt.sign).mockReturnValueOnce(newToken)
      
      const payload = {
        sub: 'user-123',
        email: 'test@example.com'
      }
      
      const token = await generateJWT(payload)
      
      expect(token).toBe(newToken)
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining(payload),
        process.env.JWT_SECRET,
        expect.objectContaining({ expiresIn: '1h' })
      )
    })
  })

  describe('Token Refresh', () => {
    it('should refresh valid token', async () => {
      const oldToken = 'old.refresh.token'
      const newTokens = {
        accessToken: 'new.access.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 3600
      }
      
      // Mock token validation
      vi.mocked(jwt.verify).mockReturnValueOnce({
        sub: 'user-123',
        type: 'refresh'
      } as any)
      
      // Mock API call for token refresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => newTokens
      })
      
      const result = await refreshToken(oldToken)
      
      expect(result.success).toBe(true)
      expect(result.tokens).toEqual(newTokens)
    })

    it('should handle invalid refresh token', async () => {
      vi.mocked(jwt.verify).mockImplementationOnce(() => {
        throw new Error('Invalid token')
      })
      
      const result = await refreshToken('invalid.token')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid refresh token')
    })

    it('should handle refresh API errors', async () => {
      vi.mocked(jwt.verify).mockReturnValueOnce({ sub: 'user-123' } as any)
      
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Token expired' })
      })
      
      const result = await refreshToken('valid.token')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Token refresh failed')
    })
  })

  describe('OAuth Callback Handling', () => {
    it('should handle successful OAuth callback', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/auth/callback?code=auth-code&state=state-value',
        method: 'GET'
      } as NextRequest
      
      // Mock OAuth token exchange
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'github-access-token',
          token_type: 'bearer',
          scope: 'read:user'
        })
      })
      
      const result = await handleOAuthCallback(mockRequest, 'github')
      
      expect(result.success).toBe(true)
      expect(result.provider).toBe('github')
      expect(result.tokens?.access_token).toBe('github-access-token')
    })

    it('should validate OAuth state parameter', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/auth/callback?code=auth-code&state=invalid-state',
        cookies: {
          get: vi.fn().mockReturnValue({ value: 'expected-state' })
        }
      } as any
      
      const result = await handleOAuthCallback(mockRequest, 'github')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid state parameter')
    })

    it('should handle missing authorization code', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/auth/callback?state=state-value',
        method: 'GET'
      } as NextRequest
      
      const result = await handleOAuthCallback(mockRequest, 'github')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing authorization code')
    })

    it('should handle OAuth provider errors', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/auth/callback?error=access_denied&error_description=User+denied+access',
        method: 'GET'
      } as NextRequest
      
      const result = await handleOAuthCallback(mockRequest, 'github')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('access_denied')
      expect(result.errorDescription).toBe('User denied access')
    })
  })

  describe('Session Persistence', () => {
    it('should store session in secure cookie', async () => {
      const sessionData = {
        userId: 'user-123',
        email: 'test@example.com',
        expires: Date.now() + 3600000
      }
      
      const cookie = await createSessionCookie(sessionData)
      
      expect(cookie).toMatchObject({
        name: 'session',
        value: expect.any(String),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: expect.any(Number)
      })
    })

    it('should encrypt session data', async () => {
      const sessionData = { userId: 'user-123', sensitive: 'data' }
      const encrypted = await encryptSession(sessionData)
      
      expect(encrypted).not.toContain('user-123')
      expect(encrypted).not.toContain('sensitive')
      
      const decrypted = await decryptSession(encrypted)
      expect(decrypted).toEqual(sessionData)
    })

    it('should handle session rotation', async () => {
      const oldSession = { userId: 'user-123', createdAt: Date.now() - 7200000 }
      const shouldRotate = checkSessionRotation(oldSession)
      
      expect(shouldRotate).toBe(true)
      
      const newSession = await rotateSession(oldSession)
      expect(newSession.createdAt).toBeGreaterThan(oldSession.createdAt)
      expect(newSession.userId).toBe(oldSession.userId)
    })
  })

  describe('Multi-Factor Authentication', () => {
    it('should generate TOTP secret', async () => {
      const result = await generateTOTPSecret('user-123')
      
      expect(result.secret).toMatch(/^[A-Z2-7]{32}$/)
      expect(result.qrCode).toContain('data:image/png;base64')
      expect(result.backupCodes).toHaveLength(10)
    })

    it('should validate correct TOTP code', async () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const code = generateTOTPCode(secret)
      
      const result = await validateTOTP(code, secret)
      
      expect(result.valid).toBe(true)
      expect(result.window).toBeDefined()
    })

    it('should reject invalid TOTP code', async () => {
      const result = await validateTOTP('000000', 'JBSWY3DPEHPK3PXP')
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid code')
    })

    it('should handle backup codes', async () => {
      const backupCodes = ['ABC123', 'DEF456', 'GHI789']
      const result = await validateBackupCode('DEF456', backupCodes)
      
      expect(result.valid).toBe(true)
      expect(result.remainingCodes).toEqual(['ABC123', 'GHI789'])
    })
  })

  describe('Account Linking', () => {
    it('should link OAuth account to existing user', async () => {
      const userId = 'user-123'
      const oauthAccount = {
        provider: 'github',
        providerAccountId: 'github-456',
        access_token: 'token'
      }
      
      const result = await linkOAuthAccount(userId, oauthAccount)
      
      expect(result.success).toBe(true)
      expect(result.linked).toBe(true)
    })

    it('should prevent duplicate account linking', async () => {
      const result = await linkOAuthAccount('user-123', {
        provider: 'github',
        providerAccountId: 'already-linked-id'
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Account already linked')
    })

    it('should handle account unlinking', async () => {
      const result = await unlinkOAuthAccount('user-123', 'github')
      
      expect(result.success).toBe(true)
      expect(result.requiresPasswordSet).toBe(true)
    })
  })
})