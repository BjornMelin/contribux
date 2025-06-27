/**
 * Authentication Provider Mocks
 *
 * Provides mock implementations for authentication providers including:
 * - GitHub OAuth responses
 * - GitHub App responses
 * - Error scenario mocking
 * - Rate limit header mocking
 */

import nock from 'nock'
import { rateLimitScenarios, testUsers } from '../fixtures/auth-scenarios'

export interface MockResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/**
 * Mocks successful GitHub user authentication
 */
export function mockSuccessfulAuth(
  user: typeof testUsers.validUser = testUsers.validUser,
  rateLimitInfo = rateLimitScenarios.standard
): nock.Scope {
  return nock('https://api.github.com')
    .get('/user')
    .reply(200, user, {
      'x-ratelimit-limit': rateLimitInfo.limit.toString(),
      'x-ratelimit-remaining': rateLimitInfo.remaining.toString(),
      'x-ratelimit-reset': rateLimitInfo.reset.toString(),
      'x-ratelimit-resource': rateLimitInfo.resource,
      'x-ratelimit-used': (rateLimitInfo.limit - rateLimitInfo.remaining).toString(),
    })
}

/**
 * Mocks authentication failure scenarios
 */
export function mockAuthFailure(statusCode = 401, message = 'Bad credentials'): nock.Scope {
  return nock('https://api.github.com').get('/user').reply(statusCode, {
    message,
    documentation_url: 'https://docs.github.com/rest',
  })
}

/**
 * Mocks GitHub App authentication
 */
export function mockGitHubAppAuth(appId: number, appName = 'Test App'): nock.Scope {
  return nock('https://api.github.com')
    .get('/app')
    .reply(200, {
      id: appId,
      name: appName,
      owner: {
        login: 'testorg',
        id: 67890,
        type: 'Organization',
      },
      description: 'Test GitHub App',
      external_url: 'https://example.com',
      html_url: `https://github.com/apps/${appName.toLowerCase()}`,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    })
}

/**
 * Mocks GitHub App installation access
 */
export function mockInstallationAuth(installationId: number, appId: number): nock.Scope {
  return nock('https://api.github.com')
    .get(`/app/installations/${installationId}`)
    .reply(200, {
      id: installationId,
      app_id: appId,
      app_slug: 'test-app',
      target_id: 67890,
      target_type: 'Organization',
      permissions: {
        contents: 'read',
        metadata: 'read',
        pull_requests: 'write',
      },
      events: ['push', 'pull_request'],
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      single_file_name: null,
      has_multiple_single_files: false,
      single_file_paths: [],
      suspended_by: null,
      suspended_at: null,
    })
}

/**
 * Mocks installation repositories access
 */
export function mockInstallationRepos(repositories: unknown[] = []): nock.Scope {
  return nock('https://api.github.com').get('/installation/repositories').reply(200, {
    total_count: repositories.length,
    repositories,
    repository_selection: 'selected',
  })
}

/**
 * Mocks OAuth token exchange
 */
export function mockOAuthTokenExchange(
  _clientId: string,
  accessToken = 'gho_oauth_access_token'
): nock.Scope {
  return nock('https://github.com').post('/login/oauth/access_token').reply(200, {
    access_token: accessToken,
    token_type: 'bearer',
    scope: 'user,repo',
  })
}

/**
 * Mocks OAuth user info retrieval
 */
export function mockOAuthUserInfo(
  user: typeof testUsers.validUser = testUsers.validUser
): nock.Scope {
  return nock('https://api.github.com').get('/user').reply(200, user, {
    'x-oauth-scopes': 'user,repo,read:org',
    'x-accepted-oauth-scopes': 'user',
  })
}

/**
 * Mocks rate limit endpoint
 */
export function mockRateLimit(
  resources = {
    core: rateLimitScenarios.standard,
    search: { ...rateLimitScenarios.standard, limit: 30 },
    graphql: rateLimitScenarios.graphql,
  }
): nock.Scope {
  return nock('https://api.github.com').get('/rate_limit').reply(200, {
    resources,
    rate: resources.core,
  })
}

/**
 * Mocks GraphQL rate limit query
 */
export function mockGraphQLRateLimit(
  user: typeof testUsers.validUser = testUsers.validUser,
  rateLimit = rateLimitScenarios.graphql
): nock.Scope {
  return nock('https://api.github.com')
    .post('/graphql')
    .reply(200, {
      data: {
        viewer: {
          login: user.login,
        },
        rateLimit: {
          limit: rateLimit.limit,
          cost: rateLimit.cost,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
      },
    })
}

/**
 * Mocks intermittent authentication failures for retry testing
 */
export function mockIntermittentAuthFailure(
  failureCount = 2,
  user: typeof testUsers.validUser = testUsers.validUser
): nock.Scope {
  const scope = nock('https://api.github.com')

  // Add failure responses
  for (let i = 0; i < failureCount; i++) {
    scope.get('/user').reply(401, { message: 'Bad credentials' })
  }

  // Add final success response
  scope.get('/user').reply(200, user)

  return scope
}

/**
 * Mocks network timeout scenarios
 */
export function mockNetworkTimeout(delayMs = 5000): nock.Scope {
  return nock('https://api.github.com').get('/user').delay(delayMs).reply(200, testUsers.validUser)
}

/**
 * Mocks repository list for authenticated user
 */
export function mockAuthenticatedUserRepos(repos: unknown[] = []): nock.Scope {
  return nock('https://api.github.com')
    .get('/user/repos')
    .query(true) // Accept any query parameters
    .reply(200, repos)
}

/**
 * Helper to clean up all authentication mocks
 */
export function cleanupAuthMocks(): void {
  nock.cleanAll()
}

/**
 * Helper to verify all mocks were used
 */
export function verifyAuthMocks(): void {
  if (!nock.isDone()) {
    const pendingMocks = nock.pendingMocks()
    throw new Error(`Unused mocks: ${pendingMocks.join(', ')}`)
  }
}
