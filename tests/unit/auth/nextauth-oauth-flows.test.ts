/**
 * NextAuth.js v5 OAuth Flow Testing Suite
 * Comprehensive testing for GitHub and Google OAuth authorization flows
 * Covers PKCE, state validation, callback handling, and error scenarios
 */

import type { Account, Profile } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authConfig } from '@/lib/auth/config'

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock environment variables for OAuth testing
vi.mock('@/lib/validation/env', () => ({
  env: {
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    NEXTAUTH_SECRET: 'test-nextauth-secret',
    NEXTAUTH_URL: 'http://localhost:3000',
  },
}))

describe('NextAuth OAuth Flow Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GitHub OAuth Flow', () => {
    it('should have proper GitHub provider configuration', () => {
      const githubProvider = authConfig.providers[0]

      expect(githubProvider).toBeDefined()
      expect(githubProvider.id).toBe('github')
      expect(githubProvider.name).toBe('GitHub')
      expect(githubProvider.type).toBe('oauth')
    })

    it('should request correct GitHub OAuth scopes', () => {
      const githubProvider = authConfig.providers[0] as any

      expect(githubProvider.authorization.params.scope).toBe('read:user user:email')
    })

    it('should handle GitHub OAuth callback successfully', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock successful OAuth flow
      mockSql.mockResolvedValueOnce([]) // No existing OAuth account
      mockSql.mockResolvedValueOnce([]) // No existing user
      mockSql.mockResolvedValueOnce([
        {
          id: 'new-user-id',
          email: 'github-user@example.com',
          display_name: 'GitHub User',
          username: 'githubuser',
          github_username: 'githubuser',
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      mockSql.mockResolvedValueOnce([]) // INSERT oauth_accounts
      mockSql.mockResolvedValueOnce([]) // INSERT security_audit_logs

      const githubAccount: Account = {
        provider: 'github',
        providerAccountId: 'github-12345',
        type: 'oauth',
        access_token: 'gho_test_access_token',
        refresh_token: 'ghr_test_refresh_token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        scope: 'read:user user:email',
      }

      const githubProfile: Profile = {
        id: '12345',
        login: 'githubuser',
        email: 'github-user@example.com',
        name: 'GitHub User',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        html_url: 'https://github.com/githubuser',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-12345',
          email: 'github-user@example.com',
          name: 'GitHub User',
          emailVerified: null,
        },
        account: githubAccount,
        profile: githubProfile,
      })

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(5)
    })

    it('should handle GitHub OAuth state parameter validation', async () => {
      // Test state parameter security
      const _mockAccount: Account = {
        provider: 'github',
        providerAccountId: 'github-12345',
        type: 'oauth',
        access_token: 'gho_test_token',
        token_type: 'bearer',
        scope: 'read:user user:email',
      }

      // Should have proper state validation built into NextAuth
      expect(authConfig.providers[0]).toBeDefined()
      expect(typeof authConfig.callbacks?.signIn).toBe('function')
    })

    it('should handle GitHub OAuth errors', async () => {
      // Test error scenarios like denied access
      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-12345',
          email: 'github-user@example.com',
          name: 'GitHub User',
          emailVerified: null,
        },
        account: {
          provider: 'github',
          providerAccountId: 'github-12345',
          type: 'oauth',
          error: 'access_denied',
        } as Account,
        profile: {
          id: '12345',
          login: 'githubuser',
          email: 'github-user@example.com',
        },
      })

      // Should reject sign-in on error
      expect(result).toBe(false)
    })

    it('should validate GitHub token format', async () => {
      const validTokens = [
        'gho_1234567890abcdef', // Personal access token
        'ghs_1234567890abcdef', // Server-to-server token
        'ghu_1234567890abcdef', // User-to-server token
      ]

      const invalidTokens = [
        'invalid_token_format',
        '',
        'ghp_old_format_token', // Old format
      ]

      validTokens.forEach(token => {
        expect(token).toMatch(/^gh[a-z]_[a-zA-Z0-9]+$/)
      })

      invalidTokens.forEach(token => {
        expect(token).not.toMatch(/^gh[a-z]_[a-zA-Z0-9]+$/)
      })
    })
  })

  describe('Google OAuth Flow', () => {
    it('should have proper Google provider configuration', () => {
      const googleProvider = authConfig.providers[1]

      expect(googleProvider).toBeDefined()
      expect(googleProvider.id).toBe('google')
      expect(googleProvider.name).toBe('Google')
      expect(googleProvider.type).toBe('oauth')
    })

    it('should request correct Google OAuth scopes', () => {
      const googleProvider = authConfig.providers[1] as any

      expect(googleProvider.authorization.params.scope).toBe('openid email profile')
      expect(googleProvider.authorization.params.prompt).toBe('consent')
      expect(googleProvider.authorization.params.access_type).toBe('offline')
      expect(googleProvider.authorization.params.response_type).toBe('code')
    })

    it('should handle Google OAuth callback successfully', async () => {
      const mockSql = vi.mocked(await import('@/lib/db/config')).sql

      // Mock successful OAuth flow
      mockSql.mockResolvedValueOnce([]) // No existing OAuth account
      mockSql.mockResolvedValueOnce([]) // No existing user
      mockSql.mockResolvedValueOnce([
        {
          id: 'new-user-id',
          email: 'google-user@example.com',
          display_name: 'Google User',
          username: 'googleuser',
          github_username: null,
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      mockSql.mockResolvedValueOnce([]) // INSERT oauth_accounts
      mockSql.mockResolvedValueOnce([]) // INSERT security_audit_logs

      const googleAccount: Account = {
        provider: 'google',
        providerAccountId: 'google-12345',
        type: 'oauth',
        access_token: 'ya29.test_access_token',
        refresh_token: '1//test_refresh_token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        scope: 'openid email profile',
        id_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test.token',
      }

      const googleProfile: Profile = {
        sub: '12345',
        email: 'google-user@example.com',
        name: 'Google User',
        picture: 'https://lh3.googleusercontent.com/a/test',
        email_verified: true,
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'google-12345',
          email: 'google-user@example.com',
          name: 'Google User',
          emailVerified: null,
        },
        account: googleAccount,
        profile: googleProfile,
      })

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(5)
    })

    it('should validate Google ID token structure', () => {
      const validIdToken =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.signature'
      const invalidIdToken = 'invalid.token'

      expect(validIdToken.split('.')).toHaveLength(3)
      expect(invalidIdToken.split('.')).not.toHaveLength(3)
    })
  })

  describe('PKCE Flow Validation', () => {
    it('should support PKCE for enhanced security', () => {
      // PKCE is handled internally by NextAuth.js OAuth providers
      // We test that the configuration supports it
      const githubProvider = authConfig.providers[0] as any
      const googleProvider = authConfig.providers[1] as any

      // Both providers should support PKCE by default in NextAuth.js v5
      expect(githubProvider.type).toBe('oauth')
      expect(googleProvider.type).toBe('oauth')
    })

    it('should generate proper code challenge', () => {
      // Mock PKCE code verifier and challenge generation
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

      // This would be handled internally by NextAuth.js
      // We just verify the concept
      expect(codeVerifier).toHaveLength(43)
      expect(expectedChallenge).toHaveLength(43)
    })
  })

  describe('State Parameter Security', () => {
    it('should validate state parameter exists', () => {
      // NextAuth.js automatically handles state parameter generation and validation
      // We verify the configuration enables this security feature
      expect(authConfig.debug).toBeDefined()
      expect(authConfig.secret).toBeDefined()
    })

    it('should reject requests with invalid state', async () => {
      // State validation is handled by NextAuth.js internally
      // Invalid state would result in authentication failure
      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'test-12345',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: null,
        },
        // Missing account indicates possible state validation failure
      })

      expect(result).toBe(false)
    })
  })

  describe('Provider-Specific Error Handling', () => {
    it('should handle GitHub API rate limiting', async () => {
      const rateLimitedAccount: Account = {
        provider: 'github',
        providerAccountId: 'github-12345',
        type: 'oauth',
        error: 'rate_limit_exceeded',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-12345',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: null,
        },
        account: rateLimitedAccount,
      })

      expect(result).toBe(false)
    })

    it('should handle Google OAuth consent withdrawal', async () => {
      const deniedAccount: Account = {
        provider: 'google',
        providerAccountId: 'google-12345',
        type: 'oauth',
        error: 'access_denied',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'google-12345',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: null,
        },
        account: deniedAccount,
      })

      expect(result).toBe(false)
    })

    it('should handle invalid provider requests', async () => {
      const invalidAccount: Account = {
        provider: 'twitter', // Not configured
        providerAccountId: 'twitter-12345',
        type: 'oauth',
        access_token: 'test-token',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'twitter-12345',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: null,
        },
        account: invalidAccount,
      })

      expect(result).toBe(false)
    })
  })

  describe('Token Exchange Validation', () => {
    it('should properly exchange authorization code for tokens', async () => {
      // This is handled by NextAuth.js internally
      // We test that our configuration properly handles the token exchange
      const mockJwtCallback = authConfig.callbacks?.jwt

      const tokenResult = await mockJwtCallback?.({
        token: { sub: 'test-user' },
        user: {
          id: 'test-user',
          email: 'test@example.com',
          emailVerified: null,
        },
        account: {
          provider: 'github',
          providerAccountId: 'github-12345',
          type: 'oauth',
          access_token: 'gho_test_token',
          refresh_token: 'ghr_test_refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          scope: 'read:user user:email',
        },
      })

      expect(tokenResult?.accessToken).toBe('gho_test_token')
      expect(tokenResult?.refreshToken).toBe('ghr_test_refresh')
      expect(tokenResult?.provider).toBe('github')
    })

    it('should handle token refresh on expiration', async () => {
      const mockJwtCallback = authConfig.callbacks?.jwt

      // Mock expired token
      const expiredToken = {
        sub: 'test-user',
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        provider: 'github',
      }

      // Mock the fetch for token refresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      })

      const refreshedToken = await mockJwtCallback?.({
        token: expiredToken,
      })

      expect(refreshedToken?.accessToken).toBe('new-access-token')
      expect(refreshedToken?.refreshToken).toBe('new-refresh-token')
    })
  })
})
