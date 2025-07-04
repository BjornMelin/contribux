/**
 * Complete Authentication Flow Integration Tests
 *
 * End-to-end testing of complete authentication user journeys from initial OAuth
 * through WebAuthn registration, session management, and security validation.
 *
 * Test Coverage:
 * - Complete new user registration flow (OAuth → WebAuthn → Session)
 * - Returning user authentication flow (WebAuthn → Session restoration)
 * - Multi-provider account linking and management
 * - Session security lifecycle and rotation
 * - Cross-component authentication state consistency
 * - Error recovery and security incident handling
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Authentication flow state management
interface AuthFlowState {
  oauthSessions: Map<string, OAuthSession>
  userSessions: Map<string, UserSession>
  webauthnCredentials: Map<string, WebAuthnCredential[]>
  auditEvents: SecurityAuditEvent[]
  rateLimitCounters: Map<string, number>
}

interface OAuthSession {
  state: string
  codeVerifier: string
  provider: 'github' | 'google'
  userId?: string
  expiresAt: Date
  securityFlags: {
    ipAddress: string
    userAgent: string
    suspiciousActivity: boolean
  }
}

interface UserSession {
  sessionId: string
  userId: string
  sessionToken: string
  csrfToken: string
  expiresAt: Date
  securityLevel: 'basic' | 'mfa' | 'enhanced'
  providers: string[]
  ipAddress: string
  userAgent: string
  lastActivity: Date
  securityFlags: {
    deviceChange: boolean
    locationChange: boolean
    concurrentSessions: number
  }
}

interface WebAuthnCredential {
  credentialId: string
  userId: string
  publicKey: string
  counter: number
  deviceName: string
  createdAt: Date
  lastUsed?: Date
  aaguid: string
  transports: string[]
}

// Type for security audit event details
interface SecurityAuditEventDetails {
  provider?: string
  credentialId?: string
  deviceName?: string
  securityLevel?: string
  riskFactors?: string[]
  errorType?: string
  errorMessage?: string
  [key: string]: string | string[] | number | boolean | undefined
}

interface SecurityAuditEvent {
  eventId: string
  eventType:
    | 'oauth_start'
    | 'oauth_complete'
    | 'webauthn_register'
    | 'webauthn_auth'
    | 'session_create'
    | 'session_rotate'
    | 'security_violation'
  userId?: string
  sessionId?: string
  timestamp: Date
  ipAddress: string
  userAgent: string
  details: SecurityAuditEventDetails
  riskScore: number
  actionTaken?: string
}

// Request body interfaces for HTTP handlers
interface WebAuthnRegisterVerifyRequest {
  id: string
  rawId: string
  type: string
  response: {
    attestationObject: string
    clientDataJSON: string
  }
  authenticatorAttachment?: string
  getClientExtensionResults?: Record<string, unknown>
}

interface WebAuthnAuthenticateVerifyRequest {
  id: string
  rawId: string
  type: string
  response: {
    authenticatorData: string
    clientDataJSON: string
    signature: string
    userHandle?: string
  }
  credentialId: string
}

interface LinkProviderRequest {
  provider: string
  accessToken?: string
  idToken?: string
  code?: string
  state?: string
}

interface SetPrimaryProviderRequest {
  provider: string
}

interface SessionRotateRequest {
  currentSessionId: string
  reason?: string
  deviceFingerprint?: string
}

interface ProviderInfo {
  provider: string
  isPrimary: boolean
  linkedAt: string
}

interface GenericRequestBody {
  [key: string]: unknown
}

// Schemas for validation
const CompleteUserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  username: z.string(),
  emailVerified: z.boolean(),
  providers: z.array(
    z.object({
      provider: z.enum(['github', 'google']),
      accountId: z.string(),
      connectedAt: z.string().datetime(),
      isPrimary: z.boolean(),
      metadata: z.record(z.any()),
    })
  ),
  webauthnCredentials: z.array(
    z.object({
      credentialId: z.string(),
      deviceName: z.string(),
      createdAt: z.string().datetime(),
      lastUsed: z.string().datetime().optional(),
    })
  ),
  securitySettings: z.object({
    mfaEnabled: z.boolean(),
    securityLevel: z.enum(['basic', 'mfa', 'enhanced']),
    lastSecurityReview: z.string().datetime(),
    suspiciousActivityCount: z.number(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const _AuthenticationJourneySchema = z.object({
  journeyId: z.string().uuid(),
  userId: z.string().uuid(),
  stages: z.array(
    z.object({
      stage: z.enum([
        'oauth_initiation',
        'oauth_callback',
        'webauthn_register',
        'webauthn_auth',
        'session_create',
        'session_validate',
      ]),
      status: z.enum(['pending', 'completed', 'failed']),
      timestamp: z.string().datetime(),
      duration: z.number(),
      securityScore: z.number(),
      errors: z.array(z.string()).optional(),
    })
  ),
  overallStatus: z.enum(['in_progress', 'completed', 'failed', 'abandoned']),
  securityFlags: z.object({
    riskScore: z.number(),
    anomaliesDetected: z.array(z.string()),
    securityActionsRequired: z.array(z.string()),
  }),
  completedAt: z.string().datetime().optional(),
})

// Test setup
const server = setupServer()
const authFlowState: AuthFlowState = {
  oauthSessions: new Map(),
  userSessions: new Map(),
  webauthnCredentials: new Map(),
  auditEvents: [],
  rateLimitCounters: new Map(),
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  // Clear state but keep some data for cross-test consistency
  authFlowState.auditEvents = []
  authFlowState.rateLimitCounters.clear()
})
afterAll(() => server.close())

describe('Complete Authentication Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('New User Registration Journey', () => {
    it('should complete full new user flow: OAuth → WebAuthn → Session', async () => {
      const journeyId = crypto.randomUUID()
      const ipAddress = '192.168.1.100'
      const userAgent = 'Mozilla/5.0 (compatible test browser)'
      let currentUserId: string

      // Stage 1: OAuth Initiation
      server.use(
        http.get('http://localhost:3000/api/auth/signin/github', ({ request }) => {
          const _url = new URL(request.url)
          const state = crypto.randomUUID()
          const codeVerifier = crypto.randomUUID()

          const oauthSession: OAuthSession = {
            state,
            codeVerifier,
            provider: 'github',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
            securityFlags: {
              ipAddress,
              userAgent,
              suspiciousActivity: false,
            },
          }

          authFlowState.oauthSessions.set(state, oauthSession)

          authFlowState.auditEvents.push({
            eventId: crypto.randomUUID(),
            eventType: 'oauth_start',
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: {
              provider: 'github',
              state,
              journeyId,
            },
            riskScore: 10,
          })

          return HttpResponse.json({
            success: true,
            data: {
              authUrl: `https://github.com/login/oauth/authorize?state=${state}&code_challenge=${codeVerifier}`,
              state,
              journeyId,
            },
          })
        }),

        // Stage 2: OAuth Callback and User Creation
        http.get('http://localhost:3000/api/auth/callback/github', ({ request }) => {
          const url = new URL(request.url)
          const state = url.searchParams.get('state')
          const code = url.searchParams.get('code')

          const oauthSession = state ? authFlowState.oauthSessions.get(state) : null

          if (!oauthSession || !code) {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INVALID_OAUTH_CALLBACK', message: 'Invalid OAuth state or code' },
              },
              { status: 400 }
            )
          }

          // Create new user
          currentUserId = crypto.randomUUID()
          oauthSession.userId = currentUserId

          authFlowState.auditEvents.push({
            eventId: crypto.randomUUID(),
            eventType: 'oauth_complete',
            userId: currentUserId,
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: {
              provider: 'github',
              newUser: true,
              journeyId,
            },
            riskScore: 15,
          })

          return HttpResponse.json({
            success: true,
            data: {
              user: {
                id: currentUserId,
                email: 'newuser@example.com',
                name: 'New User',
                isNewUser: true,
                requiresWebAuthn: true,
              },
              journeyId,
              nextStep: 'webauthn_registration',
            },
          })
        }),

        // Stage 3: WebAuthn Registration Options
        http.post('http://localhost:3000/api/security/webauthn/register/options', ({ request }) => {
          const challenge = crypto.randomUUID()

          return HttpResponse.json({
            success: true,
            data: {
              challenge,
              rp: { name: 'Contribux', id: 'localhost' },
              user: {
                id: currentUserId,
                name: 'newuser@example.com',
                displayName: 'New User',
              },
              pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
              authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
              },
              timeout: 60000,
            },
          })
        }),

        // Stage 4: WebAuthn Registration Verification
        http.post(
          'http://localhost:3000/api/security/webauthn/register/verify',
          async ({ request }) => {
            const body = (await request.json()) as WebAuthnRegisterVerifyRequest
            const credentialId = crypto.randomUUID()

            const credential: WebAuthnCredential = {
              credentialId,
              userId: currentUserId,
              publicKey: 'mock-public-key',
              counter: 0,
              deviceName: body.deviceName || 'Unknown Device',
              createdAt: new Date(),
              aaguid: 'mock-aaguid',
              transports: ['internal'],
            }

            const userCredentials = authFlowState.webauthnCredentials.get(currentUserId) || []
            userCredentials.push(credential)
            authFlowState.webauthnCredentials.set(currentUserId, userCredentials)

            authFlowState.auditEvents.push({
              eventId: crypto.randomUUID(),
              eventType: 'webauthn_register',
              userId: currentUserId,
              timestamp: new Date(),
              ipAddress,
              userAgent,
              details: {
                credentialId,
                deviceName: credential.deviceName,
                journeyId,
              },
              riskScore: 5,
            })

            return HttpResponse.json({
              success: true,
              data: {
                credentialId,
                verified: true,
                journeyId,
                nextStep: 'session_creation',
              },
            })
          }
        ),

        // Stage 5: Session Creation
        http.post('http://localhost:3000/api/auth/session/create', async ({ request }) => {
          const sessionId = crypto.randomUUID()
          const sessionToken = crypto.randomUUID()
          const csrfToken = crypto.randomUUID()

          const userSession: UserSession = {
            sessionId,
            userId: currentUserId,
            sessionToken,
            csrfToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            securityLevel: 'mfa',
            providers: ['github'],
            ipAddress,
            userAgent,
            lastActivity: new Date(),
            securityFlags: {
              deviceChange: false,
              locationChange: false,
              concurrentSessions: 1,
            },
          }

          authFlowState.userSessions.set(sessionId, userSession)

          authFlowState.auditEvents.push({
            eventId: crypto.randomUUID(),
            eventType: 'session_create',
            userId: currentUserId,
            sessionId,
            timestamp: new Date(),
            ipAddress,
            userAgent,
            details: {
              securityLevel: 'mfa',
              providers: ['github'],
              journeyId,
            },
            riskScore: 8,
          })

          return HttpResponse.json({
            success: true,
            data: {
              sessionId,
              sessionToken,
              csrfToken,
              user: {
                id: currentUserId,
                email: 'newuser@example.com',
                name: 'New User',
                securityLevel: 'mfa',
                providers: ['github'],
              },
              journeyId,
              journeyComplete: true,
            },
          })
        })
      )

      // Execute the complete journey
      console.log('🚀 Starting new user registration journey...')

      // Step 1: Initiate OAuth
      const oauthResponse = await fetch('http://localhost:3000/api/auth/signin/github')
      expect(oauthResponse.status).toBe(200)
      const oauthData = await oauthResponse.json()
      expect(oauthData.success).toBe(true)
      expect(oauthData.data.state).toBeDefined()

      console.log('✅ OAuth initiation successful')

      // Step 2: Complete OAuth callback
      const callbackResponse = await fetch(
        `http://localhost:3000/api/auth/callback/github?state=${oauthData.data.state}&code=test_auth_code`
      )
      expect(callbackResponse.status).toBe(200)
      const callbackData = await callbackResponse.json()
      expect(callbackData.success).toBe(true)
      expect(callbackData.data.user.isNewUser).toBe(true)
      expect(callbackData.data.nextStep).toBe('webauthn_registration')

      console.log('✅ OAuth callback and user creation successful')

      // Step 3: Get WebAuthn registration options
      const webauthnOptionsResponse = await fetch(
        'http://localhost:3000/api/security/webauthn/register/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: callbackData.data.user.id }),
        }
      )
      expect(webauthnOptionsResponse.status).toBe(200)
      const webauthnOptionsData = await webauthnOptionsResponse.json()
      expect(webauthnOptionsData.success).toBe(true)
      expect(webauthnOptionsData.data.challenge).toBeDefined()

      console.log('✅ WebAuthn registration options generated')

      // Step 4: Complete WebAuthn registration
      const webauthnVerifyResponse = await fetch(
        'http://localhost:3000/api/security/webauthn/register/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credential: { id: 'test-credential-id', rawId: 'test-raw-id' },
            deviceName: 'Test Device',
          }),
        }
      )
      expect(webauthnVerifyResponse.status).toBe(200)
      const webauthnVerifyData = await webauthnVerifyResponse.json()
      expect(webauthnVerifyData.success).toBe(true)
      expect(webauthnVerifyData.data.verified).toBe(true)
      expect(webauthnVerifyData.data.nextStep).toBe('session_creation')

      console.log('✅ WebAuthn registration verified')

      // Step 5: Create authenticated session
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: callbackData.data.user.id }),
      })
      expect(sessionResponse.status).toBe(200)
      const sessionData = await sessionResponse.json()
      expect(sessionData.success).toBe(true)
      expect(sessionData.data.journeyComplete).toBe(true)
      expect(sessionData.data.user.securityLevel).toBe('mfa')

      console.log('✅ Authenticated session created - Journey complete!')

      // Validate journey consistency
      expect(sessionData.data.journeyId).toBe(oauthData.data.journeyId)
      expect(authFlowState.auditEvents).toHaveLength(5) // oauth_start, oauth_complete, webauthn_register, session_create
      expect(authFlowState.userSessions.size).toBe(1)
      expect(authFlowState.webauthnCredentials.get(currentUserId!)).toHaveLength(1)

      // Validate security audit trail
      const auditEvents = authFlowState.auditEvents
      expect(auditEvents[0].eventType).toBe('oauth_start')
      expect(auditEvents[1].eventType).toBe('oauth_complete')
      expect(auditEvents[2].eventType).toBe('webauthn_register')
      expect(auditEvents[3].eventType).toBe('session_create')

      // Validate overall risk score is acceptable
      const totalRiskScore = auditEvents.reduce((sum, event) => sum + event.riskScore, 0)
      expect(totalRiskScore).toBeLessThan(50) // Reasonable for new user registration

      console.log(`🎉 Complete new user journey successful with risk score: ${totalRiskScore}`)
    })

    it('should handle registration errors and provide recovery paths', async () => {
      const journeyId = crypto.randomUUID()
      let failureCount = 0

      server.use(
        http.post(
          'http://localhost:3000/api/security/webauthn/register/verify',
          async ({ request }) => {
            failureCount++

            if (failureCount <= 2) {
              authFlowState.auditEvents.push({
                eventId: crypto.randomUUID(),
                eventType: 'security_violation',
                userId: 'test-user-id',
                timestamp: new Date(),
                ipAddress: '192.168.1.100',
                userAgent: 'test-agent',
                details: {
                  error: 'webauthn_registration_failed',
                  attempt: failureCount,
                  journeyId,
                },
                riskScore: 25,
                actionTaken: 'retry_available',
              })

              return HttpResponse.json(
                {
                  success: false,
                  error: {
                    code: 'WEBAUTHN_VERIFICATION_FAILED',
                    message: 'WebAuthn credential verification failed',
                    retryable: true,
                    attemptsRemaining: 3 - failureCount,
                  },
                  journeyId,
                },
                { status: 400 }
              )
            }

            // Success on third attempt
            return HttpResponse.json({
              success: true,
              data: {
                credentialId: crypto.randomUUID(),
                verified: true,
                journeyId,
                recoveryInfo: {
                  previousFailures: failureCount - 1,
                  securityReviewRequired: true,
                },
              },
            })
          }
        )
      )

      // Attempt 1: Fail
      const attempt1 = await fetch('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: { id: 'invalid' } }),
      })
      expect(attempt1.status).toBe(400)
      const attempt1Data = await attempt1.json()
      expect(attempt1Data.error.retryable).toBe(true)
      expect(attempt1Data.error.attemptsRemaining).toBe(2)

      // Attempt 2: Fail
      const attempt2 = await fetch('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: { id: 'invalid2' } }),
      })
      expect(attempt2.status).toBe(400)
      const attempt2Data = await attempt2.json()
      expect(attempt2Data.error.attemptsRemaining).toBe(1)

      // Attempt 3: Success
      const attempt3 = await fetch('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: { id: 'valid' } }),
      })
      expect(attempt3.status).toBe(200)
      const attempt3Data = await attempt3.json()
      expect(attempt3Data.success).toBe(true)
      expect(attempt3Data.data.recoveryInfo.previousFailures).toBe(2)
      expect(attempt3Data.data.recoveryInfo.securityReviewRequired).toBe(true)

      // Verify audit trail shows security events
      const securityViolations = authFlowState.auditEvents.filter(
        event => event.eventType === 'security_violation'
      )
      expect(securityViolations).toHaveLength(2)
      expect(
        securityViolations.every(event => event.details.error === 'webauthn_registration_failed')
      ).toBe(true)
    })
  })

  describe('Returning User Authentication Journey', () => {
    it('should complete returning user flow: WebAuthn → Session restoration', async () => {
      const userId = crypto.randomUUID()
      const existingCredentialId = crypto.randomUUID()

      // Setup existing user with WebAuthn credential
      authFlowState.webauthnCredentials.set(userId, [
        {
          credentialId: existingCredentialId,
          userId,
          publicKey: 'existing-public-key',
          counter: 5,
          deviceName: 'Trusted Device',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          aaguid: 'trusted-aaguid',
          transports: ['internal'],
        },
      ])

      server.use(
        // WebAuthn Authentication Options
        http.post(
          'http://localhost:3000/api/security/webauthn/authenticate/options',
          ({ request }) => {
            const challenge = crypto.randomUUID()

            return HttpResponse.json({
              success: true,
              data: {
                challenge,
                rpId: 'localhost',
                allowCredentials: [
                  {
                    id: existingCredentialId,
                    type: 'public-key',
                    transports: ['internal'],
                  },
                ],
                userVerification: 'required',
                timeout: 60000,
              },
            })
          }
        ),

        // WebAuthn Authentication Verification
        http.post(
          'http://localhost:3000/api/security/webauthn/authenticate/verify',
          async ({ request }) => {
            const body = (await request.json()) as WebAuthnAuthenticateVerifyRequest

            if (body.credentialId !== existingCredentialId) {
              return HttpResponse.json(
                {
                  success: false,
                  error: { code: 'INVALID_CREDENTIAL', message: 'Credential not recognized' },
                },
                { status: 401 }
              )
            }

            // Update credential counter and last used
            const credentials = authFlowState.webauthnCredentials.get(userId)!
            credentials[0].counter++
            credentials[0].lastUsed = new Date()

            authFlowState.auditEvents.push({
              eventId: crypto.randomUUID(),
              eventType: 'webauthn_auth',
              userId,
              timestamp: new Date(),
              ipAddress: '192.168.1.100',
              userAgent: 'Mozilla/5.0 (compatible test browser)',
              details: {
                credentialId: existingCredentialId,
                deviceName: 'Trusted Device',
                newCounter: credentials[0].counter,
              },
              riskScore: 5,
            })

            return HttpResponse.json({
              success: true,
              data: {
                userId,
                verified: true,
                user: {
                  id: userId,
                  email: 'returning@example.com',
                  name: 'Returning User',
                  securityLevel: 'mfa',
                  providers: ['github', 'google'],
                  lastLogin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                },
                sessionRequired: true,
              },
            })
          }
        ),

        // Session Restoration
        http.post('http://localhost:3000/api/auth/session/restore', async ({ request }) => {
          const _body = (await request.json()) as GenericRequestBody
          const sessionId = crypto.randomUUID()
          const sessionToken = crypto.randomUUID()

          const userSession: UserSession = {
            sessionId,
            userId,
            sessionToken,
            csrfToken: crypto.randomUUID(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            securityLevel: 'mfa',
            providers: ['github', 'google'],
            ipAddress: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (compatible test browser)',
            lastActivity: new Date(),
            securityFlags: {
              deviceChange: false,
              locationChange: false,
              concurrentSessions: 1,
            },
          }

          authFlowState.userSessions.set(sessionId, userSession)

          authFlowState.auditEvents.push({
            eventId: crypto.randomUUID(),
            eventType: 'session_create',
            userId,
            sessionId,
            timestamp: new Date(),
            ipAddress: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (compatible test browser)',
            details: {
              sessionType: 'restoration',
              securityLevel: 'mfa',
              returningUser: true,
            },
            riskScore: 3,
          })

          return HttpResponse.json({
            success: true,
            data: {
              sessionId,
              sessionToken,
              user: {
                id: userId,
                email: 'returning@example.com',
                name: 'Returning User',
                securityLevel: 'mfa',
                providers: ['github', 'google'],
                lastLogin: new Date().toISOString(),
              },
              restored: true,
            },
          })
        })
      )

      // Execute returning user journey
      console.log('🔄 Starting returning user authentication journey...')

      // Step 1: Get WebAuthn authentication options
      const optionsResponse = await fetch(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIdentifier: 'returning@example.com' }),
        }
      )
      expect(optionsResponse.status).toBe(200)
      const optionsData = await optionsResponse.json()
      expect(optionsData.success).toBe(true)
      expect(optionsData.data.allowCredentials[0].id).toBe(existingCredentialId)

      console.log('✅ WebAuthn authentication options retrieved')

      // Step 2: Verify WebAuthn authentication
      const verifyResponse = await fetch(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentialId: existingCredentialId,
            authenticatorData: 'mock-auth-data',
            signature: 'mock-signature',
          }),
        }
      )
      expect(verifyResponse.status).toBe(200)
      const verifyData = await verifyResponse.json()
      expect(verifyData.success).toBe(true)
      expect(verifyData.data.user.securityLevel).toBe('mfa')
      expect(verifyData.data.sessionRequired).toBe(true)

      console.log('✅ WebAuthn authentication verified')

      // Step 3: Restore user session
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: verifyData.data.userId }),
      })
      expect(sessionResponse.status).toBe(200)
      const sessionData = await sessionResponse.json()
      expect(sessionData.success).toBe(true)
      expect(sessionData.data.restored).toBe(true)
      expect(sessionData.data.user.providers).toEqual(['github', 'google'])

      console.log('✅ Session restored - Returning user journey complete!')

      // Validate journey state
      expect(authFlowState.auditEvents).toHaveLength(2) // webauthn_auth, session_create
      expect(authFlowState.userSessions.size).toBe(1)

      // Validate WebAuthn credential was updated
      const updatedCredentials = authFlowState.webauthnCredentials.get(userId)!
      expect(updatedCredentials[0].counter).toBe(6) // Incremented from 5
      expect(updatedCredentials[0].lastUsed).toBeDefined()

      // Validate low risk score for trusted user
      const totalRiskScore = authFlowState.auditEvents.reduce(
        (sum, event) => sum + event.riskScore,
        0
      )
      expect(totalRiskScore).toBeLessThan(15) // Very low for returning user

      console.log(`🎉 Returning user journey successful with risk score: ${totalRiskScore}`)
    })
  })

  describe('Multi-Provider Account Management', () => {
    it('should handle account linking and provider management across authentication states', async () => {
      const userId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()

      // Setup existing user session
      authFlowState.userSessions.set(sessionId, {
        sessionId,
        userId,
        sessionToken: 'existing-session-token',
        csrfToken: 'existing-csrf-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        securityLevel: 'mfa',
        providers: ['github'],
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (compatible test browser)',
        lastActivity: new Date(),
        securityFlags: {
          deviceChange: false,
          locationChange: false,
          concurrentSessions: 1,
        },
      })

      server.use(
        // Link additional provider
        http.post('http://localhost:3000/api/auth/link-provider', async ({ request }) => {
          const body = (await request.json()) as LinkProviderRequest
          const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '')

          if (sessionToken !== 'existing-session-token') {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INVALID_SESSION', message: 'Session required for account linking' },
              },
              { status: 401 }
            )
          }

          if (body.provider === 'google') {
            // Update user session to include new provider
            const userSession = authFlowState.userSessions.get(sessionId)!
            userSession.providers.push('google')
            userSession.lastActivity = new Date()

            authFlowState.auditEvents.push({
              eventId: crypto.randomUUID(),
              eventType: 'oauth_complete',
              userId,
              sessionId,
              timestamp: new Date(),
              ipAddress: '192.168.1.100',
              userAgent: 'Mozilla/5.0 (compatible test browser)',
              details: {
                action: 'account_linking',
                provider: 'google',
                existingProviders: ['github'],
              },
              riskScore: 10,
            })

            return HttpResponse.json({
              success: true,
              data: {
                provider: 'google',
                linked: true,
                user: {
                  id: userId,
                  providers: ['github', 'google'],
                  primaryProvider: 'github',
                },
              },
            })
          }

          return HttpResponse.json(
            {
              success: false,
              error: { code: 'UNSUPPORTED_PROVIDER', message: 'Provider not supported' },
            },
            { status: 400 }
          )
        }),

        // Set primary provider
        http.post('http://localhost:3000/api/auth/set-primary', async ({ request }) => {
          const body = (await request.json()) as SetPrimaryProviderRequest
          const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '')

          if (sessionToken !== 'existing-session-token') {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INVALID_SESSION', message: 'Session required' },
              },
              { status: 401 }
            )
          }

          const userSession = authFlowState.userSessions.get(sessionId)!
          if (!userSession.providers.includes(body.provider)) {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'PROVIDER_NOT_LINKED', message: 'Provider not linked to account' },
              },
              { status: 400 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              primaryProvider: body.provider,
              user: {
                id: userId,
                providers: userSession.providers,
                primaryProvider: body.provider,
              },
            },
          })
        }),

        // Get account status
        http.get('http://localhost:3000/api/auth/account/status', ({ request }) => {
          const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '')

          if (sessionToken !== 'existing-session-token') {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INVALID_SESSION', message: 'Session required' },
              },
              { status: 401 }
            )
          }

          const userSession = authFlowState.userSessions.get(sessionId)!

          return HttpResponse.json({
            success: true,
            data: {
              user: {
                id: userId,
                email: 'multiuser@example.com',
                providers: userSession.providers.map(provider => ({
                  provider,
                  connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                  isPrimary: provider === 'google', // Updated in previous step
                })),
                securityLevel: userSession.securityLevel,
                sessionStatus: 'active',
              },
            },
          })
        })
      )

      // Execute multi-provider management journey
      console.log('🔗 Starting multi-provider account management journey...')

      // Step 1: Link additional provider (Google)
      const linkResponse = await fetch('http://localhost:3000/api/auth/link-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer existing-session-token',
        },
        body: JSON.stringify({ provider: 'google', oauthCode: 'google-oauth-code' }),
      })
      expect(linkResponse.status).toBe(200)
      const linkData = await linkResponse.json()
      expect(linkData.success).toBe(true)
      expect(linkData.data.user.providers).toEqual(['github', 'google'])

      console.log('✅ Google provider linked successfully')

      // Step 2: Set Google as primary provider
      const primaryResponse = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer existing-session-token',
        },
        body: JSON.stringify({ provider: 'google' }),
      })
      expect(primaryResponse.status).toBe(200)
      const primaryData = await primaryResponse.json()
      expect(primaryData.success).toBe(true)
      expect(primaryData.data.primaryProvider).toBe('google')

      console.log('✅ Google set as primary provider')

      // Step 3: Verify account status
      const statusResponse = await fetch('http://localhost:3000/api/auth/account/status', {
        headers: { Authorization: 'Bearer existing-session-token' },
      })
      expect(statusResponse.status).toBe(200)
      const statusData = await statusResponse.json()
      expect(statusData.success).toBe(true)
      expect(statusData.data.user.providers).toHaveLength(2)
      expect(
        statusData.data.user.providers.find((p: ProviderInfo) => p.provider === 'google')?.isPrimary
      ).toBe(true)

      console.log('✅ Account status verified - Multi-provider journey complete!')

      // Validate consistency across components
      const updatedSession = authFlowState.userSessions.get(sessionId)!
      expect(updatedSession.providers).toEqual(['github', 'google'])

      // Validate audit trail shows account linking
      const linkingEvents = authFlowState.auditEvents.filter(
        event => event.details.action === 'account_linking'
      )
      expect(linkingEvents).toHaveLength(1)
      expect(linkingEvents[0].details.provider).toBe('google')

      console.log('🎉 Multi-provider account management journey successful!')
    })
  })

  describe('Session Security Lifecycle', () => {
    it('should handle session rotation and security events', async () => {
      const userId = crypto.randomUUID()
      const originalSessionId = crypto.randomUUID()

      // Setup existing session
      authFlowState.userSessions.set(originalSessionId, {
        sessionId: originalSessionId,
        userId,
        sessionToken: 'original-session-token',
        csrfToken: 'original-csrf-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        securityLevel: 'mfa',
        providers: ['github'],
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (compatible test browser)',
        lastActivity: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        securityFlags: {
          deviceChange: false,
          locationChange: false,
          concurrentSessions: 1,
        },
      })

      server.use(
        // Detect suspicious activity requiring session rotation
        http.post('http://localhost:3000/api/auth/session/validate', ({ request }) => {
          const newIpAddress = request.headers.get('X-Forwarded-For') || '192.168.1.101'
          const newUserAgent = request.headers.get('User-Agent') || 'Different Browser'

          // Detect location/device change
          if (
            newIpAddress !== '192.168.1.100' ||
            newUserAgent !== 'Mozilla/5.0 (compatible test browser)'
          ) {
            authFlowState.auditEvents.push({
              eventId: crypto.randomUUID(),
              eventType: 'security_violation',
              userId,
              sessionId: originalSessionId,
              timestamp: new Date(),
              ipAddress: newIpAddress,
              userAgent: newUserAgent,
              details: {
                violation: 'device_location_change',
                originalIp: '192.168.1.100',
                newIp: newIpAddress,
                originalUserAgent: 'Mozilla/5.0 (compatible test browser)',
                newUserAgent: newUserAgent,
              },
              riskScore: 35,
              actionTaken: 'session_rotation_required',
            })

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'SECURITY_VERIFICATION_REQUIRED',
                  message: 'Device or location change detected',
                  requiresRotation: true,
                },
                securityAction: 'rotate_session',
              },
              { status: 202 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: { sessionValid: true },
          })
        }),

        // Session rotation endpoint
        http.post('http://localhost:3000/api/auth/session/rotate', async ({ request }) => {
          const body = (await request.json()) as SessionRotateRequest
          const newSessionId = crypto.randomUUID()
          const newSessionToken = crypto.randomUUID()

          if (body.currentSessionId !== originalSessionId) {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INVALID_SESSION', message: 'Current session not found' },
              },
              { status: 401 }
            )
          }

          // Create new session
          const newSession: UserSession = {
            sessionId: newSessionId,
            userId,
            sessionToken: newSessionToken,
            csrfToken: crypto.randomUUID(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            securityLevel: 'enhanced', // Elevated security level
            providers: ['github'],
            ipAddress: '192.168.1.101',
            userAgent: 'Different Browser',
            lastActivity: new Date(),
            securityFlags: {
              deviceChange: true,
              locationChange: true,
              concurrentSessions: 1,
            },
          }

          // Remove old session and add new one
          authFlowState.userSessions.delete(originalSessionId)
          authFlowState.userSessions.set(newSessionId, newSession)

          authFlowState.auditEvents.push({
            eventId: crypto.randomUUID(),
            eventType: 'session_rotate',
            userId,
            sessionId: newSessionId,
            timestamp: new Date(),
            ipAddress: '192.168.1.101',
            userAgent: 'Different Browser',
            details: {
              previousSessionId: originalSessionId,
              reason: 'security_verification',
              newSecurityLevel: 'enhanced',
            },
            riskScore: 15,
          })

          return HttpResponse.json({
            success: true,
            data: {
              newSessionId,
              newSessionToken,
              securityLevel: 'enhanced',
              requiresAdditionalAuth: false,
              rotationReason: 'security_verification',
            },
          })
        })
      )

      // Execute session security lifecycle
      console.log('🔒 Starting session security lifecycle test...')

      // Step 1: Attempt to validate session with changed device/location
      const validateResponse = await fetch('http://localhost:3000/api/auth/session/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101', // Different IP
          'User-Agent': 'Different Browser', // Different browser
        },
        body: JSON.stringify({ sessionId: originalSessionId }),
      })
      expect(validateResponse.status).toBe(202) // Requires action
      const validateData = await validateResponse.json()
      expect(validateData.error.requiresRotation).toBe(true)
      expect(validateData.securityAction).toBe('rotate_session')

      console.log('✅ Security violation detected - Session rotation required')

      // Step 2: Rotate session due to security concern
      const rotateResponse = await fetch('http://localhost:3000/api/auth/session/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSessionId: originalSessionId,
          reason: 'security_verification',
        }),
      })
      expect(rotateResponse.status).toBe(200)
      const rotateData = await rotateResponse.json()
      expect(rotateData.success).toBe(true)
      expect(rotateData.data.securityLevel).toBe('enhanced')
      expect(rotateData.data.rotationReason).toBe('security_verification')

      console.log('✅ Session rotated with enhanced security level')

      // Validate session lifecycle consistency
      expect(authFlowState.userSessions.has(originalSessionId)).toBe(false)
      expect(authFlowState.userSessions.has(rotateData.data.newSessionId)).toBe(true)

      const newSession = authFlowState.userSessions.get(rotateData.data.newSessionId)!
      expect(newSession.securityLevel).toBe('enhanced')
      expect(newSession.securityFlags.deviceChange).toBe(true)
      expect(newSession.securityFlags.locationChange).toBe(true)

      // Validate audit trail shows security progression
      const securityEvents = authFlowState.auditEvents.filter(
        event => event.eventType === 'security_violation' || event.eventType === 'session_rotate'
      )
      expect(securityEvents).toHaveLength(2)
      expect(securityEvents[0].eventType).toBe('security_violation')
      expect(securityEvents[1].eventType).toBe('session_rotate')

      console.log('🎉 Session security lifecycle handled successfully!')
    })
  })

  describe('Cross-Component Authentication State Consistency', () => {
    it('should maintain consistent authentication state across all components', async () => {
      const userId = crypto.randomUUID()
      const sessionId = crypto.randomUUID()

      // Setup comprehensive authentication state
      authFlowState.userSessions.set(sessionId, {
        sessionId,
        userId,
        sessionToken: 'test-session-token',
        csrfToken: 'test-csrf-token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        securityLevel: 'mfa',
        providers: ['github', 'google'],
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (compatible test browser)',
        lastActivity: new Date(),
        securityFlags: {
          deviceChange: false,
          locationChange: false,
          concurrentSessions: 1,
        },
      })

      authFlowState.webauthnCredentials.set(userId, [
        {
          credentialId: 'test-credential-id',
          userId,
          publicKey: 'test-public-key',
          counter: 3,
          deviceName: 'Test Device',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          lastUsed: new Date(),
          aaguid: 'test-aaguid',
          transports: ['internal'],
        },
      ])

      server.use(
        // Validate complete user profile across components
        http.get('http://localhost:3000/api/auth/profile/complete', ({ request }) => {
          const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '')

          if (sessionToken !== 'test-session-token') {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'INVALID_SESSION', message: 'Session required' },
              },
              { status: 401 }
            )
          }

          const userSession = authFlowState.userSessions.get(sessionId)!
          const userCredentials = authFlowState.webauthnCredentials.get(userId)!

          return HttpResponse.json({
            success: true,
            data: {
              id: userId,
              email: 'consistent@example.com',
              displayName: 'Consistent User',
              username: 'consistentuser',
              emailVerified: true,
              providers: userSession.providers.map(provider => ({
                provider,
                accountId: `${provider}-account-id`,
                connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                isPrimary: provider === 'github',
                metadata: { verified: true },
              })),
              webauthnCredentials: userCredentials.map(cred => ({
                credentialId: cred.credentialId,
                deviceName: cred.deviceName,
                createdAt: cred.createdAt.toISOString(),
                lastUsed: cred.lastUsed?.toISOString(),
              })),
              securitySettings: {
                mfaEnabled: true,
                securityLevel: userSession.securityLevel,
                lastSecurityReview: new Date().toISOString(),
                suspiciousActivityCount: 0,
              },
              createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
          })
        }),

        // Test protected API access with authentication state
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '')

          if (sessionToken !== 'test-session-token') {
            return HttpResponse.json(
              {
                success: false,
                error: { code: 'AUTHENTICATION_REQUIRED', message: 'Valid session required' },
              },
              { status: 401 }
            )
          }

          const userSession = authFlowState.userSessions.get(sessionId)!

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [
                {
                  id: crypto.randomUUID(),
                  name: 'test-repo',
                  fullName: 'user/test-repo',
                  description: 'Test repository for authenticated user',
                },
              ],
              total_count: 1,
              page: 1,
              per_page: 20,
              has_more: false,
            },
            metadata: {
              authenticated_user: {
                id: userId,
                securityLevel: userSession.securityLevel,
                providers: userSession.providers,
              },
              execution_time_ms: 25,
            },
          })
        })
      )

      // Test cross-component consistency
      console.log('🔄 Testing cross-component authentication state consistency...')

      // Step 1: Get complete user profile
      const profileResponse = await fetch('http://localhost:3000/api/auth/profile/complete', {
        headers: { Authorization: 'Bearer test-session-token' },
      })
      expect(profileResponse.status).toBe(200)
      const profileData = await profileResponse.json()

      // Validate profile data structure
      const validatedProfile = CompleteUserProfileSchema.parse(profileData.data)
      expect(validatedProfile.providers).toHaveLength(2)
      expect(validatedProfile.webauthnCredentials).toHaveLength(1)
      expect(validatedProfile.securitySettings.mfaEnabled).toBe(true)
      expect(validatedProfile.securitySettings.securityLevel).toBe('mfa')

      console.log('✅ Complete user profile validated')

      // Step 2: Test protected API access
      const apiResponse = await fetch('http://localhost:3000/api/search/repositories', {
        headers: { Authorization: 'Bearer test-session-token' },
      })
      expect(apiResponse.status).toBe(200)
      const apiData = await apiResponse.json()
      expect(apiData.success).toBe(true)
      expect(apiData.metadata.authenticated_user.id).toBe(userId)
      expect(apiData.metadata.authenticated_user.securityLevel).toBe('mfa')
      expect(apiData.metadata.authenticated_user.providers).toEqual(['github', 'google'])

      console.log('✅ Protected API access with authentication context')

      // Validate state consistency across components
      const userSession = authFlowState.userSessions.get(sessionId)!
      const userCredentials = authFlowState.webauthnCredentials.get(userId)!

      // Session state matches profile
      expect(userSession.securityLevel).toBe(validatedProfile.securitySettings.securityLevel)
      expect(userSession.providers.sort()).toEqual(
        validatedProfile.providers.map(p => p.provider).sort()
      )

      // WebAuthn credentials match profile
      expect(userCredentials[0].credentialId).toBe(
        validatedProfile.webauthnCredentials[0].credentialId
      )

      // API response matches session state
      expect(apiData.metadata.authenticated_user.securityLevel).toBe(userSession.securityLevel)
      expect(apiData.metadata.authenticated_user.providers.sort()).toEqual(
        userSession.providers.sort()
      )

      console.log('🎉 Cross-component authentication state consistency validated!')
    })
  })
})
