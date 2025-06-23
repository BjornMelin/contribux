// Note: JWT, GDPR, audit and database mocks are handled in tests/setup.ts

// Mock environment validation to provide test-safe values
vi.mock('@/lib/validation/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-32-chars-minimum',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'Test Contribux',
    WEBAUTHN_ORIGINS: 'http://localhost:3000',
    ENABLE_OAUTH: false,
    GITHUB_CLIENT_ID: '',
    GITHUB_CLIENT_SECRET: '',
    REDIS_URL: undefined,
    MAINTENANCE_MODE: false,
    MAINTENANCE_BYPASS_TOKEN: undefined,
    ALLOWED_REDIRECT_URIS: 'http://localhost:3000/auth/callback',
    RATE_LIMIT_MAX: 60,
    RATE_LIMIT_WINDOW_MS: 60000,
    ENCRYPTION_KEY: undefined,
    ALLOWED_ORIGINS: 'http://localhost:3000',
  },
  getJwtSecret: vi.fn(() => 'test-jwt-secret-for-unit-tests-only-32-chars-minimum'),
  generateEncryptionKey: vi.fn(() => 'test-encryption-key-32-chars-min'),
  validateStartup: vi.fn(() => ({ success: true, errors: [] })),
}))

// Import types first
import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessTokenPayload, User } from '@/types/auth'

// Mock config to avoid complex env validation issues
vi.mock('@/lib/config', () => ({
  authConfig: {
    jwt: {
      accessTokenExpiry: 900, // 15 minutes
      refreshTokenExpiry: 604800, // 7 days
    },
    rateLimit: {
      max: 60,
      windowMs: 60000,
    },
    security: {
      failedLoginWindow: 300000,
      maxFailedLogins: 5,
      failedLoginThreshold: 5,
    },
  },
  config: {
    auth: {
      security: {
        failedLoginWindow: 300000,
        maxFailedLogins: 5,
      },
    },
    oauth: {
      stateExpiry: 300000,
    },
    database: {
      healthCheckInterval: 30000,
    },
  },
}))

// Mock Redis and rate-limiter-flexible
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => ({
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    })),
  }
})

vi.mock('rate-limiter-flexible', () => {
  const createMockRateLimiter = (options?: { points?: number; duration?: number }) => {
    const limit = options?.points || 60
    return {
      consume: vi.fn().mockResolvedValue({
        remainingPoints: limit - 1,
        msBeforeNext: (options?.duration || 60) * 1000,
      }),
      deleteInMemoryBlockedAll: vi.fn(),
      points: limit,
      duration: options?.duration || 60,
      msDuration: (options?.duration || 60) * 1000,
      blockDuration: options?.blockDuration || 60,
      msBlockDuration: (options?.blockDuration || 60) * 1000,
      keyPrefix: options?.keyPrefix || 'test',
      execEvenly: options?.execEvenly !== false,
      execEvenlyMinDelayMs: 0,
      insuranceLimiter: null,
      storeClient: options?.storeClient || null,
      get: vi.fn(),
      set: vi.fn(),
      block: vi.fn(),
      penalty: vi.fn(),
      reward: vi.fn(),
      delete: vi.fn(),
      getKey: vi.fn((key: string) => `${options?.keyPrefix || 'test'}_${key}`),
      parseKey: vi.fn((key: string) => key.replace(`${options?.keyPrefix || 'test'}_`, '')),
    }
  }

  return {
    RateLimiterRedis: vi.fn().mockImplementation(createMockRateLimiter),
    RateLimiterMemory: vi.fn().mockImplementation(createMockRateLimiter),
  }
})

// Mock JWT functions for middleware tests
vi.mock('@/lib/auth/jwt', () => ({
  verifyAccessToken: vi.fn(),
  generateAccessToken: vi.fn(async () => 'mock-access-token'),
  generateRefreshToken: vi.fn(async () => 'mock-refresh-token'),
}))

