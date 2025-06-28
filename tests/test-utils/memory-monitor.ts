/**
 * Enhanced Memory Monitoring and Leak Detection Utilities
 * Provides comprehensive memory tracking, leak detection, and performance monitoring
 * Optimized for Vitest 3.2+ with solo developer workflow
 */

interface MemorySnapshot {
  timestamp: number
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  pid: number
  testName?: string
}

interface MemoryLeakResult {
  leaked: boolean
  growth: number
  threshold: number
  snapshots: MemorySnapshot[]
  recommendations: string[]
}

interface MemoryMonitorConfig {
  // Memory leak detection thresholds
  growthThresholdMB: number
  maxSnapshotsToKeep: number
  gcInvocationDelay: number

  // Performance monitoring
  enableHeapProfiler: boolean
  logMemoryEvery: number

  // Cleanup settings
  forceGCBeforeSnapshot: boolean
  cleanupAfterTest: boolean
}

// Global memory monitoring state
let memorySnapshots: MemorySnapshot[] = []
let testStartSnapshot: MemorySnapshot | null = null
let monitoringEnabled = false

// Default configuration optimized for solo development
const DEFAULT_CONFIG: MemoryMonitorConfig = {
  growthThresholdMB: 10, // 10MB growth indicates potential leak
  maxSnapshotsToKeep: 100,
  gcInvocationDelay: 100, // ms to wait after GC
  enableHeapProfiler: !process.env.CI, // Only in local development
  logMemoryEvery: 10, // Log every 10 snapshots
  forceGCBeforeSnapshot: true,
  cleanupAfterTest: true,
}

/**
 * Initialize memory monitoring for a test session
 */
export function initializeMemoryMonitoring(config: Partial<MemoryMonitorConfig> = {}): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  if (!global.gc) {
    console.warn(
      '⚠️ Garbage collection not exposed. Run with --expose-gc flag for accurate memory monitoring.'
    )
  }

  monitoringEnabled = true
  memorySnapshots = []

  console.log('🔍 Memory monitoring initialized with config:', finalConfig)
}

/**
 * Take a memory snapshot at the current point in time
 */
export async function takeMemorySnapshot(testName?: string): Promise<MemorySnapshot> {
  if (!monitoringEnabled) {
    initializeMemoryMonitoring()
  }

  // Force garbage collection if available and configured
  if (global.gc && DEFAULT_CONFIG.forceGCBeforeSnapshot) {
    global.gc()
    // Small delay to let GC complete
    await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.gcInvocationDelay))
  }

  const memUsage = process.memoryUsage()
  const snapshot: MemorySnapshot = {
    timestamp: Date.now(),
    heapUsed: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
    heapTotal: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
    external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
    rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
    pid: process.pid,
    testName,
  }

  // Store snapshot with size limit
  memorySnapshots.push(snapshot)
  if (memorySnapshots.length > DEFAULT_CONFIG.maxSnapshotsToKeep) {
    memorySnapshots = memorySnapshots.slice(-DEFAULT_CONFIG.maxSnapshotsToKeep)
  }

  // Log periodic memory updates
  if (memorySnapshots.length % DEFAULT_CONFIG.logMemoryEvery === 0) {
    console.log(
      `📊 Memory snapshot #${memorySnapshots.length}: ${snapshot.heapUsed}MB heap, ${snapshot.rss}MB RSS`
    )
  }

  return snapshot
}

/**
 * Start monitoring a test for memory leaks
 */
export async function startTestMemoryMonitoring(testName: string): Promise<void> {
  testStartSnapshot = await takeMemorySnapshot(`${testName} - START`)
  console.log(`🎯 Started memory monitoring for test: ${testName}`)
}

/**
 * End test monitoring and check for memory leaks
 */
