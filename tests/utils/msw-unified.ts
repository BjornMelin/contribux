/**
 * Unified MSW (Mock Service Worker) Configuration for Vitest 3.2+
 * Modern patterns with proper isolation and performance optimization
 *
 * FIXES: MSW server conflicts causing SearchBar test failures and performance issues
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

// Base URLs for different services
const BASE_URL = 'http://localhost:3000'
const GITHUB_API_BASE = 'https://api.github.com'

// Default responses for common scenarios
export const defaultResponses = {
  // GitHub API responses
  github: {
    user: {
      login: 'testuser',
      id: 12345,
      name: 'Test User',
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
      html_url: 'https://github.com/testuser',
      type: 'User',
      site_admin: false,
      public_repos: 5,
      followers: 10,
      following: 15,
      created_at: '2024-01-01T00:00:00Z',
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
      },
      html_url: 'https://github.com/octocat/Hello-World',
      description: 'This your first repo!',
      stargazers_count: 80,
      language: 'JavaScript',
      topics: ['demo', 'example'],
    },
    rateLimit: {
      core: {
        limit: 5000,
        remaining: 4999,
        reset: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  },

  // Search API responses
  search: {
    opportunities: {
      success: true,
      data: {
        opportunities: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            repository_id: '550e8400-e29b-41d4-a716-446655440000',
            title: 'Fix TypeScript type errors in search module',
            description: 'Several type errors need to be fixed in the search functionality',
            type: 'bug_fix',
            difficulty: 'intermediate',
            required_skills: ['TypeScript', 'debugging'],
            technologies: ['TypeScript', 'Node.js'],
            good_first_issue: false,
            help_wanted: true,
            estimated_hours: 4,
            created_at: '2023-06-01T12:00:00Z',
            relevance_score: 0.95,
          },
        ],
        total_count: 1,
        page: 1,
        per_page: 20,
        has_more: false,
      },
      metadata: {
        query: '',
        filters: {},
        execution_time_ms: 50,
      },
    },
    repositories: {
      success: true,
      data: {
        repositories: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            github_id: 998877,
            full_name: 'test-org/search-engine',
            name: 'search-engine',
            description: 'A powerful search engine with AI capabilities',
            language: 'TypeScript',
            topics: ['search', 'ai', 'typescript'],
            stars_count: 1250,
            health_score: 88.5,
            activity_score: 92.0,
            first_time_contributor_friendly: true,
            created_at: '2023-01-01T00:00:00Z',
            relevance_score: 0.92,
          },
        ],
        total_count: 1,
        page: 1,
        per_page: 20,
        has_more: false,
      },
      metadata: {
        query: '',
        filters: {},
        execution_time_ms: 75,
      },
    },
  },
}

// Helper to validate GitHub tokens
const isValidGitHubToken = (authHeader: string | null): boolean => {
  if (!authHeader) return false
  const token = authHeader.replace(/^(token|Bearer)\s+/i, '')
  return token.startsWith('test-') || token === 'valid-token'
}

// Core request handlers
const createHandlers = () => [
  // GitHub API handlers
  http.get(`${GITHUB_API_BASE}/user`, ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!isValidGitHubToken(authHeader)) {
      return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
    }
    return HttpResponse.json(defaultResponses.github.user)
  }),

  http.get(`${GITHUB_API_BASE}/repos/:owner/:repo`, ({ params }) => {
    return HttpResponse.json({
      ...defaultResponses.github.repository,
      name: params.repo,
      full_name: `${params.owner}/${params.repo}`,
    })
  }),

  http.get(`${GITHUB_API_BASE}/rate_limit`, () => {
    return HttpResponse.json({ rate: defaultResponses.github.rateLimit })
  }),

  // Search API handlers
  http.get(`${BASE_URL}/api/search/opportunities`, ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q') || ''

    // Filter opportunities based on query
    let opportunities = defaultResponses.search.opportunities.data.opportunities
    if (query) {
      opportunities = opportunities.filter(
        opp =>
          opp.title.toLowerCase().includes(query.toLowerCase()) ||
          opp.description?.toLowerCase().includes(query.toLowerCase())
      )
    }

    return HttpResponse.json({
      ...defaultResponses.search.opportunities,
      data: {
        ...defaultResponses.search.opportunities.data,
        opportunities,
        total_count: opportunities.length,
      },
      metadata: {
        ...defaultResponses.search.opportunities.metadata,
        query,
      },
    })
  }),

  http.get(`${BASE_URL}/api/search/repositories`, ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const query = url.searchParams.get('q') || ''

    // Filter repositories based on query
    let repositories = defaultResponses.search.repositories.data.repositories
    if (query) {
      repositories = repositories.filter(
        repo =>
          repo.name.toLowerCase().includes(query.toLowerCase()) ||
          repo.description?.toLowerCase().includes(query.toLowerCase())
      )
    }

    return HttpResponse.json({
      ...defaultResponses.search.repositories,
      data: {
        ...defaultResponses.search.repositories.data,
        repositories,
        total_count: repositories.length,
      },
      metadata: {
        ...defaultResponses.search.repositories.metadata,
        query,
      },
    })
  }),

  // Health check
  http.get(`${BASE_URL}/api/health`, () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })
  }),

  // Error simulation
  http.get(`${BASE_URL}/api/search/error`, () => {
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed',
        },
      },
      { status: 500 }
    )
  }),
]

// Create the unified MSW server
export const unifiedMswServer = setupServer(...createHandlers())

/**
 * Setup MSW for individual test files with automatic cleanup
 * Use this in individual test files for isolated testing
 */
export function setupMSW() {
  beforeAll(() => {
    unifiedMswServer.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    unifiedMswServer.resetHandlers()
  })

  afterAll(() => {
    unifiedMswServer.close()
  })
}

/**
 * Enhanced MSW setup with custom handlers
 */
export function setupMSWWithHandlers(customHandlers: Parameters<typeof http.get>[1][]) {
  const server = setupServer(...createHandlers(), ...customHandlers)

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  return server
}

/**
 * Helper to mock GitHub API responses
 */
export function mockGitHubResponse(endpoint: string, response: unknown, status = 200) {
  unifiedMswServer.use(
    http.get(`${GITHUB_API_BASE}${endpoint}`, () => {
      return HttpResponse.json(response, { status })
    })
  )
}

/**
 * Helper to mock search API responses
 */
export function mockSearchResponse(endpoint: string, response: unknown, status = 200) {
  unifiedMswServer.use(
    http.get(`${BASE_URL}/api/search${endpoint}`, () => {
      return HttpResponse.json(response, { status })
    })
  )
}

/**
 * Reset all mocks to default state
 */
export function resetMocks() {
  unifiedMswServer.resetHandlers()
}

/**
 * Legacy compatibility exports
 */
export { unifiedMswServer as mswServer }
export const setupEnhancedMSW = setupMSW
export const mockGitHubAPI = mockGitHubResponse
export const resetGitHubMocks = resetMocks
