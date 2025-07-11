import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  checkApiRateLimit,
  withRateLimit,
  checkApiRateLimitStatus,
  rateLimitMiddleware,
} from '@/lib/security/rate-limit-middleware'
import {
  rateLimitConfigs,
  getEnhancedRequestIdentifier,
  getClientIP,
  getRateLimiterForEndpoint,
} from '@/lib/security/rate-limiter'

// Mock Upstash Redis to avoid external dependencies
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    // Mock Redis methods
  })),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn().mockImplementation(() => ({
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 3600000,
    }),
  })),
}))

describe('Rate Limiting System - Comprehensive Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment variables
    process.env.UPSTASH_REDIS_REST_URL = undefined
    process.env.UPSTASH_REDIS_REST_TOKEN = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rate Limit Configurations', () => {
    it('should have correct configuration values', () => {
      expect(rateLimitConfigs.auth.windowMs).toBe(15 * 60 * 1000)
      expect(rateLimitConfigs.auth.max).toBe(50)
      expect(rateLimitConfigs.auth.message).toContain('authentication')

      expect(rateLimitConfigs.api.windowMs).toBe(60 * 60 * 1000)
      expect(rateLimitConfigs.api.max).toBe(1000)

      expect(rateLimitConfigs.search.windowMs).toBe(60 * 1000)
      expect(rateLimitConfigs.search.max).toBe(30)

      expect(rateLimitConfigs.webauthn.windowMs).toBe(5 * 60 * 1000)
      expect(rateLimitConfigs.webauthn.max).toBe(10)

      expect(rateLimitConfigs.demo.windowMs).toBe(60 * 1000)
      expect(rateLimitConfigs.demo.max).toBe(5)
    })

    it('should have appropriate messages for each category', () => {
      expect(rateLimitConfigs.auth.message).toContain('authentication')
      expect(rateLimitConfigs.search.message).toContain('Search')
      expect(rateLimitConfigs.webauthn.message).toContain('WebAuthn')
      expect(rateLimitConfigs.demo.message).toContain('Demo')
    })
  })

  describe('Enhanced Request Identification', () => {
    it('should identify authenticated users from JWT token', () => {
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiaWF0IjoxNjQwOTk1MjAwfQ.signature'
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
      })

      const identifier = getEnhancedRequestIdentifier(request)
      expect(identifier).toBe('user:user123')
    })

    it('should identify API key users', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'x-api-key': 'test-api-key-1234567890',
        },
      })

      const identifier = getEnhancedRequestIdentifier(request)
      expect(identifier).toBe('api:test-api-key-123')
    })

    it('should identify session users', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          cookie: 'next-auth.session-token=session-token-1234567890',
        },
      })

      const identifier = getEnhancedRequestIdentifier(request)
      expect(identifier).toBe('session:session-token-1')
    })

    it('should fall back to IP + user agent hash', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      const identifier = getEnhancedRequestIdentifier(request)
      expect(identifier).toMatch(/^ip:192\.168\.1\.1:[a-f0-9]{8}$/)
    })
  })

  describe('Client IP Detection', () => {
    it('should detect IP from x-forwarded-for header', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      })

      const ip = getClientIP(request)
      expect(ip).toBe('192.168.1.1')
    })

    it('should detect IP from x-real-ip header', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'x-real-ip': '192.168.1.2',
        },
      })

      const ip = getClientIP(request)
      expect(ip).toBe('192.168.1.2')
    })

    it('should detect IP from Cloudflare headers', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'cf-connecting-ip': '192.168.1.3',
        },
      })

      const ip = getClientIP(request)
      expect(ip).toBe('192.168.1.3')
    })

    it('should fall back to default IP', () => {
      const request = new NextRequest('http://localhost/api/test')

      const ip = getClientIP(request)
      expect(ip).toBe('127.0.0.1')
    })
  })

  describe('Rate Limiter Selection', () => {
    it('should select auth limiter for auth endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/auth/signin')

      expect(type).toBe('auth')
      expect(config.max).toBe(50)
      expect(config.windowMs).toBe(15 * 60 * 1000)
    })

    it('should select search limiter for search endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/search/repositories')

      expect(type).toBe('search')
      expect(config.max).toBe(30)
      expect(config.windowMs).toBe(60 * 1000)
    })

    it('should select webauthn limiter for webauthn endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/security/webauthn/register')

      expect(type).toBe('webauthn')
      expect(config.max).toBe(10)
      expect(config.windowMs).toBe(5 * 60 * 1000)
    })

    it('should select webhook limiter for webhook endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/webhooks/github')

      expect(type).toBe('webhook')
      expect(config.max).toBe(100)
      expect(config.windowMs).toBe(60 * 1000)
    })

    it('should select admin limiter for admin endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/admin/users')

      expect(type).toBe('admin')
      expect(config.max).toBe(100)
      expect(config.windowMs).toBe(60 * 60 * 1000)
    })

    it('should select demo limiter for demo endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/demo/rate-limit')

      expect(type).toBe('demo')
      expect(config.max).toBe(5)
      expect(config.windowMs).toBe(60 * 1000)
    })

    it('should select api limiter for generic endpoints', () => {
      const { limiter, config, type } = getRateLimiterForEndpoint('/api/generic/endpoint')

      expect(type).toBe('api')
      expect(config.max).toBe(1000)
      expect(config.windowMs).toBe(60 * 60 * 1000)
    })
  })

  describe('checkApiRateLimit Function', () => {
    it('should return allowed status for requests under limit', async () => {
      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimit(request, 'api')

      expect(result.allowed).toBe(true)
      expect(result.headers['X-RateLimit-Limit']).toBe('1000')
      expect(result.headers['X-RateLimit-Remaining']).toBe('999')
      expect(result.headers['X-RateLimit-Reset']).toBeDefined()
      expect(result.headers['X-RateLimit-Policy']).toBe('1000 requests per 3600000ms')
    })

    it('should handle different limiter types', async () => {
      const request = new NextRequest('http://localhost/api/auth/signin')

      const result = await checkApiRateLimit(request, 'auth')

      expect(result.allowed).toBe(true)
      expect(result.headers['X-RateLimit-Policy']).toBe('50 requests per 900000ms')
    })
  })

  describe('withRateLimit Higher-Order Function', () => {
    it('should allow requests under limit', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('OK'))
      const wrappedHandler = withRateLimit(mockHandler, { limiterType: 'api' })

      const request = new NextRequest('http://localhost/api/test')
      const response = await wrappedHandler(request)

      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response.status).toBe(200)
      expect(response.headers.get('X-RateLimit-Limit')).toBe('1000')
    })

    it('should skip rate limiting when skipRateLimit returns true', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('OK'))
      const wrappedHandler = withRateLimit(mockHandler, {
        limiterType: 'api',
        skipRateLimit: req => req.headers.get('x-admin-key') === 'admin-secret',
      })

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-admin-key': 'admin-secret' },
      })
      const response = await wrappedHandler(request)

      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response.status).toBe(200)
    })

    it('should use custom identifier when provided', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('OK'))
      const wrappedHandler = withRateLimit(mockHandler, {
        limiterType: 'api',
        customIdentifier: _req => 'custom-id-123',
      })

      const request = new NextRequest('http://localhost/api/test')
      const response = await wrappedHandler(request)

      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response.status).toBe(200)
    })
  })

  describe('checkApiRateLimitStatus Function', () => {
    it('should return detailed rate limit status', async () => {
      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimitStatus(request, {
        limiterType: 'api',
      })

      expect(result.success).toBe(true)
      expect(result.limit).toBe(1000)
      expect(result.remaining).toBe(999)
      expect(result.reset).toBeInstanceOf(Date)
      expect(result.retryAfter).toBeNull()
      expect(result.headers['X-RateLimit-Limit']).toBe('1000')
      expect(result.headers['X-RateLimit-Policy']).toBe('1000 requests per 3600000ms')
    })

    it('should use custom identifier when provided', async () => {
      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimitStatus(request, {
        limiterType: 'search',
        customIdentifier: 'global-search-id',
      })

      expect(result.success).toBe(true)
      expect(result.headers['X-RateLimit-Policy']).toBe('30 requests per 60000ms')
    })
  })

  describe('rateLimitMiddleware Function', () => {
    it('should apply rate limiting to API requests', async () => {
      const request = new NextRequest('http://localhost/api/test')

      const response = await rateLimitMiddleware(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('X-RateLimit-Limit')).toBe('1000')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('999')
      expect(response.headers.get('X-RateLimit-Policy')).toBe('1000 requests per 3600000ms')
    })

    it('should select appropriate limiter based on path', async () => {
      const authRequest = new NextRequest('http://localhost/api/auth/signin')
      const authResponse = await rateLimitMiddleware(authRequest)

      expect(authResponse.headers.get('X-RateLimit-Policy')).toBe('50 requests per 900000ms')

      const searchRequest = new NextRequest('http://localhost/api/search/repositories')
      const searchResponse = await rateLimitMiddleware(searchRequest)

      expect(searchResponse.headers.get('X-RateLimit-Policy')).toBe('30 requests per 60000ms')
    })
  })

  describe('Fallback Rate Limiting (No Redis)', () => {
    it('should work without Redis configuration', async () => {
      // Ensure no Redis environment variables are set
      process.env.UPSTASH_REDIS_REST_URL = undefined
      process.env.UPSTASH_REDIS_REST_TOKEN = undefined

      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimit(request, 'api')

      expect(result.allowed).toBe(true)
      expect(result.headers['X-RateLimit-Limit']).toBeDefined()
      expect(result.headers['X-RateLimit-Remaining']).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Mock Redis error
      vi.doMock('@upstash/ratelimit', () => ({
        Ratelimit: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
        })),
      }))

      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimit(request, 'api')

      // Should allow request on error
      expect(result.allowed).toBe(true)
    })
  })

  describe('Performance Optimizations', () => {
    it('should include timing information in rate limit checks', async () => {
      const request = new NextRequest('http://localhost/api/test')

      const startTime = Date.now()
      const result = await checkApiRateLimit(request, 'api')
      const endTime = Date.now()

      expect(result.allowed).toBe(true)
      // Verify the request completed within reasonable time
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })

  describe('Security Features', () => {
    it('should truncate sensitive information in identifiers', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          'x-api-key': 'very-long-api-key-that-should-be-truncated-for-security',
        },
      })

      const identifier = getEnhancedRequestIdentifier(request)
      expect(identifier).toBe('api:very-long-api-ke')
      expect(identifier.length).toBeLessThan(50)
    })

    it('should handle malformed JWT tokens gracefully', () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer invalid-jwt-token',
        },
      })

      const identifier = getEnhancedRequestIdentifier(request)
      expect(identifier).toMatch(/^ip:127\.0\.0\.1/)
    })
  })

  describe('Rate Limit Headers', () => {
    it('should include all required rate limit headers', async () => {
      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimit(request, 'api')

      expect(result.headers).toHaveProperty('X-RateLimit-Limit')
      expect(result.headers).toHaveProperty('X-RateLimit-Remaining')
      expect(result.headers).toHaveProperty('X-RateLimit-Reset')
      expect(result.headers).toHaveProperty('X-RateLimit-Policy')
    })

    it('should include Retry-After header when rate limited', async () => {
      // Mock rate limit exceeded
      vi.doMock('@upstash/ratelimit', () => ({
        Ratelimit: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockResolvedValue({
            success: false,
            limit: 1000,
            remaining: 0,
            reset: Date.now() + 3600000,
          }),
        })),
      }))

      const request = new NextRequest('http://localhost/api/test')

      const result = await checkApiRateLimit(request, 'api')

      expect(result.allowed).toBe(false)
      expect(result.headers).toHaveProperty('Retry-After')
    })
  })
})
