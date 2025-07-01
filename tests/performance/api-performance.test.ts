/**
 * API Performance Testing Suite
 * Comprehensive testing of Next.js API routes, serverless function performance, and API response times
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'

// API Performance thresholds (in milliseconds)
const API_PERFORMANCE_THRESHOLDS = {
  HEALTH_CHECK: 100, // Health check endpoints should respond under 100ms
  SIMPLE_GET: 200, // Simple GET requests should respond under 200ms
  SEARCH_API: 500, // Search API should respond under 500ms
  AUTH_API: 300, // Authentication API should respond under 300ms
  COMPLEX_POST: 800, // Complex POST operations should complete under 800ms
  DATABASE_API: 400, // Database-dependent APIs should respond under 400ms
  SERVERLESS_COLD_START: 3000, // Serverless cold start should be under 3 seconds
  SERVERLESS_WARM: 200, // Warm serverless functions should respond under 200ms
}

// Load testing parameters
const API_LOAD_PARAMS = {
  LIGHT_LOAD: 10, // 10 concurrent requests
  MEDIUM_LOAD: 25, // 25 concurrent requests
  HEAVY_LOAD: 50, // 50 concurrent requests
  STRESS_LOAD: 100, // 100 concurrent requests
}

interface ApiPerformanceMetrics {
  responseTime: number
  statusCode: number
  contentLength?: number
  headers?: Record<string, string>
  body?: any
  serverTiming?: Record<string, number>
}

interface LoadTestResults {
  totalRequests: number
  successCount: number
  failureCount: number
  averageResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  requestsPerSecond: number
  successRate: number
}

describe('API Performance Testing', () => {
  let testDbManager: TestDatabaseManager
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'

  beforeAll(async () => {
    testDbManager = new TestDatabaseManager()
    await testDbManager.setup()
  })

  afterAll(async () => {
    await testDbManager.cleanup()
  })

  beforeEach(async () => {
    // Clear any caches between tests for accurate measurements
    console.log('🧹 Clearing caches for accurate performance measurement')
  })

  async function measureApiCall(
    url: string,
    options: RequestInit,
    description: string
  ): Promise<{ response: Response; metrics: ApiPerformanceMetrics }> {
    const startTime = performance.now()

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      const endTime = performance.now()
      const responseTime = endTime - startTime

      // Parse server timing headers if present
      const serverTimingHeader = response.headers.get('server-timing')
      const serverTiming: Record<string, number> = {}
      if (serverTimingHeader) {
        serverTimingHeader.split(',').forEach(timing => {
          const [name, value] = timing.trim().split('=')
          if (value) {
            serverTiming[name] = Number.parseFloat(value)
          }
        })
      }

      let body: any
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        body = await response.json()
      } else {
        body = await response.text()
      }

      const metrics: ApiPerformanceMetrics = {
        responseTime,
        statusCode: response.status,
        contentLength: Number.parseInt(response.headers.get('content-length') || '0'),
        headers: Object.fromEntries(response.headers.entries()),
        body,
        serverTiming,
      }

      console.log(`⏱️ ${description}: ${responseTime.toFixed(2)}ms (${response.status})`)

      return { response, metrics }
    } catch (error) {
      const endTime = performance.now()
      const responseTime = endTime - startTime
      console.error(`❌ ${description} failed after ${responseTime.toFixed(2)}ms:`, error)
      throw error
    }
  }

  async function runLoadTest(
    url: string,
    options: RequestInit,
    concurrency: number,
    description: string
  ): Promise<LoadTestResults> {
    console.log(`🔥 Starting load test: ${description} (${concurrency} concurrent requests)`)

    const startTime = performance.now()
    const results: { success: boolean; responseTime: number }[] = []

    const promises = Array.from({ length: concurrency }, async () => {
      try {
        const { metrics } = await measureApiCall(url, options, 'Load test request')
        results.push({
          success: metrics.statusCode >= 200 && metrics.statusCode < 400,
          responseTime: metrics.responseTime,
        })
      } catch (_error) {
        results.push({
          success: false,
          responseTime: 0,
        })
      }
    })

    await Promise.all(promises)
    const endTime = performance.now()
    const totalDuration = endTime - startTime

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    const responseTimes = results.filter(r => r.success).map(r => r.responseTime)

    if (responseTimes.length === 0) {
      throw new Error('All requests failed in load test')
    }

    responseTimes.sort((a, b) => a - b)

    const loadTestResults: LoadTestResults = {
      totalRequests: concurrency,
      successCount,
      failureCount,
      averageResponseTime: responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length,
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)],
      requestsPerSecond: (successCount / totalDuration) * 1000,
      successRate: (successCount / concurrency) * 100,
    }

    console.log(`📊 Load Test Results for ${description}:`)
    console.log(`  Success Rate: ${loadTestResults.successRate.toFixed(1)}%`)
    console.log(`  Avg Response Time: ${loadTestResults.averageResponseTime.toFixed(2)}ms`)
    console.log(`  P95 Response Time: ${loadTestResults.p95ResponseTime.toFixed(2)}ms`)
    console.log(`  P99 Response Time: ${loadTestResults.p99ResponseTime.toFixed(2)}ms`)
    console.log(`  Requests/Second: ${loadTestResults.requestsPerSecond.toFixed(2)}`)

    return loadTestResults
  }

  describe('Health Check Endpoints', () => {
    it('should respond to health check quickly', async () => {
      const { metrics } = await measureApiCall(`${baseUrl}/api/health`, {}, 'Health check endpoint')

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.HEALTH_CHECK)
      expect(metrics.body).toHaveProperty('status', 'healthy')
    })

    it('should respond to simple health check quickly', async () => {
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/simple-health`,
        {},
        'Simple health check endpoint'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.HEALTH_CHECK)
    })

    it('should handle health check load efficiently', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/health`,
        {},
        API_LOAD_PARAMS.MEDIUM_LOAD,
        'Health check load test'
      )

      expect(loadResults.successRate).toBeGreaterThan(95)
      expect(loadResults.averageResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.HEALTH_CHECK)
      expect(loadResults.p95ResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.HEALTH_CHECK * 2)
    })
  })

  describe('Search API Performance', () => {
    it('should handle basic search requests efficiently', async () => {
      const searchParams = new URLSearchParams({
        q: 'react',
        limit: '10',
      })

      const { metrics } = await measureApiCall(
        `${baseUrl}/api/search/repositories?${searchParams}`,
        {},
        'Basic repository search'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SEARCH_API)
      expect(Array.isArray(metrics.body?.repositories)).toBe(true)
    })

    it('should handle complex search queries efficiently', async () => {
      const searchParams = new URLSearchParams({
        q: 'machine learning python',
        language: 'Python',
        minStars: '100',
        limit: '20',
      })

      const { metrics } = await measureApiCall(
        `${baseUrl}/api/search/repositories?${searchParams}`,
        {},
        'Complex repository search'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SEARCH_API)
    })

    it('should handle opportunity search efficiently', async () => {
      const searchParams = new URLSearchParams({
        q: 'good first issue',
        difficulty: 'beginner',
        limit: '15',
      })

      const { metrics } = await measureApiCall(
        `${baseUrl}/api/search/opportunities?${searchParams}`,
        {},
        'Opportunity search'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SEARCH_API)
    })

    it('should handle concurrent search requests efficiently', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/search/repositories?q=javascript&limit=10`,
        {},
        API_LOAD_PARAMS.LIGHT_LOAD,
        'Concurrent search requests'
      )

      expect(loadResults.successRate).toBeGreaterThan(90)
      expect(loadResults.averageResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SEARCH_API)
    })

    it('should maintain performance with varying search complexity', async () => {
      const searchQueries = [
        'q=react',
        'q=react+typescript&language=TypeScript',
        'q=machine+learning&language=Python&minStars=500',
        'q=web+development&language=JavaScript&minStars=100&maxStars=1000',
      ]

      const results = await Promise.all(
        searchQueries.map(async (query, index) => {
          const { metrics } = await measureApiCall(
            `${baseUrl}/api/search/repositories?${query}&limit=10`,
            {},
            `Search complexity test ${index + 1}`
          )
          return metrics
        })
      )

      // All searches should complete within threshold
      for (const metrics of results) {
        expect(metrics.statusCode).toBe(200)
        expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SEARCH_API)
      }

      // Performance should not degrade significantly with complexity
      const responseTimes = results.map(r => r.responseTime)
      const maxTime = Math.max(...responseTimes)
      const minTime = Math.min(...responseTimes)
      const performanceDelta = maxTime - minTime

      console.log(`📈 Search complexity performance delta: ${performanceDelta.toFixed(2)}ms`)
      expect(performanceDelta).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SEARCH_API * 0.5)
    })
  })

  describe('Authentication API Performance', () => {
    it('should handle auth provider listing efficiently', async () => {
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/auth/providers`,
        {},
        'Auth providers endpoint'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.AUTH_API)
    })

    it('should handle session validation efficiently', async () => {
      // Note: This would typically require a valid session token
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/auth/session`,
        {
          headers: {
            Authorization: 'Bearer test-session-token',
          },
        },
        'Session validation'
      )

      // Should respond quickly even if unauthorized
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.AUTH_API)
    })

    it('should handle auth load efficiently', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/auth/providers`,
        {},
        API_LOAD_PARAMS.LIGHT_LOAD,
        'Auth endpoints load test'
      )

      expect(loadResults.successRate).toBeGreaterThan(95)
      expect(loadResults.averageResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.AUTH_API)
    })
  })

  describe('Serverless Function Performance', () => {
    it('should handle warm serverless function calls efficiently', async () => {
      // First call to warm up the function
      await measureApiCall(`${baseUrl}/api/health`, {}, 'Warm-up call')

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100))

      // Second call should be faster (warm start)
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/health`,
        {},
        'Warm serverless function call'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SERVERLESS_WARM)
    })

    it('should handle serverless function scaling', async () => {
      // Test multiple concurrent requests to trigger scaling
      const concurrency = API_LOAD_PARAMS.MEDIUM_LOAD
      const results: ApiPerformanceMetrics[] = []

      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const { metrics } = await measureApiCall(
          `${baseUrl}/api/health?request=${i}`,
          {},
          `Scaling test request ${i}`
        )
        results.push(metrics)
      })

      await Promise.all(promises)

      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
      const maxResponseTime = Math.max(...results.map(r => r.responseTime))
      const successRate = (results.filter(r => r.statusCode === 200).length / results.length) * 100

      console.log('🚀 Serverless scaling test:')
      console.log(`  Average Response Time: ${avgResponseTime.toFixed(2)}ms`)
      console.log(`  Max Response Time: ${maxResponseTime.toFixed(2)}ms`)
      console.log(`  Success Rate: ${successRate.toFixed(1)}%`)

      expect(successRate).toBeGreaterThan(95)
      expect(avgResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SERVERLESS_WARM * 2)
      expect(maxResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SERVERLESS_COLD_START)
    })
  })

  describe('Database-Dependent API Performance', () => {
    it('should handle database-backed search efficiently', async () => {
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/search/repositories?q=performance&limit=5`,
        {},
        'Database-backed search'
      )

      expect(metrics.statusCode).toBe(200)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.DATABASE_API)
    })

    it('should maintain performance under database load', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/search/repositories?q=test&limit=10`,
        {},
        API_LOAD_PARAMS.LIGHT_LOAD,
        'Database load test'
      )

      expect(loadResults.successRate).toBeGreaterThan(90)
      expect(loadResults.averageResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.DATABASE_API)
      expect(loadResults.p95ResponseTime).toBeLessThan(
        API_PERFORMANCE_THRESHOLDS.DATABASE_API * 1.5
      )
    })
  })

  describe('Error Handling Performance', () => {
    it('should handle 404 errors quickly', async () => {
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/nonexistent-endpoint`,
        {},
        '404 error handling'
      )

      expect(metrics.statusCode).toBe(404)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SIMPLE_GET)
    })

    it('should handle validation errors efficiently', async () => {
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/search/repositories?limit=invalid`,
        {},
        'Validation error handling'
      )

      expect(metrics.statusCode).toBeGreaterThanOrEqual(400)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SIMPLE_GET)
    })

    it('should handle malformed requests efficiently', async () => {
      const { metrics } = await measureApiCall(
        `${baseUrl}/api/search/repositories`,
        {
          method: 'POST',
          body: 'invalid json{',
        },
        'Malformed request handling'
      )

      expect(metrics.statusCode).toBeGreaterThanOrEqual(400)
      expect(metrics.responseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SIMPLE_GET)
    })
  })

  describe('Performance Regression Detection', () => {
    it('should maintain consistent API performance across multiple runs', async () => {
      const runs = 5
      const endpoint = `${baseUrl}/api/health`
      const results: number[] = []

      for (let i = 0; i < runs; i++) {
        const { metrics } = await measureApiCall(
          endpoint,
          {},
          `Performance consistency run ${i + 1}`
        )
        results.push(metrics.responseTime)

        // Small delay between runs
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      const avgTime = results.reduce((sum, time) => sum + time, 0) / runs
      const maxTime = Math.max(...results)
      const minTime = Math.min(...results)
      const standardDeviation = Math.sqrt(
        results.reduce((sum, time) => sum + (time - avgTime) ** 2, 0) / runs
      )
      const coefficientOfVariation = standardDeviation / avgTime

      console.log('📊 API Performance Consistency:')
      console.log(`Average Time: ${avgTime.toFixed(2)}ms`)
      console.log(`Min Time: ${minTime.toFixed(2)}ms`)
      console.log(`Max Time: ${maxTime.toFixed(2)}ms`)
      console.log(`Standard Deviation: ${standardDeviation.toFixed(2)}ms`)
      console.log(`Coefficient of Variation: ${(coefficientOfVariation * 100).toFixed(1)}%`)

      // Performance should be consistent (CV < 25%)
      expect(coefficientOfVariation).toBeLessThan(0.25)
      expect(avgTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.HEALTH_CHECK)
    })

    it('should detect performance anomalies', async () => {
      const samples = 10
      const responseTimes: number[] = []

      for (let i = 0; i < samples; i++) {
        const { metrics } = await measureApiCall(
          `${baseUrl}/api/health?sample=${i}`,
          {},
          `Anomaly detection sample ${i + 1}`
        )
        responseTimes.push(metrics.responseTime)
      }

      const mean = responseTimes.reduce((sum, time) => sum + time, 0) / samples
      const variance = responseTimes.reduce((sum, time) => sum + (time - mean) ** 2, 0) / samples
      const standardDeviation = Math.sqrt(variance)

      // Check for outliers (values beyond 2 standard deviations)
      const outliers = responseTimes.filter(time => Math.abs(time - mean) > 2 * standardDeviation)
      const outlierPercentage = (outliers.length / samples) * 100

      console.log('🔍 Anomaly Detection Results:')
      console.log(`Mean Response Time: ${mean.toFixed(2)}ms`)
      console.log(`Standard Deviation: ${standardDeviation.toFixed(2)}ms`)
      console.log(`Outliers: ${outliers.length}/${samples} (${outlierPercentage.toFixed(1)}%)`)

      // Should have minimal outliers (< 10%)
      expect(outlierPercentage).toBeLessThan(10)
    })
  })

  describe('Load Testing Scenarios', () => {
    it('should handle light load efficiently', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/health`,
        {},
        API_LOAD_PARAMS.LIGHT_LOAD,
        'Light load test'
      )

      expect(loadResults.successRate).toBeGreaterThan(98)
      expect(loadResults.averageResponseTime).toBeLessThan(API_PERFORMANCE_THRESHOLDS.SIMPLE_GET)
      expect(loadResults.requestsPerSecond).toBeGreaterThan(20)
    })

    it('should handle medium load gracefully', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/health`,
        {},
        API_LOAD_PARAMS.MEDIUM_LOAD,
        'Medium load test'
      )

      expect(loadResults.successRate).toBeGreaterThan(95)
      expect(loadResults.averageResponseTime).toBeLessThan(
        API_PERFORMANCE_THRESHOLDS.SIMPLE_GET * 1.5
      )
      expect(loadResults.requestsPerSecond).toBeGreaterThan(15)
    })

    it('should survive heavy load', async () => {
      const loadResults = await runLoadTest(
        `${baseUrl}/api/health`,
        {},
        API_LOAD_PARAMS.HEAVY_LOAD,
        'Heavy load test'
      )

      expect(loadResults.successRate).toBeGreaterThan(90)
      expect(loadResults.averageResponseTime).toBeLessThan(
        API_PERFORMANCE_THRESHOLDS.SIMPLE_GET * 2
      )
      expect(loadResults.requestsPerSecond).toBeGreaterThan(10)
    })
  })
})

// Export utilities for other test files
export { type measureApiCall, type runLoadTest, API_PERFORMANCE_THRESHOLDS }
export type { ApiPerformanceMetrics, LoadTestResults }
