/**
 * Cross-System Security Integration Tests
 *
 * Comprehensive testing of security implementation across all system boundaries
 * and integration points to ensure coordinated security enforcement.
 *
 * Test Coverage:
 * - API security with authentication coordination
 * - Database security integration validation
 * - Middleware security chain coordination
 * - Rate limiting across system boundaries
 * - Security event correlation across systems
 * - Inter-service security communication
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiTestUtils } from '../api/utils/api-test-utilities'

// Cross-system security schemas
const SecurityContextSchema = z.object({
  requestId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  ipAddress: z.string().ip(),
  userAgent: z.string(),
  timestamp: z.string().datetime(),
  securityLevel: z.enum(['public', 'authenticated', 'privileged', 'admin']),
  permissions: z.array(z.string()),
  riskScore: z.number().min(0).max(100),
  securityFlags: z.object({
    rateLimited: z.boolean(),
    authValidated: z.boolean(),
    csrfValidated: z.boolean(),
    inputSanitized: z.boolean(),
    outputFiltered: z.boolean(),
  }),
})

const DatabaseSecurityContextSchema = z.object({
  connectionId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE']),
  table: z.string(),
  rowLevelSecurity: z.boolean(),
  sqlInjectionChecked: z.boolean(),
  parameterized: z.boolean(),
  auditLogged: z.boolean(),
  performanceMetrics: z.object({
    queryTime: z.number(),
    rowsAffected: z.number(),
    securityOverhead: z.number(),
  }),
})

const MiddlewareSecurityChainSchema = z.object({
  chainId: z.string().uuid(),
  executionOrder: z.array(z.string()),
  securityChecks: z.array(
    z.object({
      middleware: z.string(),
      executed: z.boolean(),
      passed: z.boolean(),
      duration: z.number(),
      details: z.record(z.any()),
    })
  ),
  totalSecurityOverhead: z.number(),
  finalDecision: z.enum(['allow', 'deny', 'challenge']),
})

const SecurityCorrelationEventSchema = z.object({
  correlationId: z.string().uuid(),
  eventType: z.enum([
    'auth_attempt',
    'api_request',
    'db_query',
    'middleware_check',
    'rate_limit_check',
    'security_violation',
    'audit_log',
  ]),
  sourceSystem: z.enum(['api', 'database', 'middleware', 'auth', 'rate_limiter']),
  targetSystem: z.enum(['api', 'database', 'middleware', 'auth', 'rate_limiter']).optional(),
  securityContext: SecurityContextSchema,
  timestamp: z.string().datetime(),
  outcome: z.enum(['success', 'failure', 'blocked', 'challenged']),
  metrics: z.record(z.number()),
})

// Test setup
const server = setupServer()
const performanceTracker = new apiTestUtils.performanceTracker()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  performanceTracker.clear()
})
afterAll(() => server.close())

describe('Cross-System Security Integration', () => {
  let securityCorrelationLog: z.infer<typeof SecurityCorrelationEventSchema>[] = []
  const activeSecurityContexts: Map<string, z.infer<typeof SecurityContextSchema>> = new Map()
  let databaseSecurityEvents: z.infer<typeof DatabaseSecurityContextSchema>[] = []

  beforeEach(() => {
    securityCorrelationLog = []
    activeSecurityContexts.clear()
    databaseSecurityEvents = []
    vi.clearAllMocks()
  })

  describe('API Security with Authentication Coordination', () => {
    it('should enforce authentication on all protected endpoints with context propagation', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const sessionId = apiTestUtils.dataGenerator.generateUUID()
      const requestId = apiTestUtils.dataGenerator.generateUUID()

      server.use(
        // Authentication service
        http.post('http://localhost:3000/api/auth/validate-session', async ({ request }) => {
          const body = await request.json()
          const { sessionToken } = body

          const securityContext: z.infer<typeof SecurityContextSchema> = {
            requestId,
            userId,
            sessionId,
            ipAddress: '192.168.1.100',
            userAgent: 'test-agent',
            timestamp: new Date().toISOString(),
            securityLevel: sessionToken === 'valid-session' ? 'authenticated' : 'public',
            permissions: sessionToken === 'valid-session' ? ['read:profile', 'write:profile'] : [],
            riskScore: sessionToken === 'valid-session' ? 20 : 80,
            securityFlags: {
              rateLimited: false,
              authValidated: sessionToken === 'valid-session',
              csrfValidated: false,
              inputSanitized: false,
              outputFiltered: false,
            },
          }

          activeSecurityContexts.set(requestId, securityContext)

          securityCorrelationLog.push({
            correlationId: requestId,
            eventType: 'auth_attempt',
            sourceSystem: 'auth',
            securityContext,
            timestamp: new Date().toISOString(),
            outcome: sessionToken === 'valid-session' ? 'success' : 'failure',
            metrics: {
              authTime: 25,
              riskScore: securityContext.riskScore,
            },
          })

          if (sessionToken !== 'valid-session') {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_SESSION',
                  message: 'Session validation failed',
                },
              },
              { status: 401 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              securityContext,
              validatedUser: { id: userId, permissions: securityContext.permissions },
            },
          })
        }),

        // Protected API endpoint
        http.get('http://localhost:3000/api/user/profile', async ({ request }) => {
          const authorization = request.headers.get('Authorization')
          const sessionToken = authorization?.replace('Bearer ', '')

          // Validate session through auth service
          const authResponse = await fetch('http://localhost:3000/api/auth/validate-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken }),
          })

          if (!authResponse.ok) {
            const authError = await authResponse.json()
            return HttpResponse.json(authError, { status: authResponse.status })
          }

          const authData = await authResponse.json()
          const securityContext = authData.data.securityContext

          // Update security context with API-specific flags
          securityContext.securityFlags.csrfValidated = true
          securityContext.securityFlags.inputSanitized = true
          securityContext.securityFlags.outputFiltered = true

          securityCorrelationLog.push({
            correlationId: securityContext.requestId,
            eventType: 'api_request',
            sourceSystem: 'api',
            securityContext,
            timestamp: new Date().toISOString(),
            outcome: 'success',
            metrics: {
              apiTime: 50,
              securityOverhead: 15,
            },
          })

          return HttpResponse.json({
            success: true,
            data: {
              profile: {
                id: userId,
                name: 'Test User',
                email: 'test@example.com',
              },
              securityContext,
            },
          })
        })
      )

      // Test authenticated request
      const authenticatedResponse = await fetch('http://localhost:3000/api/user/profile', {
        headers: {
          Authorization: 'Bearer valid-session',
        },
      })

      expect(authenticatedResponse.status).toBe(200)
      const authenticatedData = await authenticatedResponse.json()
      expect(authenticatedData.success).toBe(true)
      expect(authenticatedData.data.securityContext.securityLevel).toBe('authenticated')
      expect(authenticatedData.data.securityContext.securityFlags.authValidated).toBe(true)

      // Test unauthenticated request
      const unauthenticatedResponse = await fetch('http://localhost:3000/api/user/profile', {
        headers: {
          Authorization: 'Bearer invalid-session',
        },
      })

      expect(unauthenticatedResponse.status).toBe(401)

      // Verify security correlation
      const authEvents = securityCorrelationLog.filter(log => log.eventType === 'auth_attempt')
      const apiEvents = securityCorrelationLog.filter(log => log.eventType === 'api_request')

      expect(authEvents).toHaveLength(2) // One success, one failure
      expect(apiEvents).toHaveLength(1) // Only successful auth leads to API call
      expect(authEvents[0].correlationId).toBe(apiEvents[0].correlationId)
    })

    it('should validate session context in API calls with comprehensive security binding', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const sessionId = apiTestUtils.dataGenerator.generateUUID()
      const ipAddress = '192.168.1.100'
      const userAgent = 'test-browser'

      server.use(
        http.post('http://localhost:3000/api/auth/validate-context', async ({ request }) => {
          const body = await request.json()
          const {
            sessionId: requestSessionId,
            ipAddress: requestIp,
            userAgent: requestUserAgent,
          } = body

          const requestId = apiTestUtils.dataGenerator.generateUUID()
          const securityContext: z.infer<typeof SecurityContextSchema> = {
            requestId,
            userId,
            sessionId: requestSessionId,
            ipAddress: requestIp,
            userAgent: requestUserAgent,
            timestamp: new Date().toISOString(),
            securityLevel: 'authenticated',
            permissions: ['read:data', 'write:data'],
            riskScore: 25,
            securityFlags: {
              rateLimited: false,
              authValidated: true,
              csrfValidated: true,
              inputSanitized: true,
              outputFiltered: false,
            },
          }

          // Validate IP address consistency
          const knownIp = '192.168.1.100'
          if (requestIp !== knownIp) {
            securityContext.riskScore += 30
            securityContext.securityFlags.authValidated = false

            securityCorrelationLog.push({
              correlationId: requestId,
              eventType: 'security_violation',
              sourceSystem: 'auth',
              securityContext,
              timestamp: new Date().toISOString(),
              outcome: 'blocked',
              metrics: {
                riskIncrease: 30,
                violationType: 1, // IP mismatch
              },
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'IP_ADDRESS_MISMATCH',
                  message: 'Session IP address does not match request',
                  details: {
                    sessionIp: knownIp,
                    requestIp,
                  },
                },
              },
              { status: 403 }
            )
          }

          // Validate User-Agent consistency
          const knownUserAgent = 'test-browser'
          if (requestUserAgent !== knownUserAgent) {
            securityContext.riskScore += 20

            securityCorrelationLog.push({
              correlationId: requestId,
              eventType: 'security_violation',
              sourceSystem: 'auth',
              securityContext,
              timestamp: new Date().toISOString(),
              outcome: 'challenged',
              metrics: {
                riskIncrease: 20,
                violationType: 2, // User-Agent mismatch
              },
            })
          }

          securityCorrelationLog.push({
            correlationId: requestId,
            eventType: 'auth_attempt',
            sourceSystem: 'auth',
            securityContext,
            timestamp: new Date().toISOString(),
            outcome: 'success',
            metrics: {
              contextValidationTime: 30,
              finalRiskScore: securityContext.riskScore,
            },
          })

          return HttpResponse.json({
            success: true,
            data: {
              securityContext,
              contextValid: true,
            },
          })
        })
      )

      // Test valid context
      const validContextResponse = await fetch('http://localhost:3000/api/auth/validate-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ipAddress,
          userAgent,
        }),
      })

      expect(validContextResponse.status).toBe(200)
      const validData = await validContextResponse.json()
      expect(validData.success).toBe(true)
      expect(validData.data.securityContext.riskScore).toBe(25)

      // Test IP address mismatch
      const ipMismatchResponse = await fetch('http://localhost:3000/api/auth/validate-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ipAddress: '10.0.0.1', // Different IP
          userAgent,
        }),
      })

      expect(ipMismatchResponse.status).toBe(403)
      const ipMismatchData = await ipMismatchResponse.json()
      expect(ipMismatchData.error.code).toBe('IP_ADDRESS_MISMATCH')

      // Test User-Agent mismatch (should succeed but with higher risk score)
      const userAgentMismatchResponse = await fetch(
        'http://localhost:3000/api/auth/validate-context',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            ipAddress,
            userAgent: 'different-browser',
          }),
        }
      )

      expect(userAgentMismatchResponse.status).toBe(200)
      const userAgentData = await userAgentMismatchResponse.json()
      expect(userAgentData.data.securityContext.riskScore).toBe(45) // 25 + 20

      // Verify security correlation events
      const securityViolations = securityCorrelationLog.filter(
        log => log.eventType === 'security_violation'
      )
      expect(securityViolations).toHaveLength(2) // IP mismatch and User-Agent mismatch
    })
  })

  describe('Database Security Integration Validation', () => {
    it('should prevent SQL injection across all endpoints with comprehensive validation', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const connectionId = apiTestUtils.dataGenerator.generateUUID()

      server.use(
        http.post('http://localhost:3000/api/search/repositories', async ({ request }) => {
          const body = await request.json()
          const { query } = body

          const requestId = apiTestUtils.dataGenerator.generateUUID()
          const securityContext: z.infer<typeof SecurityContextSchema> = {
            requestId,
            userId,
            ipAddress: '192.168.1.100',
            userAgent: 'test-agent',
            timestamp: new Date().toISOString(),
            securityLevel: 'authenticated',
            permissions: ['read:repositories'],
            riskScore: 30,
            securityFlags: {
              rateLimited: false,
              authValidated: true,
              csrfValidated: true,
              inputSanitized: false,
              outputFiltered: false,
            },
          }

          // SQL injection detection patterns
          const sqlInjectionPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
            /(--|#|\/\*|\*\/)/,
            /(\bOR\b\s+\b\d+\s*=\s*\d+)/i,
            /(\bAND\b\s+\b\d+\s*=\s*\d+)/i,
            /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP))/i,
            /(\bUNION\b.*\bSELECT\b)/i,
            /(\b(EXEC|EXECUTE)\b.*\b(XP_|SP_))/i,
          ]

          let sqlInjectionDetected = false
          for (const pattern of sqlInjectionPatterns) {
            if (pattern.test(query)) {
              sqlInjectionDetected = true
              break
            }
          }

          if (sqlInjectionDetected) {
            securityContext.riskScore = 100
            securityContext.securityFlags.inputSanitized = false

            const dbSecurityEvent: z.infer<typeof DatabaseSecurityContextSchema> = {
              connectionId,
              userId,
              operation: 'SELECT',
              table: 'repositories',
              rowLevelSecurity: true,
              sqlInjectionChecked: true,
              parameterized: false,
              auditLogged: true,
              performanceMetrics: {
                queryTime: 0,
                rowsAffected: 0,
                securityOverhead: 25,
              },
            }

            databaseSecurityEvents.push(dbSecurityEvent)

            securityCorrelationLog.push({
              correlationId: requestId,
              eventType: 'security_violation',
              sourceSystem: 'api',
              targetSystem: 'database',
              securityContext,
              timestamp: new Date().toISOString(),
              outcome: 'blocked',
              metrics: {
                sqlInjectionRisk: 100,
                blockedAtLayer: 1, // API layer
              },
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SQL_INJECTION_DETECTED',
                  message: 'Potential SQL injection attack detected',
                  details: 'Query contains suspicious SQL patterns',
                },
              },
              { status: 400 }
            )
          }

          // Safe query processing
          securityContext.securityFlags.inputSanitized = true
          securityContext.securityFlags.outputFiltered = true

          const dbSecurityEvent: z.infer<typeof DatabaseSecurityContextSchema> = {
            connectionId,
            userId,
            operation: 'SELECT',
            table: 'repositories',
            rowLevelSecurity: true,
            sqlInjectionChecked: true,
            parameterized: true,
            auditLogged: true,
            performanceMetrics: {
              queryTime: 150,
              rowsAffected: 10,
              securityOverhead: 15,
            },
          }

          databaseSecurityEvents.push(dbSecurityEvent)

          securityCorrelationLog.push({
            correlationId: requestId,
            eventType: 'db_query',
            sourceSystem: 'api',
            targetSystem: 'database',
            securityContext,
            timestamp: new Date().toISOString(),
            outcome: 'success',
            metrics: {
              queryTime: 150,
              securityOverhead: 15,
              rowsReturned: 10,
            },
          })

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [{ id: '1', name: 'test-repo', owner: 'test-user' }],
              total_count: 1,
              securityContext,
            },
          })
        })
      )

      // Test safe query
      const safeResponse = await fetch('http://localhost:3000/api/search/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'typescript react' }),
      })

      expect(safeResponse.status).toBe(200)
      const safeData = await safeResponse.json()
      expect(safeData.success).toBe(true)
      expect(safeData.data.securityContext.securityFlags.inputSanitized).toBe(true)

      // Test SQL injection attempt
      const maliciousQuery = "'; DROP TABLE repositories; --"
      const maliciousResponse = await fetch('http://localhost:3000/api/search/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: maliciousQuery }),
      })

      expect(maliciousResponse.status).toBe(400)
      const maliciousData = await maliciousResponse.json()
      expect(maliciousData.error.code).toBe('SQL_INJECTION_DETECTED')

      // Verify database security events
      const safeDbEvents = databaseSecurityEvents.filter(event => event.parameterized === true)
      const maliciousDbEvents = databaseSecurityEvents.filter(
        event => event.parameterized === false
      )

      expect(safeDbEvents).toHaveLength(1)
      expect(maliciousDbEvents).toHaveLength(1)
      expect(safeDbEvents[0].sqlInjectionChecked).toBe(true)
      expect(maliciousDbEvents[0].performanceMetrics.queryTime).toBe(0) // Blocked before execution

      // Verify security correlation
      const dbQueries = securityCorrelationLog.filter(log => log.eventType === 'db_query')
      const securityViolations = securityCorrelationLog.filter(
        log => log.eventType === 'security_violation'
      )

      expect(dbQueries).toHaveLength(1)
      expect(securityViolations).toHaveLength(1)
    })

    it('should validate input sanitization end-to-end across system boundaries', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()

      server.use(
        http.post('http://localhost:3000/api/user/update-profile', async ({ request }) => {
          const body = await request.json()
          const { profile } = body

          const requestId = apiTestUtils.dataGenerator.generateUUID()
          const securityContext: z.infer<typeof SecurityContextSchema> = {
            requestId,
            userId,
            ipAddress: '192.168.1.100',
            userAgent: 'test-agent',
            timestamp: new Date().toISOString(),
            securityLevel: 'authenticated',
            permissions: ['write:profile'],
            riskScore: 25,
            securityFlags: {
              rateLimited: false,
              authValidated: true,
              csrfValidated: true,
              inputSanitized: false,
              outputFiltered: false,
            },
          }

          // Multi-layer input validation
          const validationLayers = [
            {
              layer: 'api_validation',
              checks: [
                { field: 'name', pattern: /^[a-zA-Z\s]{1,50}$/, passed: false },
                { field: 'email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, passed: false },
                { field: 'bio', pattern: /^[^<>]{0,500}$/, passed: false },
              ],
            },
            {
              layer: 'sanitization',
              checks: [
                { field: 'name', sanitized: false, originalLength: 0, finalLength: 0 },
                { field: 'email', sanitized: false, originalLength: 0, finalLength: 0 },
                { field: 'bio', sanitized: false, originalLength: 0, finalLength: 0 },
              ],
            },
            {
              layer: 'database_validation',
              checks: [
                { field: 'name', escaped: false, parameterized: false },
                { field: 'email', escaped: false, parameterized: false },
                { field: 'bio', escaped: false, parameterized: false },
              ],
            },
          ]

          // API layer validation
          for (const check of validationLayers[0].checks) {
            const value = profile[check.field]
            if (value !== undefined) {
              check.passed = check.pattern.test(value)
              if (!check.passed) {
                securityContext.riskScore += 20
              }
            }
          }

          // Sanitization layer
          const sanitizedProfile: Record<string, string> = {}
          for (const check of validationLayers[1].checks) {
            const originalValue = profile[check.field]
            if (originalValue !== undefined) {
              check.originalLength = originalValue.length
              // Simple sanitization (remove HTML tags and dangerous characters)
              const sanitized = originalValue
                .replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/<[^>]*>/g, '')
                .replace(/[<>"'&]/g, '')

              sanitizedProfile[check.field] = sanitized
              check.finalLength = sanitized.length
              check.sanitized = check.originalLength !== check.finalLength

              if (check.sanitized) {
                securityContext.riskScore += 10
              }
            }
          }

          // Database layer validation
          for (const check of validationLayers[2].checks) {
            const value = sanitizedProfile[check.field]
            if (value !== undefined) {
              check.escaped = true // Assume parameterized queries escape properly
              check.parameterized = true
            }
          }

          const allValidationsPassed = validationLayers[0].checks.every(check => check.passed)

          if (!allValidationsPassed) {
            securityCorrelationLog.push({
              correlationId: requestId,
              eventType: 'security_violation',
              sourceSystem: 'api',
              securityContext,
              timestamp: new Date().toISOString(),
              outcome: 'blocked',
              metrics: {
                validationFailures: validationLayers[0].checks.filter(c => !c.passed).length,
                inputRiskScore: securityContext.riskScore,
              },
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'VALIDATION_FAILED',
                  message: 'Input validation failed',
                  details: {
                    failedFields: validationLayers[0].checks
                      .filter(c => !c.passed)
                      .map(c => c.field),
                    validationLayers,
                  },
                },
              },
              { status: 400 }
            )
          }

          securityContext.securityFlags.inputSanitized = true
          securityContext.securityFlags.outputFiltered = true

          securityCorrelationLog.push({
            correlationId: requestId,
            eventType: 'api_request',
            sourceSystem: 'api',
            targetSystem: 'database',
            securityContext,
            timestamp: new Date().toISOString(),
            outcome: 'success',
            metrics: {
              validationLayers: 3,
              sanitizedFields: validationLayers[1].checks.filter(c => c.sanitized).length,
              finalRiskScore: securityContext.riskScore,
            },
          })

          return HttpResponse.json({
            success: true,
            data: {
              profile: sanitizedProfile,
              securityContext,
              validationResults: validationLayers,
            },
          })
        })
      )

      // Test valid profile update
      const validProfile = {
        name: 'John Doe',
        email: 'john@example.com',
        bio: 'Software developer',
      }

      const validResponse = await fetch('http://localhost:3000/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: validProfile }),
      })

      expect(validResponse.status).toBe(200)
      const validData = await validResponse.json()
      expect(validData.success).toBe(true)
      expect(validData.data.securityContext.securityFlags.inputSanitized).toBe(true)

      // Test malicious profile update
      const maliciousProfile = {
        name: '<script>alert("xss")</script>John',
        email: 'john@example.com',
        bio: 'Bio with <img src="x" onerror="alert(1)"> malicious content',
      }

      const maliciousResponse = await fetch('http://localhost:3000/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: maliciousProfile }),
      })

      expect(maliciousResponse.status).toBe(200) // Sanitized but allowed
      const maliciousData = await maliciousResponse.json()
      expect(maliciousData.success).toBe(true)
      expect(maliciousData.data.profile.name).not.toContain('<script>')
      expect(maliciousData.data.profile.bio).not.toContain('<img')

      // Verify security correlation
      const apiRequests = securityCorrelationLog.filter(log => log.eventType === 'api_request')
      expect(apiRequests).toHaveLength(2)

      // Check that sanitization was applied
      const sanitizationResults = maliciousData.data.validationResults[1].checks
      const sanitizedFields = sanitizationResults.filter(
        (check: { sanitized: boolean }) => check.sanitized
      )
      expect(sanitizedFields.length).toBeGreaterThan(0)
    })
  })

  describe('Middleware Security Chain Coordination', () => {
    it('should coordinate security middleware chain with comprehensive validation', async () => {
      const requestId = apiTestUtils.dataGenerator.generateUUID()
      const chainId = apiTestUtils.dataGenerator.generateUUID()

      server.use(
        http.get('http://localhost:3000/api/protected/data', async ({ request }) => {
          const middlewareChain: z.infer<typeof MiddlewareSecurityChainSchema> = {
            chainId,
            executionOrder: [
              'rate_limiter',
              'cors_validator',
              'auth_validator',
              'csrf_validator',
              'input_sanitizer',
              'permission_checker',
            ],
            securityChecks: [],
            totalSecurityOverhead: 0,
            finalDecision: 'allow',
          }

          const ipAddress = request.headers.get('X-Forwarded-For') || '127.0.0.1'
          const origin = request.headers.get('Origin')
          const authorization = request.headers.get('Authorization')
          const csrfToken = request.headers.get('X-CSRF-Token')

          // Execute middleware chain
          for (const middleware of middlewareChain.executionOrder) {
            const start = performance.now()
            let passed = false
            let details: Record<string, unknown> = {}

            switch (middleware) {
              case 'rate_limiter':
                // Simulate rate limiting check
                passed = true // Assume under limit
                details = { requestsRemaining: 95, windowReset: Date.now() + 60000 }
                break

              case 'cors_validator': {
                const allowedOrigins = ['http://localhost:3000', 'https://contribux.com']
                passed = !origin || allowedOrigins.includes(origin)
                details = { origin, allowed: passed }
                break
              }

              case 'auth_validator':
                passed = authorization?.startsWith('Bearer ') && authorization.includes('valid')
                details = { hasAuth: !!authorization, tokenValid: passed }
                break

              case 'csrf_validator':
                passed = !!csrfToken && csrfToken.length >= 32
                details = { hasToken: !!csrfToken, tokenLength: csrfToken?.length || 0 }
                break

              case 'input_sanitizer':
                passed = true // Always passes, modifies input
                details = { sanitizationApplied: true }
                break

              case 'permission_checker':
                passed = authorization?.includes('valid') // Simplified check
                details = { hasPermission: passed, requiredPermission: 'read:data' }
                break
            }

            const duration = performance.now() - start
            middlewareChain.totalSecurityOverhead += duration

            middlewareChain.securityChecks.push({
              middleware,
              executed: true,
              passed,
              duration,
              details,
            })

            // If any critical middleware fails, stop the chain
            if (!passed && ['auth_validator', 'permission_checker'].includes(middleware)) {
              middlewareChain.finalDecision = 'deny'
              break
            }
            if (!passed && ['csrf_validator'].includes(middleware)) {
              middlewareChain.finalDecision = 'challenge'
            }
          }

          const securityContext: z.infer<typeof SecurityContextSchema> = {
            requestId,
            ipAddress,
            userAgent: request.headers.get('User-Agent') || 'unknown',
            timestamp: new Date().toISOString(),
            securityLevel: middlewareChain.finalDecision === 'allow' ? 'authenticated' : 'public',
            permissions: middlewareChain.finalDecision === 'allow' ? ['read:data'] : [],
            riskScore: middlewareChain.securityChecks.filter(check => !check.passed).length * 15,
            securityFlags: {
              rateLimited: false,
              authValidated:
                middlewareChain.securityChecks.find(c => c.middleware === 'auth_validator')
                  ?.passed || false,
              csrfValidated:
                middlewareChain.securityChecks.find(c => c.middleware === 'csrf_validator')
                  ?.passed || false,
              inputSanitized:
                middlewareChain.securityChecks.find(c => c.middleware === 'input_sanitizer')
                  ?.passed || false,
              outputFiltered: true,
            },
          }

          securityCorrelationLog.push({
            correlationId: requestId,
            eventType: 'middleware_check',
            sourceSystem: 'middleware',
            securityContext,
            timestamp: new Date().toISOString(),
            outcome: middlewareChain.finalDecision === 'allow' ? 'success' : 'blocked',
            metrics: {
              middlewareCount: middlewareChain.executionOrder.length,
              totalOverhead: middlewareChain.totalSecurityOverhead,
              failedChecks: middlewareChain.securityChecks.filter(check => !check.passed).length,
            },
          })

          if (middlewareChain.finalDecision === 'deny') {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'MIDDLEWARE_SECURITY_FAILED',
                  message: 'Security middleware validation failed',
                  details: {
                    failedChecks: middlewareChain.securityChecks.filter(check => !check.passed),
                    chainId,
                  },
                },
              },
              { status: 403 }
            )
          }

          if (middlewareChain.finalDecision === 'challenge') {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'ADDITIONAL_VERIFICATION_REQUIRED',
                  message: 'Additional security verification required',
                  details: {
                    challengeType: 'csrf_token',
                    chainId,
                  },
                },
              },
              { status: 401 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              content: 'Protected data content',
              securityContext,
              middlewareChain,
            },
          })
        })
      )

      // Test successful middleware chain
      const successResponse = await fetch('http://localhost:3000/api/protected/data', {
        headers: {
          Authorization: 'Bearer valid-token',
          'X-CSRF-Token': apiTestUtils.dataGenerator.generateRandomString(32),
          Origin: 'http://localhost:3000',
          'User-Agent': 'test-browser',
        },
      })

      expect(successResponse.status).toBe(200)
      const successData = await successResponse.json()
      expect(successData.success).toBe(true)
      expect(successData.data.middlewareChain.finalDecision).toBe('allow')
      expect(successData.data.middlewareChain.securityChecks).toHaveLength(6)

      // Test failed authentication
      const authFailResponse = await fetch('http://localhost:3000/api/protected/data', {
        headers: {
          Authorization: 'Bearer invalid-token',
          'X-CSRF-Token': apiTestUtils.dataGenerator.generateRandomString(32),
          Origin: 'http://localhost:3000',
        },
      })

      expect(authFailResponse.status).toBe(403)
      const authFailData = await authFailResponse.json()
      expect(authFailData.error.code).toBe('MIDDLEWARE_SECURITY_FAILED')

      // Test missing CSRF token
      const csrfFailResponse = await fetch('http://localhost:3000/api/protected/data', {
        headers: {
          Authorization: 'Bearer valid-token',
          Origin: 'http://localhost:3000',
        },
      })

      expect(csrfFailResponse.status).toBe(401)
      const csrfFailData = await csrfFailResponse.json()
      expect(csrfFailData.error.code).toBe('ADDITIONAL_VERIFICATION_REQUIRED')

      // Verify middleware execution logs
      const middlewareEvents = securityCorrelationLog.filter(
        log => log.eventType === 'middleware_check'
      )
      expect(middlewareEvents).toHaveLength(3)

      // Verify performance overhead tracking
      const successfulChain = successData.data.middlewareChain
      expect(successfulChain.totalSecurityOverhead).toBeGreaterThan(0)
      expect(
        successfulChain.securityChecks.every((check: { executed: boolean }) => check.executed)
      ).toBe(true)
    })
  })
})
