/**
 * MSW Error Response Handlers
 *
 * Specialized MSW handlers for simulating various error conditions,
 * network failures, and edge case responses.
 */

import { HttpResponse, http } from 'msw'
import {
  EDGE_CASE_RATE_LIMITS,
  GRAPHQL_ERRORS,
  LARGE_ISSUE_RESPONSE,
  LONG_DESCRIPTION_REPOSITORY,
  MALFORMED_RESPONSES,
  MISSING_FIELDS_REPOSITORY,
  NULL_USER_ISSUE,
  NULL_VALUE_REPOSITORY,
  SINGLE_CHAR_REPOSITORY,
  VALIDATION_ERRORS,
  WRONG_TYPES_REPOSITORY,
} from '../fixtures/error-scenarios'

const GITHUB_API_BASE = 'https://api.github.com'

/**
 * Handlers for malformed response testing
 */
export const malformedResponseHandlers = [
  // Malformed JSON response
  http.get(`${GITHUB_API_BASE}/repos/malformed-test/malformed-repo-unique`, () => {
    return new HttpResponse(MALFORMED_RESPONSES.INVALID_JSON, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }),

  // Incomplete JSON response
  http.get(`${GITHUB_API_BASE}/repos/malformed-test/incomplete-json`, () => {
    return new HttpResponse(MALFORMED_RESPONSES.INCOMPLETE_JSON, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }),

  // Empty response
  http.get(`${GITHUB_API_BASE}/repos/malformed-test/empty-response`, () => {
    return new HttpResponse(MALFORMED_RESPONSES.EMPTY_RESPONSE, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }),

  // Non-JSON response
  http.get(`${GITHUB_API_BASE}/repos/malformed-test/non-json`, () => {
    return new HttpResponse(MALFORMED_RESPONSES.NON_JSON, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  }),
]

/**
 * Handlers for server error testing
 */
export const serverErrorHandlers = [
  // 500 Internal Server Error
  http.get(`${GITHUB_API_BASE}/repos/server-error-test/server-error-repo-unique`, () => {
    return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
  }),

  // 502 Bad Gateway
  http.get(`${GITHUB_API_BASE}/repos/server-error-test/bad-gateway`, () => {
    return HttpResponse.json({ message: 'Bad Gateway' }, { status: 502 })
  }),

  // 503 Service Unavailable
  http.get(`${GITHUB_API_BASE}/repos/server-error-test/service-unavailable`, () => {
    return HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })
  }),
]

/**
 * Handlers for validation error testing
 */
export const validationErrorHandlers = [
  // 422 Validation Error
  http.get(`${GITHUB_API_BASE}/repos/validation-test/validation-error-repo-unique`, () => {
    return HttpResponse.json(VALIDATION_ERRORS.REPOSITORY_NAME, { status: 422 })
  }),

  // Multiple validation errors
  http.post(`${GITHUB_API_BASE}/repos/validation-test/validation-error-repo-unique/issues`, () => {
    return HttpResponse.json(VALIDATION_ERRORS.MULTIPLE_FIELDS, { status: 422 })
  }),
]

/**
 * Handlers for rate limiting testing
 */
export const rateLimitingHandlers = [
  // Primary rate limit exceeded
  http.get(`${GITHUB_API_BASE}/repos/test/rate-limited-unique`, () => {
    return HttpResponse.json(
      {
        message: 'API rate limit exceeded for user ID 1.',
        documentation_url: 'https://docs.github.com/rest#rate-limiting',
      },
      {
        status: 403,
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
          'X-RateLimit-Used': '60',
        },
      }
    )
  }),

  // Secondary rate limit exceeded
  http.get(`${GITHUB_API_BASE}/repos/test/secondary-limit-unique`, () => {
    return HttpResponse.json(
      { message: 'You have exceeded a secondary rate limit' },
      {
        status: 403,
        headers: {
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': '29',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
          'Retry-After': '60',
        },
      }
    )
  }),

  // Edge case rate limit values
  http.get(`${GITHUB_API_BASE}/rate_limit`, ({ request }) => {
    const userAgent = request.headers.get('user-agent') || ''

    if (userAgent.includes('edge-case-test')) {
      return HttpResponse.json(EDGE_CASE_RATE_LIMITS.ZERO_LIMIT)
    }

    return HttpResponse.json(EDGE_CASE_RATE_LIMITS.EXHAUSTED_LIMITS)
  }),
]

/**
 * Handlers for network error testing
 */
export const networkErrorHandlers = [
  // Network disconnection
  http.get(`${GITHUB_API_BASE}/rate_limit`, () => {
    return HttpResponse.error()
  }),

  // Timeout simulation (long delay)
  http.get(`${GITHUB_API_BASE}/user`, async () => {
    await new Promise(resolve => setTimeout(resolve, 10000))
    return HttpResponse.json({ login: 'test' })
  }),

  // Connection refused
  http.get(`${GITHUB_API_BASE}/repos/network-test/connection-refused`, () => {
    throw new Error('ECONNREFUSED')
  }),
]

/**
 * Handlers for authentication error testing
 */
export const authenticationErrorHandlers = [
  // Bad credentials
  http.get(`${GITHUB_API_BASE}/repos/test/bad-credentials-unique`, () => {
    return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
  }),

  // Insufficient scope
  http.get(`${GITHUB_API_BASE}/repos/test/insufficient-scope`, () => {
    return HttpResponse.json(
      {
        message: 'Token does not have sufficient scope',
        documentation_url: 'https://docs.github.com/rest',
      },
      { status: 403 }
    )
  }),

  // Token expired
  http.get(`${GITHUB_API_BASE}/repos/test/expired-token`, () => {
    return HttpResponse.json({ message: 'Token has expired' }, { status: 401 })
  }),
]

/**
 * Handlers for data edge cases
 */
export const dataEdgeCaseHandlers = [
  // Repository with null values
  http.get(`${GITHUB_API_BASE}/repos/null-test/null-values-repo`, () => {
    return HttpResponse.json(NULL_VALUE_REPOSITORY)
  }),

  // Issue with null user
  http.get(`${GITHUB_API_BASE}/repos/null-user-test/null-user-repo/issues/1`, () => {
    return HttpResponse.json(NULL_USER_ISSUE)
  }),

  // Repository with wrong data types
  http.get(`${GITHUB_API_BASE}/repos/owner/bad-types`, () => {
    return HttpResponse.json(WRONG_TYPES_REPOSITORY)
  }),

  // Repository with missing optional fields
  http.get(`${GITHUB_API_BASE}/repos/owner/test-repo`, () => {
    return HttpResponse.json(MISSING_FIELDS_REPOSITORY)
  }),

  // Repository with very long description
  http.get(`${GITHUB_API_BASE}/repos/owner/long-desc-repo`, () => {
    return HttpResponse.json(LONG_DESCRIPTION_REPOSITORY)
  }),

  // Single character repository names
  http.get(`${GITHUB_API_BASE}/repos/a/b`, () => {
    return HttpResponse.json(SINGLE_CHAR_REPOSITORY)
  }),

  // Large issue with many labels
  http.get(`${GITHUB_API_BASE}/repos/owner/repo/issues/1`, () => {
    return HttpResponse.json(LARGE_ISSUE_RESPONSE)
  }),
]

/**
 * Handlers for search edge cases
 */
export const searchEdgeCaseHandlers = [
  // Zero search results
  http.get(`${GITHUB_API_BASE}/search/repositories`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') || ''

    if (q === 'nonexistentquery12345unique') {
      return HttpResponse.json({
        total_count: 0,
        incomplete_results: false,
        items: [],
      })
    }

    // Large page size test
    if (q === 'javascriptlargepage' && url.searchParams.get('per_page') === '100') {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `repo-${i + 1}`,
        full_name: `owner/repo-${i + 1}`,
        owner: {
          login: 'owner',
          id: 1,
          avatar_url: 'https://example.com/avatar.jpg',
          html_url: 'https://github.com/owner',
          type: 'User',
          site_admin: false,
        },
        private: false,
        html_url: `https://github.com/owner/repo-${i + 1}`,
        description: `Description ${i + 1}`,
        fork: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        stargazers_count: i,
        forks_count: i,
        language: 'JavaScript',
        default_branch: 'main',
      }))

      return HttpResponse.json({
        total_count: 1000,
        incomplete_results: false,
        items,
      })
    }

    // Default response
    return HttpResponse.json({
      total_count: 10,
      incomplete_results: false,
      items: [],
    })
  }),
]

/**
 * Handlers for GraphQL edge cases
 */
export const graphqlEdgeCaseHandlers = [
  // GraphQL errors
  http.post(`${GITHUB_API_BASE}/graphql`, async ({ request }) => {
    const body = (await request.json()) as { query: string; variables?: Record<string, unknown> }

    if (body.query.includes('invalidField')) {
      return HttpResponse.json(GRAPHQL_ERRORS.INVALID_FIELD, { status: 400 })
    }

    if (body.query.includes('syntaxError')) {
      return HttpResponse.json(GRAPHQL_ERRORS.SYNTAX_ERROR, { status: 400 })
    }

    // Default successful GraphQL response
    return HttpResponse.json({
      data: {
        viewer: {
          login: 'testuser',
          name: 'Test User',
        },
      },
    })
  }),
]

/**
 * Combined handlers for all edge case scenarios
 */
export const allEdgeCaseHandlers = [
  ...malformedResponseHandlers,
  ...serverErrorHandlers,
  ...validationErrorHandlers,
  ...rateLimitingHandlers,
  ...networkErrorHandlers,
  ...authenticationErrorHandlers,
  ...dataEdgeCaseHandlers,
  ...searchEdgeCaseHandlers,
  ...graphqlEdgeCaseHandlers,
]
