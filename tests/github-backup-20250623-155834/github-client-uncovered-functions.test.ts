/**
 * GitHub Client Uncovered Functions Tests
 *
 * This test suite specifically targets the remaining uncovered functions
 * to push coverage closer to the 90% target:
 * - getUser method (lines 307-321)
 * - getIssue method (lines 327-349)
 * - graphql method (lines 371-379)
 * - searchRepositories method (lines 284-305)
 * - createGitHubClient factory function (lines 438-440)
 */

import { describe, expect, it } from 'vitest'
import { createGitHubClient, GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { setupMSW } from './msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from './test-helpers'

describe('GitHub Client Uncovered Functions Tests', () => {
  setupMSW()
  setupGitHubTestIsolation()

  const createClient = (config?: Partial<GitHubClientConfig>) => {
    return createTrackedClient(GitHubClient, config)
  }

  describe('getUser method coverage', () => {
    it('should cover getUser method execution', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // This should cover lines 307-321
      const user = await client.getUser('testuser')
      expect(user.login).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.type).toBeDefined()
    })

    it('should cover getUser with caching', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Test different users to cover cache functionality
      const user1 = await client.getUser('octocat')
      expect(user1.login).toBe('octocat')

      // Second call to same user should use cache
      const user2 = await client.getUser('octocat')
      expect(user2.login).toBe('octocat')

      // Stats should show cache usage
      const stats = client.getCacheStats()
      expect(stats.hits).toBeGreaterThanOrEqual(1)
    })
  })

  describe('getIssue method coverage', () => {
    it('should cover getIssue method execution', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // This should cover lines 327-349
      const issue = await client.getIssue({
        owner: 'octocat',
        repo: 'Hello-World',
        issueNumber: 1,
      })

      expect(issue.number).toBeDefined()
      expect(issue.title).toBeDefined()
      expect(issue.state).toBeDefined()
      expect(issue.user).toBeDefined()
    })

    it('should cover getIssue with caching', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // First call
      const issue1 = await client.getIssue({
        owner: 'octocat',
        repo: 'Hello-World',
        issueNumber: 1,
      })
      expect(issue1.number).toBe(1)

      // Second call to same issue should use cache
      const issue2 = await client.getIssue({
        owner: 'octocat',
        repo: 'Hello-World',
        issueNumber: 1,
      })
      expect(issue2.number).toBe(1)

      // Verify cache was used
      const stats = client.getCacheStats()
      expect(stats.hits).toBeGreaterThanOrEqual(1)
    })
  })

  describe('graphql method coverage', () => {
    it('should cover graphql method execution', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // This should cover lines 371-379
      const query = `
        query {
          viewer {
            login
          }
        }
      `

      const result = await client.graphql<{ viewer: { login: string } }>(query)
      expect(result.viewer.login).toBeDefined()
    })

    it('should cover graphql method with variables', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      const query = `
        query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            name
            owner {
              login
            }
          }
        }
      `

      const variables = { owner: 'octocat', name: 'Hello-World' }
      const result = await client.graphql<{
        repository: { name: string; owner: { login: string } }
      }>(query, variables)

      expect(result.repository).toBeDefined()
      expect(result.repository.name).toBeDefined()
    })
  })

  describe('searchRepositories method coverage', () => {
    it('should cover searchRepositories method execution', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // This should cover lines 284-305
      const searchResult = await client.searchRepositories({ q: 'javascript' })

      expect(searchResult.total_count).toBeDefined()
      expect(searchResult.incomplete_results).toBeDefined()
      expect(Array.isArray(searchResult.items)).toBe(true)
    })

    it('should cover searchRepositories with optional parameters', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // Test with all optional parameters to cover conditional branches
      const searchResult = await client.searchRepositories({
        q: 'language:javascript',
        sort: 'stars',
        order: 'desc',
        page: 2,
        per_page: 50,
      })

      expect(searchResult.total_count).toBeDefined()
      expect(Array.isArray(searchResult.items)).toBe(true)
    })

    it('should cover searchRepositories caching', async () => {
      const client = createClient({ auth: { type: 'token', token: 'test_token' } })

      // First call
      const result1 = await client.searchRepositories({ q: 'react' })
      expect(result1.items).toBeDefined()

      // Second call should use cache
      const result2 = await client.searchRepositories({ q: 'react' })
      expect(result2.items).toBeDefined()

      // Verify cache usage
      const stats = client.getCacheStats()
      expect(stats.hits).toBeGreaterThanOrEqual(1)
    })
  })

  describe('createGitHubClient factory function coverage', () => {
    it('should cover createGitHubClient factory function', () => {
      // This should cover lines 438-440
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
      }

      const client = createGitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)
      expect(client).toBeDefined()
    })

    it('should create client with full configuration through factory', () => {
      const config: GitHubClientConfig = {
        auth: { type: 'token', token: 'test_token' },
        baseUrl: 'https://api.github.com',
        userAgent: 'test-client/1.0.0',
        cache: { maxAge: 600, maxSize: 500 },
        retry: { retries: 2, doNotRetry: ['400'] },
        throttle: {
          onRateLimit: () => true,
          onSecondaryRateLimit: () => false,
        },
      }

      const client = createGitHubClient(config)
      expect(client).toBeInstanceOf(GitHubClient)

      // Verify it's functional
      const stats = client.getCacheStats()
      expect(stats.maxSize).toBe(500)
    })
  })

  describe('comprehensive function integration', () => {
    it('should use all uncovered functions in sequence', async () => {
      // Create client using factory function
      const client = createGitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Use searchRepositories
      const searchResult = await client.searchRepositories({ q: 'react' })
      expect(searchResult.items).toBeDefined()

      // Use getUser
      const user = await client.getUser('octocat')
      expect(user.login).toBe('octocat')

      // Use getIssue
      const issue = await client.getIssue({
        owner: 'octocat',
        repo: 'Hello-World',
        issueNumber: 1,
      })
      expect(issue.number).toBe(1)

      // Use graphql
      const graphqlResult = await client.graphql(`
        query {
          viewer {
            login
          }
        }
      `)
      expect(graphqlResult).toBeDefined()

      // Verify at least some operations were cached
      const stats = client.getCacheStats()
      expect(stats.size).toBeGreaterThanOrEqual(1)
    })
  })
})
