/**
 * GitHub API Mock Response Fixtures
 * Standardized mock data for consistent testing
 */

/**
 * Mock user responses
 */
export const mockUserFixtures = {
  authenticated: {
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
  oauth: {
    login: 'oauthuser',
    id: 54321,
    name: 'OAuth User',
    avatar_url: 'https://github.com/images/error/oauthuser_happy.gif',
    html_url: 'https://github.com/oauthuser',
    type: 'User',
    site_admin: false,
    public_repos: 3,
    public_gists: 1,
    followers: 5,
    following: 8,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
} as const

/**
 * Mock repository responses
 */
export const mockRepositoryFixtures = {
  basic: {
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
  withNulls: {
    id: 1,
    name: 'null-values-repo',
    full_name: 'null-test/null-values-repo',
    owner: {
      login: 'null-test',
      id: 1,
      avatar_url: 'https://example.com/avatar.jpg',
      html_url: 'https://github.com/null-test',
      type: 'User',
      site_admin: false,
    },
    private: false,
    html_url: 'https://github.com/null-test/null-values-repo',
    description: null,
    fork: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    stargazers_count: 0,
    forks_count: 0,
    language: null,
    default_branch: 'main',
  },
} as const

/**
 * Mock issue responses
 */
export const mockIssueFixtures = {
  basic: {
    id: 1000,
    number: 1,
    title: 'Issue 1',
    body: 'Test issue 1 description',
    state: 'open',
    user: {
      login: 'testowner',
      id: 12345,
      type: 'User',
      avatar_url: 'https://github.com/images/error/testowner_happy.gif',
      html_url: 'https://github.com/testowner',
      site_admin: false,
    },
    labels: [],
    assignee: null,
    assignees: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/testowner/testrepo/issues/1',
    comments: 0,
  },
  withLabels: {
    id: 1003,
    number: 3,
    title: 'Bug: Fix TypeScript compilation errors',
    body: 'Several TypeScript compilation errors need to be resolved',
    state: 'open',
    user: {
      login: 'contributor',
      id: 67890,
      type: 'User',
      avatar_url: 'https://github.com/images/error/contributor_happy.gif',
      html_url: 'https://github.com/contributor',
      site_admin: false,
    },
    labels: [
      {
        id: 1001,
        name: 'bug',
        color: 'd73a49',
        description: "Something isn't working",
      },
      {
        id: 1002,
        name: 'good first issue',
        color: '7057ff',
        description: 'Good for newcomers',
      },
    ],
    assignee: {
      login: 'assignee',
      id: 54321,
      type: 'User',
      avatar_url: 'https://github.com/images/error/assignee_happy.gif',
      html_url: 'https://github.com/assignee',
      site_admin: false,
    },
    assignees: [
      {
        login: 'assignee',
        id: 54321,
        type: 'User',
        avatar_url: 'https://github.com/images/error/assignee_happy.gif',
        html_url: 'https://github.com/assignee',
        site_admin: false,
      },
    ],
    created_at: '2024-01-03T08:30:00Z',
    updated_at: '2024-01-03T09:15:00Z',
    html_url: 'https://github.com/testowner/testrepo/issues/3',
    comments: 2,
  },
  withComments: {
    id: 1004,
    number: 4,
    title: 'Feature: Add dark mode support',
    body: 'Implement dark mode toggle for better user experience',
    state: 'open',
    user: {
      login: 'featureuser',
      id: 98765,
      type: 'User',
      avatar_url: 'https://github.com/images/error/featureuser_happy.gif',
      html_url: 'https://github.com/featureuser',
      site_admin: false,
    },
    labels: [
      {
        id: 1003,
        name: 'enhancement',
        color: '0052cc',
        description: 'New feature or request',
      },
    ],
    assignee: null,
    assignees: [],
    created_at: '2024-01-04T14:20:00Z',
    updated_at: '2024-01-04T15:45:00Z',
    html_url: 'https://github.com/testowner/testrepo/issues/4',
    comments: 5,
  },
  withNullUser: {
    id: 1,
    number: 1,
    title: 'Test Issue',
    body: null,
    state: 'open',
    user: null,
    labels: [],
    assignee: null,
    assignees: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/null-user-test/null-user-repo/issues/1',
    comments: 0,
  },
  closed: {
    id: 1005,
    number: 5,
    title: 'Closed Issue',
    body: 'This issue has been resolved',
    state: 'closed',
    user: {
      login: 'testowner',
      id: 12345,
      type: 'User',
      avatar_url: 'https://github.com/images/error/testowner_happy.gif',
      html_url: 'https://github.com/testowner',
      site_admin: false,
    },
    labels: [],
    assignee: null,
    assignees: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T10:30:00Z',
    closed_at: '2024-01-02T10:30:00Z',
    html_url: 'https://github.com/testowner/testrepo/issues/5',
    comments: 1,
  },
} as const

/**
 * Mock pull request responses
 */
export const mockPullRequestFixtures = {
  basic: {
    id: 2001,
    number: 1,
    title: 'Add new feature',
    body: 'This PR adds a new feature to the application',
    state: 'open',
    user: {
      login: 'contributor',
      id: 67890,
      type: 'User',
      avatar_url: 'https://github.com/images/error/contributor_happy.gif',
      html_url: 'https://github.com/contributor',
      site_admin: false,
    },
    head: {
      label: 'contributor:feature-branch',
      ref: 'feature-branch',
      sha: 'abc123def456',
      user: {
        login: 'contributor',
        id: 67890,
        type: 'User',
      },
      repo: {
        id: 1296269,
        name: 'Hello-World',
        full_name: 'contributor/Hello-World',
        owner: {
          login: 'contributor',
          id: 67890,
        },
      },
    },
    base: {
      label: 'testowner:main',
      ref: 'main',
      sha: 'def456abc123',
      user: {
        login: 'testowner',
        id: 12345,
        type: 'User',
      },
      repo: {
        id: 1296268,
        name: 'Hello-World',
        full_name: 'testowner/Hello-World',
        owner: {
          login: 'testowner',
          id: 12345,
        },
      },
    },
    labels: [],
    assignee: null,
    assignees: [],
    requested_reviewers: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/testowner/testrepo/pull/1',
    draft: false,
    merged: false,
    mergeable: true,
    mergeable_state: 'clean',
    merged_by: null,
    comments: 0,
    commits: 3,
    additions: 45,
    deletions: 12,
    changed_files: 4,
  },
  merged: {
    id: 2002,
    number: 2,
    title: 'Fix bug in authentication',
    body: 'Resolves authentication issue reported in #123',
    state: 'closed',
    user: {
      login: 'maintainer',
      id: 11111,
      type: 'User',
      avatar_url: 'https://github.com/images/error/maintainer_happy.gif',
      html_url: 'https://github.com/maintainer',
      site_admin: false,
    },
    head: {
      label: 'maintainer:fix-auth',
      ref: 'fix-auth',
      sha: 'xyz789abc123',
      user: {
        login: 'maintainer',
        id: 11111,
        type: 'User',
      },
      repo: {
        id: 1296270,
        name: 'Hello-World',
        full_name: 'maintainer/Hello-World',
        owner: {
          login: 'maintainer',
          id: 11111,
        },
      },
    },
    base: {
      label: 'testowner:main',
      ref: 'main',
      sha: 'def456abc123',
      user: {
        login: 'testowner',
        id: 12345,
        type: 'User',
      },
      repo: {
        id: 1296268,
        name: 'Hello-World',
        full_name: 'testowner/Hello-World',
        owner: {
          login: 'testowner',
          id: 12345,
        },
      },
    },
    labels: [
      {
        id: 2001,
        name: 'bug',
        color: 'd73a49',
        description: "Something isn't working",
      },
    ],
    assignee: null,
    assignees: [],
    requested_reviewers: [],
    created_at: '2024-01-02T10:00:00Z',
    updated_at: '2024-01-02T16:30:00Z',
    closed_at: '2024-01-02T16:30:00Z',
    merged_at: '2024-01-02T16:30:00Z',
    html_url: 'https://github.com/testowner/testrepo/pull/2',
    draft: false,
    merged: true,
    mergeable: null,
    mergeable_state: 'clean',
    merged_by: {
      login: 'testowner',
      id: 12345,
      type: 'User',
      avatar_url: 'https://github.com/images/error/testowner_happy.gif',
      html_url: 'https://github.com/testowner',
      site_admin: false,
    },
    comments: 3,
    commits: 2,
    additions: 15,
    deletions: 8,
    changed_files: 2,
  },
} as const

/**
 * Mock comment responses
 */
export const mockCommentFixtures = {
  issueComment: {
    id: 12345,
    user: {
      login: 'commenter',
      id: 33333,
      type: 'User',
      avatar_url: 'https://github.com/images/error/commenter_happy.gif',
      html_url: 'https://github.com/commenter',
      site_admin: false,
    },
    body: 'This is a helpful comment on the issue',
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    html_url: 'https://github.com/testowner/testrepo/issues/1#issuecomment-12345',
    issue_url: 'https://api.github.com/repos/testowner/testrepo/issues/1',
  },
  prComment: {
    id: 67890,
    user: {
      login: 'reviewer',
      id: 44444,
      type: 'User',
      avatar_url: 'https://github.com/images/error/reviewer_happy.gif',
      html_url: 'https://github.com/reviewer',
      site_admin: false,
    },
    body: 'LGTM! Great work on this pull request.',
    created_at: '2024-01-02T14:30:00Z',
    updated_at: '2024-01-02T14:30:00Z',
    html_url: 'https://github.com/testowner/testrepo/pull/1#issuecomment-67890',
    pull_request_url: 'https://api.github.com/repos/testowner/testrepo/pulls/1',
  },
  withNullUser: {
    id: 99999,
    user: null,
    body: 'Comment from deleted user',
    created_at: '2024-01-01T08:00:00Z',
    updated_at: '2024-01-01T08:00:00Z',
    html_url: 'https://github.com/testowner/testrepo/issues/1#issuecomment-99999',
    issue_url: 'https://api.github.com/repos/testowner/testrepo/issues/1',
  },
} as const

/**
 * Mock search responses
 */
export const mockSearchFixtures = {
  repositories: {
    total_count: 100,
    incomplete_results: false,
    items: [
      {
        id: 1000,
        name: 'test-1',
        full_name: 'testowner/test-1',
        private: false,
        owner: {
          login: 'testowner',
          id: 1,
          avatar_url: 'https://github.com/images/error/testowner_happy.gif',
          html_url: 'https://github.com/testowner',
          type: 'User',
          site_admin: false,
        },
        html_url: 'https://github.com/testowner/test-1',
        description: 'Test repository 1',
        fork: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        stargazers_count: 80,
        forks_count: 9,
        language: 'JavaScript',
        default_branch: 'main',
      },
    ],
  },
  empty: {
    total_count: 0,
    incomplete_results: false,
    items: [],
  },
} as const

/**
 * Mock rate limit responses
 */
export const mockRateLimitFixtures = {
  normal: {
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
  edgeCase: {
    core: {
      limit: 0,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000),
    },
    search: {
      limit: 1,
      remaining: 1,
      reset: Math.floor(Date.now() / 1000) + 60,
    },
    graphql: {
      limit: 5000,
      remaining: 5000,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
  },
} as const

/**
 * Mock GraphQL responses
 */
export const mockGraphQLFixtures = {
  viewer: {
    data: {
      viewer: {
        login: 'testuser',
        name: 'Test User',
      },
    },
  },
  viewerWithRateLimit: {
    data: {
      viewer: {
        login: 'testuser',
        name: 'Test User',
      },
      rateLimit: {
        limit: 5000,
        cost: 1,
        remaining: 4999,
        resetAt: new Date(Date.now() + 3600000).toISOString(),
        nodeCount: 1,
      },
    },
  },
  repository: {
    data: {
      repository: {
        name: 'testrepo',
        description: 'Test repository description',
        owner: {
          login: 'testowner',
        },
      },
    },
  },
  error: {
    errors: [
      {
        message: 'Field "invalidField" doesn\'t exist on type "User"',
        locations: [{ line: 1, column: 15 }],
      },
    ],
  },
} as const

/**
 * Mock error responses
 */
export const mockErrorFixtures = {
  unauthorized: {
    message: 'Bad credentials',
    documentation_url: 'https://docs.github.com/rest',
  },
  forbidden: {
    message: 'Token does not have sufficient scope',
    documentation_url: 'https://docs.github.com/rest',
  },
  notFound: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest',
  },
  rateLimit: {
    message: 'API rate limit exceeded for user ID 1.',
    documentation_url: 'https://docs.github.com/rest#rate-limiting',
  },
  secondaryRateLimit: {
    message: 'You have exceeded a secondary rate limit',
  },
  validation: {
    message: 'Validation Failed',
    errors: [
      {
        resource: 'Repository',
        field: 'name',
        code: 'invalid',
        message: 'name is invalid',
      },
    ],
  },
  serverError: {
    message: 'Internal Server Error',
  },
} as const

/**
 * Mock rate limit headers
 */
export const mockRateLimitHeaders = {
  normal: {
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    'x-ratelimit-used': '1',
  },
  exhausted: {
    'X-RateLimit-Limit': '60',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
    'X-RateLimit-Used': '60',
  },
  secondary: {
    'X-RateLimit-Limit': '30',
    'X-RateLimit-Remaining': '29',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
    'Retry-After': '60',
  },
  withScopes: {
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    'x-ratelimit-used': '1',
    'x-oauth-scopes': 'user:email',
  },
} as const
