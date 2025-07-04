/**
 * Performance Testing Utilities
 * Provides comprehensive performance testing, benchmarking, and monitoring
 * Phase 4: Developer Experience - Performance testing utilities
 */

// Performance benchmark configuration
export interface BenchmarkConfig {
  /** Number of iterations to run */
  iterations?: number
  /** Warmup iterations to exclude from results */
  warmup?: number
  /** Maximum time to spend on benchmark (ms) */
  maxTime?: number
  /** Minimum iterations required */
  minIterations?: number
  /** Enable garbage collection between runs */
  forceGC?: boolean
  /** Custom setup function */
  setup?: () => void | Promise<void>
  /** Custom teardown function */
  teardown?: () => void | Promise<void>
}

// Performance metrics
export interface PerformanceMetrics {
  /** Average execution time (ms) */
  avg: number
  /** Minimum execution time (ms) */
  min: number
  /** Maximum execution time (ms) */
  max: number
  /** Median execution time (ms) */
  median: number
  /** 95th percentile (ms) */
  p95: number
  /** 99th percentile (ms) */
  p99: number
  /** Standard deviation */
  stdDev: number
  /** Total iterations */
  iterations: number
  /** Operations per second */
  opsPerSec: number
  /** Memory usage metrics */
  memory?: MemoryMetrics
}

// Memory usage metrics
export interface MemoryMetrics {
  /** Heap used before test (bytes) */
  heapBefore: number
  /** Heap used after test (bytes) */
  heapAfter: number
  /** Heap increase (bytes) */
  heapIncrease: number
  /** External memory (bytes) */
  external: number
  /** RSS memory (bytes) */
  rss: number
}

// Benchmark result
export interface BenchmarkResult {
  /** Test name */
  name: string
  /** Performance metrics */
  metrics: PerformanceMetrics
  /** Configuration used */
  config: Required<BenchmarkConfig>
  /** Start timestamp */
  startTime: number
  /** End timestamp */
  endTime: number
  /** Total duration (ms) */
  totalDuration: number
}

/**
 * Performance Timer - High-resolution timing utility
 */
export class PerformanceTimer {
  private startTime = 0
  private endTime = 0
  private measurements: number[] = []

  /**
   * Start timing
   */
  start(): void {
    if (typeof performance !== 'undefined') {
      this.startTime = performance.now()
    } else {
      this.startTime = Date.now()
    }
  }

  /**
   * Stop timing and record measurement
   */
  stop(): number {
    if (typeof performance !== 'undefined') {
      this.endTime = performance.now()
    } else {
      this.endTime = Date.now()
    }

    const duration = this.endTime - this.startTime
    this.measurements.push(duration)
    return duration
  }

  /**
   * Get current elapsed time without stopping
   */
  elapsed(): number {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return now - this.startTime
  }

  /**
   * Reset timer
   */
  reset(): void {
    this.startTime = 0
    this.endTime = 0
    this.measurements = []
  }

  /**
   * Get all measurements
   */
  getMeasurements(): number[] {
    return [...this.measurements]
  }

  /**
   * Clear measurements but keep timer running
   */
  clearMeasurements(): void {
    this.measurements = []
  }
}

/**
 * Memory Monitor - Track memory usage
 */
export class MemoryMonitor {
  private baseline: NodeJS.MemoryUsage | null = null

  /**
   * Set memory baseline
   */
  setBaseline(): void {
    if (global.gc) {
      global.gc()
    }
    this.baseline = process.memoryUsage()
  }

  /**
   * Get current memory usage
   */
  getCurrentUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage()
  }

  /**
   * Get memory metrics since baseline
   */
  getMetrics(): MemoryMetrics | null {
    if (!this.baseline) {
      return null
    }

    const current = this.getCurrentUsage()
    return {
      heapBefore: this.baseline.heapUsed,
      heapAfter: current.heapUsed,
      heapIncrease: current.heapUsed - this.baseline.heapUsed,
      external: current.external,
      rss: current.rss,
    }
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): void {
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Check for memory leaks (increase above threshold)
   */
  checkMemoryLeak(thresholdMB = 50): boolean {
    const metrics = this.getMetrics()
    if (!metrics) return false

    const increaseMB = metrics.heapIncrease / 1024 / 1024
    return increaseMB > thresholdMB
  }
}

/**
 * Performance Benchmark - Run performance tests
 */
export class PerformanceBenchmark {
  private timer = new PerformanceTimer()
  private memoryMonitor = new MemoryMonitor()
  private defaultConfig: Required<BenchmarkConfig> = {
    iterations: 1000,
    warmup: 100,
    maxTime: 10000, // 10 seconds
    minIterations: 10,
    forceGC: true,
    setup: () => {},
    teardown: () => {},
  }