// Mock GDPR functions for middleware tests
vi.mock('@/lib/auth/gdpr', () => ({
  checkConsentRequired: vi.fn(),
  recordUserConsent: vi.fn(),
  revokeUserConsent: vi.fn(),
  getUserConsents: vi.fn(() => Promise.resolve([])),
  exportUserData: vi.fn(),
  deleteUserData: vi.fn(),
  anonymizeUserData: vi.fn(),
  getDataRetentionPolicy: vi.fn(),
  identifyDataForDeletion: vi.fn(),
  logDataProcessing: vi.fn(),
  getConsentOptions: vi.fn(),
  checkGDPRCompliance: vi.fn(),
  handleConsentWithdrawal: vi.fn(),
  CONSENT_TYPES: {
    TERMS_OF_SERVICE: 'terms_of_service',
    PRIVACY_POLICY: 'privacy_policy',
    MARKETING_EMAILS: 'marketing_emails',
    USAGE_ANALYTICS: 'usage_analytics',
    THIRD_PARTY_SHARING: 'third_party_sharing',
  },
}))

// Import modules after mocking
import { logSecurityEvent } from '@/lib/auth/audit'
import { checkConsentRequired } from '@/lib/auth/gdpr'
import { verifyAccessToken } from '@/lib/auth/jwt'
import {
  auditRequest,
  authMiddleware,
  checkMaintenanceMode,
  getRateLimiterStatus,
  rateLimit,
  requireAuth,
  requireConsent,
  requireTwoFactor,
  shutdownRateLimiter,
  validateCSRF,
} from '@/lib/auth/middleware'
import { sql } from '@/lib/db/config'

// Helper to create a complete mock rate limiter
const createMockRateLimiterInstance = (
  overrides?: Partial<{ points: number; duration: number }>
) => {
  const limit = overrides?.points || 60
  const duration = overrides?.duration || 60

  return {
    consume: vi.fn().mockResolvedValue({
      remainingPoints: limit - 1,
      msBeforeNext: duration * 1000,
    }),
    deleteInMemoryBlockedAll: vi.fn(),
    points: limit,
    duration: duration,
    msDuration: duration * 1000,
    blockDuration: overrides?.blockDuration || 60,
    msBlockDuration: (overrides?.blockDuration || 60) * 1000,
    keyPrefix: overrides?.keyPrefix || 'test',
    execEvenly: overrides?.execEvenly !== false,
    execEvenlyMinDelayMs: 0,
    insuranceLimiter: null,
    storeClient: overrides?.storeClient || null,
    get: vi.fn(),
    set: vi.fn(),
    block: vi.fn(),
    penalty: vi.fn(),
    reward: vi.fn(),
    delete: vi.fn(),
    getKey: vi.fn((key: string) => `${overrides?.keyPrefix || 'test'}_${key}`),
    parseKey: vi.fn((key: string) => key.replace(`${overrides?.keyPrefix || 'test'}_`, '')),
    ...overrides,
  }
}

