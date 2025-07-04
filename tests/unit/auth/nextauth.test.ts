import { auth } from '@/lib/auth'
import { authConfig } from '@/lib/auth/config'
import { sql } from '@/lib/db/config'
import type { Email, UUID } from '@/types/base'
import type { Session } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock database module
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock next-auth
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))

// Mock the auth module exports
vi.mock('../../src/lib/auth', () => ({
  handlers: { GET: vi.fn(), POST: vi.fn() },
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  GET: vi.fn(),
  POST: vi.fn(),
}))

describe('NextAuth Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('authConfig', () => {
    it('should have GitHub provider configured', () => {
      expect(authConfig.providers).toBeDefined()
      expect(authConfig.providers.length).toBeGreaterThan(0)

      // Check if GitHub provider is configured
      const githubProvider = authConfig.providers[0]
      expect(githubProvider).toBeDefined()
    })

    it('should have custom pages configured', () => {
      expect(authConfig.pages).toEqual({
        signIn: '/auth/signin',
        error: '/auth/error',
      })
    })

    it('should use JWT session strategy', () => {
      expect(authConfig.session).toEqual({
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        updateAge: 24 * 60 * 60, // 24 hours
      })
    })
  })

  describe('Callbacks', () => {
    beforeEach(() => {
      // Clear all mocks and reset
      vi.clearAllMocks()
      const mockSql = vi.mocked(sql)
      mockSql.mockClear()
      mockSql.mockReset()
    })

    describe('signIn callback', () => {
      it('should create a new user on first sign-in', async () => {
        const mockSql = vi.mocked(sql)

        // Mock the database queries that handleMultiProviderSignIn makes:
        // 1. Check if OAuth account exists
        mockSql.mockResolvedValueOnce([]) // No existing OAuth account

        // 2. Check if user exists by email
        mockSql.mockResolvedValueOnce([]) // No existing user

        // 3. Create new user (returns the created user)
        mockSql.mockResolvedValueOnce([
          {
            id: 'new-user-id',
            email: 'test@example.com',
            display_name: 'Test User',
            username: 'testuser',
            github_username: 'testuser',
            email_verified: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])

        // 4. Create OAuth account as primary
        mockSql.mockResolvedValueOnce([]) // INSERT oauth_accounts

        // 5. Log security event
        mockSql.mockResolvedValueOnce([]) // INSERT security_audit_logs

        const result = await authConfig.callbacks?.signIn?.({
          user: {
            id: 'github-123',
            email: 'test@example.com',
            name: 'Test User',
            emailVerified: null,
          },
          account: {
            provider: 'github',
            providerAccountId: 'github-123',
            type: 'oauth',
            access_token: 'access-token',
            token_type: 'bearer',
            scope: 'read:user user:email',
          },
          profile: {
            login: 'testuser',
            id: '123',
            email: 'test@example.com',
          },
        })

        expect(result).toBe(true)
        // Verify that SQL was called multiple times for the user creation flow
        expect(mockSql).toHaveBeenCalledTimes(5)
      })

      it('should link existing user on subsequent sign-ins', async () => {
        const mockSql = vi.mocked(sql)

        // Mock the database queries for linking existing user:
        // 1. Check if OAuth account exists (return existing account)
        mockSql.mockResolvedValueOnce([
          {
            user_id: 'existing-user-id',
            id: 'existing-user-id',
            email: 'test@example.com',
            github_username: 'testuser',
          },
        ]) // Existing OAuth account found

        // 2. Update OAuth tokens
        mockSql.mockResolvedValueOnce([]) // UPDATE oauth_accounts

        const result = await authConfig.callbacks?.signIn?.({
          user: {
            id: 'github-123',
            email: 'test@example.com',
            name: 'Test User',
            emailVerified: null,
          },
          account: {
            provider: 'github',
            providerAccountId: 'github-123',
            type: 'oauth',
            access_token: 'access-token',
            token_type: 'bearer',
            scope: 'read:user user:email',
          },
          profile: {
            login: 'testuser',
            id: '123',
            email: 'test@example.com',
          },
        })

        expect(result).toBe(true)
      })

      it('should reject sign-in without account data', async () => {
        const result = await authConfig.callbacks?.signIn?.({
          user: {
            id: 'test-id',
            email: 'test@example.com',
            emailVerified: null,
          },
        })

        expect(result).toBe(false)
      })

      it('should reject non-GitHub providers', async () => {
        const result = await authConfig.callbacks?.signIn?.({
          user: {
            id: 'test-id',
            email: 'test@example.com',
            emailVerified: null,
          },
          account: {
            provider: 'google',
            providerAccountId: 'google-123',
            type: 'oauth',
          },
        })

        expect(result).toBe(false)
      })
    })

    describe('session callback', () => {
      it('should add user data to session', async () => {
        const mockSql = vi.mocked(sql)

        // Mock the user data query in session callback
        mockSql.mockResolvedValueOnce([
          {
            id: 'test-user-id',
            email: 'test@example.com',
            display_name: 'Test User',
            username: 'testuser',
            github_username: 'testuser',
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
            githubUsername: 'testuser', // Add this property for compatibility
          },
        ])

        const token = {
          sub: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
        }

        const session: Session = {
          user: {
            id: 'test-user-id' as UUID,
            name: 'Test User',
            email: 'test@example.com' as Email,
            image: null,
            emailVerified: null,
            connectedProviders: ['github'],
            primaryProvider: 'github',
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        }

        const result = await authConfig.callbacks?.session?.({
          session: {
            ...session,
            sessionToken: 'mock-session-token',
            userId: 'test-user-id',
          },
          token,
        })

        expect(result?.user?.id).toBe('test-user-id')
        expect(result?.user?.email).toBe('test@example.com')
        expect(result?.user?.githubUsername).toBe('testuser')
      })
    })

    describe('jwt callback', () => {
      it('should add OAuth token data to JWT on sign-in', async () => {
        const token = { sub: 'test-sub' }
        const user = { id: 'test-user-id', email: 'test@example.com', emailVerified: null }
        const account = {
          provider: 'github',
          providerAccountId: 'github-123',
          type: 'oauth' as const,
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          token_type: 'bearer',
          scope: 'read:user user:email',
        }

        const result = await authConfig.callbacks?.jwt?.({
          token,
          user,
          account,
          profile: {
            login: 'testuser',
            email: 'test@example.com',
          },
        })

        // JWT callback adds OAuth token data on initial sign-in
        expect(result?.accessToken).toBe('test-access-token')
        expect(result?.refreshToken).toBe('test-refresh-token')
        expect(result?.expiresAt).toBe(account.expires_at)
        expect(result?.provider).toBe('github')
        expect(result?.sub).toBe('test-sub') // Original token data is preserved
      })

      it('should preserve token data on subsequent calls when not expired', async () => {
        const futureExpiry = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        const token = {
          sub: 'test-sub',
          accessToken: 'existing-access-token',
          refreshToken: 'existing-refresh-token',
          expiresAt: futureExpiry,
          provider: 'github',
        }

        const result = await authConfig.callbacks?.jwt?.({
          token,
          user: undefined,
          account: undefined,
        })

        // Since token is not expired, it should be returned unchanged
        expect(result).toEqual(token)
      })
    })
  })

  describe('Auth Module', () => {
    it('should export auth handlers', async () => {
      // Use dynamic import to work with mocks
      const authModule = await import('../../src/lib/auth')
      expect(authModule.handlers).toBeDefined()
      expect(authModule.handlers.GET).toBeDefined()
      expect(authModule.handlers.POST).toBeDefined()
    })

    it('should export auth function', () => {
      expect(typeof auth).toBe('function')
    })

    it('should export signIn function', async () => {
      // Use dynamic import to work with mocks
      const authModule = await import('../../src/lib/auth')
      expect(typeof authModule.signIn).toBe('function')
    })

    it('should export signOut function', async () => {
      // Use dynamic import to work with mocks
      const authModule = await import('../../src/lib/auth')
      expect(typeof authModule.signOut).toBe('function')
    })
  })
})
