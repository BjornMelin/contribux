import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateAccessToken, verifyAccessToken } from '@/lib/auth/jwt'
import type { User } from '@/types/auth'

// Mock environment validation for tests
vi.mock('@/lib/validation/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-32-chars-minimum',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  },
  getJwtSecret: vi.fn(() => 'test-jwt-secret-for-unit-tests-only-32-chars-minimum'),
}))

// Mock config to provide test values
vi.mock('@/lib/config', () => ({
  authConfig: {
    jwt: {
      accessTokenExpiry: 900, // 15 minutes
      refreshTokenExpiry: 604800, // 7 days
    }
  }
}))

describe('JWT Jose Library Integration', () => {
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    github_username: 'testuser',
    email_verified: true,
    two_factor_enabled: false,
    recovery_email: null,
    locked_at: null,
    failed_login_attempts: 0,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date()
  }

  const mockSession = {
    id: 'session-123',
    user_id: mockUser.id,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Access Token Generation with Jose', () => {
    it('should generate a valid JWT with proper structure', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      // Should be a valid JWT with 3 parts
      expect(typeof token).toBe('string')
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      
      const parts = token.split('.')
      expect(parts).toHaveLength(3)
    })

    it('should include required JWT claims', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      // Verify the token can be decoded and contains expected claims
      const payload = await verifyAccessToken(token)
      
      expect(payload).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: mockSession.id,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      // Should have expiration
      expect(payload.exp).toBeDefined()
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    it('should use HS256 algorithm for signing', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      // Decode header without verification
      const headerB64 = token.split('.')[0]
      if (!headerB64) {
        throw new Error('Invalid token format')
      }
      const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString()
      )
      
      expect(header.alg).toBe('HS256')
      expect(header.typ).toBe('JWT')
    })

    it('should set proper expiration time', async () => {
      const beforeGeneration = Math.floor(Date.now() / 1000)
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      const afterGeneration = Math.floor(Date.now() / 1000)
      
      const payload = await verifyAccessToken(token)
      
      // Should expire in approximately 15 minutes (900 seconds)
      const expectedExpiry = beforeGeneration + 900
      expect(payload.exp).toBeGreaterThanOrEqual(expectedExpiry - 5) // Allow 5 second tolerance
      expect(payload.exp).toBeLessThanOrEqual(afterGeneration + 900 + 5)
    })
  })

  describe('Access Token Verification with Jose', () => {
    it('should verify valid tokens', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      const payload = await verifyAccessToken(token)
      
      expect(payload).toBeDefined()
      expect(payload.sub).toBe(mockUser.id)
      expect(payload.email).toBe(mockUser.email)
    })

    it('should reject malformed tokens', async () => {
      await expect(verifyAccessToken('invalid.token')).rejects.toThrow()
      await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow()
      await expect(verifyAccessToken('')).rejects.toThrow()
    })

    it('should reject tokens with invalid signature', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      // Tamper with the signature
      const parts = token.split('.')
      const tamperedToken = `${parts[0]}.${parts[1]}.invalid-signature`
      
      await expect(verifyAccessToken(tamperedToken)).rejects.toThrow()
    })

    it('should include jti (JWT ID) for replay protection', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      const payload = await verifyAccessToken(token)
      
      expect(payload.jti).toBeDefined()
      expect(typeof payload.jti).toBe('string')
    })

    it('should generate unique JTI for each token', async () => {
      const token1 = await generateAccessToken(mockUser, mockSession, 'oauth')
      const token2 = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      const payload1 = await verifyAccessToken(token1)
      const payload2 = await verifyAccessToken(token2)
      
      expect(payload1.jti).not.toBe(payload2.jti)
    })
  })

  describe('Jose Library Security Features', () => {
    it('should use cryptographically secure signatures', async () => {
      const token1 = await generateAccessToken(mockUser, mockSession, 'oauth')
      const token2 = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      // Different tokens should have different signatures even with same payload
      const sig1 = token1.split('.')[2]
      const sig2 = token2.split('.')[2]
      
      expect(sig1).not.toBe(sig2)
    })

    it('should properly handle buffer conversion for secrets', async () => {
      // This tests that our jose implementation properly converts string secrets to Uint8Array
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      
      // Should not throw and should produce a valid token
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      
      // Should be verifiable
      const payload = await verifyAccessToken(token)
      expect(payload.sub).toBe(mockUser.id)
    })
  })
})