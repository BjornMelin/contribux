/**
 * Integration Test Workflow Data & Fixtures
 *
 * Shared test data, mock objects, and fixtures for GitHub integration testing.
 * Provides realistic test scenarios and expected data patterns.
 */

import type { Repository, SearchRepositoriesResult, User } from '@/types/github'

/**
 * Test repository configurations for integration testing
 */
export const testRepositories = {
  public: {
    owner: 'microsoft',
    repo: 'vscode',
    expected: {
      name: 'vscode',
      full_name: 'microsoft/vscode',
      private: false,
      language: 'TypeScript',
    },
  },

  popular: {
    owner: 'facebook',
    repo: 'react',
    expected: {
      name: 'react',
      full_name: 'facebook/react',
      private: false,
      language: 'JavaScript',
    },
  },

  archived: {
    owner: 'jquery',
    repo: 'jquery',
    expected: {
      name: 'jquery',
      full_name: 'jquery/jquery',
      private: false,
      archived: false, // jQuery is not archived
    },
  },
} as const

/**
 * Search query configurations for integration testing
 */
export const searchQueries = {
  popular: {
    query: 'javascript',
    sort: 'stars' as const,
    order: 'desc' as const,
    per_page: 10,
    expectedMinResults: 5,
  },

  specific: {
    query: 'react hooks typescript',
    sort: 'updated' as const,
    order: 'desc' as const,
    per_page: 5,
    expectedMinResults: 1,
  },

  language: {
    query: 'language:python',
    sort: 'stars' as const,
    order: 'desc' as const,
    per_page: 20,
    expectedMinResults: 10,
  },

  organization: {
    query: 'org:microsoft',
    sort: 'updated' as const,
    order: 'desc' as const,
    per_page: 15,
    expectedMinResults: 5,
  },
} as const

/**
 * Mock user data for testing
 */
