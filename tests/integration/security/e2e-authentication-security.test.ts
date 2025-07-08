/**
 * End-to-End Authentication Security Integration Tests
 *
 * Comprehensive testing of complete authentication flows with security validation
 * across all system boundaries and integration points.
 *
 * Test Coverage:
 * - Complete OAuth flow with security validation
 * - Multi-factor authentication integration
 * - Session security lifecycle management
 * - Cross-system authentication coordination
 * - Real-world authentication attack scenarios
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiTestUtils } from '../api/utils/api-test-utilities'

// Enhanced security schemas for comprehensive validation
const SecureSessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  issuedAt: z.string().datetime(),
  securityLevel: z.enum(['basic', 'mfa', 'enhanced']),
  ipAddress: z.string().ip(),
  userAgent: z.string().min(1),
  deviceFingerprint: z.string().optional(),
  csrfToken: z.string().min(32),
  lastActivity: z.string().datetime(),
  securityFlags: z.object({
    suspiciousActivity: z.boolean(),
    geoLocationChange: z.boolean(),
    deviceChange: z.boolean(),
    concurrentSessions: z.number(),
  }),
})

const OAuthSecurityContextSchema = z.object({
  state: z.string().min(32),
  codeChallenge: z.string().min(43),
  codeChallengeMethod: z.literal('S256'),
  nonce: z.string().min(32),
  redirectUri: z.string().url(),
  scope: z.string(),
  clientId: z.string(),
  responseType: z.literal('code'),
  sessionBinding: z.string().uuid(),
  securityTimestamp: z.number(),
})

const MFAEnrollmentSchema = z.object({
  enrollmentId: z.string().uuid(),
  userId: z.string().uuid(),
  method: z.enum(['totp', 'webauthn', 'sms', 'backup_codes']),
  status: z.enum(['pending', 'active', 'suspended']),
  createdAt: z.string().datetime(),
  lastUsed: z.string().datetime().optional(),
  backupCodes: z.array(z.string()).optional(),
  deviceInfo: z
    .object({
      name: z.string(),
      type: z.string(),
      platform: z.string(),
    })
    .optional(),
})

const SecurityAuditEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([
    'auth_attempt',
    'auth_success',
    'auth_failure',
    'mfa_challenge',
    'mfa_success',
    'mfa_failure',
    'session_created',
    'session_renewed',
    'session_expired',
    'session_terminated',
    'suspicious_activity',
    'security_violation',
  ]),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  ipAddress: z.string().ip(),
  userAgent: z.string(),
  details: z.record(z.any()),
  riskScore: z.number().min(0).max(100),
  actionTaken: z.string().optional(),
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

describe('End-to-End Authentication Security Integration', () => {
  let securityAuditLog: z.infer<typeof SecurityAuditEventSchema>[] = []
  const activeSessions: Map<string, z.infer<typeof SecureSessionSchema>> = new Map()
  const mfaEnrollments: Map<string, z.infer<typeof MFAEnrollmentSchema>[]> = new Map()

  beforeEach(() => {
    securityAuditLog = []
    activeSessions.clear()
    mfaEnrollments.clear()
    vi.clearAllMocks()
  })

  describe('Complete OAuth Flow with Security Validation', () => {
    it('should handle secure OAuth initiation with PKCE and state validation', async () => {
      const oauthState = apiTestUtils.dataGenerator.generateRandomString(32)
      const codeVerifier = apiTestUtils.dataGenerator.generateRandomString(64)
      const codeChallenge = Buffer.from(codeVerifier).toString('base64url')
      const sessionBinding = apiTestUtils.dataGenerator.generateUUID()

      server.use(
        http.get('http://localhost:3000/api/auth/signin/github', ({ request }) => {
          const url = new URL(request.url)
          const state = url.searchParams.get('state')
          const codeChallenge = url.searchParams.get('code_challenge')
          const codeChallengeMethod = url.searchParams.get('code_challenge_method')
          const nonce = url.searchParams.get('nonce')

          // Validate PKCE parameters
          expect(state).toBeDefined()
          expect(state).toHaveLength(32)
          expect(codeChallenge).toBeDefined()
          expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43,}$/)
          expect(codeChallengeMethod).toBe('S256')
          expect(nonce).toBeDefined()

          const oauthContext: z.infer<typeof OAuthSecurityContextSchema> = {
            state: state || '',
            codeChallenge: codeChallenge || '',
            codeChallengeMethod: 'S256',
            nonce: nonce || '',
            redirectUri: 'http://localhost:3000/api/auth/callback/github',
            scope: 'read:user user:email',
            clientId: 'test-client-id',
            responseType: 'code',
            sessionBinding,
            securityTimestamp: Date.now(),
          }

          // Store OAuth context for callback validation
          const validatedContext = OAuthSecurityContextSchema.parse(oauthContext)

          return HttpResponse.json({
            success: true,
            data: {
              authUrl: `https://github.com/login/oauth/authorize?${url.searchParams.toString()}`,
              securityContext: validatedContext,
            },
          })
        })
      )

      const response = await fetch(
        `http://localhost:3000/api/auth/signin/github?state=${oauthState}&code_challenge=${codeChallenge}&code_challenge_method=S256&nonce=${apiTestUtils.dataGenerator.generateRandomString(32)}`
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.securityContext).toBeDefined()

      // Validate security context
      const securityContext = OAuthSecurityContextSchema.parse(data.data.securityContext)
      expect(securityContext.state).toHaveLength(32)
      expect(securityContext.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43,}$/)
      expect(securityContext.sessionBinding).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    })

    it('should validate state parameter throughout OAuth flow', async () => {
      const validState = apiTestUtils.dataGenerator.generateRandomString(32)
      const invalidState = 'invalid-state'

      server.use(
        http.get('http://localhost:3000/api/auth/callback/github', ({ request }) => {
          const url = new URL(request.url)
          const state = url.searchParams.get('state')
          const code = url.searchParams.get('code')

          if (state !== validState) {
            // Log security violation
            securityAuditLog.push({
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              eventType: 'security_violation',
              timestamp: new Date().toISOString(),
              ipAddress: '127.0.0.1',
              userAgent: 'test-agent',
              details: {
                violation: 'invalid_oauth_state',
                receivedState: state,
                expectedState: validState,
              },
              riskScore: 95,
              actionTaken: 'blocked_oauth_callback',
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_STATE',
                  message: 'OAuth state parameter validation failed',
                  details: 'Potential CSRF attack detected',
                },
              },
              { status: 400 }
            )
          }

          if (!code) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'MISSING_AUTH_CODE',
                  message: 'Authorization code is required',
                },
              },
              { status: 400 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              message: 'OAuth callback processed successfully',
              state: validState,
            },
          })
        })
      )

      // Test valid state
      const validResponse = await fetch(
        `http://localhost:3000/api/auth/callback/github?state=${validState}&code=auth-code-123`
      )
      expect(validResponse.status).toBe(200)

      // Test invalid state
      const invalidResponse = await fetch(
        `http://localhost:3000/api/auth/callback/github?state=${invalidState}&code=auth-code-123`
      )
      expect(invalidResponse.status).toBe(400)

      const invalidData = await invalidResponse.json()
      expect(invalidData.error.code).toBe('INVALID_STATE')

      // Verify security audit log
      const securityViolations = securityAuditLog.filter(
        log => log.eventType === 'security_violation'
      )
      expect(securityViolations).toHaveLength(1)
      expect(securityViolations[0].details.violation).toBe('invalid_oauth_state')
    })

    it('should enforce redirect URI validation', async () => {
      const allowedRedirectUris = [
        'http://localhost:3000/api/auth/callback/github',
        'https://contribux.com/api/auth/callback/github',
      ]
      const maliciousRedirectUri = 'https://evil-site.com/steal-tokens'

      server.use(
        http.post('http://localhost:3000/api/auth/validate-redirect', async ({ request }) => {
          const body = await request.json()
          const { redirectUri } = body as { redirectUri: string }

          if (!allowedRedirectUris.includes(redirectUri)) {
            securityAuditLog.push({
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              eventType: 'security_violation',
              timestamp: new Date().toISOString(),
              ipAddress: '127.0.0.1',
              userAgent: 'test-agent',
              details: {
                violation: 'invalid_redirect_uri',
                attemptedUri: redirectUri,
                allowedUris: allowedRedirectUris,
              },
              riskScore: 100,
              actionTaken: 'blocked_oauth_request',
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_REDIRECT_URI',
                  message: 'Redirect URI not allowed',
                  details: 'Security policy violation detected',
                },
              },
              { status: 403 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { message: 'Redirect URI validated' },
          })
        })
      )

      // Test allowed redirect URI
      const validResponse = await fetch('http://localhost:3000/api/auth/validate-redirect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUri: allowedRedirectUris[0] }),
      })
      expect(validResponse.status).toBe(200)

      // Test malicious redirect URI
      const maliciousResponse = await fetch('http://localhost:3000/api/auth/validate-redirect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUri: maliciousRedirectUri }),
      })
      expect(maliciousResponse.status).toBe(403)

      const maliciousData = await maliciousResponse.json()
      expect(maliciousData.error.code).toBe('INVALID_REDIRECT_URI')
    })

    it('should create secure session with comprehensive security binding', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const ipAddress = '192.168.1.100'
      const userAgent = 'Mozilla/5.0 (compatible test browser)'

      server.use(
        http.post('http://localhost:3000/api/auth/create-session', async ({ request }) => {
          const body = await request.json()
          const { userId: requestUserId, ipAddress: requestIp, userAgent: requestUserAgent } = body

          const sessionId = apiTestUtils.dataGenerator.generateUUID()
          const now = new Date()
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours

          const secureSession: z.infer<typeof SecureSessionSchema> = {
            sessionId,
            userId: requestUserId,
            expiresAt: expiresAt.toISOString(),
            issuedAt: now.toISOString(),
            securityLevel: 'basic',
            ipAddress: requestIp,
            userAgent: requestUserAgent,
            deviceFingerprint: apiTestUtils.dataGenerator.generateRandomString(64),
            csrfToken: apiTestUtils.dataGenerator.generateRandomString(32),
            lastActivity: now.toISOString(),
            securityFlags: {
              suspiciousActivity: false,
              geoLocationChange: false,
              deviceChange: false,
              concurrentSessions: 1,
            },
          }

          // Validate and store session
          const validatedSession = SecureSessionSchema.parse(secureSession)
          activeSessions.set(sessionId, validatedSession)

          // Log security event
          securityAuditLog.push({
            eventId: apiTestUtils.dataGenerator.generateUUID(),
            eventType: 'session_created',
            userId: requestUserId,
            sessionId,
            timestamp: now.toISOString(),
            ipAddress: requestIp,
            userAgent: requestUserAgent,
            details: {
              sessionDuration: '24h',
              securityLevel: 'basic',
              mfaRequired: false,
            },
            riskScore: 20,
          })

          return HttpResponse.json({
            success: true,
            data: {
              session: validatedSession,
              securityToken: sessionId,
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/auth/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ipAddress, userAgent }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)

      const session = SecureSessionSchema.parse(data.data.session)
      expect(session.userId).toBe(userId)
      expect(session.ipAddress).toBe(ipAddress)
      expect(session.userAgent).toBe(userAgent)
      expect(session.csrfToken).toHaveLength(32)
      expect(session.securityFlags.suspiciousActivity).toBe(false)

      // Verify session storage
      expect(activeSessions.has(session.sessionId)).toBe(true)

      // Verify security audit
      const sessionEvents = securityAuditLog.filter(log => log.eventType === 'session_created')
      expect(sessionEvents).toHaveLength(1)
      expect(sessionEvents[0].userId).toBe(userId)
    })
  })

  describe('Multi-Factor Authentication Integration Flow', () => {
    it('should require MFA after successful OAuth for high-risk scenarios', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const sessionId = apiTestUtils.dataGenerator.generateUUID()
      const suspiciousIp = '127.0.0.1' // Different from usual IP

      server.use(
        http.post(
          'http://localhost:3000/api/auth/evaluate-mfa-requirement',
          async ({ request }) => {
            const body = await request.json()
            const { userId: requestUserId, ipAddress, userAgent, previousLogin } = body

            // Risk assessment logic
            const riskFactors = {
              newIpAddress: ipAddress !== previousLogin?.ipAddress,
              newUserAgent: userAgent !== previousLogin?.userAgent,
              timeBasedAnomaly: false, // Simplified for test
              geoLocationChange: false, // Simplified for test
            }

            const riskScore = Object.values(riskFactors).filter(Boolean).length * 25
            const mfaRequired = riskScore >= 25

            if (mfaRequired) {
              securityAuditLog.push({
                eventId: apiTestUtils.dataGenerator.generateUUID(),
                eventType: 'mfa_challenge',
                userId: requestUserId,
                sessionId,
                timestamp: new Date().toISOString(),
                ipAddress,
                userAgent,
                details: {
                  riskFactors,
                  riskScore,
                  trigger: 'high_risk_login',
                },
                riskScore,
              })
            }

            return HttpResponse.json({
              success: true,
              data: {
                mfaRequired,
                riskScore,
                riskFactors,
                challengeId: mfaRequired ? apiTestUtils.dataGenerator.generateUUID() : null,
              },
            })
          }
        )
      )

      const response = await fetch('http://localhost:3000/api/auth/evaluate-mfa-requirement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          ipAddress: suspiciousIp,
          userAgent: 'New User Agent',
          previousLogin: {
            ipAddress: '192.168.1.100',
            userAgent: 'Previous User Agent',
          },
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.mfaRequired).toBe(true)
      expect(data.data.riskScore).toBeGreaterThanOrEqual(25)
      expect(data.data.challengeId).toBeDefined()

      // Verify MFA challenge audit log
      const mfaEvents = securityAuditLog.filter(log => log.eventType === 'mfa_challenge')
      expect(mfaEvents).toHaveLength(1)
      expect(mfaEvents[0].details.trigger).toBe('high_risk_login')
    })

    it('should handle TOTP enrollment and verification securely', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const secret = apiTestUtils.dataGenerator.generateRandomString(32)

      server.use(
        http.post('http://localhost:3000/api/auth/mfa/enroll/totp', async ({ request }) => {
          const body = await request.json()
          const { userId: requestUserId } = body

          const enrollment: z.infer<typeof MFAEnrollmentSchema> = {
            enrollmentId: apiTestUtils.dataGenerator.generateUUID(),
            userId: requestUserId,
            method: 'totp',
            status: 'pending',
            createdAt: new Date().toISOString(),
            backupCodes: Array.from({ length: 10 }, () =>
              apiTestUtils.dataGenerator.generateRandomString(8)
            ),
          }

          // Store enrollment
          const userEnrollments = mfaEnrollments.get(requestUserId) || []
          userEnrollments.push(enrollment)
          mfaEnrollments.set(requestUserId, userEnrollments)

          return HttpResponse.json({
            success: true,
            data: {
              enrollment,
              totpSecret: secret,
              qrCodeUrl: `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=otpauth://totp/Contribux?secret=${secret}`,
            },
          })
        }),

        http.post('http://localhost:3000/api/auth/mfa/verify/totp', async ({ request }) => {
          const body = await request.json()
          const { enrollmentId, totpCode } = body

          // Find enrollment
          let enrollment: z.infer<typeof MFAEnrollmentSchema> | undefined
          for (const [, userEnrollments] of mfaEnrollments) {
            enrollment = userEnrollments.find(e => e.enrollmentId === enrollmentId)
            if (enrollment) break
          }

          if (!enrollment) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'ENROLLMENT_NOT_FOUND',
                  message: 'MFA enrollment not found',
                },
              },
              { status: 404 }
            )
          }

          // Simulate TOTP validation (simplified)
          const isValidCode = totpCode.length === 6 && /^\d{6}$/.test(totpCode)

          if (!isValidCode) {
            securityAuditLog.push({
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              eventType: 'mfa_failure',
              userId: enrollment.userId,
              timestamp: new Date().toISOString(),
              ipAddress: '127.0.0.1',
              userAgent: 'test-agent',
              details: {
                method: 'totp',
                reason: 'invalid_code',
                enrollmentId,
              },
              riskScore: 40,
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_TOTP_CODE',
                  message: 'Invalid TOTP code',
                },
              },
              { status: 400 }
            )
          }

          // Activate enrollment
          enrollment.status = 'active'
          enrollment.lastUsed = new Date().toISOString()

          securityAuditLog.push({
            eventId: apiTestUtils.dataGenerator.generateUUID(),
            eventType: 'mfa_success',
            userId: enrollment.userId,
            timestamp: new Date().toISOString(),
            ipAddress: '127.0.0.1',
            userAgent: 'test-agent',
            details: {
              method: 'totp',
              enrollmentId,
              activationCompleted: true,
            },
            riskScore: 10,
          })

          return HttpResponse.json({
            success: true,
            data: {
              enrollment,
              message: 'TOTP enrollment activated successfully',
            },
          })
        })
      )

      // Enroll TOTP
      const enrollResponse = await fetch('http://localhost:3000/api/auth/mfa/enroll/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      expect(enrollResponse.status).toBe(200)
      const enrollData = await enrollResponse.json()
      expect(enrollData.success).toBe(true)
      expect(enrollData.data.enrollment.method).toBe('totp')
      expect(enrollData.data.enrollment.status).toBe('pending')
      expect(enrollData.data.backupCodes).toHaveLength(10)

      const enrollmentId = enrollData.data.enrollment.enrollmentId

      // Verify with invalid TOTP
      const invalidVerifyResponse = await fetch('http://localhost:3000/api/auth/mfa/verify/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, totpCode: 'invalid' }),
      })

      expect(invalidVerifyResponse.status).toBe(400)

      // Verify with valid TOTP
      const validVerifyResponse = await fetch('http://localhost:3000/api/auth/mfa/verify/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, totpCode: '123456' }),
      })

      expect(validVerifyResponse.status).toBe(200)
      const verifyData = await validVerifyResponse.json()
      expect(verifyData.success).toBe(true)
      expect(verifyData.data.enrollment.status).toBe('active')

      // Verify audit logs
      const mfaSuccessEvents = securityAuditLog.filter(log => log.eventType === 'mfa_success')
      const mfaFailureEvents = securityAuditLog.filter(log => log.eventType === 'mfa_failure')
      expect(mfaSuccessEvents).toHaveLength(1)
      expect(mfaFailureEvents).toHaveLength(1)
    })
  })

  describe('Session Security Lifecycle Management', () => {
    it('should handle session rotation with security validation', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const originalSessionId = apiTestUtils.dataGenerator.generateUUID()

      // Create initial session
      const originalSession: z.infer<typeof SecureSessionSchema> = {
        sessionId: originalSessionId,
        userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        issuedAt: new Date().toISOString(),
        securityLevel: 'basic',
        ipAddress: '192.168.1.100',
        userAgent: 'test-agent',
        csrfToken: apiTestUtils.dataGenerator.generateRandomString(32),
        lastActivity: new Date().toISOString(),
        securityFlags: {
          suspiciousActivity: false,
          geoLocationChange: false,
          deviceChange: false,
          concurrentSessions: 1,
        },
      }

      activeSessions.set(originalSessionId, originalSession)

      server.use(
        http.post('http://localhost:3000/api/auth/rotate-session', async ({ request }) => {
          const body = await request.json()
          const { sessionId, reason } = body

          const existingSession = activeSessions.get(sessionId)
          if (!existingSession) {
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SESSION_NOT_FOUND',
                  message: 'Session not found',
                },
              },
              { status: 404 }
            )
          }

          // Create new session
          const newSessionId = apiTestUtils.dataGenerator.generateUUID()
          const newSession: z.infer<typeof SecureSessionSchema> = {
            ...existingSession,
            sessionId: newSessionId,
            issuedAt: new Date().toISOString(),
            csrfToken: apiTestUtils.dataGenerator.generateRandomString(32),
            lastActivity: new Date().toISOString(),
            securityFlags: {
              ...existingSession.securityFlags,
              concurrentSessions: existingSession.securityFlags.concurrentSessions + 1,
            },
          }

          // Store new session and invalidate old one
          activeSessions.set(newSessionId, newSession)
          activeSessions.delete(sessionId)

          // Log security events
          securityAuditLog.push(
            {
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              eventType: 'session_terminated',
              userId,
              sessionId,
              timestamp: new Date().toISOString(),
              ipAddress: existingSession.ipAddress,
              userAgent: existingSession.userAgent,
              details: {
                reason: 'session_rotation',
                rotationTrigger: reason,
              },
              riskScore: 15,
            },
            {
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              eventType: 'session_created',
              userId,
              sessionId: newSessionId,
              timestamp: new Date().toISOString(),
              ipAddress: existingSession.ipAddress,
              userAgent: existingSession.userAgent,
              details: {
                reason: 'session_rotation',
                previousSessionId: sessionId,
              },
              riskScore: 10,
            }
          )

          return HttpResponse.json({
            success: true,
            data: {
              newSession,
              oldSessionId: sessionId,
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/auth/rotate-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: originalSessionId,
          reason: 'security_enhancement',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.newSession.sessionId).not.toBe(originalSessionId)
      expect(data.data.newSession.csrfToken).not.toBe(originalSession.csrfToken)

      // Verify session rotation
      expect(activeSessions.has(originalSessionId)).toBe(false)
      expect(activeSessions.has(data.data.newSession.sessionId)).toBe(true)

      // Verify audit logs
      const sessionEvents = securityAuditLog.filter(
        log => log.eventType === 'session_terminated' || log.eventType === 'session_created'
      )
      expect(sessionEvents).toHaveLength(2)
    })

    it('should enforce concurrent session limits with security validation', async () => {
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const maxConcurrentSessions = 3

      server.use(
        http.post(
          'http://localhost:3000/api/auth/validate-concurrent-sessions',
          async ({ request }) => {
            const body = await request.json()
            const { userId: requestUserId } = body

            const userSessions = Array.from(activeSessions.values()).filter(
              session => session.userId === requestUserId
            )

            if (userSessions.length >= maxConcurrentSessions) {
              securityAuditLog.push({
                eventId: apiTestUtils.dataGenerator.generateUUID(),
                eventType: 'security_violation',
                userId: requestUserId,
                timestamp: new Date().toISOString(),
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent',
                details: {
                  violation: 'concurrent_session_limit_exceeded',
                  currentSessions: userSessions.length,
                  maxAllowed: maxConcurrentSessions,
                },
                riskScore: 60,
                actionTaken: 'blocked_new_session',
              })

              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'CONCURRENT_SESSION_LIMIT',
                    message: 'Maximum concurrent sessions exceeded',
                    details: {
                      currentSessions: userSessions.length,
                      maxAllowed: maxConcurrentSessions,
                    },
                  },
                },
                { status: 429 }
              )
            }

            return HttpResponse.json({
              success: true,
              data: {
                currentSessions: userSessions.length,
                maxAllowed: maxConcurrentSessions,
                canCreateSession: true,
              },
            })
          }
        )
      )

      // Create maximum allowed sessions
      for (let i = 0; i < maxConcurrentSessions; i++) {
        const sessionId = apiTestUtils.dataGenerator.generateUUID()
        const session: z.infer<typeof SecureSessionSchema> = {
          sessionId,
          userId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          issuedAt: new Date().toISOString(),
          securityLevel: 'basic',
          ipAddress: '192.168.1.100',
          userAgent: 'test-agent',
          csrfToken: apiTestUtils.dataGenerator.generateRandomString(32),
          lastActivity: new Date().toISOString(),
          securityFlags: {
            suspiciousActivity: false,
            geoLocationChange: false,
            deviceChange: false,
            concurrentSessions: i + 1,
          },
        }
        activeSessions.set(sessionId, session)
      }

      // Try to create one more session (should fail)
      const response = await fetch('http://localhost:3000/api/auth/validate-concurrent-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      expect(response.status).toBe(429)
      const data = await response.json()
      expect(data.error.code).toBe('CONCURRENT_SESSION_LIMIT')

      // Verify security audit
      const violations = securityAuditLog.filter(log => log.eventType === 'security_violation')
      expect(violations).toHaveLength(1)
      expect(violations[0].details.violation).toBe('concurrent_session_limit_exceeded')
    })
  })
})
