/**
 * Performance + Monitoring Integration Tests
 * Validates system performance with monitoring integration under various load conditions
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { apiMonitoring } from '@/lib/api/monitoring'
import { PerformanceTimer } from '@/lib/middleware/monitoring-middleware'

// Performance test utilities
class PerformanceTestHelper {
  private static instance: PerformanceTestHelper
  private metrics: Array<{
    operation: string
    duration: number
    timestamp: number
    success: boolean
    metadata?: Record<string, unknown>
  }> = []

  static getInstance() {
    if (!PerformanceTestHelper.instance) {
      PerformanceTestHelper.instance = new PerformanceTestHelper()
    }
    return PerformanceTestHelper.instance
  }

  recordMetric(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ) {
    this.metrics.push({
      operation,
      duration,
      timestamp: Date.now(),
      success,
      metadata,
    })
  }

  getMetrics() {
    return [...this.metrics]
  }

  clearMetrics() {
    this.metrics = []
  }

  getAverageTime(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation)
    if (operationMetrics.length === 0) return 0

    const totalTime = operationMetrics.reduce((sum, m) => sum + m.duration, 0)
    return totalTime / operationMetrics.length
  }

  getSuccessRate(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation)
    if (operationMetrics.length === 0) return 0

    const successCount = operationMetrics.filter(m => m.success).length
    return successCount / operationMetrics.length
  }

  getPercentile(operation: string, percentile: number): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation)
    if (operationMetrics.length === 0) return 0

    const durations = operationMetrics.map(m => m.duration).sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * durations.length) - 1
    return durations[index] || 0
  }
}

// Mock API functions for testing
async function mockDatabaseQuery(complexity: 'simple' | 'complex' = 'simple'): Promise<{
  success: boolean
  data: { result: string }
}> {
  const timer = new PerformanceTimer()
  const helper = PerformanceTestHelper.getInstance()

  try {
    // Simulate database query with different complexities
    const delay = complexity === 'simple' ? 50 + Math.random() * 100 : 200 + Math.random() * 500
    await new Promise(resolve => setTimeout(resolve, delay))

    const duration = timer.getDuration()
    helper.recordMetric(`database_query_${complexity}`, duration, true, { complexity })

    return { success: true, data: { result: 'mock data' } }
  } catch (error) {
    const duration = timer.getDuration()
    helper.recordMetric(`database_query_${complexity}`, duration, false, {
      error: (error as Error).message,
    })
    throw error
  }
}

async function mockAPICall(
  endpoint: string,
  load: 'light' | 'heavy' = 'light'
): Promise<{
  success: boolean
  data: { endpoint: string; response: string }
}> {
  const timer = new PerformanceTimer()
  const helper = PerformanceTestHelper.getInstance()

  try {
    // Simulate API call with different loads
    const delay = load === 'light' ? 100 + Math.random() * 200 : 500 + Math.random() * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    // Simulate occasional failures
    if (Math.random() < 0.05) {
      // 5% failure rate
      throw new Error('API temporarily unavailable')
    }

    const duration = timer.getDuration()
    helper.recordMetric(`api_call_${endpoint}_${load}`, duration, true, { endpoint, load })

    // Track in monitoring system
    apiMonitoring.trackRequest(`/api/${endpoint}`, 'GET', 200, duration, { load, endpoint })

    return { success: true, data: { endpoint, response: 'mock response' } }
  } catch (error) {
    const duration = timer.getDuration()
    helper.recordMetric(`api_call_${endpoint}_${load}`, duration, false, {
      error: (error as Error).message,
    })

    // Track error in monitoring system
    apiMonitoring.trackRequest(`/api/${endpoint}`, 'GET', 500, duration, {
      error: (error as Error).message,
      load,
      endpoint,
    })

    throw error
  }
}

describe('Performance + Monitoring Integration', () => {
  let helper: PerformanceTestHelper

  beforeAll(async () => {
    helper = PerformanceTestHelper.getInstance()
  })

  beforeEach(() => {
    helper.clearMetrics()
  })

  describe('Individual Component Performance', () => {
    test('should track database query performance', async () => {
      // Test simple queries
      for (let i = 0; i < 10; i++) {
        await mockDatabaseQuery('simple')
      }

      // Test complex queries
      for (let i = 0; i < 5; i++) {
        await mockDatabaseQuery('complex')
      }

      // Validate performance metrics
      const simpleAvg = helper.getAverageTime('database_query_simple')
      const complexAvg = helper.getAverageTime('database_query_complex')

      expect(simpleAvg).toBeLessThan(200) // Simple queries should be fast
      expect(complexAvg).toBeLessThan(800) // Complex queries should be reasonable
      expect(complexAvg).toBeGreaterThan(simpleAvg) // Complex should take longer

      // Validate success rates
      expect(helper.getSuccessRate('database_query_simple')).toBe(1.0)
      expect(helper.getSuccessRate('database_query_complex')).toBe(1.0)
    })

    test('should track API call performance with different loads', async () => {
      // Test light load
      const lightLoadPromises = Array.from({ length: 10 }, () => mockAPICall('search', 'light'))

      // Test heavy load
      const heavyLoadPromises = Array.from({ length: 5 }, () => mockAPICall('search', 'heavy'))

      // Execute all calls
      const lightResults = await Promise.allSettled(lightLoadPromises)
      const heavyResults = await Promise.allSettled(heavyLoadPromises)

      // Most calls should succeed
      const lightSuccessCount = lightResults.filter(r => r.status === 'fulfilled').length
      const heavySuccessCount = heavyResults.filter(r => r.status === 'fulfilled').length

      expect(lightSuccessCount).toBeGreaterThan(8) // At least 80% success
      expect(heavySuccessCount).toBeGreaterThan(3) // At least 60% success

      // Validate performance differences
      const lightAvg = helper.getAverageTime('api_call_search_light')
      const heavyAvg = helper.getAverageTime('api_call_search_heavy')

      expect(lightAvg).toBeLessThan(400)
      expect(heavyAvg).toBeGreaterThan(lightAvg)
    })

    test('should measure performance percentiles', async () => {
      // Generate varied performance data
      for (let i = 0; i < 100; i++) {
        await mockAPICall('health', 'light')
      }

      const p50 = helper.getPercentile('api_call_health_light', 50)
      const p95 = helper.getPercentile('api_call_health_light', 95)
      const p99 = helper.getPercentile('api_call_health_light', 99)

      // Percentiles should increase
      expect(p95).toBeGreaterThan(p50)
      expect(p99).toBeGreaterThan(p95)

      // 95th percentile should be reasonable
      expect(p95).toBeLessThan(800)
    })
  })

  describe('Concurrent Load Testing', () => {
    test('should handle concurrent database operations', async () => {
      const concurrentQueries = 20
      const startTime = Date.now()

      // Execute concurrent database queries
      const promises = Array.from({ length: concurrentQueries }, (_, i) =>
        mockDatabaseQuery(i % 2 === 0 ? 'simple' : 'complex')
      )

      const results = await Promise.allSettled(promises)
      const endTime = Date.now()

      const totalTime = endTime - startTime
      const successCount = results.filter(r => r.status === 'fulfilled').length

      // Most operations should succeed
      expect(successCount).toBeGreaterThan(concurrentQueries * 0.8)

      // Concurrent execution should be efficient
      expect(totalTime).toBeLessThan(2000) // Should complete within 2 seconds

      // Average time per operation should be reasonable
      const avgTime = helper.getAverageTime('database_query_simple')
      expect(avgTime).toBeLessThan(300)
    })

    test('should handle API rate limiting gracefully', async () => {
      const requestCount = 50
      const startTime = Date.now()

      // Make rapid API requests
      const promises = Array.from({ length: requestCount }, (_, _i) =>
        mockAPICall('repositories', 'light')
      )

      const results = await Promise.allSettled(promises)
      const endTime = Date.now()

      const _totalTime = endTime - startTime
      const successCount = results.filter(r => r.status === 'fulfilled').length
      const failureCount = results.filter(r => r.status === 'rejected').length

      // Should handle high request volume
      expect(successCount + failureCount).toBe(requestCount)

      // Success rate should be reasonable even under load
      const successRate = successCount / requestCount
      expect(successRate).toBeGreaterThan(0.7) // At least 70% success rate
    })

    test('should maintain performance under sustained load', async () => {
      const duration = 5000 // 5 seconds
      const startTime = Date.now()
      const requests: Promise<{ success: boolean; data: Record<string, unknown> }>[] = []

      // Generate sustained load
      const intervalId = setInterval(() => {
        if (Date.now() - startTime < duration) {
          requests.push(mockAPICall('search', 'light'))
          requests.push(mockDatabaseQuery('simple'))
        }
      }, 100) // Every 100ms

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, duration))
      clearInterval(intervalId)

      // Wait for all requests to complete
      const results = await Promise.allSettled(requests)

      const successCount = results.filter(r => r.status === 'fulfilled').length
      const totalRequests = results.length

      // Should maintain reasonable success rate under sustained load
      expect(successCount / totalRequests).toBeGreaterThan(0.8)

      // Performance should remain stable
      const avgAPITime = helper.getAverageTime('api_call_search_light')
      const avgDBTime = helper.getAverageTime('database_query_simple')

      expect(avgAPITime).toBeLessThan(500)
      expect(avgDBTime).toBeLessThan(200)
    })
  })

  describe('Error Recovery Performance', () => {
    test('should handle service failures with minimal impact', async () => {
      // Test with deliberate failures
      const mockFailingCall = async (): Promise<{ success: boolean }> => {
        const timer = new PerformanceTimer()

        try {
          // Simulate service failure
          if (Math.random() < 0.3) {
            // 30% failure rate
            await new Promise(resolve => setTimeout(resolve, 50))
            throw new Error('Service temporarily unavailable')
          }

          await new Promise(resolve => setTimeout(resolve, 100))
          const duration = timer.getDuration()
          helper.recordMetric('failing_service', duration, true)
          return { success: true }
        } catch (error) {
          const duration = timer.getDuration()
          helper.recordMetric('failing_service', duration, false)
          throw error
        }
      }

      // Execute calls with retries
      const executeWithRetry = async (maxRetries = 3): Promise<{ success: boolean }> => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            return await mockFailingCall()
          } catch (error) {
            if (attempt === maxRetries - 1) throw error
            await new Promise(resolve => setTimeout(resolve, 100 * attempt)) // Exponential backoff
          }
        }
      }

      // Test retry mechanism
      const promises = Array.from({ length: 20 }, () => executeWithRetry())
      const results = await Promise.allSettled(promises)

      const successCount = results.filter(r => r.status === 'fulfilled').length

      // Retry mechanism should improve success rate
      expect(successCount).toBeGreaterThan(15) // Should get >75% success with retries
    })

    test('should degrade gracefully under high error rates', async () => {
      const mockDegradingService = async (
        errorRate: number
      ): Promise<{ success: boolean; fallback?: boolean }> => {
        const timer = new PerformanceTimer()

        try {
          if (Math.random() < errorRate) {
            await new Promise(resolve => setTimeout(resolve, 50))
            throw new Error('Service degraded')
          }

          await new Promise(resolve => setTimeout(resolve, 150))
          const duration = timer.getDuration()
          helper.recordMetric('degrading_service', duration, true)
          return { success: true }
        } catch (_error) {
          const duration = timer.getDuration()
          helper.recordMetric('degrading_service', duration, false)
          return { success: false, fallback: true } // Graceful degradation
        }
      }

      // Test with high error rate
      const promises = Array.from({ length: 30 }, () => mockDegradingService(0.5))
      const results = await Promise.all(promises) // Use Promise.all since we handle errors gracefully

      const successCount = results.filter(r => r.success === true).length
      const fallbackCount = results.filter(r => r.fallback === true).length

      // Should provide fallback for failed requests
      expect(successCount + fallbackCount).toBe(30)
      expect(fallbackCount).toBeGreaterThan(0) // Should have some fallbacks
    })
  })

  describe('Memory and Resource Performance', () => {
    test('should manage memory efficiently under load', async () => {
      const initialMemory = process.memoryUsage()

      // Generate significant workload
      const promises = Array.from({ length: 1000 }, async (_, i) => {
        // Create some memory pressure
        const data = new Array(1000).fill(i)
        await mockAPICall('memory-test', 'light')
        return data.length
      })

      await Promise.all(promises)

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage()
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed

      // Memory growth should be reasonable (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024)
    })

    test('should handle large data processing efficiently', async () => {
      const processLargeDataset = async (size: number): Promise<number> => {
        const timer = new PerformanceTimer()

        // Simulate large data processing
        const data = new Array(size).fill(0).map((_, i) => ({
          id: i,
          data: `item-${i}`,
          timestamp: Date.now(),
        }))

        // Process data
        const processed = data.filter(item => item.id % 2 === 0)

        const duration = timer.getDuration()
        helper.recordMetric('large_data_processing', duration, true, {
          size,
          processedCount: processed.length,
        })

        return processed.length
      }

      // Test with different data sizes
      const smallResult = await processLargeDataset(1000)
      const mediumResult = await processLargeDataset(10000)
      const largeResult = await processLargeDataset(100000)

      // Verify results
      expect(smallResult).toBe(500)
      expect(mediumResult).toBe(5000)
      expect(largeResult).toBe(50000)

      // Performance should scale reasonably
      const metrics = helper.getMetrics().filter(m => m.operation === 'large_data_processing')
      const smallTime = metrics.find(m => m.metadata?.size === 1000)?.duration || 0
      const largeTime = metrics.find(m => m.metadata?.size === 100000)?.duration || 0

      // Large dataset should not be more than 100x slower
      expect(largeTime / smallTime).toBeLessThan(100)
    })
  })

  describe('Monitoring Integration Performance', () => {
    test('should track performance metrics without significant overhead', async () => {
      // Test without monitoring
      const withoutMonitoringStart = Date.now()
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      const withoutMonitoringTime = Date.now() - withoutMonitoringStart

      // Test with monitoring
      const withMonitoringStart = Date.now()
      for (let i = 0; i < 100; i++) {
        const timer = new PerformanceTimer()
        await new Promise(resolve => setTimeout(resolve, 10))
        const duration = timer.getDuration()
        helper.recordMetric('monitoring_overhead_test', duration, true)

        // Simulate monitoring tracking
        apiMonitoring.trackRequest('/api/test', 'GET', 200, duration, { test: 'overhead' })
      }
      const withMonitoringTime = Date.now() - withMonitoringStart

      // Monitoring overhead should be minimal (less than 20% increase)
      const overhead = (withMonitoringTime - withoutMonitoringTime) / withoutMonitoringTime
      expect(overhead).toBeLessThan(0.2)
    })

    test('should aggregate performance data correctly', async () => {
      // Generate varied performance data
      const operations = ['search', 'auth', 'database']
      const promises: Promise<{
        success: boolean
        data: { endpoint: string; response: string }
      }>[] = []

      for (const operation of operations) {
        for (let i = 0; i < 50; i++) {
          promises.push(mockAPICall(operation, Math.random() > 0.5 ? 'light' : 'heavy'))
        }
      }

      await Promise.allSettled(promises)

      // Verify monitoring captured all operations
      const allMetrics = helper.getMetrics()
      expect(allMetrics.length).toBeGreaterThan(100)

      // Verify metrics for each operation type
      for (const operation of operations) {
        const operationMetrics = allMetrics.filter(m => m.operation.includes(operation))
        expect(operationMetrics.length).toBeGreaterThan(0)

        // Should have reasonable performance distribution
        const avgTime = helper.getAverageTime(`api_call_${operation}_light`)
        const p95Time = helper.getPercentile(`api_call_${operation}_light`, 95)

        if (avgTime > 0) {
          expect(p95Time).toBeGreaterThan(avgTime)
          expect(p95Time).toBeLessThan(avgTime * 5) // 95th percentile shouldn't be too extreme
        }
      }
    })
  })
})
