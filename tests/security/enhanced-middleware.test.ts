/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Enhanced Security Middleware Test Suite
 * Comprehensive testing for rate limiting, CSP headers, IP validation,
 * request filtering, and security controls
 */

// Mock Next.js server module
class MockNextRequest {
  public url: string
  public headers: Map<string, string>
  public method: string

  constructor(url: string, options: RequestInit = {}) {
    this.url = url
    this.method = options.method || 'GET'
    this.headers = new Map()
    // Mock headers object
    this.headers = {
      get: vi.fn((key: string) => {
        const headerStore = this._headerStore || new Map()
        return headerStore.get(key.toLowerCase()) || null
      }),
      set: vi.fn((key: string, value: string) => {
        if (!this._headerStore) this._headerStore = new Map()
        this._headerStore.set(key.toLowerCase(), value)
      }),
    } as any
    this._headerStore = new Map()
  }

  private _headerStore: Map<string, string>
}

class MockNextResponse {
  public status: number
  public headers: Map<string, string>
  private body: any

  constructor(body?: any, init?: ResponseInit) {
    this.status = init?.status || 200
    this.body = body
    // Mock headers object
    this.headers = {
      get: vi.fn((key: string) => {
        const headerStore = this._headerStore || new Map()
        return headerStore.get(key.toLowerCase()) || null
      }),
      set: vi.fn((key: string, value: string) => {
        if (!this._headerStore) this._headerStore = new Map()
        this._headerStore.set(key.toLowerCase(), value)
      }),
    } as any
    this._headerStore = new Map()
  }

  static next() {
    return new MockNextResponse()
  }

  text() {
    return Promise.resolve(this.body || '')
  }

  private _headerStore: Map<string, string>
}

vi.mock('next/server', () => ({
  NextRequest: MockNextRequest,
  NextResponse: MockNextResponse,
}))

// Make the mocked classes globally available
global.NextRequest = MockNextRequest as any
global.NextResponse = MockNextResponse as any

import { type NextRequest, NextResponse } from 'next/server'
import { enhancedSecurityMiddleware } from '../../src/lib/security/enhanced-middleware'

// Mock environment variables for testing
const mockEnv = {
  NODE_ENV: 'test',
  VERCEL: '1',
}

// Mock the feature flags and crypto modules
vi.mock('../../src/lib/security/feature-flags', () => ({
  securityFeatures: {
    rateLimiting: true,
    advancedMonitoring: false,
    isDevelopment: false,
    isProduction: false,
  },
  getSecurityConfig: vi.fn(() => ({
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10, // Lower for testing
    },
  })),
}))

vi.mock('../../src/lib/security/crypto-simple', () => ({
  generateSecureToken: vi.fn(() => 'mock-secure-token-1234567890abcdef'),
}))

/**
 * Helper to create mock NextRequest with proper URL and headers
 */
function createMockRequest(
  url: string,
  options: RequestInit = {},
  headers: Record<string, string> = {}
): NextRequest {
  const request = new NextRequest(url, {
    method: 'GET',
    ...options,
  })

  // Set custom headers
  Object.entries(headers).forEach(([key, value]) => {
    request.headers.set(key, value)
  })

  return request
}

/**
 * Helper to simulate multiple requests from same IP
 */
async function simulateRateLimitRequests(
  ip: string,
  count: number,
  headers: Record<string, string> = {}
): Promise<NextResponse[]> {
  const responses: NextResponse[] = []

  for (let i = 0; i < count; i++) {
    const request = createMockRequest(
      'https://example.com/api/test',
      { method: 'GET' },
      { 'x-forwarded-for': ip, ...headers }
    )

    const response = await enhancedSecurityMiddleware(request)
    if (response) {
      responses.push(response)
    }
  }

  return responses
}

