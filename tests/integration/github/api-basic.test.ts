/**
 * Basic GitHub API Integration Tests
 *
 * Tests basic GitHub API operations using real API calls
 * to verify client functionality in a live environment.
 */

import { GitHubClient } from '@/lib/github/client'
import { parseRateLimitHeader } from '@/lib/github/utils'
import { afterEach, beforeEach, expect } from 'vitest'
import type { IntegrationTestContext } from '../infrastructure/test-config'
import {
  describeIntegration,
  integrationTest,
  measurePerformance,
  withRetry,
} from '../infrastructure/test-runner'

describeIntegration(
  'GitHub API - Basic Operations',
  getContext => {
    let client: GitHubClient
    let context: IntegrationTestContext

    beforeEach(() => {
      context = getContext()

      // Create client with test token
      client = new GitHubClient({
        auth: {
          type: 'token',
          token: context.env.GITHUB_TEST_TOKEN,
        },
        includeRateLimit: true,
        cache: {
          enabled: true,
          storage: 'memory',
        },
      })
    })

    afterEach(async () => {
      // Clean up client
      await client.destroy()
    })

    integrationTest('should authenticate and get user info', async () => {
      const { result: user, duration } = await measurePerformance(
        'GET /user',
        () => client.rest.users.getAuthenticated(),
        context
      )

      expect(user.data).toBeDefined()
      expect(user.data.login).toBeTruthy()
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds

      // Check rate limit headers
      expect(user.headers['x-ratelimit-limit']).toBeDefined()
      expect(user.headers['x-ratelimit-remaining']).toBeDefined()
    })

    integrationTest('should list repositories with pagination', async () => {
      const repos = await withRetry(async () => {
        const response = await client.rest.repos.listForAuthenticatedUser({
          per_page: 10,
          page: 1,
          sort: 'updated',
        })
        return response
      })

      expect(repos.data).toBeDefined()
      expect(Array.isArray(repos.data)).toBe(true)
      expect(repos.data.length).toBeLessThanOrEqual(10)

      // Record metrics
      if (context.metricsCollector && repos.headers['x-ratelimit-remaining']) {
        context.metricsCollector.recordRateLimit(
          'core',
          parseRateLimitHeader(repos.headers['x-ratelimit-remaining']),
          parseRateLimitHeader(repos.headers['x-ratelimit-limit'], 5000)
        )
      }
    })

    integrationTest('should handle repository operations', async () => {
      const testRepo = context.repositories.get('public-api-test')
      if (!testRepo) {
        throw new Error('Test repository not found')
      }

      // Get repository details
      const repo = await client.rest.repos.get({
        owner: testRepo.owner,
        repo: testRepo.repo,
      })

      expect(repo.data.name).toBe(testRepo.repo)
      expect(repo.data.owner.login).toBe(testRepo.owner)

      // Update repository description
      const updatedRepo = await client.rest.repos.update({
        owner: testRepo.owner,
        repo: testRepo.repo,
        description: `Updated at ${new Date().toISOString()}`,
      })

      expect(updatedRepo.data.description).toContain('Updated at')
    })

    integrationTest('should work with issues', async () => {
      const testRepo = context.repositories.get('public-api-test')
      if (!testRepo) {
        throw new Error('Test repository not found')
      }

      // Create an issue
      const issue = await client.rest.issues.create({
        owner: testRepo.owner,
        repo: testRepo.repo,
        title: 'Integration Test Issue',
        body: 'This issue was created by an integration test',
        labels: ['test', 'automated'],
      })

      expect(issue.data.number).toBeDefined()
      expect(issue.data.state).toBe('open')

      // List issues
      const issues = await client.rest.issues.listForRepo({
        owner: testRepo.owner,
        repo: testRepo.repo,
        state: 'open',
      })

      expect(issues.data.some(i => i.number === issue.data.number)).toBe(true)

      // Close the issue
      const closedIssue = await client.rest.issues.update({
        owner: testRepo.owner,
        repo: testRepo.repo,
        issue_number: issue.data.number,
        state: 'closed',
      })

      expect(closedIssue.data.state).toBe('closed')
    })

    integrationTest('should use GraphQL API', async () => {
      const testRepo = context.repositories.get('public-api-test')
      if (!testRepo) {
        throw new Error('Test repository not found')
      }

      const query = `
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          name
          description
          stargazerCount
          issues(first: 5, states: OPEN) {
            totalCount
            nodes {
              title
              number
            }
          }
        }
        rateLimit {
          limit
          cost
          remaining
          resetAt
        }
      }
    `

      const result = await measurePerformance(
        'GraphQL Query',
        () =>
          client.graphql(query, {
            owner: testRepo.owner,
            name: testRepo.repo,
          }),
        context
      )

      expect(result.result.repository).toBeDefined()
      expect(result.result.repository.name).toBe(testRepo.repo)
      expect(result.result.rateLimit).toBeDefined()

      // Record GraphQL rate limit
      if (context.metricsCollector) {
        context.metricsCollector.recordRateLimit(
          'graphql',
          result.result.rateLimit.remaining,
          result.result.rateLimit.limit
        )
      }
    })

    integrationTest('should handle caching correctly', async () => {
      const testRepo = context.repositories.get('public-api-test')
      if (!testRepo) {
        throw new Error('Test repository not found')
      }

      // First request - cache miss
      const firstRequest = await measurePerformance(
        'First request (cache miss)',
        () =>
          client.rest.repos.get({
            owner: testRepo.owner,
            repo: testRepo.repo,
          }),
        context
      )

      // Record cache miss
      if (context.metricsCollector) {
        context.metricsCollector.recordCacheMiss(`repos/${testRepo.owner}/${testRepo.repo}`)
      }

      // Second request - should be cached
      const secondRequest = await measurePerformance(
        'Second request (cache hit)',
        () =>
          client.rest.repos.get({
            owner: testRepo.owner,
            repo: testRepo.repo,
          }),
        context
      )

      // Record cache hit
      if (context.metricsCollector) {
        context.metricsCollector.recordCacheHit(`repos/${testRepo.owner}/${testRepo.repo}`)
      }

      // Cache hit should be faster
      expect(secondRequest.duration).toBeLessThan(firstRequest.duration)

      // Data should be the same
      expect(secondRequest.result.data).toEqual(firstRequest.result.data)
    })
  },
  {
    skip: false, // Set to true to skip these tests
  }
)
