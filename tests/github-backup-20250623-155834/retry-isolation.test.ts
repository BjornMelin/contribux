/**
 * Isolated retry test to verify retry context functionality
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github/client'
import { GitHubError } from '@/lib/github/errors'

// Create isolated MSW server for retry testing
const retryServer = setupServer(
  // Default successful response
  http.get('https://api.github.com/users/:username', ({ params }) => {
    return HttpResponse.json({
      login: params.username,
      id: 12345,
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
      html_url: `https://github.com/${params.username}`,
      type: 'User',
      site_admin: false,
    })
  })
)

describe('GitHub Client Retry Context - Isolated', () => {
  beforeAll(() => {
    retryServer.listen()
  })

  afterEach(() => {
    retryServer.resetHandlers()
  })

  afterAll(() => {
    retryServer.close()
  })

  it('should include retry information in error context when retries are configured', async () => {
    // Setup server to return 503 errors for all requests
    retryServer.use(
      http.get('https://api.github.com/users/:username', () => {
        return HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })
      })
    )

    const client = new GitHubClient({
      auth: { type: 'token', token: 'ghp_test_token' },
      retry: { retries: 2, doNotRetry: [] }, // Allow retries for 503
    })

    try {
      await client.getUser('testuser')
      expect.fail('Expected error to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubError)
      const githubError = error as GitHubError

      // Test retry context
      expect(githubError.requestContext?.retryAttempt).toBeGreaterThan(0)
      expect(githubError.requestContext?.maxRetries).toBe(2)
      expect(githubError.requestContext?.operation).toBe('getUser')

      // Should be classified as retryable
      expect(githubError.isRetryable).toBe(true)
      expect(githubError.errorCategory).toBe('server')
    }
  })

  it('should not include retry context when no retries are configured', async () => {
    // Setup server to return 503 errors for all requests
    retryServer.use(
      http.get('https://api.github.com/users/:username', () => {
        return HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })
      })
    )

    const client = new GitHubClient({
      auth: { type: 'token', token: 'ghp_test_token' },
      retry: { retries: 0 }, // No retries
    })

    try {
      await client.getUser('testuser')
      expect.fail('Expected error to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubError)
      const githubError = error as GitHubError

      // Test retry context
      expect(githubError.requestContext?.retryAttempt).toBe(0)
      expect(githubError.requestContext?.maxRetries).toBe(0)
      expect(githubError.requestContext?.operation).toBe('getUser')
    }
  })
})
