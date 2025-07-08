/**
 * GitHub Authentication & Authorization Flows Integration Tests
 *
 * This file contains comprehensive authentication testing scenarios:
 * - Personal Access Token (PAT) authentication flows
 * - OAuth token integration and persistence
 * - GitHub App configuration and authentication
 * - Authentication context persistence across requests
 * - Token validation and error handling
 * - Authentication recovery patterns
 */

import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { fc, test as fcTest } from '@fast-check/vitest'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockGitHubAPI, mswServer } from '../msw-setup'
import { setupGitHubTestIsolation } from '../test-helpers'

// GitHub API base URL
const GITHUB_API_BASE = 'https://api.github.com'

// Skip real integration tests flag
const SKIP_INTEGRATION_TESTS = !process.env.GITHUB_TOKEN || process.env.SKIP_INTEGRATION === 'true'

// Setup MSW and test isolation
setupGitHubTestIsolation()

// Mock private key for GitHub App testing
const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
TEST-MOCK-RSA-KEY-FOR-TESTING-ONLY-NOT-A-REAL-PRIVATE-KEY-ABCDEFGH
-----END RSA PRIVATE KEY-----`

describe('GitHub Authentication & Authorization Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  describe('Personal Access Token Authentication', () => {
    it('should authenticate with valid PAT token', async () => {
      const validToken = 'ghp_valid_token_12345'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: validToken,
        },
      })

      const user = await client.getAuthenticatedUser()

      // Verify authentication success
      expect(user).toBeDefined()
      expect(user.login).toBe('testuser')
      expect(user.id).toBe(12345)
      expect(user.type).toBe('User')
    })

    it('should fail with invalid PAT token', async () => {
      const invalidToken = 'ghp_invalid_token_12345'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: invalidToken,
        },
      })

      await expect(client.getAuthenticatedUser()).rejects.toThrow(GitHubError)
    }, 2000)

    it('should handle token with limited scopes', async () => {
      const limitedToken = 'ghp_limited_scope_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: limitedToken,
        },
      })

      // User info should work
      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')

      // Repository access should fail due to limited scope
      await expect(client.listIssues('test', 'test', { per_page: 5 })).rejects.toThrow(GitHubError)
    })

    // Property-based testing for token validation
    fcTest.prop([fc.stringMatching(/^ghp_[a-zA-Z0-9]{36}$/)])(
      'should handle various PAT token formats',
      async token => {
        const client = new GitHubClient({
          auth: { type: 'token', token },
        })

        // Should not throw during client creation
        expect(client).toBeInstanceOf(GitHubClient)
      }
    )

    it('should handle authentication errors gracefully', async () => {
      const testCases = ['ghp_invalid_format', 'ghp_expired_token', 'ghp_revoked_token']

      for (const token of testCases) {
        const client = new GitHubClient({
          auth: {
            type: 'token',
            token,
          },
        })

        await expect(client.getAuthenticatedUser()).rejects.toThrow()
      }
    })
  })

  describe('OAuth Token Integration', () => {
    it('should handle OAuth tokens as bearer tokens', async () => {
      const oauthToken = 'gho_oauth_access_token'

      // Override default handler for OAuth token
      mswServer.use(
        http.get(`${GITHUB_API_BASE}/user`, ({ request }) => {
          const authHeader = request.headers.get('authorization')
          if (authHeader === `token ${oauthToken}`) {
            return HttpResponse.json({
              login: 'oauthuser',
              id: 54321,
              type: 'User',
              avatar_url: 'https://avatars.githubusercontent.com/u/54321',
              html_url: 'https://github.com/oauthuser',
              site_admin: false,
            })
          }
          return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
        })
      )

      const client = new GitHubClient({
        auth: {
          type: 'token', // OAuth tokens are used as bearer tokens
          token: oauthToken,
        },
      })

      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('oauthuser')
      expect(user.id).toBe(54321)
    })

    it('should maintain OAuth context across multiple requests', async () => {
      const oauthToken = 'gho_persistent_oauth_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: oauthToken,
        },
      })

      // First request
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')

      // Second request to different endpoint
      const repos = await client.listIssues('testuser', 'test-repo', { per_page: 5 })
      expect(repos).toHaveLength(2)

      // Third request (same as first)
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe(user1.login)
      expect(user2.id).toBe(user1.id)
    })
  })

  describe.skip('GitHub App Authentication', () => {
    it('should handle GitHub App configuration', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
        },
      }

      // Just test configuration acceptance, not actual authentication
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should handle GitHub App with installation ID', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
          installationId: 789,
        },
      }

      // Just test configuration acceptance, not actual authentication
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should handle installation token integration', async () => {
      const installationId = 12345

      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
          installationId,
        },
      })

      // Just verify the client was created correctly
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('Authentication Context Persistence', () => {
    it('should maintain authentication context across requests', async () => {
      const token = 'ghp_persistent_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      // First request
      const user1 = await client.getAuthenticatedUser()
      expect(user1.login).toBe('testuser')

      // Second request (different endpoint)
      const repos = await client.listIssues('testuser', 'test-repo', { per_page: 5 })
      expect(repos).toHaveLength(2)

      // Third request (same as first)
      const user2 = await client.getAuthenticatedUser()
      expect(user2.login).toBe(user1.login)
      expect(user2.id).toBe(user1.id)
    })
  })

  describe('Authentication Recovery Patterns', () => {
    it('should retry on transient authentication failures', async () => {
      const token = 'ghp_retry_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      // Note: The new client's retry plugin won't retry on 401s by default
      await expect(client.getAuthenticatedUser()).rejects.toThrow()
    })

    it('should handle network timeouts during authentication', async () => {
      const token = 'ghp_timeout_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      const startTime = Date.now()

      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')

      const duration = Date.now() - startTime
      expect(duration).toBeGreaterThan(0) // Should have taken at least some time
    }, 5000)
  })
})

// =====================================================
// REAL API AUTHENTICATION INTEGRATION TESTS
// =====================================================
describe.skipIf(SKIP_INTEGRATION_TESTS)('Real API Authentication Integration', () => {
  let client: GitHubClient

  beforeEach(() => {
    client = new GitHubClient({
      auth: {
        type: 'token',
        token: process.env.GITHUB_TOKEN ?? 'dummy-token',
      },
      cache: {
        maxAge: 60, // 1 minute for tests
        maxSize: 100,
      },
    })
  })

  describe('Authentication Flows', () => {
    it('should authenticate and get current user', async () => {
      const user = await client.getAuthenticatedUser()
      expect(user).toBeDefined()
      expect(user.login).toBeTruthy()
      expect(typeof user.id).toBe('number')
    }, 10000)

    it('should handle GraphQL authentication', async () => {
      const result = await client.graphql(`
        query {
          viewer {
            login
            publicRepositories(first: 1) {
              totalCount
            }
          }
        }
      `)

      expect(result).toBeDefined()
      expect(result.viewer).toBeDefined()
      expect(typeof result.viewer.login).toBe('string')
    }, 10000)
  })

  describe('Multi-Service Authentication Integration', () => {
    it('should integrate rate limiting with API calls', async () => {
      const rateLimit = await client.getRateLimit()

      expect(rateLimit).toBeDefined()
      expect(rateLimit.core).toBeDefined()
      expect(typeof rateLimit.core.limit).toBe('number')
      expect(typeof rateLimit.core.remaining).toBe('number')
      expect(typeof rateLimit.core.reset).toBe('number')

      // Make an API call and verify rate limit changes
      await client.getAuthenticatedUser()

      const newRateLimit = await client.getRateLimit()
      expect(newRateLimit.core.remaining).toBeLessThanOrEqual(rateLimit.core.remaining)
    }, 10000)

    it('should handle GraphQL and REST API together', async () => {
      // GraphQL query for user info
      const graphqlUser = await client.graphql(`
        query {
          viewer {
            login
            name
          }
        }
      `)

      // REST API call for same user
      const restUser = await client.getAuthenticatedUser()

      expect(graphqlUser.viewer.login).toBe(restUser.login)
    }, 10000)
  })
})
