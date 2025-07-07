/**
 * Memory profiling utility for performance monitoring
 */

export interface MemoryMetrics {
  heapUsed: number
  heapTotal: number
  rss: number
  external: number
  arrayBuffers: number
  timestamp: number
}

export interface MemorySnapshot {
  id: string
  label: string
  metrics: MemoryMetrics
  duration?: number
}

export interface MemoryProfileResult {
  snapshots: MemorySnapshot[]
  summary: {
    peakHeapUsage: number
    totalDuration: number
    averageHeapUsage: number
    memoryLeakDetected: boolean
    gcRecommendations: string[]
  }
}

/**
 * Memory profiler for tracking performance under load
 */
export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = []
  private intervalId: NodeJS.Timeout | null = null
  private startTime: number = 0

  /**
   * Start continuous memory monitoring
   */
  startProfiling(intervalMs: number = 1000): void {
    this.startTime = Date.now()
    this.snapshots = []
    
    // Take initial snapshot
    this.takeSnapshot('start')
    
    // Set up continuous monitoring
    this.intervalId = setInterval(() => {
      this.takeSnapshot('monitoring')
    }, intervalMs)
  }

  /**
   * Stop memory monitoring and return results
   */
  stopProfiling(): MemoryProfileResult {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    
    // Take final snapshot
    this.takeSnapshot('end')
    
    return this.generateReport()
  }

  /**
   * Take a memory snapshot at a specific point
   */
  takeSnapshot(label: string): MemorySnapshot {
    const memory = process.memoryUsage()
    const snapshot: MemorySnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label,
      metrics: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        rss: memory.rss,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
        timestamp: Date.now(),
      },
      duration: this.startTime ? Date.now() - this.startTime : 0,
    }
    
    this.snapshots.push(snapshot)
    return snapshot
  }

  /**
   * Analyze memory growth patterns and detect potential leaks
   */
  private generateReport(): MemoryProfileResult {
    const heapUsages = this.snapshots.map(s => s.metrics.heapUsed)
    const peakHeapUsage = Math.max(...heapUsages)
    const averageHeapUsage = heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length
    
    // Simple leak detection: check if memory usage consistently grows
    const memoryLeakDetected = this.detectMemoryLeak()
    const gcRecommendations = this.generateGCRecommendations()
    
    return {
      snapshots: this.snapshots,
      summary: {
        peakHeapUsage,
        totalDuration: Date.now() - this.startTime,
        averageHeapUsage,
        memoryLeakDetected,
        gcRecommendations,
      },
    }
  }

  /**
   * Simple memory leak detection based on growth trend
   */
  private detectMemoryLeak(): boolean {
    if (this.snapshots.length < 5) return false
    
    const recentSnapshots = this.snapshots.slice(-5)
    const growthPattern = recentSnapshots.map((snapshot, index) => {
      if (index === 0) return 0
      return snapshot.metrics.heapUsed - recentSnapshots[index - 1].metrics.heapUsed
    }).slice(1)
    
    // If memory consistently grows for 4 consecutive measurements
    return growthPattern.every(growth => growth > 0)
  }

  /**
   * Generate garbage collection recommendations
   */
  private generateGCRecommendations(): string[] {
    const recommendations: string[] = []
    const latestSnapshot = this.snapshots[this.snapshots.length - 1]
    
    if (!latestSnapshot) return recommendations
    
    const { heapUsed, heapTotal } = latestSnapshot.metrics
    const heapUtilization = heapUsed / heapTotal
    
    if (heapUtilization > 0.8) {
      recommendations.push('High heap utilization detected - consider manual garbage collection')
    }
    
    if (this.detectMemoryLeak()) {
      recommendations.push('Potential memory leak detected - review cache implementations and event listeners')
    }
    
    if (latestSnapshot.metrics.arrayBuffers > 50 * 1024 * 1024) { // 50MB
      recommendations.push('Large ArrayBuffer usage detected - consider streaming for large data operations')
    }
    
    return recommendations
  }

  /**
   * Force garbage collection (Node.js only)
   */
  static forceGC(): void {
    if (global.gc) {
      global.gc()
    } else {
      console.warn('Garbage collection not available. Run with --expose-gc flag.')
    }
  }

  /**
   * Get current memory usage in a readable format
   */
  static getCurrentMemoryUsage(): { [key: string]: string } {
    const memory = process.memoryUsage()
    return {
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
      rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
      external: `${Math.round(memory.external / 1024 / 1024)} MB`,
    }
  }
}

/**
 * Simple wrapper for profiling specific operations
 */
export async function profileOperation<T>(
  operation: () => Promise<T>,
  label: string = 'operation'
): Promise<{ result: T; memoryProfile: MemoryProfileResult }> {
  const profiler = new MemoryProfiler()
  profiler.startProfiling(500) // More frequent sampling for short operations
  
  try {
    const result = await operation()
    const memoryProfile = profiler.stopProfiling()
    
    return { result, memoryProfile }
  } catch (error) {
    profiler.stopProfiling()
    throw error
  }
}

/**
 * Decorator for automatic memory profiling of class methods
 */
export function profileMemory(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value
  
  descriptor.value = async function (...args: any[]) {
    const profiler = new MemoryProfiler()
    profiler.startProfiling()
    
    try {
      const result = await method.apply(this, args)
      const profile = profiler.stopProfiling()
      
      // Log memory usage in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`Memory profile for ${propertyName}:`, profile.summary)
      }
      
      return result
    } catch (error) {
      profiler.stopProfiling()
      throw error
    }
  }
  
  return descriptor
}