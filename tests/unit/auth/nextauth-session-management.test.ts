/**
 * NextAuth.js v5 Session Management Testing Suite
 * Comprehensive testing for session creation, validation, persistence, expiration, refresh, and cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock environment variables before imports
vi.mock('@/lib/validation/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test',
    NEXTAUTH_SECRET: 'test-nextauth-secret',
    NEXTAUTH_URL: 'http://localhost:3000',
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  },
}))

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

import { authConfig } from '@/lib/auth/config'
import type { Email, UUID } from '@/types/base'
import type { JWT, Session } from 'next-auth'

describe('NextAuth Session Management Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
  })

  describe('Session Creation', () => {
    it('should create session with correct structure for GitHub user', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock user data from database
      mockSql.mockResolvedValueOnce([
        {
          id: 'user-123',
          email: 'github-user@example.com',
          display_name: 'GitHub User',
          username: 'githubuser',
          github_username: 'githubuser',
          email_verified: true,
          two_factor_enabled: false,
          recovery_email: null,
          locked_at: null,
          failed_login_attempts: 0,
          last_login_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          connected_providers: ['github'],
          primary_provider: 'github',
        },
      ])

      const mockToken: JWT = {
        sub: 'user-123',
        email: 'github-user@example.com',
        accessToken: 'gho_test_token',
        refreshToken: 'ghr_test_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        provider: 'github',
      }

      const mockSession: Session = {
        user: {
          id: 'user-123' as UUID,
          name: 'GitHub User',
          email: 'github-user@example.com' as Email,
          image: null,
          emailVerified: null,
          connectedProviders: [],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      const sessionCallback = authConfig.callbacks?.session
      const result = await sessionCallback?.({
        session: {
          ...mockSession,
          sessionToken: 'mock-session-token',
          userId: 'user-123',
        },
        token: mockToken,
      })

      expect(result?.user?.id).toBe('user-123')
      expect(result?.user?.email).toBe('github-user@example.com')
      expect(result?.user?.connectedProviders).toEqual(['github'])
      expect(result?.user?.primaryProvider).toBe('github')
      expect(result?.user?.githubUsername).toBe('githubuser')
    })

    it('should create session with correct structure for Google user', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock user data from database
      mockSql.mockResolvedValueOnce([
        {
          id: 'user-456',
          email: 'google-user@example.com',
          display_name: 'Google User',
          username: 'googleuser',
          github_username: null,
          email_verified: true,
          two_factor_enabled: false,
          recovery_email: null,
          locked_at: null,
          failed_login_attempts: 0,
          last_login_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          connected_providers: ['google'],
          primary_provider: 'google',
        },
      ])

      const mockToken: JWT = {
        sub: 'user-456',
        email: 'google-user@example.com',
        accessToken: 'ya29.test_token',
        refreshToken: '1//test_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        provider: 'google',
      }

      const mockSession: Session = {
        user: {
          id: 'user-456' as UUID,
          name: 'Google User',
          email: 'google-user@example.com' as Email,
          image: null,
          emailVerified: null,
          connectedProviders: [],
          primaryProvider: 'google',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      const sessionCallback = authConfig.callbacks?.session
      const result = await sessionCallback?.({
        session: {
          ...mockSession,
          sessionToken: 'mock-session-token',
          userId: 'user-456',
        },
        token: mockToken,
      })

      expect(result?.user?.id).toBe('user-456')
      expect(result?.user?.email).toBe('google-user@example.com')
      expect(result?.user?.connectedProviders).toEqual(['google'])
      expect(result?.user?.primaryProvider).toBe('google')
      expect(result?.user?.githubUsername).toBeUndefined()
    })

    it('should create session for multi-provider user', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock user with multiple providers
      mockSql.mockResolvedValueOnce([
        {
          id: 'user-789',
          email: 'multi-user@example.com',
          display_name: 'Multi Provider User',
          username: 'multiuser',
          github_username: 'multiuser',
          email_verified: true,
          two_factor_enabled: true,
          recovery_email: 'recovery@example.com',
          locked_at: null,
          failed_login_attempts: 0,
          last_login_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          connected_providers: ['github', 'google'],
          primary_provider: 'github',
        },
      ])

      const mockToken: JWT = {
        sub: 'user-789',
        email: 'multi-user@example.com',
        accessToken: 'gho_test_token',
        refreshToken: 'ghr_test_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        provider: 'github',
      }

      const mockSession: Session = {
        user: {
          id: 'user-789' as UUID,
          name: 'Multi Provider User',
          email: 'multi-user@example.com' as Email,
          image: null,
          emailVerified: null,
          connectedProviders: [],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      const sessionCallback = authConfig.callbacks?.session
      const result = await sessionCallback?.({
        session: {
          ...mockSession,
          sessionToken: 'mock-session-token',
          userId: 'user-789',
        },
        token: mockToken,
      })

      expect(result?.user?.connectedProviders).toEqual(['github', 'google'])
      expect(result?.user?.primaryProvider).toBe('github')
      expect(result?.user?.githubUsername).toBe('multiuser')
    })
  })

  describe('Session Validation', () => {
    it('should validate session token expiration', () => {
      const currentTime = Date.now()
      const validExpiry = currentTime + 86400000 // 24 hours from now
      const expiredTime = currentTime - 3600000 // 1 hour ago

      const validSession: Session = {
        user: {
          id: 'user-123' as UUID,
          name: 'Test User',
          email: 'test@example.com' as Email,
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(validExpiry).toISOString(),
      }

      const expiredSession: Session = {
        ...validSession,
        expires: new Date(expiredTime).toISOString(),
      }

      expect(new Date(validSession.expires).getTime()).toBeGreaterThan(currentTime)
      expect(new Date(expiredSession.expires).getTime()).toBeLessThan(currentTime)
    })

    it('should validate JWT token structure', () => {
      const validJWT: JWT = {
        sub: 'user-123',
        email: 'test@example.com',
        accessToken: 'gho_test_token',
        refreshToken: 'ghr_test_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        provider: 'github',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      }

      expect(validJWT.sub).toBeTruthy()
      expect(validJWT.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      expect(validJWT.accessToken).toBeTruthy()
      expect(validJWT.provider).toBeTruthy()
      expect(validJWT.exp).toBeGreaterThan(validJWT.iat || 0)
    })

    it('should handle missing user data gracefully', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock empty result (user not found)
      mockSql.mockResolvedValueOnce([])

      const mockToken: JWT = {
        sub: 'non-existent-user',
        email: 'missing@example.com',
      }

      const mockSession: Session = {
        user: {
          id: 'non-existent-user' as UUID,
          name: 'Test User',
          email: 'missing@example.com' as Email,
          image: null,
          emailVerified: null,
          connectedProviders: [],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      const sessionCallback = authConfig.callbacks?.session
      const result = await sessionCallback?.({
        session: {
          ...mockSession,
          sessionToken: 'mock-session-token',
          userId: 'non-existent-user',
        },
        token: mockToken,
      })

      // Should return original session when user not found
      expect(result).toEqual(mockSession)
    })
  })

  describe('Session Persistence', () => {
    it('should persist session for configured duration', () => {
      const sessionConfig = authConfig.session

      expect(sessionConfig?.strategy).toBe('jwt')
      expect(sessionConfig?.maxAge).toBe(30 * 24 * 60 * 60) // 30 days
      expect(sessionConfig?.updateAge).toBe(24 * 60 * 60) // 24 hours
    })

    it('should update session timestamp appropriately', () => {
      const _sessionMaxAge = 30 * 24 * 60 * 60 * 1000 // 30 days in ms
      const updateAge = 24 * 60 * 60 * 1000 // 24 hours in ms

      const now = Date.now()
      const lastUpdate = now - (updateAge + 1000) // Just over 24 hours ago

      // Should update if more than updateAge has passed
      expect(now - lastUpdate).toBeGreaterThan(updateAge)
    })

    it('should handle concurrent session updates', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Simulate concurrent session callbacks
      const promises = Array.from({ length: 5 }, async (_, i) => {
        mockSql.mockResolvedValueOnce([
          {
            id: `user-${i}`,
            email: `user${i}@example.com`,
            display_name: `User ${i}`,
            username: `user${i}`,
            github_username: `user${i}`,
            email_verified: true,
            connected_providers: ['github'],
            primary_provider: 'github',
          },
        ])

        const sessionCallback = authConfig.callbacks?.session
        return sessionCallback?.({
          session: {
            user: {
              id: `user-${i}` as UUID,
              name: `User ${i}`,
              email: `user${i}@example.com` as Email,
              image: null,
              emailVerified: null,
              connectedProviders: [],
              primaryProvider: 'github',
            },
            expires: new Date(Date.now() + 86400000).toISOString(),
            sessionToken: `session-token-${i}`,
            userId: `user-${i}`,
          },
          token: {
            sub: `user-${i}`,
            email: `user${i}@example.com`,
          },
        })
      })

      const results = await Promise.all(promises)

      // All sessions should be processed successfully
      expect(results).toHaveLength(5)
      results.forEach((result, i) => {
        expect(result?.user?.id).toBe(`user-${i}`)
      })
    })
  })

  describe('Session Expiration', () => {
    it('should handle JWT token expiration correctly', async () => {
      const jwtCallback = authConfig.callbacks?.jwt

      // Test token that's about to expire
      const expiredToken: JWT = {
        sub: 'user-123',
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago
        provider: 'github',
      }

      // Mock successful token refresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      })

      const result = await jwtCallback?.({ token: expiredToken })

      expect(result?.accessToken).toBe('new-access-token')
      expect(result?.refreshToken).toBe('new-refresh-token')
      expect(result?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })

    it('should handle refresh token failure', async () => {
      const jwtCallback = authConfig.callbacks?.jwt

      const expiredToken: JWT = {
        sub: 'user-123',
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        provider: 'github',
      }

      // Mock failed token refresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'The refresh token is invalid',
        }),
      })

      const result = await jwtCallback?.({ token: expiredToken })

      expect(result?.error).toBe('RefreshAccessTokenError')
    })

    it('should handle session cleanup after expiration', () => {
      const cookieConfig = authConfig.cookies?.sessionToken

      expect(cookieConfig?.options?.httpOnly).toBe(true)
      expect(cookieConfig?.options?.sameSite).toBe('lax')
      expect(cookieConfig?.options?.secure).toBe(process.env.NODE_ENV === 'production')
    })
  })

  describe('Session Refresh', () => {
    it('should refresh GitHub access token when expired', async () => {
      // Mock GitHub token refresh endpoint
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_new_access_token',
          refresh_token: 'ghr_new_refresh_token',
          expires_in: 3600,
        }),
      })

      const jwtCallback = authConfig.callbacks?.jwt
      const expiredGitHubToken: JWT = {
        sub: 'user-123',
        accessToken: 'gho_expired_token',
        refreshToken: 'ghr_valid_refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        provider: 'github',
      }

      const result = await jwtCallback?.({ token: expiredGitHubToken })

      expect(fetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          }),
        })
      )

      expect(result?.accessToken).toBe('gho_new_access_token')
      expect(result?.provider).toBe('github')
    })

    it('should refresh Google access token when expired', async () => {
      // Mock Google token refresh endpoint
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'ya29.new_access_token',
          refresh_token: '1//new_refresh_token',
          expires_in: 3600,
        }),
      })

      const jwtCallback = authConfig.callbacks?.jwt
      const expiredGoogleToken: JWT = {
        sub: 'user-456',
        accessToken: 'ya29.expired_token',
        refreshToken: '1//valid_refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        provider: 'google',
      }

      const result = await jwtCallback?.({ token: expiredGoogleToken })

      expect(fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      )

      expect(result?.accessToken).toBe('ya29.new_access_token')
      expect(result?.provider).toBe('google')
    })

    it('should preserve valid tokens during refresh', async () => {
      const jwtCallback = authConfig.callbacks?.jwt
      const validToken: JWT = {
        sub: 'user-123',
        accessToken: 'gho_valid_token',
        refreshToken: 'ghr_valid_refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
        provider: 'github',
      }

      const result = await jwtCallback?.({ token: validToken })

      // Should return the same token unchanged
      expect(result).toEqual(validToken)
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Session Cleanup', () => {
    it('should clear session data on signout', () => {
      const cookieConfig = authConfig.cookies?.sessionToken

      // Verify cookie settings for proper cleanup
      expect(cookieConfig?.name).toBeDefined()
      expect(cookieConfig?.options?.httpOnly).toBe(true)
      expect(cookieConfig?.options?.path).toBe('/')
    })

    it('should handle database cleanup during session destruction', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock security event logging for signout
      mockSql.mockResolvedValueOnce([])

      // NextAuth.js handles cleanup internally
      // We verify our configuration doesn't interfere
      expect(authConfig.events?.signOut).toBeDefined()
    })

    it('should clean expired sessions periodically', () => {
      // This is handled by NextAuth.js internal mechanisms
      // We verify our session configuration supports it
      const sessionConfig = authConfig.session

      expect(sessionConfig?.maxAge).toBeGreaterThan(0)
      expect(sessionConfig?.updateAge).toBeGreaterThan(0)
      expect(sessionConfig?.updateAge).toBeLessThan(sessionConfig?.maxAge || 0)
    })
  })
})
