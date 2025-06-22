/**
 * Metrics Collector for Integration Tests
 * 
 * Collects performance metrics, cache statistics, and resource usage
 * during integration test execution.
 */

import type { TestMetrics, MetricsCollector as IMetricsCollector } from './test-config'

interface ApiCallMetric {
  endpoint: string
  duration: number
  status: number
  timestamp: number
}

interface CacheMetric {
  key: string
  hit: boolean
  timestamp: number
}

interface MemoryMetric {
  usage: number
  timestamp: number
}

interface RateLimitMetric {
  resource: string
  remaining: number
  limit: number
  timestamp: number
}

export class MetricsCollector implements IMetricsCollector {
  private apiCalls: ApiCallMetric[] = []
  private cacheMetrics: CacheMetric[] = []
  private memoryMetrics: MemoryMetric[] = []
  private rateLimitMetrics: RateLimitMetric[] = []
  
  /**
   * Record an API call
   */
  recordApiCall(endpoint: string, duration: number, status: number): void {
    this.apiCalls.push({
      endpoint,
      duration,
      status,
      timestamp: Date.now()
    })
  }
  
  /**
   * Record a cache hit
   */
  recordCacheHit(key: string): void {
    this.cacheMetrics.push({
      key,
      hit: true,
      timestamp: Date.now()
    })
  }
  
  /**
   * Record a cache miss
   */
  recordCacheMiss(key: string): void {
    this.cacheMetrics.push({
      key,
      hit: false,
      timestamp: Date.now()
    })
  }
  
  /**
   * Record memory usage
   */
  recordMemoryUsage(usage: number): void {
    this.memoryMetrics.push({
      usage,
      timestamp: Date.now()
    })
  }
  
  /**
   * Record rate limit status
   */
  recordRateLimit(resource: string, remaining: number, limit: number): void {
    this.rateLimitMetrics.push({
      resource,
      remaining,
      limit,
      timestamp: Date.now()
    })
  }
  
  /**
   * Get aggregated metrics
   */
  getMetrics(): TestMetrics {
    // API metrics
    const apiCallsByEndpoint: Record<string, number> = {}
    let totalDuration = 0
    let errorCount = 0
    
    for (const call of this.apiCalls) {
      apiCallsByEndpoint[call.endpoint] = (apiCallsByEndpoint[call.endpoint] || 0) + 1
      totalDuration += call.duration
      if (call.status >= 400) {
        errorCount++
      }
    }
    
    // Cache metrics
    const cacheHits = this.cacheMetrics.filter(m => m.hit).length
    const cacheMisses = this.cacheMetrics.filter(m => !m.hit).length
    const cacheTotal = cacheHits + cacheMisses
    
    // Memory metrics
    const memoryUsages = this.memoryMetrics.map(m => m.usage)
    const peakMemory = memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0
    const avgMemory = memoryUsages.length > 0 
      ? memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length 
      : 0
    const memoryGrowth = memoryUsages.length > 1 
      ? memoryUsages[memoryUsages.length - 1] - memoryUsages[0]
      : 0
    
    // Rate limit metrics
    const rateLimitTriggered = this.rateLimitMetrics.filter(m => m.remaining === 0).length
    const minRemaining = this.rateLimitMetrics.length > 0
      ? Math.min(...this.rateLimitMetrics.map(m => m.remaining))
      : Infinity
    
    return {
      apiCalls: {
        total: this.apiCalls.length,
        byEndpoint: apiCallsByEndpoint,
        averageDuration: this.apiCalls.length > 0 ? totalDuration / this.apiCalls.length : 0,
        errorRate: this.apiCalls.length > 0 ? errorCount / this.apiCalls.length : 0
      },
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: cacheTotal > 0 ? cacheHits / cacheTotal : 0
      },
      memory: {
        peak: peakMemory,
        average: avgMemory,
        growth: memoryGrowth
      },
      rateLimit: {
        triggered: rateLimitTriggered,
        minimumRemaining: minRemaining === Infinity ? -1 : minRemaining
      }
    }
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.apiCalls = []
    this.cacheMetrics = []
    this.memoryMetrics = []
    this.rateLimitMetrics = []
  }
  
  /**
   * Export metrics to JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      metrics: this.getMetrics(),
      raw: {
        apiCalls: this.apiCalls,
        cacheMetrics: this.cacheMetrics,
        memoryMetrics: this.memoryMetrics,
        rateLimitMetrics: this.rateLimitMetrics
      }
    }, null, 2)
  }
  
  /**
   * Generate a summary report
   */
  generateReport(): string {
    const metrics = this.getMetrics()
    
    return `
Integration Test Metrics Report
==============================

API Performance:
- Total API calls: ${metrics.apiCalls.total}
- Average duration: ${metrics.apiCalls.averageDuration.toFixed(2)}ms
- Error rate: ${(metrics.apiCalls.errorRate * 100).toFixed(2)}%

API Calls by Endpoint:
${Object.entries(metrics.apiCalls.byEndpoint)
  .map(([endpoint, count]) => `  - ${endpoint}: ${count}`)
  .join('\n')}

Cache Performance:
- Cache hits: ${metrics.cache.hits}
- Cache misses: ${metrics.cache.misses}
- Hit rate: ${(metrics.cache.hitRate * 100).toFixed(2)}%

Memory Usage:
- Peak memory: ${(metrics.memory.peak / 1024 / 1024).toFixed(2)} MB
- Average memory: ${(metrics.memory.average / 1024 / 1024).toFixed(2)} MB
- Memory growth: ${(metrics.memory.growth / 1024 / 1024).toFixed(2)} MB

Rate Limiting:
- Times rate limited: ${metrics.rateLimit.triggered}
- Minimum remaining: ${metrics.rateLimit.minimumRemaining}
`
  }
}

/**
 * Memory profiler for integration tests
 */
export class MemoryProfiler {
  private collector: MetricsCollector
  private interval: NodeJS.Timeout | null = null
  private baseline: number = 0
  
  constructor(collector: MetricsCollector) {
    this.collector = collector
  }
  
  /**
   * Start memory profiling
   */
  start(intervalMs = 100): void {
    if (this.interval) {
      return
    }
    
    // Record baseline
    if (global.gc) {
      global.gc()
    }
    this.baseline = process.memoryUsage().heapUsed
    this.collector.recordMemoryUsage(this.baseline)
    
    // Start periodic sampling
    this.interval = setInterval(() => {
      const usage = process.memoryUsage().heapUsed
      this.collector.recordMemoryUsage(usage)
    }, intervalMs)
  }
  
  /**
   * Stop memory profiling
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
  
  /**
   * Force garbage collection and measure
   */
  measureAfterGC(): number {
    if (global.gc) {
      global.gc()
    }
    const usage = process.memoryUsage().heapUsed
    this.collector.recordMemoryUsage(usage)
    return usage - this.baseline
  }
}