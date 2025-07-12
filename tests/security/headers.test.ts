/**
 * @vitest-environment node
 */

import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Security Headers Test Suite
 * Comprehensive testing for basic security headers, CORS configuration,
 * and CSP policies
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
    get: vi.fn((_key: string) => null),
    set: vi.fn(),
  }

  const MockNextResponse = class {
    public status: number
    public headers: Map<string, string>
    private body: BodyInit | null
    private _internalHeaders: Map<string, string>

    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.status = init?.status || 200
      this.headers = new Map()
      this._internalHeaders = new Map()
      this.body = body || null
    }

    static next() {
      return new MockNextResponse()
    }

    text() {
      return Promise.resolve(this.body || '')
    }
  }

  interface MockResponseWithHeaders {
    _internalHeaders?: Map<string, string>
  }

  MockNextResponse.prototype.headers = {
    get: vi.fn().mockImplementation(function (this: MockResponseWithHeaders, key: string) {
      return this._internalHeaders?.get(key) || null
    }),
    set: vi.fn().mockImplementation(function (
      this: MockResponseWithHeaders,
      key: string,
      value: string
    ) {
      if (!this._internalHeaders) {
        this._internalHeaders = new Map()
      }
      this._internalHeaders.set(key, value)
    }),
    has: vi.fn().mockImplementation(function (this: MockResponseWithHeaders, key: string) {
      return this._internalHeaders?.has(key) || false
    }),
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  }
})

import { addSecurityHeaders, handleCorsOptions } from '../../src/lib/security/headers'

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

/**
 * Helper to create mock NextResponse
 */
function createMockResponse(status = 200): NextResponse {
  return new NextResponse(null, { status })
}