export const mockUsers = {
  basic: {
    id: 12345,
    login: 'testuser',
    node_id: 'MDQ6VXNlcjEyMzQ1',
    avatar_url: 'https://github.com/images/error/testuser_happy.gif',
    gravatar_id: '',
    url: 'https://api.github.com/users/testuser',
    html_url: 'https://github.com/testuser',
    followers_url: 'https://api.github.com/users/testuser/followers',
    following_url: 'https://api.github.com/users/testuser/following{/other_user}',
    gists_url: 'https://api.github.com/users/testuser/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/testuser/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/testuser/subscriptions',
    organizations_url: 'https://api.github.com/users/testuser/orgs',
    repos_url: 'https://api.github.com/users/testuser/repos',
    events_url: 'https://api.github.com/users/testuser/events{/privacy}',
    received_events_url: 'https://api.github.com/users/testuser/received_events',
    type: 'User',
    site_admin: false,
    name: 'Test User',
    company: 'Test Company',
    blog: 'https://testuser.github.io',
    location: 'Test City',
    email: 'testuser@example.com',
    hireable: true,
    bio: 'Test user for integration testing',
    twitter_username: 'testuser',
    public_repos: 25,
    public_gists: 5,
    followers: 100,
    following: 50,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  } satisfies User,

  organization: {
    id: 67890,
    login: 'testorg',
    node_id: 'MDEyOk9yZ2FuaXphdGlvbjY3ODkw',
    avatar_url: 'https://github.com/images/error/testorg_happy.gif',
    gravatar_id: '',
    url: 'https://api.github.com/orgs/testorg',
    html_url: 'https://github.com/testorg',
    repos_url: 'https://api.github.com/orgs/testorg/repos',
    events_url: 'https://api.github.com/orgs/testorg/events',
    hooks_url: 'https://api.github.com/orgs/testorg/hooks',
    issues_url: 'https://api.github.com/orgs/testorg/issues',
    members_url: 'https://api.github.com/orgs/testorg/members{/member}',
    public_members_url: 'https://api.github.com/orgs/testorg/public_members{/member}',
    type: 'Organization',
    site_admin: false,
    name: 'Test Organization',
    company: null,
    blog: 'https://testorg.com',
    location: 'Global',
    email: 'contact@testorg.com',
    twitter_username: 'testorg',
    public_repos: 150,
    public_gists: 0,
    followers: 1000,
    following: 0,
    created_at: '2019-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  } satisfies User,
} as const

/**
 * Mock repository data for testing
 */
export const mockRepositories = {
  basic: {
    id: 123456789,
    node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk=',
    name: 'test-repo',
    full_name: 'testuser/test-repo',
    private: false,
    owner: mockUsers.basic,
    html_url: 'https://github.com/testuser/test-repo',
    description: 'A test repository for integration testing',
    fork: false,
    url: 'https://api.github.com/repos/testuser/test-repo',
    archive_url: 'https://api.github.com/repos/testuser/test-repo/{archive_format}{/ref}',
    assignees_url: 'https://api.github.com/repos/testuser/test-repo/assignees{/user}',
    blobs_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs{/sha}',
    branches_url: 'https://api.github.com/repos/testuser/test-repo/branches{/branch}',
    clone_url: 'https://github.com/testuser/test-repo.git',
    collaborators_url:
      'https://api.github.com/repos/testuser/test-repo/collaborators{/collaborator}',
    comments_url: 'https://api.github.com/repos/testuser/test-repo/comments{/number}',
    commits_url: 'https://api.github.com/repos/testuser/test-repo/commits{/sha}',
    compare_url: 'https://api.github.com/repos/testuser/test-repo/compare/{base}...{head}',
    contents_url: 'https://api.github.com/repos/testuser/test-repo/contents/{+path}',
    contributors_url: 'https://api.github.com/repos/testuser/test-repo/contributors',
    deployments_url: 'https://api.github.com/repos/testuser/test-repo/deployments',
    downloads_url: 'https://api.github.com/repos/testuser/test-repo/downloads',
    events_url: 'https://api.github.com/repos/testuser/test-repo/events',
    forks_url: 'https://api.github.com/repos/testuser/test-repo/forks',
    git_commits_url: 'https://api.github.com/repos/testuser/test-repo/git/commits{/sha}',
    git_refs_url: 'https://api.github.com/repos/testuser/test-repo/git/refs{/sha}',
    git_tags_url: 'https://api.github.com/repos/testuser/test-repo/git/tags{/sha}',
    git_url: 'git://github.com/testuser/test-repo.git',
    issue_comment_url: 'https://api.github.com/repos/testuser/test-repo/issues/comments{/number}',
    issue_events_url: 'https://api.github.com/repos/testuser/test-repo/issues/events{/number}',
    issues_url: 'https://api.github.com/repos/testuser/test-repo/issues{/number}',
    keys_url: 'https://api.github.com/repos/testuser/test-repo/keys{/key_id}',
    labels_url: 'https://api.github.com/repos/testuser/test-repo/labels{/name}',
    languages_url: 'https://api.github.com/repos/testuser/test-repo/languages',
    merges_url: 'https://api.github.com/repos/testuser/test-repo/merges',
    milestones_url: 'https://api.github.com/repos/testuser/test-repo/milestones{/number}',
    notifications_url:
      'https://api.github.com/repos/testuser/test-repo/notifications{?since,all,participating}',
    pulls_url: 'https://api.github.com/repos/testuser/test-repo/pulls{/number}',
    releases_url: 'https://api.github.com/repos/testuser/test-repo/releases{/id}',
    ssh_url: 'git@github.com:testuser/test-repo.git',
    stargazers_url: 'https://api.github.com/repos/testuser/test-repo/stargazers',
    statuses_url: 'https://api.github.com/repos/testuser/test-repo/statuses/{sha}',
    subscribers_url: 'https://api.github.com/repos/testuser/test-repo/subscribers',
    subscription_url: 'https://api.github.com/repos/testuser/test-repo/subscription',
    tags_url: 'https://api.github.com/repos/testuser/test-repo/tags',
    teams_url: 'https://api.github.com/repos/testuser/test-repo/teams',
    trees_url: 'https://api.github.com/repos/testuser/test-repo/git/trees{/sha}',
    homepage: 'https://testuser.github.io/test-repo',
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
  } satisfies Repository,

  popular: {
    id: 987654321,
    node_id: 'MDEwOlJlcG9zaXRvcnk5ODc2NTQzMjE=',
    name: 'popular-repo',
    full_name: 'testorg/popular-repo',
    private: false,
    owner: mockUsers.organization,
    html_url: 'https://github.com/testorg/popular-repo',
    description: 'A very popular repository with many stars',
    fork: false,
    url: 'https://api.github.com/repos/testorg/popular-repo',
    archive_url: 'https://api.github.com/repos/testorg/popular-repo/{archive_format}{/ref}',
    assignees_url: 'https://api.github.com/repos/testorg/popular-repo/assignees{/user}',
    blobs_url: 'https://api.github.com/repos/testorg/popular-repo/git/blobs{/sha}',
    branches_url: 'https://api.github.com/repos/testorg/popular-repo/branches{/branch}',
    clone_url: 'https://github.com/testorg/popular-repo.git',
    collaborators_url:
      'https://api.github.com/repos/testorg/popular-repo/collaborators{/collaborator}',
    comments_url: 'https://api.github.com/repos/testorg/popular-repo/comments{/number}',
    commits_url: 'https://api.github.com/repos/testorg/popular-repo/commits{/sha}',
    compare_url: 'https://api.github.com/repos/testorg/popular-repo/compare/{base}...{head}',
    contents_url: 'https://api.github.com/repos/testorg/popular-repo/contents/{+path}',
    contributors_url: 'https://api.github.com/repos/testorg/popular-repo/contributors',
    deployments_url: 'https://api.github.com/repos/testorg/popular-repo/deployments',
    downloads_url: 'https://api.github.com/repos/testorg/popular-repo/downloads',
    events_url: 'https://api.github.com/repos/testorg/popular-repo/events',
    forks_url: 'https://api.github.com/repos/testorg/popular-repo/forks',
    git_commits_url: 'https://api.github.com/repos/testorg/popular-repo/git/commits{/sha}',
    git_refs_url: 'https://api.github.com/repos/testorg/popular-repo/git/refs{/sha}',
    git_tags_url: 'https://api.github.com/repos/testorg/popular-repo/git/tags{/sha}',
    git_url: 'git://github.com/testorg/popular-repo.git',
    issue_comment_url: 'https://api.github.com/repos/testorg/popular-repo/issues/comments{/number}',
    issue_events_url: 'https://api.github.com/repos/testorg/popular-repo/issues/events{/number}',
    issues_url: 'https://api.github.com/repos/testorg/popular-repo/issues{/number}',
    keys_url: 'https://api.github.com/repos/testorg/popular-repo/keys{/key_id}',
    labels_url: 'https://api.github.com/repos/testorg/popular-repo/labels{/name}',
    languages_url: 'https://api.github.com/repos/testorg/popular-repo/languages',
    merges_url: 'https://api.github.com/repos/testorg/popular-repo/merges',
    milestones_url: 'https://api.github.com/repos/testorg/popular-repo/milestones{/number}',
    notifications_url:
      'https://api.github.com/repos/testorg/popular-repo/notifications{?since,all,participating}',
    pulls_url: 'https://api.github.com/repos/testorg/popular-repo/pulls{/number}',
    releases_url: 'https://api.github.com/repos/testorg/popular-repo/releases{/id}',
    ssh_url: 'git@github.com:testorg/popular-repo.git',
    stargazers_url: 'https://api.github.com/repos/testorg/popular-repo/stargazers',
    statuses_url: 'https://api.github.com/repos/testorg/popular-repo/statuses/{sha}',
    subscribers_url: 'https://api.github.com/repos/testorg/popular-repo/subscribers',
    subscription_url: 'https://api.github.com/repos/testorg/popular-repo/subscription',
    tags_url: 'https://api.github.com/repos/testorg/popular-repo/tags',
    teams_url: 'https://api.github.com/repos/testorg/popular-repo/teams',
    trees_url: 'https://api.github.com/repos/testorg/popular-repo/git/trees{/sha}',
    homepage: 'https://popular-repo.com',
    language: 'JavaScript',
    forks_count: 5000,
    stargazers_count: 50000,
    watchers_count: 50000,
    size: 10240,
    default_branch: 'main',
    open_issues_count: 250,
    topics: ['javascript', 'popular', 'framework', 'web'],
    has_issues: true,
    has_projects: true,
    has_wiki: true,
    has_pages: true,
    has_downloads: true,
    archived: false,
    disabled: false,
    visibility: 'public',
    pushed_at: '2023-12-15T15:30:00Z',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-12-15T15:30:00Z',
  } satisfies Repository,
} as const

/**
 * Mock search results for testing
 */
export const mockSearchResults = {
  javascript: {
    total_count: 1000000,
    incomplete_results: false,
    items: [mockRepositories.popular, mockRepositories.basic],
  } satisfies SearchRepositoriesResult,

  typescript: {
    total_count: 500000,
    incomplete_results: false,
    items: [mockRepositories.basic],
  } satisfies SearchRepositoriesResult,

  empty: {
    total_count: 0,
    incomplete_results: false,
    items: [],
  } satisfies SearchRepositoriesResult,
} as const

/**
 * Integration test scenarios and their expected outcomes
 */
export const integrationScenarios = {
  userProfileFlow: {
    name: 'User Profile Discovery Flow',
    steps: ['getAuthenticatedUser', 'listUserRepos', 'getRateLimit'],
    expectedDuration: 3000, // ms
    minSuccessRate: 100,
  },

  repositoryDiscovery: {
    name: 'Repository Discovery Flow',
    steps: ['searchRepositories', 'getRepositoryDetails', 'checkAccessibility'],
    expectedDuration: 5000, // ms
    minSuccessRate: 90,
  },

  errorRecovery: {
    name: 'Error Recovery Patterns',
    steps: ['triggerError', 'handleRetry', 'validateRecovery'],
    expectedDuration: 8000, // ms
    minSuccessRate: 70, // Some failures are expected
  },

  performanceOptimization: {
    name: 'Performance & Caching',
    steps: ['coldRequest', 'cachedRequest', 'validatePerformance'],
    expectedDuration: 2000, // ms
    minSuccessRate: 95,
  },
} as const

/**
 * Expected rate limit structure for testing
 */
export const mockRateLimit = {
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
  integration_manifest: {
    limit: 5000,
    remaining: 4999,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 1,
  },
  source_import: {
    limit: 100,
    remaining: 99,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 1,
  },
  code_scanning_upload: {
    limit: 1000,
    remaining: 999,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 1,
  },
  actions_runner_registration: {
    limit: 10000,
    remaining: 9999,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 1,
  },
} as const

/**
 * Performance benchmarks for integration testing
 */
export const performanceBenchmarks = {
  singleRequest: {
    maxDuration: 2000, // ms
    expectedDuration: 500, // ms
  },

  batchRequests: {
    maxDuration: 5000, // ms
    expectedDuration: 2000, // ms
    concurrency: 5,
  },

  cacheHit: {
    maxDuration: 100, // ms
    expectedDuration: 10, // ms
  },

  cacheMiss: {
    maxDuration: 2000, // ms
    expectedDuration: 500, // ms
  },
} as const
