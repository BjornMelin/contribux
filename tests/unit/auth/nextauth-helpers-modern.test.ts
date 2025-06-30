/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentUser,
  getOAuthAccessToken,
  hasOAuthScope,
  requireAuth,
} from '../../src/lib/auth/helpers'
import type { User } from '../../src/types/auth'
import type { Email, GitHubUsername, UUID } from '../../src/types/base'

// Modern Auth.js v5 test patterns - use node environment to avoid JSDOM issues

// Mock the universal auth() function from Auth.js v5
vi.mock('../../src/lib/auth', () => ({
  auth: vi.fn(),
}))

// Mock the database client
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock headers() for security logging
vi.mock('next/headers', () => ({
  headers: vi.fn(
    async () =>
      new Map([
        ['x-forwarded-for', '127.0.0.1'],
        ['user-agent', 'test-user-agent'],
      ])
  ),
}))

describe('Auth.js v5 Helper Functions - Modern 2025 Approach', () => {
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000' as UUID,
    email: 'test@example.com' as Email,
    displayName: 'Test User',
    username: 'testuser',
    githubUsername: 'testuser' as GitHubUsername,
    emailVerified: true,
    twoFactorEnabled: false,
    failedLoginAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession = {
    user: {
      id: mockUser.id,
      email: mockUser.email,
      name: 'testuser',
    },
    expires: '2025-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCurrentUser', () => {
    it('returns user when authenticated with valid session', async () => {
      const { auth } = await import('../../src/lib/auth')
      const { sql } = await import('../../src/lib/db/config')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(sql).mockResolvedValue([mockUser])

      const user = await getCurrentUser()

      expect(auth).toHaveBeenCalledOnce()
      expect(sql).toHaveBeenCalledWith(expect.any(Array), mockUser.id)
      expect(user).toEqual(mockUser)
    })

    it('returns null when no session exists', async () => {
      const { auth } = await import('../../src/lib/auth')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(null as any)

      const user = await getCurrentUser()

      expect(auth).toHaveBeenCalledOnce()
      expect(user).toBeNull()
    })

    it('returns null when session has no user ID', async () => {
      const { auth } = await import('../../src/lib/auth')

      const sessionWithoutUserId = { ...mockSession, user: { email: 'test@example.com' } }
      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(sessionWithoutUserId as any)

      const user = await getCurrentUser()

      expect(user).toBeNull()
    })

    it('returns null when user not found in database', async () => {
      const { auth } = await import('../../src/lib/auth')
      const { sql } = await import('../../src/lib/db/config')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(sql).mockResolvedValue([]) // Empty result

      const user = await getCurrentUser()

      expect(user).toBeNull()
    })

    it('handles database errors gracefully', async () => {
      const { auth } = await import('../../src/lib/auth')
      const { sql } = await import('../../src/lib/db/config')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(sql).mockRejectedValue(new Error('Database error'))

      const user = await getCurrentUser()

      expect(user).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('returns user when authenticated', async () => {
      const { auth } = await import('../../src/lib/auth')
      const { sql } = await import('../../src/lib/db/config')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(sql).mockResolvedValue([mockUser])

      const user = await requireAuth()

      expect(user).toEqual(mockUser)
    })

    it('throws error when not authenticated', async () => {
      const { auth } = await import('../../src/lib/auth')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(null as any)

      await expect(requireAuth()).rejects.toThrow('Unauthorized')
    })

    it('throws error when user not found in database', async () => {
      const { auth } = await import('../../src/lib/auth')
      const { sql } = await import('../../src/lib/db/config')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(sql).mockResolvedValue([])

      await expect(requireAuth()).rejects.toThrow('Unauthorized')
    })
  })

  describe('hasOAuthScope', () => {
    it('returns true when user has required scope', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([{ scope: 'read:user user:email' }])

      const hasScope = await hasOAuthScope(mockUser.id, 'read:user', 'github')

      expect(hasScope).toBe(true)
      expect(sql).toHaveBeenCalledWith(expect.any(Array), mockUser.id, 'github')
    })

    it('returns false when user does not have required scope', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([{ scope: 'read:user' }])

      const hasScope = await hasOAuthScope(mockUser.id, 'repo', 'github')

      expect(hasScope).toBe(false)
    })

    it('returns false when no OAuth account found', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([])

      const hasScope = await hasOAuthScope(mockUser.id, 'read:user', 'github')

      expect(hasScope).toBe(false)
    })

    it('handles database errors gracefully', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockRejectedValue(new Error('Database error'))

      const hasScope = await hasOAuthScope(mockUser.id, 'read:user', 'github')

      expect(hasScope).toBe(false)
    })

    it('uses github as default provider', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([{ scope: 'read:user' }])

      await hasOAuthScope(mockUser.id, 'read:user')

      expect(sql).toHaveBeenCalledWith(expect.any(Array), mockUser.id, 'github')
    })
  })

  describe('getOAuthAccessToken', () => {
    it('returns access token when found', async () => {
      const { sql } = await import('../../src/lib/db/config')

      const mockToken = 'gho_test_token_123'
      vi.mocked(sql).mockResolvedValue([{ access_token: mockToken }])

      const token = await getOAuthAccessToken(mockUser.id, 'github')

      expect(token).toBe(mockToken)
      expect(sql).toHaveBeenCalledWith(expect.any(Array), mockUser.id, 'github')
    })

    it('returns null when no OAuth account found', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([])

      const token = await getOAuthAccessToken(mockUser.id, 'github')

      expect(token).toBeNull()
    })

    it('handles database errors gracefully', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockRejectedValue(new Error('Database error'))

      const token = await getOAuthAccessToken(mockUser.id, 'github')

      expect(token).toBeNull()
    })

    it('works with different providers', async () => {
      const { sql } = await import('../../src/lib/db/config')

      const mockToken = 'google_token_123'
      vi.mocked(sql).mockResolvedValue([{ access_token: mockToken }])

      const token = await getOAuthAccessToken(mockUser.id, 'google')

      expect(token).toBe(mockToken)
      expect(sql).toHaveBeenCalledWith(expect.any(Array), mockUser.id, 'google')
    })
  })

  describe('Auth.js v5 Integration Patterns', () => {
    it('demonstrates universal auth() function usage', async () => {
      const { auth } = await import('../../src/lib/auth')

      // In Auth.js v5, auth() replaces all these old methods:
      // - getServerSession()
      // - getSession()
      // - withAuth()
      // - getToken()
      // - useSession() (client-side)

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const session = await auth()

      expect(session).toEqual(mockSession)
      expect(auth).toHaveBeenCalledOnce()
    })

    it('shows proper error handling for auth failures', async () => {
      const { auth } = await import('../../src/lib/auth')

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(null as any) // Auth fails = null session

      const user = await getCurrentUser()
      expect(user).toBeNull()
    })

    it('demonstrates session data structure', async () => {
      const { auth } = await import('../../src/lib/auth')

      const extendedSession = {
        ...mockSession,
        user: {
          ...mockSession.user,
          connectedProviders: ['github', 'google'],
          primaryProvider: 'github',
        },
      }

      // biome-ignore lint/suspicious/noExplicitAny: Mock session for test scenario
      vi.mocked(auth).mockResolvedValue(extendedSession as any)

      const session = await auth()

      expect(session?.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        connectedProviders: ['github', 'google'],
        primaryProvider: 'github',
      })
    })

    it('handles multiple provider scenarios', async () => {
      const { sql } = await import('../../src/lib/db/config')

      // Mock OAuth accounts query for multiple providers
      vi.mocked(sql).mockResolvedValue([{ access_token: 'github_token' }])

      const githubToken = await getOAuthAccessToken(mockUser.id, 'github')

      vi.mocked(sql).mockResolvedValue([{ access_token: 'google_token' }])

      const googleToken = await getOAuthAccessToken(mockUser.id, 'google')

      expect(githubToken).toBe('github_token')
      expect(googleToken).toBe('google_token')
    })
  })

  describe('Edge Cases and Security', () => {
    it('handles empty scope strings', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([{ scope: '' }])

      const hasScope = await hasOAuthScope(mockUser.id, 'read:user', 'github')

      expect(hasScope).toBe(false)
    })

    it('handles null scope values', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([{ scope: null }])

      const hasScope = await hasOAuthScope(mockUser.id, 'read:user', 'github')

      expect(hasScope).toBe(false)
    })

    it('validates user ID format', async () => {
      const { sql } = await import('../../src/lib/db/config')

      vi.mocked(sql).mockResolvedValue([])

      // Should handle invalid user IDs gracefully
      const token = await getOAuthAccessToken('invalid-id', 'github')

      expect(token).toBeNull()
    })
  })
})
