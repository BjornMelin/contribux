/**
 * Load Testing Metrics & Monitoring
 *
 * Tests performance measurement, reporting, and threshold validation.
 * Focuses on comprehensive metrics collection and analysis.
 */

import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github'
import { createRateLimitHeaders } from '../github/test-helpers'
import { createMockUser, LOAD_TEST_CONFIG } from './fixtures/load-test-data'
import {
  PerformanceMonitor,
  setupPerformanceTest,
  validatePerformanceResults,
} from './setup/performance-setup'
import {
  addTestHandlers,
  calculatePerformanceMetrics,
  createTrackedClient,
  logPerformanceMetrics,
  type PerformanceMetrics,
} from './utils/load-test-helpers'

describe('Load Testing - Metrics & Monitoring', () => {
  const setup = setupPerformanceTest()

  beforeAll(setup.beforeAll)
  beforeEach(setup.beforeEach)
  afterEach(setup.afterEach)
  afterAll(setup.afterAll)

  describe('Performance Metrics Collection', () => {
    it('should track performance metrics during load testing', async () => {
      const concurrency = 12
      let requestCount = 0
      const requestTimings: Array<{ start: number; end: number; duration: number }> = []

      const metricsHandler = http.get('https://api.github.com/user', async () => {
        requestCount++
        // Fixed 25ms delay
        await new Promise(resolve => setTimeout(resolve, 25))

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(metricsHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'metrics_test_token' },
        retry: { retries: 1 },
      })

      // Execute requests with timing tracking
      const testStart = Date.now()
      const promises = Array.from({ length: concurrency }, async () => {
        const start = Date.now()
        try {
          const result = await client.rest.users.getAuthenticated()
          const end = Date.now()
          const duration = end - start
          requestTimings.push({ start, end, duration })
          return { success: true, id: result.data.id, duration }
        } catch (error) {
          const end = Date.now()
          const duration = end - start
          requestTimings.push({ start, end, duration })
          return { success: false, error, duration }
        }
      })

      const results = await Promise.all(promises)
      const testEnd = Date.now()

      // Calculate performance metrics
      const successes = results.filter(r => r.success)
      const failures = results.filter(r => !r.success)
      const durations = requestTimings.map(t => t.duration)

      const testDuration = Math.max(testEnd - testStart, 1)

      const metrics: PerformanceMetrics = {
        totalRequests: results.length,
        successCount: successes.length,
        failureCount: failures.length,
        successRate: (successes.length / results.length) * 100,
        totalTestDuration: testDuration,
        avgRequestDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minRequestDuration: Math.min(...durations),
        maxRequestDuration: Math.max(...durations),
        p95RequestDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)],
        p99RequestDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)],
        requestsPerSecond: (results.length / testDuration) * 1000,
      }

      // Verify performance targets
      expect(metrics.successRate).toBeGreaterThan(80)
      expect(metrics.avgRequestDuration).toBeLessThan(500)
      expect(metrics.p95RequestDuration).toBeLessThan(1000)
      expect(metrics.requestsPerSecond).toBeGreaterThan(2)

      // Log comprehensive metrics
      logPerformanceMetrics(metrics)
      console.log(`- Cache Hit Ratio: ${(client.getCacheMetrics().hitRatio * 100).toFixed(1)}%`)

      expect(metrics).toMatchObject({
        totalRequests: concurrency,
        successCount: expect.any(Number),
        failureCount: expect.any(Number),
        successRate: expect.any(Number),
        requestsPerSecond: expect.any(Number),
      })

      await client.destroy()
    }, 20000)

    it('should calculate accurate performance metrics', async () => {
      const testResults = [
        { success: true, duration: 100 },
        { success: true, duration: 150 },
        { success: true, duration: 200 },
        { success: false, duration: 300 },
        { success: true, duration: 120 },
      ]
      const testDuration = 1000

      const metrics = calculatePerformanceMetrics(testResults, testDuration)

      expect(metrics.totalRequests).toBe(5)
      expect(metrics.successCount).toBe(4)
      expect(metrics.failureCount).toBe(1)
      expect(metrics.successRate).toBe(80)
      expect(metrics.totalTestDuration).toBe(1000)
      expect(metrics.avgRequestDuration).toBe(174) // (100+150+200+300+120)/5
      expect(metrics.minRequestDuration).toBe(100)
      expect(metrics.maxRequestDuration).toBe(300)
      expect(metrics.requestsPerSecond).toBe(5) // 5 requests / 1 second

      console.log('Calculated metrics:', metrics)
    })

    it('should monitor performance trends over time', async () => {
      const batchCount = 3
      const batchSize = 5
      const performanceMonitor = new PerformanceMonitor()
      const trendMetrics: PerformanceMetrics[] = []

      let requestCount = 0

      const trendHandler = http.get('https://api.github.com/user', async () => {
        requestCount++
        // Variable delay to simulate performance changes
        const delay = 10 + requestCount * 2 // Increasing delay over time
        await new Promise(resolve => setTimeout(resolve, delay))

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(trendHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'trend_test_token' },
      })

      performanceMonitor.start()

      // Execute multiple batches and track performance trends
      for (let batch = 0; batch < batchCount; batch++) {
        const batchStart = Date.now()

        const promises = Array.from({ length: batchSize }, async () => {
          const requestStart = Date.now()
          const result = await client.rest.users.getAuthenticated()
          const requestEnd = Date.now()
          return {
            success: true,
            duration: requestEnd - requestStart,
            id: result.data.id,
          }
        })

        const batchResults = await Promise.all(promises)
        const batchEnd = Date.now()
        const batchDuration = batchEnd - batchStart

        // Calculate metrics for this batch
        const batchMetrics = calculatePerformanceMetrics(batchResults, batchDuration)
        trendMetrics.push(batchMetrics)

        performanceMonitor.mark(`Batch ${batch + 1}`)

        console.log(`Batch ${batch + 1} metrics:`, {
          avgDuration: batchMetrics.avgRequestDuration.toFixed(2),
          requestsPerSecond: batchMetrics.requestsPerSecond.toFixed(2),
        })

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Analyze performance trends
      expect(trendMetrics).toHaveLength(batchCount)

      // Check if performance degraded over time (due to increasing delays)
      const firstBatchAvg = trendMetrics[0].avgRequestDuration
      const lastBatchAvg = trendMetrics[trendMetrics.length - 1].avgRequestDuration

      expect(lastBatchAvg).toBeGreaterThan(firstBatchAvg) // Performance should degrade

      console.log('Performance trend analysis:')
      console.log(`First batch avg: ${firstBatchAvg.toFixed(2)}ms`)
      console.log(`Last batch avg: ${lastBatchAvg.toFixed(2)}ms`)
      console.log(
        `Performance degradation: ${(((lastBatchAvg - firstBatchAvg) / firstBatchAvg) * 100).toFixed(1)}%`
      )

      await client.destroy()
    })

    it('should validate against performance thresholds', async () => {
      const testResults = [
        { success: true, duration: 50 },
        { success: true, duration: 75 },
        { success: true, duration: 100 },
        { success: true, duration: 125 },
        { success: true, duration: 150 },
      ]

      const validation = validatePerformanceResults(testResults, {
        minSuccessRate: 90,
        maxAvgDuration: 120,
        maxP95Duration: 200,
      })

      expect(validation.valid).toBe(true)
      expect(validation.violations).toHaveLength(0)
      expect(validation.metrics.successRate).toBe(100)
      expect(validation.metrics.avgDuration).toBe(100)

      console.log('Threshold validation:', validation)
    })

    it('should detect performance threshold violations', async () => {
      const testResults = [
        { success: true, duration: 200 },
        { success: false, duration: 300 },
        { success: true, duration: 400 },
        { success: false, duration: 500 },
        { success: true, duration: 600 },
      ]

      const validation = validatePerformanceResults(testResults, {
        minSuccessRate: 90,
        maxAvgDuration: 200,
        maxP95Duration: 300,
      })

      expect(validation.valid).toBe(false)
      expect(validation.violations.length).toBeGreaterThan(0)
      expect(validation.metrics.successRate).toBe(60) // 3/5 success
      expect(validation.metrics.avgDuration).toBe(400) // (200+300+400+500+600)/5

      console.log('Threshold violations:', validation.violations)
    })
  })

  describe('Real-time Monitoring', () => {
    it('should track request timings in real-time', async () => {
      const concurrency = LOAD_TEST_CONFIG.HIGH_CONCURRENCY
      let requestCount = 0
      const realTimeMetrics: Array<{ timestamp: number; requestId: number; duration: number }> = []

      const realTimeHandler = http.get('https://api.github.com/user', async () => {
        requestCount++
        const requestId = requestCount
        const processingStart = Date.now()

        // Variable processing time
        const delay = 10 + Math.random() * 20
        await new Promise(resolve => setTimeout(resolve, delay))

        const processingEnd = Date.now()
        realTimeMetrics.push({
          timestamp: processingEnd,
          requestId,
          duration: processingEnd - processingStart,
        })

        return HttpResponse.json(createMockUser(requestId), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestId }),
        })
      })

      await addTestHandlers(realTimeHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'realtime_test_token' },
      })

      // Execute concurrent requests
      const promises = Array.from({ length: concurrency }, async () => {
        const result = await client.rest.users.getAuthenticated()
        return result.data.id
      })

      const results = await Promise.all(promises)

      // Verify real-time tracking
      expect(results).toHaveLength(concurrency)
      expect(realTimeMetrics).toHaveLength(concurrency)
      expect(requestCount).toBe(concurrency)

      // Analyze real-time metrics
      const sortedByTime = [...realTimeMetrics].sort((a, b) => a.timestamp - b.timestamp)
      const avgDuration =
        realTimeMetrics.reduce((sum, m) => sum + m.duration, 0) / realTimeMetrics.length

      console.log('Real-time metrics:')
      console.log(`- Requests tracked: ${realTimeMetrics.length}`)
      console.log(`- Average processing time: ${avgDuration.toFixed(2)}ms`)
      console.log(
        `- Time span: ${sortedByTime[sortedByTime.length - 1].timestamp - sortedByTime[0].timestamp}ms`
      )

      await client.destroy()
    })

    it('should monitor system resource usage patterns', async () => {
      const concurrency = LOAD_TEST_CONFIG.DEFAULT_CONCURRENCY
      let requestCount = 0
      const resourceMetrics: Array<{
        timestamp: number
        memoryUsage: number
        connectionCount: number
      }> = []

      const resourceHandler = http.get('https://api.github.com/user', async () => {
        requestCount++

        // Simulate resource usage tracking
        resourceMetrics.push({
          timestamp: Date.now(),
          memoryUsage: 1000 + requestCount * 50, // Simulated memory growth
          connectionCount: Math.min(requestCount, 10), // Max 10 connections
        })

        await new Promise(resolve => setTimeout(resolve, 15))

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(resourceHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'resource_test_token' },
      })

      // Execute requests while monitoring resources
      const promises = Array.from({ length: concurrency }, async () => {
        const result = await client.rest.users.getAuthenticated()
        return result.data.id
      })

      const results = await Promise.all(promises)

      // Verify resource monitoring
      expect(results).toHaveLength(concurrency)
      expect(resourceMetrics.length).toBeGreaterThan(0)

      // Analyze resource usage patterns
      const maxMemory = Math.max(...resourceMetrics.map(m => m.memoryUsage))
      const maxConnections = Math.max(...resourceMetrics.map(m => m.connectionCount))

      console.log('Resource usage patterns:')
      console.log(`- Peak memory usage: ${maxMemory}`)
      console.log(`- Peak connections: ${maxConnections}`)
      console.log(`- Resource samples: ${resourceMetrics.length}`)

      expect(maxMemory).toBeGreaterThan(1000)
      expect(maxConnections).toBeLessThanOrEqual(10)

      await client.destroy()
    })
  })

  describe('Custom Metrics', () => {
    it('should support custom performance metrics', async () => {
      const customMetrics = new Map<string, number>()
      let requestCount = 0

      const customHandler = http.get('https://api.github.com/user', async () => {
        requestCount++

        // Track custom metrics
        customMetrics.set('api_calls', (customMetrics.get('api_calls') || 0) + 1)
        customMetrics.set('processing_time', Date.now())

        if (requestCount % 3 === 0) {
          customMetrics.set('cache_misses', (customMetrics.get('cache_misses') || 0) + 1)
        }

        await new Promise(resolve => setTimeout(resolve, 20))

        return HttpResponse.json(createMockUser(requestCount), {
          headers: createRateLimitHeaders({ remaining: 5000 - requestCount }),
        })
      })

      await addTestHandlers(customHandler)

      const client = createTrackedClient(GitHubClient, {
        auth: { type: 'token', token: 'custom_metrics_token' },
      })

      // Execute requests with custom metrics
      const promises = Array.from({ length: 9 }, async () => {
        const result = await client.rest.users.getAuthenticated()
        return result.data.id
      })

      const results = await Promise.all(promises)

      // Verify custom metrics collection
      expect(results).toHaveLength(9)
      expect(customMetrics.get('api_calls')).toBe(9)
      expect(customMetrics.get('cache_misses')).toBe(3) // Every 3rd request

      console.log('Custom metrics collected:')
      for (const [metric, value] of customMetrics) {
        console.log(`- ${metric}: ${value}`)
      }

      await client.destroy()
    })
  })
})
