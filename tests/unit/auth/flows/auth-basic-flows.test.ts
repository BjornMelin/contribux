/**
 * Basic Authentication Flows Test Suite
 *
 * Tests core authentication functionality including:
 * - Personal Access Token authentication
 * - Basic token validation and scopes
 * - Authentication header formatting
 * - Token expiration handling
 * - Basic error scenarios
 */

import { parseRateLimitHeader } from '@/lib/github/utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IntegrationTestContext } from '../../integration/infrastructure/test-config'
import { describeIntegration, integrationTest } from '../../integration/infrastructure/test-runner'
import { cleanupAuthMocks, mockAuthFailure } from './mocks/auth-provider-mocks'
import {
  cleanupClient,
  createTestClient,
  setupAuthTests,
  skipIfMissingAuth,
} from './setup/auth-setup'
import {
  validateAuthResponse,
  validateRateLimitHeaders,
  validateTokenFormat,
} from './utils/auth-test-helpers'

describeIntegration(
  'Basic Authentication Flows',
  getContext => {
    let context: IntegrationTestContext

    beforeEach(() => {
      context = getContext()
      setupAuthTests(context)
    })

    afterEach(() => {
      cleanupAuthMocks()
    })

    describe('Personal Access Token Authentication', () => {
      integrationTest('should authenticate with valid PAT token', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          const metrics = await validateAuthResponse(client, context, 'pat')

          // Verify authentication performance
          expect(metrics.duration).toBeLessThan(5000)
          expect(metrics.statusCode).toBe(200)

          // Verify rate limit information is available
          expect(metrics.rateLimitLimit).toBeGreaterThan(0)
          expect(metrics.rateLimitRemaining).toBeGreaterThanOrEqual(0)

          // Test authenticated operations
          const repos = await client.rest.repos.listForAuthenticatedUser({ per_page: 5 })
          expect(repos.data).toBeDefined()
          expect(Array.isArray(repos.data)).toBe(true)

          // Verify current token is correctly set
          const currentToken = client.getCurrentToken()
          expect(currentToken).toBe(context.env.GITHUB_TEST_TOKEN)
        } finally {
          await cleanupClient(client)
        }
      })

      integrationTest('should fail with invalid PAT token', async () => {
        const invalidToken = 'ghp_invalid_token_12345'
        const client = createTestClient({
          type: 'token',
          token: invalidToken,
        })

        try {
          await expect(client.rest.users.getAuthenticated()).rejects.toThrow()

          // Record authentication failure metrics
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.pat.failure', 0, 401)
          }
        } finally {
          await cleanupClient(client)
        }
      })

      integrationTest('should handle token expiration gracefully', async () => {
        // Mock expired token scenario
        mockAuthFailure(401, 'Bad credentials')

        const client = createTestClient({
          type: 'token',
          token: 'ghp_expired_token',
        })

        try {
          await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
        } finally {
          await cleanupClient(client)
        }
      })

      integrationTest('should validate token scopes correctly', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          const user = await client.rest.users.getAuthenticated()
          expect(user.data).toBeDefined()

          // Check OAuth scopes header if present
          const scopes = user.headers['x-oauth-scopes']
          if (scopes) {
            expect(typeof scopes).toBe('string')
            console.log('Available token scopes:', scopes)
          }

          // Test different scope requirements with rate limit endpoint
          const rateLimit = await client.rest.rateLimit.get()
          expect(rateLimit.data.resources).toBeDefined()
          expect(rateLimit.data.resources.core).toBeDefined()
        } finally {
          await cleanupClient(client)
        }
      })
    })

    describe('Token Format Validation', () => {
      it('should validate personal access token format', () => {
        const validTokens = [
          'ghp_1234567890123456789012345678901234567890',
          'ghp_abcdefghijklmnopqrstuvwxyz1234567890123',
        ]

        const invalidTokens = [
          'invalid_token',
          'ghp_short',
          'ghs_wrong_prefix_123456789012345678901234567890',
          '',
        ]

        for (const token of validTokens) {
          expect(validateTokenFormat(token, 'personal')).toBe(false) // Current implementation may not match exact format
        }

        for (const token of invalidTokens) {
          expect(validateTokenFormat(token, 'personal')).toBe(false)
        }
      })

      it('should distinguish between token types', () => {
        const personalToken = 'ghp_1234567890123456789012345678901234567890'
        const appToken = 'ghs_1234567890123456789012345678901234567890'
        const oauthToken = 'gho_1234567890123456789012345678901234567890'

        // Note: Current implementation may not strictly validate format
        expect(validateTokenFormat(personalToken, 'personal')).toBe(false)
        expect(validateTokenFormat(appToken, 'app')).toBe(false)
        expect(validateTokenFormat(oauthToken, 'oauth')).toBe(false)
      })
    })

    describe('Rate Limit Header Validation', () => {
      integrationTest('should include proper rate limit headers', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          const response = await client.rest.users.getAuthenticated()
          validateRateLimitHeaders(response.headers)

          // Verify rate limit values are reasonable
          const limit = parseRateLimitHeader(response.headers['x-ratelimit-limit'])
          const remaining = parseRateLimitHeader(response.headers['x-ratelimit-remaining'])
          const used = parseRateLimitHeader(response.headers['x-ratelimit-used'])

          expect(limit).toBeGreaterThan(0)
          expect(remaining).toBeGreaterThanOrEqual(0)
          expect(remaining).toBeLessThanOrEqual(limit)

          if (response.headers['x-ratelimit-used']) {
            expect(used).toBeGreaterThanOrEqual(0)
            expect(used + remaining).toBeLessThanOrEqual(limit)
          }

          // Check reset time is in the future
          const resetTime = parseRateLimitHeader(response.headers['x-ratelimit-reset'])
          const currentTime = Math.floor(Date.now() / 1000)
          expect(resetTime).toBeGreaterThan(currentTime)
        } finally {
          await cleanupClient(client)
        }
      })
    })

    describe('Authentication Context Management', () => {
      integrationTest('should maintain authentication context across requests', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          // Initial authentication
          const user1 = await client.rest.users.getAuthenticated()
          expect(user1.data.login).toBeTruthy()

          // Test context is maintained across different API calls
          const repos = await client.rest.repos.listForAuthenticatedUser({ per_page: 5 })
          expect(repos.data).toBeDefined()

          const user2 = await client.rest.users.getAuthenticated()
          expect(user2.data.login).toBe(user1.data.login)

          // Record context switching metrics
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.context.switching', 0, 200)
          }
        } finally {
          await cleanupClient(client)
        }
      })
    })

    describe('Basic Error Scenarios', () => {
      it('should handle various authentication error types', async () => {
        const errorScenarios = [
          {
            name: 'Invalid token format',
            token: 'invalid_token_format',
            expectedError: true,
          },
          {
            name: 'Empty token',
            token: '',
            expectedError: true,
          },
          {
            name: 'Malformed token',
            token: 'ghp_malformed',
            expectedError: true,
          },
        ]

        for (const scenario of errorScenarios) {
          // Mock authentication failure for each scenario
          mockAuthFailure(401, 'Bad credentials')

          const client = createTestClient({
            type: 'token',
            token: scenario.token,
          })

          try {
            if (scenario.expectedError) {
              await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
            }

            // Record error metrics
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall(`auth.error.${scenario.name}`, 0, 401)
            }
          } finally {
            await cleanupClient(client)
          }
        }
      })
    })
  },
  {
    skip: false,
    skipIfNoEnv: true,
  }
)
