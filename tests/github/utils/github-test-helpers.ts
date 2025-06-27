/**
 * Shared GitHub API Test Utilities
 * Common test helpers for GitHub API client testing
 */

import type { GitHubClient } from '@/lib/github/client'

/**
 * Access private getCacheKey method for testing
 */
export const getPrivateCacheKey = (
  client: GitHubClient,
  method: string,
  params: Record<string, unknown>
): string => {
  return (
    client as unknown as {
      getCacheKey: (method: string, params: Record<string, unknown>) => string
    }
  ).getCacheKey(method, params)
}

/**
 * Test client configuration options
 */
export const testClientConfigs = {
  basicToken: {
    auth: { type: 'token' as const, token: 'ghp_test_token' },
  },
  tokenWithCache: {
    auth: { type: 'token' as const, token: 'ghp_test_token' },
    cache: { maxSize: 100, maxAge: 60000 },
  },
  customConfig: {
    auth: { type: 'token' as const, token: 'ghp_test_token' },
    baseUrl: 'https://api.github.com',
    userAgent: 'test-agent/1.0',
    cache: {
      maxSize: 500,
      maxAge: 300000,
    },
  },
  retryConfig: {
    auth: { type: 'token' as const, token: 'ghp_test_token' },
    retry: { retries: 2, doNotRetry: [] },
  },
} as const

/**
 * Test token patterns for different scenarios
 */
export const testTokens = {
  valid: 'ghp_test_token',
  invalid: 'ghp_invalid_token',
  expired: 'ghp_expired_token',
  revoked: 'ghp_revoked_token',
  limitedScope: 'ghp_limited_scope_token',
  oauth: 'gho_oauth_access_token',
  persistent: 'ghp_persistent_token',
  timeout: 'ghp_timeout_token',
  retry: 'ghp_retry_token',
  secret: 'ghp_secret_token_12345',
} as const

/**
 * Expected user response structure
 */
export const expectedUserFields = [
  'login',
  'id',
  'type',
  'avatar_url',
  'html_url',
  'site_admin',
] as const

/**
 * Expected repository response structure
 */
export const expectedRepoFields = [
  'id',
  'name',
  'full_name',
  'owner',
  'html_url',
  'description',
  'language',
  'stargazers_count',
  'forks_count',
] as const

/**
 * Expected issue response structure
 */
export const expectedIssueFields = [
  'id',
  'number',
  'title',
  'body',
  'state',
  'user',
  'labels',
  'assignees',
  'created_at',
  'updated_at',
  'html_url',
] as const

/**
 * Expected rate limit response structure
 */
export const expectedRateLimitStructure = {
  core: {
    limit: 'number',
    remaining: 'number',
    reset: 'number',
  },
  search: {
    limit: 'number',
    remaining: 'number',
    reset: 'number',
  },
  graphql: {
    limit: 'number',
    remaining: 'number',
    reset: 'number',
  },
} as const

/**
 * Common test repository parameters
 */
export const testRepoParams = {
  basic: { owner: 'testowner', repo: 'testrepo' },
  singleChar: { owner: 'a', repo: 'b' },
  nullValues: { owner: 'null-test', repo: 'null-values-repo' },
  badTypes: { owner: 'owner', repo: 'bad-types' },
  longDesc: { owner: 'owner', repo: 'long-desc-repo' },
  nonexistent: { owner: 'nonexistent', repo: 'repo' },
} as const

/**
 * Common GraphQL queries for testing
 */
export const testGraphQLQueries = {
  viewer: `
    query {
      viewer {
        login
        name
      }
    }
  `,
  repository: `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        name
        description
      }
    }
  `,
  invalid: 'query { invalidField }',
} as const

/**
 * Test search parameters
 */