export async function endTestMemoryMonitoring(testName: string): Promise<MemoryLeakResult> {
  const endSnapshot = await takeMemorySnapshot(`${testName} - END`)

  if (!testStartSnapshot) {
    console.warn('⚠️ No start snapshot found - call startTestMemoryMonitoring first')
    return {
      leaked: false,
      growth: 0,
      threshold: DEFAULT_CONFIG.growthThresholdMB,
      snapshots: [endSnapshot],
      recommendations: ['Call startTestMemoryMonitoring at the beginning of the test'],
    }
  }

  const memoryGrowth = endSnapshot.heapUsed - testStartSnapshot.heapUsed
  const memoryGrowthMB = memoryGrowth / (1024 * 1024)
  const leaked = memoryGrowthMB > DEFAULT_CONFIG.growthThresholdMB

  const result: MemoryLeakResult = {
    leaked,
    growth: memoryGrowth,
    threshold: DEFAULT_CONFIG.growthThresholdMB,
    snapshots: [testStartSnapshot, endSnapshot],
    recommendations: generateMemoryRecommendations(memoryGrowthMB, testStartSnapshot, endSnapshot),
  }

  // Log results
  if (leaked) {
    console.error(`🚨 Memory leak detected in ${testName}: +${memoryGrowth.toFixed(2)}MB growth`)
  } else {
    console.log(`✅ No memory leak in ${testName}: ${memoryGrowth.toFixed(2)}MB growth`)
  }

  // Reset for next test
  testStartSnapshot = null

  return result
}

/**
 * Generate memory optimization recommendations based on usage patterns
 */
function generateMemoryRecommendations(
  growth: number,
  startSnapshot: MemorySnapshot,
  endSnapshot: MemorySnapshot
): string[] {
  const recommendations: string[] = []

  if (growth > 50) {
    recommendations.push(
      '🔥 CRITICAL: Memory growth >50MB indicates major leak - review object retention'
    )
  } else if (growth > 20) {
    recommendations.push(
      '⚠️ HIGH: Memory growth >20MB - check for unclosed resources or large object allocations'
    )
  } else if (growth > 10) {
    recommendations.push(
      '📈 MEDIUM: Memory growth >10MB - review cleanup in afterEach/afterAll hooks'
    )
  } else if (growth > 5) {
    recommendations.push('📊 LOW: Memory growth >5MB - monitor for accumulation across tests')
  }

  // RSS growth check
  const rssGrowth = endSnapshot.rss - startSnapshot.rss
  const rssGrowthMB = rssGrowth / (1024 * 1024)
  if (rssGrowthMB > growth * 2) {
    recommendations.push(
      '💾 High RSS growth detected - possible external memory usage (buffers, native modules)'
    )
  }

  // External memory check
  const externalGrowth = endSnapshot.external - startSnapshot.external
  if (externalGrowth > 5) {
    recommendations.push(
      '🔌 External memory growth detected - check for unclosed connections or file handles'
    )
  }

  if (recommendations.length === 0) {
    recommendations.push('✨ Memory usage looks healthy!')
  }

  return recommendations
}

/**
 * Detailed memory analysis for debugging
 */
export function analyzeMemoryTrends(): {
  totalGrowth: number
  averageGrowth: number
  peakUsage: number
  trendAnalysis: string
  recommendations: string[]
} {
  if (memorySnapshots.length < 2) {
    return {
      totalGrowth: 0,
      averageGrowth: 0,
      peakUsage: 0,
      trendAnalysis: 'Insufficient data for trend analysis',
      recommendations: ['Take more memory snapshots to enable trend analysis'],
    }
  }

  const firstSnapshot = memorySnapshots[0]
  const lastSnapshot = memorySnapshots[memorySnapshots.length - 1]
  const totalGrowth = lastSnapshot.heapUsed - firstSnapshot.heapUsed

  const growthValues = memorySnapshots
    .slice(1)
    .map((snapshot, index) => snapshot.heapUsed - memorySnapshots[index].heapUsed)

  const averageGrowth = growthValues.reduce((sum, growth) => sum + growth, 0) / growthValues.length
  const peakUsage = Math.max(...memorySnapshots.map(s => s.heapUsed))

  let trendAnalysis = 'Stable memory usage'
  if (totalGrowth > 20) {
    trendAnalysis = 'Significant upward trend - potential memory leak'
  } else if (totalGrowth > 10) {
    trendAnalysis = 'Moderate upward trend - monitor closely'
  } else if (totalGrowth < -5) {
    trendAnalysis = 'Downward trend - good garbage collection'
  }

  const recommendations = []
  if (averageGrowth > 2) {
    recommendations.push('Consider reducing test concurrency to manage memory pressure')
  }
  if (peakUsage > 100) {
    recommendations.push('Peak memory usage >100MB - consider test sharding for large suites')
  }
  if (growthValues.some(g => g > 15)) {
    recommendations.push('Some tests have high memory growth - review individual test cleanup')
  }

  return {
    totalGrowth,
    averageGrowth,
    peakUsage,
    trendAnalysis,
    recommendations,
  }
}

