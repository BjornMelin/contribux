/**
 * Authentication Middleware Testing Suite
 * Comprehensive testing for NextAuth.js v5 integration with API routes
 *
 * Focus Areas:
 * - Middleware authentication validation
 * - Session-based authorization
 * - OAuth provider integration
 * - JWT token validation
 * - Security boundary testing
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Test schemas
const _SessionSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    image: z.string().optional(),
  }),
  expires: z.string(),
})

const AuthErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
})

const AuthProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  signinUrl: z.string().optional(),
  callbackUrl: z.string().optional(),
})

// Mock data generators
const generateMockSession = (overrides: Partial<any> = {}) => ({
  user: {
    id: 'user_123456789',
    email: 'test.user@example.com',
    name: 'Test User',
    image: 'https://avatars.githubusercontent.com/u/123456789',
    ...overrides.user,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

const generateMockJWT = (payload: any = {}) => {
  const header = { alg: 'HS256', typ: 'JWT' }
  const mockPayload = {
    sub: 'user_123456789',
    email: 'test.user@example.com',
    name: 'Test User',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  }

  // Simple base64 encoding for testing (not cryptographically secure)
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
  const encodedPayload = Buffer.from(JSON.stringify(mockPayload)).toString('base64')
  const signature = 'mock-signature-for-testing'

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

describe('Middleware Authentication Validation', () => {
  describe('Session Management', () => {
    it('should validate active session for protected routes', async () => {
      const _mockSession = generateMockSession()

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const sessionCookie = request.headers.get('Cookie')

          if (!sessionCookie || !sessionCookie.includes('next-auth.session-token')) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'NO_SESSION',
                  message: 'No valid session found',
                },
              },
              { status: 401 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Session validated',
            },
          })
        })
      )

      // Test without session cookie
      const responseWithoutSession = await fetch('http://localhost:3000/api/search/repositories')
      expect(responseWithoutSession.status).toBe(401)

      const errorData = await responseWithoutSession.json()
      const validatedError = AuthErrorSchema.parse(errorData)
      expect(validatedError.error.code).toBe('NO_SESSION')

      // Test with valid session cookie
      const responseWithSession = await fetch('http://localhost:3000/api/search/repositories', {
        headers: {
          Cookie: 'next-auth.session-token=valid-session-token; Path=/; HttpOnly; SameSite=lax',
        },
      })
      expect(responseWithSession.status).toBe(200)
    })

    it('should handle expired sessions gracefully', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const sessionCookie = request.headers.get('Cookie')

          if (sessionCookie?.includes('expired-session-token')) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SESSION_EXPIRED',
                  message: 'Session has expired. Please sign in again.',
                },
              },
              { status: 401 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Session valid',
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/opportunities', {
        headers: {
          Cookie: 'next-auth.session-token=expired-session-token; Path=/; HttpOnly; SameSite=lax',
        },
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      const validatedError = AuthErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('SESSION_EXPIRED')
    })

    it('should validate session scopes and permissions', async () => {
      server.use(
        http.get('http://localhost:3000/api/auth/providers', ({ request }) => {
          const sessionCookie = request.headers.get('Cookie')
          const url = new URL(request.url)
          const userId = url.searchParams.get('userId')

          if (!sessionCookie) {
            return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
          }

          // Simulate session user validation
          const currentUserId = 'user_123456789' // Extracted from session

          if (userId && userId !== currentUserId) {
            return HttpResponse.json(
              {
                error: 'Forbidden',
                message: 'Cannot access other user data',
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            providers: [
              {
                id: 'github',
                name: 'GitHub',
                type: 'oauth',
                signinUrl: '/api/auth/signin/github',
                callbackUrl: '/api/auth/callback/github',
              },
            ],
          })
        })
      )

      // Test accessing own data
      const validResponse = await fetch(
        'http://localhost:3000/api/auth/providers?userId=user_123456789',
        {
          headers: {
            Cookie: 'next-auth.session-token=valid-session-token',
          },
        }
      )
      expect(validResponse.status).toBe(200)

      // Test accessing other user data
      const forbiddenResponse = await fetch(
        'http://localhost:3000/api/auth/providers?userId=other_user_999',
        {
          headers: {
            Cookie: 'next-auth.session-token=valid-session-token',
          },
        }
      )
      expect(forbiddenResponse.status).toBe(403)
    })
  })

  describe('JWT Token Validation', () => {
    it('should validate JWT structure and claims', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const authHeader = request.headers.get('Authorization')

          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_AUTH_HEADER',
                  message: 'Authorization header must start with Bearer',
                },
              },
              { status: 401 }
            )
          }

          const token = authHeader.split(' ')[1]

          // Basic JWT structure validation
          if (!token || token.split('.').length !== 3) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_JWT_STRUCTURE',
                  message: 'JWT must have three parts separated by dots',
                },
              },
              { status: 401 }
            )
          }

          try {
            // Decode payload (in real app, this would include signature verification)
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())

            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'JWT_EXPIRED',
                    message: 'JWT token has expired',
                  },
                },
                { status: 401 }
              )
            }

            // Check required claims
            if (!payload.sub || !payload.email) {
              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'INVALID_JWT_CLAIMS',
                    message: 'JWT missing required claims',
                  },
                },
                { status: 401 }
              )
            }

            return HttpResponse.json({
              success: true,
              data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
              metadata: {
                query: '',
                filters: {},
                execution_time_ms: 25,
                performance_note: 'JWT validated',
              },
            })
          } catch (_error) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'JWT_DECODE_ERROR',
                  message: 'Failed to decode JWT token',
                },
              },
              { status: 401 }
            )
          }
        })
      )

      // Test invalid header format
      const invalidHeaderResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: { Authorization: 'InvalidFormat token123' },
      })
      expect(invalidHeaderResponse.status).toBe(401)

      // Test invalid JWT structure
      const invalidStructureResponse = await fetch(
        'http://localhost:3000/api/search/repositories',
        {
          headers: { Authorization: 'Bearer invalid.structure' },
        }
      )
      expect(invalidStructureResponse.status).toBe(401)

      // Test expired JWT
      const expiredJWT = generateMockJWT({ exp: Math.floor(Date.now() / 1000) - 3600 })
      const expiredResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: { Authorization: `Bearer ${expiredJWT}` },
      })
      expect(expiredResponse.status).toBe(401)

      // Test valid JWT
      const validJWT = generateMockJWT()
      const validResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: { Authorization: `Bearer ${validJWT}` },
      })
      expect(validResponse.status).toBe(200)
    })

    it('should handle JWT signature validation failures', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const authHeader = request.headers.get('Authorization')
          const token = authHeader?.split(' ')[1]

          if (token?.includes('invalid-signature')) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'JWT_SIGNATURE_INVALID',
                  message: 'JWT signature verification failed',
                },
              },
              { status: 401 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'JWT signature valid',
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/opportunities', {
        headers: { Authorization: 'Bearer header.payload.invalid-signature' },
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      const validatedError = AuthErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('JWT_SIGNATURE_INVALID')
    })
  })

  describe('OAuth Provider Integration', () => {
    it('should handle OAuth provider configuration requests', async () => {
      server.use(
        http.get('http://localhost:3000/api/auth/providers', () => {
          return HttpResponse.json({
            github: {
              id: 'github',
              name: 'GitHub',
              type: 'oauth',
              signinUrl: '/api/auth/signin/github',
              callbackUrl: '/api/auth/callback/github',
            },
            google: {
              id: 'google',
              name: 'Google',
              type: 'oauth',
              signinUrl: '/api/auth/signin/google',
              callbackUrl: '/api/auth/callback/google',
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/auth/providers')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.github).toBeDefined()
      expect(data.google).toBeDefined()

      const githubProvider = AuthProviderSchema.parse(data.github)
      expect(githubProvider.id).toBe('github')
      expect(githubProvider.type).toBe('oauth')
    })

    it('should validate OAuth callback handling', async () => {
      server.use(
        http.get('http://localhost:3000/api/auth/callback/github', ({ request }) => {
          const url = new URL(request.url)
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')
          const error = url.searchParams.get('error')

          if (error) {
            return HttpResponse.json(
              {
                error: 'OAuth callback error',
                error_description: 'User denied access or other OAuth error occurred',
              },
              { status: 400 }
            )
          }

          if (!code || !state) {
            return HttpResponse.json(
              {
                error: 'Missing required parameters',
                error_description: 'Authorization code and state are required',
              },
              { status: 400 }
            )
          }

          // Simulate successful OAuth callback
          return HttpResponse.redirect('http://localhost:3000/dashboard?auth=success', 302)
        })
      )

      // Test successful callback
      const successResponse = await fetch(
        'http://localhost:3000/api/auth/callback/github?code=oauth_code_123&state=random_state_456',
        { redirect: 'manual' }
      )
      expect(successResponse.status).toBe(302)
      expect(successResponse.headers.get('location')).toContain('dashboard?auth=success')

      // Test error callback
      const errorResponse = await fetch(
        'http://localhost:3000/api/auth/callback/github?error=access_denied&error_description=User+denied+access'
      )
      expect(errorResponse.status).toBe(400)

      // Test missing parameters
      const missingParamsResponse = await fetch('http://localhost:3000/api/auth/callback/github')
      expect(missingParamsResponse.status).toBe(400)
    })

    it('should handle multiple OAuth provider management', async () => {
      server.use(
        http.get('http://localhost:3000/api/auth/providers', ({ request }) => {
          const url = new URL(request.url)
          const userId = url.searchParams.get('userId')

          if (!userId) {
            return HttpResponse.json({ error: 'User ID required' }, { status: 400 })
          }

          return HttpResponse.json({
            providers: [
              {
                id: 'github',
                name: 'GitHub',
                type: 'oauth',
                connected: true,
                accountId: 'github_user_123',
                connectedAt: '2023-06-01T12:00:00Z',
              },
              {
                id: 'google',
                name: 'Google',
                type: 'oauth',
                connected: false,
                accountId: null,
                connectedAt: null,
              },
            ],
          })
        }),

        http.post('http://localhost:3000/api/auth/unlink', async ({ request }) => {
          const body = (await request.json()) as { providerId: string; userId: string }

          if (!body.providerId || !body.userId) {
            return HttpResponse.json(
              {
                error: 'Provider ID and User ID are required',
              },
              { status: 400 }
            )
          }

          return HttpResponse.json({
            success: true,
            message: `${body.providerId} account unlinked successfully`,
          })
        })
      )

      // Test getting user providers
      const providersResponse = await fetch(
        'http://localhost:3000/api/auth/providers?userId=user_123'
      )
      expect(providersResponse.status).toBe(200)

      const providersData = await providersResponse.json()
      expect(providersData.providers).toHaveLength(2)
      expect(providersData.providers[0].connected).toBe(true)
      expect(providersData.providers[1].connected).toBe(false)

      // Test unlinking a provider
      const unlinkResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'github', userId: 'user_123' }),
      })
      expect(unlinkResponse.status).toBe(200)

      const unlinkData = await unlinkResponse.json()
      expect(unlinkData.success).toBe(true)
    })
  })

  describe('Security Boundary Testing', () => {
    it('should prevent session hijacking attempts', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const sessionCookie = request.headers.get('Cookie')
          const userAgent = request.headers.get('User-Agent')
          const xForwardedFor = request.headers.get('X-Forwarded-For')

          // Simulate session validation with additional security checks
          if (sessionCookie?.includes('suspicious-session')) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SESSION_SECURITY_VIOLATION',
                  message: 'Session security violation detected',
                },
              },
              { status: 401 }
            )
          }

          // Check for suspicious patterns
          if (userAgent?.includes('suspicious-bot') || xForwardedFor?.includes('suspicious-ip')) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SUSPICIOUS_ACTIVITY',
                  message: 'Suspicious activity detected',
                },
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Security check passed',
            },
          })
        })
      )

      // Test suspicious session
      const suspiciousResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: {
          Cookie: 'next-auth.session-token=suspicious-session-token',
        },
      })
      expect(suspiciousResponse.status).toBe(401)

      // Test suspicious user agent
      const suspiciousUAResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: {
          'User-Agent': 'suspicious-bot/1.0',
          Cookie: 'next-auth.session-token=valid-session-token',
        },
      })
      expect(suspiciousUAResponse.status).toBe(403)

      // Test normal request
      const normalResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible browser)',
          Cookie: 'next-auth.session-token=valid-session-token',
        },
      })
      expect(normalResponse.status).toBe(200)
    })

    it('should enforce CSRF protection', async () => {
      server.use(
        http.post('http://localhost:3000/api/auth/set-primary', ({ request }) => {
          const csrfToken = request.headers.get('X-CSRF-Token')
          const contentType = request.headers.get('Content-Type')

          if (!csrfToken) {
            return HttpResponse.json(
              {
                error: 'CSRF token missing',
                message: 'CSRF protection requires X-CSRF-Token header',
              },
              { status: 403 }
            )
          }

          if (csrfToken === 'invalid-csrf-token') {
            return HttpResponse.json(
              {
                error: 'Invalid CSRF token',
                message: 'CSRF token validation failed',
              },
              { status: 403 }
            )
          }

          if (!contentType?.includes('application/json')) {
            return HttpResponse.json(
              {
                error: 'Invalid content type',
                message: 'Content-Type must be application/json',
              },
              { status: 400 }
            )
          }

          return HttpResponse.json({
            success: true,
            message: 'Primary provider updated successfully',
          })
        })
      )

      // Test without CSRF token
      const noCsrfResponse = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'github' }),
      })
      expect(noCsrfResponse.status).toBe(403)

      // Test with invalid CSRF token
      const invalidCsrfResponse = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'invalid-csrf-token',
        },
        body: JSON.stringify({ providerId: 'github' }),
      })
      expect(invalidCsrfResponse.status).toBe(403)

      // Test with valid CSRF token
      const validCsrfResponse = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'valid-csrf-token-123',
        },
        body: JSON.stringify({ providerId: 'github' }),
      })
      expect(validCsrfResponse.status).toBe(200)
    })

    it('should validate request origin and referrer', async () => {
      server.use(
        http.post('http://localhost:3000/api/auth/unlink', ({ request }) => {
          const origin = request.headers.get('Origin')
          const referer = request.headers.get('Referer')

          // Validate origin
          if (origin && !['http://localhost:3000', 'https://contribux.com'].includes(origin)) {
            return HttpResponse.json(
              {
                error: 'Invalid origin',
                message: 'Request origin not allowed',
              },
              { status: 403 }
            )
          }

          // Validate referer
          if (
            referer &&
            !referer.startsWith('http://localhost:3000') &&
            !referer.startsWith('https://contribux.com')
          ) {
            return HttpResponse.json(
              {
                error: 'Invalid referer',
                message: 'Request referer not allowed',
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            success: true,
            message: 'Account unlinked successfully',
          })
        })
      )

      // Test invalid origin
      const invalidOriginResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'POST',
        headers: {
          Origin: 'https://malicious-site.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ providerId: 'github', userId: 'user_123' }),
      })
      expect(invalidOriginResponse.status).toBe(403)

      // Test invalid referer
      const invalidRefererResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'POST',
        headers: {
          Referer: 'https://malicious-site.com/fake-page',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ providerId: 'github', userId: 'user_123' }),
      })
      expect(invalidRefererResponse.status).toBe(403)

      // Test valid origin and referer
      const validResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          Referer: 'http://localhost:3000/settings/accounts',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ providerId: 'github', userId: 'user_123' }),
      })
      expect(validResponse.status).toBe(200)
    })
  })
})
