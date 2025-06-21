import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import { GitHubRateLimitError } from '@/lib/github'
import type { GitHubClientConfig, RateLimitInfo, GraphQLRateLimitInfo } from '@/lib/github'
import type { RateLimitState } from '@/lib/github/rate-limiting'

// Type guard functions
function isRateLimitInfo(obj: unknown): obj is RateLimitInfo {
  return typeof obj === 'object' && obj !== null && 
    'limit' in obj && 'remaining' in obj && 'reset' in obj && 'used' in obj
}

function isRateLimitState(obj: unknown): obj is RateLimitState {
  return typeof obj === 'object' && obj !== null && 'core' in obj
}

function isGraphQLResponse(obj: unknown): obj is { viewer: { login: string }; rateLimit: GraphQLRateLimitInfo } {
  return typeof obj === 'object' && obj !== null && 
    'viewer' in obj && 'rateLimit' in obj
}

function isRateLimitStatus(obj: unknown): obj is { resources: { core: RateLimitInfo; search: RateLimitInfo; graphql: RateLimitInfo } } {
  return typeof obj === 'object' && obj !== null && 'resources' in obj
}

describe('GitHub Rate Limiting', () => {
  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('REST API rate limiting', () => {
    it('should track rate limit headers from responses', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600

      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser' }, {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': resetTime.toString(),
          'x-ratelimit-used': '1',
          'x-ratelimit-resource': 'core'
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: { enabled: false } // Ensure no cache is used
      })

      await client.rest.users.getAuthenticated()
      
      // Allow time for hooks to process
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // The rate limit manager updates from response headers
      const rateLimitInfo = client.getRateLimitInfo()
      
      // Type guard and assertions
      expect(isRateLimitState(rateLimitInfo)).toBe(true)
      if (isRateLimitState(rateLimitInfo)) {
        expect(isRateLimitInfo(rateLimitInfo.core)).toBe(true)
        if (isRateLimitInfo(rateLimitInfo.core)) {
          expect(rateLimitInfo.core.limit).toBe(5000)
          expect(rateLimitInfo.core.remaining).toBe(4999)
          expect(rateLimitInfo.core.used).toBe(1)
          expect(rateLimitInfo.core.reset.getTime()).toBeGreaterThan(Date.now())
        }
      }
    })

    it('should handle rate limit exceeded (403) errors', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600

      nock('https://api.github.com')
        .get('/user')
        .reply(403, {
          message: 'API rate limit exceeded',
          documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting'
        }, {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': resetTime.toString(),
          'x-ratelimit-used': '5000'
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          enabled: true,
          onRateLimit: () => false // Don't retry
        }
      })

      await expect(client.rest.users.getAuthenticated()).rejects.toThrow()
    })

    it('should retry with exponential backoff when rate limited', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 1 // Reset in 1 second
      let requestCount = 0

      nock('https://api.github.com')
        .get('/user')
        .times(2)
        .reply(() => {
          requestCount++
          if (requestCount === 1) {
            return [403, {
              message: 'API rate limit exceeded',
              documentation_url: 'https://docs.github.com/rest'
            }, {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': resetTime.toString()
            }]
          }
          return [200, { login: 'testuser' }, {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999'
          }]
        })

      const onRateLimit = vi.fn().mockReturnValue(true)
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          enabled: true,
          onRateLimit
        }
      })

      const result = await client.rest.users.getAuthenticated()
      expect(result.data.login).toBe('testuser')
      expect(requestCount).toBe(2)
      expect(onRateLimit).toHaveBeenCalled()
    })

    it('should handle secondary rate limits', async () => {
      const retryAfter = 60 // seconds

      nock('https://api.github.com')
        .post('/repos/testowner/testrepo/issues')
        .reply(403, {
          message: 'You have exceeded a secondary rate limit',
          documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#secondary-rate-limits'
        }, {
          'retry-after': retryAfter.toString()
        })

      const onSecondaryRateLimit = vi.fn().mockReturnValue(false)
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          enabled: true,
          onSecondaryRateLimit
        }
      })

      await expect(client.rest.issues.create({
        owner: 'testowner',
        repo: 'testrepo',
        title: 'Test Issue'
      })).rejects.toThrow()

      expect(onSecondaryRateLimit).toHaveBeenCalledWith(
        retryAfter,
        expect.any(Object),
        expect.any(Object),
        expect.any(Number)
      )
    })

    it('should queue requests when approaching rate limit', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600
      let remaining = 10

      nock('https://api.github.com')
        .persist()
        .get('/user')
        .reply(() => {
          const currentRemaining = remaining--
          return [200, { login: 'testuser' }, {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': currentRemaining.toString(),
            'x-ratelimit-reset': resetTime.toString()
          }]
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          enabled: true,
          minimumSecondaryRateRetryAfter: 100
        }
      })

      // Make multiple concurrent requests
      const promises = Array(15).fill(null).map(() => 
        client.rest.users.getAuthenticated()
      )

      const results = await Promise.all(promises)
      expect(results).toHaveLength(15)
      expect(results.every(r => r.data.login === 'testuser')).toBe(true)
    })
  })

  describe('GraphQL rate limiting', () => {
    it('should track GraphQL rate limit info from responses', async () => {
      const resetTime = new Date(Date.now() + 3600000).toISOString()

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, {
          data: {
            viewer: { login: 'testuser' },
            rateLimit: {
              limit: 5000,
              cost: 1,
              remaining: 4999,
              resetAt: resetTime,
              nodeCount: 10
            }
          }
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = `
        query {
          viewer { login }
          rateLimit {
            limit
            cost
            remaining
            resetAt
            nodeCount
          }
        }
      `

      const result = await client.graphql(query)
      
      // Type guard and assertions
      expect(isGraphQLResponse(result)).toBe(true)
      if (isGraphQLResponse(result)) {
        expect(result.viewer.login).toBe('testuser')
        expect(result.rateLimit.limit).toBe(5000)
        expect(result.rateLimit.cost).toBe(1)
        expect(result.rateLimit.remaining).toBe(4999)
        expect(result.rateLimit.nodeCount).toBe(10)
      }
    })

    it('should calculate GraphQL query complexity', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const simpleQuery = `query { viewer { login } }`
      const complexQuery = `
        query {
          repository(owner: "octocat", name: "hello-world") {
            issues(first: 100) {
              edges {
                node {
                  title
                  comments(first: 50) {
                    edges {
                      node { body }
                    }
                  }
                }
              }
            }
          }
        }
      `

      const simpleComplexity = client.calculateGraphQLComplexity(simpleQuery)
      const complexComplexity = client.calculateGraphQLComplexity(complexQuery)

      expect(simpleComplexity).toBeLessThan(10)
      expect(complexComplexity).toBeGreaterThan(100)
    })

    it('should prevent queries exceeding 500,000 node limit', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const massiveQuery = `
        query {
          search(query: "stars:>1", type: REPOSITORY, first: 100) {
            edges {
              node {
                ... on Repository {
                  issues(first: 100) {
                    edges {
                      node {
                        comments(first: 100) {
                          edges { node { id } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `

      await expect(client.executeGraphQLWithPointCheck(massiveQuery))
        .rejects.toThrow('Query exceeds maximum node count')
    })

    it('should split large queries to stay under point limit', async () => {
      let callCount = 0
      
      nock('https://api.github.com')
        .post('/graphql')
        .times(2)
        .reply(() => {
          callCount++
          if (callCount === 1) {
            return [200, {
              data: {
                repository: {
                  issues: {
                    edges: Array(50).fill({ node: { title: 'Issue' } }),
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: 'cursor1'
                    }
                  }
                }
              }
            }]
          }
          return [200, {
            data: {
              repository: {
                issues: {
                  edges: Array(50).fill({ node: { title: 'Issue' } }),
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: 'cursor2'
                  }
                }
              }
            }
          }]
        })

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      const query = `
        query($cursor: String) {
          repository(owner: "octocat", name: "hello-world") {
            issues(first: 100, after: $cursor) {
              edges { node { title } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `

      const results = await client.paginateGraphQLQuery(query, {}, 50)
      expect(results).toHaveLength(100)
      expect(callCount).toBe(2)
    })
  })

  describe('Rate limit monitoring', () => {
    it('should provide rate limit status across all resources', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      nock('https://api.github.com')
        .get('/rate_limit')
        .reply(200, {
          resources: {
            core: {
              limit: 5000,
              remaining: 4999,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 1
            },
            search: {
              limit: 30,
              remaining: 30,
              reset: Math.floor(Date.now() / 1000) + 60,
              used: 0
            },
            graphql: {
              limit: 5000,
              remaining: 5000,
              reset: Math.floor(Date.now() / 1000) + 3600,
              used: 0
            }
          },
          rate: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1
          }
        })

      const status = await client.getRateLimitStatus()
      
      // Type guard and assertions
      expect(isRateLimitStatus(status)).toBe(true)
      if (isRateLimitStatus(status)) {
        expect(status.resources.core.limit).toBe(5000)
        expect(status.resources.search.limit).toBe(30)
        expect(status.resources.graphql.limit).toBe(5000)
      }
    })

    it('should emit rate limit warnings when approaching limits', async () => {
      const onRateLimitWarning = vi.fn()
      
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        throttle: {
          enabled: true,
          onRateLimitWarning
        },
        cache: { enabled: false } // Disable cache to ensure request is made
      })

      nock('https://api.github.com')
        .get('/user')
        .reply(200, { login: 'testuser' }, {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '100',
          'x-ratelimit-reset': (Math.floor(Date.now() / 1000) + 3600).toString(),
          'x-ratelimit-resource': 'core'
        })

      await client.rest.users.getAuthenticated()
      expect(onRateLimitWarning).toHaveBeenCalledWith({
        resource: 'core',
        limit: 5000,
        remaining: 100,
        percentageUsed: 98
      })
    })

    it('should implement jitter in retry delays', async () => {
      const delays: number[] = []
      const baseDelay = 1000

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' }
      })

      // Capture multiple jittered delays
      for (let i = 0; i < 10; i++) {
        const delay = client.calculateRetryDelay(i, baseDelay)
        delays.push(delay)
      }

      // Check that delays have jitter (not all identical)
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)

      // Check exponential backoff pattern (with consideration for max cap)
      const delay0 = delays[0]
      const delay2 = delays[2]
      const delay4 = delays[4]
      
      expect(delay0).toBeDefined()
      expect(delay2).toBeDefined()
      expect(delay4).toBeDefined()
      
      if (delay0 !== undefined && delay2 !== undefined && delay4 !== undefined) {
        expect(delay0).toBeLessThan(delay2)
        expect(delay2).toBeLessThan(delay4)
      }
      
      // Check max cap is applied
      const maxDelay = Math.max(...delays.filter((d): d is number => d !== undefined))
      expect(maxDelay).toBeLessThanOrEqual(30000)
    })
  })
})