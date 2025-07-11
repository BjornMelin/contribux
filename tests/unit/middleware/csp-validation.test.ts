/**
 * @vitest-environment node
 */

import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeCSPSecurity,
  type CSPDirectives,
  CSPViolationAggregator,
  cspMiddleware,
  generateCSPHeader,
  reportCSPViolation,
  validateCSPDirective,
} from '@/lib/middleware/csp'
import { parseCSPHeader } from '@/lib/utils/csp-parser'

describe('CSP (Content Security Policy) Validation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('CSP Header Generation', () => {
    it('should generate valid CSP header with default directives', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'https://api.github.com'],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      }

      const cspHeader = generateCSPHeader(directives)

      expect(cspHeader).toContain("default-src 'self'")
      expect(cspHeader).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
      expect(cspHeader).toContain("connect-src 'self' https://api.github.com")
      expect(cspHeader).toContain("frame-ancestors 'none'")
    })

    it('should generate nonce-based CSP for scripts', () => {
      const nonce = crypto.randomUUID()

      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", `'nonce-${nonce}'`],
        'style-src': ["'self'", `'nonce-${nonce}'`],
      }

      const cspHeader = generateCSPHeader(directives)

      expect(cspHeader).toContain(`script-src 'self' 'nonce-${nonce}'`)
      expect(cspHeader).toContain(`style-src 'self' 'nonce-${nonce}'`)
    })

    it('should include report-uri directive when configured', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'report-uri': ['/api/csp-report'],
      }

      const cspHeader = generateCSPHeader(directives)

      expect(cspHeader).toContain('report-uri /api/csp-report')
    })

    it('should handle hash-based CSP for inline scripts', () => {
      const scriptHash = 'sha256-abc123def456...'

      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", `'${scriptHash}'`],
      }

      const cspHeader = generateCSPHeader(directives)

      expect(cspHeader).toContain(`script-src 'self' '${scriptHash}'`)
    })
  })

  describe('CSP Middleware', () => {
    it('should add CSP header to responses', async () => {
      const request = new NextRequest('http://localhost/page')
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const middleware = cspMiddleware({
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'"],
        },
      })

      const response = await middleware(request, handler)

      const cspHeader = response.headers.get('content-security-policy')
      expect(cspHeader).toBeDefined()
      expect(cspHeader).toContain("default-src 'self'")
    })

    it('should use report-only mode when configured', async () => {
      const request = new NextRequest('http://localhost/page')
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const middleware = cspMiddleware({
        directives: {
          'default-src': ["'self'"],
        },
        reportOnly: true,
      })

      const response = await middleware(request, handler)

      expect(response.headers.get('content-security-policy')).toBeNull()
      expect(response.headers.get('content-security-policy-report-only')).toBeDefined()
    })

    it('should generate unique nonce for each request', async () => {
      const middleware = cspMiddleware({
        directives: {
          'script-src': ["'self'", "'nonce-{nonce}'"],
        },
        useNonce: true,
      })

      const handler = vi.fn().mockImplementation(async (req: any) => {
        return NextResponse.json({ nonce: req.nonce })
      })

      // Make two requests
      const request1 = new NextRequest('http://localhost/page')
      const request2 = new NextRequest('http://localhost/page')

      const response1 = await middleware(request1, handler)
      const response2 = await middleware(request2, handler)

      const body1 = await response1.json()
      const body2 = await response2.json()

      expect(body1.nonce).toBeDefined()
      expect(body2.nonce).toBeDefined()
      expect(body1.nonce).not.toBe(body2.nonce)
    })

    it('should allow dynamic CSP based on request', async () => {
      const middleware = cspMiddleware({
        directives: req => {
          const isAdmin = req.headers.get('x-admin') === 'true'

          return {
            'default-src': ["'self'"],
            'script-src': isAdmin ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
          }
        },
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      // Admin request
      const adminRequest = new NextRequest('http://localhost/admin', {
        headers: { 'x-admin': 'true' },
      })

      const adminResponse = await middleware(adminRequest, handler)
      const adminCSP = adminResponse.headers.get('content-security-policy')

      expect(adminCSP).toContain("'unsafe-inline'")
      expect(adminCSP).toContain("'unsafe-eval'")

      // Regular request
      const userRequest = new NextRequest('http://localhost/page')
      const userResponse = await middleware(userRequest, handler)
      const userCSP = userResponse.headers.get('content-security-policy')

      expect(userCSP).not.toContain("'unsafe-inline'")
      expect(userCSP).not.toContain("'unsafe-eval'")
    })
  })

  describe('CSP Directive Validation', () => {
    it('should validate allowed sources', () => {
      const validSources = [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "'none'",
        "'strict-dynamic'",
        'https://example.com',
        'https://*.example.com',
        'data:',
        'blob:',
        "'nonce-abc123'",
        "'sha256-abc123def456'",
      ]

      for (const source of validSources) {
        expect(validateCSPDirective('script-src', source)).toBe(true)
      }
    })

    it('should reject invalid sources', () => {
      const invalidSources = [
        'javascript:',
        'vbscript:',
        'unsafe-inline', // Missing quotes
        'http://insecure.com', // HTTP in production
        '*', // Wildcard without scheme
        "'unknown-keyword'",
      ]

      for (const source of invalidSources) {
        expect(validateCSPDirective('script-src', source)).toBe(false)
      }
    })

    it('should validate directive-specific rules', () => {
      // frame-ancestors doesn't support 'unsafe-inline'
      expect(validateCSPDirective('frame-ancestors', "'unsafe-inline'")).toBe(false)
      expect(validateCSPDirective('frame-ancestors', "'none'")).toBe(true)

      // sandbox has specific values
      expect(validateCSPDirective('sandbox', 'allow-scripts')).toBe(true)
      expect(validateCSPDirective('sandbox', 'invalid-value')).toBe(false)
    })

    it('should validate upgrade-insecure-requests', () => {
      const directives: CSPDirectives = {
        'upgrade-insecure-requests': [],
      }

      const cspHeader = generateCSPHeader(directives)
      expect(cspHeader).toContain('upgrade-insecure-requests')
    })
  })

  describe('CSP Violation Reporting', () => {
    it('should handle CSP violation reports', async () => {
      const violationReport = {
        'csp-report': {
          'document-uri': 'http://localhost/page',
          referrer: '',
          'violated-directive': 'script-src',
          'effective-directive': 'script-src',
          'original-policy': "script-src 'self'",
          disposition: 'enforce',
          'blocked-uri': 'inline',
          'line-number': 10,
          'source-file': 'http://localhost/page',
          'status-code': 200,
        },
      }

      const request = new NextRequest('http://localhost/api/csp-report', {
        method: 'POST',
        headers: {
          'content-type': 'application/csp-report',
        },
        body: JSON.stringify(violationReport),
      })

      const reportSpy = vi.spyOn(console, 'warn').mockImplementation()

      await reportCSPViolation(request)

      expect(reportSpy).toHaveBeenCalledWith(
        expect.stringContaining('CSP Violation'),
        expect.objectContaining({
          directive: 'script-src',
          blockedUri: 'inline',
          sourceFile: 'http://localhost/page',
        })
      )

      reportSpy.mockRestore()
    })

    it('should filter out noise from CSP reports', async () => {
      const noiseReport = {
        'csp-report': {
          'document-uri': 'http://localhost/page',
          'violated-directive': 'script-src',
          'blocked-uri': 'chrome-extension://abc123',
        },
      }

      const request = new NextRequest('http://localhost/api/csp-report', {
        method: 'POST',
        body: JSON.stringify(noiseReport),
      })

      const reportSpy = vi.spyOn(console, 'warn').mockImplementation()

      await reportCSPViolation(request, {
        filterNoise: true,
      })

      // Should not report browser extension violations
      expect(reportSpy).not.toHaveBeenCalled()

      reportSpy.mockRestore()
    })

    it('should aggregate similar violations', async () => {
      const violations = [
        {
          directive: 'script-src',
          blockedUri: 'inline',
          sourceFile: 'http://localhost/page1',
        },
        {
          directive: 'script-src',
          blockedUri: 'inline',
          sourceFile: 'http://localhost/page2',
        },
        {
          directive: 'img-src',
          blockedUri: 'http://external.com/image.jpg',
          sourceFile: 'http://localhost/page1',
        },
      ]

      const aggregator = new CSPViolationAggregator()

      for (const violation of violations) {
        aggregator.add(violation)
      }

      const summary = aggregator.getSummary()

      expect(summary['script-src:inline']).toBe(2)
      expect(summary['img-src:http://external.com']).toBe(1)
    })
  })

  describe('Environment-Specific CSP', () => {
    it('should relax CSP in development', async () => {
      process.env.NODE_ENV = 'development'

      const middleware = cspMiddleware({
        directives: {
          'default-src': ["'self'"],
        },
      })

      const request = new NextRequest('http://localhost:3000/page')
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const response = await middleware(request, handler)
      const cspHeader = response.headers.get('content-security-policy')

      // Development should allow webpack HMR
      expect(cspHeader).toContain('ws://localhost:3000')
      expect(cspHeader).toContain("'unsafe-eval'") // For source maps

      process.env.NODE_ENV = 'test'
    })

    it('should enforce strict CSP in production', async () => {
      process.env.NODE_ENV = 'production'

      const middleware = cspMiddleware({
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
        },
        strict: true,
      })

      const request = new NextRequest('https://example.com/page')
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const response = await middleware(request, handler)
      const cspHeader = response.headers.get('content-security-policy')

      expect(cspHeader).not.toContain("'unsafe-inline'")
      expect(cspHeader).not.toContain("'unsafe-eval'")
      expect(cspHeader).toContain('upgrade-insecure-requests')

      process.env.NODE_ENV = 'test'
    })
  })

  describe('CSP Parser', () => {
    it('should parse CSP header correctly', () => {
      const cspHeader =
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com; img-src 'self' data: https:"

      const parsed = parseCSPHeader(cspHeader)

      expect(parsed['default-src']).toEqual(["'self'"])
      expect(parsed['script-src']).toEqual(["'self'", "'unsafe-inline'", 'https://cdn.example.com'])
      expect(parsed['img-src']).toEqual(["'self'", 'data:', 'https:'])
    })

    it('should handle complex CSP directives', () => {
      const cspHeader =
        "default-src 'self'; script-src 'self' 'nonce-abc123' 'sha256-def456'; style-src 'self' 'unsafe-inline'; report-uri /csp-report"

      const parsed = parseCSPHeader(cspHeader)

      expect(parsed['script-src']).toContain("'nonce-abc123'")
      expect(parsed['script-src']).toContain("'sha256-def456'")
      expect(parsed['report-uri']).toEqual(['/csp-report'])
    })
  })

  describe('CSP Security Best Practices', () => {
    it('should warn about unsafe directives', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation()

      const directives: CSPDirectives = {
        'default-src': ['*'],
        'script-src': ["'unsafe-inline'", "'unsafe-eval'"],
      }

      generateCSPHeader(directives, { warnUnsafe: true })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsafe CSP directive'),
        expect.objectContaining({
          directive: 'default-src',
          issue: 'Wildcard source',
        })
      )

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsafe CSP directive'),
        expect.objectContaining({
          directive: 'script-src',
          issue: 'unsafe-inline',
        })
      )

      warnSpy.mockRestore()
    })

    it('should suggest CSP improvements', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
      }

      const suggestions = analyzeCSPSecurity(directives)

      expect(suggestions).toContainEqual({
        directive: 'script-src',
        current: "'unsafe-inline'",
        suggestion: 'Use nonces or hashes instead',
        severity: 'high',
      })

      expect(suggestions).toContainEqual({
        directive: 'object-src',
        suggestion: "Add object-src 'none' to prevent plugin-based XSS",
        severity: 'medium',
      })
    })
  })
})
