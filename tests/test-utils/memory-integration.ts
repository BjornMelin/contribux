/**
 * Memory Monitoring Integration for Test Suite
 * Integrates comprehensive memory monitoring with Vitest test lifecycle
 * Optimized for solo developer environment with automated leak detection
 */

import { afterAll, beforeAll } from 'vitest'
import {
  analyzeMemoryTrends,
  cleanupMemoryMonitoring,
  getMemoryMonitoringStats,
  initializeMemoryMonitoring,
  type MemoryMonitorConfig,
  type MemorySnapshot,
  takeMemorySnapshot,
} from './memory-monitor'

// Global memory monitoring state
let memoryMonitoringEnabled = false
let testSuiteStartSnapshot: MemorySnapshot | null = null
let memoryAlerts: string[] = []

// Configuration optimized for solo development
const SOLO_DEV_CONFIG: Partial<MemoryMonitorConfig> = {
  growthThresholdMB: 8, // Lowered for solo dev to catch smaller leaks
  maxSnapshotsToKeep: 50, // Reduced for memory efficiency
  gcInvocationDelay: 50, // Faster GC for responsive tests
  enableHeapProfiler: true, // Enable for local development
  logMemoryEvery: 5, // More frequent logging for awareness
  forceGCBeforeSnapshot: true,
  cleanupAfterTest: true,
}

/**
 * Initialize memory monitoring for the entire test suite
 */
export function initializeTestSuiteMemoryMonitoring(): void {
  if (memoryMonitoringEnabled) return

  // Initialize with solo developer configuration
  initializeMemoryMonitoring(SOLO_DEV_CONFIG)
  memoryMonitoringEnabled = true

  console.log('🎯 Test suite memory monitoring initialized')

  // Log system information
  const stats = getMemoryMonitoringStats()
  console.log(`📊 Memory baseline: ${stats.currentHeapUsage}MB heap`)
  console.log(
    `🔧 GC available: ${stats.hasGarbageCollection ? 'Yes' : 'No (run with --expose-gc)'}`
  )
}

/**
 * Start monitoring for an individual test file
 */
export async function startTestFileMemoryMonitoring(fileName: string): Promise<void> {
  if (!memoryMonitoringEnabled) {
    initializeTestSuiteMemoryMonitoring()
  }

  const snapshot = await takeMemorySnapshot(`${fileName} - FILE_START`)
  console.log(`🎯 Started file monitoring: ${fileName} (${snapshot.heapUsed}MB)`)
}

/**
 * End monitoring for an individual test file and check for leaks
 */
export async function endTestFileMemoryMonitoring(fileName: string): Promise<void> {
  if (!memoryMonitoringEnabled) return

  const snapshot = await takeMemorySnapshot(`${fileName} - FILE_END`)
  console.log(`🏁 Completed file monitoring: ${fileName} (${snapshot.heapUsed}MB)`)

  // Analyze trends for this test file
  const trends = analyzeMemoryTrends()
  if (trends.totalGrowth > 15) {
    const alert = `📈 HIGH GROWTH in ${fileName}: ${trends.totalGrowth.toFixed(2)}MB`
    memoryAlerts.push(alert)
    console.warn(alert)
  }
}

/**
 * Monitor memory during test execution with automatic leak detection
 */
export function createTestMemoryGuard(testName?: string) {
  let testStartSnapshot: MemorySnapshot | null = null
  let testEndSnapshot: MemorySnapshot | null = null

  return {
    async beforeTest(): Promise<void> {
      if (!memoryMonitoringEnabled) return
      testStartSnapshot = await takeMemorySnapshot(testName ? `${testName}_START` : 'TEST_START')
    },

    async afterTest(): Promise<{ leaked: boolean; growth: number; recommendations: string[] }> {
      if (!memoryMonitoringEnabled || !testStartSnapshot) {
        return { leaked: false, growth: 0, recommendations: [] }
      }

      testEndSnapshot = await takeMemorySnapshot(testName ? `${testName}_END` : 'TEST_END')
      const growth = testEndSnapshot.heapUsed - testStartSnapshot.heapUsed
      const leaked = growth > (SOLO_DEV_CONFIG.growthThresholdMB || 8)

      const recommendations: string[] = []
      if (leaked) {
        recommendations.push(`Memory leak detected: +${growth.toFixed(2)}MB`)
        if (growth > 20) {
          recommendations.push('🔥 CRITICAL: Review object retention and cleanup')
        } else if (growth > 10) {
          recommendations.push('⚠️ HIGH: Check resource cleanup in test')
        } else {
          recommendations.push('📊 MEDIUM: Monitor for accumulation across tests')
        }

        const alert = `🚨 Memory leak in ${testName || 'test'}: +${growth.toFixed(2)}MB`
        memoryAlerts.push(alert)

        // In development, log immediately for awareness
        if (!process.env.CI) {
          console.warn(alert)
          console.warn('💡 Recommendations:', recommendations)
        }
      }

      return { leaked, growth, recommendations }
    },

    getSnapshots(): { start: MemorySnapshot | null; end: MemorySnapshot | null } {
      return { start: testStartSnapshot, end: testEndSnapshot }
    },
  }
}

/**
 * Setup memory monitoring hooks for Vitest lifecycle
 */
