/**
 * MSW handlers for GitHub API mocking
 * Replaces nock interceptors with modern MSW 2.x patterns
 */

import { http, HttpResponse } from 'msw'

// GitHub API base URL
const GITHUB_API_BASE = 'https://api.github.com'

// Mock user data
const mockUsers = {
  testuser: {
    login: 'testuser',
    id: 12345,
    type: 'User',
    name: 'Test User',
    avatar_url: 'https://avatars.githubusercontent.com/u/12345',
    html_url: 'https://github.com/testuser',
    site_admin: false,
  },
  oauthuser: {
    login: 'oauthuser',
    id: 54321,
    type: 'User',
    avatar_url: 'https://avatars.githubusercontent.com/u/54321',
    html_url: 'https://github.com/oauthuser',
    site_admin: false,
  },
}

// Mock issues data
const mockIssues = [
  {
    id: 1,
    number: 1,
    title: 'Issue 1',
    body: 'Test issue',
    state: 'open',
    user: null,
    labels: [],
    assignee: null,
    assignees: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/testuser/test-repo/issues/1',
  },
  {
    id: 2,
    number: 2,
    title: 'Issue 2',
    body: 'Another test issue',
    state: 'open',
    user: null,
    labels: [],
    assignee: null,
    assignees: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/testuser/test-repo/issues/2',
  },
]

// Helper to create rate limit headers
const createRateLimitHeaders = (
  options: {
    remaining?: number
    limit?: number
    reset?: number
    used?: number
    resource?: string
  } = {}
) => {
  const resetTime = options.reset || Math.floor(Date.now() / 1000) + 3600
  return {
    'x-ratelimit-limit': String(options.limit || 5000),
    'x-ratelimit-remaining': String(options.remaining || 4999),
    'x-ratelimit-reset': String(resetTime),
    'x-ratelimit-used': String(options.used || 1),
    'x-ratelimit-resource': options.resource || 'core',
  }
}

// Helper to check authorization header
const isValidToken = (authHeader: string | null, expectedToken?: string): boolean => {
  if (!authHeader) return false

  const token = authHeader.replace(/^(token|Bearer)\s+/i, '')

  // If expectedToken is provided, check exact match
  if (expectedToken) {
    return token === expectedToken
  }

  // Otherwise, check for valid token patterns
  return (
    token.startsWith('ghp_') ||
    token.startsWith('gho_') ||
    token.startsWith('ghs_') ||
    token.length >= 20
  )
}

