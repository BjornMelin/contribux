/**
 * Tests for Integrated Security Middleware
 *
 * Covers the main security orchestration middleware including:
 * - integratedSecurityMiddleware function
 * - Security check integrations
 * - Configuration presets
 * - Error handling and monitoring
 */

import {
  getSecurityPreset,
  integratedSecurityMiddleware,
  securityMiddleware,
  securityPresets,
} from '@/lib/security/integrated-security-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { type MockedFunction, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all security dependencies
vi.mock('@/lib/security/api-key-rotation', () => ({
  ApiKeyManager: vi.fn().mockImplementation(() => ({
    validateKey: vi.fn().mockResolvedValue({ valid: true }),
  })),
}))

vi.mock('@/lib/security/audit-logger', () => ({
  AuditEventType: {
    SYSTEM_ERROR: 'system_error',
    API_ACCESS: 'api_access',
    SECURITY_VIOLATION: 'security_violation',
  },
  AuditSeverity: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
  },
  auditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/security/cors-config', () => ({
  CorsManager: vi.fn().mockImplementation(() => ({
    handlePreflight: vi.fn().mockReturnValue(new NextResponse(null, { status: 204 })),
    applyCorsHeaders: vi.fn().mockImplementation((_req, res) => res),
  })),
  CorsSecurityMonitor: {
    checkSuspiciousPatterns: vi.fn().mockReturnValue({ suspicious: false, reasons: [] }),
    logViolation: vi.fn().mockResolvedValue(undefined),
  },
  DynamicCorsConfig: vi.fn().mockImplementation(() => ({
    getConfig: vi.fn().mockReturnValue({
      origins: ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
      credentials: true,
    }),
  })),
}))

vi.mock('@/lib/security/error-boundaries', () => ({
  SecurityError: class MockSecurityError extends Error {
    constructor(
      public type: string,
      message: string,
      public statusCode = 500
    ) {
      super(message)
      this.name = 'SecurityError'
    }
  },
  SecurityErrorType: {
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    VALIDATION: 'validation',
    RATE_LIMIT: 'rate_limit',
    INTERNAL: 'internal',
  },
  withSecurityBoundary: vi.fn().mockImplementation(async operation => {
    return await operation()
  }),
}))

vi.mock('@/lib/security/input-validation', () => ({
  InputValidator: vi.fn().mockImplementation(() => ({
    validate: vi.fn().mockResolvedValue({ success: true, data: {} }),
  })),
}))

vi.mock('@/lib/security/ip-allowlist', () => ({
  IPAllowlistManager: vi.fn().mockImplementation(() => ({
    isAllowed: vi.fn().mockResolvedValue(true),
  })),
}))

