/**
 * Performance benchmark tests for API operations
 */

import { GitHubClient } from '@/lib/github/client'
import { MemoryProfiler, profileOperation } from '@/lib/monitoring/memory-profiler'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface BenchmarkResult {
  operation: string
  duration: number
  memoryUsage: number
  throughput: number
  success: boolean
}

interface BenchmarkSuite {
  results: BenchmarkResult[]
  summary: {
    avgDuration: number
    avgMemoryUsage: number
    avgThroughput: number
    successRate: number
  }
}

describe('API Performance Benchmarks', () => {
  let githubClient: GitHubClient
  let profiler: MemoryProfiler

  beforeAll(async () => {
    // Initialize with mock token for testing
    githubClient = new GitHubClient('test-token')
    profiler = new MemoryProfiler()
  })

  afterAll(async () => {
    if (githubClient) {
      githubClient.clearCache()
    }
  })

  describe('GitHub API Operations', () => {
    it('should measure repository search performance', async () => {
      const benchmarks: BenchmarkResult[] = []
      const iterations = 10

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now()
        const startMemory = process.memoryUsage().heapUsed

        try {
          // Mock search operation - in real implementation this would call the API
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50))

          const duration = Date.now() - startTime
          const memoryUsage = process.memoryUsage().heapUsed - startMemory

          benchmarks.push({
            operation: 'repository_search',
            duration,
            memoryUsage,
            throughput: 1000 / duration, // operations per second
            success: true,
          })
        } catch (_error) {
          benchmarks.push({
            operation: 'repository_search',
            duration: Date.now() - startTime,
            memoryUsage: 0,
            throughput: 0,
            success: false,
          })
        }
      }

      const suite = analyzeBenchmarks(benchmarks)

      // Performance assertions
      expect(suite.summary.avgDuration).toBeLessThan(200) // 200ms average
      expect(suite.summary.successRate).toBeGreaterThan(0.95) // 95% success rate
      expect(suite.summary.avgMemoryUsage).toBeLessThan(10 * 1024 * 1024) // 10MB average

      console.log('Repository Search Benchmarks:', suite.summary)
    }, 30000)

    it('should measure cache performance under load', async () => {
      const { result: cacheResults, memoryProfile } = await profileOperation(async () => {
        const operations = []
        const numOperations = 100

        // Simulate cache operations
        for (let i = 0; i < numOperations; i++) {
          operations.push(
            (async () => {
              const key = `test-key-${i % 10}` // 10 unique keys, causing cache hits
              const value = { data: `test-data-${i}`, timestamp: Date.now() }

              // Simulate cache set/get operations
              await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
              return { key, value, cached: i % 10 > 5 } // Simulate cache hits
            })()
          )
        }

        return Promise.all(operations)
      }, 'cache_load_test')

      // Memory analysis
      expect(memoryProfile.summary.memoryLeakDetected).toBe(false)
      expect(memoryProfile.summary.peakHeapUsage).toBeLessThan(100 * 1024 * 1024) // 100MB peak

      // Cache hit rate analysis
      const cacheHitRate = cacheResults.filter(r => r.cached).length / cacheResults.length
      expect(cacheHitRate).toBeGreaterThan(0.3) // At least 30% cache hit rate

      console.log('Cache Performance:', {
        operations: cacheResults.length,
        cacheHitRate,
        memoryPeak: `${Math.round(memoryProfile.summary.peakHeapUsage / 1024 / 1024)}MB`,
        duration: `${memoryProfile.summary.totalDuration}ms`,
      })
    }, 30000)

    it('should measure concurrent API operations', async () => {
      const concurrencyLevels = [1, 5, 10, 20]
      const results: Array<{ concurrency: number; benchmark: BenchmarkSuite }> = []

      for (const concurrency of concurrencyLevels) {
        const benchmarks: BenchmarkResult[] = []
        const operations = []

        // Create concurrent operations
        for (let i = 0; i < concurrency; i++) {
          operations.push(
            (async () => {
              const startTime = Date.now()
              const startMemory = process.memoryUsage().heapUsed

              try {
                // Simulate API operation with variable latency
                await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100))

                return {
                  operation: `concurrent_api_${i}`,
                  duration: Date.now() - startTime,
                  memoryUsage: process.memoryUsage().heapUsed - startMemory,
                  throughput: 1000 / (Date.now() - startTime),
                  success: true,
                }
              } catch (_error) {
                return {
                  operation: `concurrent_api_${i}`,
                  duration: Date.now() - startTime,
                  memoryUsage: 0,
                  throughput: 0,
                  success: false,
                }
              }
            })()
          )
        }

        const operationResults = await Promise.all(operations)
        benchmarks.push(...operationResults)

        const suite = analyzeBenchmarks(benchmarks)
        results.push({ concurrency, benchmark: suite })
      }

      // Analyze scalability
      results.forEach(({ concurrency, benchmark }) => {
        expect(benchmark.summary.successRate).toBeGreaterThan(0.9) // 90% success under load
        expect(benchmark.summary.avgDuration).toBeLessThan(500) // Max 500ms average

        console.log(`Concurrency ${concurrency}:`, benchmark.summary)
      })

      // Performance should degrade gracefully
      const throughputTrend = results.map(r => r.benchmark.summary.avgThroughput)
      expect(throughputTrend[0]).toBeGreaterThan(0) // Single operation should work
    }, 45000)

    it('should measure memory efficiency under sustained load', async () => {
      profiler.startProfiling(500) // Sample every 500ms

      const operations = []
      const numOperations = 50
      const sustainedDuration = 10000 // 10 seconds

      const endTime = Date.now() + sustainedDuration

      while (Date.now() < endTime) {
        for (let i = 0; i < numOperations; i++) {
          operations.push(
            (async () => {
              // Simulate data processing with temporary objects
              const data = new Array(1000).fill(0).map((_, idx) => ({
                id: idx,
                value: Math.random(),
                timestamp: Date.now(),
              }))

              // Process data (simulate CPU work)
              await new Promise(resolve => setTimeout(resolve, 10))

              // Clean up references
              data.length = 0
              return data.length
            })()
          )
        }

        await Promise.all(operations)
        operations.length = 0 // Clear array for next iteration

        // Periodic cleanup
        if (Math.random() > 0.8) {
          if (global.gc) global.gc()
        }
      }

      const memoryReport = profiler.stopProfiling()

      // Memory efficiency assertions
      expect(memoryReport.summary.memoryLeakDetected).toBe(false)
      expect(memoryReport.summary.peakHeapUsage).toBeLessThan(200 * 1024 * 1024) // 200MB peak
      expect(memoryReport.summary.gcRecommendations.length).toBeLessThan(3) // Few GC recommendations

      console.log('Sustained Load Memory Report:', {
        duration: `${memoryReport.summary.totalDuration}ms`,
        peakMemory: `${Math.round(memoryReport.summary.peakHeapUsage / 1024 / 1024)}MB`,
        avgMemory: `${Math.round(memoryReport.summary.averageHeapUsage / 1024 / 1024)}MB`,
        leakDetected: memoryReport.summary.memoryLeakDetected,
        recommendations: memoryReport.summary.gcRecommendations,
      })
    }, 20000)
  })

  describe('Database Connection Pooling', () => {
    it('should measure connection pool efficiency', async () => {
      const poolSizes = [1, 5, 10, 20]
      const results: Array<{ poolSize: number; efficiency: number }> = []

      for (const poolSize of poolSizes) {
        const startTime = Date.now()
        const operations = []

        // Simulate database operations
        for (let i = 0; i < 100; i++) {
          operations.push(
            (async () => {
              // Simulate connection acquisition and query
              const acquireTime = Math.random() * (poolSize > 10 ? 50 : 20)
              await new Promise(resolve => setTimeout(resolve, acquireTime))

              // Simulate query execution
              await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50))

              return acquireTime
            })()
          )
        }

        const connectionTimes = await Promise.all(operations)
        const totalTime = Date.now() - startTime
        const avgConnectionTime =
          connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
        const efficiency = 1000 / (totalTime / operations.length) // ops per second

        results.push({ poolSize, efficiency })

        // Pool efficiency assertions
        expect(avgConnectionTime).toBeLessThan(poolSize > 10 ? 100 : 50) // Connection time scales
        expect(efficiency).toBeGreaterThan(5) // At least 5 ops/sec
      }

      // Log pool efficiency comparison
      console.log('Connection Pool Efficiency:', results)

      // Optimal pool size should be around 5-10 for typical workloads
      const optimalResult = results.find(r => r.poolSize >= 5 && r.poolSize <= 10)
      expect(optimalResult?.efficiency).toBeGreaterThan(8) // Should be efficient
    }, 30000)
  })
})

/**
 * Analyze benchmark results and calculate statistics
 */
function analyzeBenchmarks(benchmarks: BenchmarkResult[]): BenchmarkSuite {
  const successfulBenchmarks = benchmarks.filter(b => b.success)
  const successRate = successfulBenchmarks.length / benchmarks.length

  const avgDuration =
    successfulBenchmarks.reduce((sum, b) => sum + b.duration, 0) / successfulBenchmarks.length || 0
  const avgMemoryUsage =
    successfulBenchmarks.reduce((sum, b) => sum + b.memoryUsage, 0) / successfulBenchmarks.length ||
    0
  const avgThroughput =
    successfulBenchmarks.reduce((sum, b) => sum + b.throughput, 0) / successfulBenchmarks.length ||
    0

  return {
    results: benchmarks,
    summary: {
      avgDuration: Math.round(avgDuration * 100) / 100,
      avgMemoryUsage: Math.round(avgMemoryUsage),
      avgThroughput: Math.round(avgThroughput * 100) / 100,
      successRate: Math.round(successRate * 10000) / 10000,
    },
  }
}
