/**
 * Enhanced MSW handler factories for consistent API mocking
 * Provides type-safe mock builders with common patterns
 */

import { HttpResponse, http } from 'msw'
import { z } from 'zod'

// GitHub API response schemas for validation
export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  name: z.string().nullable(),
  avatar_url: z.string().url(),
  html_url: z.string().url(),
  type: z.string(),
  site_admin: z.boolean(),
  public_repos: z.number(),
  public_gists: z.number(),
  followers: z.number(),
  following: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  email: z.string().email().nullable().optional(),
  bio: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  blog: z.string().nullable().optional(),
  twitter_username: z.string().nullable().optional(),
})

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string().url(),
    html_url: z.string().url(),
    type: z.string(),
    site_admin: z.boolean(),
  }),
  html_url: z.string().url(),
  description: z.string().nullable(),
  fork: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  size: z.number(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  language: z.string().nullable(),
  forks_count: z.number(),
  archived: z.boolean(),
  disabled: z.boolean(),
  open_issues_count: z.number(),
  license: z
    .object({
      key: z.string(),
      name: z.string(),
      spdx_id: z.string(),
      url: z.string().url(),
    })
    .nullable(),
  forks: z.number(),
  open_issues: z.number(),
  watchers: z.number(),
  default_branch: z.string(),
  topics: z.array(z.string()).default([]),
})

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  labels: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      color: z.string(),
      description: z.string().nullable(),
    })
  ),
  user: GitHubUserSchema,
  assignee: GitHubUserSchema.nullable(),
  assignees: z.array(GitHubUserSchema),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  html_url: z.string().url(),
  repository_url: z.string().url(),
})

export const GitHubRateLimitSchema = z.object({
  core: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }),
  search: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }),
  graphql: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }),
})

// Type exports
export type GitHubUser = z.infer<typeof GitHubUserSchema>
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>
export type GitHubRateLimit = z.infer<typeof GitHubRateLimitSchema>

// GitHub API base URLs
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = `${GITHUB_API_BASE}/graphql`

/**
 * Factory for creating consistent GitHub user mock data
 */
export class GitHubUserMockFactory {
  private static counter = 1

  static create(overrides: Partial<GitHubUser> = {}): GitHubUser {
    const id = GitHubUserMockFactory.counter++

    const userData: GitHubUser = {
      login: `testuser${id}`,
      id: 1000000 + id,
      name: `Test User ${id}`,
      avatar_url: `https://github.com/images/error/testuser${id}_happy.gif`,
      html_url: `https://github.com/testuser${id}`,
      type: 'User',
      site_admin: false,
      public_repos: 5,
      public_gists: 2,
      followers: 10,
      following: 15,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      email: `test${id}@example.com`,
      bio: `Bio for test user ${id}`,
      company: `Test Company ${id}`,
      location: `Test City ${id}`,
      blog: null,
      twitter_username: null,
      ...overrides,
    }

    return GitHubUserSchema.parse(userData)
  }

  static createMany(count: number, overrides: Partial<GitHubUser> = {}): GitHubUser[] {
    return Array.from({ length: count }, () => GitHubUserMockFactory.create(overrides))
  }
}

/**
 * Factory for creating consistent GitHub repository mock data
 */
export class GitHubRepositoryMockFactory {
  private static counter = 1

