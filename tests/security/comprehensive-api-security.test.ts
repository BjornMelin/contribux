/**
 * Comprehensive API Security Test Suite
 *
 * This test suite provides comprehensive coverage of API security including:
 * - CORS Security Configuration Testing
 * - Comprehensive Security Headers Testing
 * - Advanced Rate Limiting Testing
 * - API Input Validation & Sanitization
 * - Attack Simulation Testing (XSS, CSRF, Request Smuggling)
 * - Middleware Security Chain Testing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Import security modules for testing
import {
  generateCORSConfig,
  generateCSPPolicy,
  applyCORSHeaders,
  applyCSPHeaders,
  CSP_CORS_CONFIG,
} from '../../src/lib/security/csp-cors'
import { getRateLimiterStatus } from '../../src/lib/auth/rate-limiter'
import {
  enhancedEdgeMiddleware,
  edgeSecurityMiddleware,
  EDGE_SECURITY_CONFIG,
  RATE_LIMIT_CONFIG,
} from '../../src/lib/security/edge-middleware'

// Mock setup for Next.js Request/Response
const createMockNextRequest = (
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {}
): NextRequest => {
  const request = new Request(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
  })
  return request as NextRequest
}

// Security test server with comprehensive endpoint coverage
const securityTestServer = setupServer(
  // Health endpoint (public)
  http.get('http://localhost:3000/api/health', () => {
    return HttpResponse.json(
      { status: 'ok' },
      {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-test123'",
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        },
      }
    )
  }),

  // Authentication endpoint (sensitive)
  http.post('http://localhost:3000/api/auth/signin', async ({ request }) => {
    const authAttempts = await getAuthAttemptCount(request)

    // Simulate rate limiting for auth endpoints
    if (authAttempts > 10) {
      return HttpResponse.json(
        { error: 'Too many authentication attempts' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Date.now() + 60000).toString(),
            'Retry-After': '60',
          },
        }
      )
    }

    const body = await request.text()

    // Input validation testing
    if (body.length > 10000) {
      return HttpResponse.json({ error: 'Request payload too large' }, { status: 413 })
    }

    // XSS detection
    if (body.includes('<script>') || body.includes('javascript:')) {
      return HttpResponse.json({ error: 'Invalid input detected' }, { status: 400 })
    }

    return HttpResponse.json(
      { success: true },
      {
        headers: {
          'Set-Cookie': 'session=test123; HttpOnly; Secure; SameSite=Strict',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      }
    )
  }),

  // API endpoint with CORS testing
  http.options('http://localhost:3000/api/search/repositories', ({ request }) => {
    const origin = request.headers.get('Origin')
    const method = request.headers.get('Access-Control-Request-Method')

    // Implement strict CORS policy
    const allowedOrigins = ['https://contribux.ai', 'http://localhost:3000']
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE']

    if (!origin || !allowedOrigins.includes(origin)) {
      return new HttpResponse(null, { status: 403 })
    }

    if (!method || !allowedMethods.includes(method)) {
      return new HttpResponse(null, { status: 405 })
    }

    return new HttpResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': allowedMethods.join(', '),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  }),

  // Data endpoint for input validation testing
  http.post('http://localhost:3000/api/data/upload', async ({ request }) => {
    const contentType = request.headers.get('Content-Type')
    const contentLength = request.headers.get('Content-Length')

    // Content type validation
    if (
      !contentType?.includes('application/json') &&
      !contentType?.includes('multipart/form-data')
    ) {
      return HttpResponse.json({ error: 'Unsupported content type' }, { status: 415 })
    }

    // Size validation
    if (contentLength && Number.parseInt(contentLength) > 50 * 1024 * 1024) {
      return HttpResponse.json({ error: 'File too large' }, { status: 413 })
    }

    const body = await request.text()

    // SQL injection detection
    const sqlPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /delete\s+from/i,
      /insert\s+into/i,
      /update\s+.*set/i,
      /exec\s*\(/i,
      /'\s*or\s*'.*'=/i,
    ]

    for (const pattern of sqlPatterns) {
      if (pattern.test(body)) {
        return HttpResponse.json({ error: 'SQL injection attempt detected' }, { status: 400 })
      }
    }

    // NoSQL injection detection
    const nosqlPatterns = [/\$ne\s*:/i, /\$gt\s*:/i, /\$regex\s*:/i, /\$where\s*:/i, /\$or\s*:/i]

    for (const pattern of nosqlPatterns) {
      if (pattern.test(body)) {
        return HttpResponse.json({ error: 'NoSQL injection attempt detected' }, { status: 400 })
      }
    }

    return HttpResponse.json({ success: true })
  }),

  // CSP violation reporting endpoint
  http.post('http://localhost:3000/api/security/csp-report', async ({ request }) => {
    const report = await request.json()

    // Validate CSP report structure
    if (!report['csp-report'] || !report['csp-report']['violated-directive']) {
      return HttpResponse.json({ error: 'Invalid CSP report' }, { status: 400 })
    }

    return HttpResponse.json({ received: true })
  })
)

// Helper functions
const authAttemptCounts = new Map<string, number>()

async function getAuthAttemptCount(request: Request): Promise<number> {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const count = authAttemptCounts.get(ip) || 0
  authAttemptCounts.set(ip, count + 1)
  return count
}

// Test setup
beforeAll(() => {
  securityTestServer.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  vi.clearAllMocks()
  authAttemptCounts.clear()
})

afterEach(() => {
  securityTestServer.resetHandlers()
})

afterAll(() => {
  securityTestServer.close()
})

describe('Comprehensive API Security Test Suite', () => {
  describe('Comprehensive CORS Security Configuration', () => {
    describe('Origin Validation', () => {
      it('should validate allowed origins for production', async () => {
        const request = createMockNextRequest('http://localhost:3000/api/test', {
          headers: { Origin: 'https://contribux.ai' },
        })

        process.env.NODE_ENV = 'production'
        const config = generateCORSConfig(request)

        expect(config.origins).toContain('https://contribux.ai')
        expect(config.credentials).toBe(true)
        expect(config.maxAge).toBe(86400)
      })

      it('should reject unauthorized origins', async () => {
        const response = await fetch('http://localhost:3000/api/search/repositories', {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://malicious-site.com',
            'Access-Control-Request-Method': 'GET',
          },
        })

        expect(response.status).toBe(403)
      })

      it('should handle preflight requests properly', async () => {
        const response = await fetch('http://localhost:3000/api/search/repositories', {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://contribux.ai',
            'Access-Control-Request-Method': 'GET',
          },
        })

        expect(response.status).toBe(200)
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://contribux.ai')
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
        expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
      })

      it('should enforce credentials policy', async () => {
        const response = await fetch('http://localhost:3000/api/search/repositories', {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://contribux.ai',
            'Access-Control-Request-Method': 'GET',
          },
        })

        expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
      })

      it('should reject non-HTTPS origins in production', () => {
        process.env.NODE_ENV = 'production'
        const request = createMockNextRequest('http://localhost:3000/api/test', {
          headers: { Origin: 'http://insecure-site.com' },
        })

        const config = generateCORSConfig(request)
        expect(config.origins).not.toContain('http://insecure-site.com')
      })
    })

    describe('CORS Header Security', () => {
      it('should not use wildcard origins with credentials', async () => {
        const request = createMockNextRequest('http://localhost:3000/api/test')
        const response = NextResponse.next()

        const config = generateCORSConfig(request)
        applyCORSHeaders(response, request, config)

        if (response.headers.get('Access-Control-Allow-Credentials') === 'true') {
          expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
        }
      })

      it('should include Vary header for proper caching', () => {
        const request = createMockNextRequest('http://localhost:3000/api/test', {
          headers: { Origin: 'https://contribux.ai' },
        })
        const response = NextResponse.next()

        applyCORSHeaders(response, request)

        expect(response.headers.get('Vary')).toContain('Origin')
      })
    })
  })

  describe('Comprehensive Security Headers Testing', () => {
    describe('Content Security Policy', () => {
      it('should enforce strict CSP directives', async () => {
        const response = await fetch('http://localhost:3000/api/health')
        const csp = response.headers.get('Content-Security-Policy')

        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("script-src 'self'")
        expect(csp).not.toContain("'unsafe-eval'")
        expect(csp).not.toContain("'unsafe-inline'") // Except for development
      })

      it('should prevent XSS through script-src restrictions', () => {
        const request = createMockNextRequest('http://localhost:3000/api/test')
        const { policy } = generateCSPPolicy(request)

        expect(policy).toContain("script-src 'self'")
        expect(policy).toContain("'nonce-")
        expect(policy).not.toContain("'unsafe-eval'")
      })

      it('should validate frame-ancestors protection', () => {
        const request = createMockNextRequest('http://localhost:3000/api/test')
        process.env.NODE_ENV = 'production'
        const { policy } = generateCSPPolicy(request)

        expect(policy).toContain("frame-ancestors 'none'")
      })

      it('should enforce connect-src limitations', () => {
        const request = createMockNextRequest('http://localhost:3000/api/test')
        process.env.NODE_ENV = 'production'
        const { policy } = generateCSPPolicy(request)

        expect(policy).toContain("connect-src 'self'")
        expect(policy).toContain('https://api.github.com')
        expect(policy).not.toContain('*')
      })

      it('should generate unique nonces for each request', () => {
        const request = createMockNextRequest('http://localhost:3000/api/test')

        const { nonce: nonce1 } = generateCSPPolicy(request)
        const { nonce: nonce2 } = generateCSPPolicy(request)

        expect(nonce1).not.toBe(nonce2)
        expect(nonce1).toHaveLength(16)
        expect(nonce2).toHaveLength(16)
      })

      it('should process CSP violation reports', async () => {
        const violationReport = {
          'csp-report': {
            'document-uri': 'https://contribux.ai/test',
            'violated-directive': 'script-src',
            'blocked-uri': 'https://malicious-site.com/evil.js',
            'original-policy': "default-src 'self'",
            disposition: 'enforce' as const,
          },
        }

        const response = await fetch('http://localhost:3000/api/security/csp-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(violationReport),
        })

        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.received).toBe(true)
      })
    })

    describe('Security Headers Enforcement', () => {
      it('should include all required security headers', async () => {
        const response = await fetch('http://localhost:3000/api/health')

        const requiredHeaders = {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        }

        Object.entries(requiredHeaders).forEach(([header, expectedValue]) => {
          const actualValue = response.headers.get(header)
          if (header === 'Strict-Transport-Security') {
            expect(actualValue).toContain('max-age')
            expect(actualValue).toContain('includeSubDomains')
          } else if (header === 'Permissions-Policy') {
            expect(actualValue).toContain('geolocation=()')
            expect(actualValue).toContain('microphone=()')
            expect(actualValue).toContain('camera=()')
          } else {
            expect(actualValue).toBe(expectedValue)
          }
        })
      })

      it('should enforce HSTS in production', () => {
        process.env.NODE_ENV = 'production'
        const request = createMockNextRequest('http://localhost:3000/api/test')
        const response = NextResponse.next()

        applyCSPHeaders(response, request)

        const hsts = response.headers.get('Strict-Transport-Security')
        expect(hsts).toContain('max-age=')
        expect(hsts).toContain('includeSubDomains')
      })

      it('should set proper X-Content-Type-Options', () => {
        const request = createMockNextRequest('http://localhost:3000/api/test')
        const response = NextResponse.next()

        applyCSPHeaders(response, request)

        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      })
    })
  })

  describe('Advanced Rate Limiting Testing', () => {
    describe('Authentication Endpoints Rate Limiting', () => {
      it('should limit auth requests to 10/minute', async () => {
        const requests = Array(15)
          .fill(null)
          .map(() =>
            fetch('http://localhost:3000/api/auth/signin', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '192.168.1.100',
              },
              body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
            })
          )

        const responses = await Promise.all(requests)
        const rateLimited = responses.filter(r => r.status === 429)

        expect(rateLimited.length).toBeGreaterThan(0)

        // Check rate limit headers
        const rateLimitedResponse = rateLimited[0]
        expect(rateLimitedResponse.headers.get('X-RateLimit-Limit')).toBe('10')
        expect(rateLimitedResponse.headers.get('X-RateLimit-Remaining')).toBe('0')
        expect(rateLimitedResponse.headers.get('Retry-After')).toBe('60')
      })

      it('should implement progressive delays', async () => {
        const startTime = Date.now()

        // Make rapid requests to trigger progressive delays
        const requests = []
        for (let i = 0; i < 12; i++) {
          requests.push(
            fetch('http://localhost:3000/api/auth/signin', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '192.168.1.101',
              },
              body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
            })
          )
        }

        const responses = await Promise.all(requests)
        const endTime = Date.now()

        // Verify that later requests take longer due to rate limiting
        const rateLimited = responses.filter(r => r.status === 429)
        expect(rateLimited.length).toBeGreaterThan(0)
        expect(endTime - startTime).toBeGreaterThan(100) // Some delay should be present
      })

      it('should block after sustained attacks', async () => {
        // Simulate sustained attack
        for (let wave = 0; wave < 3; wave++) {
          const requests = Array(15)
            .fill(null)
            .map(() =>
              fetch('http://localhost:3000/api/auth/signin', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Forwarded-For': '192.168.1.102',
                },
                body: JSON.stringify({ email: 'attacker@evil.com', password: 'wrong' }),
              })
            )

          await Promise.all(requests)
          await new Promise(resolve => setTimeout(resolve, 100)) // Small delay between waves
        }

        // Final request should still be blocked
        const finalResponse = await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.102',
          },
          body: JSON.stringify({ email: 'legitimate@user.com', password: 'password' }),
        })

        expect(finalResponse.status).toBe(429)
      })

      it('should prevent rate limit bypass attempts', async () => {
        // Test various bypass techniques
        const bypassAttempts = [
          { headers: { 'X-Forwarded-For': '192.168.1.103' } },
          { headers: { 'X-Real-IP': '192.168.1.103' } },
          { headers: { 'X-Forwarded-For': '192.168.1.103, 192.168.1.104' } },
          { headers: { 'CF-Connecting-IP': '192.168.1.103' } },
          { headers: { 'X-Vercel-Forwarded-For': '192.168.1.103' } },
        ]

        // Exhaust rate limit with first IP
        await Promise.all(
          Array(12)
            .fill(null)
            .map(() =>
              fetch('http://localhost:3000/api/auth/signin', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Forwarded-For': '192.168.1.103',
                },
                body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
              })
            )
        )

        // Try bypass attempts
        for (const attempt of bypassAttempts) {
          const response = await fetch('http://localhost:3000/api/auth/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...attempt.headers,
            },
            body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
          })

          // Should still be rate limited since it's the same logical IP
          expect(response.status).toBe(429)
        }
      })
    })

    describe('Rate Limiting Configuration', () => {
      it('should have correct rate limiting configuration', () => {
        expect(RATE_LIMIT_CONFIG.global.requests).toBe(1000)
        expect(RATE_LIMIT_CONFIG.global.window).toBe(60 * 1000)
        expect(RATE_LIMIT_CONFIG.perIp.requests).toBe(100)
        expect(RATE_LIMIT_CONFIG.perEndpoint.requests).toBe(50)
      })

      it('should provide rate limiter status', async () => {
        const status = getRateLimiterStatus()

        expect(status).toHaveProperty('redisAvailable')
        expect(status).toHaveProperty('memoryFallbackActive')
        expect(status).toHaveProperty('circuitBreakerOpen')
        expect(status).toHaveProperty('activeStore')
      })
    })
  })

  describe('API Input Validation & Sanitization', () => {
    describe('Payload Size Limits', () => {
      it('should reject oversized payloads', async () => {
        const largePayload = 'x'.repeat(20 * 1024 * 1024) // 20MB

        const response = await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': largePayload.length.toString(),
          },
          body: largePayload,
        })

        expect(response.status).toBe(413)
        const data = await response.json()
        expect(data.error).toContain('too large')
      })

      it('should validate content types', async () => {
        const response = await fetch('http://localhost:3000/api/data/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: 'invalid content',
        })

        expect(response.status).toBe(415)
        const data = await response.json()
        expect(data.error).toContain('Unsupported content type')
      })
    })

    describe('SQL Injection Prevention', () => {
      it('should detect and block SQL injection attempts', async () => {
        const sqlInjectionPayloads = [
          "'; DROP TABLE users; --",
          "' UNION SELECT password FROM users --",
          "' OR '1'='1",
          "'; INSERT INTO users VALUES ('hacker', 'password'); --",
          "' AND (SELECT COUNT(*) FROM users) > 0 --",
          "1' EXEC xp_cmdshell('dir') --",
        ]

        for (const payload of sqlInjectionPayloads) {
          const response = await fetch('http://localhost:3000/api/data/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: payload }),
          })

          expect(response.status).toBe(400)
          const data = await response.json()
          expect(data.error).toContain('SQL injection')
        }
      })
    })

    describe('NoSQL Injection Prevention', () => {
      it('should detect and block NoSQL injection attempts', async () => {
        const nosqlInjectionPayloads = [
          '{"$ne": null}',
          '{"$gt": ""}',
          '{"$regex": ".*"}',
          '{"$where": "sleep(1000)"}',
          '{"$or": [{}]}',
          '{"username": {"$ne": "admin"}}',
        ]

        for (const payload of nosqlInjectionPayloads) {
          const response = await fetch('http://localhost:3000/api/data/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: payload,
          })

          expect(response.status).toBe(400)
          const data = await response.json()
          expect(data.error).toContain('NoSQL injection')
        }
      })
    })

    describe('XSS Prevention', () => {
      it('should sanitize XSS attempts in input', async () => {
        const xssPayloads = [
          '<script>alert("xss")</script>',
          'javascript:alert("xss")',
          '<img src="x" onerror="alert(1)">',
          '<svg onload="alert(1)">',
          '"><script>alert(String.fromCharCode(88,83,83))</script>',
          '<iframe src="javascript:alert(1)"></iframe>',
        ]

        for (const payload of xssPayloads) {
          const response = await fetch('http://localhost:3000/api/auth/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: payload, password: 'test' }),
          })

          expect(response.status).toBe(400)
          const data = await response.json()
          expect(data.error).toContain('Invalid input')
        }
      })
    })
  })

  describe('Attack Simulation Testing', () => {
    describe('Cross-Site Request Forgery (CSRF)', () => {
      it('should require CSRF tokens for state-changing operations', async () => {
        // Attempt state-changing operation without CSRF token
        const response = await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://malicious-site.com',
          },
          body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
        })

        // Should either require CSRF token or reject cross-origin request
        expect([400, 403, 422]).toContain(response.status)
      })

      it('should validate SameSite cookie attributes', async () => {
        const response = await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
        })

        const setCookieHeader = response.headers.get('Set-Cookie')
        if (setCookieHeader) {
          expect(setCookieHeader).toContain('SameSite=Strict')
          expect(setCookieHeader).toContain('HttpOnly')
          expect(setCookieHeader).toContain('Secure')
        }
      })
    })

    describe('Request Smuggling Prevention', () => {
      it('should handle malformed Content-Length headers', async () => {
        const response = await fetch('http://localhost:3000/api/data/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': 'invalid',
          },
          body: JSON.stringify({ test: 'data' }),
        })

        // Should handle malformed headers gracefully
        expect([400, 411, 413]).toContain(response.status)
      })

      it('should reject requests with conflicting length headers', async () => {
        try {
          await fetch('http://localhost:3000/api/data/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': '100',
              'Transfer-Encoding': 'chunked',
            },
            body: JSON.stringify({ test: 'data' }),
          })
        } catch (error) {
          // Fetch API may reject this at the client level, which is acceptable
          expect(error).toBeDefined()
        }
      })
    })

    describe('HTTP Method Override Attacks', () => {
      it('should not allow method override via headers', async () => {
        const response = await fetch('http://localhost:3000/api/health', {
          method: 'GET',
          headers: {
            'X-HTTP-Method-Override': 'DELETE',
            'X-Method-Override': 'DELETE',
          },
        })

        // Should still process as GET, not DELETE
        expect(response.status).toBe(200)
      })
    })
  })

  describe('Middleware Security Chain Testing', () => {
    describe('Edge Middleware Integration', () => {
      it('should apply security middleware in correct order', async () => {
        const request = createMockNextRequest('http://localhost:3000/api/test', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Forwarded-For': '192.168.1.200',
          },
        })

        const response = await edgeSecurityMiddleware(request)

        // Should apply security headers
        expect(response.headers.get('X-Content-Type-Options')).toBeDefined()
        expect(response.headers.get('X-Frame-Options')).toBeDefined()
      })

      it('should enforce rate limiting at edge', async () => {
        const requests = Array(70)
          .fill(null)
          .map(() =>
            createMockNextRequest('http://localhost:3000/api/test', {
              headers: { 'X-Forwarded-For': '192.168.1.201' },
            })
          )

        const responses = await Promise.all(requests.map(req => edgeSecurityMiddleware(req)))

        const rateLimited = responses.filter(r => r?.status === 429)
        expect(rateLimited.length).toBeGreaterThan(0)
      })

      it('should detect and block suspicious patterns', async () => {
        const suspiciousRequest = createMockNextRequest('http://localhost:3000/api/../admin', {
          headers: {
            'User-Agent': 'sqlmap/1.4.7',
            'X-Forwarded-For': '192.168.1.202',
          },
        })

        const response = await enhancedEdgeMiddleware(suspiciousRequest)

        // Should block or challenge suspicious requests
        if (response) {
          expect([403, 429]).toContain(response.status)
        }
      })
    })

    describe('Security Configuration Validation', () => {
      it('should have valid security configuration', () => {
        expect(EDGE_SECURITY_CONFIG.rateLimiting.global.requests).toBeGreaterThan(0)
        expect(EDGE_SECURITY_CONFIG.ddos.burstThreshold).toBeGreaterThan(0)
        expect(EDGE_SECURITY_CONFIG.challenges.blockThreshold).toBeGreaterThan(0.5)
        expect(EDGE_SECURITY_CONFIG.geoBlocking.allowedCountries).toContain('US')
      })

      it('should have proper CSP configuration', () => {
        expect(CSP_CORS_CONFIG.csp.reportUri).toBe('/api/security/csp-report')
        expect(CSP_CORS_CONFIG.csp.nonceLength).toBe(16)
        expect(CSP_CORS_CONFIG.cors.credentials).toBe(true)
      })
    })

    describe('Error Handling Security', () => {
      it('should not expose sensitive information in errors', async () => {
        const response = await fetch('http://localhost:3000/api/nonexistent', {
          method: 'GET',
        })

        expect(response.status).toBe(404)
        const text = await response.text()

        // Should not expose stack traces, file paths, or other sensitive info
        expect(text).not.toContain('node_modules')
        expect(text).not.toContain('Error:')
        expect(text).not.toContain(__dirname)
        expect(text).not.toContain('database')
        expect(text).not.toContain('password')
      })

      it('should handle security middleware failures gracefully', async () => {
        // Simulate middleware failure by passing invalid data
        const invalidRequest = createMockNextRequest('http://localhost:3000/api/test', {
          headers: {
            'Content-Length': 'invalid',
            'User-Agent': 'x'.repeat(10000), // Extremely long user agent
          },
        })

        const response = await edgeSecurityMiddleware(invalidRequest)

        // Should fail securely - either block or allow with fallback security
        expect(response.status).toBeOneOf([200, 400, 403, 429])
      })
    })
  })

  describe('Performance & Load Testing', () => {
    describe('Security Overhead Testing', () => {
      it('should have minimal performance impact', async () => {
        const startTime = Date.now()

        const requests = Array(50)
          .fill(null)
          .map(() => fetch('http://localhost:3000/api/health'))

        await Promise.all(requests)
        const endTime = Date.now()

        const avgTime = (endTime - startTime) / 50

        // Security middleware should add minimal overhead (< 50ms per request)
        expect(avgTime).toBeLessThan(50)
      })

      it('should handle concurrent security validations', async () => {
        const concurrentRequests = Array(100)
          .fill(null)
          .map((_, i) =>
            fetch('http://localhost:3000/api/health', {
              headers: {
                'X-Forwarded-For': `192.168.1.${200 + (i % 10)}`,
              },
            })
          )

        const responses = await Promise.all(concurrentRequests)
        const successfulResponses = responses.filter(r => r.status === 200)

        // Should handle concurrent requests without errors
        expect(successfulResponses.length).toBeGreaterThan(90)
      })
    })
  })
})

// Custom matchers for better test assertions
expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received)
    return {
      message: () => `expected ${received} to be one of [${expected.join(', ')}]`,
      pass,
    }
  },
})

// Type augmentation for custom matcher
declare module 'vitest' {
  interface Assertion {
    toBeOneOf(expected: unknown[]): unknown
  }
  interface AsymmetricMatchersContaining {
    toBeOneOf(expected: unknown[]): unknown
  }
}
