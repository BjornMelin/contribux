import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig, TokenInfo } from '@/lib/github'

describe('GitHub Token Rotation', () => {
  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    nock.cleanAll()
    vi.useRealTimers()
  })

  describe('Token rotation strategies', () => {
    it('should use round-robin strategy for token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      // Setup mocks to track which token is used
      const tokenUsage: string[] = []
      
      nock('https://api.github.com')
        .get('/user')
        .times(6)
        .reply(function(uri, body) {
          const authHeader = this.req.headers.authorization
          if (authHeader && typeof authHeader === 'string') {
            tokenUsage.push(authHeader)
          }
          return [200, { login: 'testuser' }]
        })

      // Make multiple requests
      for (let i = 0; i < 6; i++) {
        await client.rest.users.getAuthenticated()
      }

      // Verify round-robin pattern
      expect(tokenUsage[0]).toContain('token1')
      expect(tokenUsage[1]).toContain('token2')
      expect(tokenUsage[2]).toContain('token3')
      expect(tokenUsage[3]).toContain('token1')
      expect(tokenUsage[4]).toContain('token2')
      expect(tokenUsage[5]).toContain('token3')
    }, 10000)

    it('should use least-used strategy for token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'least-used'
        }
      })

      // Track token usage
      const tokenUsage: Map<string, number> = new Map()
      
      nock('https://api.github.com')
        .get('/user')
        .times(10)
        .reply(function() {
          const authHeader = this.req.headers.authorization
          const token = authHeader?.replace('token ', '')
          tokenUsage.set(token, (tokenUsage.get(token) || 0) + 1)
          return [200, { login: 'testuser' }]
        })

      // Make requests
      for (let i = 0; i < 10; i++) {
        await client.rest.users.getAuthenticated()
      }

      // All tokens should be used roughly equally
      const usageCounts = Array.from(tokenUsage.values())
      const maxUsage = Math.max(...usageCounts)
      const minUsage = Math.min(...usageCounts)
      expect(maxUsage - minUsage).toBeLessThanOrEqual(1)
    }, 10000)

    it('should use random strategy for token rotation', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'random'
        }
      })

      const tokenUsage = new Set<string>()
      
      nock('https://api.github.com')
        .get('/user')
        .times(20)
        .reply(function() {
          const authHeader = this.req.headers.authorization
          const token = authHeader?.replace('token ', '')
          tokenUsage.add(token)
          return [200, { login: 'testuser' }]
        })

      // Make multiple requests
      for (let i = 0; i < 20; i++) {
        await client.rest.users.getAuthenticated()
      }

      // All tokens should be used at least once
      expect(tokenUsage.size).toBe(3)
    })
  })

  describe('Token expiration handling', () => {
    it('should automatically refresh expiring tokens', async () => {
      const expiresIn5Min = new Date(Date.now() + 5 * 60 * 1000)
      
      const tokens: TokenInfo[] = [
        {
          token: 'expiring-token',
          type: 'app',
          expiresAt: expiresIn5Min
        }
      ]

      const client = new GitHubClient({
        auth: { type: 'app', appId: 123, privateKey: 'test-key', installationId: 456 },
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin',
          refreshBeforeExpiry: 10 // 10 minutes
        }
      })

      // Mock installation token refresh
      nock('https://api.github.com')
        .post('/app/installations/456/access_tokens')
        .reply(200, {
          token: 'new-token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })

      // Mock API call
      let usedToken: string | undefined
      nock('https://api.github.com')
        .get('/user')
        .reply(function() {
          usedToken = this.req.headers.authorization
          return [200, { login: 'testuser' }]
        })

      await client.rest.users.getAuthenticated()

      // Should use the new token
      expect(usedToken).toContain('new-token')
    })

    it('should handle expired tokens gracefully', async () => {
      const expiredToken = new Date(Date.now() - 60 * 1000) // Expired 1 minute ago
      
      const tokens: TokenInfo[] = [
        {
          token: 'expired-token',
          type: 'personal',
          expiresAt: expiredToken
        },
        {
          token: 'valid-token',
          type: 'personal'
        }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      let usedToken: string | undefined
      nock('https://api.github.com')
        .get('/user')
        .reply(function() {
          usedToken = this.req.headers.authorization
          return [200, { login: 'testuser' }]
        })

      await client.rest.users.getAuthenticated()

      // Should skip expired token and use valid one
      expect(usedToken).toContain('valid-token')
      expect(usedToken).not.toContain('expired-token')
    })
  })

  describe('GitHub Apps token management', () => {
    it('should automatically exchange JWT for installation tokens', async () => {
      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123,
          privateKey: 'test-private-key',
          installationId: 456
        },
        tokenRotation: {
          tokens: [],
          rotationStrategy: 'round-robin'
        }
      })

      // Mock JWT generation (handled internally)
      // Mock installation token exchange
      nock('https://api.github.com')
        .post('/app/installations/456/access_tokens')
        .reply(200, {
          token: 'installation-token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          permissions: {
            contents: 'read',
            issues: 'write'
          }
        })

      // Mock API call
      let usedToken: string | undefined
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(function() {
          usedToken = this.req.headers.authorization
          return [200, { name: 'repo' }]
        })

      await client.rest.repos.get({ owner: 'owner', repo: 'repo' })

      expect(usedToken).toContain('installation-token')
    })

    it('should cache installation tokens by installation ID', async () => {
      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123,
          privateKey: 'test-private-key'
        }
      })

      // Mock token exchanges for different installations
      nock('https://api.github.com')
        .post('/app/installations/456/access_tokens')
        .reply(200, {
          token: 'installation-token-456',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })
        .post('/app/installations/789/access_tokens')
        .reply(200, {
          token: 'installation-token-789',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })

      // Authenticate as different installations
      await client.authenticateAsInstallation(456)
      const token456 = client.getCurrentToken()
      
      await client.authenticateAsInstallation(789)
      const token789 = client.getCurrentToken()

      expect(token456).not.toBe(token789)

      // Switch back to first installation - should use cached token
      await client.authenticateAsInstallation(456)
      const cachedToken456 = client.getCurrentToken()

      expect(cachedToken456).toBe(token456)
    })
  })

  describe('Token scopes and permissions', () => {
    it('should track token scopes for personal access tokens', async () => {
      const tokens: TokenInfo[] = [
        {
          token: 'read-token',
          type: 'personal',
          scopes: ['repo:read', 'user:read']
        },
        {
          token: 'write-token',
          type: 'personal',
          scopes: ['repo', 'user', 'admin:org']
        }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      const tokenInfo = client.getTokenInfo()
      expect(tokenInfo).toHaveLength(2)
      expect(tokenInfo[0].scopes).toContain('repo:read')
      expect(tokenInfo[1].scopes).toContain('admin:org')
    })

    it('should select token based on required scopes', async () => {
      const tokens: TokenInfo[] = [
        {
          token: 'limited-token',
          type: 'personal',
          scopes: ['public_repo']
        },
        {
          token: 'full-token',
          type: 'personal',
          scopes: ['repo', 'admin:org', 'user']
        }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      let usedToken: string | undefined
      nock('https://api.github.com')
        .put('/orgs/testorg/memberships/testuser')
        .reply(function() {
          usedToken = this.req.headers.authorization
          return [200, { state: 'active' }]
        })

      // This operation requires admin:org scope
      await client.rest.orgs.setMembershipForUser({
        org: 'testorg',
        username: 'testuser'
      })

      // Should automatically select the token with required scope
      expect(usedToken).toContain('full-token')
    })
  })

  describe('Thread safety and concurrency', () => {
    it('should handle concurrent token rotation safely', async () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' },
        { token: 'token3', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      const tokenUsage = new Map<string, number>()
      
      // Setup mock that tracks concurrent usage
      nock('https://api.github.com')
        .get('/user')
        .times(30)
        .reply(function() {
          const token = this.req.headers.authorization?.replace('token ', '')
          tokenUsage.set(token, (tokenUsage.get(token) || 0) + 1)
          return [200, { login: 'testuser' }]
        })

      // Make concurrent requests
      const promises = Array(30).fill(null).map(() => 
        client.rest.users.getAuthenticated()
      )

      await Promise.all(promises)

      // Each token should be used exactly 10 times in round-robin
      expect(tokenUsage.get('token1')).toBe(10)
      expect(tokenUsage.get('token2')).toBe(10)
      expect(tokenUsage.get('token3')).toBe(10)
    })

    it('should prevent race conditions during token refresh', async () => {
      const tokens: TokenInfo[] = [
        {
          token: 'expiring-token',
          type: 'app',
          expiresAt: new Date(Date.now() + 1000) // Expires in 1 second
        }
      ]

      const client = new GitHubClient({
        auth: { type: 'app', appId: 123, privateKey: 'test-key', installationId: 456 },
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin',
          refreshBeforeExpiry: 60 // 60 minutes - will trigger refresh
        }
      })

      let refreshCount = 0
      
      // Mock installation token refresh
      nock('https://api.github.com')
        .post('/app/installations/456/access_tokens')
        .times(1) // Should only be called once despite concurrent requests
        .reply(() => {
          refreshCount++
          return [200, {
            token: 'new-token',
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          }]
        })

      // Mock API calls
      nock('https://api.github.com')
        .get('/user')
        .times(10)
        .reply(200, { login: 'testuser' })

      // Make concurrent requests that all trigger token refresh
      const promises = Array(10).fill(null).map(() => 
        client.rest.users.getAuthenticated()
      )

      await Promise.all(promises)

      // Token refresh should only happen once
      expect(refreshCount).toBe(1)
    })
  })

  describe('Token rotation configuration', () => {
    it('should allow dynamic token addition', async () => {
      const client = new GitHubClient({
        tokenRotation: {
          tokens: [
            { token: 'initial-token', type: 'personal' }
          ],
          rotationStrategy: 'round-robin'
        }
      })

      // Add new token
      client.addToken({
        token: 'new-token',
        type: 'personal',
        scopes: ['repo', 'user']
      })

      const tokens = client.getTokenInfo()
      expect(tokens).toHaveLength(2)
      expect(tokens.some(t => t.token === 'new-token')).toBe(true)
    })

    it('should allow token removal', async () => {
      const client = new GitHubClient({
        tokenRotation: {
          tokens: [
            { token: 'token1', type: 'personal' },
            { token: 'token2', type: 'personal' },
            { token: 'token3', type: 'personal' }
          ],
          rotationStrategy: 'round-robin'
        }
      })

      // Remove a token
      client.removeToken('token2')

      const tokens = client.getTokenInfo()
      expect(tokens).toHaveLength(2)
      expect(tokens.some(t => t.token === 'token2')).toBe(false)
    })

    it('should validate token health before use', async () => {
      const tokens: TokenInfo[] = [
        { token: 'valid-token', type: 'personal' },
        { token: 'invalid-token', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      // Mock token validation
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('authorization', 'token invalid-token')
        .reply(401, { message: 'Bad credentials' })
        .get('/user')
        .matchHeader('authorization', 'token valid-token')
        .reply(200, { login: 'testuser' })

      await client.validateTokens()

      const activeTokens = client.getTokenInfo()
      expect(activeTokens).toHaveLength(1)
      expect(activeTokens[0].token).toBe('valid-token')
    })
  })
})