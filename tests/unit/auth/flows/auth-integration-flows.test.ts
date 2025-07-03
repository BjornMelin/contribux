/**
 * Integration Authentication Flows Test Suite
 *
 * Tests end-to-end authentication workflows including:
 * - Multi-provider authentication coordination
 * - Cross-service authentication flows
 * - Real-world authentication scenarios
 * - Performance and reliability testing
 * - Integration with external services
 */

import type { GitHubClient } from '@/lib/github/client'
import { afterEach, beforeEach, describe, expect } from 'vitest'
import type { IntegrationTestContext } from '../../integration/infrastructure/test-config'
import { describeIntegration, integrationTest } from '../../integration/infrastructure/test-runner'
import { rateLimitScenarios, testUsers } from './fixtures/auth-scenarios'
import {
  cleanupAuthMocks,
  mockGraphQLRateLimit,
  mockOAuthUserInfo,
  mockRateLimit,
} from './mocks/auth-provider-mocks'
import {
  cleanupClient,
  createTestClient,
  measureTestExecution,
  setupAuthTests,
  skipIfMissingAuth,
} from './setup/auth-setup'
import { measureAuthPerformance, validateAuthResponse } from './utils/auth-test-helpers'

describeIntegration(
  'Integration Authentication Flows',
  getContext => {
    let context: IntegrationTestContext

    beforeEach(() => {
      context = getContext()
      setupAuthTests(context)
    })

    afterEach(() => {
      cleanupAuthMocks()
    })

    describe('Multi-Provider Authentication Coordination', () => {
      integrationTest('should coordinate multiple authentication methods', async () => {
        const authMethods = [
          {
            name: 'Personal Access Token',
            config: {
              type: 'token',
              token: context.env.GITHUB_TEST_TOKEN || 'ghp_test_token',
            },
            requiresEnv: true,
          },
          {
            name: 'OAuth Token',
            config: {
              type: 'token', // OAuth tokens are used as bearer tokens
              token: 'gho_oauth_token_123456',
            },
            requiresEnv: false,
          },
        ]

        const results = []

        for (const method of authMethods) {
          if (method.requiresEnv && skipIfMissingAuth(context, { personalToken: true })) {
            console.log(`Skipping ${method.name} - environment not available`)
            continue
          }

          // Mock appropriate response
          if (method.config.type === 'token' && !method.requiresEnv) {
            mockOAuthUserInfo(testUsers.validUser)
          }

          const client = createTestClient(method.config)

          try {
            const { result: metrics, duration } = await measureTestExecution(async () => {
              return await validateAuthResponse(client, context, method.name.toLowerCase())
            })

            results.push({
              method: method.name,
              duration: metrics.duration,
              success: true,
            })

            expect(metrics.statusCode).toBe(200)
            expect(duration).toBeLessThan(10000)
          } catch (error) {
            results.push({
              method: method.name,
              error: error.message,
              success: false,
            })
          } finally {
            await cleanupClient(client)
          }
        }

        // Verify at least one authentication method succeeded
        const successfulMethods = results.filter(r => r.success)
        expect(successfulMethods.length).toBeGreaterThan(0)

        console.log('Authentication coordination results:', results)
      })

      integrationTest('should handle authentication fallback scenarios', async () => {
        const fallbackScenarios = [
          {
            primary: { type: 'token', token: 'invalid_primary_token' },
            fallback: { type: 'token', token: context.env.GITHUB_TEST_TOKEN },
            shouldSucceed: true,
          },
          {
            primary: { type: 'oauth', clientId: 'invalid_client', clientSecret: 'invalid_secret' },
            fallback: { type: 'token', token: context.env.GITHUB_TEST_TOKEN },
            shouldSucceed: true,
          },
        ]

        for (const scenario of fallbackScenarios) {
          if (skipIfMissingAuth(context, { personalToken: true })) {
            continue
          }

          // Try primary authentication (should fail)
          const primaryClient = createTestClient(scenario.primary)

          try {
            await primaryClient.rest.users.getAuthenticated()
            // If this succeeds unexpectedly, continue to fallback test
          } catch (error) {
            // Expected primary failure
            console.log('Primary authentication failed as expected:', error.message)
          } finally {
            await cleanupClient(primaryClient)
          }

          // Try fallback authentication (should succeed)
          const fallbackClient = createTestClient(scenario.fallback)

          try {
            const user = await fallbackClient.rest.users.getAuthenticated()
            if (scenario.shouldSucceed) {
              expect(user.data).toBeDefined()
              expect(user.data.login).toBeTruthy()
            }

            // Record fallback success
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.integration.fallback.success', 0, 200)
            }
          } finally {
            await cleanupClient(fallbackClient)
          }
        }
      })
    })

    describe('Cross-Service Authentication Flows', () => {
      integrationTest('should handle REST and GraphQL authentication consistently', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          // Test REST API authentication
          const restUser = await client.rest.users.getAuthenticated()
          expect(restUser.data).toBeDefined()
          expect(restUser.data.login).toBeTruthy()

          // Mock GraphQL rate limit response
          mockGraphQLRateLimit(testUsers.validUser, rateLimitScenarios.graphql)

          // Test GraphQL API authentication
          const graphqlQuery = `
            query {
              viewer {
                login
                email
              }
              rateLimit {
                limit
                cost
                remaining
                resetAt
              }
            }
          `

          const graphqlResult = await client.graphql(graphqlQuery)
          expect(graphqlResult.viewer).toBeDefined()
          expect(graphqlResult.viewer.login).toBeTruthy()
          expect(graphqlResult.rateLimit).toBeDefined()

          // Verify consistent authentication across APIs
          expect(graphqlResult.viewer.login).toBe(restUser.data.login)

          // Record cross-service success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.integration.cross_service.success', 0, 200)
          }
        } finally {
          await cleanupClient(client)
        }
      })

      integrationTest('should handle different rate limits across services', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        // Mock different rate limits for different services
        mockRateLimit({
          core: rateLimitScenarios.standard,
          search: { ...rateLimitScenarios.standard, limit: 30, remaining: 25 },
          graphql: rateLimitScenarios.graphql,
        })

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          const rateLimit = await client.rest.rateLimit.get()
          expect(rateLimit.data.resources).toBeDefined()

          // Verify different services have different limits
          expect(rateLimit.data.resources.core.limit).toBe(5000)
          expect(rateLimit.data.resources.search.limit).toBe(30)

          // Record rate limit consistency
          if (context.metricsCollector) {
            context.metricsCollector.recordRateLimit(
              'core',
              rateLimit.data.resources.core.remaining,
              rateLimit.data.resources.core.limit
            )
            context.metricsCollector.recordRateLimit(
              'search',
              rateLimit.data.resources.search.remaining,
              rateLimit.data.resources.search.limit
            )
          }
        } finally {
          await cleanupClient(client)
        }
      })
    })

    describe('Real-World Authentication Scenarios', () => {
      integrationTest('should handle production-like authentication flow', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          // Simulate typical application flow
          const steps = [
            {
              name: 'Authenticate User',
              action: () => client.rest.users.getAuthenticated(),
            },
            {
              name: 'Check Rate Limit',
              action: () => client.rest.rateLimit.get(),
            },
            {
              name: 'List Repositories',
              action: () => client.rest.repos.listForAuthenticatedUser({ per_page: 10 }),
            },
            {
              name: 'Verify Authentication Context',
              action: () => client.rest.users.getAuthenticated(),
            },
          ]

          const stepResults = []

          for (const step of steps) {
            const { result, duration } = await measureAuthPerformance(
              step.name,
              step.action,
              context
            )

            stepResults.push({
              step: step.name,
              duration,
              success: !!result,
            })

            expect(result).toBeDefined()
            expect(duration).toBeLessThan(5000)
          }

          // Verify entire flow completed successfully
          expect(stepResults.every(r => r.success)).toBe(true)

          const totalDuration = stepResults.reduce((sum, r) => sum + r.duration, 0)
          expect(totalDuration).toBeLessThan(15000) // Total flow under 15 seconds

          console.log('Production-like flow results:', stepResults)
        } finally {
          await cleanupClient(client)
        }
      })

      integrationTest('should handle concurrent authentication requests', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const concurrentRequests = 5
        const clients: GitHubClient[] = []
        const promises: Promise<unknown>[] = []

        try {
          // Create multiple clients with the same token
          for (let i = 0; i < concurrentRequests; i++) {
            const client = createTestClient({
              type: 'token',
              token: context.env.GITHUB_TEST_TOKEN,
            })
            clients.push(client)

            // Make concurrent authentication requests
            promises.push(client.rest.users.getAuthenticated())
          }

          // Wait for all requests to complete
          const results = await Promise.allSettled(promises)

          // Verify all requests succeeded
          const successfulResults = results.filter(r => r.status === 'fulfilled')
          expect(successfulResults.length).toBe(concurrentRequests)

          // Verify all results are consistent
          const firstResult = (successfulResults[0] as PromiseFulfilledResult<unknown>).value
          for (const result of successfulResults.slice(1)) {
            const userData = (result as PromiseFulfilledResult<unknown>).value
            expect(userData.data.login).toBe(firstResult.data.login)
          }

          // Record concurrent authentication success
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.integration.concurrent.success', 0, 200)
          }
        } finally {
          // Clean up all clients
          await Promise.all(clients.map(client => cleanupClient(client)))
        }
      })
    })

    describe('Performance and Reliability Testing', () => {
      integrationTest('should maintain performance under load', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const loadTestScenarios = [
          { name: 'Light Load', requests: 3, maxDuration: 3000 },
          { name: 'Medium Load', requests: 5, maxDuration: 5000 },
          { name: 'Heavy Load', requests: 10, maxDuration: 10000 },
        ]

        for (const scenario of loadTestScenarios) {
          const client = createTestClient({
            type: 'token',
            token: context.env.GITHUB_TEST_TOKEN,
          })

          try {
            const { duration } = await measureTestExecution(async () => {
              const promises = []
              for (let i = 0; i < scenario.requests; i++) {
                promises.push(client.rest.users.getAuthenticated())
              }
              return await Promise.all(promises)
            })

            expect(duration).toBeLessThan(scenario.maxDuration)

            // Record load test results
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall(
                `auth.integration.load.${scenario.name}`,
                duration,
                200
              )
            }

            console.log(`${scenario.name}: ${scenario.requests} requests in ${duration}ms`)
          } finally {
            await cleanupClient(client)
          }
        }
      })

      integrationTest('should demonstrate authentication reliability', async () => {
        if (skipIfMissingAuth(context, { personalToken: true })) {
          return
        }

        const reliabilityTests = 20
        const successCount = { value: 0 }
        const errors: string[] = []

        const client = createTestClient({
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        })

        try {
          const promises = Array.from({ length: reliabilityTests }, async (_, index) => {
            try {
              const user = await client.rest.users.getAuthenticated()
              expect(user.data).toBeDefined()
              successCount.value++
              return { success: true, index }
            } catch (error) {
              errors.push(`Test ${index}: ${error.message}`)
              return { success: false, index, error: error.message }
            }
          })

          const _results = await Promise.allSettled(promises)
          const reliability = (successCount.value / reliabilityTests) * 100

          // Expect high reliability (>95%)
          expect(reliability).toBeGreaterThanOrEqual(95)

          console.log(
            `Authentication reliability: ${reliability}% (${successCount.value}/${reliabilityTests})`
          )

          if (errors.length > 0) {
            console.log('Reliability test errors:', errors)
          }

          // Record reliability metrics
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.integration.reliability', reliability, 200)
          }
        } finally {
          await cleanupClient(client)
        }
      })
    })

    describe('Integration Health Checks', () => {
      integrationTest('should validate overall authentication health', async () => {
        const healthChecks = [
          {
            name: 'Token Validation',
            check: async () => {
              if (skipIfMissingAuth(context, { personalToken: true })) {
                return { status: 'skipped', reason: 'No token available' }
              }

              const client = createTestClient({
                type: 'token',
                token: context.env.GITHUB_TEST_TOKEN,
              })

              try {
                const user = await client.rest.users.getAuthenticated()
                return { status: 'healthy', data: { login: user.data.login } }
              } catch (error) {
                return { status: 'unhealthy', error: error.message }
              } finally {
                await cleanupClient(client)
              }
            },
          },
          {
            name: 'Rate Limit Check',
            check: async () => {
              if (skipIfMissingAuth(context, { personalToken: true })) {
                return { status: 'skipped', reason: 'No token available' }
              }

              const client = createTestClient({
                type: 'token',
                token: context.env.GITHUB_TEST_TOKEN,
              })

              try {
                const rateLimit = await client.rest.rateLimit.get()
                const remaining = rateLimit.data.resources.core.remaining

                return {
                  status: remaining > 100 ? 'healthy' : 'warning',
                  data: { remaining, limit: rateLimit.data.resources.core.limit },
                }
              } catch (error) {
                return { status: 'unhealthy', error: error.message }
              } finally {
                await cleanupClient(client)
              }
            },
          },
        ]

        const healthResults = []

        for (const healthCheck of healthChecks) {
          const result = await healthCheck.check()
          healthResults.push({
            name: healthCheck.name,
            ...result,
          })

          // Log health check result
          console.log(`Health check ${healthCheck.name}:`, result.status)
        }

        // Verify at least one health check is healthy
        const healthyChecks = healthResults.filter(r => r.status === 'healthy')
        expect(healthyChecks.length).toBeGreaterThan(0)

        // Record overall health
        if (context.metricsCollector) {
          context.metricsCollector.recordApiCall(
            'auth.integration.health',
            healthyChecks.length,
            200
          )
        }
      })
    })
  },
  {
    skip: false,
    skipIfNoEnv: true,
  }
)
