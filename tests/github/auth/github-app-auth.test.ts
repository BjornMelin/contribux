import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import { GitHubAuthenticationError, GitHubTokenExpiredError } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github'

// Mock JWT generation
vi.mock('universal-github-app-jwt', () => ({
  default: vi.fn().mockResolvedValue({
    token: 'mock.jwt.token',
    appId: '123456',
    expiration: Math.floor(Date.now() / 1000) + 600 // 10 minutes from now
  })
}))

describe('GitHub App Authentication', () => {
  const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA1234567890
-----END RSA PRIVATE KEY-----`

  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('JWT generation', () => {
    it('should generate JWT for GitHub App', async () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should handle JWT generation errors', async () => {
      vi.resetModules()
      vi.doMock('universal-github-app-jwt', () => ({
        default: vi.fn().mockRejectedValue(new Error('Invalid private key'))
      }))

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey: 'invalid-key'
        }
      }

      const { GitHubClient: MockedClient } = await import('@/lib/github/client')
      expect(() => new MockedClient(config)).rejects.toThrow(GitHubAuthenticationError)
    })
  })

  describe('Installation token exchange', () => {
    it('should exchange JWT for installation token', async () => {
      const mockInstallationToken = {
        token: 'ghs_installation_token',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }

      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .matchHeader('authorization', 'Bearer mock.jwt.token')
        .reply(201, mockInstallationToken)

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 789
        }
      }

      const client = new GitHubClient(config)
      await client.authenticate()
      
      // Verify the client can make authenticated requests
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('authorization', 'token ghs_installation_token')
        .reply(200, { login: 'app[bot]' })

      const user = await client.rest.users.getAuthenticated()
      expect(user.data.login).toBe('app[bot]')
    })

    it('should handle installation token exchange errors', async () => {
      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(404, {
          message: 'Installation not found',
          documentation_url: 'https://docs.github.com'
        })

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 789
        }
      }

      const client = new GitHubClient(config)
      await expect(client.authenticate()).rejects.toThrow(GitHubAuthenticationError)
    })

    it('should refresh expired installation tokens', async () => {
      const expiredToken = {
        token: 'ghs_expired_token',
        expires_at: new Date(Date.now() - 1000).toISOString() // Already expired
      }

      const newToken = {
        token: 'ghs_new_token',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }

      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(201, expiredToken)

      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(201, newToken)

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 789
        }
      }

      const client = new GitHubClient(config)
      await client.authenticate()

      // Try to make a request which should trigger token refresh
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('authorization', 'token ghs_new_token')
        .reply(200, { login: 'app[bot]' })

      const user = await client.rest.users.getAuthenticated()
      expect(user.data.login).toBe('app[bot]')
    })
  })

  describe('App-level requests', () => {
    it('should make app-level requests with JWT', async () => {
      const mockApp = {
        id: 123456,
        slug: 'test-app',
        name: 'Test App'
      }

      nock('https://api.github.com')
        .get('/app')
        .matchHeader('authorization', 'Bearer mock.jwt.token')
        .reply(200, mockApp)

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey
        }
      }

      const client = new GitHubClient(config)
      const app = await client.rest.apps.getAuthenticated()
      expect(app.data).toEqual(mockApp)
    })

    it('should list app installations', async () => {
      const mockInstallations = [
        { id: 789, account: { login: 'test-org' } },
        { id: 790, account: { login: 'another-org' } }
      ]

      nock('https://api.github.com')
        .get('/app/installations')
        .matchHeader('authorization', 'Bearer mock.jwt.token')
        .reply(200, mockInstallations)

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey
        }
      }

      const client = new GitHubClient(config)
      const installations = await client.rest.apps.listInstallations()
      expect(installations.data).toEqual(mockInstallations)
    })
  })

  describe('Token expiration handling', () => {
    it('should detect expired JWT and regenerate', async () => {
      let jwtCallCount = 0
      
      vi.resetModules()
      vi.doMock('universal-github-app-jwt', () => ({
        default: vi.fn().mockImplementation(() => {
          jwtCallCount++
          return Promise.resolve({
            token: `mock.jwt.token.${jwtCallCount}`,
            appId: '123456',
            expiration: jwtCallCount === 1 
              ? Math.floor(Date.now() / 1000) - 60 // Already expired
              : Math.floor(Date.now() / 1000) + 600 // Valid for 10 minutes
          })
        })
      }))

      const { GitHubClient: MockedClient } = await import('@/lib/github/client')
      
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey
        }
      }

      const client = new MockedClient(config)
      
      // First request should detect expired JWT and regenerate
      nock('https://api.github.com')
        .get('/app')
        .matchHeader('authorization', 'Bearer mock.jwt.token.2')
        .reply(200, { id: 123456 })

      const app = await client.rest.apps.getAuthenticated()
      expect(app.data.id).toBe(123456)
      expect(jwtCallCount).toBe(2) // Initial + regeneration
    })

    it('should handle token refresh before expiry', async () => {
      const almostExpiredToken = {
        token: 'ghs_almost_expired',
        expires_at: new Date(Date.now() + 60000).toISOString() // 1 minute left
      }

      const newToken = {
        token: 'ghs_refreshed_token',
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }

      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(201, almostExpiredToken)

      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 789
        },
        tokenRotation: {
          refreshBeforeExpiry: 5 // Refresh 5 minutes before expiry
        }
      }

      const client = new GitHubClient(config)
      await client.authenticate()

      // Token should be refreshed automatically
      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(201, newToken)

      await client.refreshTokenIfNeeded()

      // Verify new token is used
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('authorization', 'token ghs_refreshed_token')
        .reply(200, { login: 'app[bot]' })

      const user = await client.rest.users.getAuthenticated()
      expect(user.data.login).toBe('app[bot]')
    })
  })

  describe('Multi-installation support', () => {
    it('should switch between installations', async () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey
        }
      }

      const client = new GitHubClient(config)

      // Get token for installation 1
      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(201, {
          token: 'ghs_install_789',
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })

      await client.authenticateAsInstallation(789)

      // Get token for installation 2
      nock('https://api.github.com')
        .post('/app/installations/790/access_tokens')
        .reply(201, {
          token: 'ghs_install_790',
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })

      await client.authenticateAsInstallation(790)

      // Verify different tokens are used for different installations
      nock('https://api.github.com')
        .get('/installation/repositories')
        .matchHeader('authorization', 'token ghs_install_790')
        .reply(200, { repositories: [] })

      const repos = await client.rest.apps.listReposAccessibleToInstallation()
      expect(repos.data.repositories).toEqual([])
    })

    it('should cache installation tokens', async () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey
        }
      }

      const client = new GitHubClient(config)

      // First request for installation token
      nock('https://api.github.com')
        .post('/app/installations/789/access_tokens')
        .reply(201, {
          token: 'ghs_cached_token',
          expires_at: new Date(Date.now() + 3600000).toISOString()
        })

      await client.authenticateAsInstallation(789)

      // Second request should use cached token (no new nock needed)
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('authorization', 'token ghs_cached_token')
        .reply(200, { login: 'app[bot]' })

      const user = await client.rest.users.getAuthenticated()
      expect(user.data.login).toBe('app[bot]')
    })
  })
})