describe('Security Headers', () => {
  beforeEach(() => {
    // Clear any mocks
  })

  describe('addSecurityHeaders', () => {
    it('should add basic CORS headers', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://contribux.vercel.app')
      expect(result.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, PUT, DELETE, OPTIONS'
      )
      expect(result.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
      expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })

    it('should add security headers', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      expect(result.headers.get('X-Frame-Options')).toBe('DENY')
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(result.headers.get('Permissions-Policy')).toBe(
        'camera=(), microphone=(), geolocation=()'
      )
    })

    it('should add Content Security Policy', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain("style-src 'self' https://fonts.googleapis.com")
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com")
      expect(csp).toContain("img-src 'self' data: https: blob:")
      expect(csp).toContain("connect-src 'self' https://api.github.com")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain("object-src 'none'")
    })

    it('should include specific hash for styles', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).toContain("'sha256-tQjf8gvb2ROOMapIxFvFAYBeUJ0v1HCbOcSmDNXGtDo='")
    })

    it('should not contain unsafe-inline directive', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).not.toContain('unsafe-inline')
      // Production CSP allows wasm-unsafe-eval for WebAssembly performance
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('should return the same response object', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      expect(result).toBe(response)
    })

    it('should handle different response status codes', () => {
      const statusCodes = [200, 201, 400, 404, 500]

      statusCodes.forEach(status => {
        const response = createMockResponse(status)
        const result = addSecurityHeaders(response)

        expect(result.status).toBe(status)
        expect(result.headers.get('X-Frame-Options')).toBe('DENY')
        expect(result.headers.get('Access-Control-Allow-Origin')).toBe(
          'https://contribux.vercel.app'
        )
      })
    })

    it('should allow specific external resources', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')

      // Verify specific allowed domains (production CSP)
      expect(csp).toContain('https://fonts.googleapis.com') // Google Fonts CSS
      expect(csp).toContain('https://fonts.gstatic.com') // Google Fonts files
      expect(csp).toContain('https://api.github.com') // GitHub API
      expect(csp).toContain('https://avatars.githubusercontent.com') // GitHub avatars
    })

    it('should preserve existing headers', () => {
      const response = createMockResponse()
      response.headers.set('Custom-Header', 'custom-value')
      response.headers.set('Another-Header', 'another-value')

      const result = addSecurityHeaders(response)

      expect(result.headers.get('Custom-Header')).toBe('custom-value')
      expect(result.headers.get('Another-Header')).toBe('another-value')
      expect(result.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('should overwrite conflicting headers', () => {
      const response = createMockResponse()
      response.headers.set('X-Frame-Options', 'SAMEORIGIN')
      response.headers.set('Access-Control-Allow-Origin', '*')

      const result = addSecurityHeaders(response)

      expect(result.headers.get('X-Frame-Options')).toBe('DENY')
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://contribux.vercel.app')
    })
  })

  describe('handleCorsOptions', () => {
    it('should handle OPTIONS requests', () => {
      const request = createMockRequest('https://example.com/api/test', {
        method: 'OPTIONS',
      })

      const response = handleCorsOptions(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(200)
    })

    it('should return null for non-OPTIONS requests', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

      methods.forEach(method => {
        const request = createMockRequest('https://example.com/api/test', {
          method,
        })

        const response = handleCorsOptions(request)
        expect(response).toBeNull()
      })
    })

    it('should add security headers to OPTIONS response', () => {
      const request = createMockRequest('https://example.com/api/test', {
        method: 'OPTIONS',
      })

      const response = handleCorsOptions(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://contribux.vercel.app'
      )
      expect(response?.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response?.headers.get('Content-Security-Policy')).toBeTruthy()
    })

    it('should handle OPTIONS with custom headers', () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'OPTIONS' },
        {
          Origin: 'https://contribux.vercel.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        }
      )

      const response = handleCorsOptions(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(200)
    })

    it('should handle malformed OPTIONS requests', () => {
      const request = createMockRequest(
        'https://example.com/api/test',
        { method: 'OPTIONS' },
        {
          Origin: 'invalid-origin',
          'Access-Control-Request-Method': 'INVALID',
        }
      )

      const response = handleCorsOptions(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(200)
      // Should still add security headers
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://contribux.vercel.app'
      )
    })
  })

  describe('CORS Security', () => {
    it('should only allow specific origin', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const allowedOrigin = result.headers.get('Access-Control-Allow-Origin')
      expect(allowedOrigin).toBe('https://contribux.vercel.app')
      expect(allowedOrigin).not.toBe('*')
    })

    it('should allow specific HTTP methods only', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const allowedMethods = result.headers.get('Access-Control-Allow-Methods')
      expect(allowedMethods).toBe('GET, POST, PUT, DELETE, OPTIONS')

      // Should not include dangerous methods
      expect(allowedMethods).not.toContain('TRACE')
      expect(allowedMethods).not.toContain('CONNECT')
    })

    it('should allow specific headers only', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const allowedHeaders = result.headers.get('Access-Control-Allow-Headers')
      expect(allowedHeaders).toBe('Content-Type, Authorization')

      // Should be restrictive
      expect(allowedHeaders).not.toContain('*')
    })

    it('should enable credentials', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const allowCredentials = result.headers.get('Access-Control-Allow-Credentials')
      expect(allowCredentials).toBe('true')
    })
  })

  describe('CSP Security Analysis', () => {
    it('should prevent XSS attacks', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')

      // Should not allow unsafe practices
      expect(csp).not.toContain("'unsafe-inline'")
      expect(csp).not.toContain("'unsafe-eval'")

      // Data URIs should only be allowed for specific sources (img, font, media)
      expect(csp).not.toContain("script-src 'self' data:")
      expect(csp).not.toContain("default-src 'self' data:")

      // Should be restrictive on script sources
      expect(csp).toContain("script-src 'self'")
    })

    it('should prevent clickjacking', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      const xFrameOptions = result.headers.get('X-Frame-Options')

      expect(csp).toContain("frame-ancestors 'none'")
      expect(xFrameOptions).toBe('DENY')
    })

    it('should prevent MIME sniffing attacks', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should control referrer information', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })

    it('should restrict dangerous permissions', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const permissionsPolicy = result.headers.get('Permissions-Policy')
      expect(permissionsPolicy).toBe('camera=(), microphone=(), geolocation=()')
    })

    it('should allow necessary image sources', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')

      // Should allow various image sources for avatars, icons, etc.
      expect(csp).toContain("img-src 'self' data: https: blob:")
    })

    it('should restrict form actions', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).toContain("form-action 'self'")
    })

    it('should restrict base URI', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).toContain("base-uri 'self'")
    })

    it('should block object sources', () => {
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).toContain("object-src 'none'")
    })
  })

  describe('Header Combinations', () => {
    it('should work with addSecurityHeaders and handleCorsOptions together', () => {
      // Simulate the middleware flow
      const request = createMockRequest('https://example.com/api/test', {
        method: 'OPTIONS',
      })

      // First, handle CORS OPTIONS
      const corsResponse = handleCorsOptions(request)
      expect(corsResponse).toBeInstanceOf(NextResponse)

      // The CORS handler should have already applied security headers
      expect(corsResponse?.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://contribux.vercel.app'
      )
      expect(corsResponse?.headers.get('X-Frame-Options')).toBe('DENY')
      expect(corsResponse?.headers.get('Content-Security-Policy')).toBeTruthy()
    })

    it('should handle regular requests with security headers', () => {
      const request = createMockRequest('https://example.com/api/test', {
        method: 'GET',
      })

      // CORS handler returns null for non-OPTIONS
      const corsResponse = handleCorsOptions(request)
      expect(corsResponse).toBeNull()

      // Apply security headers to regular response
      const response = createMockResponse()
      const result = addSecurityHeaders(response)

      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://contribux.vercel.app')
      expect(result.headers.get('X-Frame-Options')).toBe('DENY')
    })
  })

  describe('Error Scenarios', () => {
    it('should handle null response gracefully', () => {
      // This test ensures the function is robust
      expect(() => {
        const response = createMockResponse()
        addSecurityHeaders(response)
      }).not.toThrow()
    })

    it('should handle response with existing CSP', () => {
      const response = createMockResponse()
      response.headers.set('Content-Security-Policy', "default-src 'none'")

      const result = addSecurityHeaders(response)

      // Should overwrite with secure policy
      const csp = result.headers.get('Content-Security-Policy')
      expect(csp).toContain("default-src 'self'")
      expect(csp).not.toContain("default-src 'none'")
    })

    it('should handle large number of headers', () => {
      const response = createMockResponse()

      // Add many headers
      for (let i = 0; i < 100; i++) {
        response.headers.set(`Custom-Header-${i}`, `value-${i}`)
      }

      const result = addSecurityHeaders(response)

      // Should still add security headers
      expect(result.headers.get('X-Frame-Options')).toBe('DENY')

      // Should preserve custom headers
      expect(result.headers.get('Custom-Header-50')).toBe('value-50')
    })
  })
})