export const testSearchParams = {
  basic: {
    q: 'test',
    sort: 'stars' as const,
    order: 'desc' as const,
  },
  withPagination: {
    q: 'test',
    sort: 'stars' as const,
    order: 'desc' as const,
    per_page: 5,
  },
  large: {
    q: 'javascriptlargepage',
    per_page: 100,
  },
  empty: {
    q: 'nonexistentquery12345unique',
  },
} as const

/**
 * Test issue parameters
 */
export const testIssueParams = {
  repository: { owner: 'testowner', repo: 'testrepo' },
  singleIssue: { owner: 'testowner', repo: 'testrepo', issueNumber: 1 },
  notFound: { owner: 'notfound', repo: 'notfound', issueNumber: 999 },
  nullValues: { owner: 'null-test', repo: 'null-values', issueNumber: 2 },
  withLabels: { owner: 'testowner', repo: 'testrepo', issueNumber: 3 },
  withComments: { owner: 'testowner', repo: 'testrepo', issueNumber: 4 },
  singleComment: { owner: 'testowner', repo: 'testrepo', commentId: 12345 },
  commentNotFound: { owner: 'testowner', repo: 'testrepo', commentId: 99999 },
  badTypes: { owner: 'owner', repo: 'bad-types', issueNumber: 1 },
} as const

/**
 * Test pull request parameters
 */
export const testPRParams = {
  repository: { owner: 'testowner', repo: 'testrepo' },
  singlePR: { owner: 'testowner', repo: 'testrepo', pullNumber: 1 },
  notFound: { owner: 'notfound', repo: 'notfound', pullNumber: 999 },
  merged: { owner: 'testowner', repo: 'testrepo', pullNumber: 2 },
} as const

/**
 * Cache key test parameters
 */
export const cacheKeyTestCases = {
  differentOrder: [
    { owner: 'test', repo: 'repo', page: 1, per_page: 10 },
    { per_page: 10, page: 1, repo: 'repo', owner: 'test' },
    { repo: 'repo', owner: 'test', per_page: 10, page: 1 },
  ],
  differentValues: [
    { owner: 'test1', repo: 'repo' },
    { owner: 'test2', repo: 'repo' },
  ],
  nestedObjects: [
    {
      user: { name: 'test', settings: { theme: 'dark', lang: 'en' } },
      page: 1,
    },
    {
      page: 1,
      user: { settings: { lang: 'en', theme: 'dark' }, name: 'test' },
    },
  ],
  withArrays: [
    { tags: ['a', 'b', 'c'], type: 'test' },
    { type: 'test', tags: ['a', 'b', 'c'] },
  ],
  withNulls: [
    { value: null, other: undefined, name: 'test' },
    { name: 'test', other: undefined, value: null },
  ],
  longParams: {
    query: 'a'.repeat(100),
    filters: {
      languages: ['javascript', 'typescript', 'python', 'go', 'rust'],
      topics: ['machine-learning', 'artificial-intelligence', 'data-science'],
      properties: {
        hasIssues: true,
        hasWiki: true,
        hasProjects: true,
        hasDownloads: true,
      },
    },
    sort: 'updated',
    order: 'desc',
    per_page: 100,
    page: 1,
  },
} as const

/**
 * Validate response has expected structure
 */
export function validateResponseStructure<T extends Record<string, unknown>>(
  response: T,
  expectedFields: readonly string[]
): void {
  for (const field of expectedFields) {
    if (!(field in response)) {
      throw new Error(`Missing required field: ${field}`)
    }
  }
}

/**
 * Create test promises for concurrent testing
 */
export function createConcurrentTestPromises(client: GitHubClient) {
  return [
    client.getAuthenticatedUser(),
    client.getUser('testuser'),
    client.getRepository({ owner: 'testowner', repo: 'testrepo' }),
  ]
}

/**
 * Verify cache hit behavior
 */
export function verifyCacheHit(statsBefore: { hits: number }, statsAfter: { hits: number }): void {
  if (statsAfter.hits !== statsBefore.hits + 1) {
    throw new Error('Expected cache hit, but hits did not increase by 1')
  }
}
