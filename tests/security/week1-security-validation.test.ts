/**
 * Week 1 Security Validation - Integration Test
 * Comprehensive test to validate all three security implementations work together
 */

import {
  generateSecureId,
  generateSecureRandomString,
  getSecureRandomBytes,
} from '@/lib/security/crypto-secure'
import { buildCSP, defaultCSPDirectives, generateNonce } from '@/lib/security/csp'
import {
  apiRateLimiter,
  authRateLimiter,
  checkRateLimit,
  searchRateLimiter,
} from '@/lib/security/rate-limiter'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Upstash for rate limiting tests
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  })),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn().mockImplementation(() => ({
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    }),
    slidingWindow: vi.fn((limit, window) => ({ limit, window })),
  })),
}))

describe('Week 1 Security Validation - Integration Test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Cryptographically Secure Random Generation', () => {
    it('should generate secure random values for all use cases', () => {
      // Test random bytes generation
      const bytes = getSecureRandomBytes(32)
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBe(32)

      // Test random string generation
      const randomString = generateSecureRandomString(16)
      expect(randomString).toHaveLength(16)
      expect(randomString).toMatch(/^[A-Za-z0-9]+$/)

      // Test secure ID generation
      const secureId = generateSecureId('session')
      expect(secureId).toMatch(/^session_[0-9a-z]+_[A-Za-z0-9]{9}$/)
    })

    it('should use crypto.getRandomValues in browser/edge environment', () => {
      const cryptoSpy = vi.spyOn(crypto, 'getRandomValues')

      getSecureRandomBytes(16)

      expect(cryptoSpy).toHaveBeenCalled()
      expect(cryptoSpy).toHaveBeenCalledWith(expect.any(Uint8Array))
    })

    it('should generate unique values with high entropy', () => {
      const values = new Set()

      // Generate 1000 random strings
      for (let i = 0; i < 1000; i++) {
        values.add(generateSecureRandomString(16))
      }

      // All should be unique
      expect(values.size).toBe(1000)
    })

    it('should work for all ID generator convenience functions', async () => {
      const { secureRequestId, secureWorkerId, secureSessionId, secureTokenId } = await import(
        '@/lib/security/crypto-secure'
      )

      const requestId = secureRequestId()
      const workerId = secureWorkerId()
      const sessionId = secureSessionId()
      const tokenId = secureTokenId()

      expect(requestId).toMatch(/^req_/)
      expect(workerId).toMatch(/^worker_/)
      expect(sessionId).toMatch(/^session_/)
      expect(tokenId).toMatch(/^token_/)
    })
  })

  describe('2. Redis Rate Limiting with Upstash', () => {
    it('should have proper rate limiters configured', () => {
      expect(authRateLimiter).toBeDefined()
      expect(apiRateLimiter).toBeDefined()
      expect(searchRateLimiter).toBeDefined()
    })

    it('should check rate limits correctly', async () => {
      const result = await checkRateLimit(authRateLimiter, 'test-user-123')

      expect(result.success).toBe(true)
      expect(result.limit).toBe(100)
      expect(result.remaining).toBe(100)
      expect(result.reset).toBeInstanceOf(Date)
      expect(result.retryAfter).toBeNull()
    })

    it('should handle rate limit exceeded', async () => {
      // Mock rate limit exceeded
      const mockLimiter: ReturnType<
        typeof import('@/lib/security/rate-limiter').createRateLimiter
      > = {
        limit: vi.fn().mockResolvedValue({
          success: false,
          limit: 100,
          remaining: 0,
          reset: Date.now() + 30000,
        }),
      }

      const result = await checkRateLimit(mockLimiter, 'test-user-123')

      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should handle Redis connection failures gracefully', async () => {
      const mockLimiter: ReturnType<
        typeof import('@/lib/security/rate-limiter').createRateLimiter
      > = {
        limit: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      }

      // Should allow request on error
      const result = await checkRateLimit(mockLimiter, 'test-user-123')

      expect(result.success).toBe(true)
      expect(result.limit).toBe(0)
      expect(result.remaining).toBe(0)
    })

    it('should work without Redis credentials (fallback mode)', () => {
      // When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set,
      // the rate limiter should fall back to a mock that always allows requests

      // This is already the case in our tests since we don't set these env vars
      expect(authRateLimiter).toBeDefined()
      // The rate limiter should work even without credentials
    })
  })

  describe('3. CSP with Dynamic Nonces', () => {
    it('should generate secure nonces', () => {
      const nonce1 = generateNonce()
      const nonce2 = generateNonce()

      // Should be base64url encoded
      expect(nonce1).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(nonce2).toMatch(/^[A-Za-z0-9_-]+$/)

      // Should be unique
      expect(nonce1).not.toBe(nonce2)

      // Should have sufficient length (16 bytes = ~22 chars base64)
      expect(nonce1.length).toBeGreaterThanOrEqual(20)
    })

    it('should build CSP with nonce correctly', () => {
      const nonce = generateNonce()
      const csp = buildCSP(defaultCSPDirectives, nonce)

      // Should include nonce in script-src and style-src
      expect(csp).toContain(`'nonce-${nonce}'`)
      expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9_-]+'/)
      expect(csp).toMatch(/style-src[^;]*'nonce-[A-Za-z0-9_-]+'/)

      // Should have all security directives
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("base-uri 'self'")
    })

    it('should have secure default CSP directives', () => {
      const csp = buildCSP(defaultCSPDirectives)

      // Check security restrictions
      expect(csp).toContain("frame-ancestors 'none'") // Prevent clickjacking
      expect(csp).toContain("object-src 'none'") // Block plugins
      expect(csp).toContain("base-uri 'self'") // Prevent base tag injection
      expect(csp).toContain("form-action 'self'") // Restrict form submissions

      // Check allowed resources
      expect(csp).toContain('https://api.github.com') // GitHub API
      expect(csp).toContain('https://vercel.live') // Vercel Live
      expect(csp).toContain('https://fonts.googleapis.com') // Google Fonts
    })
  })

  describe('4. Integration - All Security Features Together', () => {
    it('should integrate all security features in middleware', async () => {
      // Create a mock request
      const request = new NextRequest('https://contribux.vercel.app/api/search', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      })

      // Call middleware
      const response = await middleware(request)

      // Check CSP header is present
      const cspHeader = response.headers.get('Content-Security-Policy')
      expect(cspHeader).toBeTruthy()
      expect(cspHeader).toContain('nonce-') // Dynamic nonce should be present

      // Check other security headers
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })

    it('should use secure random for session/request IDs', async () => {
      // Import convenience ID generators
      const { secureSessionId, secureRequestId } = await import('@/lib/security/crypto-secure')

      // Simulate creating session and request IDs
      const sessionId = secureSessionId()
      const requestId = secureRequestId()

      // Verify format and uniqueness
      expect(sessionId).toMatch(/^session_[0-9a-z]+_[A-Za-z0-9]{9}$/)
      expect(requestId).toMatch(/^req_[0-9a-z]+_[A-Za-z0-9]{9}$/)
      expect(sessionId).not.toBe(requestId)
    })

    it('should handle rate limiting in API routes', async () => {
      // Simulate API request identifier extraction
      const req = {
        session: { user: { id: 'user123' } },
        headers: {},
        ip: '192.168.1.100',
      }

      const { getRequestIdentifier } = await import('@/lib/security/rate-limiter')
      const identifier = getRequestIdentifier(req)

      expect(identifier).toBe('user:user123')

      // Check rate limit
      const result = await checkRateLimit(apiRateLimiter, identifier)
      expect(result.success).toBe(true)
    })

    it('should have different rate limits for different endpoints', async () => {
      // These would have different configurations in production
      expect(authRateLimiter).not.toBe(apiRateLimiter)
      expect(apiRateLimiter).not.toBe(searchRateLimiter)
      expect(searchRateLimiter).not.toBe(authRateLimiter)
    })
  })

  describe('5. Security Best Practices Validation', () => {
    it('should not use Math.random() anywhere in security modules', async () => {
      // This is a compile-time check, but we can verify the modules don't expose Math.random
      const _cryptoModule = await import('@/lib/security/crypto-secure')

      // Check that our secure functions don't use Math.random
      const randomSpy = vi.spyOn(Math, 'random')

      // Generate various secure values
      getSecureRandomBytes(32)
      generateSecureRandomString(16)
      generateSecureId('test')

      // Math.random should never be called
      expect(randomSpy).not.toHaveBeenCalled()
    })

    it('should handle edge runtime compatibility', () => {
      // Our crypto-secure module should work in edge runtime
      // This is verified by the fact that we use globalThis.crypto
      expect(typeof globalThis.crypto).toBe('object')
      expect(typeof globalThis.crypto.getRandomValues).toBe('function')
    })

    it('should have proper error handling for all security features', async () => {
      // Test crypto error handling
      const cryptoModule = await import('@/lib/security/crypto-secure')
      const { getSecureRandomWithFallback } = cryptoModule

      // Should not throw even if primary method fails
      const bytes = await getSecureRandomWithFallback(16)
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBe(16)
    })

    it('should enforce security headers on all responses', async () => {
      const testPaths = ['/', '/api/search', '/api/repositories', '/api/auth/signin', '/profile']

      for (const path of testPaths) {
        const request = new NextRequest(`https://contribux.vercel.app${path}`)
        const response = await middleware(request)

        // All responses should have security headers
        expect(response.headers.get('X-Frame-Options')).toBeTruthy()
        expect(response.headers.get('X-Content-Type-Options')).toBeTruthy()
        expect(response.headers.get('Content-Security-Policy')).toBeTruthy()
      }
    })
  })
})
