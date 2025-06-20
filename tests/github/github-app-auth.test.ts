import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig, TokenInfo } from '@/lib/github/types'

// Note: GitHub App authentication is handled internally by Octokit.
// These tests verify configuration and basic setup rather than internal JWT generation.

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

  describe('Configuration', () => {
    it('should create client with GitHub App configuration', () => {
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

    it('should create client with installation ID', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 789
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should support webhook secret configuration', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          webhookSecret: 'my-webhook-secret'
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('OAuth configuration', () => {
    it('should support OAuth app configuration', () => {
      const config: GitHubClientConfig = {
        auth: {
          type: 'oauth',
          clientId: 'client123',
          clientSecret: 'secret456'
        }
      }

      const client = new GitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('Multi-installation support', () => {
    it('should support installation-specific configuration', () => {
      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 1
        }
      })

      expect(client).toBeInstanceOf(GitHubClient)
    })

    it('should support caching with app authentication', () => {
      const client = new GitHubClient({
        auth: {
          type: 'app',
          appId: 123456,
          privateKey,
          installationId: 1
        },
        cache: { enabled: true, ttl: 300 }
      })

      expect(client).toBeInstanceOf(GitHubClient)
    })
  })

  describe('Token expiration handling', () => {
    it('should support token rotation configuration', () => {
      const tokens: TokenInfo[] = [
        { token: 'token1', type: 'personal' },
        { token: 'token2', type: 'personal' }
      ]

      const client = new GitHubClient({
        tokenRotation: {
          tokens,
          rotationStrategy: 'round-robin'
        }
      })

      expect(client).toBeInstanceOf(GitHubClient)
    })
  })
})