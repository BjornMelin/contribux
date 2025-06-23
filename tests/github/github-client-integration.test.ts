/**
 * Integration tests for GitHubClient with actual API calls
 * These tests are disabled by default to avoid hitting rate limits
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { createGitHubClient } from '../../src/lib/github/client'
import { GitHubError } from '../../src/lib/github/errors'

const SKIP_INTEGRATION_TESTS = !process.env.GITHUB_TOKEN || process.env.SKIP_INTEGRATION === 'true'

describe.skipIf(SKIP_INTEGRATION_TESTS)('GitHubClient Integration Tests', () => {
  let client: ReturnType<typeof createGitHubClient>

  beforeAll(() => {
    client = createGitHubClient({
      auth: {
        type: 'token',
        token: process.env.GITHUB_TOKEN!,
      },
      cache: {
        maxAge: 60, // 1 minute for tests
        maxSize: 100,
      },
    })
  })

  it('should authenticate and get current user', async () => {
    const user = await client.getAuthenticatedUser()
    expect(user).toBeDefined()
    expect(user.login).toBeTruthy()
    expect(typeof user.id).toBe('number')
  }, 10000)

  it('should get a public repository', async () => {
    const repo = await client.getRepository({
      owner: 'microsoft',
      repo: 'vscode',
    })

    expect(repo).toBeDefined()
    expect(repo.name).toBe('vscode')
    expect(repo.owner.login).toBe('microsoft')
    expect(repo.private).toBe(false)
    expect(typeof repo.stargazers_count).toBe('number')
  }, 10000)

  it('should search repositories', async () => {
    const results = await client.searchRepositories({
      q: 'language:typescript stars:>1000',
      sort: 'stars',
      order: 'desc',
      per_page: 5,
    })

    expect(results).toBeDefined()
    expect(results.total_count).toBeGreaterThan(0)
    expect(results.items).toHaveLength(5)
    expect(results.items[0].stargazers_count).toBeGreaterThan(1000)
  }, 10000)

  it('should handle GraphQL queries', async () => {
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

  it('should get rate limit information', async () => {
    const rateLimit = await client.getRateLimit()

    expect(rateLimit).toBeDefined()
    expect(rateLimit.core).toBeDefined()
    expect(typeof rateLimit.core.limit).toBe('number')
    expect(typeof rateLimit.core.remaining).toBe('number')
    expect(typeof rateLimit.core.reset).toBe('number')
  }, 10000)

  it('should handle 404 errors gracefully', async () => {
    await expect(async () => {
      await client.getRepository({
        owner: 'nonexistent-user-12345',
        repo: 'nonexistent-repo-12345',
      })
    }).rejects.toThrow(GitHubError)
  }, 10000)

  it('should cache responses', async () => {
    // First call
    const start1 = Date.now()
    const repo1 = await client.getRepository({
      owner: 'microsoft',
      repo: 'vscode',
    })
    const time1 = Date.now() - start1

    // Second call (should be faster due to caching)
    const start2 = Date.now()
    const repo2 = await client.getRepository({
      owner: 'microsoft',
      repo: 'vscode',
    })
    const time2 = Date.now() - start2

    expect(repo1.id).toBe(repo2.id)
    expect(time2).toBeLessThan(time1) // Second call should be faster

    const cacheStats = client.getCacheStats()
    expect(cacheStats.size).toBeGreaterThan(0)
  }, 15000)

  it('should clear cache successfully', async () => {
    // Make a request to populate cache
    await client.getRepository({
      owner: 'microsoft',
      repo: 'vscode',
    })

    let cacheStats = client.getCacheStats()
    expect(cacheStats.size).toBeGreaterThan(0)

    // Clear cache
    client.clearCache()
    cacheStats = client.getCacheStats()
    expect(cacheStats.size).toBe(0)
  }, 10000)
})

// Alternative test that doesn't require authentication
describe('GitHubClient Basic Tests', () => {
  it('should create client with token auth', () => {
    const tokenClient = createGitHubClient({
      auth: {
        type: 'token',
        token: 'ghp_test1234567890abcdef1234567890abcdef12',
      },
    })
    expect(tokenClient).toBeDefined()
    expect(tokenClient.getCacheStats).toBeDefined()
    expect(tokenClient.clearCache).toBeDefined()
  })

  it('should create client with custom configuration', () => {
    const customClient = createGitHubClient({
      auth: {
        type: 'token',
        token: 'ghp_test1234567890abcdef1234567890abcdef12',
      },
      baseUrl: 'https://api.github.enterprise.com',
      userAgent: 'custom-agent/1.0.0',
      cache: {
        maxAge: 600,
        maxSize: 500,
      },
    })
    expect(customClient).toBeDefined()
    expect(customClient.getCacheStats().maxSize).toBe(500)
  })

  it('should provide cache management', () => {
    const client = createGitHubClient({
      auth: {
        type: 'token',
        token: 'ghp_test1234567890abcdef1234567890abcdef12',
      },
    })

    const stats = client.getCacheStats()
    expect(stats).toHaveProperty('size')
    expect(stats).toHaveProperty('maxSize')
    expect(typeof stats.size).toBe('number')
    expect(typeof stats.maxSize).toBe('number')

    client.clearCache()
    const clearedStats = client.getCacheStats()
    expect(clearedStats.size).toBe(0)
  })
})