/**
 * Memory monitoring decorator for test functions
 */
export function withMemoryMonitoring<T extends unknown[], R>(
  testFn: (...args: T) => Promise<R>,
  testName: string
) {
  return async (...args: T): Promise<R> => {
    await startTestMemoryMonitoring(testName)

    let result: R
    let error: Error | undefined

    try {
      result = await testFn(...args)
    } catch (err) {
      error = err as Error
    }

    const leakResult = await endTestMemoryMonitoring(testName)

    if (leakResult.leaked) {
      console.error(`❌ Test ${testName} failed memory leak check:`)
      console.error(
        `   Growth: ${leakResult.growth.toFixed(2)}MB (threshold: ${leakResult.threshold}MB)`
      )
      console.error('   Recommendations:', leakResult.recommendations)

      // In CI or strict mode, fail the test
      if (process.env.CI || process.env.STRICT_MEMORY_CHECKS) {
        const memoryError = new Error(
          `Memory leak detected: ${leakResult.growth.toFixed(2)}MB growth exceeds ${leakResult.threshold}MB threshold`
        )

        // If there was already an error, prefer the original error
        if (error) {
          throw error
        }
        throw memoryError
      }
    }

    // Re-throw original error if one occurred
    if (error) {
      throw error
    }

    return result as R
  }
}

/**
 * Create a memory pressure test to validate cleanup
 */
export async function createMemoryPressureTest(iterations = 100): Promise<{
  startMemory: number
  peakMemory: number
  endMemory: number
  effectiveCleanup: boolean
}> {
  const startSnapshot = await takeMemorySnapshot('pressure-test-start')
  let peakMemory = startSnapshot.heapUsed

  // Create memory pressure
  const arrays: number[][] = []

  for (let i = 0; i < iterations; i++) {
    // Allocate 1MB array
    const largeArray = new Array(250000).fill(Math.random())
    arrays.push(largeArray)

    // Track peak usage
    if (i % 10 === 0) {
      const currentSnapshot = await takeMemorySnapshot()
      peakMemory = Math.max(peakMemory, currentSnapshot.heapUsed)
    }
  }

  // Clear references
  arrays.length = 0

  // Force garbage collection
  if (global.gc) {
    global.gc()
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  const endSnapshot = await takeMemorySnapshot('pressure-test-end')
  const effectiveCleanup = endSnapshot.heapUsed - startSnapshot.heapUsed < 5 // Within 5MB

  return {
    startMemory: startSnapshot.heapUsed,
    peakMemory,
    endMemory: endSnapshot.heapUsed,
    effectiveCleanup,
  }
}

/**
 * Clean up memory monitoring state
 */
export function cleanupMemoryMonitoring(): void {
  memorySnapshots = []
  testStartSnapshot = null
  monitoringEnabled = false

  if (global.gc) {
    global.gc()
  }

  console.log('🧹 Memory monitoring cleaned up')
}

/**
 * Get current memory monitoring statistics
 */
export function getMemoryMonitoringStats(): {
  snapshotCount: number
  currentHeapUsage: number
  isMonitoring: boolean
  hasGarbageCollection: boolean
} {
  const currentUsage = process.memoryUsage()

  return {
    snapshotCount: memorySnapshots.length,
    currentHeapUsage: Math.round((currentUsage.heapUsed / 1024 / 1024) * 100) / 100,
    isMonitoring: monitoringEnabled,
    hasGarbageCollection: typeof global.gc === 'function',
  }
}

// Export types for external use
export type { MemorySnapshot, MemoryLeakResult, MemoryMonitorConfig }
