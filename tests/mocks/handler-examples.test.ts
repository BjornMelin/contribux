/**
 * MSW Handler Examples and Integration Tests
 * Demonstrates how to use the comprehensive MSW handlers in different scenarios
 */

import { describe, expect, it } from 'vitest'
import {
  requestBuilders as HTTPBuilders,
  mockFactories as TestDataBuilders,
  responseValidators,
  setupComprehensiveMSW,
  testScenarios,
} from './unified-handlers'

// Setup comprehensive MSW for all tests
setupComprehensiveMSW()

describe('MSW Handler Examples', () => {
  describe('Authentication Handlers', () => {
    it('should handle valid session authentication', async () => {
      const response = await fetch(
        'http://localhost:3000/api/auth/session',
        HTTPBuilders.withSession()
      )

      expect(response.ok).toBe(true)
      const session = await response.json()
      expect(session.user).toBeDefined()
      expect(session.user.email).toBe('test@example.com')
    })

    it('should reject requests without authentication', async () => {
      const response = await fetch('http://localhost:3000/api/auth/session')

      expect(response.ok).toBe(true) // Session endpoint returns null for no session
      const session = await response.json()
      expect(session).toBe(null)
    })

    it('should handle provider listing', async () => {
      const response = await fetch('http://localhost:3000/api/auth/providers')

      expect(response.ok).toBe(true)
      const providers = await response.json()
      expect(Array.isArray(providers)).toBe(true)
      expect(providers.length).toBeGreaterThan(0)
    })

    it('should handle MFA enrollment', async () => {
      const response = await fetch('http://localhost:3000/api/auth/mfa/enroll', {
        method: 'POST',
        ...HTTPBuilders.withSession(),
      })

      expect(response.ok).toBe(true)
      const mfaData = await response.json()
      expect(mfaData.success).toBe(true)
      expect(mfaData.secret).toBeDefined()
      expect(mfaData.qrCode).toBeDefined()
    })

    it('should handle MFA verification', async () => {
      const response = await fetch('http://localhost:3000/api/auth/mfa/verify', {
        method: 'POST',
        ...HTTPBuilders.withSession(),
        body: JSON.stringify({ code: '123456' }),
      })

      expect(response.ok).toBe(true)
      const verification = await response.json()
      expect(verification.success).toBe(true)
      expect(verification.verified).toBe(true)
    })
  })

  describe('Security Handlers', () => {
    it('should return healthy security status', async () => {
      const response = await fetch(
        `http://localhost:3000/api/security/health${testScenarios.security.healthy}`
      )

      expect(response.ok).toBe(true)
      const health = await response.json()
      expect(health.status).toBe('healthy')
      expect(health.services.database).toBe('connected')
      expect(health.features.webauthnEnabled).toBe(true)
    })

    it('should return warning security status', async () => {
      const response = await fetch(
        `http://localhost:3000/api/security/health${testScenarios.security.warning}`
      )

      expect(response.ok).toBe(true)
      const health = await response.json()
      expect(health.status).toBe('warning')
      expect(health.services.webauthn).toBe('unavailable')
    })

    it('should return critical security status', async () => {
      const response = await fetch(
        `http://localhost:3000/api/security/health${testScenarios.security.critical}`
      )

      expect(response.status).toBe(503)
      const health = await response.json()
      expect(health.status).toBe('critical')
      expect(health.services.database).toBe('error')
    })

    it('should handle WebAuthn registration options', async () => {
      const response = await fetch('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
        ...HTTPBuilders.withSession(),
      })

      expect(response.ok).toBe(true)
      const options = await response.json()
      expect(options.success).toBe(true)
      expect(options.options).toBeDefined()
      expect(options.challenge).toBeDefined()
    })

    it('should handle WebAuthn verification', async () => {
      const response = await fetch('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        ...HTTPBuilders.withSession(),
        body: JSON.stringify({
          credential: { id: 'mock-credential' },
          challenge: 'mock-challenge',
        }),
      })

      expect(response.ok).toBe(true)
      const verification = await response.json()
      expect(verification.success).toBe(true)
      expect(verification.verified).toBe(true)
    })

    it('should reject WebAuthn requests without authentication', async () => {
      const response = await fetch('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error).toBe('Authentication required')
    })
  })

  describe('Search Handlers', () => {
    it('should search opportunities with authentication', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/opportunities?q=typescript',
        HTTPBuilders.withSession()
      )

      expect(response.ok).toBe(true)
      const searchResults = await response.json()
      expect(searchResults.success).toBe(true)
      expect(searchResults.data.opportunities).toBeDefined()
      expect(Array.isArray(searchResults.data.opportunities)).toBe(true)
    })

    it('should reject search requests without authentication', async () => {
      const response = await fetch('http://localhost:3000/api/search/opportunities?q=typescript')

      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.success).toBe(false)
      expect(error.error.code).toBe('UNAUTHORIZED')
    })

    it('should filter opportunities by difficulty', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/opportunities?difficulty=beginner',
        HTTPBuilders.withSession()
      )

      expect(response.ok).toBe(true)
      const searchResults = await response.json()
      expect(searchResults.success).toBe(true)

      const opportunities = searchResults.data.opportunities
      opportunities.forEach((opp: unknown) => {
        const opportunity = opp as { metadata?: { difficulty?: string } }
        expect(opportunity.metadata?.difficulty).toBe('beginner')
      })
    })

    it('should handle empty search results', async () => {
      const response = await fetch(
        `http://localhost:3000/api/search/opportunities${testScenarios.search.empty}`,
        HTTPBuilders.withSession()
      )

      expect(response.ok).toBe(true)
      const searchResults = await response.json()
      expect(searchResults.data.opportunities).toHaveLength(0)
      expect(searchResults.data.total_count).toBe(0)
    })

    it('should handle search errors gracefully', async () => {
      const response = await fetch(
        `http://localhost:3000/api/search/opportunities${testScenarios.search.error}`,
        HTTPBuilders.withSession()
      )

      expect(response.status).toBe(503)
      const error = await response.json()
      expect(error.success).toBe(false)
      expect(error.error.code).toBe('SEARCH_ERROR')
    })

    it('should search repositories with filters', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/repositories?language=typescript&first_time_contributor_friendly=true',
        HTTPBuilders.withSession()
      )

      expect(response.ok).toBe(true)
      const searchResults = await response.json()
      expect(searchResults.success).toBe(true)
      expect(searchResults.data.repositories).toBeDefined()
    })
  })

  describe('Health Check Handlers', () => {
    it('should return healthy application status', async () => {
      const response = await fetch('http://localhost:3000/api/health')

      expect(response.ok).toBe(true)
      const health = await response.json()
      expect(health.status).toBe('healthy')
      expect(health.services).toBeDefined()
      expect(health.metrics).toBeDefined()
    })

    it('should return simple health check', async () => {
      const response = await fetch('http://localhost:3000/api/simple-health')

      expect(response.ok).toBe(true)
      const health = await response.json()
      expect(health.status).toBe('ok')
      expect(health.timestamp).toBeDefined()
    })

    it('should return performance metrics', async () => {
      const response = await fetch('http://localhost:3000/api/performance')

      expect(response.ok).toBe(true)
      const performance = await response.json()
      expect(performance.success).toBe(true)
      expect(performance.data.server).toBeDefined()
      expect(performance.data.application).toBeDefined()
    })

    it('should handle degraded health status', async () => {
      const response = await fetch(
        `http://localhost:3000/api/health${testScenarios.health.degraded}`
      )

      expect(response.ok).toBe(true)
      const health = await response.json()
      expect(health.status).toBe('degraded')
      expect(health.warnings).toBeDefined()
      expect(health.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle rate limiting', async () => {
      const response = await fetch('http://localhost:3000/api/search/error?type=rate-limit')

      expect(response.status).toBe(429)
      expect(responseValidators.isRateLimited(response)).toBe(true)
      expect(responseValidators.hasRateLimitHeaders(response)).toBe(true)
    })

    it('should handle validation errors', async () => {
      const response = await fetch('http://localhost:3000/api/search/error?type=validation')

      expect(response.status).toBe(400)
      const error = await response.json()
      expect(error.success).toBe(false)
      expect(error.error.code).toBe('INVALID_PARAMETER')
    })

    it('should handle database errors', async () => {
      const response = await fetch('http://localhost:3000/api/search/error?type=database')

      expect(response.status).toBe(500)
      const error = await response.json()
      expect(error.success).toBe(false)
      expect(error.error.code).toBe('DATABASE_ERROR')
    })
  })

  describe('Mock Data Factories', () => {
    it('should create user mock data', () => {
      const user = TestDataBuilders.createUser({
        name: 'Custom User',
        email: 'custom@example.com',
      })

      expect(user.id).toMatch(/^user-/)
      expect(user.name).toBe('Custom User')
      expect(user.email).toBe('custom@example.com')
      expect(user.image).toBeDefined()
    })

    it('should create repository mock data', () => {
      const repo = TestDataBuilders.createRepository({
        name: 'custom-repo',
        language: 'Python',
      })

      expect(repo.id).toMatch(/^repo-/)
      expect(repo.name).toBe('custom-repo')
      expect(repo.language).toBe('Python')
      expect(repo.full_name).toBe('test-org/custom-repo')
    })

    it('should create opportunity mock data', () => {
      const opportunity = TestDataBuilders.createOpportunity({
        title: 'Custom Opportunity',
        difficulty: 'advanced',
      })

      expect(opportunity.id).toMatch(/^opp-/)
      expect(opportunity.title).toBe('Custom Opportunity')
      expect(opportunity.difficulty).toBe('advanced')
      expect(opportunity.difficultyScore).toBeGreaterThanOrEqual(1)
      expect(opportunity.difficultyScore).toBeLessThanOrEqual(10)
    })

    it('should create security health mock data', () => {
      const health = TestDataBuilders.createSecurityHealth('warning')

      expect(health.status).toBe('warning')
      expect(health.services.webauthn).toBe('unavailable')
      expect(health.configuration.securityLevel).toBe('enhanced')
    })
  })

  describe('Response Validators', () => {
    it('should validate successful responses', async () => {
      const response = await fetch('http://localhost:3000/api/simple-health')

      expect(responseValidators.isSuccessful(response)).toBe(true)
      expect(responseValidators.isUnauthorized(response)).toBe(false)
      expect(responseValidators.isServerError(response)).toBe(false)
    })

    it('should validate unauthorized responses', async () => {
      const response = await fetch('http://localhost:3000/api/search/opportunities')

      expect(responseValidators.isUnauthorized(response)).toBe(true)
      expect(responseValidators.isSuccessful(response)).toBe(false)
    })

    it('should validate server error responses', async () => {
      const response = await fetch('http://localhost:3000/api/search/error?type=database')

      expect(responseValidators.isServerError(response)).toBe(true)
      expect(responseValidators.isSuccessful(response)).toBe(false)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete authentication flow', async () => {
      // 1. Get providers
      const providersResponse = await fetch('http://localhost:3000/api/auth/providers')
      expect(providersResponse.ok).toBe(true)

      // 2. Get CSRF token
      const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf')
      expect(csrfResponse.ok).toBe(true)

      // 3. Check session (should be null)
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session')
      expect(sessionResponse.ok).toBe(true)
      const session = await sessionResponse.json()
      expect(session).toBe(null)

      // 4. Sign in
      const signinResponse = await fetch('http://localhost:3000/api/auth/signin/github', {
        method: 'POST',
      })
      expect(signinResponse.ok).toBe(true)

      // 5. Check authenticated session
      const authSessionResponse = await fetch(
        'http://localhost:3000/api/auth/session',
        HTTPBuilders.withSession()
      )
      expect(authSessionResponse.ok).toBe(true)
      const authSession = await authSessionResponse.json()
      expect(authSession.user).toBeDefined()
    })

    it('should handle complete search workflow', async () => {
      // 1. Authenticate
      const sessionRequest = HTTPBuilders.withSession()

      // 2. Search opportunities
      const oppResponse = await fetch(
        'http://localhost:3000/api/search/opportunities?q=typescript&difficulty=beginner',
        sessionRequest
      )
      expect(oppResponse.ok).toBe(true)

      // 3. Search repositories
      const repoResponse = await fetch(
        'http://localhost:3000/api/search/repositories?language=typescript',
        sessionRequest
      )
      expect(repoResponse.ok).toBe(true)

      // 4. Check search performance
      const perfResponse = await fetch(
        `http://localhost:3000/api/search/opportunities${testScenarios.search.performance}`,
        sessionRequest
      )
      expect(perfResponse.ok).toBe(true)
      const perfData = await perfResponse.json()
      expect(perfData.metadata.execution_time_ms).toBeGreaterThan(0)
    })

    it('should handle security monitoring workflow', async () => {
      // 1. Check overall security health
      const healthResponse = await fetch('http://localhost:3000/api/security/health')
      expect(healthResponse.ok).toBe(true)

      // 2. Check WebAuthn availability
      const webauthnResponse = await fetch(
        'http://localhost:3000/api/security/webauthn/register/options',
        {
          method: 'POST',
          ...HTTPBuilders.withSession(),
        }
      )
      expect(webauthnResponse.ok).toBe(true)

      // 3. Check application health
      const appHealthResponse = await fetch('http://localhost:3000/api/health')
      expect(appHealthResponse.ok).toBe(true)

      // 4. Check performance metrics
      const perfResponse = await fetch('http://localhost:3000/api/performance')
      expect(perfResponse.ok).toBe(true)
    })
  })
})
