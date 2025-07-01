/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Main Middleware Test Suite
 * Comprehensive testing for middleware integration, error handling,
 * and security policy enforcement
 */

// Mock Next.js server module
vi.mock('next/server', () => {
  const MockNextRequest = class {
    public url: string
    public headers: Map<string, string>
    public method: string

    constructor(url: string, options: RequestInit = {}) {
      this.url = url
      this.method = options.method || 'GET'
      this.headers = new Map()
    }
  }

  MockNextRequest.prototype.headers = {
    get: vi.fn((key: string) => null),
    set: vi.fn(),
  }

  const MockNextResponse = class {
    public status: number
    public headers: Map<string, string>
    private body: any

    constructor(body?: any, init?: ResponseInit) {
      this.status = init?.status || 200
      this.headers = new Map()
      this.body = body
    }

    static next() {
      return new MockNextResponse()
    }

    text() {
      return Promise.resolve(this.body || '')
    }
  }

  MockNextResponse.prototype.headers = {
    get: vi.fn((key: string) => null),
    set: vi.fn(),
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  }
})

import { type NextRequest, NextResponse } from 'next/server'
import { config, middleware } from '../../src/middleware'

// Mock the security modules
vi.mock('../../src/lib/security/enhanced-middleware', () => ({
  enhancedSecurityMiddleware: vi.fn(),
}))

vi.mock('../../src/lib/security/headers', () => ({
  addSecurityHeaders: vi.fn(response => {
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Access-Control-Allow-Origin', 'https://contribux.vercel.app')
    return response
  }),
  handleCorsOptions: vi.fn(),
}))

