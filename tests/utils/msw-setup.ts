/**
 * MSW (Mock Service Worker) Setup and Handlers
 * Optimized for performance with cached handlers and streamlined initialization
 *
 * This is the unified MSW setup that consolidates all MSW configurations
 * and fixes fetch/Node.js compatibility issues
 */

import { type HttpHandler, HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import {
  createGitHubRepositoryMock,
  createGitHubUserMock,
  createManyGitHubIssueMocks,
  createManyGitHubRepositoryMocks,
  type GitHubRepositoryMock,
  type GitHubUserMock,
  resetAllGitHubMockCounters,
} from './github-mocks'

// Ensure global fetch is available for MSW
if (typeof globalThis.fetch === 'undefined') {
  throw new Error(
    'fetch is not available. Make sure the setup.ts file is properly loaded before MSW.'
  )
}

// Ensure TransformStream is available for MSW 2.x
if (typeof globalThis.TransformStream === 'undefined') {
  console.warn('TransformStream not available, MSW may not work correctly')
}

// Performance optimizations: Pre-compiled regex patterns for faster matching
const XSS_PATTERNS = [/<script[^>]*>/i, /javascript:/i, /on\w+\s*=/i, /expression\s*\(/i]
const SUSPICIOUS_PATTERNS = [
  /union\s+select/i,
  /drop\s+table/i,
  /;\s*--/,
  /<script>/i,
  /javascript:/i,
]

// Cached rate limiting state for better performance
const _REQUEST_COUNTS = new Map<string, number>()
const _RATE_LIMIT = 5
const _WINDOW_MS = 60000 // 1 minute

// Pre-create standard responses to avoid repeated JSON serialization
const _DEFAULT_RATE_LIMIT_RESPONSE = {
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
}

// Standard security headers as a cached object
const _SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

// Optimized validation functions
const _validateQueryLength = (query: string): boolean => query.length <= 1000
const _hasXssPattern = (query: string): boolean => XSS_PATTERNS.some(pattern => pattern.test(query))
const _hasSuspiciousPattern = (url: URL): boolean =>
  SUSPICIOUS_PATTERNS.some(pattern => pattern.test(url.search) || pattern.test(url.pathname))

/**
 * Create a GitHub user endpoint handler
 */
export function createUserHandler(userData: Partial<GitHubUserMock> = {}) {
  return http.get('https://api.github.com/user', () => {
    const user = createGitHubUserMock(userData)
    return HttpResponse.json(user)
  })
}

/**
 * Create a GitHub repository endpoint handler
 */
export function createRepositoryHandler(
  owner: string,
  repo: string,
  repoData: Partial<GitHubRepositoryMock> = {}
) {
  return http.get(`https://api.github.com/repos/${owner}/${repo}`, () => {
    const repository = createGitHubRepositoryMock({
      name: repo,
      full_name: `${owner}/${repo}`,
      owner: createGitHubUserMock({ login: owner }),
      ...repoData,
    })
    return HttpResponse.json(repository)
  })
}

/**
 * Create a GitHub user repositories handler
 */
export function createUserRepositoriesHandler(
  username: string,
  repos: Partial<GitHubRepositoryMock>[] = []
) {
  return http.get(`https://api.github.com/users/${username}/repos`, ({ request }) => {
    const url = new URL(request.url)
    const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')
    const page = Number.parseInt(url.searchParams.get('page') || '1')

    const mockRepos =
      repos.length > 0
        ? repos.map(repo => createGitHubRepositoryMock(repo))
        : createManyGitHubRepositoryMocks(perPage)

    // Simulate pagination
    const startIndex = (page - 1) * perPage
    const endIndex = startIndex + perPage
    const paginatedRepos = mockRepos.slice(startIndex, endIndex)

    return HttpResponse.json(paginatedRepos, {
      headers: {
        Link: `<https://api.github.com/users/${username}/repos?page=${page + 1}&per_page=${perPage}>; rel="next"`,
      },
    })
  })
}

/**
 * Create a GitHub repository issues handler
 */
export function createRepositoryIssuesHandler(owner: string, repo: string, issueCount = 10) {
  return http.get(`https://api.github.com/repos/${owner}/${repo}/issues`, ({ request }) => {
    const url = new URL(request.url)
    const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')
    const page = Number.parseInt(url.searchParams.get('page') || '1')

    const issues = createManyGitHubIssueMocks(issueCount)

    // Simulate pagination
    const startIndex = (page - 1) * perPage
    const endIndex = startIndex + perPage
    const paginatedIssues = issues.slice(startIndex, endIndex)

    return HttpResponse.json(paginatedIssues)
  })
}

/**
 * Create a GitHub GraphQL handler
 */
export function createGraphQLHandler(responseData: Record<string, unknown> = {}) {
  return http.post('https://api.github.com/graphql', async ({ request }) => {
    const _body = (await request.json()) as { query: string; variables?: Record<string, unknown> }

    // Default GraphQL response structure
    const defaultResponse = {
      data: {
        viewer: {
          login: 'testuser',
        },
        rateLimit: {
          limit: 5000,
          cost: 1,
          remaining: 4999,
          resetAt: new Date(Date.now() + 3600000).toISOString(),
        },
        ...responseData,
      },
    }

    return HttpResponse.json(defaultResponse)
  })
}

/**
 * Create error response handlers
 */
export function createErrorHandler(path: string, status = 500, message = 'Internal Server Error') {
  return http.get(path, () => {
    return HttpResponse.json(
      { message, documentation_url: 'https://docs.github.com/rest' },
      { status }
    )
  })
}

/**
 * Create rate limit handler
 */
export function createRateLimitHandler() {
  return http.get('https://api.github.com/rate_limit', () => {
    return HttpResponse.json(_DEFAULT_RATE_LIMIT_RESPONSE)
  })
}

/**
 * Default GitHub API handlers for common endpoints
 */
export const githubHandlers = [
  // User endpoints
  createUserHandler(),
  createRateLimitHandler(),

  // Repository endpoints
  http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
    const { owner, repo } = params
    const repository = createGitHubRepositoryMock({
      name: repo as string,
      full_name: `${owner}/${repo}`,
      owner: createGitHubUserMock({ login: owner as string }),
    })
    return HttpResponse.json(repository)
  }),

  // Issues endpoints
  http.get('https://api.github.com/repos/:owner/:repo/issues', () => {
    const issues = createManyGitHubIssueMocks(10)
    return HttpResponse.json(issues)
  }),

  // GraphQL endpoint
  createGraphQLHandler(),

  // Catch-all for unhandled GitHub API calls
  http.get('https://api.github.com/*', () => {
    return HttpResponse.json({ message: 'Not found' }, { status: 404 })
  }),
]

