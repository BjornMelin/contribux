/**
 * CORS Configuration Tests
 * Tests Cross-Origin Resource Sharing configuration and middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  CorsConfig,
  CorsPresets,
  CorsManager,
  DynamicCorsConfig,
  CorsSecurityMonitor,
  corsConfig,
  createRouteCorsMiddleware,
} from '@/lib/security/cors-config'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'

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

describe('CorsManager', () => {
  let corsManager: CorsManager

  describe('with wildcard origin', () => {
    beforeEach(() => {
      corsManager = new CorsManager({
        origins: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: false,
      })
    })

    it('should allow any origin', () => {
      expect(corsManager.isOriginAllowed('https://example.com')).toBe(true)
      expect(corsManager.isOriginAllowed('http://localhost:3000')).toBe(true)
      expect(corsManager.isOriginAllowed('https://malicious.com')).toBe(true)
    })

    it('should handle preflight requests', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://client.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      })

      const response = corsManager.handlePreflight(request)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://client.com')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })
  })

  describe('with specific origins', () => {
    beforeEach(() => {
      corsManager = new CorsManager({
        origins: ['https://trusted.com', 'https://partner.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-Request-ID'],
        credentials: true,
        maxAge: 3600,
      })
    })

    it('should only allow configured origins', () => {
      expect(corsManager.isOriginAllowed('https://trusted.com')).toBe(true)
      expect(corsManager.isOriginAllowed('https://partner.com')).toBe(true)
      expect(corsManager.isOriginAllowed('https://untrusted.com')).toBe(false)
      expect(corsManager.isOriginAllowed(null)).toBe(false)
    })

    it('should reject preflight from disallowed origin', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://untrusted.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = corsManager.handlePreflight(request)

      expect(response.status).toBe(403)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('should reject preflight with disallowed method', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://trusted.com',
          'Access-Control-Request-Method': 'PATCH',
        },
      })

      const response = corsManager.handlePreflight(request)

      expect(response.status).toBe(405)
    })

    it('should include credentials header when enabled', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://trusted.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = corsManager.handlePreflight(request)

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })

    it('should include max age header', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://trusted.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = corsManager.handlePreflight(request)

      expect(response.headers.get('Access-Control-Max-Age')).toBe('3600')
    })
  })

  describe('with function-based origin validation', () => {
    beforeEach(() => {
      corsManager = new CorsManager({
        origins: (origin) => origin.endsWith('.trusted.com'),
        methods: ['GET', 'POST'],
        allowedHeaders: '*',
        credentials: false,
      })
    })

    it('should validate origins using function', () => {
      expect(corsManager.isOriginAllowed('https://api.trusted.com')).toBe(true)
      expect(corsManager.isOriginAllowed('https://www.trusted.com')).toBe(true)
      expect(corsManager.isOriginAllowed('https://untrusted.com')).toBe(false)
    })

    it('should handle wildcard allowed headers', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://api.trusted.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'X-Custom-Header, Authorization',
        },
      })

      const response = corsManager.handlePreflight(request)

      expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
        'X-Custom-Header, Authorization'
      )
    })
  })

  describe('applyCorsHeaders', () => {
    beforeEach(() => {
      corsManager = new CorsManager({
        origins: ['https://trusted.com'],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        exposedHeaders: ['X-Request-ID', 'X-Rate-Limit'],
        credentials: true,
      })
    })

    it('should apply CORS headers to response', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        headers: {
          'Origin': 'https://trusted.com',
        },
      })

      const response = new NextResponse('Hello')
      const updatedResponse = corsManager.applyCorsHeaders(request, response)

      expect(updatedResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://trusted.com')
      expect(updatedResponse.headers.get('Access-Control-Expose-Headers')).toBe('X-Request-ID, X-Rate-Limit')
      expect(updatedResponse.headers.get('Access-Control-Allow-Credentials')).toBe('true')
      expect(updatedResponse.headers.get('Vary')).toContain('Origin')
    })

    it('should not apply headers for disallowed origin', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        headers: {
          'Origin': 'https://untrusted.com',
        },
      })

      const response = new NextResponse('Hello')
      const updatedResponse = corsManager.applyCorsHeaders(request, response)

      expect(updatedResponse.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })
  })

  describe('validation', () => {
    it('should detect invalid configurations', () => {
      const invalidConfig: CorsConfig = {
        origins: '*',
        methods: ['GET'],
        allowedHeaders: ['Content-Type'],
        credentials: true, // Invalid with wildcard origin
      }

      const result = CorsManager.validateConfig(invalidConfig)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Cannot use wildcard origin with credentials')
    })

    it('should provide warnings for insecure configurations', () => {
      const insecureConfig: CorsConfig = {
        origins: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: '*',
        credentials: false,
      }

      const result = CorsManager.validateConfig(insecureConfig)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Using wildcard origin is not recommended for production')
      expect(result.warnings).toContain('Using wildcard for allowed headers may expose sensitive headers')
    })

    it('should recommend maxAge setting', () => {
      const config: CorsConfig = {
        origins: ['https://trusted.com'],
        methods: ['GET'],
        allowedHeaders: ['Content-Type'],
        credentials: false,
        maxAge: 90000, // More than 24 hours
      }

      const result = CorsManager.validateConfig(config)

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Consider setting maxAge to reduce preflight requests')
    })
  })
})

describe('DynamicCorsConfig', () => {
  let dynamicConfig: DynamicCorsConfig

  beforeEach(() => {
    dynamicConfig = new DynamicCorsConfig()
  })

  it('should have default configurations', () => {
    expect(dynamicConfig.getConfig('public')).toEqual(CorsPresets.publicApi)
    expect(dynamicConfig.getConfig('private')).toEqual(CorsPresets.sameOrigin)
    expect(dynamicConfig.getConfig('partner')).toEqual(CorsPresets.trustedPartners)
    expect(dynamicConfig.getConfig('development')).toEqual(CorsPresets.development)
  })

  it('should allow adding custom configurations', () => {
    const customConfig: CorsConfig = {
      origins: ['https://custom.com'],
      methods: ['GET'],
      allowedHeaders: ['Content-Type'],
      credentials: false,
    }

    dynamicConfig.setConfig('custom', customConfig)

    expect(dynamicConfig.getConfig('custom')).toEqual(customConfig)
  })

  describe('createDynamicMiddleware', () => {
    it('should handle route-based configuration', async () => {
      const middleware = dynamicConfig.createDynamicMiddleware((request) => {
        const path = new URL(request.url).pathname
        if (path.startsWith('/api/public/')) return 'public'
        if (path.startsWith('/api/private/')) return 'private'
        return null
      })

      // Test public route
      const publicRequest = new NextRequest('https://api.example.com/api/public/data', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://anywhere.com',
          'Access-Control-Request-Method': 'GET',
        },
      })

      const publicResponse = await middleware(publicRequest)
      expect(publicResponse).not.toBeNull()
      expect(publicResponse?.status).toBe(204)
      expect(publicResponse?.headers.get('Access-Control-Allow-Origin')).toBe('https://anywhere.com')

      // Test private route
      const privateRequest = new NextRequest('https://api.example.com/api/private/data', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://anywhere.com',
          'Access-Control-Request-Method': 'GET',
        },
      })

      const privateResponse = await middleware(privateRequest)
      expect(privateResponse).not.toBeNull()
      expect(privateResponse?.status).toBe(403) // Same origin only

      // Test unhandled route
      const unhandledRequest = new NextRequest('https://api.example.com/other', {
        method: 'OPTIONS',
      })

      const unhandledResponse = await middleware(unhandledRequest)
      expect(unhandledResponse).toBeNull()
    })

    it('should handle direct configuration objects', async () => {
      const middleware = dynamicConfig.createDynamicMiddleware(() => ({
        origins: ['https://direct.com'],
        methods: ['GET'],
        allowedHeaders: ['Content-Type'],
        credentials: false,
      }))

      const request = new NextRequest('https://api.example.com/resource', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://direct.com',
          'Access-Control-Request-Method': 'GET',
        },
      })

      const response = await middleware(request)
      expect(response).not.toBeNull()
      expect(response?.status).toBe(204)
    })

    it('should pass through non-OPTIONS requests', async () => {
      const middleware = dynamicConfig.createDynamicMiddleware(() => 'public')

      const request = new NextRequest('https://api.example.com/resource', {
        method: 'GET',
      })

      const response = await middleware(request)
      expect(response).toBeNull()
    })
  })
})

describe('CorsSecurityMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('logViolation', () => {
    it('should log CORS violations', async () => {
      const request = new NextRequest('https://api.example.com/resource', {
        headers: {
          'Origin': 'https://malicious.com',
          'Referer': 'https://malicious.com/attack',
          'User-Agent': 'Mozilla/5.0',
          'X-Forwarded-For': '10.0.0.1',
        },
      })

      await CorsSecurityMonitor.logViolation(request, 'Origin not allowed')

      expect(auditLogger.log).toHaveBeenCalledWith({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.WARNING,
        actor: {
          type: 'system',
          ip: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
        action: 'CORS violation attempt',
        result: 'failure',
        reason: 'Origin not allowed',
        metadata: {
          origin: 'https://malicious.com',
          referer: 'https://malicious.com/attack',
          method: 'GET',
          path: '/resource',
        },
      })
    })
  })

  describe('checkSuspiciousPatterns', () => {
    it('should detect origin/referer mismatch', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        headers: {
          'Origin': 'https://attacker.com',
          'Referer': 'https://legitimate.com/page',
        },
      })

      const result = CorsSecurityMonitor.checkSuspiciousPatterns(request)

      expect(result.suspicious).toBe(true)
      expect(result.reasons).toContain('Origin/Referer mismatch')
    })

    it('should detect null origin', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        headers: {
          'Origin': 'null',
        },
      })

      const result = CorsSecurityMonitor.checkSuspiciousPatterns(request)

      expect(result.suspicious).toBe(true)
      expect(result.reasons).toContain('Null origin detected')
    })

    it('should detect file protocol origin', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        headers: {
          'Origin': 'file:///C:/Users/test.html',
        },
      })

      const result = CorsSecurityMonitor.checkSuspiciousPatterns(request)

      expect(result.suspicious).toBe(true)
      expect(result.reasons).toContain('File protocol origin')
    })

    it('should detect missing origin on state-changing request', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'POST',
      })

      const result = CorsSecurityMonitor.checkSuspiciousPatterns(request)

      expect(result.suspicious).toBe(true)
      expect(result.reasons).toContain('Missing origin on state-changing request')
    })

    it('should not flag legitimate requests', () => {
      const request = new NextRequest('https://api.example.com/resource', {
        method: 'GET',
        headers: {
          'Origin': 'https://legitimate.com',
          'Referer': 'https://legitimate.com/page',
        },
      })

      const result = CorsSecurityMonitor.checkSuspiciousPatterns(request)

      expect(result.suspicious).toBe(false)
      expect(result.reasons).toHaveLength(0)
    })
  })
})

describe('createRouteCorsMiddleware', () => {
  it('should handle different routes appropriately', async () => {
    const middleware = createRouteCorsMiddleware()

    // Test public API route
    const publicRequest = new NextRequest('https://api.example.com/api/public/users', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://anywhere.com',
        'Access-Control-Request-Method': 'GET',
      },
    })

    const publicResponse = await middleware(publicRequest)
    expect(publicResponse).not.toBeNull()
    expect(publicResponse?.headers.get('Access-Control-Allow-Origin')).toBe('https://anywhere.com')

    // Test partner API route
    const partnerRequest = new NextRequest('https://api.example.com/api/partner/data', {
      method: 'OPTIONS',
      headers: {
        'Origin': process.env.CORS_ALLOWED_ORIGINS?.split(',')[0] || 'https://partner.com',
        'Access-Control-Request-Method': 'POST',
      },
    })

    const partnerResponse = await middleware(partnerRequest)
    expect(partnerResponse).not.toBeNull()

    // Test webhook route (no CORS)
    const webhookRequest = new NextRequest('https://api.example.com/api/webhooks/github', {
      method: 'OPTIONS',
    })

    const webhookResponse = await middleware(webhookRequest)
    expect(webhookResponse).toBeNull()
  })
})