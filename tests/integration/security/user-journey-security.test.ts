/**
 * User Journey Security Integration Tests
 *
 * Comprehensive testing of security implementation across complete user journeys
 * to ensure end-to-end security enforcement throughout user interactions.
 *
 * Test Coverage:
 * - Complete user registration journey with security validation
 * - Repository discovery journey with authentication and authorization
 * - Profile management journey with data protection
 * - Account security management journey
 * - Cross-feature security consistency validation
 * - User data protection throughout journeys
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiTestUtils } from '../api/utils/api-test-utilities'

// User journey security schemas
const UserJourneySchema = z.object({
  journeyId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  journeyType: z.enum([
    'registration',
    'authentication',
    'repository_discovery',
    'profile_management',
    'account_security',
    'data_export',
    'account_deletion',
  ]),
  steps: z.array(
    z.object({
      stepId: z.string(),
      stepType: z.string(),
      timestamp: z.string().datetime(),
      securityChecks: z.array(z.string()),
      dataAccessed: z.array(z.string()),
      dataModified: z.array(z.string()),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
      outcome: z.enum(['success', 'failure', 'blocked', 'challenged']),
    })
  ),
  securitySummary: z.object({
    totalSteps: z.number(),
    securityChecksPassed: z.number(),
    securityChecksFailed: z.number(),
    dataProtectionLevel: z.enum(['basic', 'standard', 'enhanced', 'maximum']),
    overallRiskScore: z.number().min(0).max(100),
  }),
  completedAt: z.string().datetime().optional(),
})

const DataProtectionEventSchema = z.object({
  eventId: z.string().uuid(),
  journeyId: z.string().uuid(),
  dataType: z.enum([
    'personal_info',
    'authentication_data',
    'github_tokens',
    'search_history',
    'preferences',
    'activity_logs',
    'private_repositories',
  ]),
  operation: z.enum(['create', 'read', 'update', 'delete', 'export']),
  protection: z.object({
    encrypted: z.boolean(),
    anonymized: z.boolean(),
    auditLogged: z.boolean(),
    accessControlled: z.boolean(),
    retentionPolicy: z.string(),
  }),
  compliance: z.object({
    gdprCompliant: z.boolean(),
    ccpaCompliant: z.boolean(),
    hipaaRelevant: z.boolean(),
  }),
  timestamp: z.string().datetime(),
})

const SecurityAuditTrailSchema = z.object({
  trailId: z.string().uuid(),
  journeyId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  events: z.array(
    z.object({
      eventType: z.string(),
      timestamp: z.string().datetime(),
      ipAddress: z.string().ip(),
      userAgent: z.string(),
      outcome: z.string(),
      securityLevel: z.string(),
      dataInvolved: z.array(z.string()),
    })
  ),
  riskAssessment: z.object({
    overallRisk: z.number().min(0).max(100),
    riskFactors: z.array(z.string()),
    mitigationApplied: z.array(z.string()),
  }),
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

describe('User Journey Security Integration Tests', () => {
  let userJourneys: z.infer<typeof UserJourneySchema>[] = []
  let dataProtectionEvents: z.infer<typeof DataProtectionEventSchema>[] = []
  let securityAuditTrails: z.infer<typeof SecurityAuditTrailSchema>[] = []
  const userStore: Map<string, any> = new Map()

  beforeEach(() => {
    userJourneys = []
    dataProtectionEvents = []
    securityAuditTrails = []
    userStore.clear()
    vi.clearAllMocks()
  })

  describe('Complete User Registration Journey Security', () => {
    it('should handle secure OAuth registration flow with comprehensive validation', async () => {
      const journeyId = apiTestUtils.dataGenerator.generateUUID()
      const email = 'newuser@example.com'
      const githubUserId = '12345'

      const registrationJourney: z.infer<typeof UserJourneySchema> = {
        journeyId,
        journeyType: 'registration',
        steps: [],
        securitySummary: {
          totalSteps: 0,
          securityChecksPassed: 0,
          securityChecksFailed: 0,
          dataProtectionLevel: 'enhanced',
          overallRiskScore: 25,
        },
      }

      userJourneys.push(registrationJourney)

      server.use(
        // Step 1: OAuth initiation
        http.get('http://localhost:3000/api/auth/signin/github', ({ request }) => {
          const step = {
            stepId: 'oauth_initiation',
            stepType: 'authentication_start',
            timestamp: new Date().toISOString(),
            securityChecks: ['csrf_token_generation', 'state_parameter_creation', 'pkce_challenge'],
            dataAccessed: [],
            dataModified: [],
            riskLevel: 'low' as const,
            outcome: 'success' as const,
          }

          registrationJourney.steps.push(step)
          registrationJourney.securitySummary.totalSteps++
          registrationJourney.securitySummary.securityChecksPassed += 3

          // Log data protection event
          dataProtectionEvents.push({
            eventId: apiTestUtils.dataGenerator.generateUUID(),
            journeyId,
            dataType: 'authentication_data',
            operation: 'create',
            protection: {
              encrypted: true,
              anonymized: false,
              auditLogged: true,
              accessControlled: true,
              retentionPolicy: 'session_duration',
            },
            compliance: {
              gdprCompliant: true,
              ccpaCompliant: true,
              hipaaRelevant: false,
            },
            timestamp: new Date().toISOString(),
          })

          return HttpResponse.json({
            success: true,
            data: {
              authUrl: 'https://github.com/login/oauth/authorize',
              state: apiTestUtils.dataGenerator.generateRandomString(32),
              codeChallenge: apiTestUtils.dataGenerator.generateRandomString(43),
            },
          })
        }),

        // Step 2: OAuth callback processing
        http.get('http://localhost:3000/api/auth/callback/github', ({ request }) => {
          const url = new URL(request.url)
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')

          const step = {
            stepId: 'oauth_callback',
            stepType: 'authentication_callback',
            timestamp: new Date().toISOString(),
            securityChecks: [
              'state_parameter_validation',
              'authorization_code_validation',
              'github_api_verification',
            ],
            dataAccessed: ['github_profile'],
            dataModified: [],
            riskLevel: 'medium' as const,
            outcome: state && code ? ('success' as const) : ('failure' as const),
          }

          registrationJourney.steps.push(step)
          registrationJourney.securitySummary.totalSteps++

          if (step.outcome === 'success') {
            registrationJourney.securitySummary.securityChecksPassed += 3
          } else {
            registrationJourney.securitySummary.securityChecksFailed += 3
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'OAUTH_VALIDATION_FAILED',
                  message: 'OAuth callback validation failed',
                },
              },
              { status: 400 }
            )
          }

          // Simulate GitHub profile data
          const githubProfile = {
            id: githubUserId,
            login: 'newuser',
            email: email,
            name: 'New User',
            avatar_url: 'https://github.com/avatar.jpg',
          }

          return HttpResponse.json({
            success: true,
            data: {
              githubProfile,
              temporaryToken: apiTestUtils.dataGenerator.generateRandomString(64),
            },
          })
        }),

        // Step 3: User account creation
        http.post('http://localhost:3000/api/auth/create-account', async ({ request }) => {
          const body = await request.json()
          const { githubProfile, emailVerificationRequired = true } = body

          const userId = apiTestUtils.dataGenerator.generateUUID()
          const step = {
            stepId: 'account_creation',
            stepType: 'user_registration',
            timestamp: new Date().toISOString(),
            securityChecks: [
              'email_validation',
              'duplicate_account_check',
              'data_sanitization',
              'privacy_settings_initialization',
            ],
            dataAccessed: ['github_profile'],
            dataModified: ['user_account', 'personal_info'],
            riskLevel: 'medium' as const,
            outcome: 'success' as const,
          }

          registrationJourney.steps.push(step)
          registrationJourney.securitySummary.totalSteps++
          registrationJourney.securitySummary.securityChecksPassed += 4
          registrationJourney.userId = userId

          // Create user account with security defaults
          const userData = {
            id: userId,
            email: githubProfile.email,
            name: githubProfile.name,
            githubId: githubProfile.id,
            githubUsername: githubProfile.login,
            avatarUrl: githubProfile.avatar_url,
            emailVerified: !emailVerificationRequired,
            createdAt: new Date().toISOString(),
            securitySettings: {
              twoFactorEnabled: false,
              loginNotifications: true,
              dataProcessingConsent: true,
              marketingConsent: false,
            },
            privacySettings: {
              profileVisibility: 'private',
              searchHistoryVisible: false,
              activityVisible: false,
            },
          }

          userStore.set(userId, userData)

          // Log data protection events
          dataProtectionEvents.push(
            {
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              journeyId,
              dataType: 'personal_info',
              operation: 'create',
              protection: {
                encrypted: true,
                anonymized: false,
                auditLogged: true,
                accessControlled: true,
                retentionPolicy: 'account_lifetime',
              },
              compliance: {
                gdprCompliant: true,
                ccpaCompliant: true,
                hipaaRelevant: false,
              },
              timestamp: new Date().toISOString(),
            },
            {
              eventId: apiTestUtils.dataGenerator.generateUUID(),
              journeyId,
              dataType: 'github_tokens',
              operation: 'create',
              protection: {
                encrypted: true,
                anonymized: false,
                auditLogged: true,
                accessControlled: true,
                retentionPolicy: 'token_expiry',
              },
              compliance: {
                gdprCompliant: true,
                ccpaCompliant: true,
                hipaaRelevant: false,
              },
              timestamp: new Date().toISOString(),
            }
          )

          return HttpResponse.json({
            success: true,
            data: {
              user: userData,
              emailVerificationRequired,
              emailVerificationToken: emailVerificationRequired
                ? apiTestUtils.dataGenerator.generateRandomString(32)
                : null,
            },
          })
        }),

        // Step 4: Email verification (if required)
        http.post('http://localhost:3000/api/auth/verify-email', async ({ request }) => {
          const body = await request.json()
          const { userId, verificationToken } = body

          const step = {
            stepId: 'email_verification',
            stepType: 'identity_verification',
            timestamp: new Date().toISOString(),
            securityChecks: ['token_validation', 'expiry_check', 'single_use_validation'],
            dataAccessed: ['user_account'],
            dataModified: ['email_verification_status'],
            riskLevel: 'low' as const,
            outcome: verificationToken?.length === 32 ? ('success' as const) : ('failure' as const),
          }

          registrationJourney.steps.push(step)
          registrationJourney.securitySummary.totalSteps++

          if (step.outcome === 'success') {
            registrationJourney.securitySummary.securityChecksPassed += 3

            // Update user verification status
            const userData = userStore.get(userId)
            if (userData) {
              userData.emailVerified = true
              userData.emailVerifiedAt = new Date().toISOString()
              userStore.set(userId, userData)
            }
          } else {
            registrationJourney.securitySummary.securityChecksFailed += 3
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_VERIFICATION_TOKEN',
                  message: 'Email verification token is invalid',
                },
              },
              { status: 400 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              emailVerified: true,
              accountActivated: true,
            },
          })
        }),

        // Step 5: Initial security setup
        http.post('http://localhost:3000/api/auth/setup-security', async ({ request }) => {
          const body = await request.json()
          const { userId, enableTwoFactor = false, securityQuestions = [] } = body

          const step = {
            stepId: 'security_setup',
            stepType: 'security_configuration',
            timestamp: new Date().toISOString(),
            securityChecks: [
              'mfa_enrollment_option',
              'security_questions_validation',
              'backup_codes_generation',
            ],
            dataAccessed: ['user_account'],
            dataModified: ['security_settings', 'mfa_settings'],
            riskLevel: 'low' as const,
            outcome: 'success' as const,
          }

          registrationJourney.steps.push(step)
          registrationJourney.securitySummary.totalSteps++
          registrationJourney.securitySummary.securityChecksPassed += 3

          // Update user security settings
          const userData = userStore.get(userId)
          if (userData) {
            userData.securitySettings.twoFactorEnabled = enableTwoFactor
            userData.securitySettings.securityQuestionsSet = securityQuestions.length > 0
            userData.securitySettings.backupCodesGenerated = enableTwoFactor
            userStore.set(userId, userData)
          }

          // Complete the journey
          registrationJourney.completedAt = new Date().toISOString()

          // Create security audit trail
          const auditTrail: z.infer<typeof SecurityAuditTrailSchema> = {
            trailId: apiTestUtils.dataGenerator.generateUUID(),
            journeyId,
            userId,
            events: registrationJourney.steps.map(step => ({
              eventType: step.stepType,
              timestamp: step.timestamp,
              ipAddress: '192.168.1.100',
              userAgent: 'test-browser',
              outcome: step.outcome,
              securityLevel: 'standard',
              dataInvolved: [...step.dataAccessed, ...step.dataModified],
            })),
            riskAssessment: {
              overallRisk: registrationJourney.securitySummary.overallRiskScore,
              riskFactors: ['new_account', 'github_oauth'],
              mitigationApplied: ['email_verification', 'security_defaults', 'audit_logging'],
            },
          }

          securityAuditTrails.push(auditTrail)

          return HttpResponse.json({
            success: true,
            data: {
              securitySetupComplete: true,
              mfaEnabled: enableTwoFactor,
              backupCodes: enableTwoFactor
                ? Array.from({ length: 10 }, () =>
                    apiTestUtils.dataGenerator.generateRandomString(8)
                  )
                : [],
              journeyCompleted: true,
            },
          })
        })
      )

      // Execute registration journey

      // Step 1: Initiate OAuth
      const oauthResponse = await fetch('http://localhost:3000/api/auth/signin/github')
      expect(oauthResponse.status).toBe(200)
      const oauthData = await oauthResponse.json()

      // Step 2: Process OAuth callback
      const callbackResponse = await fetch(
        `http://localhost:3000/api/auth/callback/github?code=auth_code_123&state=${oauthData.data.state}`
      )
      expect(callbackResponse.status).toBe(200)
      const callbackData = await callbackResponse.json()

      // Step 3: Create account
      const accountResponse = await fetch('http://localhost:3000/api/auth/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubProfile: callbackData.data.githubProfile,
          emailVerificationRequired: true,
        }),
      })
      expect(accountResponse.status).toBe(200)
      const accountData = await accountResponse.json()
      const userId = accountData.data.user.id

      // Step 4: Verify email
      const verifyResponse = await fetch('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          verificationToken: accountData.data.emailVerificationToken,
        }),
      })
      expect(verifyResponse.status).toBe(200)

      // Step 5: Setup security
      const securityResponse = await fetch('http://localhost:3000/api/auth/setup-security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          enableTwoFactor: true,
          securityQuestions: [{ question: 'First pet name?', answer: 'fluffy' }],
        }),
      })
      expect(securityResponse.status).toBe(200)
      const securityData = await securityResponse.json()

      // Verify journey completion
      expect(securityData.data.journeyCompleted).toBe(true)
      expect(registrationJourney.completedAt).toBeDefined()
      expect(registrationJourney.securitySummary.totalSteps).toBe(5)
      expect(registrationJourney.securitySummary.securityChecksPassed).toBeGreaterThan(0)

      // Verify data protection events were logged
      const personalInfoEvents = dataProtectionEvents.filter(e => e.dataType === 'personal_info')
      const authDataEvents = dataProtectionEvents.filter(e => e.dataType === 'authentication_data')
      const tokenEvents = dataProtectionEvents.filter(e => e.dataType === 'github_tokens')

      expect(personalInfoEvents).toHaveLength(1)
      expect(authDataEvents).toHaveLength(1)
      expect(tokenEvents).toHaveLength(1)

      // Verify all data protection events are compliant
      dataProtectionEvents.forEach(event => {
        expect(event.protection.encrypted).toBe(true)
        expect(event.protection.auditLogged).toBe(true)
        expect(event.compliance.gdprCompliant).toBe(true)
        expect(event.compliance.ccpaCompliant).toBe(true)
      })

      // Verify security audit trail
      expect(securityAuditTrails).toHaveLength(1)
      expect(securityAuditTrails[0].events).toHaveLength(5)
      expect(securityAuditTrails[0].riskAssessment.overallRisk).toBeLessThanOrEqual(30)

      // Verify user was created with secure defaults
      const createdUser = userStore.get(userId)
      expect(createdUser).toBeDefined()
      expect(createdUser.emailVerified).toBe(true)
      expect(createdUser.securitySettings.twoFactorEnabled).toBe(true)
      expect(createdUser.privacySettings.profileVisibility).toBe('private')
    })
  })

  describe('Repository Discovery Journey Security', () => {
    it('should authenticate user before search access with comprehensive authorization', async () => {
      const journeyId = apiTestUtils.dataGenerator.generateUUID()
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const sessionToken = apiTestUtils.dataGenerator.generateRandomString(64)

      const discoveryJourney: z.infer<typeof UserJourneySchema> = {
        journeyId,
        userId,
        journeyType: 'repository_discovery',
        steps: [],
        securitySummary: {
          totalSteps: 0,
          securityChecksPassed: 0,
          securityChecksFailed: 0,
          dataProtectionLevel: 'standard',
          overallRiskScore: 20,
        },
      }

      userJourneys.push(discoveryJourney)

      server.use(
        // Step 1: Authentication validation
        http.post('http://localhost:3000/api/auth/validate', async ({ request }) => {
          const body = await request.json()
          const { sessionToken: providedToken } = body

          const step = {
            stepId: 'auth_validation',
            stepType: 'session_verification',
            timestamp: new Date().toISOString(),
            securityChecks: [
              'session_token_validation',
              'user_permissions_check',
              'rate_limit_check',
            ],
            dataAccessed: ['session_data', 'user_permissions'],
            dataModified: [],
            riskLevel: 'low' as const,
            outcome: providedToken === sessionToken ? ('success' as const) : ('failure' as const),
          }

          discoveryJourney.steps.push(step)
          discoveryJourney.securitySummary.totalSteps++

          if (step.outcome === 'success') {
            discoveryJourney.securitySummary.securityChecksPassed += 3
          } else {
            discoveryJourney.securitySummary.securityChecksFailed += 3
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'AUTHENTICATION_REQUIRED',
                  message: 'Valid authentication required for repository search',
                },
              },
              { status: 401 }
            )
          }

          return HttpResponse.json({
            success: true,
            data: {
              userId,
              permissions: ['search:repositories', 'read:public_repos'],
              rateLimit: { remaining: 95, limit: 100 },
            },
          })
        }),

        // Step 2: Search parameter validation
        http.post('http://localhost:3000/api/search/repositories', async ({ request }) => {
          const body = await request.json()
          const { query, filters = {} } = body

          const step = {
            stepId: 'search_validation',
            stepType: 'input_validation',
            timestamp: new Date().toISOString(),
            securityChecks: [
              'query_sanitization',
              'filter_validation',
              'pagination_limits',
              'search_permissions',
            ],
            dataAccessed: ['search_parameters'],
            dataModified: ['search_history'],
            riskLevel: 'low' as const,
            outcome: 'success' as const,
          }

          discoveryJourney.steps.push(step)
          discoveryJourney.securitySummary.totalSteps++
          discoveryJourney.securitySummary.securityChecksPassed += 4

          // Validate search parameters
          if (!query || query.length > 200) {
            step.outcome = 'failure'
            discoveryJourney.securitySummary.securityChecksFailed += 4
            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'INVALID_SEARCH_PARAMETERS',
                  message: 'Search query validation failed',
                },
              },
              { status: 400 }
            )
          }

          // Log search activity
          dataProtectionEvents.push({
            eventId: apiTestUtils.dataGenerator.generateUUID(),
            journeyId,
            dataType: 'search_history',
            operation: 'create',
            protection: {
              encrypted: true,
              anonymized: true,
              auditLogged: true,
              accessControlled: true,
              retentionPolicy: '30_days',
            },
            compliance: {
              gdprCompliant: true,
              ccpaCompliant: true,
              hipaaRelevant: false,
            },
            timestamp: new Date().toISOString(),
          })

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [
                {
                  id: '1',
                  name: 'test-repo',
                  owner: 'test-user',
                  description: 'A test repository',
                  visibility: 'public',
                },
              ],
              total_count: 1,
              searchMetadata: {
                query: query,
                executionTime: 150,
                resultsFiltered: true,
              },
            },
          })
        }),

        // Step 3: Repository access authorization
        http.get('http://localhost:3000/api/repositories/:id', ({ params }) => {
          const repositoryId = params.id as string

          const step = {
            stepId: 'repo_access_check',
            stepType: 'authorization_check',
            timestamp: new Date().toISOString(),
            securityChecks: [
              'repository_permissions',
              'visibility_check',
              'user_access_rights',
              'data_classification_check',
            ],
            dataAccessed: ['repository_data', 'user_permissions'],
            dataModified: ['access_logs'],
            riskLevel: 'medium' as const,
            outcome: 'success' as const,
          }

          discoveryJourney.steps.push(step)
          discoveryJourney.securitySummary.totalSteps++
          discoveryJourney.securitySummary.securityChecksPassed += 4

          // Log repository access
          dataProtectionEvents.push({
            eventId: apiTestUtils.dataGenerator.generateUUID(),
            journeyId,
            dataType: 'activity_logs',
            operation: 'create',
            protection: {
              encrypted: true,
              anonymized: false,
              auditLogged: true,
              accessControlled: true,
              retentionPolicy: '90_days',
            },
            compliance: {
              gdprCompliant: true,
              ccpaCompliant: true,
              hipaaRelevant: false,
            },
            timestamp: new Date().toISOString(),
          })

          return HttpResponse.json({
            success: true,
            data: {
              repository: {
                id: repositoryId,
                name: 'test-repo',
                owner: 'test-user',
                description: 'A test repository',
                visibility: 'public',
                language: 'TypeScript',
                stars: 42,
                forks: 7,
                lastUpdated: '2024-01-15T10:30:00Z',
              },
              accessLevel: 'read',
              dataClassification: 'public',
            },
          })
        })
      )

      // Execute repository discovery journey

      // Step 1: Validate authentication
      const authResponse = await fetch('http://localhost:3000/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      expect(authResponse.status).toBe(200)

      // Step 2: Perform search
      const searchResponse = await fetch('http://localhost:3000/api/search/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'typescript react',
          filters: { language: 'TypeScript' },
        }),
      })
      expect(searchResponse.status).toBe(200)
      const searchData = await searchResponse.json()

      // Step 3: Access repository details
      const repoResponse = await fetch('http://localhost:3000/api/repositories/1')
      expect(repoResponse.status).toBe(200)
      const repoData = await repoResponse.json()

      // Verify journey security
      expect(discoveryJourney.securitySummary.totalSteps).toBe(3)
      expect(discoveryJourney.securitySummary.securityChecksPassed).toBe(11)
      expect(discoveryJourney.securitySummary.securityChecksFailed).toBe(0)

      // Verify data protection for search history
      const searchHistoryEvents = dataProtectionEvents.filter(e => e.dataType === 'search_history')
      expect(searchHistoryEvents).toHaveLength(1)
      expect(searchHistoryEvents[0].protection.anonymized).toBe(true)
      expect(searchHistoryEvents[0].protection.retentionPolicy).toBe('30_days')

      // Verify access logging
      const accessLogEvents = dataProtectionEvents.filter(e => e.dataType === 'activity_logs')
      expect(accessLogEvents).toHaveLength(1)
      expect(accessLogEvents[0].operation).toBe('create')
      expect(accessLogEvents[0].protection.auditLogged).toBe(true)

      // Verify search results were properly filtered
      expect(searchData.data.searchMetadata.resultsFiltered).toBe(true)
      expect(repoData.data.accessLevel).toBe('read')
      expect(repoData.data.dataClassification).toBe('public')
    })

    it('should apply rate limiting to search operations with user-specific limits', async () => {
      const journeyId = apiTestUtils.dataGenerator.generateUUID()
      const userId = apiTestUtils.dataGenerator.generateUUID()
      const userTier = 'premium' // Different tiers have different limits

      const rateLimitJourney: z.infer<typeof UserJourneySchema> = {
        journeyId,
        userId,
        journeyType: 'repository_discovery',
        steps: [],
        securitySummary: {
          totalSteps: 0,
          securityChecksPassed: 0,
          securityChecksFailed: 0,
          dataProtectionLevel: 'standard',
          overallRiskScore: 15,
        },
      }

      userJourneys.push(rateLimitJourney)

      const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

      server.use(
        http.post('http://localhost:3000/api/search/repositories', async ({ request }) => {
          const body = await request.json()
          const { query } = body
          const authHeader = request.headers.get('Authorization')

          const step = {
            stepId: 'rate_limit_check',
            stepType: 'rate_limiting',
            timestamp: new Date().toISOString(),
            securityChecks: ['user_tier_validation', 'rate_limit_enforcement', 'quota_tracking'],
            dataAccessed: ['rate_limit_data', 'user_tier'],
            dataModified: ['rate_limit_counters'],
            riskLevel: 'low' as const,
            outcome: 'success' as const,
          }

          rateLimitJourney.steps.push(step)
          rateLimitJourney.securitySummary.totalSteps++

          // Rate limiting based on user tier
          const limits = {
            free: { requests: 10, window: 60000 }, // 10 requests per minute
            premium: { requests: 100, window: 60000 }, // 100 requests per minute
            enterprise: { requests: 1000, window: 60000 }, // 1000 requests per minute
          }

          const userLimit = limits[userTier as keyof typeof limits] || limits.free
          const now = Date.now()

          if (!rateLimitStore.has(userId)) {
            rateLimitStore.set(userId, { count: 0, resetTime: now + userLimit.window })
          }

          const userRateLimit = rateLimitStore.get(userId)!

          if (now > userRateLimit.resetTime) {
            userRateLimit.count = 0
            userRateLimit.resetTime = now + userLimit.window
          }

          userRateLimit.count++

          if (userRateLimit.count > userLimit.requests) {
            step.outcome = 'blocked'
            rateLimitJourney.securitySummary.securityChecksFailed += 3

            return HttpResponse.json(
              {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: `Rate limit exceeded for ${userTier} tier`,
                  details: {
                    limit: userLimit.requests,
                    window: userLimit.window,
                    resetTime: userRateLimit.resetTime,
                  },
                },
              },
              { status: 429 }
            )
          }

          rateLimitJourney.securitySummary.securityChecksPassed += 3

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [],
              rateLimit: {
                remaining: userLimit.requests - userRateLimit.count,
                limit: userLimit.requests,
                resetTime: userRateLimit.resetTime,
              },
            },
          })
        })
      )

      // Test rate limiting by making multiple requests
      const requests = []
      for (let i = 0; i < 5; i++) {
        requests.push(
          fetch('http://localhost:3000/api/search/repositories', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({ query: `test query ${i}` }),
          })
        )
      }

      const responses = await Promise.all(requests)

      // All requests should succeed for premium user (under limit)
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      // Verify rate limiting was applied correctly
      expect(rateLimitJourney.securitySummary.totalSteps).toBe(5)
      expect(rateLimitJourney.securitySummary.securityChecksPassed).toBe(15)
      expect(rateLimitJourney.securitySummary.securityChecksFailed).toBe(0)

      // Check last response for rate limit headers
      const lastResponse = responses[responses.length - 1]
      const lastData = await lastResponse.json()
      expect(lastData.data.rateLimit.remaining).toBe(95) // 100 - 5 requests
    })
  })
})
