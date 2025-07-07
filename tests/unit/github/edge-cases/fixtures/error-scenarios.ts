/**
 * Error Test Data and Response Fixtures
 *
 * Comprehensive test data for edge case scenarios including
 * malformed responses, boundary conditions, and error states.
 */

/**
 * Malformed response data for testing error handling
 */
export const MALFORMED_RESPONSES = {
  INVALID_JSON: '{"invalid": json}',
  INCOMPLETE_JSON: '{"name": "test",',
  EMPTY_RESPONSE: '',
  NON_JSON: '<html><body>Not JSON</body></html>',
  BINARY_DATA: Buffer.from([0x00, 0x01, 0x02, 0x03]).toString(),
} as const

/**
 * Repository data with null values for edge case testing
 */
export const NULL_VALUE_REPOSITORY = {
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
  description: null, // Edge case: null description
  fork: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  language: null, // Edge case: null language
  default_branch: 'main',
} as const

/**
 * Issue with null user for edge case testing
 */
export const NULL_USER_ISSUE = {
  id: 1,
  number: 1,
  title: 'Test Issue',
  body: null,
  state: 'open',
  user: null, // Edge case: null user (deleted/anonymous)
  labels: [],
  assignee: null,
  assignees: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  html_url: 'https://github.com/null-user-test/null-user-repo/issues/1',
} as const

/**
 * Repository with wrong data types for validation testing
 */
export const WRONG_TYPES_REPOSITORY = {
  id: 'not-a-number', // Should be number
  name: 123, // Should be string
  full_name: 'owner/repo',
  owner: {
    login: 'owner',
    id: 1,
    avatar_url: 'https://example.com/avatar.jpg',
    html_url: 'https://github.com/owner',
    type: 'User',
    site_admin: 'yes', // Should be boolean
  },
  private: false,
  html_url: 'https://github.com/owner/repo',
  description: null,
  fork: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  stargazers_count: '100', // Should be number
  forks_count: 0,
  language: null,
  default_branch: 'main',
} as const

/**
 * Repository with missing optional fields
 */
export const MISSING_FIELDS_REPOSITORY = {
  id: 1,
  name: 'test-repo',
  full_name: 'owner/test-repo',
  owner: {
    login: 'owner',
    id: 1,
    avatar_url: 'https://example.com/avatar.jpg',
    html_url: 'https://github.com/owner',
    type: 'User',
    site_admin: false,
  },
  private: false,
  html_url: 'https://github.com/owner/test-repo',
  description: 'Test repo',
  fork: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  language: 'JavaScript',
  default_branch: 'main',
  // topics field is missing (optional)
  // Extra unexpected fields should be ignored
  extra_field: 'should be ignored',
  another_field: { nested: 'data' },
} as const

/**
 * Repository with very long description
 */
export const LONG_DESCRIPTION_REPOSITORY = {
  id: 1,
  name: 'long-desc-repo',
  full_name: 'owner/long-desc-repo',
  owner: {
    login: 'owner',
    id: 1,
    avatar_url: 'https://example.com/avatar.jpg',
    html_url: 'https://github.com/owner',
    type: 'User',
    site_admin: false,
  },
  private: false,
  html_url: 'https://github.com/owner/long-desc-repo',
  description: 'A'.repeat(5000), // Very long description
  fork: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  language: 'JavaScript',
  default_branch: 'main',
} as const

/**
 * Single character repository for boundary testing
 */
export const SINGLE_CHAR_REPOSITORY = {
  id: 1,
  name: 'b',
  full_name: 'a/b',
  owner: {
    login: 'a',
    id: 1,
    avatar_url: 'https://example.com/avatar.jpg',
    html_url: 'https://github.com/a',
    type: 'User',
    site_admin: false,
  },
  private: false,
  html_url: 'https://github.com/a/b',
  description: 'Single char repo',
  fork: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  stargazers_count: 0,
  forks_count: 0,
  language: 'JavaScript',
  default_branch: 'main',
} as const

/**
 * Large issue with many labels for performance testing
 */
export const LARGE_ISSUE_RESPONSE = {
  id: 1,
  number: 1,
  title: 'Issue with many labels',
  body: 'A'.repeat(10000), // Large body
  state: 'open',
  user: {
    login: 'testuser',
    id: 1,
    avatar_url: 'https://example.com/avatar.jpg',
    html_url: 'https://github.com/testuser',
    type: 'User',
    site_admin: false,
  },
  labels: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `label-${i}`,
    color: '000000',
    description: `This is a very long description for label ${i} that contains lots of text`,
  })),
  assignee: null,
  assignees: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  html_url: 'https://github.com/owner/repo/issues/1',
} as const

