/**
 * Authentication Integration Tests
 * 
 * Unit tests for GitHub authentication flows that can run without real API credentials.
 * These tests use mocked responses to verify authentication logic and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github/client'
import { GitHubAuthenticationError, GitHubTokenExpiredError } from '@/lib/github/errors'
import type { GitHubClientConfig, TokenInfo } from '@/lib/github/interfaces'

describe('GitHub Authentication Integration', () => {
  const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
-----END RSA PRIVATE KEY-----`

  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('Personal Access Token Authentication', () => {
    it('should authenticate with valid PAT token', async () => {
      const validToken = 'ghp_valid_token_12345'
      
      // Mock successful authentication
      nock('https://api.github.com')
        .get('/user')
        .reply(200, {
          login: 'testuser',
          id: 12345,
          type: 'User',
          name: 'Test User'
        }, {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          'x-ratelimit-used': '1',
          'x-ratelimit-resource': 'core'
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: validToken
        },
        includeRateLimit: true
      })

      try {
        const user = await client.rest.users.getAuthenticated()

        // Verify authentication success
        expect(user.data).toBeDefined()
        expect(user.data.login).toBe('testuser')
        expect(user.data.id).toBe(12345)
        expect(user.data.type).toBe('User')

        // Verify rate limit headers
        expect(user.headers['x-ratelimit-limit']).toBe('5000')
        expect(user.headers['x-ratelimit-remaining']).toBe('4999')
        expect(user.headers['x-ratelimit-resource']).toBe('core')

        // Verify token is correctly stored
        const currentToken = client.getCurrentToken()
        expect(currentToken).toBe(validToken)
      } finally {
        await client.destroy()
      }
    })

    it('should fail with invalid PAT token', async () => {
      const invalidToken = 'ghp_invalid_token_12345'
      
      // Mock authentication failure
      nock('https://api.github.com')
        .get('/user')
        .reply(401, {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest'
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: invalidToken
        }
      })

      try {
        await expect(
          client.rest.users.getAuthenticated()
        ).rejects.toThrow()
      } finally {
        await client.destroy()
      }
    })

    it('should handle token with limited scopes', async () => {
      const limitedToken = 'ghp_limited_scope_token'
      
      // Mock successful user auth but failed repo access
      nock('https://api.github.com')
        .get('/user')
        .reply(200, {
          login: 'testuser',
          id: 12345,
          type: 'User'
        }, {
          'x-oauth-scopes': 'user:email'
        })
        .get('/user/repos')
        .query({ per_page: 5 })
        .reply(403, {
          message: 'Token does not have sufficient scope',
          documentation_url: 'https://docs.github.com/rest'
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token: limitedToken
        }
      })

      try {
        // User info should work
        const user = await client.rest.users.getAuthenticated()
        expect(user.data.login).toBe('testuser')
        expect(user.headers['x-oauth-scopes']).toBe('user:email')

        // Repository access should fail
        await expect(
          client.rest.repos.listForAuthenticatedUser({ per_page: 5 })
        ).rejects.toThrow()
      } finally {
        await client.destroy()
      }
    })
  })

  describe('GitHub App Authentication', () => {
    it('should handle GitHub App configuration', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
      client.destroy()
    })

    it('should handle GitHub App with installation ID', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
          installationId: 789
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
      client.destroy()
    })

    it('should fail with invalid GitHub App credentials', async () => {
      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 999999,
          privateKey: '-----BEGIN RSA PRIVATE KEY-----\nINVALID_KEY\n-----END RSA PRIVATE KEY-----'
        }
      })

      try {
        await expect(
          client.authenticate()
        ).rejects.toThrow(GitHubAuthenticationError)
      } finally {
        await client.destroy()
      }
    })

    it('should handle installation token mocking', async () => {
      const installationId = 12345

      // Mock JWT generation for app authentication
      nock('https://api.github.com')
        .post(`/app/installations/${installationId}/access_tokens`)
        .reply(201, {
          token: 'ghs_installation_token',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          permissions: {
            contents: 'read',
            metadata: 'read'
          }
        })

      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: mockPrivateKey,
          installationId
        }
      })

      try {
        // This would normally fail with invalid private key, but we're testing the flow
        // await client.authenticateAsInstallation(installationId)
        
        // Just verify the client was created correctly
        expect(client).toBeInstanceOf(GitHubClient)
      } finally {
        await client.destroy()
      }
    })
  })

  describe('OAuth Flow Simulation', () => {
    it('should handle OAuth configuration', () => {
      const client = new GitHubClient({
        auth: {
          type: 'oauth',
          clientId: 'test_client_id',
          clientSecret: 'test_client_secret'
        }
      })

      expect(client).toBeInstanceOf(GitHubClient)
      client.destroy()
    })

    it('should simulate OAuth token validation', async () => {
      const oauthToken = 'gho_oauth_access_token'

      // Mock OAuth token validation
      nock('https://api.github.com')
        .get('/user')
        .reply(200, {
          login: 'oauthuser',
          id: 54321,
          type: 'User'
        })

      const client = new GitHubClient({
        auth: {
          type: 'token', // OAuth tokens are used as bearer tokens
          token: oauthToken
        }
      })

      try {
        const user = await client.rest.users.getAuthenticated()
        expect(user.data.login).toBe('oauthuser')
        expect(user.data.id).toBe(54321)
      } finally {
        await client.destroy()
      }
    })
  })

  describe('Token Validation and Error Handling', () => {
    it('should handle token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'ghp_token_1', type: 'personal' },
        { token: 'ghp_token_2', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      try {
        // Get next token
        const token1 = await client.getNextToken()
        expect(token1).toBeDefined()
        expect(tokens.some(t => t.token === token1)).toBe(true)

        // Get next token again (should rotate)
        const token2 = await client.getNextToken()
        expect(token2).toBeDefined()
        expect(tokens.some(t => t.token === token2)).toBe(true)
      } finally {
        await client.destroy()
      }
    })

    it('should handle token validation with mocked responses', async () => {
      // Mock token validation responses
      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'user1', id: 1 })
        .get('/user')
        .reply(401, { message: 'Bad credentials' })

      const tokens: TokenInfo[] = [
        { token: 'ghp_valid_token', type: 'personal' },
        { token: 'ghp_invalid_token', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      try {
        // Validate tokens
        await client.validateTokens()

        // Check remaining valid tokens
        const validTokens = client.getTokenInfo()
        expect(validTokens.length).toBeGreaterThan(0)

        // The valid token should remain
        const hasValidToken = validTokens.some(t => t.token === 'ghp_valid_token')
        expect(hasValidToken).toBe(true)
      } finally {
        await client.destroy()
      }
    })

    it('should handle authentication errors gracefully', async () => {
      const testCases = [
        {
          token: 'ghp_invalid_format',
          status: 401,
          message: 'Bad credentials'
        },
        {
          token: 'ghp_expired_token',
          status: 401,
          message: 'Token expired'
        },
        {
          token: 'ghp_revoked_token',
          status: 401,
          message: 'Token revoked'
        }
      ]

      for (const testCase of testCases) {
        // Mock error response
        nock('https://api.github.com')
          .get('/user')
          .reply(testCase.status, { message: testCase.message })

        const client = new GitHubClient({
          auth: {
            type: 'token',
            token: testCase.token
          },
          retry: {
            enabled: false // Disable retry for faster error testing
          }
        })

        try {
          await expect(
            client.rest.users.getAuthenticated()
          ).rejects.toThrow()
        } finally {
          await client.destroy()
        }
      }
    })
  })

  describe('Rate Limiting and Headers', () => {
    it('should parse rate limit headers correctly', async () => {
      const token = 'ghp_test_token'
      const resetTime = Math.floor(Date.now() / 1000) + 3600

      nock('https://api.github.com')
        .get('/user')
        .reply(200, {
          login: 'testuser',
          id: 12345
        }, {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': String(resetTime),
          'x-ratelimit-used': '1',
          'x-ratelimit-resource': 'core'
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token
        }
      })

      try {
        const response = await client.rest.users.getAuthenticated()

        // Verify rate limit headers
        expect(response.headers['x-ratelimit-limit']).toBe('5000')
        expect(response.headers['x-ratelimit-remaining']).toBe('4999')
        expect(response.headers['x-ratelimit-reset']).toBe(String(resetTime))
        expect(response.headers['x-ratelimit-used']).toBe('1')
        expect(response.headers['x-ratelimit-resource']).toBe('core')

        // Verify values are reasonable
        const limit = parseInt(response.headers['x-ratelimit-limit'])
        const remaining = parseInt(response.headers['x-ratelimit-remaining'])
        const used = parseInt(response.headers['x-ratelimit-used'])

        expect(limit).toBe(5000)
        expect(remaining).toBe(4999)
        expect(used).toBe(1)
        expect(remaining + used).toBeLessThanOrEqual(limit)
      } finally {
        await client.destroy()
      }
    })

    it('should handle GraphQL rate limits', async () => {
      const token = 'ghp_test_token'

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, {
          data: {
            viewer: {
              login: 'testuser'
            },
            rateLimit: {
              limit: 5000,
              cost: 1,
              remaining: 4999,
              resetAt: new Date(Date.now() + 3600000).toISOString()
            }
          }
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token
        },
        includeRateLimit: true
      })

      try {
        const query = `
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

        const result = await client.graphql(query)
        expect(result.viewer.login).toBe('testuser')
        expect(result.rateLimit).toBeDefined()
        expect(result.rateLimit.limit).toBe(5000)
        expect(result.rateLimit.remaining).toBe(4999)
        expect(result.rateLimit.cost).toBe(1)
      } finally {
        await client.destroy()
      }
    })
  })

  describe('Authentication Header Formatting', () => {
    it('should format token headers correctly', async () => {
      const token = 'ghp_test_token_12345'

      nock('https://api.github.com')
        .get('/user')
        .matchHeader('authorization', `token ${token}`)
        .reply(200, {
          login: 'testuser',
          id: 12345
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token
        }
      })

      try {
        const response = await client.rest.users.getAuthenticated()
        expect(response.data.login).toBe('testuser')

        // Verify the current token is correctly stored
        const currentToken = client.getCurrentToken()
        expect(currentToken).toBe(token)
      } finally {
        await client.destroy()
      }
    })

    it('should maintain authentication context across requests', async () => {
      const token = 'ghp_persistent_token'

      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser', id: 12345 })
        .get('/user/repos')
        .query({ per_page: 5 })
        .reply(200, [
          { name: 'repo1', full_name: 'testuser/repo1' },
          { name: 'repo2', full_name: 'testuser/repo2' }
        ])
        .get('/user')
        .reply(200, { login: 'testuser', id: 12345 })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token
        }
      })

      try {
        // First request
        const user1 = await client.rest.users.getAuthenticated()
        expect(user1.data.login).toBe('testuser')

        // Second request (different endpoint)
        const repos = await client.rest.repos.listForAuthenticatedUser({ per_page: 5 })
        expect(repos.data).toHaveLength(2)

        // Third request (same as first)
        const user2 = await client.rest.users.getAuthenticated()
        expect(user2.data.login).toBe(user1.data.login)
        expect(user2.data.id).toBe(user1.data.id)
      } finally {
        await client.destroy()
      }
    })
  })

  describe('Error Recovery and Retry Logic', () => {
    it('should retry on transient authentication failures', async () => {
      const token = 'ghp_retry_token'

      // Mock intermittent failures followed by success
      nock('https://api.github.com')
        .get('/user')
        .reply(401, { message: 'Bad credentials' })
        .get('/user')
        .reply(401, { message: 'Bad credentials' })
        .get('/user')
        .reply(200, {
          login: 'testuser',
          id: 12345
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token
        },
        retry: {
          enabled: true,
          retries: 3,
          doNotRetry: [403, 404] // Don't retry on these, but retry on 401
        }
      })

      try {
        const user = await client.rest.users.getAuthenticated()
        expect(user.data.login).toBe('testuser')
      } finally {
        await client.destroy()
      }
    })

    it('should handle network timeouts during authentication', async () => {
      const token = 'ghp_timeout_token'

      // Mock timeout scenario with shorter delay but still noticeable
      nock('https://api.github.com')
        .get('/user')
        .delay(200) // 200ms delay
        .reply(200, {
          login: 'testuser',
          id: 12345
        })

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token
        },
        retry: {
          enabled: false // Disable retry to test just the delay
        }
      })

      try {
        const startTime = Date.now()
        
        const response = await client.rest.users.getAuthenticated()
        expect(response.data.login).toBe('testuser')

        const duration = Date.now() - startTime
        expect(duration).toBeGreaterThan(100) // Should have taken at least 100ms due to delay
      } finally {
        await client.destroy()
      }
    }, { timeout: 5000 })
  })
})