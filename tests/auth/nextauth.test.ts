import type { Session } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth'
import { authConfig } from '../../src/lib/auth/config'
import { sql } from '../../src/lib/db/config'
import type { Email, UUID } from '../../src/types/base'

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
      })
    })
  })

  describe('Callbacks', () => {
    beforeEach(() => {
      // Mock sql for database queries
      vi.mocked(sql).mockImplementation((strings: TemplateStringsArray, ..._values: unknown[]) => {
        const query = strings.join('')

        // Mock user lookup
        if (query.includes('SELECT * FROM users')) {
          return Promise.resolve([])
        }

        // Mock user creation
        if (query.includes('INSERT INTO users')) {
          return Promise.resolve([
            {
              id: 'test-user-id',
              email: 'test@example.com',
              github_username: 'testuser',
              email_verified: true,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ])
        }

        // Mock OAuth account creation
        if (query.includes('INSERT INTO oauth_accounts')) {
          return Promise.resolve([])
        }

        // Mock security audit log
        if (query.includes('INSERT INTO security_audit_logs')) {
          return Promise.resolve([])
        }

        return Promise.resolve([])
      })
    })

    describe('signIn callback', () => {
      it('should create a new user on first sign-in', async () => {
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
        expect(sql).toHaveBeenCalledWith(
          expect.any(Array),
          expect.stringContaining('testuser'),
          expect.stringContaining('test@example.com')
        )
      })

      it('should link existing user on subsequent sign-ins', async () => {
        // Mock existing user
        vi.mocked(sql).mockImplementationOnce(() =>
          Promise.resolve([
            {
              id: 'existing-user-id',
              email: 'test@example.com',
              github_username: 'testuser',
            },
          ])
        )

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
            connectedProviders: ['github'],
            primaryProvider: 'github',
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        }

        const result = await authConfig.callbacks?.session?.({
          session,
          token,
        })

        expect(result?.user?.id).toBe('test-user-id')
        expect(result?.user?.email).toBe('test@example.com')
        expect(result?.user?.githubUsername).toBe('testuser')
      })
    })

    describe('jwt callback', () => {
      it('should add user data to JWT on sign-in', async () => {
        const token = { sub: 'test-sub' }
        const user = { id: 'test-user-id' }
        const account = {
          provider: 'github',
          providerAccountId: 'github-123',
          type: 'oauth' as const,
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

        expect(result?.id).toBe('test-user-id')
        expect(result?.githubUsername).toBe('testuser')
        expect(result?.email).toBe('test@example.com')
      })

      it('should preserve token data on subsequent calls', async () => {
        const token = {
          sub: 'test-sub',
          id: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
        }

        const result = await authConfig.callbacks?.jwt?.({ token, user: undefined })

        expect(result).toEqual(token)
      })
    })
  })

  describe('Auth Module', () => {
    it('should export auth handlers', () => {
      expect(auth).toBeDefined()
      expect(auth.handlers).toBeDefined()
      expect(auth.handlers.GET).toBeDefined()
      expect(auth.handlers.POST).toBeDefined()
    })

    it('should export auth function', () => {
      expect(auth.auth).toBeDefined()
      expect(typeof auth.auth).toBe('function')
    })

    it('should export signIn function', () => {
      expect(auth.signIn).toBeDefined()
      expect(typeof auth.signIn).toBe('function')
    })

    it('should export signOut function', () => {
      expect(auth.signOut).toBeDefined()
      expect(typeof auth.signOut).toBe('function')
    })
  })
})
