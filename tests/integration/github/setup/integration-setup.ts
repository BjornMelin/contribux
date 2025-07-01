/**
 * Integration Test Setup & Configuration
 *
 * Centralized setup and configuration for GitHub integration tests.
 * Provides consistent test environment and utilities.
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { GitHubClient } from '@/lib/github/client'

/**
 * Integration test configuration
 */
export const integrationConfig = {
  timeout: {
    default: 10000,
    extended: 30000,
    short: 5000,
  },

  retry: {
    attempts: 3,
    delay: 1000,
  },

  cache: {
    maxAge: 300,
    maxSize: 100,
  },

  rateLimit: {
    respectLimits: true,
    backoffFactor: 2,
    maxDelay: 5000,
  },
} as const

/**
 * Test environment detection
 */
export const testEnvironment = {
  isCI: !!process.env.CI,
  hasGitHubToken: !!process.env.GITHUB_TOKEN,
  skipIntegration: process.env.SKIP_INTEGRATION === 'true',
  verbose: process.env.VERBOSE_TESTS === 'true',
} as const

/**
 * MSW server for mocking GitHub API
 */
const mockServer = setupServer()

/**
 * Integration test setup handler
 */
export function setupIntegrationTest() {
  const clientInstances: GitHubClient[] = []

  beforeAll(async () => {
    // Start MSW server
    mockServer.listen({
      onUnhandledRequest: 'warn',
    })

    // Setup default handlers
    setupDefaultHandlers()

    if (testEnvironment.verbose) {
      console.log('Integration test environment initialized')
    }
  })

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Reset MSW handlers
    mockServer.resetHandlers()
    setupDefaultHandlers()

    // Track client instances for cleanup
    clientInstances.length = 0
  })

  afterEach(async () => {
    // Cleanup client instances
    await Promise.all(
      clientInstances.map(client =>
        client.destroy?.().catch(() => {
          // Ignore cleanup errors
        })
      )
    )
    clientInstances.length = 0

    // Restore all mocks
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    // Stop MSW server
    mockServer.close()

    if (testEnvironment.verbose) {
      console.log('Integration test environment cleaned up')
    }
  })

  return {
    registerClient: (client: GitHubClient) => {
      clientInstances.push(client)
      return client
    },

    mockServer,

    createTestClient: (options: Parameters<typeof GitHubClient>[0] = {}) => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: integrationConfig.cache,
        retry: integrationConfig.retry,
        ...options,
      })

      clientInstances.push(client)
      return client
    },
  }
}

/**
 * Setup default MSW handlers for GitHub API
 */
