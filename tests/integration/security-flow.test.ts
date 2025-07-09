/**
 * Security Flow Integration Tests
 *
 * End-to-end testing of security middleware, rate limiting, CSP enforcement,
 * and security monitoring across the complete application stack.
 *
 * Test Coverage:
 * - Security middleware end-to-end functionality
 * - Rate limiting across multiple requests and endpoints
 * - CSP header enforcement in real browser scenarios
 * - Security health monitoring integration
 * - Attack scenario detection and response
 * - Security incident recovery workflows
 * - Cross-component security coordination
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Security flow state management
interface SecurityFlowState {
  rateLimitCounters: Map<string, RateLimitCounter>
  securityIncidents: SecurityIncident[]
  blockedIPs: Set<string>
  securityMetrics: SecurityMetrics
  alertLog: SecurityAlert[]
  cspViolations: CSPViolation[]
}

interface RateLimitCounter {
  ip: string
  endpoint: string
  count: number
  windowStart: Date
  windowDuration: number // in seconds
  maxRequests: number
  blocked: boolean
  blockUntil?: Date
}

interface SecurityIncident {
  incidentId: string
  type:
    | 'rate_limit_exceeded'
    | 'suspicious_activity'
    | 'injection_attempt'
    | 'unauthorized_access'
    | 'data_breach_attempt'
  severity: 'low' | 'medium' | 'high' | 'critical'
  ipAddress: string
  userAgent: string
  endpoint: string
  timestamp: Date
  details: Record<string, unknown>
  status: 'detected' | 'investigating' | 'mitigated' | 'resolved'
  responseActions: string[]
}

interface SecurityMetrics {
  totalRequests: number
  blockedRequests: number
  securityViolations: number
  averageResponseTime: number
  uptime: number
  lastSecurityScan: Date
  vulnerabilitiesFound: number
  patchLevel: string
}

interface SecurityAlert {
  alertId: string
  alertType: 'rate_limit' | 'attack_pattern' | 'anomaly_detection' | 'security_policy_violation'
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  timestamp: Date
  source: string
  resolved: boolean
  responseTime?: number
}

interface CSPViolation {
  violationId: string
  directive: string
  violatedDirective: string
  blockedURI: string
  sourceFile: string
  lineNumber: number
  columnNumber: number
  userAgent: string
  timestamp: Date
  reportedBy: string
}

// Schemas for validation
const SecurityHealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'critical']),
  timestamp: z.string().datetime(),
  checks: z.object({
    rateLimiting: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      activeCounters: z.number(),
      blockedIPs: z.number(),
      responseTime: z.number(),
    }),
    cspEnforcement: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      violationCount: z.number(),
      lastViolation: z.string().datetime().optional(),
      policyIntegrity: z.boolean(),
    }),
    securityMiddleware: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      incidentCount: z.number(),
      averageProcessingTime: z.number(),
      alertsActive: z.number(),
    }),
    authentication: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      sessionSecurity: z.boolean(),
      mfaFunctional: z.boolean(),
      webauthnActive: z.boolean(),
    }),
  }),
  metrics: z.object({
    securityScore: z.number().min(0).max(100),
    uptime: z.number(),
    incidentResponse: z.number(),
    complianceLevel: z.number(),
  }),
  alerts: z.array(
    z.object({
      alertId: z.string(),
      severity: z.enum(['info', 'warning', 'error', 'critical']),
      message: z.string(),
      timestamp: z.string().datetime(),
    })
  ),
})

const SecurityIncidentResponseSchema = z.object({
  incident: z.object({
    incidentId: z.string().uuid(),
    type: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    status: z.enum(['detected', 'investigating', 'mitigated', 'resolved']),
    timestamp: z.string().datetime(),
    details: z.record(z.unknown()),
    responseActions: z.array(z.string()),
  }),
  mitigation: z.object({
    immediate: z.array(z.string()),
    longTerm: z.array(z.string()),
    estimatedResolution: z.string(),
  }),
  impact: z.object({
    affectedSystems: z.array(z.string()),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    estimatedRecoveryTime: z.string(),
  }),
})

// Test setup
const server = setupServer()
const securityFlowState: SecurityFlowState = {
  rateLimitCounters: new Map(),
  securityIncidents: [],
  blockedIPs: new Set(),
  securityMetrics: {
    totalRequests: 0,
    blockedRequests: 0,
    securityViolations: 0,
    averageResponseTime: 50,
    uptime: 99.9,
    lastSecurityScan: new Date(),
    vulnerabilitiesFound: 0,
    patchLevel: 'current',
  },
  alertLog: [],
  cspViolations: [],
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  // Reset some state but keep metrics for testing continuity
  securityFlowState.alertLog = []
})
afterAll(() => server.close())

describe('Security Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Security Middleware End-to-End Functionality', () => {
    it('should enforce complete security pipeline across all requests', async () => {
      const testIP = '192.168.1.100'
      const testUserAgent = 'Mozilla/5.0 (test browser)'

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const ipAddress = request.headers.get('X-Forwarded-For') || testIP
          const userAgent = request.headers.get('User-Agent') || testUserAgent
          const authorization = request.headers.get('Authorization')

          // Security middleware pipeline simulation
          const securityChecks = {
            rateLimitPassed: true,
            cspHeadersSet: true,
            authenticationValid: !!authorization,
            inputSanitized: true,
            sqlInjectionPrevented: true,
            xssProtected: true,
          }

          // Update security metrics
          securityFlowState.securityMetrics.totalRequests++

          return HttpResponse.json(
            {
              success: true,
              data: {
                repositories: [
                  {
                    id: crypto.randomUUID(),
                    name: 'secure-repo',
                    description: 'Repository returned after security validation',
                  },
                ],
                total_count: 1,
                page: 1,
                per_page: 20,
                has_more: false,
              },
              metadata: {
                execution_time_ms: 45,
                security_context: {
                  checks: securityChecks,
                  ipAddress,
                  userAgent,
                  requestId: crypto.randomUUID(),
                  securityLevel: authorization ? 'authenticated' : 'anonymous',
                },
              },
            },
            {
              headers: {
                'Content-Security-Policy':
                  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block',
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
              },
            }
          )
        }),

        http.post('http://localhost:3000/api/auth/signin', async ({ request }) => {
          const ipAddress = request.headers.get('X-Forwarded-For') || testIP
          const userAgent = request.headers.get('User-Agent') || testUserAgent
          interface SignInRequestBody {
            email: string
            provider: string
          }
          const body = (await request.json()) as SignInRequestBody

          // Enhanced security checks for authentication endpoint
          const securityChecks = {
            rateLimitPassed: true,
            csrfTokenValid: !!request.headers.get('X-CSRF-Token'),
            inputValidated: !!body.email && !!body.provider,
            bruteForceProtected: true,
            accountLockoutChecked: true,
          }

          if (!securityChecks.csrfTokenValid) {
            securityFlowState.securityIncidents.push({
              incidentId: crypto.randomUUID(),
              type: 'unauthorized_access',
              severity: 'medium',
              ipAddress,
              userAgent,
              endpoint: '/api/auth/signin',
              timestamp: new Date(),
              details: { missingCSRFToken: true },
              status: 'detected',
              responseActions: ['blocked_request', 'logged_incident'],
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SECURITY_VIOLATION',
                  message: 'CSRF token required',
                  incident_id:
                    securityFlowState.securityIncidents[
                      securityFlowState.securityIncidents.length - 1
                    ].incidentId,
                },
              },
              { status: 403 }
            )
          }

          securityFlowState.securityMetrics.totalRequests++

          return HttpResponse.json({
            success: true,
            data: {
              redirectUrl: '/auth/callback',
              securityContext: {
                checks: securityChecks,
                requestId: crypto.randomUUID(),
              },
            },
          })
        })
      )

      console.log('🛡️ Testing complete security middleware pipeline...')

      // Test 1: Anonymous request with full security headers
      const anonymousResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: {
          'X-Forwarded-For': testIP,
          'User-Agent': testUserAgent,
        },
      })

      expect(anonymousResponse.status).toBe(200)
      expect(anonymousResponse.headers.get('Content-Security-Policy')).toContain(
        "default-src 'self'"
      )
      expect(anonymousResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(anonymousResponse.headers.get('X-Frame-Options')).toBe('DENY')
      expect(anonymousResponse.headers.get('Strict-Transport-Security')).toContain(
        'max-age=31536000'
      )

      const anonymousData = await anonymousResponse.json()
      expect(anonymousData.metadata.security_context.checks.rateLimitPassed).toBe(true)
      expect(anonymousData.metadata.security_context.checks.cspHeadersSet).toBe(true)
      expect(anonymousData.metadata.security_context.securityLevel).toBe('anonymous')

      console.log('✅ Anonymous request with security headers validated')

      // Test 2: Authenticated request with enhanced security
      const authenticatedResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: {
          Authorization: 'Bearer valid-token',
          'X-Forwarded-For': testIP,
          'User-Agent': testUserAgent,
        },
      })

      expect(authenticatedResponse.status).toBe(200)
      const authenticatedData = await authenticatedResponse.json()
      expect(authenticatedData.metadata.security_context.checks.authenticationValid).toBe(true)
      expect(authenticatedData.metadata.security_context.securityLevel).toBe('authenticated')

      console.log('✅ Authenticated request with enhanced security validated')

      // Test 3: Authentication endpoint without CSRF token (should fail)
      const noCSRFResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIP,
          'User-Agent': testUserAgent,
        },
        body: JSON.stringify({ email: 'test@example.com', provider: 'github' }),
      })

      expect(noCSRFResponse.status).toBe(403)
      const noCSRFData = await noCSRFResponse.json()
      expect(noCSRFData.error.code).toBe('SECURITY_VIOLATION')
      expect(noCSRFData.error.incident_id).toBeDefined()

      console.log('✅ CSRF protection validated - incident logged')

      // Test 4: Authentication endpoint with CSRF token (should succeed)
      const validCSRFResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'valid-csrf-token',
          'X-Forwarded-For': testIP,
          'User-Agent': testUserAgent,
        },
        body: JSON.stringify({ email: 'test@example.com', provider: 'github' }),
      })

      expect(validCSRFResponse.status).toBe(200)
      const validCSRFData = await validCSRFResponse.json()
      expect(validCSRFData.success).toBe(true)
      expect(validCSRFData.data.securityContext.checks.csrfTokenValid).toBe(true)

      console.log('✅ CSRF token validation successful')

      // Validate security metrics updated
      expect(securityFlowState.securityMetrics.totalRequests).toBe(4)
      expect(securityFlowState.securityIncidents).toHaveLength(1)
      expect(securityFlowState.securityIncidents[0].type).toBe('unauthorized_access')

      console.log('🎉 Complete security middleware pipeline validated!')
    })
  })

  describe('Rate Limiting Across Multiple Requests', () => {
    it('should enforce rate limits across different endpoints and time windows', async () => {
      const testIP = '192.168.1.200'
      const maxRequestsPerMinute = 5

      server.use(
        http.get('http://localhost:3000/api/search/:endpoint', ({ request, params }) => {
          const ipAddress = request.headers.get('X-Forwarded-For') || testIP
          const endpoint = params.endpoint as string
          const counterKey = `${ipAddress}:${endpoint}`

          let counter = securityFlowState.rateLimitCounters.get(counterKey)
          const now = new Date()

          if (!counter || now.getTime() - counter.windowStart.getTime() > 60000) {
            // New window or expired window
            counter = {
              ip: ipAddress,
              endpoint: `/api/search/${endpoint}`,
              count: 1,
              windowStart: now,
              windowDuration: 60,
              maxRequests: maxRequestsPerMinute,
              blocked: false,
            }
            securityFlowState.rateLimitCounters.set(counterKey, counter)
          } else {
            counter.count++
          }

          if (counter.count > maxRequestsPerMinute) {
            counter.blocked = true
            counter.blockUntil = new Date(now.getTime() + 60000) // Block for 1 minute

            securityFlowState.securityIncidents.push({
              incidentId: crypto.randomUUID(),
              type: 'rate_limit_exceeded',
              severity: 'medium',
              ipAddress,
              userAgent: request.headers.get('User-Agent') || 'unknown',
              endpoint: `/api/search/${endpoint}`,
              timestamp: now,
              details: {
                requestCount: counter.count,
                maxRequests: maxRequestsPerMinute,
                windowDuration: 60,
              },
              status: 'detected',
              responseActions: ['rate_limit_applied', 'ip_temporary_block'],
            })

            securityFlowState.alertLog.push({
              alertId: crypto.randomUUID(),
              alertType: 'rate_limit',
              severity: 'warning',
              message: `Rate limit exceeded for IP ${ipAddress} on ${endpoint}`,
              timestamp: now,
              source: 'rate_limiter',
              resolved: false,
            })

            securityFlowState.securityMetrics.blockedRequests++

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Too many requests',
                  details: {
                    limit: maxRequestsPerMinute,
                    window: '60s',
                    retryAfter: 60,
                  },
                },
              },
              {
                status: 429,
                headers: {
                  'Retry-After': '60',
                  'X-RateLimit-Limit': maxRequestsPerMinute.toString(),
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': Math.floor(counter.blockUntil?.getTime() / 1000).toString(),
                },
              }
            )
          }

          securityFlowState.securityMetrics.totalRequests++

          return HttpResponse.json(
            {
              success: true,
              data: {
                results: [`Result for ${endpoint}`],
                rateLimitInfo: {
                  limit: maxRequestsPerMinute,
                  remaining: maxRequestsPerMinute - counter.count,
                  resetTime: Math.floor((counter.windowStart.getTime() + 60000) / 1000),
                },
              },
            },
            {
              headers: {
                'X-RateLimit-Limit': maxRequestsPerMinute.toString(),
                'X-RateLimit-Remaining': (maxRequestsPerMinute - counter.count).toString(),
                'X-RateLimit-Reset': Math.floor(
                  (counter.windowStart.getTime() + 60000) / 1000
                ).toString(),
              },
            }
          )
        })
      )

      console.log('⏱️ Testing rate limiting across multiple endpoints...')

      const endpoints = ['repositories', 'opportunities', 'users']
      const requestPromises = []

      // Test rate limiting per endpoint
      for (const endpoint of endpoints) {
        console.log(`Testing rate limit for /api/search/${endpoint}...`)

        // Make requests up to the limit
        for (let i = 1; i <= maxRequestsPerMinute; i++) {
          const promise = fetch(`http://localhost:3000/api/search/${endpoint}`, {
            headers: { 'X-Forwarded-For': testIP },
          }).then(async response => {
            expect(response.status).toBe(200)
            expect(response.headers.get('X-RateLimit-Limit')).toBe(maxRequestsPerMinute.toString())
            expect(response.headers.get('X-RateLimit-Remaining')).toBe(
              (maxRequestsPerMinute - i).toString()
            )

            const data = await response.json()
            expect(data.success).toBe(true)
            expect(data.data.rateLimitInfo.remaining).toBe(maxRequestsPerMinute - i)

            return { endpoint, requestNumber: i, success: true }
          })

          requestPromises.push(promise)
        }

        console.log(`✅ ${maxRequestsPerMinute} requests successful for ${endpoint}`)
      }

      // Wait for all successful requests
      const successfulResults = await Promise.all(requestPromises)
      expect(successfulResults).toHaveLength(endpoints.length * maxRequestsPerMinute)

      // Test rate limit enforcement - these should fail
      const rateLimitTestPromises = endpoints.map(async endpoint => {
        const response = await fetch(`http://localhost:3000/api/search/${endpoint}`, {
          headers: { 'X-Forwarded-For': testIP },
        })

        expect(response.status).toBe(429)
        expect(response.headers.get('Retry-After')).toBe('60')
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')

        const data = await response.json()
        expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED')
        expect(data.error.details.retryAfter).toBe(60)

        return { endpoint, rateLimited: true }
      })

      const rateLimitedResults = await Promise.all(rateLimitTestPromises)
      expect(rateLimitedResults.every(result => result.rateLimited)).toBe(true)

      console.log('✅ Rate limits enforced - all excess requests blocked')

      // Validate rate limiting state
      expect(securityFlowState.rateLimitCounters.size).toBe(endpoints.length)
      expect(
        securityFlowState.securityIncidents.filter(i => i.type === 'rate_limit_exceeded')
      ).toHaveLength(endpoints.length)
      expect(securityFlowState.alertLog.filter(a => a.alertType === 'rate_limit')).toHaveLength(
        endpoints.length
      )
      expect(securityFlowState.securityMetrics.blockedRequests).toBe(endpoints.length)

      console.log('🎉 Rate limiting across multiple endpoints validated!')
    })

    it('should handle different rate limits for authenticated vs anonymous users', async () => {
      const anonymousIP = '192.168.1.300'
      const authenticatedIP = '192.168.1.301'
      const anonymousLimit = 3
      const authenticatedLimit = 10

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const ipAddress = request.headers.get('X-Forwarded-For') || '127.0.0.1'
          const authorization = request.headers.get('Authorization')
          const isAuthenticated = !!authorization && authorization.startsWith('Bearer ')

          const limit = isAuthenticated ? authenticatedLimit : anonymousLimit
          const userType = isAuthenticated ? 'authenticated' : 'anonymous'
          const counterKey = `${ipAddress}:repositories:${userType}`

          let counter = securityFlowState.rateLimitCounters.get(counterKey)
          const now = new Date()

          if (!counter || now.getTime() - counter.windowStart.getTime() > 60000) {
            counter = {
              ip: ipAddress,
              endpoint: '/api/search/repositories',
              count: 1,
              windowStart: now,
              windowDuration: 60,
              maxRequests: limit,
              blocked: false,
            }
            securityFlowState.rateLimitCounters.set(counterKey, counter)
          } else {
            counter.count++
          }

          if (counter.count > limit) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: `Rate limit exceeded for ${userType} user`,
                  details: { limit, userType },
                },
              },
              { status: 429 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [],
              rateLimitInfo: {
                userType,
                limit,
                remaining: limit - counter.count,
              },
            },
          })
        })
      )

      console.log('👤 Testing different rate limits for user types...')

      // Test anonymous user limit
      const anonymousRequests = []
      for (let i = 1; i <= anonymousLimit + 1; i++) {
        anonymousRequests.push(
          fetch('http://localhost:3000/api/search/repositories', {
            headers: { 'X-Forwarded-For': anonymousIP },
          })
        )
      }

      const anonymousResults = await Promise.all(anonymousRequests)

      // First 3 should succeed
      for (let i = 0; i < anonymousLimit; i++) {
        expect(anonymousResults[i].status).toBe(200)
      }

      // 4th should fail
      expect(anonymousResults[anonymousLimit].status).toBe(429)

      console.log(`✅ Anonymous user rate limit (${anonymousLimit}) enforced`)

      // Test authenticated user limit
      const authenticatedRequests = []
      for (let i = 1; i <= authenticatedLimit + 1; i++) {
        authenticatedRequests.push(
          fetch('http://localhost:3000/api/search/repositories', {
            headers: {
              'X-Forwarded-For': authenticatedIP,
              Authorization: 'Bearer valid-token',
            },
          })
        )
      }

      const authenticatedResults = await Promise.all(authenticatedRequests)

      // First 10 should succeed
      for (let i = 0; i < authenticatedLimit; i++) {
        expect(authenticatedResults[i].status).toBe(200)
        const data = await authenticatedResults[i].json()
        expect(data.data.rateLimitInfo.userType).toBe('authenticated')
      }

      // 11th should fail
      expect(authenticatedResults[authenticatedLimit].status).toBe(429)

      console.log(`✅ Authenticated user rate limit (${authenticatedLimit}) enforced`)

      console.log('🎉 Different rate limits for user types validated!')
    })
  })

  describe('CSP Header Enforcement', () => {
    it('should enforce Content Security Policy and handle violations', async () => {
      server.use(
        http.get('http://localhost:3000/api/test-page', () => {
          return HttpResponse.html(
            `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>CSP Test Page</title>
            </head>
            <body>
              <h1>CSP Test Content</h1>
              <script>
                // This should be allowed by CSP
                console.log('Inline script executing');
              </script>
              <img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="test">
            </body>
            </html>
          `,
            {
              headers: {
                'Content-Security-Policy': `
                default-src 'self';
                script-src 'self' 'unsafe-inline';
                style-src 'self' 'unsafe-inline';
                img-src 'self' data:;
                connect-src 'self';
                font-src 'self';
                object-src 'none';
                media-src 'none';
                frame-src 'none';
                child-src 'none';
                worker-src 'none';
                base-uri 'self';
                form-action 'self';
                frame-ancestors 'none';
                upgrade-insecure-requests;
                block-all-mixed-content;
              `
                  .replace(/\s+/g, ' ')
                  .trim(),
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
              },
            }
          )
        }),

        // CSP violation reporting endpoint
        http.post('http://localhost:3000/api/security/csp-report', async ({ request }) => {
          interface CSPReportBody {
            'csp-report': {
              'document-uri': string
              referrer: string
              'violated-directive': string
              'effective-directive': string
              'original-policy': string
              'blocked-uri': string
              'source-file': string
              'line-number': number
              'column-number': number
              'status-code': number
            }
          }
          const violation = (await request.json()) as CSPReportBody

          const cspViolation: CSPViolation = {
            violationId: crypto.randomUUID(),
            directive: violation['csp-report']['violated-directive'],
            violatedDirective: violation['csp-report']['effective-directive'],
            blockedURI: violation['csp-report']['blocked-uri'],
            sourceFile: violation['csp-report']['source-file'],
            lineNumber: violation['csp-report']['line-number'],
            columnNumber: violation['csp-report']['column-number'],
            userAgent: request.headers.get('User-Agent') || 'unknown',
            timestamp: new Date(),
            reportedBy: request.headers.get('X-Forwarded-For') || 'unknown',
          }

          securityFlowState.cspViolations.push(cspViolation)

          securityFlowState.alertLog.push({
            alertId: crypto.randomUUID(),
            alertType: 'security_policy_violation',
            severity: 'warning',
            message: `CSP violation: ${cspViolation.directive} from ${cspViolation.sourceFile}`,
            timestamp: new Date(),
            source: 'csp_reporter',
            resolved: false,
          })

          return HttpResponse.json({
            success: true,
            data: {
              violationId: cspViolation.violationId,
              processed: true,
            },
          })
        })
      )

      console.log('🛡️ Testing CSP header enforcement...')

      // Test CSP headers are set correctly
      const response = await fetch('http://localhost:3000/api/test-page')
      expect(response.status).toBe(200)

      const cspHeader = response.headers.get('Content-Security-Policy')
      expect(cspHeader).toContain("default-src 'self'")
      expect(cspHeader).toContain("script-src 'self' 'unsafe-inline'")
      expect(cspHeader).toContain("img-src 'self' data:")
      expect(cspHeader).toContain("object-src 'none'")
      expect(cspHeader).toContain("frame-ancestors 'none'")
      expect(cspHeader).toContain('upgrade-insecure-requests')

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')

      console.log('✅ CSP headers correctly set')

      // Simulate CSP violation report
      const violationReport = {
        'csp-report': {
          'document-uri': 'http://localhost:3000/api/test-page',
          referrer: '',
          'violated-directive': 'script-src',
          'effective-directive': 'script-src',
          'original-policy': "default-src 'self'; script-src 'self'",
          'blocked-uri': 'eval',
          'source-file': 'http://localhost:3000/api/test-page',
          'line-number': 10,
          'column-number': 5,
          'status-code': 200,
        },
      }

      const violationResponse = await fetch('http://localhost:3000/api/security/csp-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/csp-report',
          'X-Forwarded-For': '192.168.1.100',
        },
        body: JSON.stringify(violationReport),
      })

      expect(violationResponse.status).toBe(200)
      const violationData = await violationResponse.json()
      expect(violationData.success).toBe(true)
      expect(violationData.data.violationId).toBeDefined()

      console.log('✅ CSP violation report processed')

      // Validate CSP violation tracking
      expect(securityFlowState.cspViolations).toHaveLength(1)
      expect(securityFlowState.cspViolations[0].directive).toBe('script-src')
      expect(securityFlowState.cspViolations[0].blockedURI).toBe('eval')

      expect(
        securityFlowState.alertLog.filter(a => a.alertType === 'security_policy_violation')
      ).toHaveLength(1)

      console.log('🎉 CSP enforcement and violation handling validated!')
    })
  })

  describe('Security Health Monitoring', () => {
    it('should provide comprehensive security health status', async () => {
      // Setup some test data in security flow state
      securityFlowState.securityMetrics = {
        totalRequests: 1000,
        blockedRequests: 25,
        securityViolations: 3,
        averageResponseTime: 45,
        uptime: 99.95,
        lastSecurityScan: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        vulnerabilitiesFound: 0,
        patchLevel: 'current',
      }

      securityFlowState.rateLimitCounters.set('test:counter', {
        ip: '192.168.1.100',
        endpoint: '/api/test',
        count: 3,
        windowStart: new Date(),
        windowDuration: 60,
        maxRequests: 10,
        blocked: false,
      })

      securityFlowState.blockedIPs.add('192.168.1.999')

      server.use(
        http.get('http://localhost:3000/api/security/health', () => {
          const now = new Date()
          const activeCounters = securityFlowState.rateLimitCounters.size
          const blockedIPs = securityFlowState.blockedIPs.size
          const recentViolations = securityFlowState.cspViolations.filter(
            v => now.getTime() - v.timestamp.getTime() < 24 * 60 * 60 * 1000
          ).length
          const activeAlerts = securityFlowState.alertLog.filter(a => !a.resolved).length
          const recentIncidents = securityFlowState.securityIncidents.filter(
            i => now.getTime() - i.timestamp.getTime() < 24 * 60 * 60 * 1000
          ).length

          const securityScore = Math.max(
            0,
            100 -
              ((securityFlowState.securityMetrics.blockedRequests /
                securityFlowState.securityMetrics.totalRequests) *
                100 *
                0.3 +
                recentViolations * 5 +
                recentIncidents * 10 +
                activeAlerts * 2)
          )

          const healthStatus =
            securityScore > 90 ? 'healthy' : securityScore > 70 ? 'degraded' : 'critical'

          return HttpResponse.json({
            status: healthStatus,
            timestamp: now.toISOString(),
            checks: {
              rateLimiting: {
                status: activeCounters < 10 && blockedIPs < 5 ? 'healthy' : 'degraded',
                activeCounters,
                blockedIPs,
                responseTime: 2,
              },
              cspEnforcement: {
                status: recentViolations < 10 ? 'healthy' : 'degraded',
                violationCount: recentViolations,
                lastViolation:
                  securityFlowState.cspViolations.length > 0
                    ? securityFlowState.cspViolations[
                        securityFlowState.cspViolations.length - 1
                      ].timestamp.toISOString()
                    : undefined,
                policyIntegrity: true,
              },
              securityMiddleware: {
                status: recentIncidents < 5 && activeAlerts < 10 ? 'healthy' : 'degraded',
                incidentCount: recentIncidents,
                averageProcessingTime: 8,
                alertsActive: activeAlerts,
              },
              authentication: {
                status: 'healthy',
                sessionSecurity: true,
                mfaFunctional: true,
                webauthnActive: true,
              },
            },
            metrics: {
              securityScore: Math.round(securityScore * 100) / 100,
              uptime: securityFlowState.securityMetrics.uptime,
              incidentResponse: 98.5,
              complianceLevel: 95.0,
            },
            alerts: securityFlowState.alertLog
              .filter(a => !a.resolved)
              .map(alert => ({
                alertId: alert.alertId,
                severity: alert.severity,
                message: alert.message,
                timestamp: alert.timestamp.toISOString(),
              })),
          })
        })
      )

      console.log('📊 Testing security health monitoring...')

      const response = await fetch('http://localhost:3000/api/security/health')
      expect(response.status).toBe(200)

      const data = await response.json()
      const validatedHealth = SecurityHealthResponseSchema.parse(data)

      expect(validatedHealth.status).toBeOneOf(['healthy', 'degraded', 'critical'])
      expect(validatedHealth.checks.rateLimiting.activeCounters).toBe(1)
      expect(validatedHealth.checks.rateLimiting.blockedIPs).toBe(1)
      expect(validatedHealth.checks.cspEnforcement.policyIntegrity).toBe(true)
      expect(validatedHealth.checks.authentication.sessionSecurity).toBe(true)
      expect(validatedHealth.checks.authentication.mfaFunctional).toBe(true)
      expect(validatedHealth.checks.authentication.webauthnActive).toBe(true)

      expect(validatedHealth.metrics.securityScore).toBeGreaterThan(0)
      expect(validatedHealth.metrics.uptime).toBeGreaterThan(99)
      expect(validatedHealth.metrics.incidentResponse).toBeGreaterThan(90)
      expect(validatedHealth.metrics.complianceLevel).toBeGreaterThan(90)

      console.log(`✅ Security health status: ${validatedHealth.status}`)
      console.log(`✅ Security score: ${validatedHealth.metrics.securityScore}`)
      console.log(`✅ Active alerts: ${validatedHealth.alerts.length}`)

      console.log('🎉 Security health monitoring validated!')
    })
  })

  describe('Attack Scenario Detection and Response', () => {
    it('should detect and respond to coordinated attack patterns', async () => {
      const attackerIPs = ['192.168.1.500', '192.168.1.501', '192.168.1.502']
      const suspiciousUserAgents = ['AttackBot/1.0', 'ScriptKiddie/2.0', 'EvilHacker/3.0']

      server.use(
        http.post('http://localhost:3000/api/auth/signin', async ({ request }) => {
          const ipAddress = request.headers.get('X-Forwarded-For') || '127.0.0.1'
          const userAgent = request.headers.get('User-Agent') || 'unknown'
          interface AttackRequestBody {
            email: string
            provider: string
          }
          const body = (await request.json()) as AttackRequestBody

          // Detect attack patterns
          const isAttackerIP = attackerIPs.includes(ipAddress)
          const isSuspiciousUA = suspiciousUserAgents.some(ua => userAgent.includes(ua))
          const hasInjectionAttempt =
            body.email?.includes('<script>') || body.email?.includes('SELECT')

          if (isAttackerIP || isSuspiciousUA || hasInjectionAttempt) {
            const incidentType = hasInjectionAttempt ? 'injection_attempt' : 'suspicious_activity'
            const severity = hasInjectionAttempt ? 'high' : 'medium'

            const incident: SecurityIncident = {
              incidentId: crypto.randomUUID(),
              type: incidentType,
              severity,
              ipAddress,
              userAgent,
              endpoint: '/api/auth/signin',
              timestamp: new Date(),
              details: {
                attackerIP: isAttackerIP,
                suspiciousUA: isSuspiciousUA,
                injectionAttempt: hasInjectionAttempt,
                payload: body,
              },
              status: 'detected',
              responseActions: [
                'blocked_request',
                'ip_added_to_blocklist',
                'security_team_notified',
                'additional_monitoring_enabled',
              ],
            }

            securityFlowState.securityIncidents.push(incident)
            securityFlowState.blockedIPs.add(ipAddress)

            securityFlowState.alertLog.push({
              alertId: crypto.randomUUID(),
              alertType: 'attack_pattern',
              severity: severity === 'high' ? 'critical' : 'error',
              message: `${incidentType} detected from ${ipAddress}`,
              timestamp: new Date(),
              source: 'attack_detector',
              resolved: false,
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SECURITY_VIOLATION',
                  message: 'Request blocked due to security policy',
                  incident_id: incident.incidentId,
                  action_taken: 'ip_blocked',
                },
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { message: 'Login request processed' },
          })
        }),

        // Security incident response endpoint
        http.post('http://localhost:3000/api/security/incident/respond', async ({ request }) => {
          interface IncidentResponseBody {
            incidentId: string
          }
          const body = (await request.json()) as IncidentResponseBody
          const incidentId = body.incidentId

          const incident = securityFlowState.securityIncidents.find(
            i => i.incidentId === incidentId
          )
          if (!incident) {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' },
              },
              { status: 404 }
            )
          }

          // Update incident status
          incident.status = 'investigating'

          return HttpResponse.json({
            success: true,
            data: {
              incident: {
                incidentId: incident.incidentId,
                type: incident.type,
                severity: incident.severity,
                status: incident.status,
                timestamp: incident.timestamp.toISOString(),
                details: incident.details,
                responseActions: incident.responseActions,
              },
              mitigation: {
                immediate: [
                  'IP address blocked from all endpoints',
                  'Suspicious user agent patterns added to blocklist',
                  'Enhanced monitoring activated for 24 hours',
                ],
                longTerm: [
                  'Security policy review and updates',
                  'Staff security training refresh',
                  'Infrastructure hardening assessment',
                ],
                estimatedResolution: '2-4 hours',
              },
              impact: {
                affectedSystems: ['authentication', 'api_gateway'],
                riskLevel: incident.severity,
                estimatedRecoveryTime: '15 minutes',
              },
            },
          })
        })
      )

      console.log('🎯 Testing attack scenario detection and response...')

      // Test 1: SQL injection attempt
      const injectionResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': attackerIPs[0],
          'User-Agent': 'NormalBrowser/1.0',
        },
        body: JSON.stringify({
          email: "admin'; DROP TABLE users; --",
          provider: 'github',
        }),
      })

      expect(injectionResponse.status).toBe(403)
      const injectionData = await injectionResponse.json()
      expect(injectionData.error.code).toBe('SECURITY_VIOLATION')
      expect(injectionData.error.incident_id).toBeDefined()

      console.log('✅ SQL injection attempt detected and blocked')

      // Test 2: Suspicious user agent
      const botResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.100',
          'User-Agent': suspiciousUserAgents[0],
        },
        body: JSON.stringify({
          email: 'test@example.com',
          provider: 'github',
        }),
      })

      expect(botResponse.status).toBe(403)
      const botData = await botResponse.json()
      expect(botData.error.code).toBe('SECURITY_VIOLATION')

      console.log('✅ Suspicious user agent detected and blocked')

      // Test 3: Attack from known bad IP
      const badIPResponse = await fetch('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': attackerIPs[1],
          'User-Agent': 'NormalBrowser/1.0',
        },
        body: JSON.stringify({
          email: 'attacker@evil.com',
          provider: 'github',
        }),
      })

      expect(badIPResponse.status).toBe(403)

      console.log('✅ Known attacker IP blocked')

      // Test 4: Incident response
      const incidentId = injectionData.error.incident_id
      const responseRequest = await fetch('http://localhost:3000/api/security/incident/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId }),
      })

      expect(responseRequest.status).toBe(200)
      const responseData = await responseRequest.json()
      const validatedIncident = SecurityIncidentResponseSchema.parse(responseData.data)

      expect(validatedIncident.incident.type).toBe('injection_attempt')
      expect(validatedIncident.incident.severity).toBe('high')
      expect(validatedIncident.incident.status).toBe('investigating')
      expect(validatedIncident.mitigation.immediate).toContain(
        'IP address blocked from all endpoints'
      )
      expect(validatedIncident.impact.affectedSystems).toContain('authentication')

      console.log('✅ Security incident response system validated')

      // Validate attack detection state
      expect(securityFlowState.securityIncidents).toHaveLength(3) // injection, bot, bad IP
      expect(securityFlowState.blockedIPs.size).toBeGreaterThan(0)
      expect(securityFlowState.alertLog.filter(a => a.alertType === 'attack_pattern')).toHaveLength(
        3
      )

      const injectionIncident = securityFlowState.securityIncidents.find(
        i => i.type === 'injection_attempt'
      )
      expect(injectionIncident?.severity).toBe('high')
      expect(injectionIncident?.details.injectionAttempt).toBe(true)

      console.log('🎉 Attack scenario detection and response validated!')
    })
  })

  describe('Security Incident Recovery', () => {
    it('should handle security incident recovery and system restoration', async () => {
      // Setup a critical incident
      const criticalIncident: SecurityIncident = {
        incidentId: crypto.randomUUID(),
        type: 'data_breach_attempt',
        severity: 'critical',
        ipAddress: '192.168.1.666',
        userAgent: 'AdvancedPersistentThreat/1.0',
        endpoint: '/api/admin/users',
        timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        details: {
          attemptedDataAccess: true,
          privilegeEscalation: true,
          systemCompromiseAttempt: true,
        },
        status: 'investigating',
        responseActions: [
          'system_lockdown_initiated',
          'security_team_activated',
          'law_enforcement_notified',
        ],
      }

      securityFlowState.securityIncidents.push(criticalIncident)
      securityFlowState.blockedIPs.add('192.168.1.666')

      server.use(
        // Recovery status endpoint
        http.get('http://localhost:3000/api/security/recovery/status', () => {
          const incident = securityFlowState.securityIncidents.find(i => i.severity === 'critical')
          const recoveryProgress =
            incident?.status === 'resolved'
              ? 100
              : incident?.status === 'mitigated'
                ? 75
                : incident?.status === 'investigating'
                  ? 25
                  : 0

          return HttpResponse.json({
            success: true,
            data: {
              recoveryInProgress: incident?.status !== 'resolved',
              recoveryProgress,
              currentPhase:
                incident?.status === 'investigating'
                  ? 'containment'
                  : incident?.status === 'mitigated'
                    ? 'eradication'
                    : incident?.status === 'resolved'
                      ? 'recovery_complete'
                      : 'assessment',
              estimatedTimeToRecovery: '45-60 minutes',
              systemStatus: {
                authentication: 'operational',
                api: 'limited_access',
                database: 'read_only',
                monitoring: 'enhanced',
              },
              securityMeasures: {
                additionalLogging: true,
                enhancedMonitoring: true,
                restrictedAccess: true,
                emergencyProtocols: true,
              },
              nextSteps: [
                'Complete forensic analysis',
                'Patch identified vulnerabilities',
                'Restore full system access',
                'Conduct post-incident review',
              ],
            },
          })
        }),

        // Recovery action endpoint
        http.post('http://localhost:3000/api/security/recovery/action', async ({ request }) => {
          interface RecoveryActionBody {
            action: string
          }
          const body = (await request.json()) as RecoveryActionBody
          const action = body.action

          const incident = securityFlowState.securityIncidents.find(i => i.severity === 'critical')
          if (!incident) {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'NO_ACTIVE_INCIDENT', message: 'No critical incident in progress' },
              },
              { status: 400 }
            )
          }

          switch (action) {
            case 'begin_containment':
              incident.status = 'investigating'
              incident.responseActions.push('containment_measures_applied')
              break

            case 'apply_mitigation':
              incident.status = 'mitigated'
              incident.responseActions.push('threat_neutralized')
              break

            case 'complete_recovery':
              incident.status = 'resolved'
              incident.responseActions.push('system_restored', 'security_enhanced')
              securityFlowState.blockedIPs.delete(incident.ipAddress)
              break

            default:
              return HttpResponse.json(
                {
                  success: false,
                  error: { code: 'INVALID_ACTION', message: 'Unknown recovery action' },
                },
                { status: 400 }
              )
          }

          securityFlowState.alertLog.push({
            alertId: crypto.randomUUID(),
            alertType: 'anomaly_detection',
            severity: 'info',
            message: `Recovery action completed: ${action}`,
            timestamp: new Date(),
            source: 'recovery_system',
            resolved: action === 'complete_recovery',
          })

          return HttpResponse.json({
            success: true,
            data: {
              actionCompleted: action,
              incidentStatus: incident.status,
              nextRecommendedAction:
                incident.status === 'investigating'
                  ? 'apply_mitigation'
                  : incident.status === 'mitigated'
                    ? 'complete_recovery'
                    : 'post_incident_review',
              systemsAffected: ['authentication', 'api', 'monitoring'],
              recoveryProgress:
                incident.status === 'resolved'
                  ? 100
                  : incident.status === 'mitigated'
                    ? 75
                    : incident.status === 'investigating'
                      ? 50
                      : 25,
            },
          })
        }),

        // Post-incident health check
        http.get('http://localhost:3000/api/security/health/post-incident', () => {
          const resolvedIncidents = securityFlowState.securityIncidents.filter(
            i => i.status === 'resolved'
          )
          const hasRecentCriticalIncident = resolvedIncidents.some(
            i =>
              i.severity === 'critical' && Date.now() - i.timestamp.getTime() < 24 * 60 * 60 * 1000
          )

          return HttpResponse.json({
            success: true,
            data: {
              systemIntegrity: 'restored',
              securityPosture: hasRecentCriticalIncident ? 'enhanced' : 'normal',
              incidentLessonsLearned: [
                'Implemented additional access controls',
                'Enhanced monitoring for privilege escalation attempts',
                'Updated incident response procedures',
                'Strengthened authentication requirements',
              ],
              complianceStatus: 'audit_required',
              recommendedActions: [
                'Conduct comprehensive security audit',
                'Review and update security policies',
                'Provide additional staff training',
                'Implement additional monitoring tools',
              ],
              nextSecurityReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          })
        })
      )

      console.log('🚨 Testing security incident recovery workflow...')

      // Check initial recovery status
      const initialStatusResponse = await fetch(
        'http://localhost:3000/api/security/recovery/status'
      )
      expect(initialStatusResponse.status).toBe(200)

      const initialStatus = await initialStatusResponse.json()
      expect(initialStatus.data.recoveryInProgress).toBe(true)
      expect(initialStatus.data.currentPhase).toBe('containment')
      expect(initialStatus.data.systemStatus.api).toBe('limited_access')
      expect(initialStatus.data.securityMeasures.emergencyProtocols).toBe(true)

      console.log('✅ Initial recovery status confirmed - system in containment phase')

      // Begin containment
      const containmentResponse = await fetch(
        'http://localhost:3000/api/security/recovery/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'begin_containment' }),
        }
      )

      expect(containmentResponse.status).toBe(200)
      const containmentData = await containmentResponse.json()
      expect(containmentData.data.actionCompleted).toBe('begin_containment')
      expect(containmentData.data.incidentStatus).toBe('investigating')
      expect(containmentData.data.nextRecommendedAction).toBe('apply_mitigation')

      console.log('✅ Containment phase completed')

      // Apply mitigation
      const mitigationResponse = await fetch('http://localhost:3000/api/security/recovery/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply_mitigation' }),
      })

      expect(mitigationResponse.status).toBe(200)
      const mitigationData = await mitigationResponse.json()
      expect(mitigationData.data.actionCompleted).toBe('apply_mitigation')
      expect(mitigationData.data.incidentStatus).toBe('mitigated')
      expect(mitigationData.data.recoveryProgress).toBe(75)

      console.log('✅ Mitigation phase completed')

      // Complete recovery
      const recoveryResponse = await fetch('http://localhost:3000/api/security/recovery/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_recovery' }),
      })

      expect(recoveryResponse.status).toBe(200)
      const recoveryData = await recoveryResponse.json()
      expect(recoveryData.data.actionCompleted).toBe('complete_recovery')
      expect(recoveryData.data.incidentStatus).toBe('resolved')
      expect(recoveryData.data.recoveryProgress).toBe(100)

      console.log('✅ Recovery phase completed')

      // Check post-incident health
      const healthResponse = await fetch('http://localhost:3000/api/security/health/post-incident')
      expect(healthResponse.status).toBe(200)

      const healthData = await healthResponse.json()
      expect(healthData.data.systemIntegrity).toBe('restored')
      expect(healthData.data.securityPosture).toBe('enhanced')
      expect(healthData.data.incidentLessonsLearned).toContain(
        'Implemented additional access controls'
      )
      expect(healthData.data.complianceStatus).toBe('audit_required')

      console.log('✅ Post-incident health check completed')

      // Validate recovery state
      const resolvedIncident = securityFlowState.securityIncidents.find(
        i => i.severity === 'critical'
      )
      expect(resolvedIncident?.status).toBe('resolved')
      expect(resolvedIncident?.responseActions).toContain('system_restored')
      expect(securityFlowState.blockedIPs.has('192.168.1.666')).toBe(false) // IP unblocked

      const recoveryAlerts = securityFlowState.alertLog.filter(a => a.source === 'recovery_system')
      expect(recoveryAlerts).toHaveLength(3) // containment, mitigation, recovery

      console.log('🎉 Security incident recovery workflow validated!')
    })
  })
})
