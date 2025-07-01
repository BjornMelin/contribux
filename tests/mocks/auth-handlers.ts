/**
 * MSW Authentication Handlers
 * Comprehensive mocking for NextAuth.js and authentication endpoints
 */

import { HttpResponse, http } from 'msw'

// Base URLs
const BASE_URL = 'http://localhost:3000'

// Mock user data
export const mockAuthData = {
  users: {
    testUser: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: 'https://avatars.githubusercontent.com/u/12345',
      emailVerified: null,
    },
    githubUser: {
      id: 'github-user-456',
      name: 'GitHub User',
      email: 'github@example.com',
      image: 'https://avatars.githubusercontent.com/u/67890',
      emailVerified: new Date().toISOString(),
    },
    googleUser: {
      id: 'google-user-789',
      name: 'Google User',
      email: 'google@example.com',
      image: 'https://lh3.googleusercontent.com/a/default-user',
      emailVerified: new Date().toISOString(),
    },
  },

  sessions: {
    validSession: {
      user: {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: 'https://avatars.githubusercontent.com/u/12345',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      sessionToken: 'mock-session-token-123',
    },
    expiredSession: {
      user: {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        image: 'https://avatars.githubusercontent.com/u/12345',
      },
      expires: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
      sessionToken: 'mock-expired-session-token',
    },
  },

  providers: [
    {
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
      signinUrl: '/api/auth/signin/github',
      callbackUrl: '/api/auth/callback/github',
    },
    {
      id: 'google',
      name: 'Google',
      type: 'oauth',
      signinUrl: '/api/auth/signin/google',
      callbackUrl: '/api/auth/callback/google',
    },
  ],

  accounts: [
    {
      id: 'account-1',
      userId: 'user-123',
      type: 'oauth',
      provider: 'github',
      providerAccountId: 'github-12345',
      access_token: 'mock-github-access-token',
      token_type: 'bearer',
      scope: 'read:user user:email',
    },
    {
      id: 'account-2',
      userId: 'user-123',
      type: 'oauth',
      provider: 'google',
      providerAccountId: 'google-67890',
      access_token: 'mock-google-access-token',
      token_type: 'bearer',
      scope: 'openid email profile',
    },
  ],

  csrfToken: 'mock-csrf-token-abcdef123456',

  mfaEnrollment: {
    success: true,
    secret: 'JBSWY3DPEHPK3PXP',
    qrCode: 'data:image/png;base64,mock-qr-code-data',
    backupCodes: ['ABC123DEF', 'GHI456JKL', 'MNO789PQR', 'STU012VWX', 'YZ3456ABC'],
  },

  mfaVerification: {
    success: true,
    verified: true,
    message: 'MFA verification successful',
  },
}

// Helper to check session validity
const isValidSession = (request: Request): boolean => {
  const sessionCookie = request.headers.get('cookie')
  const authHeader = request.headers.get('authorization')

  return !!(
    sessionCookie?.includes('next-auth.session-token=mock-session-token-123') ||
    sessionCookie?.includes('authjs.session-token=mock-session-token-123') ||
    authHeader?.includes('Bearer valid-token')
  )
}

// Helper to extract session token from cookie
const extractSessionToken = (cookieHeader: string | null): string | null => {
  if (!cookieHeader) return null

  const tokenMatch = cookieHeader.match(/(?:next-auth|authjs)\.session-token=([^;]+)/)
  return tokenMatch?.[1] || null
}

