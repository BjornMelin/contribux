/**
 * Security + Monitoring Integration Tests
 * Validates complete security architecture with monitoring system integration
 */

import { apiMonitoring } from '@/lib/api/monitoring'
import { monitoringMiddleware } from '@/lib/middleware/monitoring-middleware'
import { enhancedSecurityMiddleware } from '@/lib/security/enhanced-middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Mock NextRequest for testing
function createMockRequest(options: {
  url?: string
  method?: string
  headers?: Record<string, string>
  ip?: string
}): NextRequest {
  const { url = 'http://localhost:3000', method = 'GET', headers = {}, ip = '127.0.0.1' } = options

  const mockHeaders = new Headers(headers)
  if (ip && !headers['x-forwarded-for']) {
    mockHeaders.set('x-forwarded-for', ip)
  }

  const mockRequest = {
    url,
    method,
    headers: mockHeaders,
    nextUrl: new URL(url),
  } as NextRequest

  return mockRequest
}

// Integration test suite for security + monitoring
describe('Security + Monitoring Integration', () => {
  beforeEach(() => {
    // Reset monitoring state
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Cleanup after each test
  })

  describe('Middleware Chain Integration', () => {
    test('should execute monitoring -> security middleware chain correctly', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
        headers: {
          'user-agent': 'test-browser/1.0',
        },
        ip: '192.168.1.100',
      })

      // Track monitoring execution
      const monitoringSpy = vi.spyOn(apiMonitoring, 'trackRequest')

      // Execute monitoring middleware first
      const monitoringResponse = await monitoringMiddleware(request)
      expect(monitoringResponse).toBeDefined()

      // Execute security middleware
      const securityResponse = await enhancedSecurityMiddleware(request)
      expect(securityResponse).toBeDefined()

      // Verify both middlewares executed without blocking
      expect(monitoringResponse).toBeInstanceOf(NextResponse)
      expect(securityResponse).toBeInstanceOf(NextResponse)

      // Verify monitoring captured the request
      // Note: Monitoring uses setTimeout, so we need to wait
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(monitoringSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/search/repositories'),
        'GET',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          userAgent: 'test-browser/1.0',
        })
      )
    })

    test('should handle rate limiting with monitoring integration', async () => {
      const testIP = '192.168.1.200'
      const request = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
        ip: testIP,
      })

      const responses: NextResponse[] = []

      // Make multiple requests to trigger rate limiting
      for (let i = 0; i < 12; i++) {
        const response = await enhancedSecurityMiddleware(request)
        if (response) {
          responses.push(response)
        }
      }

      // Should have at least one rate limit response
      const rateLimitedResponses = responses.filter(r => r.status === 429)
      expect(rateLimitedResponses.length).toBeGreaterThan(0)

      // Verify monitoring tracked rate limit events
      await new Promise(resolve => setTimeout(resolve, 20))
      // Rate limit responses should be tracked in monitoring
    })

    test('should validate security headers in monitored responses', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/auth/session',
        method: 'GET',
      })

      const response = await enhancedSecurityMiddleware(request)
      expect(response).toBeDefined()

      if (response) {
        // Verify security headers are present
        expect(response.headers.get('X-Frame-Options')).toBe('DENY')
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(response.headers.get('Content-Security-Policy')).toBeTruthy()

        // Verify monitoring headers (if advanced monitoring enabled)
        const processingTime = response.headers.get('X-Security-Processing-Time')
        if (processingTime) {
          expect(processingTime).toMatch(/\d+ms/)
        }
      }
    })
  })

  describe('Security Event Monitoring', () => {
    test('should track suspicious request patterns', async () => {
      const suspiciousRequest = createMockRequest({
        url: 'http://localhost:3000/api/auth/signin',
        method: 'POST',
        headers: {
          'user-agent': '<script>alert("xss")</script>',
          'x-forwarded-for': '192.168.1.100',
        },
      })

      const response = await enhancedSecurityMiddleware(suspiciousRequest)

      // Should reject suspicious request
      expect(response?.status).toBe(400)

      // Should have error message
      if (response) {
        const body = await response.text()
        expect(body).toContain('Suspicious header content')
      }
    })

    test('should monitor large request payloads', async () => {
      const largePayloadRequest = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'POST',
        headers: {
          'content-length': '11000000', // 11MB
        },
      })

      const response = await enhancedSecurityMiddleware(largePayloadRequest)

      // Should reject large payloads
      expect(response?.status).toBe(400)
    })

    test('should handle CORS preflight with monitoring', async () => {
      const corsRequest = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'OPTIONS',
        headers: {
          origin: 'https://contribux.vercel.app',
          'access-control-request-method': 'POST',
        },
      })

      const response = await enhancedSecurityMiddleware(corsRequest)

      // Should handle CORS preflight
      expect(response?.status).toBe(200)

      if (response) {
        // Verify CORS headers
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
        expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy()
      }
    })
  })

  describe('Performance Security Integration', () => {
    test('should measure security middleware performance impact', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
      })

      const startTime = Date.now()
      const response = await enhancedSecurityMiddleware(request)
      const endTime = Date.now()

      const processingTime = endTime - startTime

      // Security middleware should be fast (<100ms for simple requests)
      expect(processingTime).toBeLessThan(100)

      // Response should include performance metrics if enabled
      if (response?.headers.get('X-Security-Processing-Time')) {
        const reportedTime = response.headers.get('X-Security-Processing-Time')
        expect(reportedTime).toMatch(/\d+ms/)
      }
    })

    test('should handle concurrent security processing', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        createMockRequest({
          url: 'http://localhost:3000/api/search/repositories',
          method: 'GET',
          ip: `192.168.1.${100 + i}`,
        })
      )

      const startTime = Date.now()
      const responses = await Promise.all(
        requests.map(request => enhancedSecurityMiddleware(request))
      )
      const endTime = Date.now()

      const totalTime = endTime - startTime

      // All requests should be processed
      expect(responses).toHaveLength(10)
      expect(responses.every(r => r !== null)).toBe(true)

      // Concurrent processing should be efficient
      expect(totalTime).toBeLessThan(500) // 500ms for 10 concurrent requests
    })
  })

  describe('Error Handling Integration', () => {
    test('should handle security middleware errors gracefully', async () => {
      // Create malformed request to trigger error handling
      const malformedRequest = createMockRequest({
        url: 'invalid-url',
        method: 'GET',
      })

      // Should not throw error but return fallback response
      const response = await enhancedSecurityMiddleware(malformedRequest)
      expect(response).toBeDefined()

      if (response) {
        // Should have basic security headers even in error case
        expect(response.headers.get('X-Frame-Options')).toBe('DENY')
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      }
    })

    test('should handle monitoring errors without affecting security', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
      })

      // Mock monitoring error
      vi.spyOn(apiMonitoring, 'trackRequest').mockImplementation(() => {
        throw new Error('Monitoring service unavailable')
      })

      // Security middleware should still work
      const response = await enhancedSecurityMiddleware(request)
      expect(response).toBeDefined()

      // Monitoring middleware should fail gracefully
      const monitoringResponse = await monitoringMiddleware(request)
      expect(monitoringResponse).toBeDefined()
    })
  })

  describe('Security Configuration Integration', () => {
    test('should apply different security policies based on environment', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
      })

      const response = await enhancedSecurityMiddleware(request)
      expect(response).toBeDefined()

      if (response) {
        const csp = response.headers.get('Content-Security-Policy')
        expect(csp).toBeTruthy()

        // In development, should allow localhost connections
        if (process.env.NODE_ENV === 'development') {
          expect(csp).toContain('localhost')
        }

        // Should always have secure defaults
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("frame-ancestors 'none'")
      }
    })

    test('should validate trusted proxy configuration', async () => {
      // Test with Vercel environment
      const originalVercel = process.env.VERCEL
      process.env.VERCEL = '1'

      const request = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.1',
          'x-real-ip': '203.0.113.1',
        },
      })

      const response = await enhancedSecurityMiddleware(request)
      expect(response).toBeDefined()

      // Restore environment
      if (originalVercel) {
        process.env.VERCEL = originalVercel
      } else {
        process.env.VERCEL = undefined
      }
    })
  })

  describe('Monitoring Data Integration', () => {
    test('should correlate security events with performance metrics', async () => {
      const normalRequest = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'GET',
        ip: '192.168.1.100',
      })

      const blockedRequest = createMockRequest({
        url: 'http://localhost:3000/api/search/repositories',
        method: 'POST',
        headers: {
          'content-length': '20000000', // Large payload
        },
        ip: '192.168.1.100',
      })

      // Process normal request
      const normalResponse = await enhancedSecurityMiddleware(normalRequest)
      await monitoringMiddleware(normalRequest)

      // Process blocked request
      const blockedResponse = await enhancedSecurityMiddleware(blockedRequest)
      await monitoringMiddleware(blockedRequest)

      // Wait for monitoring to process
      await new Promise(resolve => setTimeout(resolve, 50))

      // Verify different response codes tracked
      expect(normalResponse?.status).not.toBe(blockedResponse?.status)
    })

    test('should track security middleware in request lifecycle', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/auth/session',
        method: 'GET',
      })

      // Monitor the complete request lifecycle
      const _monitoringStart = Date.now()
      await monitoringMiddleware(request)

      const securityStart = Date.now()
      await enhancedSecurityMiddleware(request)
      const securityEnd = Date.now()

      const securityProcessingTime = securityEnd - securityStart

      // Security processing should be tracked
      expect(securityProcessingTime).toBeGreaterThan(0)
      expect(securityProcessingTime).toBeLessThan(100)
    })
  })
})