/**
 * Create and configure MSW server
 */
export const server = setupServer(...githubHandlers)

/**
 * Setup MSW for testing with improved error handling and isolation
 */
export function setupMSW() {
  beforeAll(() => {
    // Verify fetch is available before starting MSW
    if (typeof globalThis.fetch === 'undefined') {
      throw new Error('fetch polyfill not loaded. Ensure tests/setup.ts is properly configured.')
    }

    try {
      server.listen({
        onUnhandledRequest: 'warn',
        onUnhandledError: error => {
          console.warn('MSW unhandled error:', error)
        },
      })
    } catch (error) {
      console.error('Failed to start MSW server:', error)
      throw error
    }
  })

  afterEach(() => {
    try {
      server.resetHandlers()
      resetAllGitHubMockCounters()
    } catch (error) {
      console.warn('Error resetting MSW handlers:', error)
    }
  })

  afterAll(() => {
    try {
      server.close()
    } catch (error) {
      console.warn('Error closing MSW server:', error)
    }
  })
}

/**
 * Mock GitHub API with custom responses
 */
export function mockGitHubAPI(customHandlers: HttpHandler[] = []) {
  server.use(...customHandlers)
}

/**
 * Reset all GitHub mock factories
 */
export function resetGitHubMocks() {
  resetAllGitHubMockCounters()
}

/**
 * Create JWT authentication handlers for API security testing
 */
