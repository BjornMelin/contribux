import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimitManager } from '@/lib/github/rate-limiting'
import type { RateLimitInfo, GraphQLRateLimitInfo } from '@/lib/github'

describe('Rate Limiting - Comprehensive Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('RateLimitManager Class', () => {
    describe('Rate Limit State Management', () => {
      it('should initialize with empty state', () => {
        const manager = new RateLimitManager()
        const state = manager.getState()
        
        expect(state).toEqual({})
      })

      it('should update rate limits from headers', () => {
        const manager = new RateLimitManager()
        
        const headers = {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1640995200', // Unix timestamp
          'x-ratelimit-used': '1',
          'x-ratelimit-resource': 'core'
        }
        
        manager.updateFromHeaders(headers, 'core')
        
        const state = manager.getState()
        expect(state.core).toBeDefined()
        expect(state.core.limit).toBe(5000)
        expect(state.core.remaining).toBe(4999)
        expect(state.core.used).toBe(1)
      })

      it('should handle malformed rate limit headers', () => {
        const manager = new RateLimitManager()
        
        const malformedHeaders = {
          'x-ratelimit-limit': 'invalid',
          'x-ratelimit-remaining': '',
          'x-ratelimit-reset': 'not-a-number',
          'x-ratelimit-used': undefined as unknown as string
        }
        
        expect(() => {
          manager.updateFromHeaders(malformedHeaders, 'core')
        }).not.toThrow()
        
        const state = manager.getState()
        expect(state.core?.limit).toBe(0) // Should default to 0 for invalid values
      })

      it('should update from GraphQL response', () => {
        const manager = new RateLimitManager()
        
        const graphqlRateLimit: GraphQLRateLimitInfo = {
          limit: 5000,
          remaining: 4990,
          resetAt: new Date('2024-01-01T00:00:00Z'),
          used: 10,
          cost: 1
        }
        
        manager.updateFromGraphQLResponse(graphqlRateLimit)
        
        const state = manager.getState()
        expect(state.graphql).toBeDefined()
        expect(state.graphql.limit).toBe(5000)
        expect(state.graphql.remaining).toBe(4990)
        expect(state.graphql.used).toBe(10)
      })

      it('should handle GraphQL response with missing fields', () => {
        const manager = new RateLimitManager()
        
        const partialGraphqlRateLimit = {
          limit: 5000,
          remaining: 4990
          // Missing other fields
        } as GraphQLRateLimitInfo
        
        expect(() => {
          manager.updateFromGraphQLResponse(partialGraphqlRateLimit)
        }).not.toThrow()
        
        const state = manager.getState()
        expect(state.graphql?.limit).toBe(5000)
        expect(state.graphql?.remaining).toBe(4990)
      })
    })

    describe('Rate Limit Calculations', () => {
      it('should calculate percentage used correctly', () => {
        const manager = new RateLimitManager()
        
        const headers = {
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '200',
          'x-ratelimit-used': '800'
        }
        
        manager.updateFromHeaders(headers, 'core')
        
        const percentage = manager.getPercentageUsed('core')
        expect(percentage).toBe(80) // 800/1000 * 100
      })

      it('should handle zero limit when calculating percentage', () => {
        const manager = new RateLimitManager()
        
        const headers = {
          'x-ratelimit-limit': '0',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-used': '0'
        }
        
        manager.updateFromHeaders(headers, 'core')
        
        const percentage = manager.getPercentageUsed('core')
        expect(percentage).toBe(0) // Should handle division by zero
      })

      it('should return 0 percentage for unknown resource', () => {
        const manager = new RateLimitManager()
        
        const percentage = manager.getPercentageUsed('unknown-resource')
        expect(percentage).toBe(0)
      })

      it('should check if rate limit is exceeded', () => {
        const manager = new RateLimitManager()
        
        // Not exceeded
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '100'
        }, 'core')
        
        expect(manager.isRateLimitExceeded('core')).toBe(false)
        
        // Exceeded
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '0'
        }, 'core')
        
        expect(manager.isRateLimitExceeded('core')).toBe(true)
      })

      it('should return false for unknown resource when checking exceeded', () => {
        const manager = new RateLimitManager()
        
        expect(manager.isRateLimitExceeded('unknown')).toBe(false)
      })

      it('should calculate time until reset', () => {
        const manager = new RateLimitManager()
        
        const resetTime = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': resetTime.toString()
        }, 'core')
        
        const timeUntilReset = manager.getTimeUntilReset('core')
        expect(timeUntilReset).toBeGreaterThan(3590000) // Close to 1 hour in ms
        expect(timeUntilReset).toBeLessThanOrEqual(3600000)
      })

      it('should return 0 for past reset time', () => {
        const manager = new RateLimitManager()
        
        const pastResetTime = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '1000',
          'x-ratelimit-reset': pastResetTime.toString()
        }, 'core')
        
        const timeUntilReset = manager.getTimeUntilReset('core')
        expect(timeUntilReset).toBe(0)
      })

      it('should return 0 for unknown resource reset time', () => {
        const manager = new RateLimitManager()
        
        const timeUntilReset = manager.getTimeUntilReset('unknown')
        expect(timeUntilReset).toBe(0)
      })
    })

    describe('Rate Limit Warnings and Monitoring', () => {
      it('should determine if rate limit warning should be shown', () => {
        const manager = new RateLimitManager()
        
        // Not approaching limit
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '900',
          'x-ratelimit-used': '100'
        }, 'core')
        
        expect(manager.shouldWarnAboutRateLimit('core')).toBe(false)
        
        // Approaching limit (>90% used)
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '50',
          'x-ratelimit-used': '950'
        }, 'core')
        
        expect(manager.shouldWarnAboutRateLimit('core')).toBe(true)
      })

      it('should use custom warning threshold', () => {
        const manager = new RateLimitManager()
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '300',
          'x-ratelimit-used': '700'
        }, 'core')
        
        expect(manager.shouldWarnAboutRateLimit('core', 0.8)).toBe(false) // 70% < 80%
        expect(manager.shouldWarnAboutRateLimit('core', 0.6)).toBe(true) // 70% > 60%
      })

      it('should return false for unknown resource warning', () => {
        const manager = new RateLimitManager()
        
        expect(manager.shouldWarnAboutRateLimit('unknown')).toBe(false)
      })

      it('should get all rate limit statuses', () => {
        const manager = new RateLimitManager()
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4000'
        }, 'core')
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '500'
        }, 'search')
        
        const allStatuses = manager.getAllRateLimitStatuses()
        
        expect(allStatuses).toHaveProperty('core')
        expect(allStatuses).toHaveProperty('search')
        expect(allStatuses.core.percentageUsed).toBe(20) // (5000-4000)/5000 * 100
        expect(allStatuses.search.percentageUsed).toBe(50) // (1000-500)/1000 * 100
      })
    })

    describe('Multiple Resource Management', () => {
      it('should track multiple rate limit resources independently', () => {
        const manager = new RateLimitManager()
        
        // Update different resources
        manager.updateFromHeaders({
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4000'
        }, 'core')
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '30',
          'x-ratelimit-remaining': '25'
        }, 'search')
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '10'
        }, 'integration_manifest')
        
        const state = manager.getState()
        
        expect(Object.keys(state)).toHaveLength(3)
        expect(state.core.limit).toBe(5000)
        expect(state.search.limit).toBe(30)
        expect(state.integration_manifest.limit).toBe(100)
        
        // Each resource should have independent percentage calculations
        expect(manager.getPercentageUsed('core')).toBe(20) // 1000/5000
        expect(manager.getPercentageUsed('search')).toBe(16.67) // 5/30
        expect(manager.getPercentageUsed('integration_manifest')).toBe(90) // 90/100
      })

      it('should handle updates to existing resources', () => {
        const manager = new RateLimitManager()
        
        // Initial state
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '900'
        }, 'core')
        
        expect(manager.getPercentageUsed('core')).toBe(10)
        
        // Update the same resource
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '500'
        }, 'core')
        
        expect(manager.getPercentageUsed('core')).toBe(50)
      })
    })

    describe('Edge Cases and Error Handling', () => {
      it('should handle negative remaining values', () => {
        const manager = new RateLimitManager()
        
        const headers = {
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '-10', // Negative value
          'x-ratelimit-used': '1010'
        }
        
        expect(() => {
          manager.updateFromHeaders(headers, 'core')
        }).not.toThrow()
        
        const state = manager.getState()
        expect(state.core.remaining).toBe(-10) // Should preserve the value
        expect(manager.isRateLimitExceeded('core')).toBe(true)
      })

      it('should handle very large numbers', () => {
        const manager = new RateLimitManager()
        
        const headers = {
          'x-ratelimit-limit': Number.MAX_SAFE_INTEGER.toString(),
          'x-ratelimit-remaining': (Number.MAX_SAFE_INTEGER - 1).toString(),
          'x-ratelimit-used': '1'
        }
        
        expect(() => {
          manager.updateFromHeaders(headers, 'core')
        }).not.toThrow()
        
        const percentage = manager.getPercentageUsed('core')
        expect(percentage).toBeCloseTo(0, 10) // Should be very close to 0
      })

      it('should handle missing headers gracefully', () => {
        const manager = new RateLimitManager()
        
        const incompleteHeaders = {
          'x-ratelimit-limit': '1000'
          // Missing other headers
        }
        
        expect(() => {
          manager.updateFromHeaders(incompleteHeaders, 'core')
        }).not.toThrow()
        
        const state = manager.getState()
        expect(state.core.limit).toBe(1000)
        expect(state.core.remaining).toBe(0) // Default value
      })

      it('should handle empty headers object', () => {
        const manager = new RateLimitManager()
        
        expect(() => {
          manager.updateFromHeaders({}, 'core')
        }).not.toThrow()
        
        const state = manager.getState()
        expect(state.core?.limit).toBe(0)
      })

      it('should handle null and undefined values', () => {
        const manager = new RateLimitManager()
        
        const headersWithNulls = {
          'x-ratelimit-limit': null as unknown as string,
          'x-ratelimit-remaining': undefined as unknown as string,
          'x-ratelimit-used': '' as string
        }
        
        expect(() => {
          manager.updateFromHeaders(headersWithNulls, 'core')
        }).not.toThrow()
      })

      it('should handle very long resource names', () => {
        const manager = new RateLimitManager()
        
        const longResourceName = 'a'.repeat(1000)
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '500'
        }, longResourceName)
        
        const state = manager.getState()
        expect(state[longResourceName]).toBeDefined()
        expect(manager.getPercentageUsed(longResourceName)).toBe(50)
      })

      it('should handle special characters in resource names', () => {
        const manager = new RateLimitManager()
        
        const specialResourceName = 'resource-with.special$chars_123!'
        
        manager.updateFromHeaders({
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '25'
        }, specialResourceName)
        
        const state = manager.getState()
        expect(state[specialResourceName]).toBeDefined()
        expect(manager.getPercentageUsed(specialResourceName)).toBe(75)
      })
    })

    describe('Reset Time Handling', () => {
      it('should handle various reset time formats', () => {
        const manager = new RateLimitManager()
        
        // Unix timestamp as string
        const futureTimestamp = Math.floor(Date.now() / 1000) + 3600
        manager.updateFromHeaders({
          'x-ratelimit-reset': futureTimestamp.toString()
        }, 'core')
        
        let timeUntilReset = manager.getTimeUntilReset('core')
        expect(timeUntilReset).toBeGreaterThan(0)
        
        // Invalid timestamp should default to 0
        manager.updateFromHeaders({
          'x-ratelimit-reset': 'invalid-timestamp'
        }, 'search')
        
        timeUntilReset = manager.getTimeUntilReset('search')
        expect(timeUntilReset).toBe(0)
      })

      it('should handle reset time exactly at current time', () => {
        const manager = new RateLimitManager()
        
        const currentTimestamp = Math.floor(Date.now() / 1000)
        manager.updateFromHeaders({
          'x-ratelimit-reset': currentTimestamp.toString()
        }, 'core')
        
        const timeUntilReset = manager.getTimeUntilReset('core')
        expect(timeUntilReset).toBeLessThanOrEqual(1000) // Should be very close to 0
      })
    })

    describe('GraphQL Rate Limit Specifics', () => {
      it('should handle GraphQL rate limit with cost information', () => {
        const manager = new RateLimitManager()
        
        const graphqlRateLimit: GraphQLRateLimitInfo = {
          limit: 5000,
          remaining: 4950,
          resetAt: new Date(Date.now() + 3600000), // 1 hour from now
          used: 50,
          cost: 10
        }
        
        manager.updateFromGraphQLResponse(graphqlRateLimit)
        
        const state = manager.getState()
        expect(state.graphql.limit).toBe(5000)
        expect(state.graphql.remaining).toBe(4950)
        expect(state.graphql.used).toBe(50)
        expect(state.graphql.reset).toBeInstanceOf(Date)
      })

      it('should handle GraphQL rate limit with Date object', () => {
        const manager = new RateLimitManager()
        
        const resetDate = new Date(Date.now() + 7200000) // 2 hours from now
        const graphqlRateLimit: GraphQLRateLimitInfo = {
          limit: 5000,
          remaining: 3000,
          resetAt: resetDate,
          used: 2000,
          cost: 5
        }
        
        manager.updateFromGraphQLResponse(graphqlRateLimit)
        
        const timeUntilReset = manager.getTimeUntilReset('graphql')
        expect(timeUntilReset).toBeGreaterThan(7190000) // Close to 2 hours
        expect(timeUntilReset).toBeLessThanOrEqual(7200000)
      })

      it('should handle GraphQL rate limit with string date', () => {
        const manager = new RateLimitManager()
        
        const graphqlRateLimit = {
          limit: 5000,
          remaining: 4000,
          resetAt: new Date(Date.now() + 1800000).toISOString(), // 30 minutes from now as ISO string
          used: 1000,
          cost: 1
        } as GraphQLRateLimitInfo
        
        manager.updateFromGraphQLResponse(graphqlRateLimit)
        
        const state = manager.getState()
        expect(state.graphql.reset).toBeInstanceOf(Date)
        
        const timeUntilReset = manager.getTimeUntilReset('graphql')
        expect(timeUntilReset).toBeGreaterThan(1790000) // Close to 30 minutes
      })
    })

    describe('Memory and Performance', () => {
      it('should handle many resource updates efficiently', () => {
        const manager = new RateLimitManager()
        
        // Add many different resources
        for (let i = 0; i < 100; i++) {
          manager.updateFromHeaders({
            'x-ratelimit-limit': '1000',
            'x-ratelimit-remaining': (1000 - i).toString(),
            'x-ratelimit-used': i.toString()
          }, `resource-${i}`)
        }
        
        const state = manager.getState()
        expect(Object.keys(state)).toHaveLength(100)
        
        // Should still perform well with many resources
        const startTime = Date.now()
        for (let i = 0; i < 100; i++) {
          manager.getPercentageUsed(`resource-${i}`)
          manager.isRateLimitExceeded(`resource-${i}`)
          manager.shouldWarnAboutRateLimit(`resource-${i}`)
        }
        const endTime = Date.now()
        
        expect(endTime - startTime).toBeLessThan(100) // Should be fast
      })

      it('should handle rapid updates to same resource', () => {
        const manager = new RateLimitManager()
        
        // Rapidly update the same resource
        for (let i = 0; i < 1000; i++) {
          manager.updateFromHeaders({
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': (5000 - i).toString(),
            'x-ratelimit-used': i.toString()
          }, 'core')
        }
        
        const state = manager.getState()
        expect(state.core.used).toBe(999)
        expect(state.core.remaining).toBe(4001)
      })
    })
  })
})