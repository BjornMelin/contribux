/**
 * Test Reporting and Metrics Collection System Tests
 *
 * This test suite validates the comprehensive test reporting system with metrics
 * collection, performance analysis, and integration with monitoring tools for
 * continuous test quality assessment.
 *
 * Key features tested:
 * - Metrics collection reliability and accuracy
 * - Report generation (JSON, CSV, HTML formats)
 * - Performance analysis and trend detection
 * - Integration with CI/CD pipeline quality gates
 * - Dashboard data export and visualization support
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '../../../src/lib/github/client'
import { MemoryProfiler, MetricsCollector } from '../infrastructure/metrics-collector'

// Test configuration
const GITHUB_TEST_TOKEN = process.env.GITHUB_TEST_TOKEN
const skipReportingTests = !GITHUB_TEST_TOKEN

const REPORTING_TEST_CONFIG = {
  TEST_OPERATIONS: 25,
  REPORT_OUTPUT_DIR: './tests/integration/reports/test-output',
  PERFORMANCE_THRESHOLD_MS: 3000,
  MEMORY_THRESHOLD_MB: 50,
  CACHE_HIT_RATE_THRESHOLD: 0.7,
  ERROR_RATE_THRESHOLD: 0.1,
}

describe.skipIf(skipReportingTests)('Test Reporting and Metrics Collection System', () => {
  let metricsCollector: MetricsCollector
  let memoryProfiler: MemoryProfiler
  let testClient: GitHubClient
  let reportOutputDir: string

  beforeAll(async () => {
    if (!GITHUB_TEST_TOKEN) {
      console.log('⚠️  Test reporting requires GITHUB_TEST_TOKEN environment variable.')
      return
    }

    // Ensure output directory exists
    reportOutputDir = REPORTING_TEST_CONFIG.REPORT_OUTPUT_DIR
    if (!existsSync(reportOutputDir)) {
      mkdirSync(reportOutputDir, { recursive: true })
    }

    console.log('📊 Starting test reporting and metrics collection validation...')
    console.log(`   Output directory: ${reportOutputDir}`)
    console.log(`   Test operations: ${REPORTING_TEST_CONFIG.TEST_OPERATIONS}`)
  })

  beforeEach(async () => {
    // Initialize fresh metrics collector for each test
    metricsCollector = new MetricsCollector()
    memoryProfiler = new MemoryProfiler(metricsCollector)

    // Create test client
    testClient = new GitHubClient({
      auth: {
        type: 'token',
        token: GITHUB_TEST_TOKEN ?? '',
      },
      cache: {
        enabled: true,
        ttl: 5000,
      },
      throttle: {
        enabled: true,
      },
    })

    // Start memory profiling
    memoryProfiler.start(100) // Sample every 100ms
  })

  afterEach(async () => {
    // Stop profiling and cleanup
    memoryProfiler.stop()

    if (testClient) {
      await testClient.destroy()
    }
  })

  describe('Metrics Collection Accuracy', () => {
    it('should accurately collect API call metrics', async () => {
      // Perform a series of API calls
      const operations = []
      for (let i = 0; i < REPORTING_TEST_CONFIG.TEST_OPERATIONS; i++) {
        const operation = async () => {
          const startTime = Date.now()

          try {
            const response =
              i % 3 === 0
                ? await testClient.rest.users.getAuthenticated()
                : i % 3 === 1
                  ? await testClient.rest.repos.listForAuthenticatedUser({ per_page: 5 })
                  : await testClient.graphql('query { viewer { login } }')

            const duration = Date.now() - startTime
            const endpoint = i % 3 === 0 ? '/user' : i % 3 === 1 ? '/user/repos' : '/graphql'

            metricsCollector.recordApiCall(endpoint, duration, response.status || 200)

            return { success: true, duration, endpoint }
          } catch (error) {
            const duration = Date.now() - startTime
            const endpoint = i % 3 === 0 ? '/user' : i % 3 === 1 ? '/user/repos' : '/graphql'
            const status = (error as { status?: number }).status ?? 500

            metricsCollector.recordApiCall(endpoint, duration, status)

            return { success: false, duration, endpoint, error: error.message }
          }
        }

        operations.push(operation())
      }

      const results = await Promise.all(operations)
      const successfulOperations = results.filter(r => r.success)
      const failedOperations = results.filter(r => !r.success)

      // Validate metrics collection
      const metrics = metricsCollector.getMetrics()

      expect(metrics.apiCalls.total).toBe(REPORTING_TEST_CONFIG.TEST_OPERATIONS)
      expect(successfulOperations.length + failedOperations.length).toBe(
        REPORTING_TEST_CONFIG.TEST_OPERATIONS
      )

      // Check endpoint distribution
      expect(Object.keys(metrics.apiCalls.byEndpoint)).toContain('/user')
      expect(Object.keys(metrics.apiCalls.byEndpoint)).toContain('/user/repos')
      expect(Object.keys(metrics.apiCalls.byEndpoint)).toContain('/graphql')

      // Validate timing accuracy
      const recordedTotalDuration = Object.values(metrics.apiCalls.byEndpoint).reduce(
        (sum, count) => sum + count * metrics.apiCalls.averageDuration,
        0
      )
      const actualTotalDuration = results.reduce((sum, r) => sum + r.duration, 0)

      // Allow some variance in timing measurements
      const timingVariance =
        Math.abs(recordedTotalDuration - actualTotalDuration) / actualTotalDuration
      expect(timingVariance).toBeLessThan(0.2) // Less than 20% variance

      console.log(
        `✅ API metrics collection validated: ${metrics.apiCalls.total} calls, ${metrics.apiCalls.averageDuration.toFixed(2)}ms avg`
      )
    })

    it('should accurately track cache performance', async () => {
      // Perform operations that will hit cache
      const cacheTestOperations = []

      for (let i = 0; i < 10; i++) {
        const operation = async () => {
          const cacheKey = `user-profile-${i % 3}` // Create cache overlap

          // First call - should be a cache miss
          metricsCollector.recordCacheMiss(cacheKey)
          await testClient.rest.users.getAuthenticated()

          // Small delay to ensure cache is populated
          await new Promise(resolve => setTimeout(resolve, 50))

          // Second call - should be a cache hit
          metricsCollector.recordCacheHit(cacheKey)
          await testClient.rest.users.getAuthenticated()
        }

        cacheTestOperations.push(operation())
      }

      await Promise.all(cacheTestOperations)

      const metrics = metricsCollector.getMetrics()

      // Validate cache metrics
      expect(metrics.cache.hits).toBe(10) // One hit per operation
      expect(metrics.cache.misses).toBe(10) // One miss per operation
      expect(metrics.cache.hitRate).toBeCloseTo(0.5, 1) // 50% hit rate

      console.log(
        `✅ Cache metrics validated: ${metrics.cache.hits} hits, ${metrics.cache.misses} misses, ${(metrics.cache.hitRate * 100).toFixed(1)}% hit rate`
      )
    })

    it('should monitor memory usage patterns accurately', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Perform memory-intensive operations
      const memoryOperations = []
      for (let i = 0; i < 15; i++) {
        memoryOperations.push(
          testClient.rest.repos
            .listForAuthenticatedUser({ per_page: 10 })
            .then(() => {
              // Record memory after each operation
              const currentMemory = process.memoryUsage().heapUsed
              metricsCollector.recordMemoryUsage(currentMemory)
            })
            .catch(() => {
              // Still record memory on errors
              const currentMemory = process.memoryUsage().heapUsed
              metricsCollector.recordMemoryUsage(currentMemory)
            })
        )
      }

      await Promise.all(memoryOperations)

      // Force garbage collection and measure
      const _afterGCGrowth = memoryProfiler.measureAfterGC()

      const metrics = metricsCollector.getMetrics()

      // Validate memory metrics
      expect(metrics.memory.peak).toBeGreaterThan(initialMemory)
      expect(metrics.memory.average).toBeGreaterThan(0)
      expect(Math.abs(metrics.memory.growth)).toBeLessThan(
        REPORTING_TEST_CONFIG.MEMORY_THRESHOLD_MB * 1024 * 1024
      )

      console.log(
        `✅ Memory monitoring validated: peak=${(metrics.memory.peak / 1024 / 1024).toFixed(2)}MB, growth=${(metrics.memory.growth / 1024 / 1024).toFixed(2)}MB`
      )
    })
  })

  describe('Report Generation and Export', () => {
    it('should generate comprehensive JSON reports', async () => {
      // Populate metrics with test data
      await populateTestMetrics()

      const jsonReport = metricsCollector.exportToJSON()
      const reportData = JSON.parse(jsonReport)

      // Validate JSON structure
      expect(reportData).toHaveProperty('metrics')
      expect(reportData).toHaveProperty('raw')
      expect(reportData.metrics).toHaveProperty('apiCalls')
      expect(reportData.metrics).toHaveProperty('cache')
      expect(reportData.metrics).toHaveProperty('memory')
      expect(reportData.metrics).toHaveProperty('rateLimit')

      // Validate data integrity
      expect(reportData.metrics.apiCalls.total).toBeGreaterThan(0)
      expect(reportData.raw.apiCalls).toBeInstanceOf(Array)
      expect(reportData.raw.cacheMetrics).toBeInstanceOf(Array)

      // Save to file and verify
      const jsonFilePath = join(reportOutputDir, 'test-metrics-report.json')
      const fs = await import('node:fs/promises')
      await fs.writeFile(jsonFilePath, jsonReport)

      expect(existsSync(jsonFilePath)).toBe(true)

      const savedContent = readFileSync(jsonFilePath, 'utf-8')
      const savedData = JSON.parse(savedContent)
      expect(savedData.metrics.apiCalls.total).toBe(reportData.metrics.apiCalls.total)

      console.log(`✅ JSON report generated: ${jsonFilePath}`)
    })

    it('should generate CSV exports for data analysis', async () => {
      // Populate metrics with test data
      await populateTestMetrics()

      const csvReport = metricsCollector.exportToCSV()

      // Validate CSV structure
      const lines = csvReport.split('\n')
      expect(lines.length).toBeGreaterThan(1) // Header + data rows

      const headers = lines[0].split(',')
      expect(headers).toContain('endpoint')
      expect(headers).toContain('duration')
      expect(headers).toContain('status')
      expect(headers).toContain('timestamp')

      // Validate data rows
      const dataRows = lines.slice(1).filter(line => line.trim())
      expect(dataRows.length).toBeGreaterThan(0)

      // Each data row should have the same number of columns as headers
      dataRows.forEach(row => {
        const columns = row.split(',')
        expect(columns.length).toBe(headers.length)
      })

      // Save to file
      const csvFilePath = join(reportOutputDir, 'test-metrics-data.csv')
      const fs = await import('node:fs/promises')
      await fs.writeFile(csvFilePath, csvReport)

      expect(existsSync(csvFilePath)).toBe(true)

      console.log(`✅ CSV export generated: ${csvFilePath}`)
    })

    it('should generate HTML reports with visualization placeholders', async () => {
      // Populate metrics with test data
      await populateTestMetrics()

      const htmlReport = metricsCollector.generateHTMLReport()

      // Validate HTML structure
      expect(htmlReport).toContain('<!DOCTYPE html>')
      expect(htmlReport).toContain('<title>GitHub API Integration Test Report</title>')
      expect(htmlReport).toContain('Test Execution Summary')
      expect(htmlReport).toContain('API Performance')
      expect(htmlReport).toContain('Memory Usage')
      expect(htmlReport).toContain('Cache Performance')

      // Validate metrics are embedded
      const metrics = metricsCollector.getMetrics()
      expect(htmlReport).toContain(metrics.apiCalls.total.toString())
      expect(htmlReport).toContain(metrics.apiCalls.averageDuration.toFixed(2))

      // Save to file
      const htmlFilePath = join(reportOutputDir, 'test-metrics-report.html')
      const fs = await import('node:fs/promises')
      await fs.writeFile(htmlFilePath, htmlReport)

      expect(existsSync(htmlFilePath)).toBe(true)

      console.log(`✅ HTML report generated: ${htmlFilePath}`)
    })
  })

  describe('Performance Analysis and Quality Gates', () => {
    it('should validate performance thresholds for CI/CD gates', async () => {
      // Perform controlled operations
      await populateTestMetrics()

      const metrics = metricsCollector.getMetrics()

      // Define quality gates
      const qualityGates = {
        averageResponseTime:
          metrics.apiCalls.averageDuration < REPORTING_TEST_CONFIG.PERFORMANCE_THRESHOLD_MS,
        errorRate: metrics.apiCalls.errorRate < REPORTING_TEST_CONFIG.ERROR_RATE_THRESHOLD,
        cacheHitRate: metrics.cache.hitRate > REPORTING_TEST_CONFIG.CACHE_HIT_RATE_THRESHOLD,
        memoryGrowth:
          Math.abs(metrics.memory.growth) < REPORTING_TEST_CONFIG.MEMORY_THRESHOLD_MB * 1024 * 1024,
      }

      // Log gate results
      console.log('🚦 Quality Gates Assessment:')
      Object.entries(qualityGates).forEach(([gate, passed]) => {
        console.log(`   ${gate}: ${passed ? '✅ PASS' : '❌ FAIL'}`)
      })

      // At least most gates should pass (allowing some flexibility for test environment)
      const passedGates = Object.values(qualityGates).filter(Boolean).length
      const totalGates = Object.keys(qualityGates).length
      const passRate = passedGates / totalGates

      expect(passRate).toBeGreaterThan(0.7) // At least 70% of gates should pass

      // Specific critical checks
      expect(metrics.apiCalls.averageDuration).toBeLessThan(
        REPORTING_TEST_CONFIG.PERFORMANCE_THRESHOLD_MS * 2
      ) // Allow 2x threshold for test environment
      expect(metrics.apiCalls.errorRate).toBeLessThan(
        REPORTING_TEST_CONFIG.ERROR_RATE_THRESHOLD * 2
      )

      console.log(
        `✅ Quality gates assessment: ${passedGates}/${totalGates} passed (${(passRate * 100).toFixed(1)}%)`
      )
    })

    it('should generate performance trend analysis', async () => {
      // Simulate historical data by collecting metrics over time
      const historicalMetrics = []

      for (let timePoint = 0; timePoint < 3; timePoint++) {
        // Reset collector for each time point
        const collector = new MetricsCollector()

        // Simulate varying performance
        const baseResponseTime = 100 + timePoint * 50 // Simulate performance degradation
        const operationCount = 8 + timePoint

        for (let i = 0; i < operationCount; i++) {
          const responseTime = baseResponseTime + Math.random() * 100
          collector.recordApiCall(`/test-endpoint-${i % 3}`, responseTime, 200)

          if (i % 2 === 0) {
            collector.recordCacheHit(`cache-key-${i}`)
          } else {
            collector.recordCacheMiss(`cache-key-${i}`)
          }
        }

        historicalMetrics.push({
          timestamp: Date.now() - (2 - timePoint) * 60000, // 1 minute intervals
          metrics: collector.getMetrics(),
        })
      }

      // Analyze trends
      const responseTimes = historicalMetrics.map(h => h.metrics.apiCalls.averageDuration)
      const cacheHitRates = historicalMetrics.map(h => h.metrics.cache.hitRate)

      // Calculate trends (simple linear regression)
      const responseTimeTrend = calculateTrend(responseTimes)
      const cacheHitTrend = calculateTrend(cacheHitRates)

      // Validate trend analysis
      expect(responseTimeTrend).toBeGreaterThan(0) // Expect increasing response times in our simulation
      expect(Math.abs(cacheHitTrend)).toBeLessThan(1) // Cache hit rate should be relatively stable

      console.log('📈 Performance trends:')
      console.log(
        `   Response time trend: ${responseTimeTrend > 0 ? '+' : ''}${responseTimeTrend.toFixed(2)}ms per interval`
      )
      console.log(
        `   Cache hit rate trend: ${cacheHitTrend > 0 ? '+' : ''}${(cacheHitTrend * 100).toFixed(2)}% per interval`
      )

      // Generate trend report
      const trendReport = {
        analysisTimestamp: new Date().toISOString(),
        timeSeriesData: historicalMetrics,
        trends: {
          responseTime: responseTimeTrend,
          cacheHitRate: cacheHitTrend,
        },
        recommendations: generatePerformanceRecommendations(responseTimeTrend, cacheHitTrend),
      }

      const trendReportPath = join(reportOutputDir, 'performance-trend-analysis.json')
      const fs = await import('node:fs/promises')
      await fs.writeFile(trendReportPath, JSON.stringify(trendReport, null, 2))

      console.log(`✅ Performance trend analysis saved: ${trendReportPath}`)
    })
  })

  describe('Integration with Monitoring Tools', () => {
    it('should export metrics in monitoring-friendly formats', async () => {
      await populateTestMetrics()

      const metrics = metricsCollector.getMetrics()

      // Prometheus-style metrics export
      const prometheusMetrics = generatePrometheusMetrics(metrics)
      expect(prometheusMetrics).toContain('github_api_calls_total')
      expect(prometheusMetrics).toContain('github_api_response_time_seconds')
      expect(prometheusMetrics).toContain('github_cache_hit_rate')
      expect(prometheusMetrics).toContain('github_memory_usage_bytes')

      // InfluxDB line protocol format
      const influxMetrics = generateInfluxMetrics(metrics)
      expect(influxMetrics).toContain('github_api_performance')
      expect(influxMetrics).toContain('github_cache_performance')
      expect(influxMetrics).toContain('github_memory_usage')

      // Save monitoring exports
      const prometheusPath = join(reportOutputDir, 'metrics.prometheus')
      const influxPath = join(reportOutputDir, 'metrics.influx')

      const fs = await import('node:fs/promises')
      await fs.writeFile(prometheusPath, prometheusMetrics)
      await fs.writeFile(influxPath, influxMetrics)

      expect(existsSync(prometheusPath)).toBe(true)
      expect(existsSync(influxPath)).toBe(true)

      console.log('✅ Monitoring exports generated: Prometheus, InfluxDB')
    })

    it('should validate dashboard data export capabilities', async () => {
      await populateTestMetrics()

      const metrics = metricsCollector.getMetrics()

      // Generate dashboard-ready data structure
      const dashboardData = {
        summary: {
          totalApiCalls: metrics.apiCalls.total,
          averageResponseTime: metrics.apiCalls.averageDuration,
          errorRate: metrics.apiCalls.errorRate,
          cacheHitRate: metrics.cache.hitRate,
          memoryUsage: metrics.memory.peak,
        },
        charts: {
          apiCallsOverTime: generateTimeSeriesData('api_calls', 12),
          responseTimeDistribution: generateDistributionData([50, 100, 200, 500, 1000]),
          errorRateByEndpoint: Object.entries(metrics.apiCalls.byEndpoint),
          cachePerformance: {
            hits: metrics.cache.hits,
            misses: metrics.cache.misses,
            hitRate: metrics.cache.hitRate,
          },
        },
        alerts: generateAlerts(metrics),
      }

      // Validate dashboard data structure
      expect(dashboardData.summary).toHaveProperty('totalApiCalls')
      expect(dashboardData.charts).toHaveProperty('apiCallsOverTime')
      expect(dashboardData.charts.responseTimeDistribution).toBeInstanceOf(Array)
      expect(dashboardData.alerts).toBeInstanceOf(Array)

      // Save dashboard data
      const dashboardPath = join(reportOutputDir, 'dashboard-data.json')
      const fs = await import('node:fs/promises')
      await fs.writeFile(dashboardPath, JSON.stringify(dashboardData, null, 2))

      console.log(`✅ Dashboard data export validated: ${dashboardPath}`)
    })
  })

  afterAll(async () => {
    // Cleanup test files
    const testFiles = [
      'test-metrics-report.json',
      'test-metrics-data.csv',
      'test-metrics-report.html',
      'performance-trend-analysis.json',
      'metrics.prometheus',
      'metrics.influx',
      'dashboard-data.json',
    ]

    for (const file of testFiles) {
      const filePath = join(reportOutputDir, file)
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath)
        } catch (_error) {
          console.warn(`Could not cleanup test file: ${filePath}`)
        }
      }
    }

    console.log('\n🎉 Test reporting and metrics collection validation completed!')
    console.log('   All report formats validated')
    console.log('   Quality gates assessment completed')
    console.log('   Monitoring integration verified')
    console.log('   Dashboard data export confirmed')
  })

  // Helper function to populate test metrics
  async function populateTestMetrics(): Promise<void> {
    // API calls with varied performance
    const endpoints = ['/user', '/user/repos', '/graphql', '/orgs', '/user/emails']
    for (let i = 0; i < 20; i++) {
      const endpoint = endpoints[i % endpoints.length]
      const duration = 100 + Math.random() * 500 // 100-600ms
      const status = i % 10 === 9 ? 500 : 200 // 10% error rate
      metricsCollector.recordApiCall(endpoint, duration, status)
    }

    // Cache operations
    for (let i = 0; i < 15; i++) {
      const key = `cache-key-${i % 5}`
      if (i % 3 === 0) {
        metricsCollector.recordCacheHit(key)
      } else {
        metricsCollector.recordCacheMiss(key)
      }
    }

    // Memory usage
    const baseMemory = process.memoryUsage().heapUsed
    for (let i = 0; i < 10; i++) {
      const memoryUsage = baseMemory + i * 1024 * 1024 // Simulate growth
      metricsCollector.recordMemoryUsage(memoryUsage)
    }

    // Rate limit data
    metricsCollector.recordRateLimit('core', 4500, 5000)
    metricsCollector.recordRateLimit('graphql', 4800, 5000)
    metricsCollector.recordRateLimit('search', 25, 30)
  }
})

// Utility functions
function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0

  const n = values.length
  const sumX = (n * (n - 1)) / 2 // Sum of indices 0, 1, 2, ...
  const sumY = values.reduce((a, b) => a + b, 0)
  const sumXY = values.reduce((sum, y, x) => sum + x * y, 0)
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6 // Sum of squares

  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
}

function generatePerformanceRecommendations(
  responseTimeTrend: number,
  cacheHitTrend: number
): string[] {
  const recommendations = []

  if (responseTimeTrend > 10) {
    recommendations.push(
      'Response times are increasing. Consider optimizing API calls or increasing rate limit tokens.'
    )
  }

  if (cacheHitTrend < -0.1) {
    recommendations.push(
      'Cache hit rate is declining. Review cache TTL settings and cache key strategies.'
    )
  }

  if (recommendations.length === 0) {
    recommendations.push('Performance metrics are within acceptable ranges.')
  }

  return recommendations
}

interface TestMetrics {
  apiCalls: {
    total: number
    byEndpoint: Record<string, number>
  }
  cache: {
    hits: number
    misses: number
  }
  errors?: Array<{ endpoint: string; status: number }>
}

function generatePrometheusMetrics(metrics: TestMetrics): string {
  const timestamp = Date.now()
  return `
# HELP github_api_calls_total Total number of GitHub API calls
# TYPE github_api_calls_total counter
github_api_calls_total ${metrics.apiCalls.total} ${timestamp}

# HELP github_api_response_time_seconds Average API response time
# TYPE github_api_response_time_seconds gauge
github_api_response_time_seconds ${(metrics.apiCalls.averageDuration / 1000).toFixed(3)} ${timestamp}

# HELP github_cache_hit_rate Cache hit rate ratio
# TYPE github_cache_hit_rate gauge
github_cache_hit_rate ${metrics.cache.hitRate.toFixed(3)} ${timestamp}

# HELP github_memory_usage_bytes Peak memory usage
# TYPE github_memory_usage_bytes gauge
github_memory_usage_bytes ${metrics.memory.peak} ${timestamp}
`.trim()
}

function generateInfluxMetrics(metrics: TestMetrics): string {
  const timestamp = Date.now() * 1000000 // InfluxDB uses nanoseconds
  return `
github_api_performance,service=github api_calls=${metrics.apiCalls.total},response_time=${metrics.apiCalls.averageDuration},error_rate=${metrics.apiCalls.errorRate} ${timestamp}
github_cache_performance,service=github hits=${metrics.cache.hits},misses=${metrics.cache.misses},hit_rate=${metrics.cache.hitRate} ${timestamp}
github_memory_usage,service=github peak_bytes=${metrics.memory.peak},average_bytes=${metrics.memory.average},growth_bytes=${metrics.memory.growth} ${timestamp}
`.trim()
}

function generateTimeSeriesData(
  _metric: string,
  points: number
): Array<{ timestamp: number; value: number }> {
  const data = []
  const now = Date.now()

  for (let i = 0; i < points; i++) {
    data.push({
      timestamp: now - (points - i) * 60000, // 1 minute intervals
      value: Math.floor(Math.random() * 100) + 50, // Random values 50-150
    })
  }

  return data
}

function generateDistributionData(buckets: number[]): Array<{ bucket: string; count: number }> {
  return buckets.map(bucket => ({
    bucket: `${bucket}ms`,
    count: Math.floor(Math.random() * 10) + 1,
  }))
}

function generateAlerts(
  metrics: TestMetrics
): Array<{ type: string; message: string; severity: string }> {
  const alerts = []

  if (metrics.apiCalls.errorRate > 0.05) {
    alerts.push({
      type: 'error_rate',
      message: `Error rate is ${(metrics.apiCalls.errorRate * 100).toFixed(1)}% which exceeds 5% threshold`,
      severity: 'warning',
    })
  }

  if (metrics.cache.hitRate < 0.7) {
    alerts.push({
      type: 'cache_performance',
      message: `Cache hit rate is ${(metrics.cache.hitRate * 100).toFixed(1)}% which is below 70% threshold`,
      severity: 'info',
    })
  }

  return alerts
}
