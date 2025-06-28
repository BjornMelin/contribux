/**
 * GitHub Rate Limiting Test Suite
 *
 * Comprehensive testing of rate limiting scenarios, throttling behavior,
 * retry logic, exponential backoff, and quota management.
 *
 * Test Coverage:
 * - Primary Rate Limit Handling (5000/hour)
 * - Secondary Rate Limits (abuse detection)
 * - Retry Logic and Exponential Backoff
 * - Rate Limit Header Processing
 * - Quota Management and Recovery
 */

import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { GitHubRateLimitError } from '@/lib/github/errors'
import { mswServer } from '../msw-setup'
import { rateLimitingHandlers, secondaryRateLimitHandlers } from './mocks/error-api-mocks'
import {
  createEdgeCaseClient,
  EDGE_CASE_PARAMS,
  RATE_LIMIT_EDGE_CASE_CONFIG,
  setupEdgeCaseTestIsolation,
} from './setup/edge-case-setup'
import {
  RetryFailureSimulator,
  testErrorPropagation,
  validateErrorResponse,
} from './utils/error-test-helpers'

describe('GitHub Rate Limiting', () => {
  // Setup MSW and enhanced test isolation
  setupEdgeCaseTestIsolation()

  describe('Primary Rate Limit Handling', () => {
    it('should handle 403 rate limit exceeded correctly', async () => {
      const client = createEdgeCaseClient()

      await testErrorPropagation(
        () => client.getRepository(EDGE_CASE_PARAMS.RATE_LIMITED),
        403,
        GitHubRateLimitError
      )
    })

    it('should parse rate limit headers correctly', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...rateLimitingHandlers)

      try {
        await client.getRepository({ owner: 'rate-limit-test', repo: 'primary-limit' })
        expect.fail('Should have thrown a rate limit error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        expect(error.message).toContain('rate limit exceeded')

        // Should include rate limit information
        if (error.response?.headers) {
          const limit = error.response.headers['x-ratelimit-limit']
          const remaining = error.response.headers['x-ratelimit-remaining']
          const reset = error.response.headers['x-ratelimit-reset']

          expect(limit).toBeDefined()
          expect(remaining).toBe('0')
          expect(reset).toBeDefined()
        }
      }
    })

    it('should handle rate limit with retry-after header', async () => {
      const client = createEdgeCaseClient()

      const retryAfter = 60 // seconds
      mswServer.use(
        http.get('https://api.github.com/repos/test/retry-after', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': '5000',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
                'Retry-After': String(retryAfter),
              },
            }
          )
        })
      )

      try {
        await client.getRepository({ owner: 'test', repo: 'retry-after' })
        expect.fail('Should have thrown a rate limit error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)

        if (error.response?.headers) {
          expect(error.response.headers['retry-after']).toBe(String(retryAfter))
        }
      }
    })

    it('should handle different rate limit types correctly', async () => {
      const client = createEdgeCaseClient()

      const rateLimitTypes = [
        { name: 'core', endpoint: 'core-rate-limit' },
        { name: 'search', endpoint: 'search-rate-limit' },
        { name: 'graphql', endpoint: 'graphql-rate-limit' },
      ]

      mswServer.use(...rateLimitingHandlers)

      for (const limitType of rateLimitTypes) {
        try {
          await client.getRepository({ owner: 'rate-limit-test', repo: limitType.endpoint })
          expect.fail(`Should have thrown a rate limit error for ${limitType.name}`)
        } catch (error) {
          validateErrorResponse(error)
          expect(error.status).toBe(403)
          expect(error.message).toContain('rate limit exceeded')
        }
      }
    })
  })

  describe('Secondary Rate Limits', () => {
    it('should handle secondary rate limit errors', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...secondaryRateLimitHandlers)

      try {
        await client.getRepository({ owner: 'secondary-limit-test', repo: 'abuse-detection' })
        expect.fail('Should have thrown a secondary rate limit error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        expect(error.message).toContain('secondary rate limit')
      }
    })

    it('should handle concurrent request throttling', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(...secondaryRateLimitHandlers)

      // Simulate concurrent requests that trigger secondary limits
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        client.getRepository({ owner: 'secondary-limit-test', repo: `concurrent-${i}` })
      )

      const results = await Promise.allSettled(concurrentRequests)

      // At least some should fail with secondary rate limits
      const failedResults = results.filter(r => r.status === 'rejected')
      expect(failedResults.length).toBeGreaterThan(0)

      failedResults.forEach(result => {
        if (result.status === 'rejected') {
          validateErrorResponse(result.reason)
          expect(result.reason.status).toBe(403)
        }
      })
    })

    it('should handle abuse detection mechanisms', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/abuse-test/detected', () => {
          return HttpResponse.json(
            {
              message: 'You have exceeded a secondary rate limit',
              documentation_url:
                'https://docs.github.com/rest/overview/resources-in-the-rest-api#secondary-rate-limits',
            },
            {
              status: 403,
              headers: {
                'X-RateLimit-Type': 'secondary',
                'Retry-After': '60',
              },
            }
          )
        })
      )

      try {
        await client.getRepository({ owner: 'abuse-test', repo: 'detected' })
        expect.fail('Should have thrown an abuse detection error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        expect(error.message).toContain('secondary rate limit')

        if (error.response?.headers) {
          expect(error.response.headers['x-ratelimit-type']).toBe('secondary')
          expect(error.response.headers['retry-after']).toBe('60')
        }
      }
    })
  })

  describe('Retry Logic and Exponential Backoff', () => {
    it('should implement exponential backoff for rate limits', async () => {
      const client = createEdgeCaseClient(RATE_LIMIT_EDGE_CASE_CONFIG)
      const _simulator = new RetryFailureSimulator()

      // Configure to retry rate limits
      const maxRetries = 3
      let attemptCount = 0

      mswServer.use(
        http.get('https://api.github.com/repos/retry-test/exponential-backoff', () => {
          attemptCount++

          if (attemptCount <= maxRetries) {
            return HttpResponse.json(
              { message: 'API rate limit exceeded' },
              {
                status: 403,
                headers: {
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
                  'Retry-After': '1', // Short retry for testing
                },
              }
            )
          }

          // Success after retries
          return HttpResponse.json({
            id: 123456,
            name: 'exponential-backoff',
            full_name: 'retry-test/exponential-backoff',
          })
        })
      )

      const startTime = Date.now()
      const repo = await client.getRepository({ owner: 'retry-test', repo: 'exponential-backoff' })
      const duration = Date.now() - startTime

      expect(repo).toBeDefined()
      expect(repo.name).toBe('exponential-backoff')
      expect(attemptCount).toBe(maxRetries + 1)

      // Should have taken some time due to retries
      expect(duration).toBeGreaterThan(100)
    })

    it('should respect maximum retry attempts', async () => {
      const client = createEdgeCaseClient({ ...RATE_LIMIT_EDGE_CASE_CONFIG, maxRetries: 2 })

      mswServer.use(
        http.get('https://api.github.com/repos/retry-test/max-retries', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            {
              status: 403,
              headers: {
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
            }
          )
        })
      )

      await expect(
        client.getRepository({ owner: 'retry-test', repo: 'max-retries' })
      ).rejects.toThrow(GitHubRateLimitError)
    })

    it('should handle rate limit recovery correctly', async () => {
      const client = createEdgeCaseClient()
      let isRateLimited = true

      mswServer.use(
        http.get('https://api.github.com/repos/recovery-test/rate-limit-recovery', () => {
          if (isRateLimited) {
            isRateLimited = false // Simulate recovery
            return HttpResponse.json(
              { message: 'API rate limit exceeded' },
              {
                status: 403,
                headers: {
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 1),
                },
              }
            )
          }

          return HttpResponse.json({
            id: 123456,
            name: 'rate-limit-recovery',
            full_name: 'recovery-test/rate-limit-recovery',
          })
        })
      )

      // First request should fail due to rate limit
      await expect(
        client.getRepository({ owner: 'recovery-test', repo: 'rate-limit-recovery' })
      ).rejects.toThrow(GitHubRateLimitError)

      // Wait for recovery simulation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Second request should succeed
      const repo = await client.getRepository({
        owner: 'recovery-test',
        repo: 'rate-limit-recovery',
      })
      expect(repo).toBeDefined()
      expect(repo.name).toBe('rate-limit-recovery')
    })
  })

  describe('Rate Limit Information Processing', () => {
    it('should extract and validate rate limit headers', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/headers-test/rate-limit-info', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': '5000',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
                'X-RateLimit-Used': '5000',
                'X-RateLimit-Resource': 'core',
              },
            }
          )
        })
      )

      try {
        await client.getRepository({ owner: 'headers-test', repo: 'rate-limit-info' })
        expect.fail('Should have thrown a rate limit error')
      } catch (error) {
        validateErrorResponse(error)

        if (error.response?.headers) {
          const headers = error.response.headers

          expect(headers['x-ratelimit-limit']).toBe('5000')
          expect(headers['x-ratelimit-remaining']).toBe('0')
          expect(headers['x-ratelimit-used']).toBe('5000')
          expect(headers['x-ratelimit-resource']).toBe('core')

          const resetTime = Number.parseInt(headers['x-ratelimit-reset'] || '0')
          expect(resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000))
        }
      }
    })

    it('should handle missing rate limit headers gracefully', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/missing-headers/rate-limit', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            { status: 403 } // No rate limit headers
          )
        })
      )

      try {
        await client.getRepository({ owner: 'missing-headers', repo: 'rate-limit' })
        expect.fail('Should have thrown a rate limit error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        // Should handle gracefully even without headers
      }
    })

    it('should handle malformed rate limit headers', async () => {
      const client = createEdgeCaseClient()

      mswServer.use(
        http.get('https://api.github.com/repos/malformed-headers/rate-limit', () => {
          return HttpResponse.json(
            { message: 'API rate limit exceeded' },
            {
              status: 403,
              headers: {
                'X-RateLimit-Limit': 'invalid_number',
                'X-RateLimit-Remaining': 'not_a_number',
                'X-RateLimit-Reset': 'invalid_timestamp',
              },
            }
          )
        })
      )

      try {
        await client.getRepository({ owner: 'malformed-headers', repo: 'rate-limit' })
        expect.fail('Should have thrown a rate limit error')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        // Should handle malformed headers gracefully
      }
    })
  })

  describe('Quota Management and Recovery', () => {
    it('should track quota consumption across requests', async () => {
      const client = createEdgeCaseClient()
      let remaining = 100

      mswServer.use(
        http.get('https://api.github.com/repos/quota-test/:repo', ({ params }) => {
          remaining -= 1

          if (remaining <= 0) {
            return HttpResponse.json(
              { message: 'API rate limit exceeded' },
              {
                status: 403,
                headers: {
                  'X-RateLimit-Limit': '100',
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
                },
              }
            )
          }

          return HttpResponse.json(
            {
              id: 123456,
              name: params.repo,
              full_name: `quota-test/${params.repo}`,
            },
            {
              headers: {
                'X-RateLimit-Limit': '100',
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
            }
          )
        })
      )

      // Make multiple requests to consume quota
      const repositories = []
      try {
        for (let i = 0; i < 105; i++) {
          const repo = await client.getRepository({ owner: 'quota-test', repo: `repo-${i}` })
          repositories.push(repo)
        }
        expect.fail('Should have hit rate limit')
      } catch (error) {
        validateErrorResponse(error)
        expect(error.status).toBe(403)
        expect(repositories.length).toBeLessThan(105)
        expect(repositories.length).toBeGreaterThan(90) // Should have made most requests
      }
    })

    it('should handle quota reset correctly', async () => {
      const client = createEdgeCaseClient()
      const resetTime = Math.floor(Date.now() / 1000) + 1 // Reset in 1 second
      let isAfterReset = false

      mswServer.use(
        http.get('https://api.github.com/repos/reset-test/quota-reset', () => {
          const currentTime = Math.floor(Date.now() / 1000)

          if (currentTime >= resetTime) {
            isAfterReset = true
          }

          if (!isAfterReset) {
            return HttpResponse.json(
              { message: 'API rate limit exceeded' },
              {
                status: 403,
                headers: {
                  'X-RateLimit-Limit': '5000',
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(resetTime),
                },
              }
            )
          }

          return HttpResponse.json(
            {
              id: 123456,
              name: 'quota-reset',
              full_name: 'reset-test/quota-reset',
            },
            {
              headers: {
                'X-RateLimit-Limit': '5000',
                'X-RateLimit-Remaining': '4999',
                'X-RateLimit-Reset': String(resetTime + 3600),
              },
            }
          )
        })
      )

      // First request should fail
      await expect(
        client.getRepository({ owner: 'reset-test', repo: 'quota-reset' })
      ).rejects.toThrow(GitHubRateLimitError)

      // Wait for reset time
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Second request should succeed after reset
      const repo = await client.getRepository({ owner: 'reset-test', repo: 'quota-reset' })
      expect(repo).toBeDefined()
      expect(repo.name).toBe('quota-reset')
    })

    it('should handle different resource types with separate quotas', async () => {
      const client = createEdgeCaseClient()

      const resourceTypes = ['core', 'search', 'graphql', 'integration_manifest']

      for (const resourceType of resourceTypes) {
        mswServer.use(
          http.get(`https://api.github.com/repos/resource-test/${resourceType}-quota`, () => {
            return HttpResponse.json(
              { message: 'API rate limit exceeded' },
              {
                status: 403,
                headers: {
                  'X-RateLimit-Resource': resourceType,
                  'X-RateLimit-Limit': resourceType === 'search' ? '30' : '5000',
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
                },
              }
            )
          })
        )

        try {
          await client.getRepository({ owner: 'resource-test', repo: `${resourceType}-quota` })
          expect.fail(`Should have thrown a rate limit error for ${resourceType}`)
        } catch (error) {
          validateErrorResponse(error)
          expect(error.status).toBe(403)

          if (error.response?.headers) {
            expect(error.response.headers['x-ratelimit-resource']).toBe(resourceType)
          }
        }
      }
    })
  })
})
