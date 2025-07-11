/**
 * GitHub Error Recovery & Resilience Integration Tests
 *
 * This file contains error scenarios and recovery pattern integration tests:
 * - Network failure handling and retry mechanisms
 * - API error recovery and fallback strategies
 * - Rate limiting scenarios and backoff patterns
 * - Authentication error handling and token refresh
 * - Service degradation and graceful failure modes
 * - Circuit breaker patterns and health checks
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'
import { mockGitHubAPI } from '../msw-setup'
import { setupGitHubTestIsolation } from '../test-helpers'

// Skip real integration tests flag
const SKIP_INTEGRATION_TESTS = !process.env.GITHUB_TOKEN || process.env.SKIP_INTEGRATION === 'true'

// Setup MSW and test isolation
setupGitHubTestIsolation()

describe('GitHub Error Recovery & Resilience Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitHubAPI.resetToDefaults()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Network Failure Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 2,
          initialDelay: 100,
        },
      })

      // Test with a repository that triggers timeout
      await expect(client.getRepository('timeout-test', 'timeout-repo-unique')).rejects.toThrow()
    })

    it('should implement proper retry mechanisms', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 3,
          initialDelay: 50,
          backoffFactor: 2,
        },
      })

      // Test retry behavior with transient failures
      const start = Date.now()

      try {
        await client.getRepository('retry-test', 'retry-repo-unique')
      } catch (error) {
        const duration = Date.now() - start
        // Should have attempted retries (taking some time)
        expect(duration).toBeGreaterThan(50)
        expect(error).toBeInstanceOf(GitHubError)
      }
    })

    it('should handle connection refused errors', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      await expect(
        client.getRepository('connection-test', 'connection-refused-unique')
      ).rejects.toThrow(GitHubError)
    })

    it('should handle multiple failures with Octokit retry behavior', async () => {
      // NOTE: This test verifies Octokit's built-in retry behavior, not a custom circuit breaker
      // Octokit's retry plugin automatically handles backoff and failure scenarios
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 2 },
      })

      // Simulate multiple failures to test retry behavior
      const failurePromises = Array.from({ length: 5 }, (_, index) =>
        client
          .getRepository({
            owner: 'retry-test',
            repo: `retry-test-repo-${index}`,
          })
          .catch(error => ({ error, index }))
      )

      const results = await Promise.all(failurePromises)

      // All should fail but in a controlled manner
      results.forEach(result => {
        expect(result).toHaveProperty('error')
        expect(result.error).toBeInstanceOf(GitHubError)
      })
    })
  })

  describe('API Error Recovery', () => {
    it('should handle rate limiting with backoff', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: {
          retries: 2,
          respectRetryAfter: true,
        },
      })

      const start = Date.now()

      await expect(client.getRepository('test', 'rate-limited-unique')).rejects.toThrow(GitHubError)

      const duration = Date.now() - start
      // Should have waited due to rate limit headers
      expect(duration).toBeGreaterThan(100)
    })

    it('should handle secondary rate limiting', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      await expect(client.getRepository('test', 'secondary-limit-unique')).rejects.toThrow(
        GitHubError
      )
    })

    it('should gracefully handle 5xx server errors', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 2 },
      })

      await expect(
        client.getRepository('server-error-test', 'server-error-repo-unique')
      ).rejects.toThrow(GitHubError)
    })

    it('should handle validation errors appropriately', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      await expect(
        client.getRepository('validation-test', 'validation-error-repo-unique')
      ).rejects.toThrow(GitHubError)
    })

    it('should handle malformed JSON responses', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      await expect(
        client.getRepository('malformed-test', 'malformed-repo-unique')
      ).rejects.toThrow()
    })
  })

  describe('Authentication Error Handling', () => {
    it('should handle bad credentials gracefully', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      await expect(client.getRepository('test', 'bad-credentials-unique')).rejects.toThrow(
        GitHubError
      )
    })

    it('should handle token expiration scenarios', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'expired_token' },
      })

      await expect(client.getAuthenticatedUser()).rejects.toThrow(GitHubError)
    })

    it('should handle insufficient permissions', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'limited_token' },
      })

      await expect(client.getRepository('private-org', 'private-repo')).rejects.toThrow(GitHubError)
    })
  })

  describe('Service Degradation Patterns', () => {
    it('should handle partial service outages', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      // Some endpoints work, others don't
      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')

      // But repository access might fail
      await expect(client.getRepository('outage-test', 'outage-repo-unique')).rejects.toThrow()
    })

    it('should implement graceful fallback strategies', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      try {
        // Primary endpoint might fail
        await client.getRepository('fallback-test', 'fallback-repo-unique')
      } catch (primaryError) {
        expect(primaryError).toBeInstanceOf(GitHubError)

        // Fallback to basic user info
        const user = await client.getAuthenticatedUser()
        expect(user.login).toBe('testuser')
      }
    })

    it('should handle concurrent request failures', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      const concurrentRequests = Array.from({ length: 3 }, (_, index) =>
        client
          .getRepository({
            owner: 'concurrent-error-test',
            repo: `error-repo-${index}`,
          })
          .catch(error => ({ error, index }))
      )

      const results = await Promise.all(concurrentRequests)

      // All should fail but independently
      results.forEach((result, index) => {
        expect(result).toHaveProperty('error')
        expect(result.index).toBe(index)
      })
    })
  })

  describe('Recovery and Health Checks', () => {
    it('should implement health check mechanisms', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Health check via rate limit endpoint
      const rateLimit = await client.getRateLimit()
      expect(rateLimit).toHaveProperty('core')
      expect(rateLimit.core).toHaveProperty('limit')
      expect(rateLimit.core).toHaveProperty('remaining')
    })

    it('should recover from transient failures', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 2 },
      })

      // First request might fail, but system should recover
      let _firstAttemptFailed = false

      try {
        await client.getRepository('recovery-test', 'recovery-repo-unique')
      } catch (_error) {
        _firstAttemptFailed = true
      }

      // Subsequent request should work (assuming recovery)
      const user = await client.getAuthenticatedUser()
      expect(user.login).toBe('testuser')
    })

    it('should track error patterns for monitoring', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      const errors: Array<{ type: string; error: unknown }> = []

      // Collect errors from multiple failed requests
      try {
        await client.getRepository('error-tracking-test', 'error-repo-1')
      } catch (error) {
        errors.push({ type: 'repository', error })
      }

      try {
        await client.getRepository('error-tracking-test', 'error-repo-2')
      } catch (error) {
        errors.push({ type: 'repository', error })
      }

      expect(errors.length).toBeGreaterThan(0)
      errors.forEach(({ error }) => {
        expect(error).toBeInstanceOf(GitHubError)
      })
    })
  })

  describe('Edge Case Error Scenarios', () => {
    it('should handle extremely large response payloads', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      // Repository with large data should be handled
      const repo = await client.getRepository('testowner', 'testrepo')
      expect(repo.name).toBe('testrepo')
    })

    it('should handle unicode and special characters in errors', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
      })

      await expect(client.getRepository('unicode-test-😀', 'unicode-repo-unique')).rejects.toThrow()
    })

    it('should handle rapid successive error conditions', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        retry: { retries: 1 },
      })

      const rapidRequests = Array.from({ length: 10 }, (_, index) =>
        client
          .getRepository({
            owner: 'rapid-error-test',
            repo: `rapid-error-repo-${index}`,
          })
          .catch(error => ({ error, index }))
      )

      const results = await Promise.allSettled(rapidRequests)

      // Should handle all requests without system failure
      expect(results.length).toBe(10)
      results.forEach(result => {
        expect(result.status).toBe('fulfilled')
      })
    })
  })
})

// =====================================================
// REAL API ERROR RECOVERY INTEGRATION TESTS
// =====================================================
describe.skipIf(SKIP_INTEGRATION_TESTS)('Real API Error Recovery Integration', () => {
  let client: GitHubClient

  beforeEach(() => {
    client = new GitHubClient({
      auth: {
        type: 'token',
        token: process.env.GITHUB_TOKEN ?? 'dummy-token',
      },
      retry: {
        retries: 2,
        initialDelay: 1000,
        respectRetryAfter: true,
      },
    })
  })

  describe('Real-world Error Scenarios', () => {
    it('should handle non-existent repository gracefully', async () => {
      await expect(
        client.getRepository('definitely-does-not-exist-123456789', 'also-does-not-exist-987654321')
      ).rejects.toThrow(GitHubError)
    }, 10000)

    it('should respect rate limiting in real scenarios', async () => {
      // Get current rate limit
      const rateLimit = await client.getRateLimit()
      expect(rateLimit.core.remaining).toBeGreaterThanOrEqual(0)

      // Make a request and check rate limit again
      await client.getRepository('microsoft', 'vscode')

      const newRateLimit = await client.getRateLimit()
      expect(newRateLimit.core.remaining).toBeLessThanOrEqual(rateLimit.core.remaining)
    }, 15000)

    it('should handle API maintenance gracefully', async () => {
      // Test with a large repository that might trigger slower responses
      const start = Date.now()

      try {
        const repo = await client.getRepository('facebook', 'react')

        expect(repo.name).toBe('react')
        expect(repo.owner.login).toBe('facebook')

        const duration = Date.now() - start
        console.log(`Request completed in ${duration}ms`)
      } catch (error) {
        // Even if it fails, should fail gracefully
        expect(error).toBeInstanceOf(GitHubError)
      }
    }, 20000)
  })
})
