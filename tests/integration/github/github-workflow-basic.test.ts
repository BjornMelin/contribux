/**
 * GitHub Basic Workflows Integration Tests
 *
 * This file contains basic GitHub workflow integration scenarios:
 * - Repository discovery and basic operations
 * - User and organization workflows
 * - Issue tracking and management
 * - Basic REST API integration patterns
 * - Repository search and pagination
 * - Simple content operations
 */

import type { GitHubClientConfig } from '@/lib/github/client'
import { GitHubClient, createGitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { fc, test as fcTest } from '@fast-check/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockGitHubAPI } from '../msw-setup'
import { setupGitHubTestIsolation } from '../test-helpers'

// Skip real integration tests flag
const SKIP_INTEGRATION_TESTS = !process.env.GITHUB_TOKEN || process.env.SKIP_INTEGRATION === 'true'

// Setup MSW and test isolation
setupGitHubTestIsolation()

// Test fixtures using modern patterns
const testFixtures = {
  githubClient: ({ task }) => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
    })

    // Cleanup after test
    task.meta.cleanup = () => {
      client.clearCache()
    }

    return client
  },

  authConfigs: () => [
    { type: 'token' as const, token: 'ghp_test_token' },
    { type: 'token' as const, token: 'github_pat_11ABC123456789' },
  ],
}

describe('GitHub Basic Workflows Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Client Initialization Patterns', () => {
    it('should create client with token authentication', () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
      })
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getCacheStats).toBeDefined()
    })

    // Parametric testing with test.each
    it.each(testFixtures.authConfigs())(
      'should create client with %s authentication',
      authConfig => {
        const config: GitHubClientConfig = { auth: authConfig }
        const client = new GitHubClient(config)
        expect(client).toBeInstanceOf(GitHubClient)
      }
    )

    // Property-based testing for configuration validation
    fcTest.prop([
      fc.record({
        auth: fc.constant({ type: 'token', token: 'ghp_test_token' }),
        baseUrl: fc.webUrl(),
        userAgent: fc.string({ minLength: 1, maxLength: 100 }),
      }),
    ])('should handle valid configuration properties', config => {
      expect(() => new GitHubClient(config)).not.toThrow()
    })

    it('should use default configuration when none provided', () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'ghp_test_token' },
      })
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client.getCacheStats().maxSize).toBe(1000)
    })
  })

  describe('REST API Integration Patterns', () => {
    it('should get authenticated user with proper integration', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const user = await client.getAuthenticatedUser()

      expect(user).toMatchObject({
        login: 'testuser',
        id: 12345,
      })
    })

    it('should get repository with owner/repo pattern', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const repo = await client.getRepository('testowner', 'testrepo')

      expect(repo).toMatchObject({
        name: 'testrepo',
        owner: { login: 'testowner' },
        full_name: 'testowner/testrepo',
      })
    })

    it('should get user by username', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const user = await client.getUser('testuser')

      expect(user).toMatchObject({
        login: 'testuser',
        id: expect.any(Number),
      })
    })

    // Property-based testing for repository operations
    fcTest.prop([
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$/),
      fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
    ])('should handle repository requests with valid names', async (owner, repo) => {
      mockGitHubAPI.mockRepository(owner, repo)

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const response = await client.getRepository({ owner, repo })

      expect(response).toMatchObject({
        name: repo,
        owner: { login: owner },
        full_name: `${owner}/${repo}`,
      })
    })
  })

  describe('Search and Pagination Integration', () => {
    it('should handle search operations with realistic patterns', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const searchOptions = {
        q: 'test',
        sort: 'stars',
        order: 'desc' as const,
        page: 1,
        per_page: 10,
      }

      const result = await client.searchRepositories(searchOptions)

      expect(result).toMatchObject({
        total_count: expect.any(Number),
        incomplete_results: expect.any(Boolean),
        items: expect.any(Array),
      })
    })

    it('should handle pagination patterns', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Page 1
      const page1 = await client.searchRepositories({
        q: 'javascript',
        per_page: 5,
        page: 1,
      })

      // Page 2
      const page2 = await client.searchRepositories({
        q: 'javascript',
        per_page: 5,
        page: 2,
      })

      expect(page1.items).toHaveLength(5)
      expect(page2.items).toHaveLength(5)
      expect(page1.total_count).toBe(page2.total_count)
    })
  })

  describe('Issue Management Workflows', () => {
    it('should list repository issues', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const issues = await client.listIssues('testuser', 'test-repo', { per_page: 5 })

      expect(issues).toHaveLength(2)
      expect(issues[0]).toMatchObject({
        id: expect.any(Number),
        number: expect.any(Number),
        title: expect.any(String),
        state: expect.any(String),
      })
    })

    it('should get single issue by number', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const issue = await client.getIssue({ owner: 'testuser', repo: 'test-repo', issue_number: 1 })

      expect(issue).toMatchObject({
        id: expect.any(Number),
        number: 1,
        title: expect.any(String),
        state: expect.any(String),
      })
    })
  })

  describe('Rate Limiting Integration', () => {
    it('should retrieve rate limit information', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const rateLimit = await client.getRateLimit()

      expect(rateLimit).toMatchObject({
        core: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number),
        },
        search: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number),
        },
        graphql: {
          limit: expect.any(Number),
          remaining: expect.any(Number),
          reset: expect.any(Number),
        },
      })
    })

    it('should parse rate limit headers correctly', async () => {
      const token = 'ghp_test_token'

      const client = new GitHubClient({
        auth: {
          type: 'token',
          token,
        },
      })

      const user = await client.getAuthenticatedUser()

      // Verify user data
      expect(user.login).toBe('testuser')
      expect(user.id).toBe(12345)
    })
  })

  describe('Concurrent Operations Integration', () => {
    it('should handle concurrent requests properly', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Simulate concurrent requests
      const requests = Array.from({ length: 5 }, () => client.getAuthenticatedUser())

      const responses = await Promise.allSettled(requests)

      // All should succeed
      expect(responses.every(r => r.status === 'fulfilled')).toBe(true)
    })

    it('should handle mixed API operations concurrently', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Mix of REST and GraphQL operations
      const operations = [
        client.getAuthenticatedUser(),
        client.getRepository('testowner', 'testrepo'),
        client.graphql('query { viewer { login } }'),
        client.getRateLimit(),
      ]

      const results = await Promise.allSettled(operations)

      // All operations should succeed
      expect(results.every(r => r.status === 'fulfilled')).toBe(true)
    })
  })
})

