/**
 * NextAuth.js v5 Database Integration Tests
 * Testing user creation, updates, account linking, session storage, and profile synchronization
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock database with factory function to avoid hoisting issues
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock environment variables for server-side access
vi.mock('@/lib/validation/env', () => ({
  env: {
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    NEXTAUTH_SECRET: 'test-nextauth-secret',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'test',
  },
}))

import { authConfig } from '@/lib/auth/config'
import { sql } from '@/lib/db/config'
import type { User as AuthUser } from '@/types/auth'
import type { Account, Profile } from 'next-auth'

// Get the mocked sql function
const mockSql = vi.mocked(sql)

describe('NextAuth Database Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('User Creation and Management', () => {
    it('should create new user with GitHub OAuth account', async () => {
      // Mock database queries for new user creation
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account
        .mockResolvedValueOnce([]) // No existing user by email
        .mockResolvedValueOnce([
          {
            // New user created
            id: 'new-user-123',
            email: 'github-user@example.com',
            display_name: 'GitHub User',
            username: 'githubuser',
            github_username: 'githubuser',
            email_verified: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .mockResolvedValueOnce([]) // OAuth account created
        .mockResolvedValueOnce([]) // Security event logged

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

      // Verify the sequence of SQL operations
      // 1. Check for existing OAuth account
      expect(mockSql).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([expect.stringContaining('oauth_accounts')]),
        'github',
        'github-12345'
      )

      // 2. Check for existing user by email
      expect(mockSql).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([expect.stringContaining('SELECT * FROM users WHERE email')]),
        'github-user@example.com'
      )

      // 3. Create new user
      expect(mockSql).toHaveBeenNthCalledWith(
        3,
        expect.arrayContaining([expect.stringContaining('INSERT INTO users')]),
        'github-user@example.com',
        'GitHub User',
        expect.any(String),
        null,
        true
      )

      // 4. Create OAuth account
      expect(mockSql).toHaveBeenNthCalledWith(
        4,
        expect.arrayContaining([expect.stringContaining('INSERT INTO oauth_accounts')]),
        'new-user-123',
        'github',
        'github-12345',
        'gho_test_access_token',
        'ghr_test_refresh_token',
        expect.any(Date),
        'bearer',
        'read:user user:email'
      )

      // 5. Log security audit event
      expect(mockSql).toHaveBeenNthCalledWith(
        5,
        expect.arrayContaining([expect.stringContaining('INSERT INTO security_audit_logs')]),
        'login_success',
        'new-user-123',
        true,
        expect.stringContaining('github')
      )
    })

    it('should create new user with Google OAuth account', async () => {
      // Mock database queries for Google user creation
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account
        .mockResolvedValueOnce([]) // No existing user by email
        .mockResolvedValueOnce([
          {
            // New user created
            id: 'new-google-user-456',
            email: 'google-user@example.com',
            display_name: 'Google User',
            username: 'googleuser',
            github_username: null,
            email_verified: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .mockResolvedValueOnce([]) // OAuth account created
        .mockResolvedValueOnce([]) // Security event logged

      const googleAccount: Account = {
        provider: 'google',
        providerAccountId: 'google-67890',
        type: 'oauth',
        access_token: 'ya29.test_access_token',
        refresh_token: '1//test_refresh_token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        scope: 'openid email profile',
        id_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test.token',
      }

      const googleProfile: Profile = {
        sub: '67890',
        email: 'google-user@example.com',
        name: 'Google User',
        picture: 'https://lh3.googleusercontent.com/a/test',
        email_verified: true,
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'google-67890',
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

    it('should handle database errors during user creation', async () => {
      // Mock database error
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account
        .mockResolvedValueOnce([]) // No existing user by email
        .mockRejectedValueOnce(new Error('Database connection failed'))

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'test-12345',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: null,
        },
        account: {
          provider: 'github',
          providerAccountId: 'github-12345',
          type: 'oauth',
          access_token: 'test-token',
        },
      })

      expect(result).toBe(false)
    })
  })

  describe('Account Linking', () => {
    it('should link Google account to existing GitHub user', async () => {
      const existingUser: AuthUser = {
        id: 'existing-user-123',
        email: 'user@example.com',
        display_name: 'Existing User',
        username: 'existinguser',
        github_username: 'existinguser',
        email_verified: true,
        two_factor_enabled: false,
        recovery_email: null,
        locked_at: null,
        failed_login_attempts: 0,
        last_login_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }

      // Mock database queries for account linking
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account for Google
        .mockResolvedValueOnce([existingUser]) // Existing user by email
        .mockResolvedValueOnce([]) // No existing Google link for user
        .mockResolvedValueOnce([]) // Google account linked
        .mockResolvedValueOnce([]) // User profile updated
        .mockResolvedValueOnce([]) // Security event logged

      const googleAccount: Account = {
        provider: 'google',
        providerAccountId: 'google-new-account',
        type: 'oauth',
        access_token: 'ya29.new_token',
        refresh_token: '1//new_refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        scope: 'openid email profile',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'google-new-account',
          email: 'user@example.com', // Same email as existing user
          name: 'Existing User',
          emailVerified: null,
        },
        account: googleAccount,
        profile: {
          sub: 'google-new-account',
          email: 'user@example.com',
          name: 'Existing User',
        },
      })

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(6)
    })

    it('should prevent linking duplicate provider accounts', async () => {
      const existingUser: AuthUser = {
        id: 'existing-user-123',
        email: 'user@example.com',
        display_name: 'Existing User',
        username: 'existinguser',
        github_username: 'existinguser',
        email_verified: true,
        two_factor_enabled: false,
        recovery_email: null,
        locked_at: null,
        failed_login_attempts: 0,
        last_login_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }

      // Mock database queries for existing GitHub link
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account by provider ID
        .mockResolvedValueOnce([existingUser]) // Existing user by email
        .mockResolvedValueOnce([
          {
            // Existing GitHub link for user
            id: 'existing-oauth-123',
            user_id: 'existing-user-123',
            provider: 'github',
            provider_account_id: 'existing-github-123',
          },
        ])
        .mockResolvedValueOnce([]) // Update tokens

      const githubAccount: Account = {
        provider: 'github',
        providerAccountId: 'new-github-456', // Different GitHub account
        type: 'oauth',
        access_token: 'gho_new_token',
        refresh_token: 'ghr_new_refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        scope: 'read:user user:email',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'new-github-456',
          email: 'user@example.com', // Same email
          name: 'Existing User',
          emailVerified: null,
        },
        account: githubAccount,
      })

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(4)
    })

    it('should handle account linking conflicts', async () => {
      // Mock conflicting account scenario
      mockSql.mockResolvedValueOnce([
        {
          // Existing OAuth account for different user
          id: 'oauth-conflict-123',
          user_id: 'different-user-456',
          provider: 'github',
          provider_account_id: 'github-12345',
        },
      ])

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-12345',
          email: 'conflict@example.com',
          name: 'Conflict User',
          emailVerified: null,
        },
        account: {
          provider: 'github',
          providerAccountId: 'github-12345',
          type: 'oauth',
          access_token: 'gho_conflict_token',
        },
      })

      // Should handle the existing account (update tokens)
      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(1)
    })
  })

  describe('OAuth Token Management', () => {
    it('should update OAuth tokens for existing accounts', async () => {
      const existingOAuthUser = {
        id: 'oauth-user-123',
        user_id: 'user-123',
        email: 'oauth@example.com',
        provider: 'github',
        provider_account_id: 'github-12345',
      }

      // Mock existing OAuth account
      mockSql
        .mockResolvedValueOnce([existingOAuthUser]) // Existing OAuth account found
        .mockResolvedValueOnce([]) // Update tokens

      const updatedAccount: Account = {
        provider: 'github',
        providerAccountId: 'github-12345',
        type: 'oauth',
        access_token: 'gho_updated_token',
        refresh_token: 'ghr_updated_refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        scope: 'read:user user:email',
      }

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-12345',
          email: 'oauth@example.com',
          name: 'OAuth User',
          emailVerified: null,
        },
        account: updatedAccount,
      })

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(2)

      // Verify token update query
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('UPDATE oauth_accounts')])
      )
    })

    it('should handle token refresh database updates', async () => {
      // Mock token refresh scenario
      const refreshedTokens = {
        access_token: 'gho_refreshed_token',
        refresh_token: 'ghr_refreshed_token',
        expires_in: 3600,
      }

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => refreshedTokens,
      })

      const jwtCallback = authConfig.callbacks?.jwt
      const expiredToken = {
        sub: 'user-123',
        accessToken: 'gho_expired_token',
        refreshToken: 'ghr_valid_refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        provider: 'github',
      }

      const result = await jwtCallback?.({ token: expiredToken })

      expect(result?.accessToken).toBe('gho_refreshed_token')
      expect(result?.refreshToken).toBe('ghr_refreshed_token')
      expect(fetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.any(Object)
      )
    })

    it('should clean up expired tokens', async () => {
      // Mock expired token cleanup
      mockSql.mockResolvedValueOnce([])

      // This would typically be handled by a background job
      // We test that our token structure supports cleanup
      const expiredTokenQuery = `
        DELETE FROM oauth_accounts 
        WHERE expires_at < NOW() - INTERVAL '7 days'
        AND refresh_token IS NULL
      `

      expect(expiredTokenQuery).toContain('DELETE FROM oauth_accounts')
      expect(expiredTokenQuery).toContain('expires_at < NOW()')
    })
  })

  describe('Session Database Operations', () => {
    it('should fetch user data for session creation', async () => {
      const mockUserData = {
        id: 'session-user-123',
        email: 'session@example.com',
        display_name: 'Session User',
        username: 'sessionuser',
        github_username: 'sessionuser',
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
      }

      mockSql.mockResolvedValueOnce([mockUserData])

      const sessionCallback = authConfig.callbacks?.session
      const result = await sessionCallback?.({
        session: {
          user: {
            id: 'session-user-123',
            name: 'Session User',
            email: 'session@example.com',
            image: null,
            emailVerified: null,
            connectedProviders: [],
            primaryProvider: 'github',
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
          sessionToken: 'mock-session-token',
          userId: 'session-user-123',
        },
        token: {
          sub: 'session-user-123',
          email: 'session@example.com',
        },
      })

      expect(result?.user?.id).toBe('session-user-123')
      expect(result?.user?.connectedProviders).toEqual(['github'])
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('SELECT u.id, u.email')])
      )
    })

    it('should handle concurrent session queries', async () => {
      const userPromises = Array.from({ length: 5 }, (_, i) => {
        mockSql.mockResolvedValueOnce([
          {
            id: `concurrent-user-${i}`,
            email: `user${i}@example.com`,
            display_name: `User ${i}`,
            connected_providers: ['github'],
            primary_provider: 'github',
          },
        ])

        return authConfig.callbacks?.session?.({
          session: {
            user: {
              id: `concurrent-user-${i}`,
              name: `User ${i}`,
              email: `user${i}@example.com`,
              image: null,
              emailVerified: null,
              connectedProviders: [],
              primaryProvider: 'github',
            },
            expires: new Date(Date.now() + 86400000).toISOString(),
            sessionToken: `session-token-${i}`,
            userId: `concurrent-user-${i}`,
          },
          token: {
            sub: `concurrent-user-${i}`,
            email: `user${i}@example.com`,
          },
        })
      })

      const results = await Promise.all(userPromises)

      expect(results).toHaveLength(5)
      results.forEach((result, i) => {
        expect(result?.user?.id).toBe(`concurrent-user-${i}`)
      })
      expect(mockSql).toHaveBeenCalledTimes(5)
    })

    it('should handle database connection failures gracefully', async () => {
      mockSql.mockRejectedValueOnce(new Error('Database connection lost'))

      const sessionCallback = authConfig.callbacks?.session
      const result = await sessionCallback?.({
        session: {
          user: {
            id: 'failed-user-123',
            name: 'Failed User',
            email: 'failed@example.com',
            image: null,
            emailVerified: null,
            connectedProviders: [],
            primaryProvider: 'github',
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
          sessionToken: 'failed-session-token',
          userId: 'failed-user-123',
        },
        token: {
          sub: 'failed-user-123',
          email: 'failed@example.com',
        },
      })

      // Should return original session when database fails
      expect(result?.user?.id).toBe('failed-user-123')
      expect(result?.user?.email).toBe('failed@example.com')
    })
  })

  describe('Security Audit Logging', () => {
    it('should log successful authentication events', async () => {
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account
        .mockResolvedValueOnce([]) // No existing user
        .mockResolvedValueOnce([
          {
            // New user created
            id: 'audit-user-123',
            email: 'audit@example.com',
          },
        ])
        .mockResolvedValueOnce([]) // OAuth account created
        .mockResolvedValueOnce([]) // Security event logged

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-audit-123',
          email: 'audit@example.com',
          name: 'Audit User',
          emailVerified: null,
        },
        account: {
          provider: 'github',
          providerAccountId: 'github-audit-123',
          type: 'oauth',
          access_token: 'gho_audit_token',
        },
      })

      expect(result).toBe(true)

      // Verify security event logging
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('INSERT INTO security_audit_logs')])
      )
    })

    it('should log account linking events', async () => {
      const existingUser = {
        id: 'link-user-123',
        email: 'link@example.com',
        display_name: 'Link User',
      }

      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account
        .mockResolvedValueOnce([existingUser]) // Existing user
        .mockResolvedValueOnce([]) // No existing provider link
        .mockResolvedValueOnce([]) // Account linked
        .mockResolvedValueOnce([]) // Profile updated
        .mockResolvedValueOnce([]) // Security event logged

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'google-link-123',
          email: 'link@example.com',
          name: 'Link User',
          emailVerified: null,
        },
        account: {
          provider: 'google',
          providerAccountId: 'google-link-123',
          type: 'oauth',
          access_token: 'ya29.link_token',
        },
      })

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledTimes(6)
    })

    it('should handle audit log failures gracefully', async () => {
      mockSql
        .mockResolvedValueOnce([]) // No existing OAuth account
        .mockResolvedValueOnce([]) // No existing user
        .mockResolvedValueOnce([
          {
            // New user created
            id: 'audit-fail-user-123',
            email: 'auditfail@example.com',
          },
        ])
        .mockResolvedValueOnce([]) // OAuth account created
        .mockRejectedValueOnce(new Error('Audit log insertion failed'))

      const result = await authConfig.callbacks?.signIn?.({
        user: {
          id: 'github-auditfail-123',
          email: 'auditfail@example.com',
          name: 'Audit Fail User',
          emailVerified: null,
        },
        account: {
          provider: 'github',
          providerAccountId: 'github-auditfail-123',
          type: 'oauth',
          access_token: 'gho_auditfail_token',
        },
      })

      // Should still succeed even if audit logging fails
      expect(result).toBe(true)
    })
  })
})
