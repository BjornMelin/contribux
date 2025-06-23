/**
 * Modern MSW 2.x setup for GitHub API mocking
 * Replaces nock with modern HTTP mocking patterns
 */

import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { beforeAll, afterEach, afterAll } from 'vitest'

// GitHub API base URLs
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = `${GITHUB_API_BASE}/graphql`

// Default mock responses
export const defaultMockResponses = {
  user: { 
    login: 'testuser', 
    id: 123,
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
    updated_at: '2024-01-01T00:00:00Z'
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
      site_admin: false
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
      url: 'https://api.github.com/licenses/mit'
    },
    forks: 9,
    open_issues: 0,
    watchers: 80,
    default_branch: 'master',
    topics: ['javascript', 'demo']
  },
  rateLimit: {
    core: {
      limit: 5000,
      remaining: 4999,
      reset: Math.floor(Date.now() / 1000) + 3600
    },
    search: {
      limit: 30,
      remaining: 29,
      reset: Math.floor(Date.now() / 1000) + 3600
    },
    graphql: {
      limit: 5000,
      remaining: 4999,
      reset: Math.floor(Date.now() / 1000) + 3600
    }
  }
}

// Default MSW handlers
const defaultHandlers = [
  // GET /user
  http.get(`${GITHUB_API_BASE}/user`, () => {
    return HttpResponse.json(defaultMockResponses.user, {
      headers: {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        'x-ratelimit-used': '1'
      }
    })
  }),

  // GET /rate_limit
  http.get(`${GITHUB_API_BASE}/rate_limit`, () => {
    return HttpResponse.json(defaultMockResponses.rateLimit)
  }),

  // GET /repos/:owner/:repo
  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo`, ({ params }) => {
    return HttpResponse.json({
      ...defaultMockResponses.repository,
      owner: { 
        ...defaultMockResponses.repository.owner, 
        login: params.owner,
        html_url: `https://github.com/${params.owner}`
      },
      name: params.repo,
      full_name: `${params.owner}/${params.repo}`,
      html_url: `https://github.com/${params.owner}/${params.repo}`
    })
  }),

  // GET /users/:username
  http.get(`${GITHUB_API_BASE}/users/:username`, ({ params }) => {
    return HttpResponse.json({
      ...defaultMockResponses.user,
      login: params.username,
      html_url: `https://github.com/${params.username}`
    })
  }),

  // GET /search/repositories
  http.get(`${GITHUB_API_BASE}/search/repositories`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') || 'test'
    
    return HttpResponse.json({
      total_count: 1,
      incomplete_results: false,
      items: [{
        ...defaultMockResponses.repository,
        name: q,
        full_name: `testowner/${q}`,
        html_url: `https://github.com/testowner/${q}`,
        owner: {
          ...defaultMockResponses.repository.owner,
          login: 'testowner',
          html_url: 'https://github.com/testowner'
        }
      }]
    })
  }),

  // GraphQL endpoint
  http.post(GITHUB_GRAPHQL_URL, async ({ request }) => {
    const body = await request.json() as { query: string; variables?: Record<string, any> }
    
    // Check for intentional errors in queries (like invalidField)
    if (body.query.includes('invalidField')) {
      return HttpResponse.json({
        errors: [{
          message: 'Field "invalidField" doesn\'t exist on type "User"',
          locations: [{ line: 1, column: 15 }]
        }]
      }, { status: 400 })
    }
    
    // Simple GraphQL response based on query content
    if (body.query.includes('viewer')) {
      return HttpResponse.json({
        data: {
          viewer: {
            login: defaultMockResponses.user.login,
            name: defaultMockResponses.user.name
          }
        }
      })
    }

    if (body.query.includes('repository')) {
      return HttpResponse.json({
        data: {
          repository: {
            name: body.variables?.name || 'test-repo',
            owner: {
              login: body.variables?.owner || 'testowner'
            }
          }
        }
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
    mswServer.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    mswServer.resetHandlers()
  })

  afterAll(() => {
    mswServer.close()
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
          ...userData
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
            documentation_url: 'https://docs.github.com/rest'
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
            documentation_url: 'https://docs.github.com/rest#rate-limiting'
          },
          {
            status: 403,
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
            }
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
  mockRepository: (owner: string, repo: string, repoData?: Partial<typeof defaultMockResponses.repository>) => {
    mswServer.use(
      http.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, () => {
        return HttpResponse.json({
          ...defaultMockResponses.repository,
          ...repoData,
          name: repo,
          full_name: `${owner}/${repo}`,
          owner: {
            ...defaultMockResponses.repository.owner,
            login: owner
          }
        })
      })
    )
  },

  /**
   * Reset all handlers to default
   */
  resetToDefaults: () => {
    mswServer.resetHandlers(...defaultHandlers)
  }
}