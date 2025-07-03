/**
 * MSW Security API Handlers
 * Comprehensive mocking for security endpoints including health checks and WebAuthn
 */

import { http, HttpResponse } from 'msw'

// Base URLs
const BASE_URL = 'http://localhost:3000'

// Mock security configurations and data
export const mockSecurityData = {
  healthyStatus: {
    timestamp: '2024-07-01T12:00:00.000Z',
    status: 'healthy' as const,
    services: {
      database: 'connected' as const,
      webauthn: 'available' as const,
      rateLimit: 'active' as const,
      securityHeaders: 'enabled' as const,
    },
    features: {
      webauthnEnabled: true,
      rateLimitingEnabled: true,
      advancedMonitoringEnabled: true,
      securityDashboardEnabled: true,
    },
    metrics: {
      totalWebAuthnCredentials: 25,
      activeUserSessions: 14,
      recentSecurityEvents: 3,
    },
    configuration: {
      environment: 'test',
      webauthnRpId: 'localhost',
      securityLevel: 'enterprise' as const,
    },
  },

  warningStatus: {
    timestamp: '2024-07-01T12:00:00.000Z',
    status: 'warning' as const,
    services: {
      database: 'connected' as const,
      webauthn: 'unavailable' as const,
      rateLimit: 'active' as const,
      securityHeaders: 'enabled' as const,
    },
    features: {
      webauthnEnabled: true,
      rateLimitingEnabled: true,
      advancedMonitoringEnabled: false,
      securityDashboardEnabled: false,
    },
    configuration: {
      environment: 'test',
      webauthnRpId: 'localhost',
      securityLevel: 'enhanced' as const,
    },
  },

  criticalStatus: {
    timestamp: '2024-07-01T12:00:00.000Z',
    status: 'critical' as const,
    services: {
      database: 'error' as const,
      webauthn: 'unavailable' as const,
      rateLimit: 'inactive' as const,
      securityHeaders: 'disabled' as const,
    },
    features: {
      webauthnEnabled: false,
      rateLimitingEnabled: false,
      advancedMonitoringEnabled: false,
      securityDashboardEnabled: false,
    },
    configuration: {
      environment: 'test',
      webauthnRpId: '',
      securityLevel: 'basic' as const,
    },
  },

  webauthnRegistrationOptions: {
    success: true,
    options: {
      rp: {
        id: 'localhost',
        name: 'Contribux',
      },
      user: {
        id: 'user-123-buffer',
        name: 'test@example.com',
        displayName: 'Test User',
      },
      challenge: 'mock-challenge-buffer-data',
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      timeout: 300000,
      attestation: 'none',
      excludeCredentials: [],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    },
    challenge: 'mock-challenge-buffer-data',
  },

  webauthnAuthenticationOptions: {
    success: true,
    options: {
      challenge: 'mock-auth-challenge-buffer',
      timeout: 300000,
      rpId: 'localhost',
      allowCredentials: [
        {
          id: 'mock-credential-id-buffer',
          type: 'public-key',
          transports: ['internal', 'hybrid'],
        },
      ],
      userVerification: 'required',
    },
    challenge: 'mock-auth-challenge-buffer',
  },

  webauthnVerificationSuccess: {
    success: true,
    verified: true,
    credentialId: 'mock-credential-id',
    message: 'WebAuthn registration successful',
  },

  webauthnVerificationFailure: {
    success: false,
    verified: false,
    error: 'Verification failed',
    message: 'Invalid signature or challenge',
  },
}

// Helper to check authentication
const isAuthenticated = (request: Request): boolean => {
  const authHeader = request.headers.get('authorization')
  const sessionCookie = request.headers.get('cookie')

  return !!(
    authHeader?.includes('Bearer ') ||
    sessionCookie?.includes('next-auth.session-token') ||
    sessionCookie?.includes('authjs.session-token')
  )
}

// Helper to create cache headers
const createCacheHeaders = () => ({
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
})

// Security health endpoint handlers
export const securityHealthHandlers = [
  // GET /api/security/health - Normal healthy response
  http.get(`${BASE_URL}/api/security/health`, ({ request }) => {
    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')

    // Handle different test scenarios
    switch (scenario) {
      case 'warning':
        return HttpResponse.json(mockSecurityData.warningStatus, {
          status: 200,
          headers: createCacheHeaders(),
        })

      case 'critical':
        return HttpResponse.json(mockSecurityData.criticalStatus, {
          status: 503,
          headers: createCacheHeaders(),
        })

      case 'error':
        return HttpResponse.json(
          {
            timestamp: new Date().toISOString(),
            status: 'critical',
            error: 'Health check failed',
            message: 'Database connection timeout',
          },
          { status: 503 }
        )

      case 'slow':
        // Simulate slow response for performance testing
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(
              HttpResponse.json(mockSecurityData.healthyStatus, {
                headers: createCacheHeaders(),
              })
            )
          }, 2000)
        })

      default:
        return HttpResponse.json(mockSecurityData.healthyStatus, {
          headers: createCacheHeaders(),
        })
    }
  }),
]