  static create(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
    const id = GitHubRepositoryMockFactory.counter++
    const owner = overrides.owner?.login || `owner${id}`
    const name = overrides.name || `repo${id}`

    const repoData: GitHubRepository = {
      id: 2000000 + id,
      name,
      full_name: `${owner}/${name}`,
      private: false,
      owner: {
        login: owner,
        id: 3000000 + id,
        avatar_url: `https://github.com/images/error/${owner}_happy.gif`,
        html_url: `https://github.com/${owner}`,
        type: 'User',
        site_admin: false,
      },
      html_url: `https://github.com/${owner}/${name}`,
      description: `Test repository ${id}`,
      fork: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      pushed_at: new Date().toISOString(),
      size: 108,
      stargazers_count: 10 + id,
      watchers_count: 5 + id,
      language: 'TypeScript',
      forks_count: 2 + id,
      archived: false,
      disabled: false,
      open_issues_count: 3,
      license: {
        key: 'mit',
        name: 'MIT License',
        spdx_id: 'MIT',
        url: 'https://api.github.com/licenses/mit',
      },
      forks: 2 + id,
      open_issues: 3,
      watchers: 10 + id,
      default_branch: 'main',
      topics: ['typescript', 'test'],
      ...overrides,
    }

    return GitHubRepositorySchema.parse(repoData)
  }

  static createMany(count: number, overrides: Partial<GitHubRepository> = {}): GitHubRepository[] {
    return Array.from({ length: count }, () => GitHubRepositoryMockFactory.create(overrides))
  }
}

/**
 * Factory for creating GitHub issue mock data
 */
export class GitHubIssueMockFactory {
  private static counter = 1

  static create(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
    const id = GitHubIssueMockFactory.counter++
    const user = GitHubUserMockFactory.create()

    const issueData: GitHubIssue = {
      id: 4000000 + id,
      number: id,
      title: `Test Issue ${id}`,
      body: `This is test issue ${id} body content`,
      state: 'open',
      labels: [
        {
          id: 5000000 + id,
          name: 'bug',
          color: 'd73a4a',
          description: "Something isn't working",
        },
      ],
      user,
      assignee: null,
      assignees: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
      closed_at: null,
      html_url: `https://github.com/testowner/testrepo/issues/${id}`,
      repository_url: 'https://api.github.com/repos/testowner/testrepo',
      ...overrides,
    }

    return GitHubIssueSchema.parse(issueData)
  }

  static createMany(count: number, overrides: Partial<GitHubIssue> = {}): GitHubIssue[] {
    return Array.from({ length: count }, () => GitHubIssueMockFactory.create(overrides))
  }

  static createGoodFirstIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
    return GitHubIssueMockFactory.create({
      labels: [
        {
          id: 1,
          name: 'good first issue',
          color: '7057ff',
          description: 'Good for newcomers',
        },
        {
          id: 2,
          name: 'help wanted',
          color: '008672',
          description: 'Extra attention is needed',
        },
      ],
      ...overrides,
    })
  }
}

/**
 * Enhanced MSW handler factories with type safety
 */
