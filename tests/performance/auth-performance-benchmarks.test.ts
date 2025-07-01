/**
 * NextAuth.js v5 Performance Benchmarks
 * Comprehensive performance testing for authentication operations, token refresh, session management
 */

import { performance } from 'node:perf_hooks'
import type { MockedFunction } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authConfig } from '@/lib/auth/config'
import {
  type AuthenticationStateManager,
  createMockJWT,
  createMockSession,
  type DatabaseMockHelper,
  OAuthFlowSimulator,
  PerformanceTestHelper,
  setupAuthTestEnvironment,
} from '../utils/auth-test-utilities'

// Advanced TypeScript 5.8+ Type Definitions for Test Environment
interface AuthTestEnvironment {
  mockSql: MockedFunction<(...args: unknown[]) => Promise<unknown>>
  mockAuth: MockedFunction<(...args: unknown[]) => Promise<unknown>>
  authStateManager: AuthenticationStateManager
  dbMockHelper: DatabaseMockHelper
}

type PerformanceTestPromise = Promise<{
  timing: number
  success: boolean
  error?: string
}>

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  SESSION_CREATION: 50, // Session creation should be under 50ms
  TOKEN_REFRESH: 500, // Token refresh should be under 500ms
  DATABASE_QUERY: 100, // Database queries should be under 100ms
  OAUTH_CALLBACK: 200, // OAuth callback processing under 200ms
  CONCURRENT_SESSIONS: 1000, // 100 concurrent sessions under 1s
  MEMORY_LIMIT_MB: 100, // Memory usage under 100MB
}

// Load testing parameters
const LOAD_TEST_PARAMS = {
  LIGHT_LOAD: 10, // 10 concurrent users
  MEDIUM_LOAD: 50, // 50 concurrent users
  HEAVY_LOAD: 100, // 100 concurrent users
  STRESS_LOAD: 500, // 500 concurrent users
}

