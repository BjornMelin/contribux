/**
 * Performance Monitoring System
 * Tracks memory usage, performance metrics, and optimization opportunities
 */

interface PerformanceMetrics {
  memory: {
    heap: number
    rss: number
    external: number
    efficiency: number
  }
  timing: {
    startup: number
    firstRender: number
    interactivity: number
  }
  resources: {
    components: number
    connections: number
    cacheSize: number
  }
  vitals: {
    fcp?: number // First Contentful Paint
    lcp?: number // Largest Contentful Paint
    fid?: number // First Input Delay
    cls?: number // Cumulative Layout Shift
    ttfb?: number // Time to First Byte
  }
}

interface PerformanceAlert {
  type: 'memory' | 'performance' | 'error'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  metrics: Partial<PerformanceMetrics>
  timestamp: number
  suggestions: string[]
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics
  private alerts: PerformanceAlert[] = []
  private startTime: number
  private observers: PerformanceObserver[] = []
  private intervalId: NodeJS.Timeout | null = null

  constructor() {
    this.startTime = Date.now()
    this.metrics = {
      memory: { heap: 0, rss: 0, external: 0, efficiency: 0 },
      timing: { startup: 0, firstRender: 0, interactivity: 0 },
      resources: { components: 0, connections: 0, cacheSize: 0 },
      vitals: {},
    }

    this.initializeMonitoring()
  }

  /**
   * Initialize performance monitoring
   */
  private initializeMonitoring(): void {
    // Server-side monitoring
    if (typeof window === 'undefined') {
      this.initializeServerMonitoring()
    } else {
      this.initializeClientMonitoring()
    }
  }

  /**
   * Initialize server-side monitoring
   */
  private initializeServerMonitoring(): void {
    // Memory monitoring
    this.intervalId = setInterval(() => {
      this.updateServerMetrics()
      this.checkServerAlerts()
    }, 5000)

    // Process monitoring
    process.on('memoryUsage', () => {
      this.updateServerMetrics()
    })
  }

  /**
   * Initialize client-side monitoring
   */
  private initializeClientMonitoring(): void {
    // Web Vitals monitoring
    this.observeWebVitals()

    // Resource monitoring
    this.observeResources()

    // Memory monitoring (if available)
    if ('memory' in (window as any).performance) {
      this.intervalId = setInterval(() => {
        this.updateClientMetrics()
        this.checkClientAlerts()
      }, 5000)
    }
  }

