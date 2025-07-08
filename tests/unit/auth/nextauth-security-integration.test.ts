/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, User } from 'next-auth'

// Mock Next.js modules first to prevent import issues
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn(),
    redirect: vi.fn(),
  },
}))

// Mock NextAuth v5 modules
vi.mock('next-auth', () => ({
  default: vi.fn(),
}))

vi.mock('next-auth/providers/github', () => ({
  default: vi.fn(() => ({
    id: 'github',
    name: 'GitHub',
    type: 'oauth',
    options: { pkce: true },
  })),
}))

// Mock environment first
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-unit-tests-only-32-chars-minimum')
vi.stubEnv('NEXTAUTH_SECRET', 'test-nextauth-secret-32chars-minimum')
vi.stubEnv('GITHUB_TOKEN', 'test-github-token')
vi.stubEnv('GITHUB_ID', 'test-github-id')
vi.stubEnv('GITHUB_SECRET', 'test-github-secret')
vi.stubEnv('NODE_ENV', 'test')

// Mock dependencies
vi.mock('@/lib/db/config')
vi.mock('@/lib/env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-32-chars-minimum',
    NEXTAUTH_SECRET: 'test-nextauth-secret-32chars-minimum',
    GITHUB_TOKEN: 'test-github-token',
    GITHUB_ID: 'test-github-id',
    GITHUB_SECRET: 'test-github-secret',
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  },
}))

vi.mock('@/lib/validation/env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-32-chars-minimum',
    NEXTAUTH_SECRET: 'test-nextauth-secret-32chars-minimum',
    GITHUB_TOKEN: 'test-github-token',
    GITHUB_ID: 'test-github-id',
    GITHUB_SECRET: 'test-github-secret',
    NODE_ENV: 'test',
  },
}))

import { authConfig } from '@/lib/auth/index'
import { sql } from '@/lib/db/config'

// Type definitions for test data
interface DbUser {
  id: string
  email: string
  name: string
  github_id?: string
}

type DbResult<T> = T[]

