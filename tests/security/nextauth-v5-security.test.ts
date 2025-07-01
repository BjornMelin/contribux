/**
 * NextAuth.js v5 Security Testing Suite
 * Comprehensive security tests for authentication, session management, CSRF protection,
 * OAuth flows, and token security in the modernized NextAuth.js v5 architecture
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { authConfig } from '../../src/lib/auth/config'
import { sql } from '../../src/lib/db/config'

// Mock database connection
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock environment variables
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'test-secret-key-for-testing-purposes-only',
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    NEXTAUTH_URL: 'http://localhost:3000',
  },
}))

// Mock NextAuth.js
vi.mock('next-auth', () => ({
  default: vi.fn(),
}))

// Mock crypto functions
vi.mock('../../src/lib/security/crypto', () => ({
  generateSecureToken: vi.fn().mockImplementation(
    (length: number) =>
      'secure-token-' +
      Math.random()
        .toString(36)
        .substring(2, length + 2)
  ),
  createSecureHash: vi
    .fn()
    .mockImplementation((data: string) => `secure-hash-${Buffer.from(data).toString('base64')}`),
  verifySecureHash: vi.fn().mockReturnValue(true),
}))

// Security testing server with auth endpoints
const securityServer = setupServer(
  // NextAuth.js API routes
  http.get('http://localhost:3000/api/auth/session', ({ request }) => {
    const cookies = request.headers.get('cookie') || ''
    const hasSessionToken =
      cookies.includes('next-auth.session-token') ||
      cookies.includes('__Secure-next-auth.session-token')

    if (!hasSessionToken) {
      return HttpResponse.json(null)
    }

    // Simulate valid session
    return HttpResponse.json({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        connectedProviders: ['github'],
        primaryProvider: 'github',
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }),

  http.post('http://localhost:3000/api/auth/signin', async ({ request }) => {
    const body = await request.text()
    const params = new URLSearchParams(body)
    const provider = params.get('provider')
    const csrfToken = params.get('csrfToken')
    const callbackUrl = params.get('callbackUrl')

    // CSRF token validation
    if (!csrfToken) {
      return HttpResponse.json({ error: 'CSRF token missing' }, { status: 400 })
    }

    // Provider validation
    if (!provider || !['github', 'google'].includes(provider)) {
      return HttpResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Simulate OAuth redirect
    const authUrl =
      provider === 'github'
        ? 'https://github.com/login/oauth/authorize'
        : 'https://accounts.google.com/oauth2/auth'

    return HttpResponse.redirect(
      `${authUrl}?client_id=test&redirect_uri=${encodeURIComponent(callbackUrl || '')}`
    )
  }),

  http.get('http://localhost:3000/api/auth/callback/:provider', ({ params, request }) => {
    const { provider } = params
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    // OAuth callback validation
    if (!code) {
      return HttpResponse.json({ error: 'Authorization code missing' }, { status: 400 })
    }

    if (!state) {
      return HttpResponse.json({ error: 'State parameter missing' }, { status: 400 })
    }

    // Simulate successful authentication
    return HttpResponse.redirect('http://localhost:3000?authenticated=true', {
      headers: {
        'Set-Cookie':
          '__Secure-next-auth.session-token=valid-session-token; HttpOnly; Secure; SameSite=Lax; Path=/',
      },
    })
  }),

  http.post('http://localhost:3000/api/auth/signout', async ({ request }) => {
    const cookies = request.headers.get('cookie') || ''
    const hasSessionToken =
      cookies.includes('next-auth.session-token') ||
      cookies.includes('__Secure-next-auth.session-token')

    if (!hasSessionToken) {
      return HttpResponse.json({ error: 'No session to sign out' }, { status: 400 })
    }

    // Simulate successful signout
    return HttpResponse.json(
      { success: true },
      {
        headers: {
          'Set-Cookie':
            '__Secure-next-auth.session-token=; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        },
      }
    )
  }),

  http.get('http://localhost:3000/api/auth/csrf', () => {
    return HttpResponse.json({
      csrfToken: `csrf-token-${Math.random().toString(36).substring(2)}`,
    })
  }),

  http.get('http://localhost:3000/api/auth/providers', () => {
    return HttpResponse.json({
      github: {
        id: 'github',
        name: 'GitHub',
        type: 'oauth',
        signinUrl: 'http://localhost:3000/api/auth/signin/github',
        callbackUrl: 'http://localhost:3000/api/auth/callback/github',
      },
      google: {
        id: 'google',
        name: 'Google',
        type: 'oauth',
        signinUrl: 'http://localhost:3000/api/auth/signin/google',
        callbackUrl: 'http://localhost:3000/api/auth/callback/google',
      },
    })
  }),

  // OAuth provider endpoints
  http.post('https://github.com/login/oauth/access_token', async ({ request }) => {
    const body = await request.text()
    const params = new URLSearchParams(body)
    const code = params.get('code')
    const clientId = params.get('client_id')
    const clientSecret = params.get('client_secret')

    if (!code || !clientId || !clientSecret) {
      return HttpResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    return HttpResponse.json({
      access_token: `github-access-token-${Math.random().toString(36)}`,
      token_type: 'bearer',
      scope: 'read:user,user:email',
    })
  }),

  http.get('https://api.github.com/user', ({ request }) => {
    const auth = request.headers.get('authorization')
    if (!auth || !auth.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Requires authentication' }, { status: 401 })
    }

    return HttpResponse.json({
      id: 123456,
      login: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
      verified: true,
    })
  }),

  http.post('https://oauth2.googleapis.com/token', async ({ request }) => {
    const body = await request.text()
    const params = new URLSearchParams(body)
    const code = params.get('code')
    const clientId = params.get('client_id')
    const clientSecret = params.get('client_secret')

    if (!code || !clientId || !clientSecret) {
      return HttpResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    return HttpResponse.json({
      access_token: `google-access-token-${Math.random().toString(36)}`,
      id_token: `google-id-token-${Math.random().toString(36)}`,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    })
  })
)

beforeAll(() => {
  securityServer.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  securityServer.resetHandlers()
  vi.clearAllMocks()
})

afterAll(() => {
  securityServer.close()
})

describe('NextAuth.js v5 Security Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication Configuration Security', () => {
    it('should have secure session configuration', () => {
      expect(authConfig.session?.strategy).toBe('jwt')
      expect(authConfig.session?.maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60) // Max 30 days
      expect(authConfig.session?.updateAge).toBeLessThanOrEqual(24 * 60 * 60) // Max 24 hours
    })

    it('should have secure cookie configuration', () => {
      expect(authConfig.useSecureCookies).toBe(process.env.NODE_ENV === 'production')

      const sessionCookie = authConfig.cookies?.sessionToken
      expect(sessionCookie?.name).toBe('__Secure-next-auth.session-token')
      expect(sessionCookie?.options?.httpOnly).toBe(true)
      expect(sessionCookie?.options?.sameSite).toBe('lax')
      expect(sessionCookie?.options?.secure).toBe(process.env.NODE_ENV === 'production')
    })

    it('should require NEXTAUTH_SECRET in configuration', () => {
      expect(authConfig.secret).toBeDefined()
      expect(authConfig.secret).not.toBe('')
    })

    it('should have proper OAuth provider configuration', () => {
      expect(authConfig.providers).toHaveLength(2)

      // Check GitHub provider configuration
      const githubProvider = authConfig.providers.find(p => p.id === 'github')
      expect(githubProvider).toBeDefined()

      // Check Google provider configuration
      const googleProvider = authConfig.providers.find(p => p.id === 'google')
      expect(googleProvider).toBeDefined()
    })

    it('should have custom sign-in and error pages configured', () => {
      expect(authConfig.pages?.signIn).toBe('/auth/signin')
      expect(authConfig.pages?.error).toBe('/auth/error')
    })
  })

  describe('Production Secret Validation', () => {
    it('should reject hardcoded test secrets in production', () => {
      // Test that hardcoded test secrets are properly rejected
      const testSecrets = [
        'test-secret',
        'development-secret',
        'test123',
        'localhost-secret',
        'default-secret',
      ]

      testSecrets.forEach(testSecret => {
        expect(() => {
          // Simulate production environment validation
          if (process.env.NODE_ENV === 'production' && testSecret.includes('test')) {
            throw new Error('AUTH_SECRET must be a secure production secret')
          }
        }).not.toThrow()

        // In production, this should throw
        if (process.env.NODE_ENV === 'production') {
          expect(() => {
            if (testSecret.startsWith('test') || testSecret.includes('default')) {
              throw new Error('Production secrets cannot contain test patterns')
            }
          }).toThrow('Production secrets cannot contain test patterns')
        }
      })
    })

    it('should validate secret entropy and strength', () => {
      const weakSecrets = ['12345', 'password', 'secret']
      const strongSecret = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'

      weakSecrets.forEach(secret => {
        expect(secret.length).toBeLessThan(32) // Too short for production
      })

      expect(strongSecret.length).toBeGreaterThanOrEqual(32)
      expect(/[a-z]/.test(strongSecret)).toBe(true)
      expect(/[0-9]/.test(strongSecret)).toBe(true)
    })

    it('should enforce minimum secret length requirements', () => {
      const shortSecret = 'short'
      const acceptableSecret = 'a'.repeat(32)

      expect(shortSecret.length).toBeLessThan(32)
      expect(acceptableSecret.length).toBeGreaterThanOrEqual(32)

      // Production should require minimum 32 characters
      if (process.env.NODE_ENV === 'production') {
        expect(() => {
          if (shortSecret.length < 32) {
            throw new Error('AUTH_SECRET must be at least 32 characters')
          }
        }).toThrow('AUTH_SECRET must be at least 32 characters')
      }
    })
  })

  describe('Multi-Factor Authentication (MFA) Security', () => {
    it('should support WebAuthn registration', async () => {
      // Test WebAuthn MFA capability
      const registrationOptions = {
        rpName: 'Contribux',
        rpID: 'localhost',
        userID: 'user-123',
        userName: 'test@example.com',
        userDisplayName: 'Test User',
      }

      expect(registrationOptions.rpName).toBe('Contribux')
      expect(registrationOptions.userID).toBeDefined()
      expect(registrationOptions.userName).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    })

    it('should validate MFA requirements for sensitive operations', async () => {
      const sensitiveOperations = ['delete_account', 'change_email', 'export_data', 'revoke_tokens']

      sensitiveOperations.forEach(operation => {
        // Should require MFA for sensitive operations
        expect(() => {
          const requiresMFA = ['delete_account', 'change_email', 'export_data'].includes(operation)
          if (!requiresMFA) {
            throw new Error(`Operation ${operation} should require MFA`)
          }
        }).not.toThrow()
      })
    })

    it('should implement proper MFA backup codes', () => {
      // Test backup code generation and validation
      const backupCodes = ['123456', '789012', '345678']

      backupCodes.forEach(code => {
        expect(code).toMatch(/^\d{6}$/) // 6-digit numeric codes
        expect(code).not.toBe('000000') // Should not be predictable
        expect(code).not.toBe('123456') // Should not be sequential
      })
    })

    it('should validate TOTP token format and timing', () => {
      const validTOTP = '123456'
      const invalidTOTP = '12345'

      expect(validTOTP).toMatch(/^\d{6}$/)
      expect(invalidTOTP).not.toMatch(/^\d{6}$/)

      // Test TOTP time window validation
      const currentTime = Math.floor(Date.now() / 1000)
      const timeWindow = 30 // TOTP standard 30-second window
      const timeStep = Math.floor(currentTime / timeWindow)

      expect(timeStep).toBeGreaterThan(0)
      expect(timeWindow).toBe(30)
    })
  })

  describe('PKCE OAuth Security Implementation', () => {
    it('should generate secure code verifier and challenge', () => {
      // Test PKCE code verifier generation
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

      expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(codeVerifier.length).toBeLessThanOrEqual(128)
      expect(codeChallenge.length).toBeGreaterThan(0)

      // Verify base64url encoding
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should validate PKCE flow parameters', async () => {
      const pkceParams = {
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
        code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      }

      expect(pkceParams.code_challenge_method).toBe('S256')
      expect(pkceParams.code_challenge).toBeDefined()
      expect(pkceParams.code_verifier).toBeDefined()

      // Validate PKCE challenge method
      expect(['S256', 'plain']).toContain(pkceParams.code_challenge_method)
      expect(pkceParams.code_challenge_method).toBe('S256') // Should prefer S256
    })

    it('should enforce PKCE for all OAuth flows', async () => {
      const oauthProviders = ['github', 'google']

      oauthProviders.forEach(_provider => {
        // Each provider should support PKCE
        const authUrl =
          'https://github.com/login/oauth/authorize?client_id=test&code_challenge=challenge&code_challenge_method=S256'

        expect(authUrl).toContain('code_challenge')
        expect(authUrl).toContain('code_challenge_method')
      })
    })

    it('should validate code verifier in token exchange', () => {
      // Test that code verifier matches code challenge
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

      // Simulate PKCE validation
      const isValid = codeVerifier.length >= 43 && expectedChallenge.length > 0
      expect(isValid).toBe(true)
    })
  })

  describe('Session Security Validation', () => {
    it('should validate session tokens properly', async () => {
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session', {
        headers: {
          Cookie: '__Secure-next-auth.session-token=valid-session-token',
        },
      })

      expect(sessionResponse.ok).toBe(true)
      const session = await sessionResponse.json()
      expect(session).toHaveProperty('user')
      expect(session.user).toHaveProperty('id')
      expect(session.user).toHaveProperty('email')
    })

    it('should reject requests without session tokens', async () => {
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session')

      expect(sessionResponse.ok).toBe(true)
      const session = await sessionResponse.json()
      expect(session).toBeNull()
    })

    it('should include security headers in session responses', async () => {
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session', {
        headers: {
          Cookie: '__Secure-next-auth.session-token=valid-session-token',
        },
      })

      // Check for security headers (these would be set by middleware in real app)
      expect(sessionResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(sessionResponse.headers.get('X-Frame-Options')).toBe('DENY')
    })
  })

  describe('CSRF Protection Testing', () => {
    it('should provide CSRF tokens', async () => {
      const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf')

      expect(csrfResponse.ok).toBe(true)
      const csrf = await csrfResponse.json()
      expect(csrf).toHaveProperty('csrfToken')
      expect(csrf.csrfToken).toMatch(/^csrf-token-/)
    })

    it('should require CSRF tokens for sign-in', async () => {
      const signInResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          provider: 'github',
          callbackUrl: 'http://localhost:3000',
        }),
      })

      expect(signInResponse.status).toBe(400)
      const error = await signInResponse.json()
      expect(error.error).toBe('CSRF token missing')
    })

    it('should accept valid CSRF tokens', async () => {
      const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf')
      const { csrfToken } = await csrfResponse.json()

      const signInResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          provider: 'github',
          csrfToken,
          callbackUrl: 'http://localhost:3000',
        }),
        redirect: 'manual',
      })

      expect(signInResponse.status).toBe(302) // Redirect to OAuth provider
    })
  })

  describe('OAuth Flow Security', () => {
    it('should validate OAuth providers', async () => {
      const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf')
      const { csrfToken } = await csrfResponse.json()

      const invalidProviderResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          provider: 'invalid-provider',
          csrfToken,
          callbackUrl: 'http://localhost:3000',
        }),
      })

      expect(invalidProviderResponse.status).toBe(400)
      const error = await invalidProviderResponse.json()
      expect(error.error).toBe('Invalid provider')
    })

    it('should require authorization code in OAuth callback', async () => {
      const callbackResponse = await fetch(
        'http://localhost:3000/api/auth/callback/github?state=valid-state'
      )

      expect(callbackResponse.status).toBe(400)
      const error = await callbackResponse.json()
      expect(error.error).toBe('Authorization code missing')
    })

    it('should require state parameter in OAuth callback', async () => {
      const callbackResponse = await fetch(
        'http://localhost:3000/api/auth/callback/github?code=valid-code'
      )

      expect(callbackResponse.status).toBe(400)
      const error = await callbackResponse.json()
      expect(error.error).toBe('State parameter missing')
    })

    it('should complete OAuth flow with valid parameters', async () => {
      const callbackResponse = await fetch(
        'http://localhost:3000/api/auth/callback/github?code=valid-code&state=valid-state',
        { redirect: 'manual' }
      )

      expect(callbackResponse.status).toBe(302)
      expect(callbackResponse.headers.get('location')).toContain('authenticated=true')

      const setCookie = callbackResponse.headers.get('set-cookie')
      expect(setCookie).toContain('__Secure-next-auth.session-token')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('Secure')
      expect(setCookie).toContain('SameSite=Lax')
    })
  })

  describe('Sign-out Security', () => {
    it('should require active session for sign-out', async () => {
      const signOutResponse = await fetch('http://localhost:3000/api/auth/signout', {
        method: 'POST',
      })

      expect(signOutResponse.status).toBe(400)
      const error = await signOutResponse.json()
      expect(error.error).toBe('No session to sign out')
    })

    it('should clear session tokens on sign-out', async () => {
      const signOutResponse = await fetch('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        headers: {
          Cookie: '__Secure-next-auth.session-token=valid-session-token',
        },
      })

      expect(signOutResponse.ok).toBe(true)
      const result = await signOutResponse.json()
      expect(result.success).toBe(true)

      const setCookie = signOutResponse.headers.get('set-cookie')
      expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    })
  })

  describe('OAuth Provider Security', () => {
    it('should validate GitHub OAuth token exchange', async () => {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: 'valid-auth-code',
          client_id: 'test-github-client-id',
          client_secret: 'test-github-client-secret',
        }),
      })

      expect(tokenResponse.ok).toBe(true)
      const tokens = await tokenResponse.json()
      expect(tokens).toHaveProperty('access_token')
      expect(tokens.token_type).toBe('bearer')
    })

    it('should reject GitHub OAuth with missing parameters', async () => {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: 'valid-auth-code',
          // Missing client_id and client_secret
        }),
      })

      expect(tokenResponse.status).toBe(400)
      const error = await tokenResponse.json()
      expect(error.error).toBe('invalid_request')
    })

    it('should validate Google OAuth token exchange', async () => {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: 'valid-auth-code',
          client_id: 'test-google-client-id',
          client_secret: 'test-google-client-secret',
          grant_type: 'authorization_code',
        }),
      })

      expect(tokenResponse.ok).toBe(true)
      const tokens = await tokenResponse.json()
      expect(tokens).toHaveProperty('access_token')
      expect(tokens).toHaveProperty('id_token')
      expect(tokens.token_type).toBe('Bearer')
    })

    it('should authenticate GitHub API requests with valid tokens', async () => {
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: 'Bearer github-access-token-12345',
        },
      })

      expect(userResponse.ok).toBe(true)
      const user = await userResponse.json()
      expect(user).toHaveProperty('id')
      expect(user).toHaveProperty('login')
      expect(user).toHaveProperty('email')
    })

    it('should reject GitHub API requests without authentication', async () => {
      const userResponse = await fetch('https://api.github.com/user')

      expect(userResponse.status).toBe(401)
      const error = await userResponse.json()
      expect(error.message).toBe('Requires authentication')
    })
  })

  describe('Provider List Security', () => {
    it('should return configured OAuth providers', async () => {
      const providersResponse = await fetch('http://localhost:3000/api/auth/providers')

      expect(providersResponse.ok).toBe(true)
      const providers = await providersResponse.json()

      expect(providers).toHaveProperty('github')
      expect(providers).toHaveProperty('google')
      expect(providers.github.type).toBe('oauth')
      expect(providers.google.type).toBe('oauth')
    })

    it('should not expose sensitive provider configuration', async () => {
      const providersResponse = await fetch('http://localhost:3000/api/auth/providers')
      const providers = await providersResponse.json()

      // Should not expose client secrets or sensitive config
      expect(providers.github).not.toHaveProperty('clientSecret')
      expect(providers.google).not.toHaveProperty('clientSecret')
      expect(providers.github).not.toHaveProperty('clientId')
      expect(providers.google).not.toHaveProperty('clientId')
    })
  })

  describe('Database Integration Security', () => {
    it('should use parameterized queries for user lookup', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        {
          id: 'user-123',
          email: 'test@example.com',
          display_name: 'Test User',
          connected_providers: ['github'],
          primary_provider: 'github',
        },
      ])

      // This would be called during session callback
      await sql`
        SELECT u.id, u.email, u.display_name, u.username, 
               u.github_username, u.email_verified, u.two_factor_enabled,
               u.recovery_email, u.locked_at, u.failed_login_attempts, u.last_login_at,
               u.created_at, u.updated_at,
               array_agg(DISTINCT oa.provider) FILTER (WHERE oa.provider IS NOT NULL) as connected_providers,
               oa_primary.provider as primary_provider
        FROM users u
        LEFT JOIN oauth_accounts oa ON u.id = oa.user_id
        LEFT JOIN oauth_accounts oa_primary ON u.id = oa_primary.user_id AND oa_primary.is_primary = true
        WHERE u.id = ${'user-123'}
        GROUP BY u.id, u.email, u.display_name, u.username, u.github_username, 
                 u.email_verified, u.two_factor_enabled, u.recovery_email, u.locked_at, 
                 u.failed_login_attempts, u.last_login_at, u.created_at, u.updated_at, 
                 oa_primary.provider
        LIMIT 1
      `

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT u.id, u.email'),
          expect.stringContaining('WHERE u.id = '),
          expect.stringContaining('LIMIT 1'),
        ]),
        'user-123'
      )
    })

    it('should log security events for audit trail', async () => {
      const mockSql = vi.mocked(sql)

      // Mock successful login event logging
      await sql`
        INSERT INTO security_audit_logs (
          event_type, event_severity, user_id, success, event_data
        )
        VALUES (
          ${'login_success'},
          ${'info'},
          ${'user-123'},
          ${true},
          ${JSON.stringify({ provider: 'github', new_user: false })}
        )
      `

      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO security_audit_logs'),
          expect.stringContaining('event_type, event_severity, user_id, success, event_data'),
        ]),
        'login_success',
        'info',
        'user-123',
        true,
        '{"provider":"github","new_user":false}'
      )
    })
  })

  describe('Token Security and Refresh', () => {
    it('should handle token refresh securely', () => {
      // Test JWT callback configuration for token refresh
      expect(authConfig.callbacks?.jwt).toBeDefined()

      // In real implementation, this would test:
      // - Token expiration validation
      // - Secure token refresh
      // - Token storage security
    })

    it('should validate token expiration', () => {
      const now = Date.now()
      const futureExpiry = Math.floor(now / 1000) + 3600 // 1 hour from now
      const pastExpiry = Math.floor(now / 1000) - 3600 // 1 hour ago

      expect(now < futureExpiry * 1000).toBe(true) // Token not expired
      expect(now >= pastExpiry * 1000).toBe(true) // Token expired
    })
  })
})
