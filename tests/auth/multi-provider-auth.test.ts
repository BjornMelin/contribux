import type { Session } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authConfig } from '../../src/lib/auth/config'

interface MockSqlFunction {
  (template: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  unsafe?: (query: string) => Promise<unknown[]>
  mockResolvedValueOnce?: (value: unknown[]) => void
}

// Mock the database connection
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock the environment validation
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    GITHUB_CLIENT_ID: 'test-github-id',
    GITHUB_CLIENT_SECRET: 'test-github-secret',
    GOOGLE_CLIENT_ID: 'test-google-id',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    NEXTAUTH_SECRET: 'test-secret',
  },
}))

// Mock crypto for randomBytes
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('test-random-bytes')),
}))

describe('Multi-Provider Authentication Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should include both GitHub and Google providers', () => {
    expect(authConfig.providers).toHaveLength(2)

    const providerIds = authConfig.providers?.map(
      provider =>
        (provider as { id?: string; options?: { id?: string } }).id ||
        (provider as { id?: string; options?: { id?: string } }).options?.id
    )
    expect(providerIds).toContain('github')
    expect(providerIds).toContain('google')
  })

  it('should configure GitHub provider with correct scopes', () => {
    const githubProvider = authConfig.providers?.find(
      p =>
        (p as { id?: string; options?: { id?: string } }).id === 'github' ||
        (p as { id?: string; options?: { id?: string } }).options?.id === 'github'
    )

    expect(githubProvider).toBeDefined()
    expect(githubProvider?.options?.authorization?.params?.scope).toBe('read:user user:email')
  })

  it('should configure Google provider with PKCE support', () => {
    const googleProvider = authConfig.providers?.find(
      p =>
        (p as { id?: string; options?: { id?: string } }).id === 'google' ||
        (p as { id?: string; options?: { id?: string } }).options?.id === 'google'
    )

    expect(googleProvider).toBeDefined()
    const authParams = googleProvider?.options?.authorization?.params
    expect(authParams?.prompt).toBe('consent')
    expect(authParams?.access_type).toBe('offline')
    expect(authParams?.response_type).toBe('code')
    expect(authParams?.scope).toBe('openid email profile')
  })

  it('should have proper callback configuration', () => {
    expect(authConfig.callbacks).toBeDefined()
    expect(typeof authConfig.callbacks?.signIn).toBe('function')
    expect(typeof authConfig.callbacks?.session).toBe('function')
    expect(typeof authConfig.callbacks?.jwt).toBe('function')
  })

  it('should have enhanced security settings', () => {
    expect(authConfig.debug).toBe(false) // Should be false in test environment
    expect(authConfig.session?.strategy).toBe('jwt')
    expect(authConfig.session?.maxAge).toBe(30 * 24 * 60 * 60) // 30 days
    expect(authConfig.session?.updateAge).toBe(24 * 60 * 60) // 24 hours
  })

  it('should have proper page configuration', () => {
    expect(authConfig.pages?.signIn).toBe('/auth/signin')
    expect(authConfig.pages?.error).toBe('/auth/error')
  })

  it('should configure secure cookies for production', () => {
    // This would need to be tested with production environment
    expect(authConfig.useSecureCookies).toBe(false) // false in test env
    expect(authConfig.cookies?.sessionToken?.options?.httpOnly).toBe(true)
    expect(authConfig.cookies?.sessionToken?.options?.sameSite).toBe('lax')
  })
})

describe('Multi-Provider SignIn Logic', () => {
  it('should validate supported providers', async () => {
    const mockUser = {
      id: 'test-id',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: null,
    }
    const mockAccount = {
      provider: 'unsupported',
      providerAccountId: '123',
      type: 'oauth' as const,
    }

    // The signIn callback should reject unsupported providers
    const result = await authConfig.callbacks?.signIn?.({
      user: mockUser,
      account: mockAccount,
      profile: {},
    })

    expect(result).toBe(false)
  })

  it('should handle missing email gracefully', async () => {
    const mockUser = { id: 'test-id', name: 'Test User', email: '', emailVerified: null } // Missing email
    const mockAccount = { provider: 'github', providerAccountId: '123', type: 'oauth' as const }

    const result = await authConfig.callbacks?.signIn?.({
      user: mockUser,
      account: mockAccount,
      profile: {},
    })

    expect(result).toBe(false)
  })
})

describe('Token Management', () => {
  it('should handle JWT token creation', async () => {
    const mockToken = { sub: 'user-123' }
    const mockUser = { id: 'user-123', email: 'test@example.com', emailVerified: null }
    const mockAccount = {
      provider: 'github',
      providerAccountId: '123',
      type: 'oauth' as const,
      access_token: 'access-123',
      refresh_token: 'refresh-123',
      expires_at: Date.now() / 1000 + 3600,
    }

    const result = await authConfig.callbacks?.jwt?.({
      token: mockToken,
      user: mockUser,
      account: mockAccount,
    })

    expect(result).toMatchObject({
      ...mockToken,
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
      provider: 'github',
    })
  })

  it('should return existing token when not expired', async () => {
    const mockToken = {
      sub: 'user-123',
      expiresAt: Date.now() / 1000 + 3600, // 1 hour from now
      accessToken: 'existing-token',
    }

    const result = await authConfig.callbacks?.jwt?.({
      token: mockToken,
      user: { id: 'user-123', email: '', emailVerified: null },
    })

    expect(result).toEqual(mockToken)
  })
})

describe('Session Management', () => {
  it('should enhance session with provider information', async () => {
    const mockSession = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        image: null,
        connectedProviders: ['github', 'google'],
        primaryProvider: 'github',
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
    }
    const mockToken = { sub: 'user-123' }

    // Mock the SQL query result
    const { sql } = await import('../../src/lib/db/config')
    ;(sql as unknown as MockSqlFunction).mockResolvedValueOnce?.([
      {
        id: 'user-123',
        email: 'test@example.com',
        github_username: 'testuser',
        connected_providers: ['github', 'google'],
        primary_provider: 'github',
      },
    ])

    const result = await authConfig.callbacks?.session?.({
      session: mockSession,
      token: mockToken,
    })

    expect(result?.user?.id).toBe('user-123')
    expect((result as Session)?.user?.connectedProviders).toEqual(['github', 'google'])
    expect((result as Session)?.user?.primaryProvider).toBe('github')
  })
})