  /**
   * Observe Web Vitals
   */
  private observeWebVitals(): void {
    try {
      // First Contentful Paint
      new PerformanceObserver(list => {
        const entries = list.getEntries()
        const fcp = entries.find(entry => entry.name === 'first-contentful-paint')
        if (fcp) {
          this.metrics.vitals.fcp = fcp.startTime
        }
      }).observe({ entryTypes: ['paint'] })

      // Largest Contentful Paint
      new PerformanceObserver(list => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        if (lastEntry) {
          this.metrics.vitals.lcp = lastEntry.startTime
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] })

      // First Input Delay
      new PerformanceObserver(list => {
        const entries = list.getEntries()
        const firstInput = entries[0]
        if (firstInput) {
          this.metrics.vitals.fid = firstInput.processingStart - firstInput.startTime
        }
      }).observe({ entryTypes: ['first-input'] })

      // Cumulative Layout Shift
      let clsValue = 0
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value
            this.metrics.vitals.cls = clsValue
          }
        }
      }).observe({ entryTypes: ['layout-shift'] })
    } catch (error) {
      console.warn('Web Vitals monitoring not fully supported:', error)
    }
  }

  /**
   * Observe resource loading
   */
  private observeResources(): void {
    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries()
        // Track resource loading performance
        this.metrics.timing.interactivity = Date.now() - this.startTime
      }).observe({ entryTypes: ['resource'] })
    } catch (error) {
      console.warn('Resource monitoring not supported:', error)
    }
  }

  /**
   * Update server-side metrics
   */
  private updateServerMetrics(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memoryUsage = process.memoryUsage()
      this.metrics.memory = {
        heap: memoryUsage.heapUsed,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        efficiency: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      }
    }
  }

  /**
   * Update client-side metrics
   */
  private updateClientMetrics(): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const memory = (window as any).performance.memory
      if (memory) {
        this.metrics.memory = {
          heap: memory.usedJSHeapSize,
          rss: memory.totalJSHeapSize,
          external: 0,
          efficiency: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
        }
      }

      // Update timing metrics
      const timing = window.performance.timing
      if (timing) {
        this.metrics.vitals.ttfb = timing.responseStart - timing.navigationStart
      }
    }
  }

  /**
   * Check for server-side performance alerts
   */
  private checkServerAlerts(): void {
    const { memory } = this.metrics

    // High memory usage alert
    if (memory.heap > 100 * 1024 * 1024) {
      // 100MB
      this.addAlert({
        type: 'memory',
        severity: 'high',
        message: 'High heap memory usage detected',
        metrics: { memory },
        suggestions: [
          'Check for memory leaks',
          'Optimize object allocations',
          'Enable garbage collection',
          'Review large data structures',
        ],
      })
    }

    // Low memory efficiency alert
    if (memory.efficiency < 50) {
      this.addAlert({
        type: 'memory',
        severity: 'medium',
        message: 'Low memory efficiency detected',
        metrics: { memory },
        suggestions: [
          'Force garbage collection',
          'Reduce object creation',
          'Optimize data structures',
        ],
      })
    }
  }

  /**
   * Check for client-side performance alerts
   */
  private checkClientAlerts(): void {
    const { vitals, memory } = this.metrics

    // Poor Core Web Vitals
    if (vitals.lcp && vitals.lcp > 2500) {
      this.addAlert({
        type: 'performance',
        severity: 'high',
        message: 'Poor Largest Contentful Paint performance',
        metrics: { vitals },
        suggestions: [
          'Optimize images and media',
          'Reduce server response times',
          'Implement lazy loading',
          'Use CDN for static assets',
        ],
      })
    }

    if (vitals.fid && vitals.fid > 100) {
      this.addAlert({
        type: 'performance',
        severity: 'medium',
        message: 'High First Input Delay detected',
        metrics: { vitals },
        suggestions: [
          'Reduce JavaScript execution time',
          'Use code splitting',
          'Optimize long tasks',
          'Defer non-critical JavaScript',
        ],
      })
    }

    if (vitals.cls && vitals.cls > 0.1) {
      this.addAlert({
        type: 'performance',
        severity: 'medium',
        message: 'Poor Cumulative Layout Shift detected',
        metrics: { vitals },
        suggestions: [
          'Include size attributes on images and videos',
          'Reserve space for dynamic content',
          'Avoid inserting content above existing content',
        ],
      })
    }

    // Client memory issues
    if (memory.heap > 50 * 1024 * 1024) {
      // 50MB for client
      this.addAlert({
        type: 'memory',
        severity: 'medium',
        message: 'High client-side memory usage',
        metrics: { memory },
        suggestions: [
          'Use lazy loading for components',
          'Clear unused component state',
          'Optimize image loading',
          'Review memory leaks in event listeners',
        ],
      })
    }
  }

  /**
   * Add performance alert
   */
  private addAlert(alert: Omit<PerformanceAlert, 'timestamp'>): void {
    const fullAlert: PerformanceAlert = {
      ...alert,
      timestamp: Date.now(),
    }

    this.alerts.push(fullAlert)

    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }

    // Log critical alerts immediately
    if (alert.severity === 'critical') {
      console.error('Critical performance alert:', fullAlert)
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Get performance alerts
   */
  getAlerts(severity?: PerformanceAlert['severity']): PerformanceAlert[] {
    if (severity) {
      return this.alerts.filter(alert => alert.severity === severity)
    }
    return [...this.alerts]
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const alerts = this.getAlerts()
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
    const highAlerts = alerts.filter(a => a.severity === 'high').length
    const mediumAlerts = alerts.filter(a => a.severity === 'medium').length

    return {
      metrics: this.metrics,
      alerts: {
        total: alerts.length,
        critical: criticalAlerts,
        high: highAlerts,
        medium: mediumAlerts,
      },
      recommendations: this.generateRecommendations(),
      status: this.getOverallStatus(),
    }
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = []
    const { memory, vitals } = this.metrics

    // Memory recommendations
    if (memory.heap > 50 * 1024 * 1024) {
      recommendations.push('Consider implementing lazy loading for heavy components')
      recommendations.push('Review and optimize large object allocations')
    }

    if (memory.efficiency < 60) {
      recommendations.push('Force garbage collection after heavy operations')
      recommendations.push('Optimize object lifecycle management')
    }

    // Performance recommendations
    if (vitals.lcp && vitals.lcp > 2000) {
      recommendations.push('Optimize critical rendering path')
      recommendations.push('Implement resource preloading')
    }

    if (vitals.fcp && vitals.fcp > 1500) {
      recommendations.push('Reduce time to first contentful paint')
      recommendations.push('Optimize CSS delivery')
    }

    return recommendations
  }

  /**
   * Get overall performance status
   */
  private getOverallStatus(): 'excellent' | 'good' | 'needs-improvement' | 'poor' {
    const criticalAlerts = this.getAlerts('critical').length
    const highAlerts = this.getAlerts('high').length
    const mediumAlerts = this.getAlerts('medium').length

    if (criticalAlerts > 0 || highAlerts > 2) return 'poor'
    if (highAlerts > 0 || mediumAlerts > 3) return 'needs-improvement'
    if (mediumAlerts > 0) return 'good'
    return 'excellent'
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = []
  }

  /**
   * Shutdown monitoring
   */
  shutdown(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.observers.forEach(observer => {
      try {
        observer.disconnect()
      } catch (error) {
        console.warn('Error disconnecting performance observer:', error)
      }
    })

    this.observers = []
  }

  /**
   * Force performance measurement
   */
  measure(): PerformanceMetrics {
    if (typeof window === 'undefined') {
      this.updateServerMetrics()
    } else {
      this.updateClientMetrics()
    }
    return this.getMetrics()
  }

  /**
   * Log performance report
   */
  logReport(): void {
    const summary = this.getSummary()
    console.log('📊 Performance Report:', summary)
  }
}

// Singleton instance
let globalMonitor: PerformanceMonitor | null = null

/**
 * Get global performance monitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor()
  }
  return globalMonitor
}

/**
 * Shutdown global performance monitor
 */
export function shutdownPerformanceMonitor(): void {
  if (globalMonitor) {
    globalMonitor.shutdown()
    globalMonitor = null
  }
}

export { PerformanceMonitor, type PerformanceMetrics, type PerformanceAlert }