describe('NextAuth Performance Benchmarks', () => {
  let testEnv: AuthTestEnvironment
  let mockSql: MockedFunction<(...args: unknown[]) => Promise<unknown>>
  let _mockAuth: MockedFunction<(...args: unknown[]) => Promise<unknown>>
  let _authStateManager: AuthenticationStateManager
  let dbMockHelper: DatabaseMockHelper

  beforeEach(() => {
    testEnv = setupAuthTestEnvironment()
    mockSql = testEnv.mockSql
    _mockAuth = testEnv.mockAuth
    _authStateManager = testEnv.authStateManager
    dbMockHelper = testEnv.dbMockHelper

    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
  })

  describe('Session Creation Performance', () => {
    it('should create sessions within performance threshold', async () => {
      // Setup database mock for fast user retrieval
      const mockUser = {
        id: 'perf-user-123',
        email: 'perf@example.com',
        display_name: 'Performance User',
        username: 'perfuser',
        github_username: 'perfuser',
        email_verified: true,
        connected_providers: ['github'],
        primary_provider: 'github',
      }

      dbMockHelper.mockUserRetrieval(mockUser)

      const sessionCallback = authConfig.callbacks?.session
      const mockSession = createMockSession()
      const mockToken = createMockJWT()

      // Measure session creation performance
      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(async () => {
        return sessionCallback?.({
          session: {
            ...mockSession,
            sessionToken: 'perf-session-token',
            userId: 'perf-user-123',
          },
          token: mockToken,
        })
      }, 'session_creation')

      expect(result).toBeDefined()
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SESSION_CREATION)
      console.log(
        `✅ Session creation: ${duration.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLDS.SESSION_CREATION}ms)`
      )
    })

    it('should handle rapid session creation bursts', async () => {
      // Setup for burst testing
      const burstSize = 20
      const burstPromises: PerformanceTestPromise[] = []

      for (let i = 0; i < burstSize; i++) {
        dbMockHelper.mockUserRetrieval({
          id: `burst-user-${i}`,
          email: `burst${i}@example.com`,
          display_name: `Burst User ${i}`,
          connected_providers: ['github'],
          primary_provider: 'github',
        })

        const sessionCallback = authConfig.callbacks?.session
        const sessionPromise = sessionCallback?.({
          session: {
            ...createMockSession({
              user: { ...createMockSession().user, id: `burst-user-${i}` },
            }),
            sessionToken: `burst-session-${i}`,
            userId: `burst-user-${i}`,
          },
          token: createMockJWT({ sub: `burst-user-${i}` }),
        })

        burstPromises.push(
          sessionPromise?.then(() => ({ timing: 0, success: true })) ??
            Promise.resolve({ timing: 0, success: false })
        )
      }

      const startTime = performance.now()
      const results = await Promise.all(burstPromises)
      const totalDuration = performance.now() - startTime

      expect(results).toHaveLength(burstSize)
      expect(totalDuration).toBeLessThan(burstSize * PERFORMANCE_THRESHOLDS.SESSION_CREATION)
      console.log(
        `✅ Burst session creation (${burstSize} sessions): ${totalDuration.toFixed(2)}ms`
      )
    })

    it('should maintain consistent performance under memory pressure', async () => {
      const memoryTracker = PerformanceTestHelper.trackMemoryUsage()
      const trackingInterval = memoryTracker.startTracking()

      try {
        // Simulate memory-intensive session operations
        const _largeSessionData = Array.from({ length: 1000 }, (_, i) =>
          createMockSession({
            user: {
              ...createMockSession().user,
              id: `memory-user-${i}`,
            },
          })
        )

        dbMockHelper.mockUserRetrieval({
          id: 'memory-test-user',
          email: 'memory@example.com',
          connected_providers: ['github'],
          primary_provider: 'github',
        })

        const { duration } = await PerformanceTestHelper.measureAuthOperation(async () => {
          const sessionCallback = authConfig.callbacks?.session
          return sessionCallback?.({
            session: {
              ...createMockSession(),
              sessionToken: 'memory-session-token',
              userId: 'memory-test-user',
            },
            token: createMockJWT(),
          })
        }, 'memory_pressure_session')

        // Stop tracking and analyze memory usage
        const measurements = memoryTracker.stopTracking(trackingInterval)
        const maxMemoryUsage = Math.max(...measurements.map(m => m.usage.heapUsed)) / 1024 / 1024 // Convert to MB

        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.SESSION_CREATION * 2) // Allow 2x under memory pressure
        expect(maxMemoryUsage).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_LIMIT_MB)
        console.log(
          `✅ Session creation under memory pressure: ${duration.toFixed(2)}ms, max memory: ${maxMemoryUsage.toFixed(2)}MB`
        )
      } finally {
        memoryTracker.stopTracking(trackingInterval)
      }
    })
  })

  describe('Token Refresh Performance', () => {
    it('should refresh GitHub tokens within performance threshold', async () => {
      // Mock GitHub token refresh endpoint
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_new_fast_token',
          refresh_token: 'ghr_new_fast_refresh',
          expires_in: 3600,
        }),
      })

      const jwtCallback = authConfig.callbacks?.jwt
      const expiredToken = createMockJWT({
        accessToken: 'gho_expired_token',
        expiresAt: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago
        provider: 'github',
      })

      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(
        async () => jwtCallback?.({ token: expiredToken }),
        'github_token_refresh'
      )

      expect(result?.accessToken).toBe('gho_new_fast_token')
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.TOKEN_REFRESH)
      console.log(
        `✅ GitHub token refresh: ${duration.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLDS.TOKEN_REFRESH}ms)`
      )
    })

    it('should refresh Google tokens within performance threshold', async () => {
      // Mock Google token refresh endpoint
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'ya29.new_fast_token',
          refresh_token: '1//new_fast_refresh',
          expires_in: 3600,
        }),
      })

      const jwtCallback = authConfig.callbacks?.jwt
      const expiredToken = createMockJWT({
        accessToken: 'ya29.expired_token',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        provider: 'google',
      })

      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(
        async () => jwtCallback?.({ token: expiredToken }),
        'google_token_refresh'
      )

      expect(result?.accessToken).toBe('ya29.new_fast_token')
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.TOKEN_REFRESH)
      console.log(
        `✅ Google token refresh: ${duration.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLDS.TOKEN_REFRESH}ms)`
      )
    })

    it('should handle concurrent token refreshes efficiently', async () => {
      const concurrentRefreshes = 10

      // Mock multiple token refresh responses
      for (let i = 0; i < concurrentRefreshes; i++) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: `gho_concurrent_token_${i}`,
            refresh_token: `ghr_concurrent_refresh_${i}`,
            expires_in: 3600,
          }),
        })
      }

      const jwtCallback = authConfig.callbacks?.jwt
      const refreshPromises = Array.from({ length: concurrentRefreshes }, (_, i) => {
        const expiredToken = createMockJWT({
          sub: `concurrent-user-${i}`,
          accessToken: `gho_expired_${i}`,
          expiresAt: Math.floor(Date.now() / 1000) - 60,
        })

        return PerformanceTestHelper.measureAuthOperation(
          async () => jwtCallback?.({ token: expiredToken }),
          `concurrent_refresh_${i}`
        )
      })

      const startTime = performance.now()
      const results = await Promise.all(refreshPromises)
      const totalDuration = performance.now() - startTime

      const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length

      expect(results).toHaveLength(concurrentRefreshes)
      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.TOKEN_REFRESH)
      expect(totalDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.TOKEN_REFRESH * 2) // Allow 2x for concurrent overhead
      console.log(
        `✅ Concurrent token refreshes (${concurrentRefreshes}): avg ${averageDuration.toFixed(2)}ms, total ${totalDuration.toFixed(2)}ms`
      )
    })

    it('should handle token refresh failures gracefully with minimal performance impact', async () => {
      // Mock token refresh failure
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'The refresh token is invalid',
        }),
      })

      const jwtCallback = authConfig.callbacks?.jwt
      const expiredToken = createMockJWT({
        accessToken: 'gho_invalid_token',
        refreshToken: 'ghr_invalid_refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      })

      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(
        async () => jwtCallback?.({ token: expiredToken }),
        'token_refresh_failure'
      )

      expect(result?.error).toBe('RefreshAccessTokenError')
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.TOKEN_REFRESH / 2) // Failures should be even faster
      console.log(`✅ Token refresh failure handling: ${duration.toFixed(2)}ms`)
    })
  })

  describe('Database Operation Performance', () => {
    it('should perform user queries within performance threshold', async () => {
      const mockUser = {
        id: 'db-perf-user',
        email: 'dbperf@example.com',
        connected_providers: ['github'],
        primary_provider: 'github',
      }

      dbMockHelper.mockUserRetrieval(mockUser)

      const { duration } = await PerformanceTestHelper.measureAuthOperation(async () => {
        const sessionCallback = authConfig.callbacks?.session
        return sessionCallback?.({
          session: {
            ...createMockSession(),
            sessionToken: 'db-perf-session',
            userId: 'db-perf-user',
          },
          token: createMockJWT({ sub: 'db-perf-user' }),
        })
      }, 'database_user_query')

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.DATABASE_QUERY)
      console.log(
        `✅ Database user query: ${duration.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLDS.DATABASE_QUERY}ms)`
      )
    })

    it('should handle database connection timeouts gracefully', async () => {
      // Mock database timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database connection timeout')), 50)
      })

      mockSql.mockImplementationOnce(() => timeoutPromise)

      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(async () => {
        try {
          const sessionCallback = authConfig.callbacks?.session
          return await sessionCallback?.({
            session: createMockSession(),
            token: createMockJWT(),
          })
        } catch (error) {
          return { error: error.message }
        }
      }, 'database_timeout_handling')

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.DATABASE_QUERY)
      console.log(`✅ Database timeout handling: ${duration.toFixed(2)}ms`)
    })

    it('should optimize concurrent database operations', async () => {
      const concurrentOperations = 20

      // Setup concurrent user data
      for (let i = 0; i < concurrentOperations; i++) {
        dbMockHelper.mockUserRetrieval({
          id: `concurrent-db-user-${i}`,
          email: `concurrent${i}@example.com`,
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any)
      }

      const concurrentPromises = Array.from({ length: concurrentOperations }, (_, i) => {
        return PerformanceTestHelper.measureAuthOperation(async () => {
          const sessionCallback = authConfig.callbacks?.session
          return sessionCallback?.({
            session: {
              ...createMockSession(),
              sessionToken: `concurrent-session-${i}`,
              userId: `concurrent-db-user-${i}`,
            },
            token: createMockJWT({ sub: `concurrent-db-user-${i}` }),
          })
        }, `concurrent_db_operation_${i}`)
      })

      const results = await Promise.all(concurrentPromises)
      const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length

      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.DATABASE_QUERY)
      console.log(
        `✅ Concurrent database operations (${concurrentOperations}): avg ${averageDuration.toFixed(2)}ms`
      )
    })
  })

  describe('OAuth Callback Performance', () => {
    it('should process OAuth callbacks within performance threshold', async () => {
      const oauthFlow = OAuthFlowSimulator.simulateGitHubOAuth()

      // Mock successful OAuth flow
      oauthFlow.mockTokenExchange()
      oauthFlow.mockProfileFetch()

      dbMockHelper.mockUserCreation(
        {
          id: 'oauth-perf-user',
          email: 'oauth@example.com',
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any,
        {
          provider: 'github',
          providerAccountId: 'github-123',
          type: 'oauth',
          access_token: 'gho_oauth_token',
        } as any
      )

      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(async () => {
        const signInCallback = authConfig.callbacks?.signIn
        return signInCallback?.({
          user: {
            id: 'oauth-perf-user',
            email: 'oauth@example.com',
            name: 'OAuth User',
            emailVerified: null,
          },
          account: {
            provider: 'github',
            providerAccountId: 'github-123',
            type: 'oauth',
            access_token: 'gho_oauth_token',
          },
        })
      }, 'oauth_callback_processing')

      expect(result).toBe(true)
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.OAUTH_CALLBACK)
      console.log(
        `✅ OAuth callback processing: ${duration.toFixed(2)}ms (threshold: ${PERFORMANCE_THRESHOLDS.OAUTH_CALLBACK}ms)`
      )
    })

    it('should handle OAuth errors efficiently', async () => {
      const { duration, result } = await PerformanceTestHelper.measureAuthOperation(async () => {
        const signInCallback = authConfig.callbacks?.signIn
        return signInCallback?.({
          user: {
            id: 'invalid-oauth-user',
            email: 'invalid@example.com',
            emailVerified: null,
          },
          // Missing account indicates OAuth error
        })
      }, 'oauth_error_handling')

      expect(result).toBe(false)
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.OAUTH_CALLBACK / 2) // Errors should be faster
      console.log(`✅ OAuth error handling: ${duration.toFixed(2)}ms`)
    })
  })

  describe('Load Testing', () => {
    it('should handle light load efficiently', async () => {
      const loadTestResult = await PerformanceTestHelper.simulateConcurrentAuth(async () => {
        dbMockHelper.mockUserRetrieval({
          id: 'load-test-user',
          email: 'load@example.com',
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any)

        const sessionCallback = authConfig.callbacks?.session
        return sessionCallback?.({
          session: createMockSession(),
          token: createMockJWT(),
        })
      }, LOAD_TEST_PARAMS.LIGHT_LOAD)

      expect(loadTestResult.successRate).toBeGreaterThan(0.95) // 95% success rate
      expect(loadTestResult.averageDuration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.SESSION_CREATION * 2
      )
      console.log(
        `✅ Light load test (${LOAD_TEST_PARAMS.LIGHT_LOAD} users): ${loadTestResult.averageDuration.toFixed(2)}ms avg, ${(loadTestResult.successRate * 100).toFixed(1)}% success`
      )
    })

    it('should handle medium load with acceptable performance', async () => {
      const loadTestResult = await PerformanceTestHelper.simulateConcurrentAuth(async () => {
        dbMockHelper.mockUserRetrieval({
          id: 'medium-load-user',
          email: 'medium@example.com',
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any)

        const sessionCallback = authConfig.callbacks?.session
        return sessionCallback?.({
          session: createMockSession(),
          token: createMockJWT(),
        })
      }, LOAD_TEST_PARAMS.MEDIUM_LOAD)

      expect(loadTestResult.successRate).toBeGreaterThan(0.9) // 90% success rate under medium load
      expect(loadTestResult.totalDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.CONCURRENT_SESSIONS)
      console.log(
        `✅ Medium load test (${LOAD_TEST_PARAMS.MEDIUM_LOAD} users): ${loadTestResult.totalDuration.toFixed(2)}ms total, ${(loadTestResult.successRate * 100).toFixed(1)}% success`
      )
    })

    it('should maintain functionality under heavy load', async () => {
      const loadTestResult = await PerformanceTestHelper.simulateConcurrentAuth(async () => {
        dbMockHelper.mockUserRetrieval({
          id: 'heavy-load-user',
          email: 'heavy@example.com',
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any)

        const sessionCallback = authConfig.callbacks?.session
        return sessionCallback?.({
          session: createMockSession(),
          token: createMockJWT(),
        })
      }, LOAD_TEST_PARAMS.HEAVY_LOAD)

      expect(loadTestResult.successRate).toBeGreaterThan(0.8) // 80% success rate under heavy load
      console.log(
        `✅ Heavy load test (${LOAD_TEST_PARAMS.HEAVY_LOAD} users): ${loadTestResult.totalDuration.toFixed(2)}ms total, ${(loadTestResult.successRate * 100).toFixed(1)}% success`
      )
    })

    it('should identify breaking point under stress load', async () => {
      const loadTestResult = await PerformanceTestHelper.simulateConcurrentAuth(async () => {
        dbMockHelper.mockUserRetrieval({
          id: 'stress-load-user',
          email: 'stress@example.com',
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any)

        const sessionCallback = authConfig.callbacks?.session
        return sessionCallback?.({
          session: createMockSession(),
          token: createMockJWT(),
        })
      }, LOAD_TEST_PARAMS.STRESS_LOAD)

      // Under stress load, we expect some degradation but system should not completely fail
      expect(loadTestResult.successRate).toBeGreaterThan(0.5) // 50% minimum success rate
      console.log(
        `⚠️  Stress load test (${LOAD_TEST_PARAMS.STRESS_LOAD} users): ${loadTestResult.totalDuration.toFixed(2)}ms total, ${(loadTestResult.successRate * 100).toFixed(1)}% success`
      )

      if (loadTestResult.successRate < 0.8) {
        console.warn(
          `Performance degradation detected under stress load: ${(loadTestResult.successRate * 100).toFixed(1)}% success rate`
        )
      }
    })
  })

  describe('Memory Usage Optimization', () => {
    it('should maintain stable memory usage during session operations', async () => {
      const memoryTracker = PerformanceTestHelper.trackMemoryUsage()
      const trackingInterval = memoryTracker.startTracking()

      try {
        // Perform 100 session operations
        for (let i = 0; i < 100; i++) {
          dbMockHelper.mockUserRetrieval({
            id: `memory-user-${i}`,
            email: `memory${i}@example.com`,
            connected_providers: ['github'],
            primary_provider: 'github',
          } as any)

          const sessionCallback = authConfig.callbacks?.session
          await sessionCallback?.({
            session: createMockSession(),
            token: createMockJWT(),
          })
        }

        const measurements = memoryTracker.stopTracking(trackingInterval)
        const initialMemory = measurements[0]?.usage.heapUsed || 0
        const finalMemory = measurements[measurements.length - 1]?.usage.heapUsed || 0
        const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024 // MB

        expect(memoryGrowth).toBeLessThan(50) // Less than 50MB growth
        console.log(
          `✅ Memory stability test: ${memoryGrowth.toFixed(2)}MB growth over 100 operations`
        )
      } finally {
        memoryTracker.stopTracking(trackingInterval)
      }
    })

    it('should properly garbage collect after authentication operations', async () => {
      const memoryTracker = PerformanceTestHelper.trackMemoryUsage()
      const trackingInterval = memoryTracker.startTracking()

      try {
        // Perform operations and force garbage collection
        const operations = Array.from({ length: 50 }, async (_, i) => {
          dbMockHelper.mockUserRetrieval({
            id: `gc-user-${i}`,
            email: `gc${i}@example.com`,
            connected_providers: ['github'],
            primary_provider: 'github',
          } as any)

          const sessionCallback = authConfig.callbacks?.session
          const result = await sessionCallback?.({
            session: createMockSession(),
            token: createMockJWT(),
          })

          // Force garbage collection (in test environment)
          if (global.gc) {
            global.gc()
          }

          return result
        })

        await Promise.all(operations)

        const measurements = memoryTracker.stopTracking(trackingInterval)
        const maxMemory = Math.max(...measurements.map(m => m.usage.heapUsed)) / 1024 / 1024
        const finalMemory = measurements[measurements.length - 1]?.usage.heapUsed / 1024 / 1024

        expect(maxMemory).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_LIMIT_MB)
        console.log(
          `✅ Garbage collection test: max ${maxMemory.toFixed(2)}MB, final ${finalMemory.toFixed(2)}MB`
        )
      } finally {
        memoryTracker.stopTracking(trackingInterval)
      }
    })
  })

  describe('Performance Regression Detection', () => {
    it('should maintain consistent performance across test runs', async () => {
      const runs = 5
      const durations: number[] = []

      for (let run = 0; run < runs; run++) {
        dbMockHelper.mockUserRetrieval({
          id: `regression-user-${run}`,
          email: `regression${run}@example.com`,
          connected_providers: ['github'],
          primary_provider: 'github',
        } as any)

        const { duration } = await PerformanceTestHelper.measureAuthOperation(async () => {
          const sessionCallback = authConfig.callbacks?.session
          return sessionCallback?.({
            session: createMockSession(),
            token: createMockJWT(),
          })
        }, `regression_test_run_${run}`)

        durations.push(duration)
      }

      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      const standardDeviation = Math.sqrt(
        durations.reduce((sum, d) => sum + (d - averageDuration) ** 2, 0) / durations.length
      )
      const coefficientOfVariation = standardDeviation / averageDuration

      // Coefficient of variation should be low (consistent performance)
      expect(coefficientOfVariation).toBeLessThan(0.2) // Less than 20% variation
      expect(averageDuration).toBeLessThan(PERFORMANCE_THRESHOLDS.SESSION_CREATION)

      console.log(
        `✅ Performance consistency: avg ${averageDuration.toFixed(2)}ms, CV ${(coefficientOfVariation * 100).toFixed(1)}%`
      )
    })
  })
})

// =============================================================================
// Performance Benchmark Reporting
// =============================================================================

export const generatePerformanceReport = (benchmarkResults: any[]) => {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalBenchmarks: benchmarkResults.length,
      passedBenchmarks: benchmarkResults.filter(r => r.passed).length,
      averagePerformance:
        benchmarkResults.reduce((sum, r) => sum + r.duration, 0) / benchmarkResults.length,
    },
    thresholds: PERFORMANCE_THRESHOLDS,
    loadTestParams: LOAD_TEST_PARAMS,
    recommendations: [] as string[],
  }

  // Generate recommendations based on results
  const failedBenchmarks = benchmarkResults.filter(r => !r.passed)
  if (failedBenchmarks.length > 0) {
    report.recommendations.push(
      `${failedBenchmarks.length} benchmarks failed - investigate performance bottlenecks`
    )
  }

  if (report.summary.averagePerformance > PERFORMANCE_THRESHOLDS.SESSION_CREATION * 2) {
    report.recommendations.push('Consider optimizing session creation performance')
  }

  return report
}