// WebAuthn endpoint handlers
export const webauthnHandlers = [
  // POST /api/security/webauthn/register/options
  http.post(`${BASE_URL}/api/security/webauthn/register/options`, ({ request }) => {
    if (!isAuthenticated(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')

    switch (scenario) {
      case 'disabled':
        return HttpResponse.json({ error: 'WebAuthn is not enabled' }, { status: 403 })

      case 'error':
        return HttpResponse.json(
          { error: 'Failed to generate registration options' },
          { status: 500 }
        )

      default:
        return HttpResponse.json(mockSecurityData.webauthnRegistrationOptions)
    }
  }),

  // POST /api/security/webauthn/register/verify
  http.post(`${BASE_URL}/api/security/webauthn/register/verify`, async ({ request }) => {
    if (!isAuthenticated(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      const body = (await request.json()) as Record<string, unknown>
      const url = new URL(request.url)
      const scenario = url.searchParams.get('scenario')

      if (!body.credential || !body.challenge) {
        return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      switch (scenario) {
        case 'failure':
          return HttpResponse.json(mockSecurityData.webauthnVerificationFailure, {
            status: 400,
          })

        case 'invalid-challenge':
          return HttpResponse.json({ error: 'Invalid challenge' }, { status: 400 })

        default:
          return HttpResponse.json(mockSecurityData.webauthnVerificationSuccess)
      }
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
  }),

  // POST /api/security/webauthn/authenticate/options
  http.post(`${BASE_URL}/api/security/webauthn/authenticate/options`, ({ request }) => {
    if (!isAuthenticated(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario')

    switch (scenario) {
      case 'no-credentials':
        return HttpResponse.json({
          ...mockSecurityData.webauthnAuthenticationOptions,
          options: {
            ...mockSecurityData.webauthnAuthenticationOptions.options,
            allowCredentials: [],
          },
        })

      case 'error':
        return HttpResponse.json(
          { error: 'Failed to generate authentication options' },
          { status: 500 }
        )

      default:
        return HttpResponse.json(mockSecurityData.webauthnAuthenticationOptions)
    }
  }),

  // POST /api/security/webauthn/authenticate/verify
  http.post(`${BASE_URL}/api/security/webauthn/authenticate/verify`, async ({ request }) => {
    if (!isAuthenticated(request)) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    try {
      const body = (await request.json()) as Record<string, unknown>
      const url = new URL(request.url)
      const scenario = url.searchParams.get('scenario')

      if (!body.credential || !body.challenge) {
        return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }

      switch (scenario) {
        case 'failure':
          return HttpResponse.json(
            {
              success: false,
              verified: false,
              error: 'Authentication failed',
            },
            { status: 401 }
          )

        case 'invalid-signature':
          return HttpResponse.json({ error: 'Invalid signature' }, { status: 400 })

        default:
          return HttpResponse.json({
            success: true,
            verified: true,
            credentialId: 'mock-credential-id',
            message: 'Authentication successful',
          })
      }
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
  }),
]

// Rate limiting and security middleware handlers
export const securityMiddlewareHandlers = [
  // Rate limiting simulation
  http.all(`${BASE_URL}/api/*`, ({ request }) => {
    const url = new URL(request.url)
    const testRateLimit = url.searchParams.get('test-rate-limit')

    if (testRateLimit === 'exceeded') {
      return HttpResponse.json(
        {
          error: 'Rate limit exceeded',
          resetTime: Date.now() + 60000,
          limit: 100,
          remaining: 0,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor((Date.now() + 60000) / 1000)),
            'Retry-After': '60',
          },
        }
      )
    }

    // Pass through to other handlers
    return
  }),

  // Security headers validation
  http.all(`${BASE_URL}/api/*`, ({ request }) => {
    const url = new URL(request.url)
    const testSecurity = url.searchParams.get('test-security')

    if (testSecurity === 'headers') {
      // Check for security headers in response
      return HttpResponse.json(
        { message: 'Security headers applied' },
        {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy': "default-src 'self'",
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        }
      )
    }

    // Pass through to other handlers
    return
  }),
]

// Error simulation handlers for security testing
export const securityErrorHandlers = [
  // Simulate various error conditions
  http.get(`${BASE_URL}/api/security/test-error/:type`, ({ params }) => {
    const errorType = params.type as string

    switch (errorType) {
      case 'timeout':
        return new Promise(() => {
          // Never resolve to simulate timeout
        })

      case 'network':
        return HttpResponse.error()

      case 'server-error':
        return HttpResponse.json({ error: 'Internal server error' }, { status: 500 })

      case 'unauthorized':
        return HttpResponse.json({ error: 'Unauthorized access' }, { status: 401 })

      case 'forbidden':
        return HttpResponse.json({ error: 'Access forbidden' }, { status: 403 })

      default:
        return HttpResponse.json({ error: 'Unknown error type' }, { status: 400 })
    }
  }),
]

// Combine all security handlers
export const securityHandlers = [
  ...securityHealthHandlers,
  ...webauthnHandlers,
  ...securityMiddlewareHandlers,
  ...securityErrorHandlers,
]

// Export individual handler groups for targeted testing
export default securityHandlers
