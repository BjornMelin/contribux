/**
 * Security Headers Tests
 * Tests enhanced security headers middleware functionality
 */

import { auditLogger } from '@/lib/security/audit-logger'
import {
  SecurityHeadersManager,
  developmentSecurityHeaders,
  productionSecurityHeaders,
  securityHeadersMiddleware,
} from '@/lib/security/security-headers'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock audit logger
vi.mock('@/lib/security/audit-logger', () => ({
  auditLogger: {
    log: vi.fn(),
  },
  AuditEventType: {
    SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  },
  AuditSeverity: {
    WARNING: 'WARNING',
  },
}))

describe('SecurityHeadersManager', () => {
  let manager: SecurityHeadersManager
  let request: NextRequest
  let response: NextResponse

  beforeEach(() => {
    manager = new SecurityHeadersManager()
    request = new NextRequest('https://example.com/page')
    response = new NextResponse('Hello World')
    vi.clearAllMocks()
  })

  describe('applyHeaders', () => {
    it('should apply all security headers by default', () => {
      const result = manager.applyHeaders(request, response)

      // Check essential security headers
      expect(result.headers.get('X-Frame-Options')).toBe('DENY')
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(result.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(result.headers.get('Permissions-Policy')).toBeTruthy()
      expect(result.headers.get('Content-Security-Policy')).toBeTruthy()
      expect(result.headers.get('Strict-Transport-Security')).toBe(
        'max-age=31536000; includeSubDomains'
      )
    })

    it('should generate request ID if not present', () => {
      const result = manager.applyHeaders(request, response)

      expect(result.headers.get('X-Request-ID')).toMatch(/^[a-f0-9-]+$/)
    })

    it('should preserve existing request ID', () => {
      request.headers.set('X-Request-ID', 'existing-id')

      const result = manager.applyHeaders(request, response)

      expect(result.headers.get('X-Request-ID')).toBe('existing-id')
    })

    it('should skip disabled headers', () => {
      const result = manager.applyHeaders(request, response, {
        frameOptions: false,
        contentTypeOptions: false,
      })

      expect(result.headers.get('X-Frame-Options')).toBeNull()
      expect(result.headers.get('X-Content-Type-Options')).toBeNull()
      expect(result.headers.get('X-XSS-Protection')).toBe('1; mode=block') // Still applied
    })

    it('should use custom values when provided', () => {
      const result = manager.applyHeaders(request, response, {
        frameOptions: 'SAMEORIGIN',
        referrerPolicy: 'no-referrer',
      })

      expect(result.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
      expect(result.headers.get('Referrer-Policy')).toBe('no-referrer')
    })

    it('should apply HSTS with custom max age', () => {
      const result = manager.applyHeaders(request, response, {
        hsts: {
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true,
        },
      })

      expect(result.headers.get('Strict-Transport-Security')).toBe(
        'max-age=63072000; includeSubDomains; preload'
      )
    })

    it('should handle complex permissions policy', () => {
      const result = manager.applyHeaders(request, response, {
        permissionsPolicy: {
          camera: ['self', 'https://trusted.com'],
          microphone: ['none'],
          geolocation: ['self'],
          payment: ['self', 'https://payment.com'],
        },
      })

      const policy = result.headers.get('Permissions-Policy')
      expect(policy).toContain('camera=(self "https://trusted.com")')
      expect(policy).toContain('microphone=()')
      expect(policy).toContain('geolocation=(self)')
      expect(policy).toContain('payment=(self "https://payment.com")')
    })
  })

  describe('Content Security Policy', () => {
    it('should generate default CSP', () => {
      const csp = manager.generateCSP()

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).toContain("img-src 'self' data: https:")
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("connect-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain("form-action 'self'")
    })

    it('should generate CSP with custom directives', () => {
      const customCsp = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'nonce-abc123'"],
        'style-src': ["'self'", 'https://cdn.example.com'],
        'img-src': ["'self'", 'https://images.example.com'],
        'connect-src': ["'self'", 'https://api.example.com'],
        'report-uri': ['/csp-report'],
      }

      const csp = manager.generateCSP(customCsp)

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self' 'nonce-abc123'")
      expect(csp).toContain("style-src 'self' https://cdn.example.com")
      expect(csp).toContain("img-src 'self' https://images.example.com")
      expect(csp).toContain("connect-src 'self' https://api.example.com")
      expect(csp).toContain('report-uri /csp-report')
    })

    it('should handle CSP with nonce', () => {
      const result = manager.applyHeaders(request, response, {
        csp: {
          useNonce: true,
          directives: {
            'script-src': ["'self'"],
          },
        },
      })

      const csp = result.headers.get('Content-Security-Policy')
      const nonceMatch = csp?.match(/'nonce-([^']+)'/)

      expect(nonceMatch).toBeTruthy()
      expect(csp).toContain("'self'")
      expect(csp).toContain('script-src')
    })

    it('should set CSP report-only mode', () => {
      const result = manager.applyHeaders(request, response, {
        csp: {
          reportOnly: true,
          directives: {
            'default-src': ["'self'"],
          },
        },
      })

      expect(result.headers.get('Content-Security-Policy')).toBeNull()
      expect(result.headers.get('Content-Security-Policy-Report-Only')).toContain(
        "default-src 'self'"
      )
    })
  })

  describe('validateHeaders', () => {
    it('should detect missing security headers', () => {
      const testResponse = new NextResponse('Test')

      const validation = manager.validateHeaders(testResponse)

      expect(validation.missing).toContain('X-Frame-Options')
      expect(validation.missing).toContain('X-Content-Type-Options')
      expect(validation.missing).toContain('Content-Security-Policy')
      expect(validation.issues).toHaveLength(0)
    })

    it('should detect weak header values', () => {
      const testResponse = new NextResponse('Test')
      testResponse.headers.set('X-Frame-Options', 'ALLOWALL')
      testResponse.headers.set('Content-Security-Policy', 'default-src *')

      const validation = manager.validateHeaders(testResponse)

      expect(validation.issues).toContainEqual({
        header: 'X-Frame-Options',
        issue: 'Weak value: ALLOWALL',
      })
      expect(validation.issues).toContainEqual({
        header: 'Content-Security-Policy',
        issue: 'Contains wildcard source',
      })
    })

    it('should validate correct headers', () => {
      const testResponse = new NextResponse('Test')
      const result = manager.applyHeaders(request, testResponse)

      const validation = manager.validateHeaders(result)

      expect(validation.missing).toHaveLength(0)
      expect(validation.issues).toHaveLength(0)
    })
  })

  describe('checkViolations', () => {
    it('should detect clickjacking attempts', async () => {
      const maliciousRequest = new NextRequest('https://example.com/page', {
        headers: {
          Referer: 'https://evil-frame.com',
          'X-Frame-Options': 'ALLOWALL',
        },
      })

      await manager.checkViolations(maliciousRequest, response)

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Potential clickjacking attempt detected',
          metadata: expect.objectContaining({
            referer: 'https://evil-frame.com',
          }),
        })
      )
    })

    it('should detect CSP violations', async () => {
      const violationRequest = new NextRequest('https://example.com/csp-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/csp-report',
        },
      })

      await manager.checkViolations(violationRequest, response)

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CSP violation reported',
        })
      )
    })

    it('should detect missing security headers in response', async () => {
      const weakResponse = new NextResponse('Test')

      await manager.checkViolations(request, weakResponse)

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Missing security headers detected',
          metadata: expect.objectContaining({
            missing: expect.arrayContaining(['X-Frame-Options', 'X-Content-Type-Options']),
          }),
        })
      )
    })
  })
})