// Main handlers
export const githubHandlers = [
  // GET /user - Authenticated user endpoint
  http.get(`${GITHUB_API_BASE}/user`, ({ request }) => {
    const authHeader = request.headers.get('authorization')

    // Check for specific token patterns to return different users
    if (isValidToken(authHeader, 'ghp_valid_token_12345')) {
      return HttpResponse.json(mockUsers.testuser, {
        headers: createRateLimitHeaders(),
      })
    }

    if (isValidToken(authHeader, 'gho_oauth_access_token')) {
      return HttpResponse.json(mockUsers.oauthuser, {
        headers: createRateLimitHeaders(),
      })
    }

    if (isValidToken(authHeader, 'ghp_limited_scope_token')) {
      return HttpResponse.json(mockUsers.testuser, {
        headers: {
          ...createRateLimitHeaders(),
          'x-oauth-scopes': 'user:email',
        },
      })
    }

    if (isValidToken(authHeader, 'ghp_persistent_token')) {
      return HttpResponse.json(mockUsers.testuser, {
        headers: createRateLimitHeaders(),
      })
    }

    if (isValidToken(authHeader, 'ghp_retry_token')) {
      return HttpResponse.json(
        { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest' },
        { status: 401 }
      )
    }

    if (isValidToken(authHeader, 'ghp_timeout_token')) {
      // Simulate network delay
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(
            HttpResponse.json(mockUsers.testuser, {
              headers: createRateLimitHeaders(),
            })
          )
        }, 200)
      })
    }

    if (
      isValidToken(authHeader, 'ghp_test_token') ||
      isValidToken(authHeader, 'ghp_test_token_12345')
    ) {
      return HttpResponse.json(mockUsers.testuser, {
        headers: createRateLimitHeaders(),
      })
    }

    // Check for invalid/expired tokens
    if (
      authHeader?.includes('ghp_invalid') ||
      authHeader?.includes('ghp_expired') ||
      authHeader?.includes('ghp_revoked')
    ) {
      return HttpResponse.json(
        { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest' },
        { status: 401 }
      )
    }

    // No fallback - all valid tokens should be explicitly handled above

    // Invalid or missing token
    return HttpResponse.json(
      { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest' },
      { status: 401 }
    )
  }),

  // GET /user/repos - User repositories
  http.get(`${GITHUB_API_BASE}/user/repos`, ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (isValidToken(authHeader, 'ghp_limited_scope_token')) {
      return HttpResponse.json(
        {
          message: 'Token does not have sufficient scope',
          documentation_url: 'https://docs.github.com/rest',
        },
        { status: 403 }
      )
    }

    if (!isValidToken(authHeader)) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }

    return HttpResponse.json([], {
      headers: createRateLimitHeaders(),
    })
  }),

  // GET /repos/:owner/:repo/issues - Repository issues
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues`, ({ request, params: _params }) => {
    const authHeader = request.headers.get('authorization')

    // Check for limited scope token
    if (isValidToken(authHeader, 'ghp_limited_scope_token')) {
      return HttpResponse.json(
        {
          message: 'Token does not have sufficient scope',
          documentation_url: 'https://docs.github.com/rest',
        },
        { status: 403 }
      )
    }

    // Check for valid tokens that should work
    const validTokens = [
      'ghp_valid_token_12345',
      'gho_oauth_access_token',
      'ghp_persistent_token',
      'ghp_timeout_token',
      'ghp_test_token',
      'ghp_test_token_12345',
    ]

    const hasValidToken = validTokens.some(token => isValidToken(authHeader, token))

    if (!hasValidToken) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }

    const url = new URL(request.url)
    const perPage = Number(url.searchParams.get('per_page')) || 30

    return HttpResponse.json(mockIssues.slice(0, perPage), {
      headers: createRateLimitHeaders(),
    })
  }),

  // POST /graphql - GraphQL endpoint
  http.post(`${GITHUB_API_BASE}/graphql`, async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!isValidToken(authHeader)) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }

    const body = (await request.json()) as { query: string; variables?: Record<string, unknown> }

    // Mock GraphQL response
    if (body.query.includes('viewer')) {
      return HttpResponse.json({
        data: {
          viewer: {
            login: 'testuser',
          },
          rateLimit: {
            limit: 5000,
            cost: 1,
            remaining: 4999,
            resetAt: new Date(Date.now() + 3600000).toISOString(),
            nodeCount: 1,
          },
        },
      })
    }

    return HttpResponse.json({
      data: {},
      errors: [{ message: 'Query not mocked' }],
    })
  }),

  // POST /app/installations/:installation_id/access_tokens - Installation tokens
  http.post(`${GITHUB_API_BASE}/app/installations/:installation_id/access_tokens`, () => {
    return HttpResponse.json(
      {
        token: 'ghs_installation_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: {
          contents: 'read',
          metadata: 'read',
        },
      },
      { status: 201 }
    )
  }),
]

// Export handlers for different test scenarios
export const createAuthErrorHandlers = (
  tokenPattern: string,
  errorStatus = 401,
  errorMessage = 'Bad credentials'
) => [
  http.get(`${GITHUB_API_BASE}/user`, ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.includes(tokenPattern)) {
      return HttpResponse.json(
        { message: errorMessage, documentation_url: 'https://docs.github.com/rest' },
        { status: errorStatus }
      )
    }
    return HttpResponse.json(mockUsers.testuser, {
      headers: createRateLimitHeaders(),
    })
  }),
]

export const createConcurrentRequestHandlers = (_concurrency: number) => {
  let requestCount = 0

  return [
    http.get(`${GITHUB_API_BASE}/user`, () => {
      requestCount++
      return HttpResponse.json(
        { login: `user_${requestCount}`, id: requestCount },
        { headers: createRateLimitHeaders({ remaining: 5000 - requestCount }) }
      )
    }),
  ]
}
