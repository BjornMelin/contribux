/**
 * GitHub App Authentication Flows Test Suite
 *
 * Tests GitHub App authentication functionality including:
 * - JWT generation and validation
 * - Installation token exchange
 * - App permissions and access control
 * - Token refresh and expiration handling
 * - Multi-installation management
 */

import { GitHubAuthenticationError } from '@/lib/github/errors'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IntegrationTestContext } from '../../integration/infrastructure/test-config'
import { describeIntegration, integrationTest } from '../../integration/infrastructure/test-runner'
import { jwtClaims } from './fixtures/auth-scenarios'
import {
  cleanupAuthMocks,
  mockAuthFailure,
  mockGitHubAppAuth,
  mockInstallationAuth,
  mockInstallationRepos,
} from './mocks/auth-provider-mocks'
import {
  cleanupClient,
  createTestClient,
  setupAuthTests,
  skipIfMissingAuth,
} from './setup/auth-setup'
import { measureAuthPerformance } from './utils/auth-test-helpers'

describeIntegration(
  'GitHub App Authentication Flows',
  getContext => {
    let context: IntegrationTestContext

    beforeEach(() => {
      context = getContext()
      setupAuthTests(context)
    })

    afterEach(() => {
      cleanupAuthMocks()
    })

    describe('GitHub App JWT Authentication', () => {
      integrationTest(
        'should generate valid JWT for GitHub App',
        async () => {
          if (skipIfMissingAuth(context, { githubApp: true })) {
            return
          }

          const appId = Number.parseInt(context.env.GITHUB_APP_ID || '0')

          // Mock GitHub App authentication
          mockGitHubAppAuth(appId, 'Test Contribux App')

          const client = createTestClient({
            type: 'app',
            appId,
            privateKey: context.env.GITHUB_APP_PRIVATE_KEY || '',
          })

          try {
            // Authenticate to generate JWT
            await client.authenticate()

            // Verify JWT generation by accessing app details
            const app = await client.rest.apps.getAuthenticated()
            expect(app.data).toBeDefined()
            expect(app.data.id).toBe(appId)
            expect(app.data.name).toBeTruthy()

            // Record successful JWT generation
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.app.jwt.success', 0, 200)
            }
          } finally {
            await cleanupClient(client)
          }
        },
        { timeout: 10000 }
      )

      integrationTest('should fail with invalid GitHub App credentials', async () => {
        // Mock authentication failure
        mockAuthFailure(401, 'JWT signature verification failed')

        const client = createTestClient({
          type: 'app',
          appId: 999999,
          privateKey: '-----BEGIN RSA PRIVATE KEY-----\nINVALID_KEY\n-----END RSA PRIVATE KEY-----',
        })

        try {
          await expect(client.authenticate()).rejects.toThrow(GitHubAuthenticationError)

          // Record authentication failure
          if (context.metricsCollector) {
            context.metricsCollector.recordApiCall('auth.app.failure', 0, 401)
          }
        } finally {
          await cleanupClient(client)
        }
      })

      integrationTest(
        'should handle JWT expiration and refresh',
        async () => {
          if (skipIfMissingAuth(context, { githubApp: true })) {
            return
          }

          const appId = Number.parseInt(context.env.GITHUB_APP_ID || '0')

          // Mock GitHub App responses
          mockGitHubAppAuth(appId, 'Test Contribux App')

          const client = createTestClient({
            type: 'app',
            appId,
            privateKey: context.env.GITHUB_APP_PRIVATE_KEY || '',
          })

          try {
            // Initial authentication
            await client.authenticate()

            // Verify initial authentication
            const app1 = await client.rest.apps.getAuthenticated()
            expect(app1.data).toBeDefined()

            // Simulate token refresh
            await client.refreshTokenIfNeeded()

            // Mock second app response for refresh verification
            mockGitHubAppAuth(appId, 'Test Contribux App')

            // Verify still authenticated after refresh
            const app2 = await client.rest.apps.getAuthenticated()
            expect(app2.data).toBeDefined()
            expect(app2.data.id).toBe(app1.data.id)

            // Record refresh success
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.app.refresh.success', 0, 200)
            }
          } finally {
            await cleanupClient(client)
          }
        },
        { timeout: 15000 }
      )
    })

    describe('Installation Token Exchange', () => {
      integrationTest(
        'should handle installation token exchange',
        async () => {
          if (skipIfMissingAuth(context, { githubApp: true, installation: true })) {
            return
          }

          const appId = Number.parseInt(context.env.GITHUB_APP_ID || '0')
          const installationId = Number.parseInt(context.env.GITHUB_APP_INSTALLATION_ID || '0')

          // Mock installation authentication
          mockInstallationAuth(installationId, appId)
          mockInstallationRepos([
            {
              id: 123456,
              name: 'test-repo',
              full_name: 'testorg/test-repo',
              private: false,
              permissions: {
                admin: false,
                push: true,
                pull: true,
              },
            },
          ])

          const client = createTestClient({
            type: 'app',
            appId,
            privateKey: context.env.GITHUB_APP_PRIVATE_KEY || '',
            installationId,
          })

          try {
            // Authenticate as installation
            await client.authenticateAsInstallation(installationId)

            // Verify installation token works
            const installation = await client.rest.apps.getInstallation({
              installation_id: installationId,
            })
            expect(installation.data).toBeDefined()
            expect(installation.data.id).toBe(installationId)
            expect(installation.data.app_id).toBe(appId)

            // Test repository access
            const repos = await client.rest.apps.listReposAccessibleToInstallation()
            expect(repos.data).toBeDefined()
            expect(repos.data.repositories).toBeDefined()
            expect(Array.isArray(repos.data.repositories)).toBe(true)

            // Record installation success
            if (context.metricsCollector) {
              context.metricsCollector.recordApiCall('auth.app.installation.success', 0, 200)
            }
          } finally {
            await cleanupClient(client)
          }
        },
        { timeout: 15000 }
      )

      integrationTest(
        'should validate installation permissions',
        async () => {
          if (skipIfMissingAuth(context, { installation: true })) {
            return
          }

          const installationId = Number.parseInt(context.env.GITHUB_APP_INSTALLATION_ID || '0')
          const appId = Number.parseInt(context.env.GITHUB_APP_ID || '0')

          // Mock installation with specific permissions
          mockInstallationAuth(installationId, appId)

          const client = createTestClient({
            type: 'app',
            appId,
            privateKey: context.env.GITHUB_APP_PRIVATE_KEY || '',
          })

          try {
            await client.authenticateAsInstallation(installationId)

            const installation = await client.rest.apps.getInstallation({
              installation_id: installationId,
            })

            // Verify installation permissions
            expect(installation.data.permissions).toBeDefined()
            expect(installation.data.permissions.contents).toBeDefined()
            expect(installation.data.permissions.metadata).toBeDefined()

            // Log available permissions
            console.log('Installation permissions:', installation.data.permissions)
          } finally {
            await cleanupClient(client)
          }
        },
        { timeout: 10000 }
      )
    })

    describe('App Permission Management', () => {
      it('should validate JWT claims structure', () => {
        const validClaims = jwtClaims.valid
        const expiredClaims = jwtClaims.expired
        const futureClaims = jwtClaims.future

        // Valid claims should have proper structure
        expect(validClaims.iss).toBeTypeOf('number')
        expect(validClaims.exp).toBeGreaterThan(validClaims.iat)
        expect(validClaims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))

        // Expired claims should be in the past
        expect(expiredClaims.exp).toBeLessThan(Math.floor(Date.now() / 1000))

        // Future claims should be invalid (iat in future)
        expect(futureClaims.iat).toBeGreaterThan(Math.floor(Date.now() / 1000))
      })

      integrationTest(
        'should handle different installation types',
        async () => {
          const installationTypes = [
            {
              name: 'Organization Installation',
              targetType: 'Organization',
              targetId: 67890,
            },
            {
              name: 'User Installation',
              targetType: 'User',
              targetId: 12345,
            },
          ]

          for (const installationType of installationTypes) {
            const installationId = 12345 + Math.floor(Math.random() * 1000)
            const appId = Number.parseInt(context.env.GITHUB_APP_ID || '12345')

            // Mock installation for this type
            mockInstallationAuth(installationId, appId)

            const client = createTestClient({
              type: 'app',
              appId,
              privateKey: context.env.GITHUB_APP_PRIVATE_KEY || 'test_key',
            })

            try {
              await client.authenticateAsInstallation(installationId)

              const installation = await client.rest.apps.getInstallation({
                installation_id: installationId,
              })

              expect(installation.data.target_type).toBe(installationType.targetType)

              // Record installation type handling
              if (context.metricsCollector) {
                context.metricsCollector.recordApiCall(
                  `auth.app.installation.${installationType.targetType.toLowerCase()}`,
                  0,
                  200
                )
              }
            } finally {
              await cleanupClient(client)
            }
          }
        },
        { timeout: 20000 }
      )
    })

    describe('Multi-Installation Management', () => {
      integrationTest(
        'should handle multiple installations',
        async () => {
          const installations = [
            { id: 11111, targetId: 67890, targetType: 'Organization' },
            { id: 22222, targetId: 12345, targetType: 'User' },
          ]

          const appId = Number.parseInt(context.env.GITHUB_APP_ID || '12345')

          for (const installation of installations) {
            // Mock each installation
            mockInstallationAuth(installation.id, appId)

            const client = createTestClient({
              type: 'app',
              appId,
              privateKey: context.env.GITHUB_APP_PRIVATE_KEY || 'test_key',
            })

            try {
              await client.authenticateAsInstallation(installation.id)

              const installationData = await client.rest.apps.getInstallation({
                installation_id: installation.id,
              })

              expect(installationData.data.id).toBe(installation.id)
              expect(installationData.data.target_type).toBe(installation.targetType)

              // Record multi-installation handling
              if (context.metricsCollector) {
                context.metricsCollector.recordApiCall(
                  'auth.app.multi_installation.success',
                  0,
                  200
                )
              }
            } finally {
              await cleanupClient(client)
            }
          }
        },
        { timeout: 25000 }
      )
    })

    describe('App Authentication Performance', () => {
      integrationTest(
        'should measure app authentication performance',
        async () => {
          if (skipIfMissingAuth(context, { githubApp: true })) {
            return
          }

          const appId = Number.parseInt(context.env.GITHUB_APP_ID || '0')

          // Mock GitHub App authentication
          mockGitHubAppAuth(appId, 'Performance Test App')

          const client = createTestClient({
            type: 'app',
            appId,
            privateKey: context.env.GITHUB_APP_PRIVATE_KEY || '',
          })

          try {
            const { duration } = await measureAuthPerformance(
              'GitHub App JWT Authentication',
              async () => {
                await client.authenticate()
                return await client.rest.apps.getAuthenticated()
              },
              context
            )

            // JWT generation should be fast
            expect(duration).toBeLessThan(2000)

            console.log(`GitHub App authentication completed in ${duration}ms`)
          } finally {
            await cleanupClient(client)
          }
        },
        { timeout: 10000 }
      )
    })
  },
  {
    skip: false,
    skipIfNoEnv: true,
  }
)
