/**
 * GitHub Authentication Edge Cases Test Suite
 *
 * Comprehensive testing of authentication failures, token validation,
 * permission edge cases, and security scenarios.
 *
 * Test Coverage:
 * - Authentication Token Validation
 * - Authorization and Permission Failures
 * - Token Expiration and Refresh
 * - Security Context Edge Cases
 * - Multi-User Authentication Scenarios
 * - OAuth Flow Edge Cases
 */

import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mswServer } from '../msw-setup'
import { INVALID_TOKENS } from './fixtures/error-scenarios'
import { createEdgeCaseClient, setupEdgeCaseTestIsolation } from './setup/edge-case-setup'

describe('GitHub Authentication Edge Cases', () => {
  // Setup MSW and enhanced test isolation
  setupEdgeCaseTestIsolation()

  describe('Authentication Token Validation', () => {
    it('should handle invalid authentication tokens', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.malformed })

      mswServer.use(
        http.get('https://api.github.com/repos/auth-test/invalid-token', () => {
          return HttpResponse.json(
            {
              message: 'Bad credentials',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('auth-test', 'invalid-token')).rejects.toThrow()
    })

    it('should handle expired authentication tokens', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.expired })

      mswServer.use(
        http.get('https://api.github.com/repos/auth-test/expired-token', () => {
          return HttpResponse.json(
            {
              message: 'Token expired',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('auth-test', 'expired-token')).rejects.toThrow()
    })

    it('should handle revoked authentication tokens', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.revoked })

      mswServer.use(
        http.get('https://api.github.com/repos/auth-test/revoked-token', () => {
          return HttpResponse.json(
            {
              message: 'Token revoked',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('auth-test', 'revoked-token')).rejects.toThrow()
    })

    it('should handle malformed token format', async () => {
      const client = createEdgeCaseClient({ token: 'invalid-token-format' })

      mswServer.use(
        http.get('https://api.github.com/repos/auth-test/malformed-format', () => {
          return HttpResponse.json(
            {
              message: 'Bad credentials',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('auth-test', 'malformed-format')).rejects.toThrow()
    })

    it('should handle empty or null tokens', async () => {
      const emptyTokenClient = createEdgeCaseClient({ token: '' })

      mswServer.use(
        http.get('https://api.github.com/repos/auth-test/empty-token', () => {
          return HttpResponse.json(
            {
              message: 'Requires authentication',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(emptyTokenClient.getRepository('auth-test', 'empty-token')).rejects.toThrow()
    })
  })

  describe('Authorization and Permission Failures', () => {
    it('should handle insufficient permissions for repository access', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/private-org/secret-repo', () => {
          return HttpResponse.json(
            {
              message: 'Not Found',
              documentation_url: 'https://docs.github.com/rest/repos/repos#get-a-repository',
            },
            { status: 404 }
          )
        })
      )

      await expect(client.getRepository('private-org', 'secret-repo')).rejects.toThrow()
    })

    it('should handle permission denied for organization resources', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/orgs/restricted-org', () => {
          return HttpResponse.json(
            {
              message: 'Must be an organization member',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 403 }
          )
        })
      )

      await expect(client.getOrganization('restricted-org')).rejects.toThrow()
    })

    it('should handle scope limitations in token permissions', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.limitedScope })

      mswServer.use(
        http.get('https://api.github.com/repos/scope-test/repository', () => {
          return HttpResponse.json(
            {
              message: "Missing the 'repo' scope. Please check your token has the required scopes.",
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 403 }
          )
        })
      )

      await expect(client.getRepository('scope-test', 'repository')).rejects.toThrow()
    })

    it('should handle rate limit exceptions for authenticated users', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/rate-limit/authenticated', () => {
          return HttpResponse.json(
            {
              message: 'API rate limit exceeded for user ID 123456.',
              documentation_url:
                'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
            },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': '5000',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
            }
          )
        })
      )

      await expect(client.getRepository('rate-limit', 'authenticated')).rejects.toThrow()
    })

    it.skip('should handle permission changes during operation', async () => {
      const client = createEdgeCaseClient()
      let requestCount = 0

      mswServer.use(
        http.get('https://api.github.com/repos/permission-change/repository', () => {
          requestCount++

          if (requestCount === 1) {
            // First request succeeds
            return HttpResponse.json({
              id: 123456,
              name: 'repository',
              full_name: 'permission-change/repository',
              owner: {
                login: 'permission-change',
                id: 1,
                avatar_url: 'https://github.com/images/error/permission-change_happy.gif',
                html_url: 'https://github.com/permission-change',
                type: 'User',
                site_admin: false,
              },
              private: false,
              html_url: 'https://github.com/permission-change/repository',
              description: 'Test repository for permission changes',
              fork: false,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              stargazers_count: 0,
              forks_count: 0,
              language: 'JavaScript',
              default_branch: 'main',
            })
          }
          // Subsequent requests fail due to permission change
          return HttpResponse.json(
            {
              message: 'Not Found',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 404 }
          )
        })
      )

      // First request should succeed
      const repo1 = await client.getRepository('permission-change', 'repository')
      expect(repo1).toBeDefined()

      // Second request should fail
      await expect(client.getRepository('permission-change', 'repository')).rejects.toThrow()
    })
  })

  describe('Token Expiration and Refresh', () => {
    it('should handle token expiration during long-running operations', async () => {
      const client = createEdgeCaseClient()
      let callCount = 0

      mswServer.use(
        http.get('https://api.github.com/repos/token-expiry/long-operation', () => {
          callCount++

          if (callCount <= 2) {
            return HttpResponse.json({
              id: 123456,
              name: 'long-operation',
              full_name: 'token-expiry/long-operation',
              owner: {
                login: 'token-expiry',
                id: 1,
                avatar_url: 'https://github.com/images/error/token-expiry_happy.gif',
                html_url: 'https://github.com/token-expiry',
                type: 'User',
                site_admin: false,
              },
              private: false,
              html_url: 'https://github.com/token-expiry/long-operation',
              description: 'Test repository for token expiration',
              fork: false,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              stargazers_count: 0,
              forks_count: 0,
              language: 'JavaScript',
              default_branch: 'main',
            })
          }
          // Token expires after some time
          return HttpResponse.json(
            {
              message: 'Token expired',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      // First two calls succeed
      await client.getRepository('token-expiry', 'long-operation')
      await client.getRepository('token-expiry', 'long-operation')

      // Third call fails due to expired token
      await expect(client.getRepository('token-expiry', 'long-operation')).rejects.toThrow()
    })

    it('should handle token refresh failure scenarios', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.refreshFailed })

      mswServer.use(
        http.get('https://api.github.com/repos/refresh-fail/repository', () => {
          return HttpResponse.json(
            {
              message: 'Token refresh failed',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('refresh-fail', 'repository')).rejects.toThrow()
    })

    it('should handle concurrent token expiration', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/concurrent-expiry/:repo', () => {
          return HttpResponse.json(
            {
              message: 'Token expired',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      const promises = [
        client.getRepository('concurrent-expiry', 'repo1'),
        client.getRepository('concurrent-expiry', 'repo2'),
        client.getRepository('concurrent-expiry', 'repo3'),
      ]

      const results = await Promise.allSettled(promises)

      // All should fail due to expired token
      results.forEach(result => {
        expect(result.status).toBe('rejected')
      })
    })
  })

  describe('Security Context Edge Cases', () => {
    it('should handle token injection attempts', async () => {
      const maliciousToken = 'token; echo "malicious command"; #'
      const client = createEdgeCaseClient({ token: maliciousToken })

      mswServer.use(
        http.get('https://api.github.com/repos/security-test/injection', () => {
          return HttpResponse.json(
            {
              message: 'Bad credentials',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('security-test', 'injection')).rejects.toThrow()
    })

    it('should handle cross-site request forgery attempts', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/csrf-test/repository', () => {
          return HttpResponse.json(
            {
              message: 'CSRF token mismatch',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 403 }
          )
        })
      )

      await expect(client.getRepository('csrf-test', 'repository')).rejects.toThrow()
    })

    it('should handle suspicious authentication patterns', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/suspicious/activity', () => {
          return HttpResponse.json(
            {
              message: 'Suspicious activity detected. Account temporarily restricted.',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 403 }
          )
        })
      )

      await expect(client.getRepository('suspicious', 'activity')).rejects.toThrow()
    })

    it('should handle session hijacking scenarios', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.hijacked })

      mswServer.use(
        http.get('https://api.github.com/repos/hijack-test/session', () => {
          return HttpResponse.json(
            {
              message: 'Session invalid',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('hijack-test', 'session')).rejects.toThrow()
    })
  })

  describe('Multi-User Authentication Scenarios', () => {
    it('should handle switching between different user contexts', async () => {
      const user1Client = createEdgeCaseClient({ token: 'user1-token' })
      const user2Client = createEdgeCaseClient({ token: 'user2-token' })

      mswServer.use(
        http.get('https://api.github.com/repos/multi-user/user1-repo', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'user1-repo',
            full_name: 'multi-user/user1-repo',
            owner: {
              login: 'user1',
              id: 1,
              avatar_url: 'https://github.com/images/error/user1_happy.gif',
              html_url: 'https://github.com/user1',
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: 'https://github.com/multi-user/user1-repo',
            description: 'Test repository for user1',
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: 'JavaScript',
            default_branch: 'main',
          })
        }),
        http.get('https://api.github.com/repos/multi-user/user2-repo', () => {
          return HttpResponse.json({
            id: 654321,
            name: 'user2-repo',
            full_name: 'multi-user/user2-repo',
            owner: {
              login: 'user2',
              id: 2,
              avatar_url: 'https://github.com/images/error/user2_happy.gif',
              html_url: 'https://github.com/user2',
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: 'https://github.com/multi-user/user2-repo',
            description: 'Test repository for user2',
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: 'TypeScript',
            default_branch: 'main',
          })
        })
      )

      const user1Repo = await user1Client.getRepository('multi-user', 'user1-repo')
      const user2Repo = await user2Client.getRepository('multi-user', 'user2-repo')

      expect(user1Repo.owner.login).toBe('user1')
      expect(user2Repo.owner.login).toBe('user2')
    })

    it('should handle cross-user permission conflicts', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/cross-user/conflict', () => {
          return HttpResponse.json(
            {
              message: 'Permission denied: User does not have access to this resource',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 403 }
          )
        })
      )

      await expect(client.getRepository('cross-user', 'conflict')).rejects.toThrow()
    })

    it('should handle organization membership validation', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/orgs/exclusive-org/members/test-user', () => {
          return HttpResponse.json(
            {
              message: 'Not Found',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 404 }
          )
        })
      )

      await expect(client.getOrganizationMember('exclusive-org', 'test-user')).rejects.toThrow()
    })
  })

  describe('OAuth Flow Edge Cases', () => {
    it('should handle OAuth authorization code exchange failures', async () => {
      const client = createEdgeCaseClient({ token: INVALID_TOKENS.oauthFailed })

      mswServer.use(
        http.get('https://api.github.com/repos/oauth-test/code-exchange', () => {
          return HttpResponse.json(
            {
              message: 'OAuth authorization failed',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 401 }
          )
        })
      )

      await expect(client.getRepository('oauth-test', 'code-exchange')).rejects.toThrow()
    })

    it('should handle OAuth scope escalation attempts', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/oauth-scope/escalation', () => {
          return HttpResponse.json(
            {
              message: 'Scope escalation not permitted',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 403 }
          )
        })
      )

      await expect(client.getRepository('oauth-scope', 'escalation')).rejects.toThrow()
    })

    it('should handle OAuth state parameter mismatch', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/oauth-state/mismatch', () => {
          return HttpResponse.json(
            {
              message: 'OAuth state parameter mismatch',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 400 }
          )
        })
      )

      await expect(client.getRepository('oauth-state', 'mismatch')).rejects.toThrow()
    })

    it('should handle OAuth callback URL validation', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/oauth-callback/validation', () => {
          return HttpResponse.json(
            {
              message: 'Invalid callback URL',
              documentation_url: 'https://docs.github.com/rest',
            },
            { status: 400 }
          )
        })
      )

      await expect(client.getRepository('oauth-callback', 'validation')).rejects.toThrow()
    })
  })

  describe('Authentication Error Recovery', () => {
    it('should maintain client state after authentication failures', async () => {
      const client = createEdgeCaseClient()

      // First request fails due to auth issue
      mswServer.use(
        http.get('https://api.github.com/repos/auth-recovery/failure', () => {
          return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
        })
      )

      await expect(client.getRepository('auth-recovery', 'failure')).rejects.toThrow()

      // Client should still work for other requests
      const user = await client.getUser('octocat')
      expect(user).toBeDefined()
      expect(user.login).toBe('octocat')

      // Cache should still work
      const stats = client.getCacheStats()
      expect(stats).toBeDefined()
    })

    it('should handle authentication errors across concurrent requests', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/concurrent-auth/:repo', () => {
          return HttpResponse.json({ message: 'Token expired' }, { status: 401 })
        })
      )

      const promises = [
        client.getRepository('concurrent-auth', 'repo1'),
        client.getRepository('concurrent-auth', 'repo2'),
        client.getUser('octocat'), // Should succeed
      ]

      const results = await Promise.allSettled(promises)

      expect(results).toHaveLength(3)
      expect(results[0].status).toBe('rejected')
      expect(results[1].status).toBe('rejected')
      expect(results[2].status).toBe('fulfilled')
    })

    it('should provide meaningful error information for authentication failures', async () => {
      const client = createEdgeCaseClient()

      const authErrorScenarios = [
        { name: 'invalid-credentials', status: 401, message: 'Bad credentials' },
        { name: 'token-expired', status: 401, message: 'Token expired' },
        { name: 'insufficient-scope', status: 403, message: 'Insufficient scope' },
        { name: 'permission-denied', status: 403, message: 'Permission denied' },
      ]

      for (const scenario of authErrorScenarios) {
        mswServer.use(
          http.get(`https://api.github.com/repos/auth-errors/${scenario.name}`, () => {
            return HttpResponse.json({ message: scenario.message }, { status: scenario.status })
          })
        )

        try {
          await client.getRepository('auth-errors', scenario.name)
          expect.fail(`Should have thrown an error for ${scenario.name}`)
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
          expect(error.message).toBeDefined()
          // Error should contain useful information for debugging
        }
      }
    })

    it('should handle graceful degradation with partial authentication', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/partial-auth/public-repo', () => {
          return HttpResponse.json({
            id: 123456,
            name: 'public-repo',
            full_name: 'partial-auth/public-repo',
            owner: {
              login: 'partial-auth',
              id: 1,
              avatar_url: 'https://github.com/images/error/partial-auth_happy.gif',
              html_url: 'https://github.com/partial-auth',
              type: 'User',
              site_admin: false,
            },
            private: false,
            html_url: 'https://github.com/partial-auth/public-repo',
            description: 'Test repository for partial authentication',
            fork: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            stargazers_count: 0,
            forks_count: 0,
            language: 'JavaScript',
            default_branch: 'main',
          })
        }),
        http.get('https://api.github.com/repos/partial-auth/private-repo', () => {
          return HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        })
      )

      // Public repo should work
      const publicRepo = await client.getRepository('partial-auth', 'public-repo')
      expect(publicRepo).toBeDefined()
      expect(publicRepo.private).toBe(false)

      // Private repo should fail
      await expect(client.getRepository('partial-auth', 'private-repo')).rejects.toThrow()
    })
  })
})