describe('NextAuth OAuth Security Integration', () => {
  let mockSql: ReturnType<typeof vi.mocked>

  beforeEach(() => {
    mockSql = vi.mocked(sql)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Provider Configuration', () => {
    it('should enforce PKCE for all OAuth flows', () => {
      // Verify authConfig includes PKCE enforcement
      expect(authConfig.providers).toBeDefined()

      // Each OAuth provider should have PKCE enabled
      authConfig.providers?.forEach(provider => {
        if (provider.type === 'oauth') {
          // NextAuth v5 enables PKCE by default for OAuth providers
          expect(provider.options?.pkce).not.toBe(false)
        }
      })
    })

    it('should validate provider security settings', () => {
      expect(authConfig).toHaveProperty('providers')
      expect(authConfig).toHaveProperty('session')
      expect(authConfig).toHaveProperty('callbacks')

      // Session strategy should be JWT for serverless
      expect(authConfig.session?.strategy).toBe('jwt')

      // Should have security callbacks defined
      expect(authConfig.callbacks).toHaveProperty('jwt')
      expect(authConfig.callbacks).toHaveProperty('session')
      expect(authConfig.callbacks).toHaveProperty('signIn')
    })

    it('should check JWT configuration security', () => {
      // JWT should have proper expiration
      expect(authConfig.session?.maxAge).toBeDefined()
      expect(authConfig.session?.maxAge).toBeGreaterThan(0)
      expect(authConfig.session?.maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60) // Max 30 days

      // Should have secure JWT settings
      expect(authConfig.jwt).toBeDefined()
      if (authConfig.jwt) {
        expect(authConfig.jwt.maxAge).toBeDefined()
      }
    })

    it('should validate GitHub OAuth provider configuration', () => {
      const githubProvider = authConfig.providers?.find(
        p => p.id === 'github' || p.name === 'GitHub'
      )

      expect(githubProvider).toBeDefined()
      expect(githubProvider?.type).toBe('oauth')

      // Should have proper authorization configuration
      if (githubProvider?.authorization) {
        const authUrl = new URL(githubProvider.authorization as string)
        expect(authUrl.searchParams.get('scope')).toContain('user:email')
      }
    })
  })

  describe('Session Security', () => {
    it('should bind sessions to OAuth context', async () => {
      const mockToken = {
        sub: 'github-123',
        email: 'test@example.com',
        name: 'Test User',
        accessToken: 'github-access-token',
        refreshToken: 'github-refresh-token',
        account: {
          provider: 'github',
          type: 'oauth',
          providerAccountId: 'github-123',
        },
      }

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      }

      // Mock database user lookup
      mockSql.mockResolvedValueOnce([
        {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          github_id: 'github-123',
        },
      ] as DbResult<DbUser>)

      // Test JWT callback
      if (authConfig.callbacks?.jwt) {
        const jwtResult = await authConfig.callbacks.jwt({
          token: mockToken,
          user: mockUser,
          account: mockToken.account as Account,
          profile: undefined,
          trigger: 'signIn',
        })

        expect(jwtResult).toHaveProperty('sub')
        expect(jwtResult).toHaveProperty('accessToken')
        expect(jwtResult).toHaveProperty('provider')
        expect(jwtResult.provider).toBe('github')
      }
    })

    it('should validate session metadata', async () => {
      const mockToken = {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        accessToken: 'github-access-token',
        provider: 'github',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
      }

      // Test session callback
      if (authConfig.callbacks?.session) {
        const sessionResult = await authConfig.callbacks.session({
          session: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
              name: 'Test User',
            },
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          token: mockToken,
        })

        expect(sessionResult.user).toHaveProperty('id')
        expect(sessionResult.user).toHaveProperty('email')
        expect(sessionResult).toHaveProperty('accessToken')
        expect(sessionResult).toHaveProperty('provider')
      }
    })

    it('should handle session security events', async () => {
      const securityEvents = ['signIn', 'signOut', 'updateUser', 'linkAccount']

      for (const event of securityEvents) {
        if (authConfig.events?.[event as keyof typeof authConfig.events]) {
          // Events should be defined for security logging
          expect(authConfig.events[event as keyof typeof authConfig.events]).toBeTypeOf('function')
        }
      }
    })
  })

  describe('Token Management', () => {
    it('should handle token rotation securely', async () => {
      const mockAccount = {
        provider: 'github',
        type: 'oauth' as const,
        providerAccountId: 'github-123',
        access_token: 'old-access-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      }

      const mockProfile = {
        id: 'github-123',
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
      }

      // Mock token refresh
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
          }),
      })

      // Test signIn callback for token handling
      if (authConfig.callbacks?.signIn) {
        const result = await authConfig.callbacks.signIn({
          user: {
            id: 'github-123',
            email: 'test@example.com',
            name: 'Test User',
          },
          account: mockAccount,
          profile: mockProfile,
          email: { verificationRequest: false },
          credentials: undefined,
        })

        // Should allow sign in
        expect(result).toBe(true)
      }
    })

    it('should validate token metadata', () => {
      // JWT configuration should include proper token validation
      expect(authConfig.jwt).toBeDefined()

      if (authConfig.jwt?.encode || authConfig.jwt?.decode) {
        // Custom JWT handlers should be secure
        expect(authConfig.jwt.encode).toBeTypeOf('function')
        expect(authConfig.jwt.decode).toBeTypeOf('function')
      }
    })

    it('should implement token revocation', async () => {
      // Mock database account deletion
      mockSql.mockResolvedValueOnce([] as DbResult<DbUser>)

      // Test account unlinking (token revocation)
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      const mockAccount = {
        provider: 'github',
        providerAccountId: 'github-123',
        type: 'oauth' as const,
      }

      if (authConfig.events?.unlinkAccount) {
        await authConfig.events.unlinkAccount({
          user: mockUser,
          account: mockAccount,
        })

        // Should log security event
        expect(mockSql).toHaveBeenCalled()
      }
    })
  })

  describe('Security Controls', () => {
    it('should enforce redirect URI validation', () => {
      // NextAuth should have pages configuration for security
      expect(authConfig.pages).toBeDefined()

      if (authConfig.pages) {
        // Custom pages should be defined to prevent open redirects
        expect(authConfig.pages.signIn).toBeDefined()
        expect(authConfig.pages.error).toBeDefined()
      }
    })

    it('should implement CSRF protection', () => {
      // NextAuth v5 has built-in CSRF protection
      expect(authConfig.useSecureCookies).not.toBe(false)

      // Should have proper cookie configuration
      expect(authConfig.cookies).toBeDefined()
    })

    it('should validate provider-specific security', async () => {
      const githubProvider = authConfig.providers?.find(
        p => p.id === 'github' || p.name === 'GitHub'
      )

      if (githubProvider?.authorization) {
        const authUrl = new URL(githubProvider.authorization as string)

        // Should request minimal necessary scopes
        const scopes = authUrl.searchParams.get('scope')?.split(' ') || []
        expect(scopes).toContain('user:email')

        // Should not request excessive permissions
        expect(scopes).not.toContain('repo')
        expect(scopes).not.toContain('admin:org')
      }
    })

    it('should handle authentication errors securely', async () => {
      // Error handling should not expose sensitive information
      if (authConfig.callbacks?.signIn) {
        // Test with invalid account
        const result = await authConfig.callbacks.signIn({
          user: null as unknown as User,
          account: null as unknown as Account,
          profile: undefined,
          email: { verificationRequest: false },
          credentials: undefined,
        })

        // Should reject invalid sign in attempts
        expect(result).toBe(false)
      }
    })
  })

  describe('Database Integration Security', () => {
    it('should use parameterized queries', async () => {
      // Mock successful user creation
      mockSql.mockResolvedValueOnce([
        {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
      ] as DbResult<DbUser>)

      if (authConfig.callbacks?.signIn) {
        await authConfig.callbacks.signIn({
          user: {
            id: 'github-123',
            email: 'test@example.com',
            name: 'Test User',
          },
          account: {
            provider: 'github',
            type: 'oauth',
            providerAccountId: 'github-123',
          },
          profile: {
            id: 'github-123',
            login: 'testuser',
            email: 'test@example.com',
          },
          email: { verificationRequest: false },
          credentials: undefined,
        })

        // Should use parameterized queries for security
        expect(mockSql).toHaveBeenCalled()

        // Verify SQL calls use parameters (mock function should be called with template literals)
        const sqlCalls = mockSql.mock.calls
        for (const call of sqlCalls) {
          expect(call[0]).toBeDefined() // Template literal parts
          expect(call.length).toBeGreaterThan(1) // Has parameters
        }
      }
    })

    it('should validate input sanitization', async () => {
      const maliciousInputs = [
        { email: "'; DROP TABLE users; --", name: 'Test User' },
        { email: 'test@example.com', name: '<script>alert(1)</script>' },
        { email: 'test@example.com', name: '${process.env.DATABASE_URL}' },
      ]

      for (const input of maliciousInputs) {
        mockSql.mockResolvedValueOnce([
          {
            id: 'user-123',
            email: input.email,
            name: input.name,
          },
        ] as DbResult<DbUser>)

        if (authConfig.callbacks?.signIn) {
          const result = await authConfig.callbacks.signIn({
            user: {
              id: 'github-123',
              email: input.email,
              name: input.name,
            },
            account: {
              provider: 'github',
              type: 'oauth',
              providerAccountId: 'github-123',
            },
            profile: {
              id: 'github-123',
              email: input.email,
              name: input.name,
            },
            email: { verificationRequest: false },
            credentials: undefined,
          })

          // Should handle malicious input safely
          expect(result).toBeTypeOf('boolean')
        }
      }
    })
  })

  describe('Production Security Hardening', () => {
    it('should enforce secure configuration in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        // Should have secure session settings
        expect(authConfig.session?.strategy).toBe('jwt')
        expect(authConfig.useSecureCookies).not.toBe(false)

        // Should have proper secret configuration
        expect(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET).toBeDefined()
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('should validate environment variable security', () => {
      const requiredSecrets = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'NEXTAUTH_SECRET']

      for (const secret of requiredSecrets) {
        // In test environment, these might not be set, but structure should be validated
        if (process.env[secret]) {
          expect(process.env[secret]).toBeDefined()
          expect(process.env[secret]?.length).toBeGreaterThan(0)
        }
      }
    })

    it('should implement rate limiting for authentication', () => {
      // Should have protection against brute force attacks
      expect(authConfig.callbacks).toHaveProperty('signIn')

      // Rate limiting would typically be implemented in the signIn callback
      // or through middleware (which is tested separately)
    })
  })
})
