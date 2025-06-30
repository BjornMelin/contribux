/**
 * Test Infrastructure Performance Optimizer
 * Advanced optimization utilities for Vitest 3.2+ test execution
 */

import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach } from 'vitest'

export interface PerformanceMetrics {
  testStart: number
  testEnd: number
  duration: number
  memoryUsage: NodeJS.MemoryUsage
  gcCount: number
  heapUsed: number
  external: number
  cpuUsage?: NodeJS.CpuUsage
}

export interface OptimizationConfig {
  enableGCMonitoring: boolean
  enableMemoryTracking: boolean
  enableCPUTracking: boolean
  gcThreshold: number // MB
  memoryThreshold: number // MB
  enableAutoOptimization: boolean
}

class TestPerformanceOptimizer {
  private metrics: Map<string, PerformanceMetrics> = new Map()
  private baselineMemory: NodeJS.MemoryUsage | null = null
  private baselineCPU: NodeJS.CpuUsage | null = null
  private gcCount = 0
  private config: OptimizationConfig

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      enableGCMonitoring: true,
      enableMemoryTracking: true,
      enableCPUTracking: false, // Disabled by default for performance
      gcThreshold: 50, // MB
      memoryThreshold: 100, // MB
      enableAutoOptimization: true,
      ...config,
    }

    this.setupPerformanceMonitoring()
  }

  private setupPerformanceMonitoring() {
    // Set up memory monitoring
    if (this.config.enableMemoryTracking) {
      this.baselineMemory = process.memoryUsage()
    }

    // Set up CPU monitoring if enabled
    if (this.config.enableCPUTracking) {
      this.baselineCPU = process.cpuUsage()
    }

    // Set up GC monitoring if available
    if (this.config.enableGCMonitoring && global.gc) {
      this.setupGCMonitoring()
    }
  }

  private setupGCMonitoring() {
    // Track GC events if performance observer is available
    try {
      const { PerformanceObserver } = require('node:perf_hooks')
      const obs = new PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries()
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.gcCount++
          }
        }
      })
      obs.observe({ entryTypes: ['gc'] })
    } catch {
      // PerformanceObserver might not be available in all environments
    }
  }

  /**
   * Start performance tracking for a test
   */
  startTest(testName: string): void {
    const startTime = performance.now()
    const memoryUsage = process.memoryUsage()
    const cpuUsage = this.config.enableCPUTracking ? process.cpuUsage() : undefined

    this.metrics.set(testName, {
      testStart: startTime,
      testEnd: 0,
      duration: 0,
      memoryUsage,
      gcCount: this.gcCount,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      cpuUsage,
    })

    // Auto-optimization checks
    if (this.config.enableAutoOptimization) {
      this.checkAndOptimize(memoryUsage)
    }
  }

  /**
   * End performance tracking for a test
   */
  endTest(testName: string): PerformanceMetrics | null {
    const metrics = this.metrics.get(testName)
    if (!metrics) return null

    const endTime = performance.now()
    const finalMemory = process.memoryUsage()

    metrics.testEnd = endTime
    metrics.duration = endTime - metrics.testStart
    metrics.memoryUsage = finalMemory

    // Check for memory growth
    const memoryGrowth = finalMemory.heapUsed - metrics.heapUsed
    if (memoryGrowth > this.config.gcThreshold * 1024 * 1024) {
      this.triggerGC(`Memory growth: ${this.formatBytes(memoryGrowth)}`)
    }

    return metrics
  }

  /**
   * Force garbage collection if available
   */
  triggerGC(reason = 'Manual trigger'): boolean {
    if (global.gc && typeof global.gc === 'function') {
      const beforeHeap = process.memoryUsage().heapUsed
      global.gc()
      const afterHeap = process.memoryUsage().heapUsed
      const freed = beforeHeap - afterHeap

      if (process.env.DEBUG_TESTS) {
        console.log(`🗑️ GC triggered (${reason}): freed ${this.formatBytes(freed)}`)
      }

      this.gcCount++
      return true
    }
    return false
  }

  /**
   * Check memory usage and optimize if needed
   */
  private checkAndOptimize(currentMemory: NodeJS.MemoryUsage): void {
    const heapUsedMB = currentMemory.heapUsed / (1024 * 1024)
    const externalMB = currentMemory.external / (1024 * 1024)

    // Trigger GC if memory exceeds threshold
    if (heapUsedMB > this.config.memoryThreshold) {
      this.triggerGC(`Heap usage: ${heapUsedMB.toFixed(2)}MB`)
    }

    // Trigger GC if external memory is high
    if (externalMB > this.config.gcThreshold) {
      this.triggerGC(`External memory: ${externalMB.toFixed(2)}MB`)
    }
  }

  /**
   * Get performance summary for all tests
   */
  getSummary(): {
    totalTests: number
    totalDuration: number
    averageDuration: number
    slowestTest: { name: string; duration: number } | null
    fastestTest: { name: string; duration: number } | null
    memoryStats: {
      baseline: number
      current: number
      peak: number
      growth: number
    }
    gcStats: {
      totalGCs: number
      averageGCFrequency: number
    }
  } {
    const tests = Array.from(this.metrics.entries())
    const durations = tests.map(([_, metrics]) => metrics.duration).filter(d => d > 0)
    const currentMemory = process.memoryUsage()

    let slowestTest: { name: string; duration: number } | null = null
    let fastestTest: { name: string; duration: number } | null = null

    for (const [name, metrics] of tests) {
      if (metrics.duration > 0) {
        if (!slowestTest || metrics.duration > slowestTest.duration) {
          slowestTest = { name, duration: metrics.duration }
        }
        if (!fastestTest || metrics.duration < fastestTest.duration) {
          fastestTest = { name, duration: metrics.duration }
        }
      }
    }

    const baselineHeap = this.baselineMemory?.heapUsed || 0
    const currentHeap = currentMemory.heapUsed
    const peakHeap = Math.max(...tests.map(([_, m]) => m.memoryUsage.heapUsed))

    return {
      totalTests: tests.length,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      averageDuration:
        durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
      slowestTest,
      fastestTest,
      memoryStats: {
        baseline: baselineHeap,
        current: currentHeap,
        peak: peakHeap,
        growth: currentHeap - baselineHeap,
      },
      gcStats: {
        totalGCs: this.gcCount,
        averageGCFrequency: tests.length > 0 ? this.gcCount / tests.length : 0,
      },
    }
  }

  /**
   * Generate optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const summary = this.getSummary()
    const recommendations: string[] = []

    // Performance recommendations
    if (summary.averageDuration > 5000) {
      recommendations.push('Consider reducing test complexity or timeouts')
    }

    if (summary.slowestTest && summary.slowestTest.duration > 10000) {
      recommendations.push(
        `Optimize slow test: ${summary.slowestTest.name} (${summary.slowestTest.duration.toFixed(2)}ms)`
      )
    }

    // Memory recommendations
    const memoryGrowthMB = summary.memoryStats.growth / (1024 * 1024)
    if (memoryGrowthMB > 50) {
      recommendations.push(`High memory growth detected: ${memoryGrowthMB.toFixed(2)}MB`)
    }

    if (summary.gcStats.averageGCFrequency > 0.5) {
      recommendations.push('High GC frequency indicates potential memory issues')
    }

    // GC recommendations
    if (!global.gc) {
      recommendations.push('Run tests with --expose-gc for better memory management')
    }

    return recommendations
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = Math.abs(bytes)
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    const formatted = size.toFixed(2)
    return `${bytes < 0 ? '-' : ''}${formatted} ${units[unitIndex]}`
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear()
    this.gcCount = 0
    this.baselineMemory = process.memoryUsage()
    if (this.config.enableCPUTracking) {
      this.baselineCPU = process.cpuUsage()
    }
  }
}

// Global optimizer instance
const globalOptimizer = new TestPerformanceOptimizer()

/**
 * Setup automatic performance tracking for tests
 */
