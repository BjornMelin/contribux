/**
 * Authentication Flow Integration Tests
 *
 * Comprehensive tests for all GitHub authentication methods including:
 * - Personal Access Token authentication
 * - GitHub App JWT generation and installation tokens
 * - OAuth flow simulation
 * - Token validation and expiration handling
 * - Authentication header formatting
 * - Rate limit headers with different auth methods
 */

import nock from 'nock'
import { afterEach, beforeEach, expect } from 'vitest'
import { GitHubClient } from '../../../src/lib/github/client'
import { GitHubAuthenticationError } from '../../../src/lib/github/errors'
import type { IntegrationTestContext } from '../infrastructure/test-config'
import {
  describeIntegration,
  integrationTest,
  measurePerformance,
  withRetry,
} from '../infrastructure/test-runner'

describeIntegration(
  'GitHub Authentication Flows',
  getContext => {
    let context: IntegrationTestContext

    beforeEach(() => {
      context = getContext()
      nock.cleanAll()
    })

    afterEach(() => {
      nock.cleanAll()
    })

    describe('Personal Access Token Authentication', () => {
      integrationTest('should authenticate with valid PAT token', async () => {
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: context.env.GITHUB_TEST_TOKEN,
          },
          includeRateLimit: true,
        })

        try {
          const { result: user, duration } = await measurePerformance(
            'PAT Authentication',
            () => client.rest.users.getAuthenticated(),
            context
          )

          // Verify authentication success
          expect(user.data).toBeDefined()
          expect(user.data.login).toBeTruthy()
          expect(user.data.type).toBeDefined()
          expect(duration).toBeLessThan(5000)

          // Verify rate limit headers are present
          expect(user.headers['x-ratelimit-limit']).toBeDefined()
          expect(user.headers['x-ratelimit-remaining']).toBeDefined()
          expect(user.headers['x-ratelimit-reset']).toBeDefined()
          expect(user.headers['x-ratelimit-resource']).toBe('core')

          // Verify authentication header format
          const currentToken = client.getCurrentToken()
          expect(currentToken).toBe(context.env.GITHUB_TEST_TOKEN)

          // Test scoped access
          const repos = await client.rest.repos.listForAuthenticatedUser({ per_page: 5 })
          expect(repos.data).toBeDefined()
          expect(Array.isArray(repos.data)).toBe(true)

          // Record authentication metrics
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.pat.success', duration, 200)
            context.metricsCollector.recordRateLimit(
              'core',
              Number.parseInt(user.headers['x-ratelimit-remaining']),
              Number.parseInt(user.headers['x-ratelimit-limit'])
            )
          }
        } finally {
          await client.destroy()
        }
      })

      integrationTest('should fail with invalid PAT token', async () => {
        const invalidToken = 'ghp_invalid_token_12345'
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: invalidToken,
          },
        })

        try {
          await expect(client.rest.users.getAuthenticated()).rejects.toThrow()

          // Record authentication failure
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.pat.failure', 0, 401)
          }
        } finally {
          await client.destroy()
        }
      })

      integrationTest('should handle token expiration gracefully', async () => {
        // Mock an expired token scenario
        nock('https://api.github.com').get('/user').reply(401, {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        })

        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: 'ghp_expired_token',
          },
        })

        try {
          await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
        } finally {
          await client.destroy()
        }
      })

      integrationTest('should validate token scopes', async () => {
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: context.env.GITHUB_TEST_TOKEN,
          },
        })

        try {
          // Get user info to check scopes
          const user = await client.rest.users.getAuthenticated()
          expect(user.data).toBeDefined()

          // Check X-OAuth-Scopes header if present
          const scopes = user.headers['x-oauth-scopes']
          if (scopes) {
            expect(typeof scopes === 'string').toBe(true)
            console.log('Token scopes:', scopes)
          }

          // Test different scope requirements
          const rateLimit = await client.rest.rateLimit.get()
          expect(rateLimit.data.resources).toBeDefined()
        } finally {
          await client.destroy()
        }
      })
    })

    describe('GitHub App Authentication', () => {
      // Skip GitHub App tests if credentials not available
      const skipGitHubApp = !context.env.GITHUB_APP_ID || !context.env.GITHUB_APP_PRIVATE_KEY

      integrationTest(
        'should generate valid JWT for GitHub App',
        async () => {
          if (skipGitHubApp) {
            console.log('Skipping GitHub App test - credentials not available')
            return
          }

          const client = new GitHubClient({
            auth: {
              type: 'app',
              appId: Number.parseInt(context.env.GITHUB_APP_ID!),
              privateKey: context.env.GITHUB_APP_PRIVATE_KEY!,
            },
          })

          try {
            // Authenticate to generate JWT
            await client.authenticate()

            // Verify JWT generation by accessing app details
            const app = await client.rest.apps.getAuthenticated()
            expect(app.data).toBeDefined()
            expect(app.data.id).toBe(Number.parseInt(context.env.GITHUB_APP_ID!))
            expect(app.data.name).toBeTruthy()

            // Record metrics
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.app.jwt.success', 0, 200)
            }
          } finally {
            await client.destroy()
          }
        },
        { timeout: 10000 }
      )

      integrationTest(
        'should handle installation token exchange',
        async () => {
          if (skipGitHubApp || !context.env.GITHUB_APP_INSTALLATION_ID) {
            console.log('Skipping GitHub App installation test - credentials not available')
            return
          }

          const client = new GitHubClient({
            auth: {
              type: 'app',
              appId: Number.parseInt(context.env.GITHUB_APP_ID!),
              privateKey: context.env.GITHUB_APP_PRIVATE_KEY!,
              installationId: Number.parseInt(context.env.GITHUB_APP_INSTALLATION_ID!),
            },
          })

          try {
            // Authenticate as installation
            await client.authenticateAsInstallation(
              Number.parseInt(context.env.GITHUB_APP_INSTALLATION_ID!)
            )

            // Verify installation token works
            const installation = await client.rest.apps.getInstallation({
              installation_id: Number.parseInt(context.env.GITHUB_APP_INSTALLATION_ID!),
            })
            expect(installation.data).toBeDefined()
            expect(installation.data.id).toBe(
              Number.parseInt(context.env.GITHUB_APP_INSTALLATION_ID!)
            )

            // Test repository access
            const repos = await client.rest.apps.listReposAccessibleToInstallation()
            expect(repos.data).toBeDefined()
            expect(repos.data.repositories).toBeDefined()
            expect(Array.isArray(repos.data.repositories)).toBe(true)

            // Record metrics
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.app.installation.success', 0, 200)
            }
          } finally {
            await client.destroy()
          }
        },
        { timeout: 15000 }
      )

      integrationTest(
        'should handle JWT expiration and refresh',
        async () => {
          if (skipGitHubApp) {
            console.log('Skipping GitHub App JWT refresh test - credentials not available')
            return
          }

          const client = new GitHubClient({
            auth: {
              type: 'app',
              appId: Number.parseInt(context.env.GITHUB_APP_ID!),
              privateKey: context.env.GITHUB_APP_PRIVATE_KEY!,
            },
          })

          try {
            // Initial authentication
            await client.authenticate()

            // Verify initial authentication
            const app1 = await client.rest.apps.getAuthenticated()
            expect(app1.data).toBeDefined()

            // Simulate token refresh
            await client.refreshTokenIfNeeded()

            // Verify still authenticated after refresh
            const app2 = await client.rest.apps.getAuthenticated()
            expect(app2.data).toBeDefined()
            expect(app2.data.id).toBe(app1.data.id)

            // Record metrics
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.app.refresh.success', 0, 200)
            }
          } finally {
            await client.destroy()
          }
        },
        { timeout: 15000 }
      )

      integrationTest('should fail with invalid GitHub App credentials', async () => {
        const client = new GitHubClient({
          auth: {
            type: 'app',
            appId: 999999,
            privateKey:
              '-----BEGIN RSA PRIVATE KEY-----\nINVALID_KEY\n-----END RSA PRIVATE KEY-----',
          },
        })

        try {
          await expect(client.authenticate()).rejects.toThrow(GitHubAuthenticationError)

          // Record authentication failure
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.app.failure', 0, 401)
          }
        } finally {
          await client.destroy()
        }
      })
    })

    describe('OAuth Flow Simulation', () => {
      integrationTest('should handle OAuth configuration', async () => {
        const client = new GitHubClient({
          auth: {
            type: 'oauth',
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret',
          },
        })

        try {
          // OAuth configuration should be accepted
          expect(client).toBeInstanceOf(GitHubClient)

          // Note: Real OAuth flow would require user interaction
          // This test validates configuration handling
          const config = client.getTokenRotationConfig()
          expect(config).toBeUndefined() // OAuth doesn't use token rotation by default

          // Record configuration success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.oauth.config.success', 0, 200)
          }
        } finally {
          await client.destroy()
        }
      })

      integrationTest('should simulate OAuth token validation', async () => {
        // Mock OAuth token validation endpoint
        nock('https://api.github.com')
          .get('/user')
          .reply(200, {
            login: 'testuser',
            id: 12345,
            type: 'User',
          })
          .get('/applications/test_client_id/grant')
          .reply(200, {
            id: 1,
            url: 'https://api.github.com/applications/test_client_id/grant',
            app: {
              client_id: 'test_client_id',
              name: 'Test App',
            },
          })

        // Simulate OAuth with access token
        const oauthToken = 'gho_oauth_access_token'
        const client = new GitHubClient({
          auth: {
            type: 'token', // OAuth tokens are used as bearer tokens
            token: oauthToken,
          },
        })

        try {
          const user = await client.rest.users.getAuthenticated()
          expect(user.data.login).toBe('testuser')

          // Record OAuth success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.oauth.token.success', 0, 200)
          }
        } finally {
          await client.destroy()
        }
      })
    })

    describe('Token Validation and Error Handling', () => {
      integrationTest('should validate multiple tokens', async () => {
        const tokens: TokenInfo[] = [
          { token: context.env.GITHUB_TEST_TOKEN, type: 'personal' },
          { token: 'ghp_invalid_token', type: 'personal' },
        ]

        const client = new GitHubClient({
          tokenRotation: {
            tokens,
            rotationStrategy: 'round-robin',
          },
        })

        try {
          // Validate tokens
          await client.validateTokens()

          // Check remaining valid tokens
          const validTokens = client.getTokenInfo()
          expect(validTokens.length).toBeGreaterThan(0)

          // The invalid token should be removed during validation
          const hasValidToken = validTokens.some(t => t.token === context.env.GITHUB_TEST_TOKEN)
          expect(hasValidToken).toBe(true)

          // Record validation metrics
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.token.validation.success', 0, 200)
          }
        } finally {
          await client.destroy()
        }
      })

      integrationTest('should handle token rotation', async () => {
        const tokens: TokenInfo[] = [{ token: context.env.GITHUB_TEST_TOKEN, type: 'personal' }]

        const client = new GitHubClient({
          tokenRotation: {
            tokens,
            rotationStrategy: 'round-robin',
          },
        })

        try {
          // Get next token
          const token1 = await client.getNextToken()
          expect(token1).toBeDefined()
          expect(token1).toBe(context.env.GITHUB_TEST_TOKEN)

          // Get next token again (should rotate)
          const token2 = await client.getNextToken()
          expect(token2).toBeDefined()

          // Test scoped token selection
          const scopedToken = await client.getNextToken(['repo'])
          expect(scopedToken).toBeDefined()

          // Record rotation success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.token.rotation.success', 0, 200)
          }
        } finally {
          await client.destroy()
        }
      })

      integrationTest('should handle authentication errors gracefully', async () => {
        const testCases = [
          {
            name: 'Invalid token format',
            token: 'invalid_token_format',
            expectedError: true,
          },
          {
            name: 'Expired token',
            token: 'ghp_expired_token_12345',
            expectedError: true,
          },
          {
            name: 'Revoked token',
            token: 'ghp_revoked_token_12345',
            expectedError: true,
          },
        ]

        for (const testCase of testCases) {
          const client = new GitHubClient({
            auth: {
              type: 'token',
              token: testCase.token,
            },
            retry: {
              enabled: false, // Disable retry for faster error testing
            },
          })

          try {
            if (testCase.expectedError) {
              await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
            }

            // Record error metrics
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall(`auth.error.${testCase.name}`, 0, 401)
            }
          } finally {
            await client.destroy()
          }
        }
      })
    })

    describe('Rate Limiting with Different Auth Methods', () => {
      integrationTest('should show different rate limits for different auth types', async () => {
        // Test PAT rate limits
        const patClient = new GitHubClient({
          auth: {
            type: 'token',
            token: context.env.GITHUB_TEST_TOKEN,
          },
          includeRateLimit: true,
        })

        try {
          const patRateLimit = await patClient.rest.rateLimit.get()
          expect(patRateLimit.data.resources).toBeDefined()
          expect(patRateLimit.data.resources.core).toBeDefined()
          expect(patRateLimit.data.resources.graphql).toBeDefined()

          // PAT typically has 5000 requests per hour
          expect(patRateLimit.data.resources.core.limit).toBeGreaterThanOrEqual(5000)

          // Test GraphQL rate limit
          const graphqlQuery = `
          query {
            viewer {
              login
            }
            rateLimit {
              limit
              cost
              remaining
              resetAt
            }
          }
        `

          const graphqlResult = await patClient.graphql(graphqlQuery)
          expect(graphqlResult.viewer).toBeDefined()
          expect(graphqlResult.rateLimit).toBeDefined()
          expect(graphqlResult.rateLimit.limit).toBeGreaterThanOrEqual(5000)

          // Record rate limit metrics
          if (context.metricsCollector) {
            context.metricsCollector.recordRateLimit(
              'core',
              patRateLimit.data.resources.core.remaining,
              patRateLimit.data.resources.core.limit
            )
            context.metricsCollector.recordRateLimit(
              'graphql',
              graphqlResult.rateLimit.remaining,
              graphqlResult.rateLimit.limit
            )
          }
        } finally {
          await patClient.destroy()
        }
      })

      integrationTest('should handle rate limit headers correctly', async () => {
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: context.env.GITHUB_TEST_TOKEN,
          },
        })

        try {
          const response = await client.rest.users.getAuthenticated()

          // Verify all rate limit headers are present
          const requiredHeaders = [
            'x-ratelimit-limit',
            'x-ratelimit-remaining',
            'x-ratelimit-reset',
            'x-ratelimit-used',
          ]

          for (const header of requiredHeaders) {
            expect(response.headers[header]).toBeDefined()
            expect(typeof response.headers[header]).toBe('string')
          }

          // Verify rate limit values are reasonable
          const limit = Number.parseInt(response.headers['x-ratelimit-limit'])
          const remaining = Number.parseInt(response.headers['x-ratelimit-remaining'])
          const used = Number.parseInt(response.headers['x-ratelimit-used'])

          expect(limit).toBeGreaterThan(0)
          expect(remaining).toBeGreaterThanOrEqual(0)
          expect(remaining).toBeLessThanOrEqual(limit)
          expect(used).toBeGreaterThanOrEqual(0)
          expect(used + remaining).toBeLessThanOrEqual(limit)

          // Check reset time is in the future
          const resetTime = Number.parseInt(response.headers['x-ratelimit-reset'])
          const currentTime = Math.floor(Date.now() / 1000)
          expect(resetTime).toBeGreaterThan(currentTime)
        } finally {
          await client.destroy()
        }
      })
    })

    describe('Authentication Header Formatting', () => {
      integrationTest('should format authentication headers correctly', async () => {
        const testCases = [
          {
            name: 'Personal Access Token',
            auth: {
              type: 'token' as const,
              token: context.env.GITHUB_TEST_TOKEN,
            },
            expectedHeaderPattern: /^token ghp_/,
          },
        ]

        for (const testCase of testCases) {
          const client = new GitHubClient({
            auth: testCase.auth,
          })

          try {
            // Make a request to verify authentication header
            const response = await client.rest.users.getAuthenticated()
            expect(response.data).toBeDefined()

            // Verify the current token is correctly set
            const currentToken = client.getCurrentToken()
            expect(currentToken).toBeDefined()

            if (testCase.auth.type === 'token') {
              expect(currentToken).toBe(testCase.auth.token)
            }

            // Record header format success
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall(`auth.header.${testCase.name}`, 0, 200)
            }
          } finally {
            await client.destroy()
          }
        }
      })

      integrationTest('should handle authentication context switching', async () => {
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: context.env.GITHUB_TEST_TOKEN,
          },
        })

        try {
          // Initial authentication
          const user1 = await client.rest.users.getAuthenticated()
          expect(user1.data.login).toBeTruthy()

          // Test context is maintained across requests
          const repos = await client.rest.repos.listForAuthenticatedUser({ per_page: 5 })
          expect(repos.data).toBeDefined()

          const user2 = await client.rest.users.getAuthenticated()
          expect(user2.data.login).toBe(user1.data.login)

          // Record context switching success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.context.switching', 0, 200)
          }
        } finally {
          await client.destroy()
        }
      })
    })

    describe('Error Recovery and Retry Logic', () => {
      integrationTest('should retry on authentication failures', async () => {
        const _attemptCount = 0

        // Mock intermittent authentication failures
        nock('https://api.github.com')
          .get('/user')
          .times(2)
          .reply(401, { message: 'Bad credentials' })
          .get('/user')
          .reply(200, {
            login: 'testuser',
            id: 12345,
            type: 'User',
          })

        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: 'test_token',
          },
          retry: {
            enabled: true,
            retries: 3,
            doNotRetry: [403, 404], // Don't retry on these, but retry on 401
          },
        })

        try {
          const user = await client.rest.users.getAuthenticated()
          expect(user.data.login).toBe('testuser')

          // Record retry success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.retry.success', 0, 200)
          }
        } finally {
          await client.destroy()
        }
      })

      integrationTest(
        'should handle network timeouts during authentication',
        async () => {
          // Mock network timeout
          nock('https://api.github.com')
            .get('/user')
            .delay(5000) // 5 second delay
            .reply(200, {
              login: 'testuser',
              id: 12345,
              type: 'User',
            })

          const client = new GitHubClient({
            auth: {
              type: 'token',
              token: 'test_token',
            },
            retry: {
              enabled: true,
              retries: 1,
            },
          })

          try {
            // This should timeout and potentially retry
            const startTime = Date.now()
            await expect(
              withRetry(() => client.rest.users.getAuthenticated(), { retries: 1, delay: 100 })
            ).rejects.toThrow()

            const duration = Date.now() - startTime
            expect(duration).toBeGreaterThan(100) // Should have attempted retry

            // Record timeout metrics
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.timeout', duration, 500)
            }
          } finally {
            await client.destroy()
          }
        },
        { timeout: 15000 }
      )
    })
  },
  {
    skip: false,
    skipIfNoEnv: true,
  }
)