vi.mock('@/lib/security/monitoring-dashboard', () => ({
  SecurityMonitoringDashboard: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/lib/security/rate-limiting', () => ({
  getRateLimiter: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

vi.mock('@/lib/security/request-signing', () => ({
  RequestSigner: vi.fn().mockImplementation(() => ({
    verifyRequest: vi.fn().mockReturnValue({ valid: true }),
  })),
}))

vi.mock('@/lib/security/security-headers', () => ({
  SecurityHeadersManager: vi.fn().mockImplementation(() => ({
    applyHeaders: vi.fn().mockImplementation((_req, res) => res),
  })),
  securityHeadersMiddleware: vi.fn(),
}))

describe('Integrated Security Middleware', () => {
  const createMockRequest = (
    url = 'https://example.com/api/test',
    method = 'GET',
    headers: Record<string, string> = {}
  ) => {
    const request = new NextRequest(url, { method })
    Object.entries(headers).forEach(([key, value]) => {
      request.headers.set(key, value)
    })
    return request
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('test-request-id'),
    })
  })

  describe('integratedSecurityMiddleware', () => {
    it('should process request with all security checks enabled', async () => {
      const request = createMockRequest('https://example.com/api/test', 'GET', {
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'test-agent',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableRateLimiting: true,
        enableRequestSigning: false, // Disable to avoid signature validation
        enableIpAllowlist: true,
        enableInputValidation: true,
        enableSecurityHeaders: true,
        enableCors: true,
        enableApiKeyValidation: false, // Not an API route
        enableMonitoring: true,
        enableAuditLogging: true,
      })

      expect(response).toBeInstanceOf(NextResponse)
    })

    it('should handle IP allowlist blocking', async () => {
      const { IPAllowlistManager } = await import('@/lib/security/ip-allowlist')
      const mockIPManager = IPAllowlistManager as vi.MockedClass<typeof IPAllowlistManager>
      mockIPManager.mockImplementation(() => ({
        isAllowed: vi.fn().mockResolvedValue(false),
      }))

      const request = createMockRequest('https://example.com/api/test', 'GET', {
        'x-forwarded-for': '192.168.1.1',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableIpAllowlist: true,
        strictMode: true,
        developmentMode: false,
      })

      expect(response.status).toBe(403)
    })

    it('should handle rate limiting', async () => {
      const { getRateLimiter } = await import('@/lib/security/rate-limiting')
      const mockRateLimiter = getRateLimiter as vi.MockedFunction<typeof getRateLimiter>
      mockRateLimiter.mockReturnValue({
        limit: vi.fn().mockResolvedValue({ success: false }),
      })

      const request = createMockRequest('https://example.com/api/test', 'GET', {
        'x-forwarded-for': '192.168.1.1',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableRateLimiting: true,
      })

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
    })

    it('should validate request signatures for API routes', async () => {
      const { RequestSigner } = await import('@/lib/security/request-signing')
      const mockSigner = RequestSigner as vi.MockedClass<typeof RequestSigner>
      mockSigner.mockImplementation(() => ({
        verifyRequest: vi.fn().mockReturnValue({ valid: false }),
      }))

      const request = createMockRequest('https://example.com/api/test', 'POST', {
        'x-signature': 'invalid-signature',
        'x-timestamp': '1234567890',
        'content-type': 'application/json',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableRequestSigning: true,
        strictMode: true,
      })

      expect(response.status).toBe(401)
    })

    it('should validate API keys for protected routes', async () => {
      const { ApiKeyManager } = await import('@/lib/security/api-key-rotation')
      const mockKeyManager = ApiKeyManager as vi.MockedClass<typeof ApiKeyManager>
      mockKeyManager.mockImplementation(() => ({
        validateKey: vi.fn().mockResolvedValue({ valid: false, reason: 'Invalid key' }),
      }))

      const request = createMockRequest('https://example.com/api/protected/test', 'GET', {
        'x-api-key': 'invalid-key',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableApiKeyValidation: true,
      })

      expect(response.status).toBe(401)
    })

    it('should validate input for POST requests', async () => {
      const { InputValidator } = await import('@/lib/security/input-validation')
      const mockValidator = InputValidator as vi.MockedClass<typeof InputValidator>
      mockValidator.mockImplementation(() => ({
        validate: vi.fn().mockResolvedValue({
          success: false,
          errors: { errors: [{ message: 'Invalid input' }] },
        }),
      }))

      const request = createMockRequest('https://example.com/api/test', 'POST', {
        'content-type': 'application/json',
      })

      // Mock request.clone().json()
      request.clone = vi.fn().mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: 'test' }),
      })

      const response = await integratedSecurityMiddleware(request, {
        enableInputValidation: true,
        strictMode: true,
      })

      expect(response.status).toBe(400)
    })

    it('should handle CORS preflight requests', async () => {
      const request = createMockRequest('https://example.com/api/public/test', 'OPTIONS', {
        origin: 'https://trusted-domain.com',
        'access-control-request-method': 'POST',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableCors: true,
      })

      expect(response.status).toBe(204)
    })

    it('should detect suspicious CORS patterns', async () => {
      const { CorsSecurityMonitor } = await import('@/lib/security/cors-config')
      const mockMonitor = CorsSecurityMonitor as vi.Mocked<typeof CorsSecurityMonitor>
      mockMonitor.checkSuspiciousPatterns.mockReturnValue({
        suspicious: true,
        reasons: ['Origin/Referer mismatch'],
      })

      const request = createMockRequest('https://example.com/api/test', 'GET', {
        origin: 'https://suspicious-domain.com',
        referer: 'https://different-domain.com',
      })

      await integratedSecurityMiddleware(request, {
        enableCors: true,
      })

      expect(mockMonitor.logViolation).toHaveBeenCalledWith(request, 'Origin/Referer mismatch')
    })

    it('should apply security headers', async () => {
      const { SecurityHeadersManager } = await import('@/lib/security/security-headers')
      const mockHeadersManager = SecurityHeadersManager as vi.MockedClass<
        typeof SecurityHeadersManager
      >
      const mockApplyHeaders = vi.fn().mockImplementation((_req, res) => res)
      mockHeadersManager.mockImplementation(() => ({
        applyHeaders: mockApplyHeaders,
      }))

      const request = createMockRequest()

      await integratedSecurityMiddleware(request, {
        enableSecurityHeaders: true,
      })

      expect(mockApplyHeaders).toHaveBeenCalled()
    })

    it('should log successful requests', async () => {
      const request = createMockRequest('https://example.com/api/test', 'GET', {
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'test-agent',
      })

      await integratedSecurityMiddleware(request, {
        enableAuditLogging: true,
      })

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'api_access',
          severity: 'info',
          action: 'GET /api/test',
          result: 'success',
        })
      )
    })

    it('should handle middleware errors gracefully', async () => {
      const { withSecurityBoundary } = await import('@/lib/security/error-boundaries')
      const mockWithBoundary = withSecurityBoundary as MockedFunction<typeof withSecurityBoundary>
      mockWithBoundary.mockRejectedValue(new Error('Security check failed'))

      const request = createMockRequest()

      const response = await integratedSecurityMiddleware(request, {
        enableRateLimiting: true,
      })

      expect(response.status).toBe(500)
    })

    it('should return detailed error in development mode', async () => {
      const { withSecurityBoundary } = await import('@/lib/security/error-boundaries')
      const mockWithBoundary = withSecurityBoundary as MockedFunction<typeof withSecurityBoundary>
      mockWithBoundary.mockRejectedValue(new Error('Security check failed'))

      const request = createMockRequest()

      const response = await integratedSecurityMiddleware(request, {
        enableRateLimiting: true,
        developmentMode: true,
      })

      expect(response.status).toBe(500)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('should skip checks in development mode', async () => {
      const request = createMockRequest()

      const response = await integratedSecurityMiddleware(request, {
        enableIpAllowlist: true,
        developmentMode: true,
      })

      expect(response).toBeInstanceOf(NextResponse)
      // IP allowlist should be skipped in development mode
    })

    it('should handle missing request signature headers', async () => {
      const request = createMockRequest('https://example.com/api/test', 'POST')

      const response = await integratedSecurityMiddleware(request, {
        enableRequestSigning: true,
        strictMode: true,
      })

      expect(response.status).toBe(401)
    })

    it('should handle missing API key', async () => {
      const request = createMockRequest('https://example.com/api/protected/test', 'GET')

      const response = await integratedSecurityMiddleware(request, {
        enableApiKeyValidation: true,
      })

      expect(response.status).toBe(401)
    })

    it('should extract client information correctly', async () => {
      const request = createMockRequest('https://example.com/api/test', 'GET', {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        'x-real-ip': '192.168.1.2',
        'user-agent': 'Mozilla/5.0 Test',
        'x-request-id': 'existing-request-id',
      })

      await integratedSecurityMiddleware(request, {
        enableAuditLogging: true,
      })

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            ip: '192.168.1.1',
            userAgent: 'Mozilla/5.0 Test',
            requestId: 'existing-request-id',
          }),
        })
      )
    })

    it('should handle non-JSON content types', async () => {
      const request = createMockRequest('https://example.com/api/test', 'POST', {
        'content-type': 'text/plain',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableInputValidation: true,
      })

      // Should pass validation for non-JSON content
      expect(response).toBeInstanceOf(NextResponse)
    })
  })

  describe('security presets', () => {
    it('should have correct production preset', () => {
      const preset = securityPresets.production

      expect(preset.enableRateLimiting).toBe(true)
      expect(preset.enableRequestSigning).toBe(true)
      expect(preset.enableIpAllowlist).toBe(true)
      expect(preset.enableInputValidation).toBe(true)
      expect(preset.enableSecurityHeaders).toBe(true)
      expect(preset.enableCors).toBe(true)
      expect(preset.enableApiKeyValidation).toBe(true)
      expect(preset.enableMonitoring).toBe(true)
      expect(preset.enableAuditLogging).toBe(true)
      expect(preset.strictMode).toBe(true)
      expect(preset.developmentMode).toBe(false)
    })

    it('should have correct staging preset', () => {
      const preset = securityPresets.staging

      expect(preset.enableRateLimiting).toBe(true)
      expect(preset.enableIpAllowlist).toBe(false) // Different from production
      expect(preset.strictMode).toBe(false) // Different from production
    })

    it('should have correct development preset', () => {
      const preset = securityPresets.development

      expect(preset.enableRequestSigning).toBe(false)
      expect(preset.enableIpAllowlist).toBe(false)
      expect(preset.enableApiKeyValidation).toBe(false)
      expect(preset.strictMode).toBe(false)
      expect(preset.developmentMode).toBe(true)
    })

    it('should have correct test preset', () => {
      const preset = securityPresets.test

      expect(preset.enableRateLimiting).toBe(false)
      expect(preset.enableRequestSigning).toBe(false)
      expect(preset.enableIpAllowlist).toBe(false)
      expect(preset.enableInputValidation).toBe(false)
      expect(preset.enableSecurityHeaders).toBe(false)
      expect(preset.enableCors).toBe(false)
      expect(preset.enableApiKeyValidation).toBe(false)
      expect(preset.enableMonitoring).toBe(false)
      expect(preset.enableAuditLogging).toBe(false)
    })
  })

  describe('getSecurityPreset', () => {
    const originalEnv = process.env.NODE_ENV

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    it('should return production preset for production environment', () => {
      process.env.NODE_ENV = 'production'

      const preset = getSecurityPreset()

      expect(preset).toEqual(securityPresets.production)
    })

    it('should return staging preset for staging environment', () => {
      process.env.NODE_ENV = 'staging'

      const preset = getSecurityPreset()

      expect(preset).toEqual(securityPresets.staging)
    })

    it('should return test preset for test environment', () => {
      process.env.NODE_ENV = 'test'

      const preset = getSecurityPreset()

      expect(preset).toEqual(securityPresets.test)
    })

    it('should return development preset for unknown environment', () => {
      process.env.NODE_ENV = 'unknown'

      const preset = getSecurityPreset()

      expect(preset).toEqual(securityPresets.development)
    })

    it('should return development preset when NODE_ENV is undefined', () => {
      process.env.NODE_ENV = undefined

      const preset = getSecurityPreset()

      expect(preset).toEqual(securityPresets.development)
    })
  })

  describe('securityMiddleware', () => {
    it('should use environment-based preset', async () => {
      const request = createMockRequest()

      const response = await securityMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
    })
  })

  describe('route-specific CORS configuration', () => {
    it('should use public config for public API routes', async () => {
      const request = createMockRequest('https://example.com/api/public/test', 'GET')

      await integratedSecurityMiddleware(request, {
        enableCors: true,
      })

      const { DynamicCorsConfig } = await import('@/lib/security/cors-config')
      const mockConfig = DynamicCorsConfig as vi.MockedClass<typeof DynamicCorsConfig>
      expect(mockConfig.mock.instances[0].getConfig).toHaveBeenCalledWith('public')
    })

    it('should use private config for private API routes', async () => {
      const request = createMockRequest('https://example.com/api/private/test', 'GET')

      await integratedSecurityMiddleware(request, {
        enableCors: true,
      })

      const { DynamicCorsConfig } = await import('@/lib/security/cors-config')
      const mockConfig = DynamicCorsConfig as vi.MockedClass<typeof DynamicCorsConfig>
      expect(mockConfig.mock.instances[0].getConfig).toHaveBeenCalledWith('private')
    })

    it('should use partner config for partner API routes', async () => {
      const request = createMockRequest('https://example.com/api/partner/test', 'GET')

      await integratedSecurityMiddleware(request, {
        enableCors: true,
      })

      const { DynamicCorsConfig } = await import('@/lib/security/cors-config')
      const mockConfig = DynamicCorsConfig as vi.MockedClass<typeof DynamicCorsConfig>
      expect(mockConfig.mock.instances[0].getConfig).toHaveBeenCalledWith('partner')
    })

    it('should use development config in development mode', async () => {
      const request = createMockRequest('https://example.com/api/test', 'GET')

      await integratedSecurityMiddleware(request, {
        enableCors: true,
        developmentMode: true,
      })

      const { DynamicCorsConfig } = await import('@/lib/security/cors-config')
      const mockConfig = DynamicCorsConfig as vi.MockedClass<typeof DynamicCorsConfig>
      expect(mockConfig.mock.instances[0].getConfig).toHaveBeenCalledWith('development')
    })
  })

  describe('error scenarios', () => {
    it('should handle API key validation errors', async () => {
      const { ApiKeyManager } = await import('@/lib/security/api-key-rotation')
      const mockKeyManager = ApiKeyManager as vi.MockedClass<typeof ApiKeyManager>
      mockKeyManager.mockImplementation(() => ({
        validateKey: vi.fn().mockRejectedValue(new Error('Validation service down')),
      }))

      const request = createMockRequest('https://example.com/api/protected/test', 'GET', {
        'x-api-key': 'test-key',
      })

      const response = await integratedSecurityMiddleware(request, {
        enableApiKeyValidation: true,
      })

      expect(response.status).toBe(500)
    })

    it('should handle input validation service errors', async () => {
      const { InputValidator } = await import('@/lib/security/input-validation')
      const mockValidator = InputValidator as vi.MockedClass<typeof InputValidator>
      mockValidator.mockImplementation(() => ({
        validate: vi.fn().mockRejectedValue(new Error('Validation service error')),
      }))

      const request = createMockRequest('https://example.com/api/test', 'POST', {
        'content-type': 'application/json',
      })

      request.clone = vi.fn().mockReturnValue({
        json: vi.fn().mockResolvedValue({ data: 'test' }),
      })

      const response = await integratedSecurityMiddleware(request, {
        enableInputValidation: true,
      })

      expect(response.status).toBe(500)
    })

    it('should handle malformed JSON in request body', async () => {
      const request = createMockRequest('https://example.com/api/test', 'POST', {
        'content-type': 'application/json',
      })

      request.clone = vi.fn().mockReturnValue({
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      })

      const response = await integratedSecurityMiddleware(request, {
        enableInputValidation: true,
      })

      expect(response.status).toBe(500)
    })
  })

  describe('performance and monitoring', () => {
    it('should track processing time in audit logs', async () => {
      const request = createMockRequest()

      await integratedSecurityMiddleware(request, {
        enableAuditLogging: true,
      })

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            processingTime: expect.any(Number),
          }),
        })
      )
    })

    it('should include security check results in audit logs', async () => {
      const request = createMockRequest()

      await integratedSecurityMiddleware(request, {
        enableRateLimiting: true,
        enableAuditLogging: true,
      })

      const { auditLogger } = await import('@/lib/security/audit-logger')
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            securityChecks: expect.any(Object),
          }),
        })
      )
    })
  })
})
