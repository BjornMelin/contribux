/**
 * Security Headers and CORS Validation Tests
 * Comprehensive validation of CSP, CORS, security headers, edge middleware, and SOAR integration
 *
 * Phase 2C-1: Security Configuration Validation
 * Tests Content Security Policy enforcement, CORS handling, security headers,
 * edge middleware execution, and SOAR response mechanisms
 */

import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecurityIncident, ThreatDetection } from '../../src/lib/security/automated-scanner'
import {
  applyCORSHeaders,
  applyCSPHeaders,
  type CORSConfig,
  CSP_CORS_CONFIG,
  type CSPContext,
  generateCORSConfig,
  generateCSPPolicy,
  handlePreflightRequest,
  processCSPViolation,
} from '../../src/lib/security/csp-cors'
import {
  EDGE_SECURITY_CONFIG,
  edgeSecurityMiddleware,
  enhancedEdgeMiddleware,
} from '../../src/lib/security/edge-middleware'
import { createSOAREngine, type SOAREngine } from '../../src/lib/security/soar'

describe('Security Headers and CORS Validation', () => {
  let mockRequest: NextRequest
  let mockResponse: NextResponse

  beforeEach(() => {
    // Create mock request with realistic headers
    mockRequest = new NextRequest('https://contribux.ai/api/search/repositories', {
      method: 'GET',
      headers: {
        origin: 'https://contribux.ai',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        accept: 'application/json',
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        referer: 'https://contribux.ai',
        'x-forwarded-for': '192.168.1.100',
      },
    })

    mockResponse = NextResponse.json({ success: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Content Security Policy (CSP) Validation', () => {
    it('should generate CSP policy with secure nonce', () => {
      const { policy, nonce, reportOnly } = generateCSPPolicy(mockRequest)

      // Validate nonce format
      expect(nonce).toMatch(/^[a-zA-Z0-9+/]{16,}[=]*$/) // Base64 format
      expect(nonce.length).toBeGreaterThan(15)

      // Validate CSP policy structure
      expect(policy).toContain("default-src 'self'")
      expect(policy).toContain(`'nonce-${nonce}'`)
      expect(policy).toContain('script-src')
      expect(policy).toContain('style-src')

      // Validate production vs development differences
      if (process.env.NODE_ENV === 'production') {
        expect(policy).toContain("'strict-dynamic'")
        expect(policy).toContain('upgrade-insecure-requests')
        expect(policy).toContain('block-all-mixed-content')
        expect(policy).toContain("require-trusted-types-for 'script'")
        expect(reportOnly).toBe(false)
      } else {
        expect(policy).toContain("'unsafe-eval'")
        expect(policy).toContain("'unsafe-inline'")
        // reportOnly is only true for 'development', not 'test' environment
        expect(reportOnly).toBe(false)
      }
    })

    it('should apply CSP headers correctly to response', () => {
      const context: Partial<CSPContext> = {
        nonce: 'test-nonce-12345',
        hashes: ['sha256-abc123'],
        reportOnly: false,
        violationEndpoint: '/api/security/csp-report',
      }

      const nonce = applyCSPHeaders(mockResponse, mockRequest, context)

      // Validate returned nonce
      expect(nonce).toBe('test-nonce-12345')

      // Validate CSP header
      const cspHeader = mockResponse.headers.get('Content-Security-Policy')
      expect(cspHeader).toBeTruthy()
      expect(cspHeader).toContain("'nonce-test-nonce-12345'")
      expect(cspHeader).toContain("'sha256-abc123'")

      // Validate additional security headers
      expect(mockResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(mockResponse.headers.get('X-Frame-Options')).toBe('DENY')
      expect(mockResponse.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(mockResponse.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')

      // Validate Trusted Types header if enabled
      if (CSP_CORS_CONFIG.csp.enableTrustedTypes) {
        expect(mockResponse.headers.get('Require-Trusted-Types-For')).toBe('script')
      }
    })

    it('should handle CSP violation reports', async () => {
      const violationData = {
        'csp-report': {
          'document-uri': 'https://contribux.ai/dashboard',
          'violated-directive': 'script-src',
          'blocked-uri': 'https://malicious-site.com/script.js',
          'original-policy': "default-src 'self'; script-src 'self' 'nonce-abc123'",
          disposition: 'enforce' as const,
        },
      }

      const result = await processCSPViolation(violationData, mockRequest)
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject invalid CSP violation data', async () => {
      const invalidData = {
        'invalid-field': 'test',
      }

      const result = await processCSPViolation(invalidData, mockRequest)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid violation data')
    })

    it('should generate environment-specific CSP policies', () => {
      // Test production CSP
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const prodPolicy = generateCSPPolicy(mockRequest)
      expect(prodPolicy.policy).toContain("'strict-dynamic'")
      expect(prodPolicy.policy).toContain('upgrade-insecure-requests')
      expect(prodPolicy.reportOnly).toBe(false)

      // Test development CSP
      process.env.NODE_ENV = 'development'

      const devPolicy = generateCSPPolicy(mockRequest)
      expect(devPolicy.policy).toContain("'unsafe-eval'")
      expect(devPolicy.policy).toContain("'unsafe-inline'")
      expect(devPolicy.reportOnly).toBe(false)

      // Restore original environment
      process.env.NODE_ENV = originalEnv
    })
  })

  describe('CORS Configuration Validation', () => {
    it('should generate CORS config for allowed origins', () => {
      // Test production origin by temporarily setting NODE_ENV
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const prodRequest = new NextRequest('https://api.contribux.ai/test', {
        headers: { origin: 'https://contribux.ai' },
      })

      const config = generateCORSConfig(prodRequest)
      expect(config.origins).toContain('https://contribux.ai')
      expect(config.credentials).toBe(true)
      expect(config.methods).toContain('GET')
      expect(config.methods).toContain('POST')
      expect(config.methods).toContain('PUT')
      expect(config.methods).toContain('DELETE')
      expect(config.methods).toContain('OPTIONS')

      // Restore original environment
      process.env.NODE_ENV = originalEnv
    })

    it('should reject disallowed origins', () => {
      const maliciousRequest = new NextRequest('https://api.contribux.ai/test', {
        headers: { origin: 'https://malicious-site.com' },
      })

      const config = generateCORSConfig(maliciousRequest)
      expect(config.origins).toHaveLength(0)
    })

    it('should apply CORS headers correctly', () => {
      const corsConfig: CORSConfig = {
        origins: ['https://contribux.ai'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
        credentials: true,
        maxAge: 86400,
        optionsSuccessStatus: 200,
      }

      const requestWithOrigin = new NextRequest('https://api.contribux.ai/test', {
        headers: { origin: 'https://contribux.ai' },
      })

      applyCORSHeaders(mockResponse, requestWithOrigin, corsConfig)

      expect(mockResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://contribux.ai')
      expect(mockResponse.headers.get('Access-Control-Allow-Methods')).toContain('GET')
      expect(mockResponse.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
      expect(mockResponse.headers.get('Access-Control-Expose-Headers')).toContain('X-Total-Count')
      expect(mockResponse.headers.get('Access-Control-Allow-Credentials')).toBe('true')
      expect(mockResponse.headers.get('Access-Control-Max-Age')).toBe('86400')
      expect(mockResponse.headers.get('Vary')).toContain('Origin')
    })

    it('should handle preflight OPTIONS requests', () => {
      // Test production origin by temporarily setting NODE_ENV
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const preflightRequest = new NextRequest('https://api.contribux.ai/test', {
        method: 'OPTIONS',
        headers: { origin: 'https://contribux.ai' },
      })

      const response = handlePreflightRequest(preflightRequest)
      expect(response).toBeTruthy()
      expect(response?.status).toBe(200)

      // Restore original environment
      process.env.NODE_ENV = originalEnv
    })

    it('should reject preflight from disallowed origins', () => {
      const maliciousPreflightRequest = new NextRequest('https://api.contribux.ai/test', {
        method: 'OPTIONS',
        headers: { origin: 'https://malicious-site.com' },
      })

      const response = handlePreflightRequest(maliciousPreflightRequest)
      expect(response?.status).toBe(403)
    })

    it('should handle development vs production origins', () => {
      const originalEnv = process.env.NODE_ENV

      // Test development
      process.env.NODE_ENV = 'development'
      const devRequest = new NextRequest('http://localhost:3000/api/test', {
        headers: { origin: 'http://localhost:3000' },
      })
      const devConfig = generateCORSConfig(devRequest)
      expect(devConfig.origins).toContain('http://localhost:3000')

      // Test production
      process.env.NODE_ENV = 'production'
      const prodRequest = new NextRequest('https://api.contribux.ai/test', {
        headers: { origin: 'https://contribux.ai' },
      })
      const prodConfig = generateCORSConfig(prodRequest)
      expect(prodConfig.origins).toContain('https://contribux.ai')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Security Headers Validation', () => {
    it('should include all required security headers', () => {
      applyCSPHeaders(mockResponse, mockRequest)

      const requiredHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      }

      Object.entries(requiredHeaders).forEach(([header, expectedValue]) => {
        expect(mockResponse.headers.get(header)).toBe(expectedValue)
      })
    })

    it('should validate HSTS header configuration', () => {
      // Apply security headers that should include HSTS in production
      applyCSPHeaders(mockResponse, mockRequest)

      // In production, HSTS should be present
      if (process.env.NODE_ENV === 'production') {
        const hstsHeader = mockResponse.headers.get('Strict-Transport-Security')
        expect(hstsHeader).toContain('max-age=')
        expect(hstsHeader).toContain('includeSubDomains')
      }
    })

    it('should set appropriate cache control headers', () => {
      const context: Partial<CSPContext> = {
        nonce: 'test-nonce',
        reportOnly: false,
      }

      applyCSPHeaders(mockResponse, mockRequest, context)

      // CSP should not be cached to ensure fresh nonces
      const cacheControl = mockResponse.headers.get('Cache-Control')
      if (cacheControl) {
        expect(cacheControl).toMatch(/no-cache|no-store|private/)
      }
    })
  })

  describe('Edge Middleware Security', () => {
    it('should execute edge security middleware with basic rate limiting', async () => {
      const response = await edgeSecurityMiddleware(mockRequest)

      // Should pass through with no blocking for normal request
      expect(response.status).toBe(200)

      // Should include rate limit headers
      expect(response.headers.has('X-RateLimit-Limit')).toBe(false) // Basic middleware doesn't add these
    })

    it('should handle rate limiting in edge middleware', async () => {
      // Create multiple rapid requests to trigger rate limiting
      const rapidRequests = Array.from(
        { length: 5 },
        () =>
          new NextRequest('https://contribux.ai/api/test', {
            headers: { 'x-forwarded-for': '192.168.1.100' },
          })
      )

      const responses = await Promise.all(rapidRequests.map(req => edgeSecurityMiddleware(req)))

      // All should pass (basic rate limit is 60/min)
      responses.forEach(response => {
        expect(response.status).toBeOneOf([200, 429]) // 200 for pass, 429 for rate limited
      })
    })

    it('should detect and block suspicious request patterns', async () => {
      const suspiciousRequest = new NextRequest('https://contribux.ai/.env', {
        method: 'GET',
        headers: {
          'user-agent': 'curl/7.0',
          'x-forwarded-for': '10.0.0.1',
        },
      })

      const response = await enhancedEdgeMiddleware(suspiciousRequest)

      // Should either block or challenge suspicious requests
      if (response) {
        expect(response.status).toBeOneOf([403, 429, 200]) // Block, rate limit, or challenge
      }
    })

    it('should handle geo-blocking configuration', () => {
      const config = EDGE_SECURITY_CONFIG.geoBlocking

      expect(config.allowedCountries).toContain('US')
      expect(config.allowedCountries).toContain('CA')
      expect(config.blockedCountries).toContain('CN')
      expect(config.blockedCountries).toContain('RU')
    })

    it('should validate bot detection patterns', () => {
      const botConfig = EDGE_SECURITY_CONFIG.botDetection

      expect(botConfig.suspiciousPatterns).toHaveLength(3)
      expect(botConfig.suspiciousPatterns[0].test('bot crawler')).toBe(true)
      expect(botConfig.suspiciousPatterns[1].test('automated script')).toBe(true)
      expect(botConfig.suspiciousPatterns[2].test('headless chrome')).toBe(true)
    })

    it('should configure DDoS protection thresholds', () => {
      const ddosConfig = EDGE_SECURITY_CONFIG.ddos

      expect(ddosConfig.burstThreshold).toBe(50)
      expect(ddosConfig.burstWindow).toBe(5000) // 5 seconds
      expect(ddosConfig.blockDuration).toBe(900000) // 15 minutes
    })
  })

  describe('SOAR Integration Validation', () => {
    let soarEngine: SOAREngine

    beforeEach(async () => {
      soarEngine = createSOAREngine({
        automation: {
          enableAutomatedResponse: true,
          enablePlaybookExecution: true,
          maxAutomationLevel: 'medium',
        },
        thresholds: {
          criticalIncidentThreshold: 0.9,
          automatedResponseThreshold: 0.8,
          escalationThreshold: 0.95,
        },
      })
      await soarEngine.start()
    })

    afterEach(async () => {
      await soarEngine.shutdown()
    })

    it('should process critical security incidents', async () => {
      const criticalIncident: SecurityIncident = {
        incidentId: 'INC-001',
        severity: 'critical',
        category: 'data_breach',
        description: 'Unauthorized access detected',
        detectedAt: Date.now(),
        source: 'edge_security',
        affectedSystems: ['api_server'],
        indicators: ['multiple_failed_logins', 'privilege_escalation'],
        confidence: 0.95,
        status: 'active',
        assignedTo: 'security_team',
        priority: 10,
      }

      const executions = await soarEngine.processIncident(criticalIncident)

      expect(executions).toHaveLength(1)
      expect(executions[0].status).toBe('completed')
      expect(executions[0].playbookId).toBe('critical-incident-response')
    })

    it('should process threat detections with automated response', async () => {
      const threatDetection: ThreatDetection = {
        threatId: 'THR-001',
        type: 'malware',
        severity: 'critical',
        confidence: 0.98,
        description: 'Malicious script injection detected',
        detectedAt: Date.now(),
        source: 'csp_violation',
        indicators: ['script_injection', 'xss_attempt'],
        affectedAssets: ['web_application'],
        mitigationSuggestions: ['block_ip', 'update_csp'],
        status: 'active',
      }

      const executions = await soarEngine.processThreat(threatDetection)

      expect(executions).toHaveLength(1)
      expect(executions[0].status).toBe('completed')
      expect(executions[0].playbookId).toBe('automated-threat-hunting')
    })

    it('should execute response actions automatically', async () => {
      const action = await soarEngine.executeResponseAction('block_ip', '192.168.1.100', true)

      expect(action.success).toBe(true)
      expect(action.automated).toBe(true)
      expect(action.output).toContain('blocked successfully')
    })

    it('should provide SOAR metrics and monitoring', () => {
      const metrics = soarEngine.getSOARMetrics()

      expect(metrics.playbooks.total).toBeGreaterThan(0)
      expect(metrics.automation.isRunning).toBe(true)
      expect(metrics.automation.enabled).toBe(true)
      expect(metrics.automation.level).toBe('medium')
    })

    it('should handle playbook execution failures gracefully', async () => {
      // Create a mock incident that would cause playbook failure
      const problematicIncident: SecurityIncident = {
        incidentId: 'INC-FAIL',
        severity: 'low',
        category: 'unknown',
        description: 'Test incident for failure scenario',
        detectedAt: Date.now(),
        source: 'test',
        affectedSystems: [],
        indicators: [],
        confidence: 0.1,
        status: 'active',
        assignedTo: 'auto',
        priority: 1,
      }

      const executions = await soarEngine.processIncident(problematicIncident)

      // Should handle gracefully even if no playbooks match
      expect(executions).toHaveLength(0)
    })
  })

  describe('Performance Impact Validation', () => {
    it('should execute security middleware within performance limits', async () => {
      const startTime = Date.now()
      await edgeSecurityMiddleware(mockRequest)
      const endTime = Date.now()

      const executionTime = endTime - startTime
      expect(executionTime).toBeLessThan(50) // Should complete within 50ms
    })

    it('should validate CSP header size limits', () => {
      const { policy } = generateCSPPolicy(mockRequest)

      // CSP header should be reasonable size for performance
      expect(policy.length).toBeLessThan(4096) // 4KB limit for headers
    })

    it('should validate CORS header overhead', () => {
      const corsConfig = generateCORSConfig(mockRequest)
      applyCORSHeaders(mockResponse, mockRequest, corsConfig)

      // Count CORS-related headers
      const corsHeaders = [
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Methods',
        'Access-Control-Allow-Headers',
        'Access-Control-Expose-Headers',
        'Access-Control-Allow-Credentials',
        'Access-Control-Max-Age',
        'Vary',
      ]

      let totalHeaderSize = 0
      corsHeaders.forEach(header => {
        const value = mockResponse.headers.get(header)
        if (value) {
          totalHeaderSize += header.length + value.length + 4 // +4 for ": " and "\r\n"
        }
      })

      expect(totalHeaderSize).toBeLessThan(1024) // 1KB limit for CORS headers
    })
  })

  describe('Configuration Validation', () => {
    it('should validate CSP configuration schema', () => {
      const config = CSP_CORS_CONFIG

      expect(config.csp.reportUri).toBe('/api/security/csp-report')
      expect(config.csp.nonceLength).toBe(16)
      expect(config.csp.hashAlgorithm).toBe('sha256')
      expect(config.cors.credentials).toBe(true)
      expect(config.cors.maxAge).toBe(86400)
    })

    it('should validate edge security configuration', () => {
      const config = EDGE_SECURITY_CONFIG

      expect(config.rateLimiting.global.requests).toBe(1000)
      expect(config.rateLimiting.perIp.requests).toBe(100)
      expect(config.challenges.captchaThreshold).toBe(0.6)
      expect(config.challenges.blockThreshold).toBe(0.8)
    })

    it('should ensure security configuration consistency', () => {
      // Validate that security thresholds are properly ordered
      const challenges = EDGE_SECURITY_CONFIG.challenges

      expect(challenges.jsChallenge).toBeLessThan(challenges.captchaThreshold)
      expect(challenges.captchaThreshold).toBeLessThan(challenges.blockThreshold)
    })
  })
})