export function setupPerformanceTracking(config?: Partial<OptimizationConfig>) {
  const optimizer = config ? new TestPerformanceOptimizer(config) : globalOptimizer

  beforeEach(() => {
    const testName = expect.getState().currentTestName || 'unknown'
    optimizer.startTest(testName)
  })

  afterEach(() => {
    const testName = expect.getState().currentTestName || 'unknown'
    const metrics = optimizer.endTest(testName)

    // Log slow tests in debug mode
    if (process.env.DEBUG_TESTS && metrics && metrics.duration > 5000) {
      console.warn(`⚠️ Slow test detected: ${testName} (${metrics.duration.toFixed(2)}ms)`)
    }
  })

  return {
    getOptimizer: () => optimizer,
    getSummary: () => optimizer.getSummary(),
    getRecommendations: () => optimizer.getOptimizationRecommendations(),
    triggerGC: (reason?: string) => optimizer.triggerGC(reason),
  }
}

/**
 * Utility to run performance analysis on test suite
 */
export function analyzeTestPerformance() {
  const summary = globalOptimizer.getSummary()
  const recommendations = globalOptimizer.getOptimizationRecommendations()

  console.log('\n📊 Test Performance Analysis:')
  console.log('============================')
  console.log(`Total Tests: ${summary.totalTests}`)
  console.log(`Total Duration: ${summary.totalDuration.toFixed(2)}ms`)
  console.log(`Average Duration: ${summary.averageDuration.toFixed(2)}ms`)

  if (summary.slowestTest) {
    console.log(
      `Slowest Test: ${summary.slowestTest.name} (${summary.slowestTest.duration.toFixed(2)}ms)`
    )
  }

  if (summary.fastestTest) {
    console.log(
      `Fastest Test: ${summary.fastestTest.name} (${summary.fastestTest.duration.toFixed(2)}ms)`
    )
  }

  console.log('\n💾 Memory Statistics:')
  console.log(`Baseline: ${globalOptimizer.formatBytes(summary.memoryStats.baseline)}`)
  console.log(`Current: ${globalOptimizer.formatBytes(summary.memoryStats.current)}`)
  console.log(`Peak: ${globalOptimizer.formatBytes(summary.memoryStats.peak)}`)
  console.log(`Growth: ${globalOptimizer.formatBytes(summary.memoryStats.growth)}`)

  console.log('\n🗑️ Garbage Collection:')
  console.log(`Total GCs: ${summary.gcStats.totalGCs}`)
  console.log(`Average GC Frequency: ${summary.gcStats.averageGCFrequency.toFixed(3)} per test`)

  if (recommendations.length > 0) {
    console.log('\n💡 Optimization Recommendations:')
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`)
    })
  } else {
    console.log('\n✅ No performance issues detected')
  }

  return summary
}

// Export the global optimizer for direct access
export { globalOptimizer as performanceOptimizer, TestPerformanceOptimizer }