  /**
   * Run benchmark for a function
   */
  async benchmark(
    name: string,
    fn: () => void | Promise<void>,
    config: BenchmarkConfig = {}
  ): Promise<BenchmarkResult> {
    const fullConfig = { ...this.defaultConfig, ...config }
    const startTime = Date.now()

    // Setup
    await fullConfig.setup()

    // Set memory baseline
    this.memoryMonitor.setBaseline()

    const measurements: number[] = []
    let iteration = 0

    // Warmup phase
    for (let i = 0; i < fullConfig.warmup; i++) {
      await this.runSingleIteration(fn, false)
    }

    // Main benchmark loop
    const benchmarkStart = Date.now()
    while (
      iteration < fullConfig.iterations &&
      Date.now() - benchmarkStart < fullConfig.maxTime &&
      (iteration < fullConfig.minIterations || Date.now() - benchmarkStart < fullConfig.maxTime)
    ) {
      const duration = await this.runSingleIteration(fn, fullConfig.forceGC)
      measurements.push(duration)
      iteration++
    }

    // Teardown
    await fullConfig.teardown()

    const endTime = Date.now()
    const totalDuration = endTime - startTime

    // Calculate metrics
    const metrics = this.calculateMetrics(measurements)
    metrics.memory = this.memoryMonitor.getMetrics() || undefined

    return {
      name,
      metrics,
      config: fullConfig,
      startTime,
      endTime,
      totalDuration,
    }
  }

  /**
   * Run multiple benchmarks and compare results
   */
  async compare(
    benchmarks: Array<{
      name: string
      fn: () => void | Promise<void>
      config?: BenchmarkConfig
    }>
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = []

    for (const benchmark of benchmarks) {
      const result = await this.benchmark(benchmark.name, benchmark.fn, benchmark.config)
      results.push(result)
    }

    return results
  }

  /**
   * Assert performance requirements
   */
  assertPerformance(
    result: BenchmarkResult,
    requirements: {
      maxAvg?: number
      maxP95?: number
      maxP99?: number
      minOpsPerSec?: number
      maxMemoryIncreaseMB?: number
    }
  ): void {
    const { metrics } = result

    if (requirements.maxAvg && metrics.avg > requirements.maxAvg) {
      throw new Error(
        `Average time ${metrics.avg.toFixed(2)}ms exceeds maximum ${requirements.maxAvg}ms`
      )
    }

    if (requirements.maxP95 && metrics.p95 > requirements.maxP95) {
      throw new Error(
        `P95 time ${metrics.p95.toFixed(2)}ms exceeds maximum ${requirements.maxP95}ms`
      )
    }

    if (requirements.maxP99 && metrics.p99 > requirements.maxP99) {
      throw new Error(
        `P99 time ${metrics.p99.toFixed(2)}ms exceeds maximum ${requirements.maxP99}ms`
      )
    }

    if (requirements.minOpsPerSec && metrics.opsPerSec < requirements.minOpsPerSec) {
      throw new Error(
        `Operations per second ${metrics.opsPerSec.toFixed(2)} below minimum ${requirements.minOpsPerSec}`
      )
    }

    if (requirements.maxMemoryIncreaseMB && metrics.memory) {
      const increaseMB = metrics.memory.heapIncrease / 1024 / 1024
      if (increaseMB > requirements.maxMemoryIncreaseMB) {
        throw new Error(
          `Memory increase ${increaseMB.toFixed(2)}MB exceeds maximum ${requirements.maxMemoryIncreaseMB}MB`
        )
      }
    }
  }

  private async runSingleIteration(
    fn: () => void | Promise<void>,
    forceGC: boolean
  ): Promise<number> {
    if (forceGC) {
      this.memoryMonitor.forceGC()
    }

    this.timer.start()
    await fn()
    return this.timer.stop()
  }

  private calculateMetrics(measurements: number[]): PerformanceMetrics {
    if (measurements.length === 0) {
      throw new Error('No measurements available')
    }

    const sorted = [...measurements].sort((a, b) => a - b)
    const sum = measurements.reduce((a, b) => a + b, 0)
    const avg = sum / measurements.length

    // Calculate percentiles
    const getPercentile = (p: number) => {
      const index = Math.floor((p / 100) * sorted.length)
      return sorted[Math.min(index, sorted.length - 1)] || 0
    }

    // Calculate standard deviation
    const variance =
      measurements.reduce((acc, val) => acc + (val - avg) ** 2, 0) / measurements.length
    const stdDev = Math.sqrt(variance)

    return {
      avg,
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      median: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
      stdDev,
      iterations: measurements.length,
      opsPerSec: avg > 0 ? 1000 / avg : 0,
    }
  }
}

/**
 * Database Performance Testing
 */
export class DatabasePerformanceTester {
  private benchmark = new PerformanceBenchmark()

  /**
   * Test query performance
   */
  async testQuery(
    name: string,
    queryFn: () => Promise<unknown>,
    config?: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    return this.benchmark.benchmark(name, queryFn, {
      iterations: 100,
      warmup: 10,
      forceGC: true,
      ...config,
    })
  }

