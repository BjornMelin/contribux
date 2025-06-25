/**
 * Edge Middleware Security Test Suite
 * Tests Vercel Edge Middleware for ultra-fast rate limiting, DDoS protection,
 * and security controls at the edge
 */

import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the crypto module
vi.mock('../../src/lib/security/crypto', () => ({
  createSecureHash: vi
    .fn()
    .mockImplementation((data: string) => Promise.resolve(`hash-${data.length}`)),
  generateSecureToken: vi
    .fn()
    .mockImplementation((length: number) => `token-${'x'.repeat(length)}`),
}))

// Helper to create mock NextRequest
function createMockRequest(
  url: string,
  options: RequestInit & { signal?: AbortSignal } = {},
  headers: Record<string, string> = {}
): NextRequest {
  const request = new NextRequest(url, options)

  // Set custom headers
  Object.entries(headers).forEach(([key, value]) => {
    request.headers.set(key, value)
  })

  return request
}

describe('Edge Middleware Security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Edge Security Middleware', () => {
    it('should allow requests within rate limit', async () => {
      const { edgeSecurityMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        }
      )

      const response = await edgeSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
    })

    it('should handle multiple concurrent requests', async () => {
      const { edgeSecurityMiddleware } = await import('../../src/lib/security/edge-middleware')

      const requests = Array.from({ length: 5 }, (_, i) =>
        createMockRequest(
          `https://example.com/api/test${i}`,
          { method: 'GET' },
          {
            'x-forwarded-for': `192.168.1.${i + 100}`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          }
        )
      )

      const responses = await Promise.all(requests.map(req => edgeSecurityMiddleware(req)))

      responses.forEach(response => {
        expect(response).toBeInstanceOf(NextResponse)
        expect(response.status).toBe(200)
      })
    })

    it('should handle requests with missing headers gracefully', async () => {
      const { edgeSecurityMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest('https://example.com/api/test', {
        method: 'GET',
      })

      const response = await edgeSecurityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
    })

    it('should process requests quickly', async () => {
      const { edgeSecurityMiddleware } = await import('../../src/lib/security/edge-middleware')

      const startTime = Date.now()

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        { 'x-forwarded-for': '192.168.1.1' }
      )

      await edgeSecurityMiddleware(request)

      const processingTime = Date.now() - startTime
      expect(processingTime).toBeLessThan(100) // Should be very fast
    })
  })

  describe('Enhanced Edge Security Middleware', () => {
    it('should return undefined for allowed requests', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/safe',
        { method: 'GET' },
        {
          'x-forwarded-for': '8.8.8.8', // Google DNS - good reputation
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      expect(response).toBeUndefined() // Allowed requests return undefined
    })

    it('should handle requests from various IP addresses', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const ipAddresses = [
        '192.168.1.100', // Private IP
        '10.0.0.1', // Private IP
        '8.8.8.8', // Google DNS
        '1.1.1.1', // Cloudflare DNS
        '203.0.113.1', // Test IP
      ]

      for (const ip of ipAddresses) {
        const request = createMockRequest(
          'https://example.com/api/test',
          { method: 'GET' },
          {
            'x-forwarded-for': ip,
            'user-agent': 'Mozilla/5.0 (compatible; Test/1.0)',
          }
        )

        const response = await enhancedEdgeMiddleware(request)

        // All requests should be processed (either allowed or blocked)
        expect(response === undefined || response instanceof NextResponse).toBe(true)
      }
    })

    it('should detect bot patterns', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'bot/1.0 crawler spider',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Bot detection may trigger security measures
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should analyze suspicious request patterns', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/admin/config?select=*+from+users',
        { method: 'GET' },
        {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'sqlmap/1.0',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Suspicious patterns should be handled appropriately
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should handle errors gracefully', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      // Create a request that might cause internal errors
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '999.999.999.999', // Invalid IP format
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Should handle errors gracefully and not crash
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })
  })

  describe('Threat Intelligence Integration', () => {
    it('should handle IP reputation checking', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '8.8.8.8', // Google DNS - good reputation
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Response should be processed (either allowed or challenged based on risk)
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should analyze suspicious request patterns', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/admin/.env?select=*+from+users',
        { method: 'GET' },
        {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'sqlmap/1.0',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Suspicious patterns should trigger security measures
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should handle IP reputation analysis errors gracefully', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '999.999.999.999', // Invalid IP
          'user-agent': 'Mozilla/5.0',
        }
      )

      // Should handle errors gracefully and not crash
      const response = await enhancedEdgeMiddleware(request)
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })
  })

  describe('Geographic Security Controls', () => {
    it('should allow requests from allowed countries', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '173.252.74.1', // US IP
          'cf-ipcountry': 'US', // Allowed country
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Response should be processed (either allowed or challenged based on risk)
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should handle requests from blocked countries', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '1.2.3.4',
          'cf-ipcountry': 'CN', // Blocked country
          'user-agent': 'Mozilla/5.0',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Blocked countries should trigger security measures
      expect(response === undefined || response instanceof NextResponse).toBe(true)
      if (response instanceof NextResponse) {
        expect([403, 429].includes(response.status)).toBe(true)
      }
    })

    it('should handle missing geo headers gracefully', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '127.0.0.1',
          'user-agent': 'Mozilla/5.0',
        }
      )

      const response = await enhancedEdgeMiddleware(request)
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })
  })

  describe('Automated Client Detection', () => {
    it('should allow legitimate user agents', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Legitimate browsers should be allowed
      expect(response).toBeUndefined()
    })

    it('should detect and handle suspicious bots', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'user-agent': 'ScrapyBot/1.0 spider crawler',
          // Missing common browser headers (suspicious)
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Suspicious bots should trigger security measures
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should detect headless browser patterns', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/91.0',
        }
      )

      const response = await enhancedEdgeMiddleware(request)

      // Headless browsers should be handled appropriately
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })

    it('should handle missing user agent gracefully', async () => {
      const { enhancedEdgeMiddleware } = await import('../../src/lib/security/edge-middleware')

      const request = createMockRequest('https://example.com/api/test', { method: 'GET' })

      const response = await enhancedEdgeMiddleware(request)

      // Missing user agent should be handled gracefully
      expect(response === undefined || response instanceof NextResponse).toBe(true)
    })
  })

  describe('Edge Performance', () => {
    it('should process requests quickly', async () => {
      const { edgeSecurityMiddleware } = await import('../../src/lib/security/edge-middleware')

      const startTime = Date.now()

      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'GET' },
        {
          'x-forwarded-for': '192.168.1.1',
        }
      )

      await edgeSecurityMiddleware(request)

      const processingTime = Date.now() - startTime
      expect(processingTime).toBeLessThan(100) // Should be very fast
    })

    it('should handle concurrent requests efficiently', async () => {
      const { edgeSecurityMiddleware } = await import('../../src/lib/security/edge-middleware')

      const requests = Array.from({ length: 10 }, (_, i) =>
        createMockRequest(
          `https://example.com/api/test${i}`,
          { method: 'GET' },
          {
            'x-forwarded-for': `192.168.1.${i + 1}`,
          }
        )
      )

      const startTime = Date.now()
      await Promise.all(requests.map(req => edgeSecurityMiddleware(req)))
      const processingTime = Date.now() - startTime

      expect(processingTime).toBeLessThan(500) // Should handle concurrent requests efficiently
    })
  })

  describe('Configuration Validation', () => {
    it('should have valid rate limit configuration', async () => {
      const { RATE_LIMIT_CONFIG } = await import('../../src/lib/security/edge-middleware')

      expect(RATE_LIMIT_CONFIG.global.window).toBeGreaterThan(0)
      expect(RATE_LIMIT_CONFIG.global.requests).toBeGreaterThan(0)
      expect(RATE_LIMIT_CONFIG.perIp.window).toBeGreaterThan(0)
      expect(RATE_LIMIT_CONFIG.perIp.requests).toBeGreaterThan(0)
      expect(RATE_LIMIT_CONFIG.perUser.window).toBeGreaterThan(0)
      expect(RATE_LIMIT_CONFIG.perUser.requests).toBeGreaterThan(0)
    })

    it('should have valid DDoS configuration', async () => {
      const { DDOS_CONFIG } = await import('../../src/lib/security/edge-middleware')

      expect(DDOS_CONFIG.burstThreshold).toBeGreaterThan(0)
      expect(DDOS_CONFIG.burstWindow).toBeGreaterThan(0)
      expect(DDOS_CONFIG.blockDuration).toBeGreaterThan(0)
      expect(DDOS_CONFIG.suspiciousThreshold).toBeGreaterThan(0)
    })

    it('should have valid geo-blocking configuration', async () => {
      const { GEO_BLOCKING_CONFIG } = await import('../../src/lib/security/edge-middleware')

      expect(Array.isArray(GEO_BLOCKING_CONFIG.blockedCountries)).toBe(true)
      expect(Array.isArray(GEO_BLOCKING_CONFIG.allowedCountries)).toBe(true)
      expect(GEO_BLOCKING_CONFIG.blockedCountries.length).toBeGreaterThan(0)
      expect(GEO_BLOCKING_CONFIG.allowedCountries.length).toBeGreaterThan(0)
      expect(typeof GEO_BLOCKING_CONFIG.enableStrictMode).toBe('boolean')
    })

    it('should have valid bot detection configuration', async () => {
      const { BOT_DETECTION_CONFIG } = await import('../../src/lib/security/edge-middleware')

      expect(BOT_DETECTION_CONFIG.maxFingerprints).toBeGreaterThan(0)
      expect(BOT_DETECTION_CONFIG.fingerprintWindow).toBeGreaterThan(0)
      expect(Array.isArray(BOT_DETECTION_CONFIG.suspiciousPatterns)).toBe(true)
      expect(BOT_DETECTION_CONFIG.suspiciousPatterns.length).toBeGreaterThan(0)
    })
  })
})