export class MSWHandlerFactory {
  /**
   * Create a user endpoint handler
   */
  static createUserHandler(userData?: Partial<GitHubUser>) {
    const user = GitHubUserMockFactory.create(userData)

    return http.get(`${GITHUB_API_BASE}/user`, () => {
      return HttpResponse.json(user, {
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          'x-ratelimit-used': '1',
        },
      })
    })
  }

  /**
   * Create a user by username handler
   */
  static createUserByUsernameHandler(username: string, userData?: Partial<GitHubUser>) {
    const user = GitHubUserMockFactory.create({
      login: username,
      html_url: `https://github.com/${username}`,
      ...userData,
    })

    return http.get(`${GITHUB_API_BASE}/users/${username}`, () => {
      return HttpResponse.json(user)
    })
  }

  /**
   * Create a repository handler
   */
  static createRepositoryHandler(
    owner: string,
    repo: string,
    repoData?: Partial<GitHubRepository>
  ) {
    const repository = GitHubRepositoryMockFactory.create({
      name: repo,
      full_name: `${owner}/${repo}`,
      owner: {
        login: owner,
        id: 1,
        avatar_url: `https://github.com/images/error/${owner}_happy.gif`,
        html_url: `https://github.com/${owner}`,
        type: 'User',
        site_admin: false,
      },
      html_url: `https://github.com/${owner}/${repo}`,
      ...repoData,
    })

    return http.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, () => {
      return HttpResponse.json(repository)
    })
  }

  /**
   * Create a repository issues handler
   */
  static createRepositoryIssuesHandler(owner: string, repo: string, issues?: GitHubIssue[]) {
    const issueList = issues || GitHubIssueMockFactory.createMany(5)

    return http.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, ({ request }) => {
      const url = new URL(request.url)
      const state = url.searchParams.get('state') || 'open'
      const labels = url.searchParams.get('labels')

      let filteredIssues = issueList.filter(issue => state === 'all' || issue.state === state)

      if (labels) {
        const labelNames = labels.split(',')
        filteredIssues = filteredIssues.filter(issue =>
          issue.labels.some(label => labelNames.includes(label.name))
        )
      }

      return HttpResponse.json(filteredIssues)
    })
  }

  /**
   * Create a search repositories handler
   */
  static createSearchRepositoriesHandler(repositories?: GitHubRepository[]) {
    const repoList = repositories || GitHubRepositoryMockFactory.createMany(10)

    return http.get(`${GITHUB_API_BASE}/search/repositories`, ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('q') || ''
      const sort = url.searchParams.get('sort') || 'best-match'
      const order = url.searchParams.get('order') || 'desc'
      const perPage = Number.parseInt(url.searchParams.get('per_page') || '30')
      const page = Number.parseInt(url.searchParams.get('page') || '1')

      // Simple filtering based on query
      const filteredRepos = repoList.filter(
        repo =>
          repo.name.toLowerCase().includes(q.toLowerCase()) ||
          repo.description?.toLowerCase().includes(q.toLowerCase()) ||
          repo.topics.some(topic => topic.toLowerCase().includes(q.toLowerCase()))
      )

      // Simple sorting
      if (sort === 'stars') {
        filteredRepos.sort((a, b) =>
          order === 'desc'
            ? b.stargazers_count - a.stargazers_count
            : a.stargazers_count - b.stargazers_count
        )
      }

      // Pagination
      const startIndex = (page - 1) * perPage
      const endIndex = startIndex + perPage
      const paginatedRepos = filteredRepos.slice(startIndex, endIndex)

      return HttpResponse.json({
        total_count: filteredRepos.length,
        incomplete_results: false,
        items: paginatedRepos,
      })
    })
  }

  /**
   * Create a rate limit handler
   */
  static createRateLimitHandler(rateLimitData?: Partial<GitHubRateLimit>) {
    const now = Math.floor(Date.now() / 1000)
    const resetTime = now + 3600

    const rateLimit: GitHubRateLimit = {
      core: { limit: 5000, remaining: 4999, reset: resetTime },
      search: { limit: 30, remaining: 29, reset: resetTime },
      graphql: { limit: 5000, remaining: 4999, reset: resetTime },
      ...rateLimitData,
    }

    return http.get(`${GITHUB_API_BASE}/rate_limit`, () => {
      return HttpResponse.json(rateLimit)
    })
  }

  /**
   * Create a GraphQL handler with intelligent response matching
   */
  static createGraphQLHandler(customResponses?: Record<string, any>) {
    return http.post(GITHUB_GRAPHQL_URL, async ({ request }) => {
      const body = (await request.json()) as { query: string; variables?: Record<string, any> }

      // Check for intentional errors
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

      // Custom responses
      if (customResponses) {
        for (const [queryFragment, response] of Object.entries(customResponses)) {
          if (body.query.includes(queryFragment)) {
            return HttpResponse.json({ data: response })
          }
        }
      }

      // Default responses
      if (body.query.includes('viewer')) {
        const user = GitHubUserMockFactory.create()
        return HttpResponse.json({
          data: {
            viewer: {
              login: user.login,
              name: user.name,
              email: user.email,
            },
          },
        })
      }

      if (body.query.includes('repository')) {
        const repository = GitHubRepositoryMockFactory.create({
          name: body.variables?.name || 'test-repo',
          owner: {
            login: body.variables?.owner || 'testowner',
            id: 1,
            avatar_url: 'https://github.com/images/error/testowner_happy.gif',
            html_url: 'https://github.com/testowner',
            type: 'User',
            site_admin: false,
          },
        })

        return HttpResponse.json({
          data: {
            repository: {
              name: repository.name,
              description: repository.description,
              stargazerCount: repository.stargazers_count,
              forkCount: repository.forks_count,
              owner: {
                login: repository.owner.login,
              },
            },
          },
        })
      }

      // Default empty response
      return HttpResponse.json({ data: {} })
    })
  }

  /**
   * Create an error handler for testing error scenarios
   */
  static createErrorHandler(path: string, statusCode: number, errorData?: any) {
    const defaultErrors: Record<number, any> = {
      401: {
        message: 'Bad credentials',
        documentation_url: 'https://docs.github.com/rest',
      },
      403: {
        message: 'API rate limit exceeded',
        documentation_url: 'https://docs.github.com/rest#rate-limiting',
      },
      404: {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      },
      422: {
        message: 'Validation Failed',
        errors: [{ field: 'name', code: 'invalid' }],
        documentation_url: 'https://docs.github.com/rest',
      },
    }

    const errorResponse = errorData ||
      defaultErrors[statusCode] || {
        message: 'An error occurred',
      }

    return http.get(`${GITHUB_API_BASE}${path}`, () => {
      const headers: Record<string, string> = {}

      if (statusCode === 403) {
        headers['x-ratelimit-limit'] = '5000'
        headers['x-ratelimit-remaining'] = '0'
        headers['x-ratelimit-reset'] = String(Math.floor(Date.now() / 1000) + 3600)
      }

      return HttpResponse.json(errorResponse, {
        status: statusCode,
        headers,
      })
    })
  }
}