// NextAuth.js core handlers
export const nextAuthHandlers = [
  // GET /api/auth/session - Get current session
  http.get(`${BASE_URL}/api/auth/session`, ({ request }) => {
    const sessionToken = extractSessionToken(request.headers.get('cookie'))

    if (sessionToken === 'mock-session-token-123') {
      return HttpResponse.json(mockAuthData.sessions.validSession)
    }

    if (sessionToken === 'mock-expired-session-token') {
      return HttpResponse.json(null)
    }

    return HttpResponse.json(null)
  }),

  // GET /api/auth/csrf - Get CSRF token
  http.get(`${BASE_URL}/api/auth/csrf`, () => {
    return HttpResponse.json({
      csrfToken: mockAuthData.csrfToken,
    })
  }),

  // GET /api/auth/providers - Get configured providers
  http.get(`${BASE_URL}/api/auth/providers`, () => {
    return HttpResponse.json(mockAuthData.providers)
  }),

  // POST /api/auth/signin - Sign in request
  http.post(`${BASE_URL}/api/auth/signin/:provider`, ({ params }) => {
    const provider = params.provider as string

    if (!mockAuthData.providers.find(p => p.id === provider)) {
      return HttpResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // Redirect to provider authorization URL
    return HttpResponse.json({
      url: `/api/auth/callback/${provider}?code=mock-auth-code&state=mock-state`,
    })
  }),

  // GET /api/auth/callback/:provider - OAuth callback
  http.get(`${BASE_URL}/api/auth/callback/:provider`, ({ params, request }) => {
    const _provider = params.provider as string
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/auth/error?error=${encodeURIComponent(error)}`,
        },
      })
    }

    if (!code) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/auth/error?error=missing_code',
        },
      })
    }

    // Simulate successful OAuth flow
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie':
          'next-auth.session-token=mock-session-token-123; Path=/; HttpOnly; SameSite=lax',
      },
    })
  }),

  // POST /api/auth/signout - Sign out
  http.post(`${BASE_URL}/api/auth/signout`, () => {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': 'next-auth.session-token=; Path=/; HttpOnly; SameSite=lax; Max-Age=0',
      },
    })
  }),
]

// Multi-provider OAuth handlers
export const multiProviderHandlers = [
  // GET /api/auth/can-unlink - Check if provider can be unlinked
  http.get(`${BASE_URL}/api/auth/can-unlink`, ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const provider = url.searchParams.get('provider')

    if (!provider) {
      return HttpResponse.json({ error: 'Provider parameter required' }, { status: 400 })
    }

    // User has multiple accounts, can unlink
    const userAccounts = mockAuthData.accounts.filter(acc => acc.userId === 'user-123')
    const canUnlink = userAccounts.length > 1

    return HttpResponse.json({
      canUnlink,
      connectedProviders: userAccounts.map(acc => acc.provider),
      totalProviders: userAccounts.length,
    })
  }),

  // POST /api/auth/unlink - Unlink provider account
  http.post(`${BASE_URL}/api/auth/unlink`, async ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      const body = (await request.json()) as { provider: string }

      if (!body.provider) {
        return HttpResponse.json({ error: 'Provider is required' }, { status: 400 })
      }

      // Check if user has multiple providers
      const userAccounts = mockAuthData.accounts.filter(acc => acc.userId === 'user-123')

      if (userAccounts.length <= 1) {
        return HttpResponse.json(
          { error: 'Cannot unlink the only connected provider' },
          { status: 400 }
        )
      }

      return HttpResponse.json({
        success: true,
        message: `${body.provider} account unlinked successfully`,
        remainingProviders: userAccounts
          .filter(acc => acc.provider !== body.provider)
          .map(acc => acc.provider),
      })
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
  }),

  // POST /api/auth/set-primary - Set primary provider
  http.post(`${BASE_URL}/api/auth/set-primary`, async ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      const body = (await request.json()) as { provider: string }

      if (!body.provider) {
        return HttpResponse.json({ error: 'Provider is required' }, { status: 400 })
      }

      return HttpResponse.json({
        success: true,
        primaryProvider: body.provider,
        message: `${body.provider} set as primary provider`,
      })
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
  }),

  // GET /api/auth/primary-provider - Get primary provider
  http.get(`${BASE_URL}/api/auth/primary-provider`, ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    return HttpResponse.json({
      primaryProvider: 'github',
      connectedProviders: ['github', 'google'],
    })
  }),
]

// MFA (Multi-Factor Authentication) handlers
export const mfaHandlers = [
  // POST /api/auth/mfa/enroll - Enroll in MFA
  http.post(`${BASE_URL}/api/auth/mfa/enroll`, ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')

    if (scenario === 'already-enrolled') {
      return HttpResponse.json(
        { error: 'MFA is already enabled for this account' },
        { status: 400 }
      )
    }

    if (scenario === 'error') {
      return HttpResponse.json({ error: 'Failed to enroll in MFA' }, { status: 500 })
    }

    return HttpResponse.json(mockAuthData.mfaEnrollment)
  }),

  // POST /api/auth/mfa/verify - Verify MFA code
  http.post(`${BASE_URL}/api/auth/mfa/verify`, async ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      const body = (await request.json()) as { code: string; type?: 'totp' | 'backup' }

      if (!body.code) {
        return HttpResponse.json({ error: 'MFA code is required' }, { status: 400 })
      }

      // Simulate different code scenarios
      if (body.code === 'invalid-code') {
        return HttpResponse.json(
          {
            success: false,
            verified: false,
            error: 'Invalid MFA code',
          },
          { status: 400 }
        )
      }

      if (body.code === 'expired-code') {
        return HttpResponse.json(
          {
            success: false,
            verified: false,
            error: 'MFA code has expired',
          },
          { status: 400 }
        )
      }

      return HttpResponse.json(mockAuthData.mfaVerification)
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
  }),

  // GET /api/auth/mfa/settings - Get MFA settings
  http.get(`${BASE_URL}/api/auth/mfa/settings`, ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    return HttpResponse.json({
      mfaEnabled: true,
      enrollmentDate: '2024-01-01T00:00:00Z',
      backupCodesRemaining: 5,
      lastUsed: '2024-06-30T12:00:00Z',
      method: 'totp',
    })
  }),

  // DELETE /api/auth/mfa/settings - Disable MFA
  http.delete(`${BASE_URL}/api/auth/mfa/settings`, ({ request }) => {
    if (!isValidSession(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    return HttpResponse.json({
      success: true,
      message: 'MFA disabled successfully',
      mfaEnabled: false,
    })
  }),
]

// Authentication error handlers
export const authErrorHandlers = [
  // GET /auth/error - Authentication error page data
  http.get(`${BASE_URL}/auth/error`, ({ request }) => {
    const url = new URL(request.url)
    const error = url.searchParams.get('error')

    const errorMessages = {
      Configuration: 'There is a problem with the server configuration.',
      AccessDenied: 'Access denied. You do not have permission to sign in.',
      Verification: 'The verification token has expired or has already been used.',
      Default: 'An error occurred during authentication.',
    }

    return HttpResponse.json({
      error: error || 'Default',
      message: errorMessages[error as keyof typeof errorMessages] || errorMessages.Default,
    })
  }),

  // Simulate various auth error scenarios
  http.post(`${BASE_URL}/api/auth/test-error/:type`, ({ params }) => {
    const errorType = params.type as string

    switch (errorType) {
      case 'oauth-error':
        return HttpResponse.json({ error: 'OAuth provider returned an error' }, { status: 400 })

      case 'session-expired':
        return HttpResponse.json({ error: 'Session has expired' }, { status: 401 })

      case 'invalid-csrf':
        return HttpResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })

      default:
        return HttpResponse.json({ error: 'Unknown authentication error' }, { status: 500 })
    }
  }),
]

// Combine all authentication handlers
export const authHandlers = [
  ...nextAuthHandlers,
  ...multiProviderHandlers,
  ...mfaHandlers,
  ...authErrorHandlers,
]

// Export individual handler groups for targeted testing
export default authHandlers