export function setupMemoryMonitoringHooks(): void {
  beforeAll(async () => {
    initializeTestSuiteMemoryMonitoring()
    testSuiteStartSnapshot = await takeMemorySnapshot('TEST_SUITE_START')
    memoryAlerts = []
  })

  afterAll(async () => {
    if (!memoryMonitoringEnabled) return

    // Take final snapshot
    const finalSnapshot = await takeMemorySnapshot('TEST_SUITE_END')

    // Generate comprehensive report
    await generateMemoryReport(finalSnapshot)

    // Cleanup monitoring
    cleanupMemoryMonitoring()
    memoryMonitoringEnabled = false
  })
}

/**
 * Generate comprehensive memory report at end of test suite
 */
async function generateMemoryReport(finalSnapshot: MemorySnapshot): Promise<void> {
  if (!testSuiteStartSnapshot) return

  const totalGrowth = finalSnapshot.heapUsed - testSuiteStartSnapshot.heapUsed
  const trends = analyzeMemoryTrends()
  const stats = getMemoryMonitoringStats()

  console.log(`\n${'='.repeat(60)}`)
  console.log('📊 MEMORY MONITORING REPORT')
  console.log('='.repeat(60))
  console.log(
    `🎯 Test Suite Duration: ${Math.round((finalSnapshot.timestamp - testSuiteStartSnapshot.timestamp) / 1000)}s`
  )
  console.log(`📈 Total Memory Growth: ${totalGrowth.toFixed(2)}MB`)
  console.log(`📊 Peak Memory Usage: ${trends.peakUsage.toFixed(2)}MB`)
  console.log(`📸 Total Snapshots: ${stats.snapshotCount}`)
  console.log(`🎪 Final Heap Usage: ${finalSnapshot.heapUsed}MB`)

  // Growth assessment
  if (totalGrowth > 30) {
    console.log('🔥 CRITICAL: High memory growth detected across test suite')
  } else if (totalGrowth > 15) {
    console.log('⚠️  WARNING: Moderate memory growth detected')
  } else if (totalGrowth < -5) {
    console.log('✨ EXCELLENT: Memory usage decreased (good cleanup)')
  } else {
    console.log('✅ GOOD: Memory growth within acceptable limits')
  }

  // Trend analysis
  console.log(`📈 Trend Analysis: ${trends.trendAnalysis}`)

  // Alerts summary
  if (memoryAlerts.length > 0) {
    console.log(`\n🚨 MEMORY ALERTS (${memoryAlerts.length}):`)
    memoryAlerts.forEach(alert => console.log(`  • ${alert}`))
  }

  // Recommendations
  if (trends.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:')
    trends.recommendations.forEach(rec => console.log(`  • ${rec}`))
  }

  // Solo developer specific advice
  if (!process.env.CI) {
    console.log('\n🎯 SOLO DEVELOPER TIPS:')
    if (totalGrowth > 20) {
      console.log('  • Consider running tests in smaller batches')
      console.log('  • Review cleanup in beforeEach/afterEach hooks')
    }
    if (trends.peakUsage > 150) {
      console.log('  • Peak memory usage is high - consider test sharding')
    }
    if (memoryAlerts.length > 5) {
      console.log('  • Multiple memory leaks detected - prioritize cleanup fixes')
    }
    if (stats.hasGarbageCollection) {
      console.log('  • ✅ GC is available - good for accurate monitoring')
    } else {
      console.log('  • 🔧 Enable GC with --expose-gc for better accuracy')
    }
  }

  console.log(`${'='.repeat(60)}\n`)
}

/**
 * Memory monitoring decorator for individual test functions
 */
export function withMemoryGuard<T extends unknown[], R>(
  testFn: (...args: T) => Promise<R> | R,
  testName: string
) {
  return async (...args: T): Promise<R> => {
    const guard = createTestMemoryGuard(testName)

    await guard.beforeTest()

    let result: R | undefined
    let error: Error | undefined

    try {
      result = await testFn(...args)
    } catch (err) {
      error = err as Error
    }

    const { leaked, growth, recommendations } = await guard.afterTest()

    // Check for memory leaks after cleanup
    if (leaked && (process.env.STRICT_MEMORY_CHECKS || process.env.CI)) {
      const memoryError = new Error(
        `Memory leak detected in ${testName}: +${growth.toFixed(2)}MB growth. ` +
          `Recommendations: ${recommendations.join(', ')}`
      )

      // If there was already an error, prefer the original error
      if (error) {
        throw error
      }
      throw memoryError
    }

    // Re-throw original error if one occurred
    if (error) {
      throw error
    }

    return result as R
  }
}

/**
 * Quick memory health check for test suites
 */
export async function performMemoryHealthCheck(): Promise<{
  healthy: boolean
  currentUsage: number
  alerts: string[]
  recommendations: string[]
}> {
  if (!memoryMonitoringEnabled) {
    initializeTestSuiteMemoryMonitoring()
  }

  const stats = getMemoryMonitoringStats()
  const trends = analyzeMemoryTrends()

  const healthy = stats.currentHeapUsage < 200 && memoryAlerts.length < 3

  return {
    healthy,
    currentUsage: stats.currentHeapUsage,
    alerts: [...memoryAlerts],
    recommendations: trends.recommendations,
  }
}

/**
 * Get current memory monitoring status
 */
export function getMemoryMonitoringStatus(): {
  enabled: boolean
  alertCount: number
  currentUsage: number
  hasGC: boolean
} {
  const stats = getMemoryMonitoringStats()

  return {
    enabled: memoryMonitoringEnabled,
    alertCount: memoryAlerts.length,
    currentUsage: stats.currentHeapUsage,
    hasGC: stats.hasGarbageCollection,
  }
}

// Export utilities for external use
export { createTestMemoryGuard as createMemoryGuard, memoryAlerts as getMemoryAlerts }
