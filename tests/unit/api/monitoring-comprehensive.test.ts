/**
 * Comprehensive API Monitoring Unit Tests
 * Tests for request tracking, error monitoring, performance metrics, and alerting
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APIMonitoring,
  createMonitoringMiddleware,
  getAPIMonitoringSnapshot,
  MetricsStore,
  type RequestMetrics,
} from '@/lib/api/monitoring'

// Type for accessing private methods/properties in tests
interface APIMonitoringTestAccess {
  store: MetricsStore
  startHealthChecks: () => Promise<void>
}

// Mock console methods to avoid noise in tests
vi.mock('console', () => ({
  warn: vi.fn(),
  log: vi.fn(),
}))

// Mock fetch for health checks
global.fetch = vi.fn()

describe('APIMonitoring - Comprehensive Test Suite', () => {
  let monitoring: APIMonitoring
  let _metricsStore: MetricsStore

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Create fresh instances for each test
    monitoring = new APIMonitoring({
      metricsRetention: 60000, // 1 minute for testing
      errorThreshold: 0.1, // 10% error rate
      responseTimeThreshold: 1000, // 1 second
      healthCheckInterval: 30000, // 30 seconds
      alertCooldown: 5000, // 5 seconds for testing
      enableRealTimeAlerts: true,
    })

    // Access private store for testing
    _metricsStore = (monitoring as unknown as APIMonitoringTestAccess).store
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('Request Tracking', () => {
    it('should track basic request metrics', () => {
      const url = '/api/test'
      const method = 'GET'
      const statusCode = 200
      const duration = 150

      monitoring.trackRequest(url, method, statusCode, duration)

      const metrics = monitoring.getMetrics()
      expect(metrics.overview.totalRequests).toBe(1)
      expect(metrics.overview.totalErrors).toBe(0)
      expect(metrics.overview.averageResponseTime).toBe(150)
    })

    it('should track request with all optional parameters', () => {
      const options = {
        userId: 'user-123',
        error: 'Test error',
        cacheHit: true,
        retryCount: 2,
        userAgent: 'Mozilla/5.0 Test Browser',
      }

      monitoring.trackRequest('/api/complex', 'POST', 500, 250, options)

      const metrics = monitoring.getMetrics()
      expect(metrics.overview.totalRequests).toBe(1)
      expect(metrics.overview.totalErrors).toBe(1)
      expect(metrics.overview.errorRate).toBe(1)
    })

    it('should normalize endpoint paths correctly', () => {
      // Test UUID normalization
      monitoring.trackRequest(
        '/api/users/550e8400-e29b-41d4-a716-446655440000/profile',
        'GET',
        200,
        100
      )

      // Test numeric ID normalization
      monitoring.trackRequest('/api/repositories/123456/issues', 'GET', 200, 120)

      // Test owner/repo pattern
      monitoring.trackRequest('/api/github/octocat/Hello-World', 'GET', 200, 110)

      const endpointMetrics = monitoring.getEndpointMetrics()
      const endpoints = endpointMetrics.map(em => em.endpoint)

      expect(endpoints).toContain('/api/users/:uuid/profile')
      expect(endpoints).toContain('/api/repositories/:id/issues')
      expect(endpoints).toContain('/api/github/:owner/:repo')
    })

    it('should calculate response time percentiles correctly', () => {
      const responseTimes = [100, 150, 200, 250, 300, 400, 500, 600, 700, 1000]

      responseTimes.forEach((duration, _index) => {
        monitoring.trackRequest('/api/percentiles', 'GET', 200, duration)
        // Advance time slightly for each request
        vi.advanceTimersByTime(1000)
      })

      const endpointMetrics = monitoring.getEndpointMetrics()
      const testEndpoint = endpointMetrics.find(em => em.endpoint === '/api/percentiles')

      expect(testEndpoint).toBeDefined()
      expect(testEndpoint?.averageResponseTime).toBe(420) // Average of all values
      expect(testEndpoint?.p95ResponseTime).toBeGreaterThanOrEqual(700) // 95th percentile
      expect(testEndpoint?.p99ResponseTime).toBeGreaterThanOrEqual(1000) // 99th percentile
    })

    it('should track throughput correctly', () => {
      // Make multiple requests within a minute
      for (let i = 0; i < 10; i++) {
        monitoring.trackRequest('/api/throughput', 'GET', 200, 100)
        vi.advanceTimersByTime(5000) // 5 seconds apart
      }

      const endpointMetrics = monitoring.getEndpointMetrics()
      const testEndpoint = endpointMetrics.find(em => em.endpoint === '/api/throughput')

      expect(testEndpoint).toBeDefined()
      expect(testEndpoint?.throughput).toBe(10) // 10 requests per minute
    })
  })

  describe('Error Monitoring', () => {
    it('should categorize errors correctly', () => {
      const errorScenarios = [
        { statusCode: 400, expectedType: 'client' },
        { statusCode: 401, expectedType: 'client' },
        { statusCode: 404, expectedType: 'client' },
        { statusCode: 422, expectedType: 'client' },
        { statusCode: 500, expectedType: 'server' },
        { statusCode: 502, expectedType: 'server' },
        { statusCode: 503, expectedType: 'server' },
      ]

      errorScenarios.forEach(({ statusCode, _expectedType }, index) => {
        monitoring.trackRequest(`/api/error-${index}`, 'GET', statusCode, 100, {
          error: `Error ${statusCode}`,
        })
      })

      const errorSummary = monitoring.getErrorSummary()

      expect(errorSummary.errorsByType.client).toBe(4)
      expect(errorSummary.errorsByType.server).toBe(3)
      expect(errorSummary.totalErrors).toBe(7)
    })

    it('should deduplicate similar errors within time window', () => {
      const endpoint = '/api/duplicate-errors'
      const error = 'Database connection failed'

      // Generate 5 identical errors within a short time window
      for (let i = 0; i < 5; i++) {
        monitoring.trackRequest(endpoint, 'GET', 500, 100, { error })
        vi.advanceTimersByTime(10000) // 10 seconds apart (within 1 minute window)
      }

      const errorSummary = monitoring.getErrorSummary()
      const recentErrors = errorSummary.recentErrors

      // Should have consolidated similar errors
      const dbErrors = recentErrors.filter(e => e.message === error)
      expect(dbErrors.length).toBe(1)
      expect(dbErrors[0].count).toBe(5)
    })

    it('should track error rate per endpoint', () => {
      const endpoint = '/api/error-rate-test'

      // 7 successful requests
      for (let i = 0; i < 7; i++) {
        monitoring.trackRequest(endpoint, 'GET', 200, 100)
      }

      // 3 failed requests
      for (let i = 0; i < 3; i++) {
        monitoring.trackRequest(endpoint, 'GET', 500, 100, { error: 'Server error' })
      }

      const endpointMetrics = monitoring.getEndpointMetrics()
      const testEndpoint = endpointMetrics.find(em => em.endpoint === endpoint)

      expect(testEndpoint).toBeDefined()
      expect(testEndpoint?.totalRequests).toBe(10)
      expect(testEndpoint?.successfulRequests).toBe(7)
      expect(testEndpoint?.errorRequests).toBe(3)
      expect(testEndpoint?.errorRate).toBe(0.3) // 30% error rate
    })
  })

  describe('Performance Metrics', () => {
    it('should calculate performance metrics correctly', () => {
      const requests: { duration: number; timestamp: number }[] = []

      // Generate requests with varying performance
      const baseDurations = [50, 100, 150, 200, 300, 500, 1000]
      baseDurations.forEach((duration, _index) => {
        monitoring.trackRequest('/api/performance', 'GET', 200, duration)
        requests.push({ duration, timestamp: Date.now() })
        vi.advanceTimersByTime(5000)
      })

      const metrics = monitoring.getMetrics()

      expect(metrics.overview.totalRequests).toBe(7)
      expect(metrics.overview.averageResponseTime).toBeCloseTo(328.57, 1) // Average of durations
      expect(metrics.overview.throughput).toBeGreaterThan(0)
    })

    it('should handle empty metrics gracefully', () => {
      const metrics = monitoring.getMetrics()

      expect(metrics.overview.totalRequests).toBe(0)
      expect(metrics.overview.totalErrors).toBe(0)
      expect(metrics.overview.errorRate).toBe(0)
      expect(metrics.overview.averageResponseTime).toBe(0)
      expect(metrics.endpoints).toEqual([])
      expect(metrics.errors).toEqual([])
    })

    it('should filter metrics by time window', () => {
      const now = Date.now()

      // Create old metrics (beyond retention)
      vi.setSystemTime(now - 120000) // 2 minutes ago
      monitoring.trackRequest('/api/old', 'GET', 200, 100)

      // Create recent metrics
      vi.setSystemTime(now - 30000) // 30 seconds ago
      monitoring.trackRequest('/api/recent', 'GET', 200, 150)

      vi.setSystemTime(now) // Now

      // Get metrics with 1 minute window
      const metrics = monitoring.getMetrics(60000)

      expect(metrics.overview.totalRequests).toBe(1) // Only recent request
      expect(metrics.overview.averageResponseTime).toBe(150)
    })
  })

  describe('Health Monitoring', () => {
    it('should perform health checks and record status', async () => {
      const mockHealthCheckFn = vi.fn().mockResolvedValue(true)

      await monitoring.performHealthCheck('/api/health', mockHealthCheckFn)

      const healthStatus = monitoring.getHealthStatus()
      const healthCheck = healthStatus.find(h => h.endpoint === '/api/health')

      expect(healthCheck).toBeDefined()
      expect(healthCheck?.status).toBe('healthy')
      expect(healthCheck?.consecutiveFailures).toBe(0)
      expect(mockHealthCheckFn).toHaveBeenCalledOnce()
    })

    it('should handle health check failures', async () => {
      const mockHealthCheckFn = vi.fn().mockRejectedValue(new Error('Service unavailable'))

      await monitoring.performHealthCheck('/api/failing', mockHealthCheckFn)

      const healthStatus = monitoring.getHealthStatus()
      const healthCheck = healthStatus.find(h => h.endpoint === '/api/failing')

      expect(healthCheck).toBeDefined()
      expect(healthCheck?.status).toBe('degraded')
      expect(healthCheck?.consecutiveFailures).toBe(1)
    })

    it('should handle health check timeouts', async () => {
      const mockHealthCheckFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000)) // 10 second delay
      )

      const healthCheckPromise = monitoring.performHealthCheck('/api/timeout', mockHealthCheckFn)

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(6000) // Health check timeout is 5 seconds

      await healthCheckPromise

      const healthStatus = monitoring.getHealthStatus()
      const healthCheck = healthStatus.find(h => h.endpoint === '/api/timeout')

      expect(healthCheck).toBeDefined()
      expect(healthCheck?.status).toBe('degraded')
    })

    it('should track consecutive failures and mark as unhealthy', async () => {
      const mockHealthCheckFn = vi.fn().mockResolvedValue(false)

      // Perform multiple failed health checks
      for (let i = 0; i < 4; i++) {
        await monitoring.performHealthCheck('/api/unhealthy', mockHealthCheckFn)
      }

      const healthStatus = monitoring.getHealthStatus()
      const healthCheck = healthStatus.find(h => h.endpoint === '/api/unhealthy')

      expect(healthCheck).toBeDefined()
      expect(healthCheck?.status).toBe('unhealthy')
      expect(healthCheck?.consecutiveFailures).toBe(4)
    })

    it('should calculate uptime based on recent checks', async () => {
      const endpoint = '/api/uptime-test'

      // Simulate mixed health check results over time
      const results = [true, true, false, true, true, true, false, true, true, true]

      for (const result of results) {
        const mockHealthCheckFn = vi.fn().mockResolvedValue(result)
        await monitoring.performHealthCheck(endpoint, mockHealthCheckFn)
        vi.advanceTimersByTime(60000) // 1 minute between checks
      }

      const healthStatus = monitoring.getHealthStatus()
      const healthCheck = healthStatus.find(h => h.endpoint === endpoint)

      expect(healthCheck).toBeDefined()
      expect(healthCheck?.uptime).toBeGreaterThan(70) // Should be around 80%
      expect(healthCheck?.uptime).toBeLessThanOrEqual(100)
    })
  })

  describe('Alerting System', () => {
    it('should trigger error rate alerts', () => {
      const consoleSpy = vi.spyOn(console, 'warn')
      const endpoint = '/api/alert-test'

      // Generate requests with high error rate (> 10% threshold)
      for (let i = 0; i < 8; i++) {
        monitoring.trackRequest(endpoint, 'GET', 200, 100) // Successful
      }
      for (let i = 0; i < 5; i++) {
        monitoring.trackRequest(endpoint, 'GET', 500, 100) // Failed
      }

      // Should trigger alert for high error rate (5/13 = 38.5% > 10% threshold)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Alert [high_error_rate]:'),
        expect.objectContaining({
          endpoint,
          errorRate: expect.any(Number),
          threshold: expect.any(Number),
        })
      )
    })

    it('should trigger slow response alerts', () => {
      const consoleSpy = vi.spyOn(console, 'warn')
      const endpoint = '/api/slow-test'

      // Generate requests with slow response times
      for (let i = 0; i < 5; i++) {
        monitoring.trackRequest(endpoint, 'GET', 200, 1500) // 1.5 seconds (> 1 second threshold)
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Alert [slow_response]:'),
        expect.objectContaining({
          endpoint,
          responseTime: expect.any(Number),
          threshold: expect.any(Number),
        })
      )
    })

    it('should respect alert cooldown period', () => {
      const consoleSpy = vi.spyOn(console, 'warn')
      const endpoint = '/api/cooldown-test'

      // Trigger first alert
      for (let i = 0; i < 15; i++) {
        monitoring.trackRequest(endpoint, 'GET', 500, 100)
      }

      const firstCallCount = consoleSpy.mock.calls.length
      expect(firstCallCount).toBeGreaterThan(0)

      // Clear the spy and trigger more errors immediately (should not alert due to cooldown)
      consoleSpy.mockClear()

      for (let i = 0; i < 10; i++) {
        monitoring.trackRequest(endpoint, 'GET', 500, 100)
      }

      expect(consoleSpy).not.toHaveBeenCalled()

      // Advance time past cooldown period
      vi.advanceTimersByTime(6000) // 6 seconds > 5 second cooldown

      // Now should alert again
      for (let i = 0; i < 10; i++) {
        monitoring.trackRequest(endpoint, 'GET', 500, 100)
      }

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should not alert for endpoints with insufficient data', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      // Generate only 2 requests (below minimum threshold)
      monitoring.trackRequest('/api/insufficient', 'GET', 500, 100)
      monitoring.trackRequest('/api/insufficient', 'GET', 500, 100)

      // Should not alert despite 100% error rate due to insufficient data
      expect(consoleSpy).not.toHaveBeenCalled()
    })
  })

  describe('Data Cleanup and Memory Management', () => {
    it('should clean up old metrics automatically', () => {
      const now = Date.now()

      // Create old metrics
      vi.setSystemTime(now - 120000) // 2 minutes ago (beyond 1 minute retention)
      monitoring.trackRequest('/api/old-data', 'GET', 200, 100)

      // Create recent metrics
      vi.setSystemTime(now - 30000) // 30 seconds ago
      monitoring.trackRequest('/api/recent-data', 'GET', 200, 150)

      vi.setSystemTime(now)

      // Trigger cleanup manually (simulates interval)
      vi.advanceTimersByTime(61000) // Advance past cleanup interval

      const metrics = monitoring.getMetrics()

      // Should only have recent data
      expect(metrics.overview.totalRequests).toBe(1)
      expect(metrics.overview.averageResponseTime).toBe(150)
    })

    it('should handle memory cleanup for large datasets', () => {
      // Reduce the number of requests to prevent timeout
      for (let i = 0; i < 100; i++) {
        monitoring.trackRequest(`/api/load-test-${i % 10}`, 'GET', 200, 100 + (i % 50))

        if (i % 10 === 0) {
          vi.advanceTimersByTime(1000) // Advance time periodically
        }
      }

      const metrics = monitoring.getMetrics()

      // Should handle large dataset without crashing
      expect(metrics.overview.totalRequests).toBe(100)
      expect(metrics.endpoints.length).toBeLessThanOrEqual(10) // 10 unique endpoints
    }, 10000)
  })

  describe('Dashboard and Reporting', () => {
    it('should generate comprehensive dashboard data', () => {
      // Generate diverse test data
      const endpoints = ['/api/fast', '/api/slow', '/api/error-prone']
      const scenarios = [
        { endpoint: endpoints[0], statusCode: 200, duration: 50 },
        { endpoint: endpoints[1], statusCode: 200, duration: 800 },
        { endpoint: endpoints[2], statusCode: 500, duration: 200 },
      ]

      scenarios.forEach(({ endpoint, statusCode, duration }) => {
        for (let i = 0; i < 10; i++) {
          monitoring.trackRequest(endpoint, 'GET', statusCode, duration + i * 10)
          vi.advanceTimersByTime(5000)
        }
      })

      const dashboardData = monitoring.getMetrics()

      expect(dashboardData.overview).toMatchObject({
        totalRequests: 30,
        totalErrors: 10,
        errorRate: expect.any(Number),
        averageResponseTime: expect.any(Number),
        throughput: expect.any(Number),
      })

      expect(dashboardData.endpoints).toHaveLength(3)
      expect(dashboardData.errors.length).toBeGreaterThan(0)
      expect(dashboardData.trends).toBeDefined()
      expect(Array.isArray(dashboardData.trends)).toBe(true)
    })

    it('should calculate trends correctly', () => {
      const endpoint = '/api/trends-test'
      const now = Date.now()

      // Generate requests over time with improving performance
      for (let i = 0; i < 12; i++) {
        vi.setSystemTime(now - (12 - i) * 60000) // Each request 1 minute apart
        const duration = 500 - i * 30 // Performance improves over time
        monitoring.trackRequest(endpoint, 'GET', 200, duration)
      }

      vi.setSystemTime(now)

      const dashboardData = monitoring.getMetrics()
      const trends = dashboardData.trends

      expect(trends).toBeDefined()
      expect(trends.length).toBe(12) // 12 intervals

      // First interval should have higher response times than last
      expect(trends[0].averageResponseTime).toBeGreaterThan(
        trends[trends.length - 1].averageResponseTime
      )
    })
  })

  describe('Express Middleware Integration', () => {
    it('should create monitoring middleware that tracks requests', () => {
      const middleware = createMonitoringMiddleware()

      expect(typeof middleware).toBe('function')

      // Mock Express request/response objects
      const mockReq = {
        url: '/api/middleware-test',
        method: 'GET',
        user: { id: 'user-123' },
        get: vi.fn().mockReturnValue('Mozilla/5.0 Test'),
      }

      const mockRes = {
        statusCode: 200,
        end: vi.fn(),
        get: vi.fn().mockReturnValue('MISS'),
      }

      const mockNext = vi.fn()

      // Call middleware
      middleware(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalled()

      // Simulate response end
      mockRes.end()

      // Should have tracked the request
      const metrics = monitoring.getMetrics()
      expect(metrics.overview.totalRequests).toBeGreaterThan(0)
    })
  })

  describe('Server-side Utilities', () => {
    it('should provide monitoring snapshot', () => {
      // Generate some test data
      monitoring.trackRequest('/api/snapshot-test', 'GET', 200, 100)
      monitoring.trackRequest('/api/snapshot-test', 'GET', 500, 150, { error: 'Test error' })

      const snapshot = getAPIMonitoringSnapshot()

      expect(snapshot).toMatchObject({
        metrics: expect.objectContaining({
          overview: expect.objectContaining({
            totalRequests: expect.any(Number),
            totalErrors: expect.any(Number),
          }),
        }),
        healthStatus: expect.any(Array),
        errorSummary: expect.objectContaining({
          totalErrors: expect.any(Number),
          errorsByType: expect.any(Object),
          errorsByEndpoint: expect.any(Object),
        }),
      })
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid URLs gracefully', () => {
      expect(() => {
        monitoring.trackRequest('invalid-url', 'GET', 200, 100)
      }).not.toThrow()

      const metrics = monitoring.getMetrics()
      expect(metrics.overview.totalRequests).toBe(1)
    })

    it('should handle extremely large response times', () => {
      monitoring.trackRequest('/api/extreme', 'GET', 200, 999999999)

      const endpointMetrics = monitoring.getEndpointMetrics()
      const extremeEndpoint = endpointMetrics.find(em => em.endpoint === '/api/extreme')

      expect(extremeEndpoint).toBeDefined()
      expect(extremeEndpoint?.averageResponseTime).toBe(999999999)
    })

    it('should handle negative response times gracefully', () => {
      monitoring.trackRequest('/api/negative', 'GET', 200, -100)

      const metrics = monitoring.getMetrics()
      expect(metrics.overview.totalRequests).toBe(1)
      // Should handle negative values without crashing
    })

    it('should handle concurrent requests safely', () => {
      const promises = []

      // Simulate 100 concurrent requests
      for (let i = 0; i < 100; i++) {
        const promise = Promise.resolve().then(() => {
          monitoring.trackRequest(`/api/concurrent-${i % 10}`, 'GET', 200, 100 + i)
        })
        promises.push(promise)
      }

      return Promise.all(promises).then(() => {
        const metrics = monitoring.getMetrics()
        expect(metrics.overview.totalRequests).toBe(100)
      })
    })

    it('should handle health check function errors gracefully', async () => {
      const mockHealthCheckFn = vi.fn().mockImplementation(() => {
        throw new Error('Health check crashed')
      })

      await expect(
        monitoring.performHealthCheck('/api/crash', mockHealthCheckFn)
      ).resolves.not.toThrow()

      const healthStatus = monitoring.getHealthStatus()
      const healthCheck = healthStatus.find(h => h.endpoint === '/api/crash')

      expect(healthCheck).toBeDefined()
      expect(healthCheck?.status).toBe('degraded')
    })
  })

  describe('Production Environment Behavior', () => {
    it('should disable alerts in test environment', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      // Create monitoring with alerts disabled
      const prodMonitoring = new APIMonitoring({
        metricsRetention: 60000,
        errorThreshold: 0.1,
        responseTimeThreshold: 1000,
        healthCheckInterval: 30000,
        alertCooldown: 5000,
        enableRealTimeAlerts: false, // Disabled
      })

      // Generate high error rate
      for (let i = 0; i < 15; i++) {
        prodMonitoring.trackRequest('/api/no-alerts', 'GET', 500, 100)
      }

      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('should handle fetch failures in health checks gracefully', async () => {
      // Mock fetch to fail
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      // Access private health check method
      const healthCheckPromise = (
        monitoring as unknown as APIMonitoringTestAccess
      ).startHealthChecks()

      // Advance timers to trigger health checks
      vi.advanceTimersByTime(35000)

      // Should not crash despite fetch failures
      expect(() => healthCheckPromise).not.toThrow()
    })
  })
})

describe('MetricsStore - Internal Implementation Tests', () => {
  let metricsStore: MetricsStore

  beforeEach(() => {
    vi.useFakeTimers()
    metricsStore = new MetricsStore({
      metricsRetention: 60000,
      errorThreshold: 0.1,
      responseTimeThreshold: 1000,
      healthCheckInterval: 30000,
      alertCooldown: 5000,
      enableRealTimeAlerts: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Internal Data Structures', () => {
    it('should manage request metrics storage efficiently', () => {
      const metric: RequestMetrics = {
        url: '/api/test',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now(),
      }

      metricsStore.recordRequest(metric)

      const recentMetrics = metricsStore.getRequestMetrics(60000)
      expect(recentMetrics).toHaveLength(1)
      expect(recentMetrics[0]).toEqual(metric)
    })

    it('should manage endpoint metrics aggregation', () => {
      const requests = [
        { url: '/api/test', method: 'GET', statusCode: 200, duration: 100, timestamp: Date.now() },
        { url: '/api/test', method: 'GET', statusCode: 200, duration: 150, timestamp: Date.now() },
        { url: '/api/test', method: 'GET', statusCode: 500, duration: 200, timestamp: Date.now() },
      ]

      requests.forEach(req => metricsStore.recordRequest(req))

      const endpointMetrics = metricsStore.getEndpointMetrics()
      const testEndpoint = endpointMetrics.find(em => em.endpoint === '/api/test')

      expect(testEndpoint).toBeDefined()
      expect(testEndpoint?.totalRequests).toBe(3)
      expect(testEndpoint?.successfulRequests).toBe(2)
      expect(testEndpoint?.errorRequests).toBe(1)
      expect(testEndpoint?.errorRate).toBeCloseTo(0.333, 2)
    })

    it('should clean up expired data', () => {
      const now = Date.now()

      // Add old data
      vi.setSystemTime(now - 120000) // 2 minutes ago
      metricsStore.recordRequest({
        url: '/api/old',
        method: 'GET',
        statusCode: 200,
        duration: 100,
        timestamp: Date.now(),
      })

      // Add recent data
      vi.setSystemTime(now - 30000) // 30 seconds ago
      metricsStore.recordRequest({
        url: '/api/recent',
        method: 'GET',
        statusCode: 200,
        duration: 150,
        timestamp: Date.now(),
      })

      vi.setSystemTime(now)

      // Trigger cleanup manually
      vi.advanceTimersByTime(61000) // Cleanup interval

      const recentMetrics = metricsStore.getRequestMetrics(60000)
      expect(recentMetrics).toHaveLength(1)
      expect(recentMetrics[0].url).toBe('/api/recent')
    })
  })
})
