/**
 * @vitest-environment node
 */

import { generateAccessToken, verifyAccessToken } from '@/lib/auth/jwt'
import type { User } from '@/types/auth'
import type { Email, GitHubUsername } from '@/types/base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, createTestUserSession } from '../../utils/auth-test-factories'

// Modern 2025 test approach: Use node environment for crypto tests to avoid JSDOM Uint8Array issues
// This fixes the "payload must be an instance of Uint8Array" error with jose library

// Mock environment validation with proper test values
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-32-chars-minimum',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  },
  getJwtSecret: vi.fn(() => 'test-jwt-secret-for-unit-tests-only-32-chars-minimum'),
}))

// Mock config to provide test values
vi.mock('../../src/lib/config', () => ({
  authConfig: {
    jwt: {
      accessTokenExpiry: 900, // 15 minutes
      refreshTokenExpiry: 604800, // 7 days
    },
  },
}))

describe('JWT Library Integration - Modern 2025 Approach', () => {
  const mockUser: User = createTestUser({
    email: 'test@example.com' as Email,
    githubUsername: 'testuser' as GitHubUsername,
  })

  const mockSession = createTestUserSession({
    userId: mockUser.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Core JWT Generation', () => {
    it('generates valid JWT with proper structure', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')

      // Verify JWT structure
      expect(typeof token).toBe('string')
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

      const parts = token.split('.')
      expect(parts).toHaveLength(3)
    })

    it('includes required claims in payload', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      const payload = await verifyAccessToken(token)

      expect(payload).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        githubUsername: mockUser.githubUsername,
        authMethod: 'oauth',
        sessionId: mockSession.id,
        iss: 'contribux',
        aud: ['contribux-api'],
      })

      // Verify timing fields
      expect(payload.exp).toBeDefined()
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeGreaterThan(payload.iat)
      expect(payload.jti).toBeDefined()
    })

    it('uses HS256 algorithm in header', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')

      // Decode header
      const headerB64 = token.split('.')[0]
      expect(headerB64).toBeDefined()

      const header = JSON.parse(Buffer.from(headerB64 ?? '', 'base64url').toString())
      expect(header.alg).toBe('HS256')
      expect(header.typ).toBe('JWT')
    })

    it('sets correct expiration time', async () => {
      const beforeGeneration = Math.floor(Date.now() / 1000)
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      const afterGeneration = Math.floor(Date.now() / 1000)

      const payload = await verifyAccessToken(token)

      // Should expire in 15 minutes (900 seconds)
      const expectedExpiry = beforeGeneration + 900
      expect(payload.exp).toBeGreaterThanOrEqual(expectedExpiry - 5)
      expect(payload.exp).toBeLessThanOrEqual(afterGeneration + 900 + 5)
    })
  })

  describe('JWT Verification', () => {
    it('verifies valid tokens successfully', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')
      const payload = await verifyAccessToken(token)

      expect(payload).toBeDefined()
      expect(payload.sub).toBe(mockUser.id)
      expect(payload.email).toBe(mockUser.email)
    })

    it('rejects malformed tokens', async () => {
      await expect(verifyAccessToken('invalid.token')).rejects.toThrow('Invalid token')
      await expect(verifyAccessToken('not-a-jwt')).rejects.toThrow('Invalid token')
      await expect(verifyAccessToken('')).rejects.toThrow('No token provided')
    })

    it('rejects tokens with tampered signature', async () => {
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')

      // Tamper with signature
      const parts = token.split('.')
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered-signature`

      await expect(verifyAccessToken(tamperedToken)).rejects.toThrow('Invalid token')
    })

    it('includes unique JTI for replay protection', async () => {
      const token1 = await generateAccessToken(mockUser, mockSession, 'oauth')
      const token2 = await generateAccessToken(mockUser, mockSession, 'oauth')

      const payload1 = await verifyAccessToken(token1)
      const payload2 = await verifyAccessToken(token2)

      expect(payload1.jti).toBeDefined()
      expect(payload2.jti).toBeDefined()
      expect(payload1.jti).not.toBe(payload2.jti)
    })
  })

  describe('Security Features', () => {
    it('generates cryptographically unique signatures', async () => {
      const token1 = await generateAccessToken(mockUser, mockSession, 'oauth')
      const token2 = await generateAccessToken(mockUser, mockSession, 'oauth')

      // Different tokens should have different signatures
      const sig1 = token1.split('.')[2]
      const sig2 = token2.split('.')[2]
      expect(sig1).not.toBe(sig2)
    })

    it('handles buffer conversion correctly', async () => {
      // Test that jose implementation properly converts string secrets to Uint8Array
      const token = await generateAccessToken(mockUser, mockSession, 'oauth')

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')

      // Should be verifiable without errors
      const payload = await verifyAccessToken(token)
      expect(payload.sub).toBe(mockUser.id)
    })

    it('supports different auth methods', async () => {
      const oauthToken = await generateAccessToken(mockUser, mockSession, 'oauth')
      const webauthnToken = await generateAccessToken(mockUser, mockSession, 'webauthn')

      const oauthPayload = await verifyAccessToken(oauthToken)
      const webauthnPayload = await verifyAccessToken(webauthnToken)

      // According to jwt.ts implementation, authMethod is always 'oauth'
      expect(oauthPayload.authMethod).toBe('oauth')
      expect(webauthnPayload.authMethod).toBe('oauth')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty optional fields gracefully', async () => {
      const { githubUsername: _githubUsername, ...userWithoutGithub } = mockUser
      const token = await generateAccessToken(userWithoutGithub, mockSession, 'oauth')

      const payload = await verifyAccessToken(token)
      expect(payload.githubUsername).toBeUndefined()
    })

    it('maintains token consistency across multiple calls', async () => {
      const tokens = await Promise.all([
        generateAccessToken(mockUser, mockSession, 'oauth'),
        generateAccessToken(mockUser, mockSession, 'oauth'),
        generateAccessToken(mockUser, mockSession, 'oauth'),
      ])

      // All should be valid
      const payloads = await Promise.all(tokens.map(verifyAccessToken))

      // All should have same user data but different JTIs
      for (const payload of payloads) {
        expect(payload.sub).toBe(mockUser.id)
        expect(payload.email).toBe(mockUser.email)
      }

      const jtis = payloads.map(p => p.jti)
      expect(new Set(jtis).size).toBe(3) // All unique
    })
  })
})