/**
 * Reset factory counters for test isolation
 */
export function resetMockFactoryCounters(): void {
  ;(GitHubUserMockFactory as any).counter = 1
  ;(GitHubRepositoryMockFactory as any).counter = 1
  ;(GitHubIssueMockFactory as any).counter = 1
}

/**
 * Common handler sets for different testing scenarios
 */
export const CommonHandlerSets = {
  /**
   * Basic GitHub API handlers for standard functionality
   */
  basic: () => [
    MSWHandlerFactory.createUserHandler(),
    MSWHandlerFactory.createRateLimitHandler(),
    MSWHandlerFactory.createRepositoryHandler('testowner', 'test-repo'),
    MSWHandlerFactory.createGraphQLHandler(),
  ],

  /**
   * Handlers for testing error scenarios
   */
  errors: () => [
    MSWHandlerFactory.createErrorHandler('/user', 401),
    MSWHandlerFactory.createErrorHandler('/repos/invalid/repo', 404),
    MSWHandlerFactory.createErrorHandler('/rate_limit', 403),
  ],

  /**
   * Handlers for search functionality testing
   */
  search: () => [
    MSWHandlerFactory.createSearchRepositoriesHandler(),
    MSWHandlerFactory.createRepositoryIssuesHandler('testowner', 'test-repo'),
    MSWHandlerFactory.createRateLimitHandler({
      search: { limit: 30, remaining: 25, reset: Date.now() + 3600 },
    }),
  ],

  /**
   * Comprehensive handlers for integration tests
   */
  comprehensive: () => [
    ...CommonHandlerSets.basic(),
    ...CommonHandlerSets.search(),
    MSWHandlerFactory.createUserByUsernameHandler('testuser'),
    MSWHandlerFactory.createRepositoryIssuesHandler('testowner', 'test-repo', [
      GitHubIssueMockFactory.createGoodFirstIssue(),
      ...GitHubIssueMockFactory.createMany(4),
    ]),
  ],
}
