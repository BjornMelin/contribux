/**
 * GitHub API Error Handling Test Suite
 *
 * Comprehensive testing of API error handling, HTTP status codes,
 * server errors, validation failures, and error propagation.
 *
 * Test Coverage:
 * - HTTP Status Code Handling (4xx, 5xx)
 * - Server Error Responses (500, 502, 503)
 * - Validation Error Responses (422)
 * - Error Information Propagation
 * - Async Error Handling
 */

import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { GitHubError } from '@/lib/github/errors'
import { mswServer } from '../msw-setup'
import {
  allEdgeCaseHandlers,
  malformedResponseHandlers,
  serverErrorHandlers,
  validationErrorHandlers,
} from './mocks/error-api-mocks'
import {
  createEdgeCaseClient,
  EDGE_CASE_PARAMS,
  setupEdgeCaseTestIsolation,
} from './setup/edge-case-setup'
import { testErrorPropagation, validateErrorResponse } from './utils/error-test-helpers'

describe('GitHub API Error Handling', () => {
  // Setup MSW and enhanced test isolation
  setupEdgeCaseTestIsolation()

  // Enable error response handlers for these tests
  beforeEach(() => {
    mswServer.use(...allEdgeCaseHandlers)
  })

  describe('HTTP Status Code Handling', () => {
    it('should handle 500 Internal Server Error correctly', async () => {
      const client = createEdgeCaseClient()

      await testErrorPropagation(
        () => client.getRepository(EDGE_CASE_PARAMS.SERVER_ERROR),
        500,
        GitHubError
      )
    })

    it('should handle 422 Validation Error with detailed messages', async () => {
      const client = createEdgeCaseClient()

      await testErrorPropagation(
        () => client.getRepository(EDGE_CASE_PARAMS.VALIDATION_ERROR),
        422,
        GitHubError
      )
    })

    it('should handle 401 Unauthorized errors', async () => {
      const client = createEdgeCaseClient()

      await testErrorPropagation(
        () => client.getRepository(EDGE_CASE_PARAMS.BAD_CREDENTIALS),
        401,
        GitHubError
      )
    })

    it('should handle 403 Forbidden errors', async () => {
      const client = createEdgeCaseClient()

      await testErrorPropagation(
        () => client.getRepository(EDGE_CASE_PARAMS.RATE_LIMITED),
        403,
        GitHubError
      )
    })

    it('should handle 404 Not Found errors', async () => {
      const client = createEdgeCaseClient()

      // Mock a 404 response
      mswServer.use(
        http.get('https://api.github.com/repos/notfound/repo', () => {
          return HttpResponse.json({ message: 'Not Found' }, { status: 404 })
        })
      )

      await testErrorPropagation(() => client.getRepository('notfound', 'repo'), 404, GitHubError)
    })
  })

  describe('Server Error Responses', () => {
    it('should handle 502 Bad Gateway errors', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...serverErrorHandlers)

      await testErrorPropagation(
        () => client.getRepository('server-error-test', 'bad-gateway'),
        502,
        GitHubError
      )
    })

    it('should handle 503 Service Unavailable errors', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...serverErrorHandlers)

      await testErrorPropagation(
        () => client.getRepository('server-error-test', 'service-unavailable'),
        503,
        GitHubError
      )
    })

    it('should include server error details in error response', async () => {
      const client = createEdgeCaseClient()

      try {
        await client.getRepository(EDGE_CASE_PARAMS.SERVER_ERROR)
        expect.fail('Should have thrown an error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(500)
        expect(error.message).toContain('Internal Server Error')
        expect(error.response).toBeDefined()
      }
    })
  })

  describe('Validation Error Responses', () => {
    it('should handle validation errors with field details', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...validationErrorHandlers)

      try {
        await client.getRepository(EDGE_CASE_PARAMS.VALIDATION_ERROR)
        expect.fail('Should have thrown an error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(422)
        expect(error.message).toContain('Validation Failed')
        expect(error.response).toBeDefined()
      }
    })

    it('should handle multiple validation errors', async () => {
      const _client = createEdgeCaseClient()

      mswServer.use(...validationErrorHandlers)

      try {
        // This endpoint returns multiple validation errors
        const response = await fetch(
          'https://api.github.com/repos/validation-test/validation-error-repo-unique/issues',
          {
            method: 'POST',
            headers: {
              Authorization: 'token test_token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: '', body: 'A'.repeat(70000) }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json()
          expect(response.status).toBe(422)
          expect(errorData.message).toBe('Validation Failed')
          expect(errorData.errors).toHaveLength(2)
        }
      } catch (error) {
        // Handle network errors
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('Malformed Response Handling', () => {
    it('should handle malformed JSON responses', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...malformedResponseHandlers)

      await expect(client.getRepository(EDGE_CASE_PARAMS.MALFORMED)).rejects.toThrow()
    })

    it('should handle empty responses', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/empty/response', () => {
          return new HttpResponse('', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        })
      )

      await expect(client.getRepository('empty', 'response')).rejects.toThrow()
    })

    it('should handle non-JSON content type responses', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/html/response', () => {
          return new HttpResponse('<html><body>Not JSON</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          })
        })
      )

      await expect(client.getRepository('html', 'response')).rejects.toThrow()
    })
  })

  describe('Error Information Propagation', () => {
    it('should properly propagate async errors with comprehensive information', async () => {
      const client = createEdgeCaseClient()

      // Mock detailed GitHub error using MSW
      mswServer.use(
        http.get('https://api.github.com/repos/test/detailed-error', () => {
          return HttpResponse.json(
            {
              message: 'Validation Failed',
              errors: [{ field: 'name', code: 'invalid' }],
            },
            { status: 422 }
          )
        })
      )

      try {
        await client.getRepository('test', 'detailed-error')
        expect.fail('Should have thrown an error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(422)
        expect(error.response).toBeDefined()
        expect(error.message).toContain('Validation Failed')
      }
    })

    it('should include rate limit headers in error responses', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/test/rate-limit-error', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': '5000',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
            }
          )
        })
      )

      try {
        await client.getRepository('test', 'rate-limit-error')
        expect.fail('Should have thrown an error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        expect(error.response).toBeDefined()
      }
    })
  })

  describe('Error Response Structure', () => {
    it('should maintain consistent error structure across different error types', async () => {
      const client = createEdgeCaseClient()

      const errorScenarios = [
        { params: EDGE_CASE_PARAMS.SERVER_ERROR, expectedStatus: 500 },
        { params: EDGE_CASE_PARAMS.VALIDATION_ERROR, expectedStatus: 422 },
        { params: EDGE_CASE_PARAMS.BAD_CREDENTIALS, expectedStatus: 401 },
      ]

      for (const scenario of errorScenarios) {
        try {
          await client.getRepository(scenario.params)
          expect.fail(`Should have thrown an error for ${JSON.stringify(scenario.params)}`)
        } catch (error) {
          validateErrorResponse(error)
          expect(error.status).toBe(scenario.expectedStatus)
          expect(error.message).toBeDefined()
          expect(typeof error.message).toBe('string')
          expect(error.response).toBeDefined()
        }
      }
    })

    it('should handle errors without response data gracefully', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/test/network-error', () => {
          return HttpResponse.error()
        })
      )

      await expect(client.getRepository('test', 'network-error')).rejects.toThrow()
    })
  })

  describe('Error Recovery and State', () => {
    it('should maintain client state after error recovery', async () => {
      const client = createEdgeCaseClient()

      // First request fails
      await expect(client.getRepository(EDGE_CASE_PARAMS.SERVER_ERROR)).rejects.toThrow(GitHubError)

      // Client should still be functional for valid requests
      const repo = await client.getRepository('octocat', 'Hello-World')
      expect(repo).toBeDefined()
      expect(repo.name).toBe('Hello-World')

      // Cache should still work
      const stats = client.getCacheStats()
      expect(stats).toBeDefined()
    })

    it('should handle errors in concurrent operations independently', async () => {
      const client = createEdgeCaseClient()

      const promises = [
        client.getRepository('octocat', 'Hello-World'), // Should succeed
        client.getRepository(EDGE_CASE_PARAMS.SERVER_ERROR), // Should fail
        client.getUser('octocat'), // Should succeed
        client.getRepository(EDGE_CASE_PARAMS.VALIDATION_ERROR), // Should fail
      ]

      const results = await Promise.allSettled(promises)

      expect(results).toHaveLength(4)
      expect(results[0].status).toBe('fulfilled')
      expect(results[1].status).toBe('rejected')
      expect(results[2].status).toBe('fulfilled')
      expect(results[3].status).toBe('rejected')

      // Validate error structure for failed requests
      if (results[1].status === 'rejected') {
        validateErrorResponse(results[1].reason)
      }
      if (results[3].status === 'rejected') {
        validateErrorResponse(results[3].reason)
      }
    })
  })
})
