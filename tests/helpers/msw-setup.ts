/**
 * MSW (Mock Service Worker) Setup and Handlers
 * Provides HTTP mocking for GitHub API and other external services
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import {
  GitHubIssueMockFactory,
  type GitHubRepositoryMock,
  GitHubRepositoryMockFactory,
  type GitHubUserMock,
  GitHubUserMockFactory,
} from './github-mocks'

/**
 * MSW Handler Factory for creating reusable API mocks
 */
export class MSWHandlerFactory {
  /**
   * Create a GitHub user endpoint handler
   */
  static createUserHandler(userData: Partial<GitHubUserMock> = {}) {
    return http.get('https://api.github.com/user', () => {
      const user = GitHubUserMockFactory.create(userData)
      return HttpResponse.json(user)
    })
  }

  /**
   * Create a GitHub repository endpoint handler
   */
  static createRepositoryHandler(
    owner: string,
    repo: string,
    repoData: Partial<GitHubRepositoryMock> = {}
  ) {
    return http.get(`https://api.github.com/repos/${owner}/${repo}`, () => {
      const repository = GitHubRepositoryMockFactory.create({
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: GitHubUserMockFactory.create({ login: owner }),
        ...repoData,
      })
      return HttpResponse.json(repository)
    })
  }

  /**
   * Create a GitHub user repositories handler
   */
  static createUserRepositoriesHandler(
    username: string,
    repos: Partial<GitHubRepositoryMock>[] = []
  ) {
    return http.get(`https://api.github.com/users/${username}/repos`, ({ request }) => {
      const url = new URL(request.url)
      const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')
      const page = Number.parseInt(url.searchParams.get('page') || '1')

      const mockRepos =
        repos.length > 0
          ? repos.map(repo => GitHubRepositoryMockFactory.create(repo))
          : GitHubRepositoryMockFactory.createMany(perPage)

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
  static createRepositoryIssuesHandler(owner: string, repo: string, issueCount = 10) {
    return http.get(`https://api.github.com/repos/${owner}/${repo}/issues`, ({ request }) => {
      const url = new URL(request.url)
      const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')
      const page = Number.parseInt(url.searchParams.get('page') || '1')

      const issues = GitHubIssueMockFactory.createMany(issueCount)

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
  static createGraphQLHandler(responseData: any = {}) {
    return http.post('https://api.github.com/graphql', async ({ request }) => {
      const _body = (await request.json()) as { query: string; variables?: any }

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
  static createErrorHandler(path: string, status = 500, message = 'Internal Server Error') {
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
  static createRateLimitHandler() {
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
}

/**
 * Default GitHub API handlers for common endpoints
 */
export const githubHandlers = [
  // User endpoints
  MSWHandlerFactory.createUserHandler(),
  MSWHandlerFactory.createRateLimitHandler(),

  // Repository endpoints
  http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
    const { owner, repo } = params
    const repository = GitHubRepositoryMockFactory.create({
      name: repo as string,
      full_name: `${owner}/${repo}`,
      owner: GitHubUserMockFactory.create({ login: owner as string }),
    })
    return HttpResponse.json(repository)
  }),

  // Issues endpoints
  http.get('https://api.github.com/repos/:owner/:repo/issues', ({ params }) => {
    const issues = GitHubIssueMockFactory.createMany(10)
    return HttpResponse.json(issues)
  }),

  // GraphQL endpoint
  MSWHandlerFactory.createGraphQLHandler(),

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
export function mockGitHubAPI(customHandlers: any[] = []) {
  server.use(...customHandlers)
}

/**
 * Reset all GitHub mock factories
 */
export function resetGitHubMocks() {
  GitHubUserMockFactory.reset()
  GitHubRepositoryMockFactory.reset()
  GitHubIssueMockFactory.reset()
}