describe('Route Protection Middleware', () => {
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    github_username: 'testuser',
    email_verified: true,
    two_factor_enabled: false,
    recovery_email: null,
    locked_at: null,
    failed_login_attempts: 0,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  }

  beforeEach(async () => {
    // Clear all mocks first
    vi.clearAllMocks()

    // Clear any environment variables that might affect tests
    delete process.env.REDIS_URL
    delete process.env.MAINTENANCE_MODE
    delete process.env.MAINTENANCE_BYPASS_TOKEN

    // Reset specific mocks
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(sql).mockReset()
    vi.mocked(logSecurityEvent).mockReset()
    vi.mocked(checkConsentRequired).mockReset()

    // Reset rate limiter mocks
    try {
      const rateLimiterModule = await import('rate-limiter-flexible')
      if (
        rateLimiterModule.RateLimiterRedis &&
        typeof (rateLimiterModule.RateLimiterRedis as unknown as { mockClear?: () => void })
          .mockClear === 'function'
      ) {
        ;(rateLimiterModule.RateLimiterRedis as unknown as { mockClear: () => void }).mockClear()
      }
      if (
        rateLimiterModule.RateLimiterMemory &&
        typeof (rateLimiterModule.RateLimiterMemory as unknown as { mockClear?: () => void })
          .mockClear === 'function'
      ) {
        ;(rateLimiterModule.RateLimiterMemory as unknown as { mockClear: () => void }).mockClear()
      }
    } catch {
      // Ignore errors in test environment
    }

    // Cleanup rate limiter before each test
    await shutdownRateLimiter()
  })

  afterEach(async () => {
    // Clean up rate limiter connections
    await shutdownRateLimiter()
    // Clean up any environment variables that tests might have set
    delete process.env.MAINTENANCE_MODE
    delete process.env.MAINTENANCE_BYPASS_TOKEN
    delete process.env.REDIS_URL
  })

  describe('authMiddleware', () => {
    it('should allow public routes without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/')
      const response = await authMiddleware(request)

      expect(response).toBeUndefined() // Passes through
    })

    it('should allow auth routes without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/auth/login')
      const response = await authMiddleware(request)

      expect(response).toBeUndefined() // Passes through
    })

    it('should require authentication for protected routes', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)
      expect(response?.headers.get('content-type')).toContain('application/json')
    })

    it('should validate access token from Authorization header', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      const tokenPayload: AccessTokenPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api'],
        jti: 'jwt-id-123',
      }
      if (mockUser.github_username) {
        tokenPayload.github_username = mockUser.github_username
      }
      mockVerifyToken.mockResolvedValueOnce(tokenPayload)

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists

      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })

      const response = await authMiddleware(request)

      expect(mockVerifyToken).toHaveBeenCalledWith('valid-token')
      expect(response).toBeUndefined() // Passes through
    })

    it('should validate access token from cookies', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      const mockSql = vi.mocked(sql)
      const mockLogEvent = vi.mocked(logSecurityEvent)

      // Clear mocks before test
      mockVerifyToken.mockClear()
      mockSql.mockClear()
      mockLogEvent.mockClear()

      // Mock log event for rate limiting audit
      mockLogEvent.mockResolvedValue({} as Record<string, unknown>)

      const tokenPayload: AccessTokenPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api'],
        jti: 'jwt-id-123',
      }
      if (mockUser.github_username) {
        tokenPayload.github_username = mockUser.github_username
      }

      // Setup mocks BEFORE creating the request
      mockVerifyToken.mockResolvedValueOnce(tokenPayload)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists

      const request = new NextRequest('http://localhost:3000/api/user')
      request.cookies.set('access_token', 'valid-token')

      const response = await authMiddleware(request)

      expect(mockVerifyToken).toHaveBeenCalledWith('valid-token')
      expect(response).toBeUndefined() // Passes through
    })

    it('should reject expired tokens', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockRejectedValueOnce(new Error('Token expired'))

      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValueOnce({} as Record<string, unknown>)

      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          Authorization: 'Bearer expired-token',
        },
      })

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body.error).toBe('Token expired')
    })

    it('should handle rate limiting', async () => {
      // Make sure maintenance mode is OFF
      delete process.env.MAINTENANCE_MODE

      const mockVerifyToken = vi.mocked(verifyAccessToken)
      const tokenPayload: AccessTokenPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api'],
        jti: 'jwt-id-123',
      }
      if (mockUser.github_username) {
        tokenPayload.github_username = mockUser.github_username
      }

      mockVerifyToken.mockResolvedValue(tokenPayload)

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValue([mockUser])

      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValue({} as Record<string, unknown>)

      // Use a unique IP for this test to avoid conflicts
      const uniqueIp = `192.168.104.${Math.floor(Math.random() * 255)}`

      // Pre-exhaust the rate limit using the default rate limiter (60 requests)
      // We need to make 60 requests to exhaust the default limit
      for (let i = 0; i < 60; i++) {
        const req = new NextRequest('http://localhost:3000/api/test', {
          headers: {
            'x-forwarded-for': uniqueIp,
          },
        })
        const result = await rateLimit(req)
        if (i < 59) {
          expect(result.allowed).toBe(true)
        } else {
          // Last request should still be allowed (60th request)
          expect(result.allowed).toBe(true)
        }
      }

      // Now make one more request that should be rate limited
      const exhaustReq = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': uniqueIp,
        },
      })
      const exhaustResult = await rateLimit(exhaustReq)
      expect(exhaustResult.allowed).toBe(false)

      // Now the request through authMiddleware should also be rate limited
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          Authorization: 'Bearer valid-token',
          'x-forwarded-for': uniqueIp,
        },
      })

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(429)
      expect(response?.headers.get('x-ratelimit-limit')).toBe('60')
      expect(response?.headers.get('x-ratelimit-remaining')).toBe('0')
      expect(response?.headers.get('retry-after')).toBeDefined()
    })

    it('should check maintenance mode', async () => {
      // Mock maintenance mode active
      process.env.MAINTENANCE_MODE = 'true'

      const request = new NextRequest('http://localhost:3000/api/user')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(503)
      const body = await response?.json()
      expect(body.error).toBe('Service under maintenance')

      // Cleanup
      delete process.env.MAINTENANCE_MODE
    })

    it('should validate CSRF tokens for mutations', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      const tokenPayload: AccessTokenPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api'],
        jti: 'jwt-id-123',
      }
      if (mockUser.github_username) {
        tokenPayload.github_username = mockUser.github_username
      }
      mockVerifyToken.mockResolvedValueOnce(tokenPayload)

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists

      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValueOnce({} as Record<string, unknown>)

      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test' }),
      })

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(403)
      const body = await response?.json()
      expect(body.error).toBe('Invalid CSRF token')
    })

    it('should allow mutations with valid CSRF token', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      const tokenPayload: AccessTokenPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api'],
        jti: 'jwt-id-123',
      }
      if (mockUser.github_username) {
        tokenPayload.github_username = mockUser.github_username
      }
      mockVerifyToken.mockResolvedValueOnce(tokenPayload)

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists

      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test' }),
      })
      request.cookies.set('csrf_token', 'valid-csrf-token')

      const response = await authMiddleware(request)

      expect(response).toBeUndefined() // Passes through
    })

    it('should audit security events', async () => {
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockClear()

      const request = new NextRequest('http://localhost:3000/dashboard')
      const response = await authMiddleware(request)

      // Should get 401 for missing auth
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)

      // Verify audit was called
      expect(mockLogEvent).toHaveBeenCalled()
      const auditCall = mockLogEvent.mock.calls[0]?.[0]
      expect(auditCall.event_type).toBe('authorization_failure')
      expect(auditCall.event_severity).toBe('warning')
      expect(auditCall.success).toBe(false)
    })
  })

  describe('requireAuth', () => {
    it('should pass through authenticated requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      // Mock authenticated request with full auth object including token_payload
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({ ok: true }))
      const wrapped = requireAuth(handler)

      const response = await wrapped(request, {} as any)

      expect(handler).toHaveBeenCalledWith(request, {})
      expect(response).toBeDefined()
    })

    it('should reject unauthenticated requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')

      const handler = vi.fn()
      const wrapped = requireAuth(handler)

      const response = await wrapped(request, {} as any)

      expect(handler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
    })

    it('should support custom error messages', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')

      const handler = vi.fn()
      const wrapped = requireAuth(handler, {
        errorMessage: 'Please log in first',
      })

      const response = await wrapped(request, {} as any)
      const body = await response.json()

      expect(body.error).toBe('Please log in first')
    })
  })

  describe('requireConsent', () => {
    it('should check required consents', async () => {
      const mockCheckConsent = vi.mocked(checkConsentRequired)
      mockCheckConsent.mockClear()
      // Return false for all consent checks (consent not required)
      mockCheckConsent.mockImplementation(async () => false)

      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({ ok: true }))
      const wrapped = requireConsent(['terms_of_service', 'privacy_policy'])(handler)

      const _response = await wrapped(request, {} as any)

      expect(mockCheckConsent).toHaveBeenCalledTimes(2)
      expect(mockCheckConsent).toHaveBeenCalledWith(mockUser.id, 'terms_of_service')
      expect(mockCheckConsent).toHaveBeenCalledWith(mockUser.id, 'privacy_policy')
      expect(handler).toHaveBeenCalled()
    })

    it('should reject when consent is missing', async () => {
      const mockCheckConsent = vi.mocked(checkConsentRequired)
      mockCheckConsent.mockResolvedValueOnce(true) // Consent required

      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      const handler = vi.fn()
      const wrapped = requireConsent(['marketing_emails'])(handler)

      const response = await wrapped(request, {} as any)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Consent required')
      expect(body.required_consents).toContain('marketing_emails')
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('requireTwoFactor', () => {
    it('should pass through for users with 2FA enabled', async () => {
      const request = new NextRequest('http://localhost:3000/api/sensitive')
      ;(request as any).auth = {
        user: { ...mockUser, two_factor_enabled: true },
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({ ok: true }))
      const wrapped = requireTwoFactor(handler)

      const _response = await wrapped(request, {} as any)

      expect(handler).toHaveBeenCalled()
    })

    it('should reject users without 2FA', async () => {
      const request = new NextRequest('http://localhost:3000/api/sensitive')
      ;(request as any).auth = {
        user: { ...mockUser, two_factor_enabled: false },
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      const handler = vi.fn()
      const wrapped = requireTwoFactor(handler)

      const response = await wrapped(request, {} as any)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Two-factor authentication required')
      expect(body.setup_url).toBeDefined()
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('rateLimit', () => {
    it('should track requests by IP', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const result = await rateLimit(request, {
        limit: 10,
        window: 60 * 1000, // 1 minute
      })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeGreaterThanOrEqual(0) // Allow for fallback behavior
      expect(result.limit).toBe(10)
      expect(result.reset).toBeDefined()
    })

    it('should enforce rate limits', async () => {
      // Use a unique IP for this test
      const uniqueIp = `192.168.50.${Math.floor(Math.random() * 255)}`
      const limit = 5

      // First, consume all the allowed requests
      for (let i = 0; i < limit; i++) {
        const req = new NextRequest('http://localhost:3000/api/user', {
          headers: {
            'x-forwarded-for': uniqueIp,
          },
        })
        const res = await rateLimit(req, { limit, window: 60 * 1000 })
        expect(res.allowed).toBe(true)
      }

      // Now the next request should be rate limited
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': uniqueIp,
        },
      })

      const result = await rateLimit(request, { limit, window: 60 * 1000 })

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should support custom keys for rate limiting', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      const result = await rateLimit(request, {
        limit: 100,
        window: 60 * 1000,
        keyGenerator: req => `user:${(req as any).auth?.user?.id}`,
      })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeGreaterThanOrEqual(0) // Allow for fallback behavior
      expect(result.limit).toBe(100)
    })
  })

  describe('Redis Rate Limiting', () => {
    it('should use memory fallback when Redis URL not provided', async () => {
      // Redis URL not set (already cleared in beforeEach)
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const result = await rateLimit(request, {
        limit: 10,
        window: 60 * 1000,
      })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeGreaterThanOrEqual(0) // Allow for fallback behavior
      expect(result.limit).toBe(10)

      const status = getRateLimiterStatus()
      expect(['memory', 'legacy']).toContain(status.activeStore)
      expect(status.redisAvailable).toBe(false)
    })

    it('should provide rate limiter status information', () => {
      const status = getRateLimiterStatus()

      expect(status).toHaveProperty('redisAvailable')
      expect(status).toHaveProperty('memoryFallbackActive')
      expect(status).toHaveProperty('circuitBreakerOpen')
      expect(status).toHaveProperty('redisFailures')
      expect(status).toHaveProperty('activeStore')
      expect(['redis', 'memory', 'legacy']).toContain(status.activeStore)
    })

    it('should handle Redis failures gracefully', async () => {
      // Mock failing rate limiters
      const rateLimiterModule = await import('rate-limiter-flexible')

      if (
        rateLimiterModule.RateLimiterRedis &&
        typeof (rateLimiterModule.RateLimiterRedis as any).mockImplementation === 'function'
      ) {
        ;(rateLimiterModule.RateLimiterRedis as any).mockImplementation(() =>
          createMockRateLimiterInstance({
            consume: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
          })
        )
      }

      if (
        rateLimiterModule.RateLimiterMemory &&
        typeof (rateLimiterModule.RateLimiterMemory as any).mockImplementation === 'function'
      ) {
        ;(rateLimiterModule.RateLimiterMemory as any).mockImplementation(() =>
          createMockRateLimiterInstance({
            consume: vi.fn().mockRejectedValue(new Error('Memory limiter also fails')),
          })
        )
      }

      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const result = await rateLimit(request, {
        limit: 10,
        window: 60 * 1000,
      })

      // Should still work due to legacy fallback
      expect(result.allowed).toBeDefined()
      expect(result.limit).toBe(10)

      // Reset mocks for other tests
      if (
        rateLimiterModule.RateLimiterRedis &&
        typeof (rateLimiterModule.RateLimiterRedis as any).mockImplementation === 'function'
      ) {
        ;(rateLimiterModule.RateLimiterRedis as any).mockImplementation(() =>
          createMockRateLimiterInstance()
        )
      }
      if (
        rateLimiterModule.RateLimiterMemory &&
        typeof (rateLimiterModule.RateLimiterMemory as any).mockImplementation === 'function'
      ) {
        ;(rateLimiterModule.RateLimiterMemory as any).mockImplementation(() =>
          createMockRateLimiterInstance()
        )
      }
    })

    it('should properly handle rate limit exceeded from Redis', async () => {
      // This test verifies that rate limiting returns the correct response
      // when the limit is exceeded. Since we're using the legacy fallback
      // in tests (no Redis configured), we'll test that behavior.

      // Use a unique IP for this test to avoid conflicts with other tests
      const uniqueIp = `192.168.1.${Math.floor(Math.random() * 100) + 101}`
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': uniqueIp,
        },
      })

      // First, make requests to use up the rate limit
      const limit = 5
      const window = 60 * 1000

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        const result = await rateLimit(request, { limit, window })
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(limit - i - 1)
      }

      // The next request should be rate limited
      const rateLimitedResult = await rateLimit(request, { limit, window })

      expect(rateLimitedResult.allowed).toBe(false)
      expect(rateLimitedResult.remaining).toBe(0)
      expect(rateLimitedResult.reset).toBeGreaterThan(Date.now())
      expect(rateLimitedResult.limit).toBe(limit)
    })

    it('should handle custom rate limit options', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const result = await rateLimit(request, {
        limit: 100,
        window: 300 * 1000, // 5 minutes
        keyGenerator: _req => 'custom-key',
      })

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(100)
    })

    it('should gracefully shutdown Redis connections', async () => {
      await shutdownRateLimiter()

      // Should handle graceful shutdown without errors
      expect(true).toBe(true) // Test passes if no errors thrown
    })
  })

  describe('checkMaintenanceMode', () => {
    it('should allow requests when not in maintenance', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      const result = await checkMaintenanceMode(request)

      expect(result).toBe(false)
    })

    it('should block requests during maintenance', async () => {
      process.env.MAINTENANCE_MODE = 'true'

      const request = new NextRequest('http://localhost:3000/api/user')
      const result = await checkMaintenanceMode(request)

      expect(result).toBe(true)

      delete process.env.MAINTENANCE_MODE
    })

    it('should allow admin bypass during maintenance', async () => {
      process.env.MAINTENANCE_MODE = 'true'
      process.env.MAINTENANCE_BYPASS_TOKEN = 'secret-token'

      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'X-Maintenance-Bypass': 'secret-token',
        },
      })

      const result = await checkMaintenanceMode(request)

      expect(result).toBe(false)

      delete process.env.MAINTENANCE_MODE
      delete process.env.MAINTENANCE_BYPASS_TOKEN
    })
  })

  describe('validateCSRF', () => {
    it('should skip CSRF for safe methods', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'GET',
      })

      const result = await validateCSRF(request)

      expect(result).toBe(true)
    })

    it('should validate CSRF token from header', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'valid-token',
        },
      })
      request.cookies.set('csrf_token', 'valid-token')

      const result = await validateCSRF(request)

      expect(result).toBe(true)
    })

    it('should reject mismatched CSRF tokens', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'wrong-token',
        },
      })
      request.cookies.set('csrf_token', 'valid-token')

      const result = await validateCSRF(request)

      expect(result).toBe(false)
    })

    it('should support double-submit cookie pattern', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
      })
      request.cookies.set('csrf_token', 'valid-token')
      request.cookies.set('X-CSRF-Token', 'valid-token')

      const result = await validateCSRF(request)

      expect(result).toBe(true)
    })
  })

  describe('auditRequest', () => {
    it('should log successful requests', async () => {
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockClear()
      mockLogEvent.mockImplementation(
        async () =>
          ({
            id: 'mock-audit-log-id',
            created_at: new Date(),
          }) as any
      )

      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123',
        token_payload: {
          sub: mockUser.id,
          email: mockUser.email,
          auth_method: 'oauth' as const,
          session_id: 'session-123',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 900,
          iss: 'contribux',
          aud: ['contribux-api'],
          jti: 'jwt-id-123',
        } as AccessTokenPayload,
      }

      await auditRequest(request, {
        event_type: 'api_access',
        resource: '/api/user',
        success: true,
      })

      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'api_access',
          user_id: mockUser.id,
          success: true,
          event_data: expect.objectContaining({
            resource: '/api/user',
            method: 'GET',
            session_id: 'session-123',
          }),
        })
      )
    })

    it('should log failed requests with error details', async () => {
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockClear()
      mockLogEvent.mockResolvedValueOnce({} as Record<string, unknown>)

      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      await auditRequest(request, {
        event_type: 'authorization_failure',
        resource: '/api/user',
        success: false,
        error: 'Unauthorized access attempt',
      })

      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'authorization_failure',
          success: false,
          error_message: 'Unauthorized access attempt',
          ip_address: '192.168.1.1',
        })
      )
    })
  })

  describe('Middleware Composition', () => {
    it('should compose multiple middleware functions', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      const tokenPayload: AccessTokenPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api'],
        jti: 'jwt-id-123',
      }
      if (mockUser.github_username) {
        tokenPayload.github_username = mockUser.github_username
      }
      mockVerifyToken.mockResolvedValueOnce(tokenPayload)

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists

      const mockCheckConsent = vi.mocked(checkConsentRequired)
      mockCheckConsent.mockResolvedValue(false)

      const request = new NextRequest('http://localhost:3000/api/protected', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
          'X-CSRF-Token': 'valid-csrf',
          'Content-Type': 'application/json',
        },
      })
      request.cookies.set('csrf_token', 'valid-csrf')

      // Simulate middleware chain
      const authResponse = await authMiddleware(request)
      expect(authResponse).toBeUndefined() // Passes auth

      // Would continue to handler with requireAuth + requireConsent decorators
    })

    it('should handle errors gracefully', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockRejectedValueOnce(new Error('Database connection failed'))

      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(500)
      const body = await response?.json()
      expect(body.error).toBe('Internal server error')
      expect(body.details).toBeUndefined() // Don't leak internal errors
    })
  })
})