/**
 * Helper to create mock NextRequest
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

describe('Main Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Enhanced Security Middleware Integration', () => {
    it('should call enhanced security middleware first', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { addSecurityHeaders } = await import('../../src/lib/security/headers')

      // Mock enhanced middleware to return a response
      const mockResponse = new NextResponse('Enhanced response', { status: 200 })
      mockResponse.headers.set('X-Enhanced', 'true')
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(mockResponse)

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      expect(addSecurityHeaders).not.toHaveBeenCalled() // Should not fallback
      expect(response).toBe(mockResponse)
    })

    it('should fallback to basic security when enhanced returns null', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { addSecurityHeaders, handleCorsOptions } = await import(
        '../../src/lib/security/headers'
      )

      // Mock enhanced middleware to return null (pass-through)
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)
      ;(handleCorsOptions as any).mockReturnValue(null)

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      expect(handleCorsOptions).toHaveBeenCalledWith(request)
      expect(addSecurityHeaders).toHaveBeenCalled()
      expect(response).toBeInstanceOf(NextResponse)
    })

    it('should handle CORS preflight in fallback mode', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { handleCorsOptions } = await import('../../src/lib/security/headers')

      // Mock enhanced middleware to return null
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      // Mock CORS handler to return a response
      const corsResponse = new NextResponse(null, { status: 200 })
      corsResponse.headers.set('Access-Control-Allow-Origin', 'https://contribux.vercel.app')
      ;(handleCorsOptions as any).mockReturnValue(corsResponse)

      const request = createMockRequest('https://example.com/api/test', {
        method: 'OPTIONS',
      })
      const response = await middleware(request)

      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      expect(handleCorsOptions).toHaveBeenCalledWith(request)
      expect(response).toBe(corsResponse)
    })

    it('should apply basic security headers as final step', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { addSecurityHeaders, handleCorsOptions } = await import(
        '../../src/lib/security/headers'
      )

      // Mock enhanced middleware to return null
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)
      ;(handleCorsOptions as any).mockReturnValue(null)

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      expect(handleCorsOptions).toHaveBeenCalledWith(request)
      expect(addSecurityHeaders).toHaveBeenCalled()

      // Verify security headers are applied
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://contribux.vercel.app'
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle enhanced middleware errors gracefully', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { addSecurityHeaders } = await import('../../src/lib/security/headers')

      // Mock enhanced middleware to throw an error
      ;(enhancedSecurityMiddleware as any).mockRejectedValue(new Error('Enhanced middleware error'))

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      expect(addSecurityHeaders).toHaveBeenCalled()
      expect(response).toBeInstanceOf(NextResponse)

      // Should still have basic security headers
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('should handle basic security headers errors gracefully', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { addSecurityHeaders, handleCorsOptions } = await import(
        '../../src/lib/security/headers'
      )

      // Mock enhanced middleware to return null
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)
      ;(handleCorsOptions as any).mockReturnValue(null)

      // Mock addSecurityHeaders to throw an error
      ;(addSecurityHeaders as any).mockImplementation(() => {
        throw new Error('Headers error')
      })

      const request = createMockRequest('https://example.com/api/test')

      // Should not throw
      expect(async () => {
        await middleware(request)
      }).not.toThrow()

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
    })

    it('should handle complete middleware failure', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { addSecurityHeaders, handleCorsOptions } = await import(
        '../../src/lib/security/headers'
      )

      // Mock all security functions to throw errors
      ;(enhancedSecurityMiddleware as any).mockRejectedValue(new Error('Enhanced error'))
      ;(handleCorsOptions as any).mockImplementation(() => {
        throw new Error('CORS error')
      })
      ;(addSecurityHeaders as any).mockImplementation(() => {
        throw new Error('Headers error')
      })

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      // Should still have some basic security from the fallback
    })

    it('should handle network timeout errors', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      // Mock network timeout
      ;(enhancedSecurityMiddleware as any).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100)
        })
      })

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(response).toBeInstanceOf(NextResponse)
    })

    it('should handle malformed requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      // Mock enhanced middleware for malformed request
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      // Create request with malformed URL
      const request = createMockRequest('https://example.com/api/test', {
        method: 'INVALID_METHOD' as any,
      })

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
    })
  })

  describe('Request Flow Scenarios', () => {
    it('should handle GET requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest('https://example.com/api/search', {
        method: 'GET',
      })

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
    })

    it('should handle POST requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest('https://example.com/api/repositories', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
        headers: {
          'content-type': 'application/json',
        },
      })

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
    })

    it('should handle PUT requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest('https://example.com/api/bookmarks/123', {
        method: 'PUT',
      })

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
    })

    it('should handle DELETE requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest('https://example.com/api/bookmarks/123', {
        method: 'DELETE',
      })

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
    })

    it('should handle OPTIONS requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )
      const { handleCorsOptions } = await import('../../src/lib/security/headers')

      // Enhanced middleware returns null
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      // CORS handler should be called
      const corsResponse = new NextResponse(null, { status: 200 })
      ;(handleCorsOptions as any).mockReturnValue(corsResponse)

      const request = createMockRequest('https://example.com/api/test', {
        method: 'OPTIONS',
      })

      const response = await middleware(request)
      expect(response).toBe(corsResponse)
      expect(handleCorsOptions).toHaveBeenCalledWith(request)
    })
  })

  describe('Route-Specific Behavior', () => {
    it('should handle API routes', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const apiRoutes = ['/api/search', '/api/repositories', '/api/bookmarks', '/api/auth/callback']

      for (const route of apiRoutes) {
        const request = createMockRequest(`https://example.com${route}`)
        const response = await middleware(request)

        expect(response).toBeInstanceOf(NextResponse)
        expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      }
    })

    it('should handle page routes', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const pageRoutes = ['/', '/search', '/repository/123', '/profile']

      for (const route of pageRoutes) {
        const request = createMockRequest(`https://example.com${route}`)
        const response = await middleware(request)

        expect(response).toBeInstanceOf(NextResponse)
        expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
      }
    })

    it('should handle authenticated routes', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest(
        'https://example.com/profile',
        {
          method: 'GET',
        },
        {
          cookie: 'session=abc123',
          authorization: 'Bearer token123',
        }
      )

      const response = await middleware(request)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(request)
    })
  })

  describe('Security Response Verification', () => {
    it('should ensure security headers are always present', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      // Essential security headers should always be present
      expect(response.headers.get('X-Frame-Options')).toBeTruthy()
      expect(response.headers.get('X-Content-Type-Options')).toBeTruthy()
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
    })

    it('should handle rate limiting responses', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      // Mock rate limiting response
      const rateLimitResponse = new NextResponse('Rate limit exceeded', { status: 429 })
      rateLimitResponse.headers.set('Retry-After', '60')
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(rateLimitResponse)

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
    })

    it('should handle blocked requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      // Mock blocked request response
      const blockedResponse = new NextResponse('Blocked', { status: 403 })
      blockedResponse.headers.set('X-Blocked-Reason', 'suspicious-activity')
      ;(enhancedSecurityMiddleware as any).mockResolvedValue(blockedResponse)

      const request = createMockRequest('https://example.com/api/test')
      const response = await middleware(request)

      expect(response.status).toBe(403)
      expect(response.headers.get('X-Blocked-Reason')).toBe('suspicious-activity')
    })
  })

  describe('Performance and Reliability', () => {
    it('should handle concurrent requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const requests = Array.from({ length: 10 }, (_, i) =>
        createMockRequest(`https://example.com/api/test${i}`)
      )

      const promises = requests.map(request => middleware(request))
      const responses = await Promise.all(promises)

      expect(responses).toHaveLength(10)
      responses.forEach(response => {
        expect(response).toBeInstanceOf(NextResponse)
      })
    })

    it('should complete within reasonable time', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const request = createMockRequest('https://example.com/api/test')

      const startTime = Date.now()
      await middleware(request)
      const endTime = Date.now()

      const duration = endTime - startTime
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle memory pressure gracefully', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      // Simulate many rapid requests
      const promises = []
      for (let i = 0; i < 100; i++) {
        const request = createMockRequest(`https://example.com/api/test${i}`)
        promises.push(middleware(request))
      }

      const responses = await Promise.all(promises)
      expect(responses).toHaveLength(100)

      // Should not crash or leak memory
      responses.forEach(response => {
        expect(response).toBeInstanceOf(NextResponse)
      })
    })
  })

  describe('Configuration', () => {
    it('should have correct matcher configuration', () => {
      expect(config).toBeDefined()
      expect(config.matcher).toBeDefined()
      expect(Array.isArray(config.matcher)).toBe(true)

      const matcher = config.matcher[0]
      expect(matcher).toContain('(?!_next/static|_next/image|favicon.ico|public)')
    })

    it('should match expected routes', () => {
      const matcher = config.matcher[0]
      const regex = new RegExp(matcher.slice(1, -1)) // Remove leading/trailing slashes

      // Should match
      expect(regex.test('/')).toBe(true)
      expect(regex.test('/api/test')).toBe(true)
      expect(regex.test('/search')).toBe(true)
      expect(regex.test('/profile')).toBe(true)

      // Should not match excluded paths
      expect(regex.test('/_next/static/css/app.css')).toBe(false)
      expect(regex.test('/_next/image/optimize')).toBe(false)
      expect(regex.test('/favicon.ico')).toBe(false)
      expect(regex.test('/public/logo.png')).toBe(false)
    })
  })

  describe('Integration Scenarios', () => {
    it('should work with authentication flow', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const authRequest = createMockRequest(
        'https://example.com/api/auth/signin',
        {
          method: 'POST',
        },
        {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.100',
        }
      )

      const response = await middleware(authRequest)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(authRequest)
    })

    it('should work with API search requests', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const searchRequest = createMockRequest(
        'https://example.com/api/search?q=react',
        {
          method: 'GET',
        },
        {
          accept: 'application/json',
          'x-forwarded-for': '192.168.1.101',
        }
      )

      const response = await middleware(searchRequest)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(searchRequest)
    })

    it('should work with bookmark operations', async () => {
      const { enhancedSecurityMiddleware } = await import(
        '../../src/lib/security/enhanced-middleware'
      )

      ;(enhancedSecurityMiddleware as any).mockResolvedValue(null)

      const bookmarkRequest = createMockRequest(
        'https://example.com/api/bookmarks',
        {
          method: 'POST',
          body: JSON.stringify({ repositoryId: 123 }),
        },
        {
          'content-type': 'application/json',
          authorization: 'Bearer token123',
          'x-forwarded-for': '192.168.1.102',
        }
      )

      const response = await middleware(bookmarkRequest)
      expect(response).toBeInstanceOf(NextResponse)
      expect(enhancedSecurityMiddleware).toHaveBeenCalledWith(bookmarkRequest)
    })
  })
})