function setupDefaultHandlers() {
  mockServer.use(
    // Authenticated user endpoint
    http.get('https://api.github.com/user', () => {
      return HttpResponse.json({
        login: 'testuser',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/testuser',
        html_url: 'https://github.com/testuser',
        type: 'User',
        site_admin: false,
        name: 'Test User',
        company: 'Test Company',
        blog: 'https://testuser.github.io',
        location: 'Test City',
        email: 'testuser@example.com',
        hireable: true,
        bio: 'Test user for integration testing',
        public_repos: 25,
        public_gists: 5,
        followers: 100,
        following: 50,
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      })
    }),

    // Repository endpoint
    http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
      const { owner, repo } = params

      return HttpResponse.json({
        id: 123456789,
        node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk=',
        name: repo,
        full_name: `${owner}/${repo}`,
        private: false,
        owner: {
          login: owner,
          id: 12345,
          type: 'User',
          site_admin: false,
        },
        html_url: `https://github.com/${owner}/${repo}`,
        description: `Test repository ${repo}`,
        fork: false,
        url: `https://api.github.com/repos/${owner}/${repo}`,
        clone_url: `https://github.com/${owner}/${repo}.git`,
        git_url: `git://github.com/${owner}/${repo}.git`,
        ssh_url: `git@github.com:${owner}/${repo}.git`,
        homepage: `https://${owner}.github.io/${repo}`,
        language: 'TypeScript',
        forks_count: 25,
        stargazers_count: 150,
        watchers_count: 150,
        size: 1024,
        default_branch: 'main',
        open_issues_count: 5,
        topics: ['testing', 'typescript', 'integration'],
        has_issues: true,
        has_projects: true,
        has_wiki: true,
        has_pages: true,
        has_downloads: true,
        archived: false,
        disabled: false,
        visibility: 'public',
        pushed_at: '2023-12-01T10:00:00Z',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-12-01T10:00:00Z',
      })
    }),

    // Search repositories endpoint
    http.get('https://api.github.com/search/repositories', ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('q') || ''
      const per_page = Number.parseInt(url.searchParams.get('per_page') || '30')

      // Generate mock results based on query
      const items = Array.from({ length: Math.min(per_page, 10) }, (_, index) => ({
        id: 123456789 + index,
        node_id: `MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk${index}`,
        name: `search-result-${index}`,
        full_name: `testowner/search-result-${index}`,
        private: false,
        owner: {
          login: 'testowner',
          id: 12345,
          type: 'User',
          site_admin: false,
        },
        html_url: `https://github.com/testowner/search-result-${index}`,
        description: `Search result ${index} for query: ${q}`,
        fork: false,
        url: `https://api.github.com/repos/testowner/search-result-${index}`,
        language: 'JavaScript',
        forks_count: 10 + index,
        stargazers_count: 100 + index * 10,
        watchers_count: 100 + index * 10,
        size: 512 + index * 100,
        default_branch: 'main',
        open_issues_count: index,
        topics: ['search', 'result', 'testing'],
        has_issues: true,
        has_projects: true,
        has_wiki: true,
        has_pages: false,
        has_downloads: true,
        archived: false,
        disabled: false,
        visibility: 'public',
        pushed_at: new Date(Date.now() - index * 86400000).toISOString(),
        created_at: '2023-01-01T00:00:00Z',
        updated_at: new Date(Date.now() - index * 86400000).toISOString(),
      }))

      return HttpResponse.json({
        total_count: q.includes('empty') ? 0 : 1000,
        incomplete_results: false,
        items: q.includes('empty') ? [] : items,
      })
    }),

    // Rate limit endpoint
    http.get('https://api.github.com/rate_limit', () => {
      return HttpResponse.json({
        resources: {
          core: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1,
          },
          search: {
            limit: 30,
            remaining: 29,
            reset: Math.floor(Date.now() / 1000) + 60,
            used: 1,
          },
          graphql: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1,
          },
        },
        rate: {
          limit: 5000,
          remaining: 4999,
          reset: Math.floor(Date.now() / 1000) + 3600,
          used: 1,
        },
      })
    }),

    // User repositories endpoint
    http.get('https://api.github.com/user/repos', ({ request }) => {
      const url = new URL(request.url)
      const per_page = Number.parseInt(url.searchParams.get('per_page') || '30')

      const repos = Array.from({ length: Math.min(per_page, 5) }, (_, index) => ({
        id: 987654321 + index,
        node_id: `MDEwOlJlcG9zaXRvcnk5ODc2NTQzMjE${index}`,
        name: `user-repo-${index}`,
        full_name: `testuser/user-repo-${index}`,
        private: index % 2 === 0,
        owner: {
          login: 'testuser',
          id: 12345,
          type: 'User',
          site_admin: false,
        },
        html_url: `https://github.com/testuser/user-repo-${index}`,
        description: `User repository ${index}`,
        fork: false,
        url: `https://api.github.com/repos/testuser/user-repo-${index}`,
        language: index % 2 === 0 ? 'TypeScript' : 'JavaScript',
        forks_count: index * 2,
        stargazers_count: index * 10,
        watchers_count: index * 10,
        size: 256 + index * 50,
        default_branch: 'main',
        open_issues_count: index,
        topics: ['user', 'repository', `repo-${index}`],
        has_issues: true,
        has_projects: true,
        has_wiki: index % 2 === 0,
        has_pages: false,
        has_downloads: true,
        archived: false,
        disabled: false,
        visibility: index % 2 === 0 ? 'private' : 'public',
        pushed_at: new Date(Date.now() - index * 3600000).toISOString(),
        created_at: '2023-01-01T00:00:00Z',
        updated_at: new Date(Date.now() - index * 3600000).toISOString(),
      }))

      return HttpResponse.json(repos)
    }),

    // Error scenarios for testing
    http.get('https://api.github.com/repos/error-test/*', () => {
      return new HttpResponse(null, { status: 500 })
    }),

    http.get('https://api.github.com/repos/timeout-test/*', () => {
      return new HttpResponse(null, { status: 408 })
    }),

    http.get('https://api.github.com/repos/rate-limit-test/*', () => {
      return new HttpResponse(null, {
        status: 403,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
        },
      })
    })
  )
}

/**
 * Utility functions for integration testing
 */
export const integrationUtils = {
  /**
   * Wait for a specified duration
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Retry an operation with exponential backoff
   */
  retry: async <T>(
    operation: () => Promise<T>,
    options: {
      attempts?: number
      delay?: number
      backoffFactor?: number
    } = {}
  ): Promise<T> => {
    const { attempts = 3, delay = 1000, backoffFactor = 2 } = options

    for (let i = 0; i < attempts; i++) {
      try {
        return await operation()
      } catch (error) {
        if (i === attempts - 1) {
          throw error
        }

        await integrationUtils.wait(delay * backoffFactor ** i)
      }
    }

    throw new Error('Retry attempts exhausted')
  },

  /**
   * Measure execution time of an operation
   */
  measureTime: async <T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = Date.now()
    const result = await operation()
    const duration = Date.now() - start

    return { result, duration }
  },

  /**
   * Create a test client with consistent configuration
   */
  createClient: (overrides: Partial<Parameters<typeof GitHubClient>[0]> = {}) => {
    return new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
      cache: integrationConfig.cache,
      retry: integrationConfig.retry,
      ...overrides,
    })
  },
}

/**
 * Performance monitoring utilities
 */
export class IntegrationPerformanceMonitor {
  private measurements: Array<{ name: string; duration: number; timestamp: number }> = []

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
      const result = await operation()
      const duration = Date.now() - start

      this.measurements.push({
        name,
        duration,
        timestamp: start,
      })

      return result
    } catch (error) {
      const duration = Date.now() - start

      this.measurements.push({
        name: `${name} (failed)`,
        duration,
        timestamp: start,
      })

      throw error
    }
  }

  getReport() {
    if (this.measurements.length === 0) {
      return { measurements: [], summary: null }
    }

    const durations = this.measurements.map(m => m.duration)
    const successful = this.measurements.filter(m => !m.name.includes('(failed)'))

    return {
      measurements: [...this.measurements],
      summary: {
        total: this.measurements.length,
        successful: successful.length,
        failed: this.measurements.length - successful.length,
        averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        totalDuration: durations.reduce((sum, d) => sum + d, 0),
      },
    }
  }

  reset() {
    this.measurements = []
  }
}