describe('securityHeadersMiddleware', () => {
  it('should apply headers to all responses', () => {
    const request = new NextRequest('https://example.com/api/test')
    const middleware = securityHeadersMiddleware()

    const result = middleware(request)

    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(result.headers.get('X-Frame-Options')).toBe('DENY')
    expect(result.headers.get('Content-Security-Policy')).toBeTruthy()
  })

  it('should use production headers in production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const request = new NextRequest('https://example.com/api/test')
    const middleware = securityHeadersMiddleware()

    const result = middleware(request)

    // Production should have strict CSP
    const csp = result.headers.get('Content-Security-Policy')
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')

    process.env.NODE_ENV = originalEnv
  })

  it('should use development headers in development', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const request = new NextRequest('https://example.com/api/test')
    const middleware = securityHeadersMiddleware()

    const result = middleware(request)

    // Development should allow unsafe-inline for hot reload
    const csp = result.headers.get('Content-Security-Policy')
    expect(csp).toContain('unsafe-inline')
    expect(csp).toContain('unsafe-eval')

    process.env.NODE_ENV = originalEnv
  })
})

describe('Header Configurations', () => {
  it('should have stricter production headers', () => {
    // Production CSP should not have unsafe-inline or unsafe-eval
    const prodCsp = productionSecurityHeaders.contentSecurityPolicy?.directives?.['script-src']
    expect(prodCsp).not.toContain("'unsafe-inline'")
    expect(prodCsp).not.toContain("'unsafe-eval'")

    // Production should enforce HTTPS
    expect(productionSecurityHeaders.strictTransportSecurity).toBeTruthy()
  })

  it('should have relaxed development headers', () => {
    // Development CSP should allow unsafe-inline and localhost
    const devCsp = developmentSecurityHeaders.contentSecurityPolicy?.directives?.['script-src']
    expect(devCsp).toContain("'unsafe-inline'")
    expect(devCsp).toContain("'unsafe-eval'")

    const devConnect = developmentSecurityHeaders.contentSecurityPolicy?.directives?.['connect-src']
    expect(devConnect).toContain('ws:')
  })
})

describe('Custom Header Scenarios', () => {
  let manager: SecurityHeadersManager

  beforeEach(() => {
    manager = new SecurityHeadersManager()
  })

  it('should handle API responses differently', () => {
    const request = new NextRequest('https://example.com/api/data')
    const response = NextResponse.json({ data: 'test' })

    const result = manager.applyHeaders(request, response, {
      // API responses might not need frame options
      frameOptions: false,
      // But should have strict content type
      contentTypeOptions: 'nosniff',
    })

    expect(result.headers.get('X-Frame-Options')).toBeNull()
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('should handle file downloads', () => {
    const request = new NextRequest('https://example.com/download/file.pdf')
    const response = new NextResponse('PDF content')
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set('Content-Disposition', 'attachment; filename="file.pdf"')

    const result = manager.applyHeaders(request, response, {
      // Downloads should prevent MIME sniffing
      contentTypeOptions: 'nosniff',
      // And prevent framing
      frameOptions: 'DENY',
      // Custom CSP for downloads
      csp: {
        directives: {
          'default-src': ["'none'"],
          'style-src': ["'unsafe-inline'"], // For PDF viewer
        },
      },
    })

    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(result.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
  })
})
