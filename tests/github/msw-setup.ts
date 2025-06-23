/**
 * Modern MSW 2.x setup for GitHub API mocking
 * Replaces nock with modern HTTP mocking patterns
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

// GitHub API base URLs
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = `${GITHUB_API_BASE}/graphql`

// Default mock responses
export const defaultMockResponses = {
  user: {
    login: 'testuser',
    id: 12345,
    name: 'Test User',
    avatar_url: 'https://github.com/images/error/testuser_happy.gif',
    html_url: 'https://github.com/testuser',
    type: 'User',
    site_admin: false,
    public_repos: 5,
    public_gists: 2,
    followers: 10,
    following: 15,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  repository: {
    id: 1296269,
    name: 'Hello-World',
    full_name: 'octocat/Hello-World',
    private: false,
    owner: {
      login: 'octocat',
      id: 1,
      avatar_url: 'https://github.com/images/error/octocat_happy.gif',
      html_url: 'https://github.com/octocat',
      type: 'User',
      site_admin: false,
    },
    html_url: 'https://github.com/octocat/Hello-World',
    description: 'This your first repo!',
    fork: false,
    created_at: '2011-01-26T19:01:12Z',
    updated_at: '2011-01-26T19:14:43Z',
    pushed_at: '2011-01-26T19:06:43Z',
    size: 108,
    stargazers_count: 80,
    watchers_count: 9,
    language: 'C',
    forks_count: 9,
    archived: false,
    disabled: false,
    open_issues_count: 0,
    license: {
      key: 'mit',
      name: 'MIT License',
      spdx_id: 'MIT',
      url: 'https://api.github.com/licenses/mit',
    },
    forks: 9,
    open_issues: 0,
    watchers: 80,
    default_branch: 'master',
    topics: ['javascript', 'demo'],
  },
  rateLimit: {
    core: {
      limit: 5000,
      remaining: 4999,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
    search: {
      limit: 30,
      remaining: 29,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
    graphql: {
      limit: 5000,
      remaining: 4999,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
  },
}

// Helper to check authorization header
const isValidToken = (authHeader: string | null, expectedToken?: string): boolean => {
  if (!authHeader) return false

  const token = authHeader.replace(/^(token|Bearer)\s+/i, '')

  // If expectedToken is provided, check exact match
  if (expectedToken) {
    return token === expectedToken
  }

  // Test tokens are valid
  if (token === 'test_token' || token === 'ghp_test_token') {
    return true
  }

  // Otherwise, check for valid token patterns
  return (
    token.startsWith('ghp_') ||
    token.startsWith('gho_') ||
    token.startsWith('ghs_') ||
    token.length >= 20
  )
}

// Default MSW handlers
const defaultHandlers = [
  // GET /user
  http.get(`${GITHUB_API_BASE}/user`, ({ request }) => {
    const authHeader = request.headers.get('authorization')

    // Check for specific tokens from auth-integration test
    if (isValidToken(authHeader, 'ghp_valid_token_12345')) {
      return HttpResponse.json(
        {
          ...defaultMockResponses.user,
          login: 'testuser',
          id: 12345,
        },
        {
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            'x-ratelimit-used': '1',
          },
        }
      )
    }

    if (isValidToken(authHeader, 'ghp_limited_scope_token')) {
      return HttpResponse.json(
        {
          ...defaultMockResponses.user,
          login: 'testuser',
          id: 12345,
        },
        {
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            'x-ratelimit-used': '1',
            'x-oauth-scopes': 'user:email',
          },
        }
      )
    }

    if (isValidToken(authHeader, 'gho_oauth_access_token')) {
      return HttpResponse.json(
        {
          ...defaultMockResponses.user,
          login: 'oauthuser',
          id: 54321,
        },
        {
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            'x-ratelimit-used': '1',
          },
        }
      )
    }

    if (
      isValidToken(authHeader, 'ghp_persistent_token') ||
      isValidToken(authHeader, 'ghp_timeout_token') ||
      isValidToken(authHeader, 'ghp_test_token_12345') ||
      isValidToken(authHeader, 'ghp_test_token')
    ) {
      return HttpResponse.json(
        {
          ...defaultMockResponses.user,
          login: 'testuser',
          id: 12345,
        },
        {
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            'x-ratelimit-used': '1',
          },
        }
      )
    }

    // Check for retry token (should return 401)
    if (isValidToken(authHeader, 'ghp_retry_token')) {
      return HttpResponse.json(
        { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest' },
        { status: 401 }
      )
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

    // Valid token check for generic patterns
    if (isValidToken(authHeader)) {
      return HttpResponse.json(
        {
          ...defaultMockResponses.user,
          login: 'testuser',
          id: 12345,
        },
        {
          headers: {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            'x-ratelimit-used': '1',
          },
        }
      )
    }

    // Invalid or missing token
    return HttpResponse.json(
      { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest' },
      { status: 401 }
    )
  }),

  // GET /rate_limit
  http.get(`${GITHUB_API_BASE}/rate_limit`, () => {
    return HttpResponse.json(defaultMockResponses.rateLimit)
  }),

  // GET /repos/:owner/:repo
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo`, ({ params }) => {
    const { owner, repo } = params as { owner: string; repo: string }
    return HttpResponse.json({
      ...defaultMockResponses.repository,
      owner: {
        ...defaultMockResponses.repository.owner,
        login: owner,
        html_url: `https://github.com/${owner}`,
      },
      name: repo,
      full_name: `${owner}/${repo}`,
      html_url: `https://github.com/${owner}/${repo}`,
    })
  }),

  // GET /users/:username
  http.get(`${GITHUB_API_BASE}/users/:username`, ({ params }) => {
    const { username } = params as { username: string }
    return HttpResponse.json({
      ...defaultMockResponses.user,
      login: username,
      html_url: `https://github.com/${username}`,
    })
  }),

  // GET /search/repositories
  http.get(`${GITHUB_API_BASE}/search/repositories`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') || 'test'
    const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')

    // Generate multiple items for pagination tests
    const items = Array.from({ length: perPage }, (_, i) => ({
      ...defaultMockResponses.repository,
      id: 1000 + i,
      name: `${q}-${i + 1}`,
      full_name: `testowner/${q}-${i + 1}`,
      html_url: `https://github.com/testowner/${q}-${i + 1}`,
      owner: {
        ...defaultMockResponses.repository.owner,
        login: 'testowner',
        html_url: 'https://github.com/testowner',
      },
    }))

    return HttpResponse.json({
      total_count: 100,
      incomplete_results: false,
      items,
    })
  }),

  // GET /repos/:owner/:repo/issues
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues`, ({ request, params }) => {
    const { owner, repo } = params as { owner: string; repo: string }
    const url = new URL(request.url)
    const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')
    const state = url.searchParams.get('state') || 'open'
    const authHeader = request.headers.get('authorization')

    // Check for limited scope token (should return 403)
    if (isValidToken(authHeader, 'ghp_limited_scope_token')) {
      return HttpResponse.json(
        {
          message: 'Token does not have sufficient scope',
          documentation_url: 'https://docs.github.com/rest',
        },
        { status: 403 }
      )
    }

    // Check authentication
    if (!isValidToken(authHeader)) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }

    const issues = Array.from({ length: Math.min(perPage, 2) }, (_, i) => ({
      id: 1000 + i,
      number: i + 1,
      title: `Issue ${i + 1}`,
      body: `Test issue ${i + 1} description`,
      state,
      user: {
        login: owner,
        id: 12345,
        type: 'User',
        avatar_url: `https://github.com/images/error/${owner}_happy.gif`,
        html_url: `https://github.com/${owner}`,
        site_admin: false,
      },
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      html_url: `https://github.com/${owner}/${repo}/issues/${i + 1}`,
      comments: 0,
    }))

    return HttpResponse.json(issues, {
      headers: {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      },
    })
  }),

  // GET /repos/:owner/:repo/issues/:issue_number
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues/:issue_number`, ({ request, params }) => {
    const { owner, repo, issue_number } = params as {
      owner: string
      repo: string
      issue_number: string
    }
    const authHeader = request.headers.get('authorization')

    // Check authentication
    if (!isValidToken(authHeader)) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }

    return HttpResponse.json({
      id: 1000,
      number: Number.parseInt(issue_number),
      title: `Issue ${issue_number}`,
      body: `Test issue ${issue_number} description`,
      state: 'open',
      user: {
        login: owner,
        id: 12345,
        type: 'User',
        avatar_url: `https://github.com/images/error/${owner}_happy.gif`,
        html_url: `https://github.com/${owner}`,
        site_admin: false,
      },
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      html_url: `https://github.com/${owner}/${repo}/issues/${issue_number}`,
      comments: 0,
    })
  }),

  // GraphQL endpoint
  http.post(GITHUB_GRAPHQL_URL, async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    const body = (await request.json()) as { query: string; variables?: Record<string, any> }

    // Check authentication
    if (!isValidToken(authHeader)) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }

    // Check for intentional errors in queries (like invalidField)
    if (body.query.includes('invalidField')) {
      return HttpResponse.json(
        {
          errors: [
            {
              message: 'Field "invalidField" doesn\'t exist on type "User"',
              locations: [{ line: 1, column: 15 }],
            },
          ],
        },
        { status: 400 }
      )
    }

    // Handle viewer queries with rate limit data
    if (body.query.includes('viewer') && body.query.includes('rateLimit')) {
      return HttpResponse.json({
        data: {
          viewer: {
            login: defaultMockResponses.user.login,
            name: defaultMockResponses.user.name,
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

    // Simple viewer queries
    if (body.query.includes('viewer')) {
      return HttpResponse.json({
        data: {
          viewer: {
            login: defaultMockResponses.user.login,
            name: defaultMockResponses.user.name,
          },
        },
      })
    }

    // Repository queries
    if (body.query.includes('repository')) {
      return HttpResponse.json({
        data: {
          repository: {
            name: body.variables?.name || 'testrepo',
            description: 'Test repository description',
            owner: {
              login: body.variables?.owner || 'testowner',
            },
          },
        },
      })
    }

    // Default response
    return HttpResponse.json({ data: {} })
  }),
]

// Create MSW server
export const mswServer = setupServer(...defaultHandlers)

// Vitest MSW setup
export function setupMSW() {
  beforeAll(() => {
    // Restore original fetch for MSW to work properly
    if ((global as any).__originalFetch) {
      global.fetch = (global as any).__originalFetch
    }
    mswServer.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    // Reset handlers to default state instead of clearing all handlers
    mswServer.resetHandlers(...defaultHandlers)
  })

  afterAll(() => {
    mswServer.close()
    // Restore the mock fetch for other tests
    if ((global as any).__mockFetch) {
      global.fetch = (global as any).__mockFetch
    }
  })
}

// Helper functions for test-specific mocking
export const mockGitHubAPI = {
  /**
   * Mock a successful user response
   */
  mockUser: (userData?: Partial<typeof defaultMockResponses.user>) => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/user`, () => {
        return HttpResponse.json({
          ...defaultMockResponses.user,
          ...userData,
        })
      })
    )
  },

  /**
   * Mock an authentication error
   */
  mockAuthError: () => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/user`, () => {
        return HttpResponse.json(
          {
            message: 'Bad credentials',
            documentation_url: 'https://docs.github.com/rest',
          },
          { status: 401 }
        )
      })
    )
  },

  /**
   * Mock a rate limit error
   */
  mockRateLimitError: () => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/user`, () => {
        return HttpResponse.json(
          {
            message: 'API rate limit exceeded',
            documentation_url: 'https://docs.github.com/rest#rate-limiting',
          },
          {
            status: 403,
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            },
          }
        )
      })
    )
  },

  /**
   * Mock a network error
   */
  mockNetworkError: () => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/user`, () => {
        throw new Error('Network error')
      })
    )
  },

  /**
   * Mock a custom GraphQL response
   */
  mockGraphQL: (data: any, errors?: any[]) => {
    mswServer.use(
      http.post(GITHUB_GRAPHQL_URL, () => {
        const response: any = {}
        if (data) response.data = data
        if (errors) response.errors = errors
        return HttpResponse.json(response)
      })
    )
  },

  /**
   * Mock a repository response
   */
  mockRepository: (
    owner: string,
    repo: string,
    repoData?: Partial<typeof defaultMockResponses.repository>
  ) => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, () => {
        return HttpResponse.json({
          ...defaultMockResponses.repository,
          ...repoData,
          name: repo,
          full_name: `${owner}/${repo}`,
          owner: {
            ...defaultMockResponses.repository.owner,
            login: owner,
          },
        })
      })
    )
  },

  /**
   * Mock user not found error
   */
  mockUserNotFound: (username: string) => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/users/${username}`, () => {
        return HttpResponse.json(
          {
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/rest',
          },
          { status: 404 }
        )
      })
    )
  },

  /**
   * Mock repository not found error
   */
  mockRepositoryNotFound: (owner: string, repo: string) => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, () => {
        return HttpResponse.json(
          {
            message: 'Not Found',
            documentation_url: 'https://docs.github.com/rest',
          },
          { status: 404 }
        )
      })
    )
  },

  /**
   * Mock issues with limited scope token (403 error)
   */
  mockLimitedScopeError: () => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/repos/:owner/:repo/issues`, () => {
        return HttpResponse.json(
          {
            message: 'Token does not have sufficient scope',
            documentation_url: 'https://docs.github.com/rest',
          },
          { status: 403 }
        )
      })
    )
  },

  /**
   * Set response delay (for testing timing-sensitive operations)
   */
  setResponseDelay: (delayMs: number) => {
    // Store delay for use in custom handlers
    ;(mockGitHubAPI as any)._responseDelay = delayMs
  },

  /**
   * Mock a specific error response for all endpoints
   */
  setErrorResponse: (status: number, errorData: any) => {
    const delay = (mockGitHubAPI as any)._responseDelay || 0

    mswServer.use(
      http.get(`${GITHUB_API_BASE}/*`, async () => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        return HttpResponse.json(errorData, { status })
      }),
      http.post(`${GITHUB_API_BASE}/*`, async () => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        return HttpResponse.json(errorData, { status })
      })
    )
  },

  /**
   * Mock a custom response for all endpoints
   */
  setCustomResponse: (status: number, data: any) => {
    const delay = (mockGitHubAPI as any)._responseDelay || 0

    mswServer.use(
      http.get(`${GITHUB_API_BASE}/*`, async () => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        return HttpResponse.json(data, { status })
      }),
      http.post(`${GITHUB_API_BASE}/*`, async () => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        return HttpResponse.json(data, { status })
      })
    )
  },

  /**
   * Set a custom handler function
   */
  setCustomHandler: (handlerFn: () => { status: number; data: any }) => {
    const delay = (mockGitHubAPI as any)._responseDelay || 0

    mswServer.use(
      http.get(`${GITHUB_API_BASE}/*`, async () => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        const result = handlerFn()
        return HttpResponse.json(result.data, { status: result.status })
      }),
      http.post(`${GITHUB_API_BASE}/*`, async () => {
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        const result = handlerFn()
        return HttpResponse.json(result.data, { status: result.status })
      })
    )
  },

  /**
   * Reset all handlers to default
   */
  resetToDefaults: () => {
    mswServer.resetHandlers(...defaultHandlers)
    ;(mockGitHubAPI as any)._responseDelay = 0
  },
}