/**
 * Edge case rate limit values
 */
export const EDGE_CASE_RATE_LIMITS = {
  ZERO_LIMIT: {
    core: {
      limit: 0, // Edge case: zero limit
      remaining: 0,
      reset: Math.floor(Date.now() / 1000),
    },
    search: {
      limit: 1, // Edge case: minimal limit
      remaining: 1,
      reset: Math.floor(Date.now() / 1000) + 60,
    },
    graphql: {
      limit: 5000,
      remaining: 5000,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
  },
  EXHAUSTED_LIMITS: {
    core: {
      limit: 5000,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
    search: {
      limit: 30,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 300,
    },
    graphql: {
      limit: 5000,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
  },
} as const

/**
 * Special characters for encoding tests
 */
export const SPECIAL_CHARACTERS = {
  REPO_NAME: 'repo-with-dash_and_underscore.dot',
  UNICODE_USERNAME: 'user-测试-тест-🚀',
  SEARCH_QUERIES: [
    'language:JavaScript',
    'topic:"web development"',
    'user:octocat stars:>10',
    'org:github fork:true',
  ],
} as const

/**
 * GraphQL error responses
 */
export const GRAPHQL_ERRORS = {
  INVALID_FIELD: {
    errors: [
      {
        message: 'Field "invalidField" doesn\'t exist on type "User"',
        locations: [{ line: 1, column: 15 }],
      },
    ],
  },
  SYNTAX_ERROR: {
    errors: [
      {
        message: 'Syntax Error: Expected Name, found }',
        locations: [{ line: 1, column: 10 }],
      },
    ],
  },
  RATE_LIMIT_ERROR: {
    errors: [
      {
        message: 'API rate limit exceeded',
        type: 'RATE_LIMITED',
      },
    ],
  },
} as const

/**
 * Validation error responses
 */
export const VALIDATION_ERRORS = {
  REPOSITORY_NAME: {
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
  MULTIPLE_FIELDS: {
    message: 'Validation Failed',
    errors: [
      {
        resource: 'Issue',
        field: 'title',
        code: 'missing',
        message: 'title is required',
      },
      {
        resource: 'Issue',
        field: 'body',
        code: 'too_long',
        message: 'body is too long (maximum is 65536 characters)',
      },
    ],
  },
} as const

/**
 * Invalid token test data for authentication edge cases
 */
export const INVALID_TOKENS = {
  malformed: 'ghp_invalid_token_format',
  expired: 'ghp_1234567890abcdef1234567890abcdef12345678',
  revoked: 'ghp_abcdef1234567890abcdef1234567890abcdef12',
  empty: '',
  null: null,
  undefined: undefined,
  wrongFormat: 'not_a_token',
  tooShort: 'ghp_123',
  tooLong: `ghp_${'a'.repeat(100)}`,
  limitedScope: 'ghp_limited_scope_token_no_repo_access_1234567890',
  refreshFailed: 'ghp_refresh_failed_token_cannot_renew_abcdef123456',
  hijacked: 'ghp_hijacked_session_token_invalid_security_567890ab',
  oauthFailed: 'ghp_oauth_exchange_failed_token_invalid_flow_cdef12',
} as const

/**
 * Permission scenario test data
 */
export const PERMISSION_SCENARIOS = {
  NO_ACCESS: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest/reference/repos#get-a-repository',
  },
  PRIVATE_REPO: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest/reference/repos#get-a-repository',
  },
  ORGANIZATION_PRIVATE: {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest/reference/orgs#get-an-organization',
  },
  INSUFFICIENT_PERMISSIONS: {
    message: 'Must have admin rights to Repository.',
    documentation_url: 'https://docs.github.com/rest/reference/repos',
  },
} as const

/**
 * Authentication error response templates
 */
export const AUTH_ERROR_RESPONSES = {
  BAD_CREDENTIALS: {
    message: 'Bad credentials',
    documentation_url: 'https://docs.github.com/rest',
  },
  TOKEN_EXPIRED: {
    message: 'Bad credentials',
    documentation_url: 'https://docs.github.com/rest',
  },
  TOKEN_REVOKED: {
    message: 'Bad credentials',
    documentation_url: 'https://docs.github.com/rest',
  },
  RATE_LIMITED: {
    message: 'API rate limit exceeded',
    documentation_url:
      'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
  },
  FORBIDDEN: {
    message: 'Forbidden',
    documentation_url: 'https://docs.github.com/rest',
  },
  REQUIRES_AUTHENTICATION: {
    message: 'Requires authentication',
    documentation_url: 'https://docs.github.com/rest',
  },
} as const