  /**
   * Test vector search performance
   */
  async testVectorSearch(
    searchFn: (embedding: number[]) => Promise<unknown>,
    embedding: number[],
    config?: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    return this.benchmark.benchmark('Vector Search', () => searchFn(embedding), {
      iterations: 50,
      warmup: 5,
      forceGC: true,
      ...config,
    })
  }

  /**
   * Test bulk operation performance
   */
  async testBulkOperation(
    name: string,
    operationFn: () => Promise<unknown>,
    config?: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    return this.benchmark.benchmark(name, operationFn, {
      iterations: 10,
      warmup: 2,
      forceGC: true,
      maxTime: 30000, // 30 seconds for bulk operations
      ...config,
    })
  }
}

/**
 * API Performance Testing
 */
export class APIPerformanceTester {
  private benchmark = new PerformanceBenchmark()

  /**
   * Test API endpoint performance
   */
  async testEndpoint(
    name: string,
    requestFn: () => Promise<Response>,
    config?: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    return this.benchmark.benchmark(
      name,
      async () => {
        const response = await requestFn()
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`)
        }
      },
      {
        iterations: 100,
        warmup: 10,
        ...config,
      }
    )
  }

  /**
   * Test concurrent API requests
   */
  async testConcurrentRequests(
    name: string,
    requestFn: () => Promise<Response>,
    concurrency: number,
    config?: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    return this.benchmark.benchmark(
      name,
      async () => {
        const promises = Array.from({ length: concurrency }, () => requestFn())
        const responses = await Promise.all(promises)

        for (const response of responses) {
          if (!response.ok) {
            throw new Error(`Concurrent API request failed: ${response.status}`)
          }
        }
      },
      {
        iterations: 20,
        warmup: 2,
        ...config,
      }
    )
  }
}

/**
 * Utility functions for performance testing
 */

/**
 * Create a simple performance timer
 */
export function createTimer(): PerformanceTimer {
  return new PerformanceTimer()
}

/**
 * Create a memory monitor
 */
export function createMemoryMonitor(): MemoryMonitor {
  return new MemoryMonitor()
}

/**
 * Create a performance benchmark
 */
export function createBenchmark(): PerformanceBenchmark {
  return new PerformanceBenchmark()
}

/**
 * Quick benchmark function
 */
export async function quickBenchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations = 1000
): Promise<PerformanceMetrics> {
  const benchmark = new PerformanceBenchmark()
  const result = await benchmark.benchmark(name, fn, { iterations })
  return result.metrics
}

/**
 * Time a single function execution
 */
export async function timeFunction<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> {
  const timer = new PerformanceTimer()
  timer.start()
  const result = await fn()
  const duration = timer.stop()
  return { result, duration }
}

/**
 * Assert that a function executes within time limit
 */
export async function assertExecutionTime<T>(
  fn: () => T | Promise<T>,
  maxTimeMs: number,
  name = 'Function'
): Promise<T> {
  const { result, duration } = await timeFunction(fn)

  if (duration > maxTimeMs) {
    throw new Error(`${name} took ${duration.toFixed(2)}ms, exceeding limit of ${maxTimeMs}ms`)
  }

  return result
}

/**
 * Format performance metrics for display
 */
export function formatMetrics(metrics: PerformanceMetrics): string {
  return `
Performance Metrics:
  Average: ${metrics.avg.toFixed(2)}ms
  Median: ${metrics.median.toFixed(2)}ms
  Min: ${metrics.min.toFixed(2)}ms
  Max: ${metrics.max.toFixed(2)}ms
  P95: ${metrics.p95.toFixed(2)}ms
  P99: ${metrics.p99.toFixed(2)}ms
  Std Dev: ${metrics.stdDev.toFixed(2)}ms
  Ops/sec: ${metrics.opsPerSec.toFixed(2)}
  Iterations: ${metrics.iterations}
  ${metrics.memory ? `Memory Increase: ${(metrics.memory.heapIncrease / 1024 / 1024).toFixed(2)}MB` : ''}
`.trim()
}

/**
 * Compare benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): {
  avgChange: number
  p95Change: number
  opsChange: number
  isFaster: boolean
  isSlower: boolean
} {
  const avgChange = ((current.metrics.avg - baseline.metrics.avg) / baseline.metrics.avg) * 100
  const p95Change = ((current.metrics.p95 - baseline.metrics.p95) / baseline.metrics.p95) * 100
  const opsChange =
    ((current.metrics.opsPerSec - baseline.metrics.opsPerSec) / baseline.metrics.opsPerSec) * 100

  return {
    avgChange,
    p95Change,
    opsChange,
    isFaster: avgChange < -5, // More than 5% faster
    isSlower: avgChange > 5, // More than 5% slower
  }
}