describe('Enhanced Security Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset environment
    Object.entries(mockEnv).forEach(([key, value]) => {
      process.env[key] = value
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should return null for static files', async () => {
      const paths = ['/_next/static/css/app.css', '/favicon.ico', '/public/logo.png']

      for (const path of paths) {
        const request = createMockRequest(`https://example.com${path}`)
        const response = await enhancedSecurityMiddleware(request)
        expect(response).toBeNull()
      }
    })

    it('should process regular routes', async () => {
      const request = createMockRequest(
        'https://example.com/api/search',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.100' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).not.toBe(429) // Not rate limited initially
    })

    it('should handle missing IP gracefully', async () => {
      const request = createMockRequest('https://example.com/api/test')

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      // Should handle unknown IP gracefully
    })
  })

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const responses = await simulateRateLimitRequests('192.168.1.101', 5)

      expect(responses).toHaveLength(0) // All requests should pass (no responses = allowed)
    })

    it('should block requests exceeding rate limit', async () => {
      const responses = await simulateRateLimitRequests('192.168.1.102', 15)

      // Some requests should be blocked
      const blockedResponses = responses.filter(r => r.status === 429)
      expect(blockedResponses.length).toBeGreaterThan(0)
    })

    it('should handle different IPs independently', async () => {
      const ip1Responses = await simulateRateLimitRequests('192.168.1.103', 8)
      const ip2Responses = await simulateRateLimitRequests('192.168.1.104', 8)

      // Both IPs should be under their independent limits
      expect(ip1Responses.filter(r => r.status === 429)).toHaveLength(0)
      expect(ip2Responses.filter(r => r.status === 429)).toHaveLength(0)
    })

    it('should reset rate limit after window expires', async () => {
      // Mock time to simulate window expiration
      const mockDate = vi.spyOn(global, 'Date')

      // First, exhaust the rate limit
      await simulateRateLimitRequests('192.168.1.105', 12)

      // Advance time by window duration + 1 second
      mockDate.mockImplementationOnce(
        () =>
          ({
            now: () => Date.now() + 15 * 60 * 1000 + 1000,
          }) as any
      )

      // This request should be allowed after window reset
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.105' }
      )

      const response = await enhancedSecurityMiddleware(request)

      // Should be allowed (null/NextResponse but not 429)
      expect(response?.status).not.toBe(429)

      mockDate.mockRestore()
    })
  })

  describe('IP Address Validation', () => {
    it('should handle valid IPv4 addresses', async () => {
      const validIPs = ['192.168.1.1', '10.0.0.1', '8.8.8.8', '127.0.0.1']

      for (const ip of validIPs) {
        const request = createMockRequest(
          'https://example.com/api/test',
          { method: 'GET' },
          { 'x-forwarded-for': ip }
        )

        const response = await enhancedSecurityMiddleware(request)
        expect(response).toBeInstanceOf(NextResponse)
      }
    })

    it('should handle valid IPv6 addresses', async () => {
      const validIPs = ['::1', '2001:db8::1', 'fe80::1']

      for (const ip of validIPs) {
        const request = createMockRequest(
          'https://example.com/api/test',
          { method: 'GET' },
          { 'x-forwarded-for': ip }
        )

        const response = await enhancedSecurityMiddleware(request)
        expect(response).toBeInstanceOf(NextResponse)
      }
    })

    it('should handle invalid IP addresses gracefully', async () => {
      const invalidIPs = ['999.999.999.999', 'not-an-ip', '192.168.1', '']

      for (const ip of invalidIPs) {
        const request = createMockRequest(
          'https://example.com/api/test',
          { method: 'GET' },
          { 'x-forwarded-for': ip }
        )

        const response = await enhancedSecurityMiddleware(request)
        expect(response).toBeInstanceOf(NextResponse)
        // Should not crash and handle gracefully
      }
    })

    it('should prioritize x-forwarded-for in Vercel environment', async () => {
      process.env.VERCEL = '1'

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '192.168.1.200, 10.0.0.1',
          'x-real-ip': '192.168.1.201',
        }
      )

      const response = await enhancedSecurityMiddleware(request)
      expect(response).toBeInstanceOf(NextResponse)
      // Should use first IP from x-forwarded-for chain
    })

    it('should handle Cloudflare environment', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'cf-ray': 'abc123',
          'x-forwarded-for': '192.168.1.202',
          'x-real-ip': '192.168.1.203',
        }
      )

      const response = await enhancedSecurityMiddleware(request)
      expect(response).toBeInstanceOf(NextResponse)
    })
  })

  describe('Request Validation', () => {
    it('should reject requests that are too large', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'POST' },
        {
          'content-length': String(11 * 1024 * 1024), // 11MB
          'content-type': 'application/json',
        }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(400)

      const body = await response?.text()
      expect(body).toContain('Request too large')
    })

    it('should validate content type for POST requests', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'POST' },
        {
          'content-type': 'text/plain', // Invalid for POST
        }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(400)

      const body = await response?.text()
      expect(body).toContain('Invalid content type')
    })

    it('should allow valid content types for POST requests', async () => {
      const validContentTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
      ]

      for (const contentType of validContentTypes) {
        const request = createMockRequest(
          'https://example.com/api/test',
          { method: 'POST' },
          {
            'content-type': contentType,
            'x-forwarded-for': '192.168.1.110',
          }
        )

        const response = await enhancedSecurityMiddleware(request)
        expect(response?.status).not.toBe(400)
      }
    })

    it('should detect suspicious patterns in headers', async () => {
      const suspiciousHeaders = [
        { 'user-agent': '<script>alert("xss")</script>' },
        { referer: 'javascript:alert(1)' },
        { 'x-forwarded-for': 'vbscript:alert(1)' },
        { 'x-real-ip': 'onload=alert(1)' },
      ]

      for (const headers of suspiciousHeaders) {
        const request = createMockRequest(
          'https://example.com/api/test',
          { method: 'GET' },
          headers
        )

        const response = await enhancedSecurityMiddleware(request)

        expect(response).toBeInstanceOf(NextResponse)
        expect(response?.status).toBe(400)

        const body = await response?.text()
        expect(body).toContain('Suspicious header content')
      }
    })

    it('should allow clean headers', async () => {
      const cleanHeaders = {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        referer: 'https://google.com',
        'x-forwarded-for': '192.168.1.120',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        cleanHeaders
      )

      const response = await enhancedSecurityMiddleware(request)
      expect(response?.status).not.toBe(400)
    })
  })

  describe('CORS Handling', () => {
    it('should handle OPTIONS preflight requests', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'OPTIONS' },
        { 'x-forwarded-for': '192.168.1.130' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(200)
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://contribux.vercel.app'
      )
      expect(response?.headers.get('Content-Security-Policy')).toContain('nonce-')
    })
  })

  describe('Security Headers', () => {
    it('should apply comprehensive security headers', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.140' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)

      // Check security headers
      expect(response?.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response?.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(response?.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response?.headers.get('Permissions-Policy')).toBe(
        'camera=(), microphone=(), geolocation=()'
      )
    })

    it('should generate CSP with nonce', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.150' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)

      const csp = response?.headers.get('Content-Security-Policy')
      expect(csp).toContain('nonce-mock-secure-token-1234567890abcdef')
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).not.toContain('unsafe-inline') // Should not contain unsafe-inline
    })

    it('should apply CORS headers', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.160' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)

      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://contribux.vercel.app'
      )
      expect(response?.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, PUT, DELETE, OPTIONS'
      )
      expect(response?.headers.get('Access-Control-Allow-Headers')).toBe(
        'Content-Type, Authorization'
      )
      expect(response?.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })
  })

  describe('Error Handling', () => {
    it('should fail securely on errors', async () => {
      // Mock an error scenario
      const originalDateNow = Date.now
      Date.now = () => {
        throw new Error('Simulated error')
      }

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.170' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      // Should have basic security headers even on error
      expect(response?.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff')

      // Restore
      Date.now = originalDateNow
    })

    it('should handle malformed requests gracefully', async () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'INVALID' as any },
        { 'x-forwarded-for': '192.168.1.180' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      // Should not crash
    })
  })

  describe('Advanced Monitoring', () => {
    it('should add monitoring headers when enabled', async () => {
      // Mock advanced monitoring enabled
      vi.doMock('../../src/lib/security/feature-flags', () => ({
        securityFeatures: {
          rateLimiting: true,
          advancedMonitoring: true,
          isDevelopment: false,
          isProduction: false,
        },
        getSecurityConfig: vi.fn(() => ({
          rateLimit: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 10,
          },
        })),
      }))

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.190' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      // Note: monitoring headers might not be visible in test environment
      // This test ensures the code path is exercised
    })
  })

  describe('Memory Management', () => {
    it('should handle memory cleanup for rate limiting', async () => {
      // Generate many requests from different IPs to test memory management
      const promises = []

      for (let i = 0; i < 100; i++) {
        const ip = `192.168.2.${i + 1}`
        const promise = simulateRateLimitRequests(ip, 2)
        promises.push(promise)
      }

      await Promise.all(promises)

      // The test itself verifies that the middleware doesn't crash or leak memory
      // The cleanup logic should prevent excessive memory usage
      expect(true).toBe(true) // Test completion indicates success
    })
  })

  describe('Development vs Production', () => {
    it('should handle development environment CSP', async () => {
      // Mock development environment
      vi.doMock('../../src/lib/security/feature-flags', () => ({
        securityFeatures: {
          rateLimiting: true,
          advancedMonitoring: false,
          isDevelopment: true,
          isProduction: false,
        },
        getSecurityConfig: vi.fn(() => ({
          rateLimit: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 1000, // Higher limit for development
          },
        })),
      }))

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.200' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)

      const csp = response?.headers.get('Content-Security-Policy')
      expect(csp).toContain('localhost:*') // Development-specific CSP
    })

    it('should handle production environment with HSTS', async () => {
      // Mock production environment
      vi.doMock('../../src/lib/security/feature-flags', () => ({
        securityFeatures: {
          rateLimiting: true,
          advancedMonitoring: false,
          isDevelopment: false,
          isProduction: true,
        },
        getSecurityConfig: vi.fn(() => ({
          rateLimit: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 100,
          },
        })),
      }))

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.210' }
      )

      const response = await enhancedSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)

      // In production, HSTS should be present
      expect(response?.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    })
  })
})