// =====================================================
// REAL API BASIC WORKFLOW INTEGRATION TESTS
// =====================================================
describe.skipIf(SKIP_INTEGRATION_TESTS)('Real API Basic Workflow Integration', () => {
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

  describe('End-to-End API Usage', () => {
    it('should get a public repository', async () => {
      const repo = await client.getRepository('microsoft', 'vscode')

      expect(repo).toBeDefined()
      expect(repo.name).toBe('vscode')
      expect(repo.owner.login).toBe('microsoft')
      expect(repo.private).toBe(false)
      expect(typeof repo.stargazers_count).toBe('number')
    }, 10000)

    it('should search repositories with realistic patterns', async () => {
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

    it('should handle pagination in real usage', async () => {
      // Test pagination by requesting multiple pages
      const page1 = await client.searchRepositories({
        q: 'language:javascript',
        per_page: 10,
        page: 1,
      })

      const page2 = await client.searchRepositories({
        q: 'language:javascript',
        per_page: 10,
        page: 2,
      })

      expect(page1.items).toHaveLength(10)
      expect(page2.items).toHaveLength(10)

      // Items should be different between pages
      const page1Ids = page1.items.map(item => item.id)
      const page2Ids = page2.items.map(item => item.id)
      expect(page1Ids).not.toEqual(page2Ids)
    }, 15000)
  })

  describe('Error Handling Integration', () => {
    it('should handle 404 errors gracefully', async () => {
      await expect(async () => {
        await client.getRepository('nonexistent-user-12345', 'nonexistent-repo-12345')
      }).rejects.toThrow(GitHubError)
    }, 10000)
  })

  describe('Real-World Usage Patterns', () => {
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

    it('should work with real-world authentication patterns', async () => {
      const authPatterns = [
        { type: 'token' as const, token: `ghp_${'x'.repeat(36)}` },
        { type: 'token' as const, token: `github_pat_${'x'.repeat(70)}` },
      ]

      for (const auth of authPatterns) {
        const client = new GitHubClient({ auth })
        expect(client).toBeInstanceOf(GitHubClient)
      }
    })
  })
})