export function createAuthenticationHandlers() {
  return [
    // Simulate authenticated API endpoints with input validation
    // Handle localhost requests from security tests
    http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
      const url = new URL(request.url)
      const query = url.searchParams.get('q') || ''

      // First, validate input (before authentication check) - use cached validation
      if (!_validateQueryLength(query)) {
        return HttpResponse.json(
          { error: 'Query too long - maximum 1000 characters allowed' },
          { status: 400 }
        )
      }

      // Use cached XSS pattern validation
      if (_hasXssPattern(query)) {
        return HttpResponse.json(
          { error: 'Invalid query - contains potentially dangerous content' },
          { status: 400 }
        )
      }

      // Then check authentication
      const authHeader = request.headers.get('authorization')
      const sessionCookie = request.headers.get('cookie')

      if (!authHeader && !sessionCookie?.includes('next-auth.session-token')) {
        return HttpResponse.json(
          { error: 'Unauthorized - Authentication required' },
          { status: 401 }
        )
      }

      // Simulate successful authenticated response with cached security headers
      return HttpResponse.json(
        {
          repositories: [
            {
              id: 1,
              name: 'test-repo',
              full_name: 'user/test-repo',
              description: 'Test repository for security testing',
              language: 'TypeScript',
              stars: 100,
              url: 'https://github.com/user/test-repo',
            },
          ],
          pagination: {
            page: 1,
            per_page: 20,
            total: 1,
          },
        },
        {
          headers: _SECURITY_HEADERS,
        }
      )
    }),

    // Search opportunities endpoint - handle localhost requests
    http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
      const authHeader = request.headers.get('authorization')
      const sessionCookie = request.headers.get('cookie')

      // Check for authentication
      if (!authHeader && !sessionCookie?.includes('next-auth.session-token')) {
        return HttpResponse.json(
          { error: 'Unauthorized - Authentication required' },
          { status: 401 }
        )
      }

      // Simulate successful authenticated response with cached security headers
      return HttpResponse.json(
        {
          opportunities: [
            {
              id: 1,
              title: 'Add TypeScript support',
              repository: 'user/test-repo',
              difficulty: 'beginner',
              type: 'feature',
              description: 'Add TypeScript support to improve code quality',
              labels: ['good first issue', 'typescript'],
            },
          ],
          pagination: {
            page: 1,
            per_page: 20,
            total: 1,
          },
        },
        {
          headers: _SECURITY_HEADERS,
        }
      )
    }),

    // Simulate JWT token validation endpoint - handle localhost requests
    http.post('http://localhost:3000/api/auth/verify', async ({ request }) => {
      const authHeader = request.headers.get('authorization')

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json(
          { error: 'Invalid token format' },
          {
            status: 401,
            headers: _SECURITY_HEADERS,
          }
        )
      }

      const token = authHeader.substring(7)

      // Simulate token validation logic
      if (token === 'valid-jwt-token') {
        return HttpResponse.json(
          {
            valid: true,
            user: {
              id: 'user-123',
              email: 'test@example.com',
              name: 'Test User',
            },
          },
          {
            headers: _SECURITY_HEADERS,
          }
        )
      }

      return HttpResponse.json(
        { error: 'Invalid or expired token' },
        {
          status: 401,
          headers: _SECURITY_HEADERS,
        }
      )
    }),

    // Simulate security middleware responses
    http.all('*', ({ request }) => {
      const url = new URL(request.url)

      // Use cached suspicious pattern validation
      if (_hasSuspiciousPattern(url)) {
        return HttpResponse.json(
          { error: 'Invalid request - suspicious patterns detected' },
          { status: 400, headers: _SECURITY_HEADERS }
        )
      }

      // Pass through to other handlers
      return
    }),
  ]
}

/**
 * Create rate limiting handlers for security testing
 */
export function createRateLimitHandlers() {
  return [
    http.all('http://localhost:3000/api/*', ({ request }) => {
      const clientId = request.headers.get('x-forwarded-for') || 'default-client'
      const now = Date.now()
      const key = `${clientId}-${Math.floor(now / _WINDOW_MS)}`

      const currentCount = _REQUEST_COUNTS.get(key) || 0

      if (currentCount >= _RATE_LIMIT) {
        return HttpResponse.json(
          {
            error: 'Rate limit exceeded',
            resetTime: Math.floor(now / _WINDOW_MS + 1) * _WINDOW_MS,
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': _RATE_LIMIT.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.floor(now / _WINDOW_MS + 1).toString(),
              ..._SECURITY_HEADERS,
            },
          }
        )
      }

      _REQUEST_COUNTS.set(key, currentCount + 1)

      // Pass through to other handlers
      return
    }),
  ]
}

/**
 * Create input validation handlers for security testing
 */
export function createInputValidationHandlers() {
  return [
    http.get('http://localhost:3000/api/search/*', ({ request }) => {
      const url = new URL(request.url)
      const query = url.searchParams.get('q') || ''

      // Use cached validation functions for better performance
      if (!_validateQueryLength(query)) {
        return HttpResponse.json(
          { error: 'Query too long - maximum 1000 characters allowed' },
          { status: 400, headers: _SECURITY_HEADERS }
        )
      }

      if (_hasXssPattern(query)) {
        return HttpResponse.json(
          { error: 'Invalid query - contains potentially dangerous content' },
          { status: 400, headers: _SECURITY_HEADERS }
        )
      }

      // For valid queries, return a successful response to avoid unhandled request warnings
      return HttpResponse.json(
        {
          repositories: [],
          message: 'Query validation passed',
        },
        { status: 200, headers: _SECURITY_HEADERS }
      )
    }),
  ]
}

/**
 * Setup comprehensive security-aware MSW server
 */
export function setupSecurityMSW() {
  // Use the same server instance to avoid conflicts
  const securityHandlers = [
    ...createAuthenticationHandlers(),
    ...createInputValidationHandlers(),
    // Debug catch-all handler to capture any unmatched requests
    http.all('*', ({ request }) => {
      const url = new URL(request.url)
      console.log(`🔍 MSW DEBUG: Unmatched request: ${request.method} ${url.pathname}${url.search}`)

      // Pass through to let other handlers potentially match
      return
    }),
    // Note: Rate limiting handlers are separate as they can interfere with normal tests
  ]

  server.use(...securityHandlers)
}

/**
 * Setup MSW with rate limiting for specific tests
 */
export function setupRateLimitMSW() {
  const rateLimitHandlers = createRateLimitHandlers()
  server.use(...rateLimitHandlers)
}
