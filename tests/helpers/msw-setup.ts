/**
 * MSW (Mock Service Worker) Setup and Handlers
 * Provides HTTP mocking for GitHub API and other external services
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
 * Setup MSW for testing
 */
export function setupMSW() {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
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
    http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
      const url = new URL(request.url)
      const query = url.searchParams.get('q') || ''

      // First, validate input (before authentication check)
      
      // Validate query length - reject queries longer than 1000 characters
      if (query.length > 1000) {
        return HttpResponse.json(
          { error: 'Query too long - maximum 1000 characters allowed' },
          { status: 400 }
        )
      }

      // Validate for common XSS patterns
      const xssPatterns = [/<script[^>]*>/i, /javascript:/i, /on\w+\s*=/i, /expression\s*\(/i]
      const hasXssPattern = xssPatterns.some(pattern => pattern.test(query))

      if (hasXssPattern) {
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

      // Simulate successful authenticated response
      return HttpResponse.json({
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
      })
    }),

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

      // Simulate successful authenticated response
      return HttpResponse.json({
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
      })
    }),

    // Simulate JWT token validation endpoint
    http.post('http://localhost:3000/api/auth/verify', async ({ request }) => {
      const authHeader = request.headers.get('authorization')

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return HttpResponse.json({ error: 'Invalid token format' }, { status: 401 })
      }

      const token = authHeader.substring(7)

      // Simulate token validation logic
      if (token === 'valid-jwt-token') {
        return HttpResponse.json({
          valid: true,
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
          },
        })
      }

      return HttpResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }),

    // Simulate security middleware responses
    http.all('*', ({ request }) => {
      const url = new URL(request.url)

      // Add security headers to all responses
      const headers = new Headers()
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('X-Frame-Options', 'DENY')
      headers.set('X-XSS-Protection', '1; mode=block')
      headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

      // Check for suspicious patterns in URL (basic SQL injection detection)
      const suspiciousPatterns = [
        /union\s+select/i,
        /drop\s+table/i,
        /;\s*--/,
        /<script>/i,
        /javascript:/i,
      ]

      const hasSuspiciousPattern = suspiciousPatterns.some(
        pattern => pattern.test(url.search) || pattern.test(url.pathname)
      )

      if (hasSuspiciousPattern) {
        return HttpResponse.json(
          { error: 'Invalid request - suspicious patterns detected' },
          { status: 400, headers }
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
  const requestCounts = new Map<string, number>()
  const RATE_LIMIT = 5
  const WINDOW_MS = 60000 // 1 minute

  return [
    http.all('/api/*', ({ request }) => {
      const clientId = request.headers.get('x-forwarded-for') || 'default-client'
      const now = Date.now()
      const key = `${clientId}-${Math.floor(now / WINDOW_MS)}`

      const currentCount = requestCounts.get(key) || 0

      if (currentCount >= RATE_LIMIT) {
        return HttpResponse.json(
          {
            error: 'Rate limit exceeded',
            resetTime: Math.floor(now / WINDOW_MS + 1) * WINDOW_MS,
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': RATE_LIMIT.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.floor(now / WINDOW_MS + 1).toString(),
            },
          }
        )
      }

      requestCounts.set(key, currentCount + 1)

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

      // Validate query length - reject queries longer than 1000 characters
      if (query.length > 1000) {
        return HttpResponse.json(
          { error: 'Query too long - maximum 1000 characters allowed' },
          { status: 400 }
        )
      }

      // Validate for common XSS patterns
      const xssPatterns = [/<script[^>]*>/i, /javascript:/i, /on\w+\s*=/i, /expression\s*\(/i]

      const hasXssPattern = xssPatterns.some(pattern => pattern.test(query))

      if (hasXssPattern) {
        return HttpResponse.json(
          { error: 'Invalid query - contains potentially dangerous content' },
          { status: 400 }
        )
      }

      // For valid queries, return a successful response to avoid unhandled request warnings
      return HttpResponse.json({
        repositories: [],
        message: 'Query validation passed'
      }, { status: 200 })
    }),
  ]
}

/**
 * Setup comprehensive security-aware MSW server
 */
export function setupSecurityMSW() {
  const securityHandlers = [
    ...createAuthenticationHandlers(),
    // Note: Input validation is now integrated into authentication handlers
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
