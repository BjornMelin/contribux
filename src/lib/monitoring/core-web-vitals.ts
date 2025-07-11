/**
 * Core Web Vitals Performance Monitoring
 * Enterprise-grade performance tracking and analysis
 */

import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import { isDevelopment, isProduction } from '@/lib/validation/env'

export interface WebVitalMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  entries: PerformanceEntry[]
  id: string
  navigationType?: string
  timestamp: number
}

export interface PerformanceReport {
  metrics: WebVitalMetric[]
  timestamp: number
  url: string
  userAgent: string
  connectionType?: string
  deviceMemory?: number
  hardwareConcurrency?: number
  sessionId: string
}

/**
 * Performance thresholds based on Google's Core Web Vitals
 */
export const CORE_WEB_VITALS_THRESHOLDS = {
  // Largest Contentful Paint (LCP)
  LCP: {
    good: 2500, // <= 2.5s
    poor: 4000, // > 4.0s
  },
  // First Input Delay (FID)
  FID: {
    good: 100, // <= 100ms
    poor: 300, // > 300ms
  },
  // Cumulative Layout Shift (CLS)
  CLS: {
    good: 0.1, // <= 0.1
    poor: 0.25, // > 0.25
  },
  // First Contentful Paint (FCP)
  FCP: {
    good: 1800, // <= 1.8s
    poor: 3000, // > 3.0s
  },
  // Time to First Byte (TTFB)
  TTFB: {
    good: 800, // <= 0.8s
    poor: 1800, // > 1.8s
  },
} as const

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

/**
 * Get device capabilities
 */
function getDeviceCapabilities() {
  const nav = navigator as any
  return {
    connectionType: nav.connection?.effectiveType || 'unknown',
    deviceMemory: nav.deviceMemory || undefined,
    hardwareConcurrency: nav.hardwareConcurrency || undefined,
  }
}

/**
 * Rate performance metric based on thresholds
 */
function rateMetric(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = CORE_WEB_VITALS_THRESHOLDS[name as keyof typeof CORE_WEB_VITALS_THRESHOLDS]

  if (!thresholds) {
    return 'good' // Default for metrics without specific thresholds
  }

  if (value <= thresholds.good) {
    return 'good'
  }
  if (value <= thresholds.poor) {
    return 'needs-improvement'
  }
  return 'poor'
}

/**
 * Convert web-vitals metric to our format
 */
function formatMetric(metric: Metric): WebVitalMetric {
  return {
    name: metric.name,
    value: metric.value,
    rating: rateMetric(metric.name, metric.value),
    delta: metric.delta,
    entries: metric.entries || [],
    id: metric.id,
    navigationType: (metric as any).navigationType || 'unknown',
    timestamp: Date.now(),
  }
}

/**
 * Performance monitoring class
 */
export class CoreWebVitalsMonitor {
  private metrics: WebVitalMetric[] = []
  private sessionId: string
  private reportCallback?: (report: PerformanceReport) => void

  constructor(reportCallback?: (report: PerformanceReport) => void) {
    this.sessionId = generateSessionId()
    this.reportCallback = reportCallback
    this.init()
  }

  /**
   * Initialize monitoring
   */
  private init(): void {
    if (typeof window === 'undefined') {
      return // Server-side rendering
    }

    // Monitor Core Web Vitals
    onCLS(this.onMetric.bind(this), { reportAllChanges: true })
    onFCP(this.onMetric.bind(this))
    onINP(this.onMetric.bind(this))
    onLCP(this.onMetric.bind(this), { reportAllChanges: true })
    onTTFB(this.onMetric.bind(this))

    // Send report when page is hidden
    this.setupReporting()
  }

  /**
   * Handle metric collection
   */
  private onMetric(metric: Metric): void {
    const formattedMetric = formatMetric(metric)

    // Update or add metric
    const existingIndex = this.metrics.findIndex(m => m.name === metric.name)
    if (existingIndex >= 0) {
      this.metrics[existingIndex] = formattedMetric
    } else {
      this.metrics.push(formattedMetric)
    }

    // Log in development
    if (isDevelopment()) {
    }

    // Report critical metrics immediately
    if (formattedMetric.rating === 'poor') {
      this.reportMetric(formattedMetric)
    }
  }

  /**
   * Setup reporting mechanisms
   */
  private setupReporting(): void {
    // Report on page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.sendReport()
      }
    })

    // Report on page unload
    window.addEventListener('beforeunload', () => {
      this.sendReport()
    })

    // Report periodically for long-running sessions
    setInterval(() => {
      if (this.metrics.length > 0) {
        this.sendReport()
      }
    }, 30000) // Every 30 seconds
  }

  /**
   * Report individual metric
   */
  private reportMetric(metric: WebVitalMetric): void {
    if (this.reportCallback) {
      const report: PerformanceReport = {
        metrics: [metric],
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        sessionId: this.sessionId,
        ...getDeviceCapabilities(),
      }

      this.reportCallback(report)
    }
  }

  /**
   * Send complete performance report
   */
  public sendReport(): void {
    if (this.metrics.length === 0) {
      return
    }

    const report: PerformanceReport = {
      metrics: [...this.metrics],
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      ...getDeviceCapabilities(),
    }

    if (this.reportCallback) {
      this.reportCallback(report)
    }

    // Send to analytics endpoint
    this.sendToAnalytics(report)
  }

  /**
   * Send report to analytics service
   */
  private sendToAnalytics(report: PerformanceReport): void {
    if (!isProduction()) {
      return
    }

    // Use sendBeacon for reliability
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(report)], {
        type: 'application/json',
      })
      navigator.sendBeacon('/api/analytics/web-vitals', blob)
    } else {
      // Fallback to fetch
      fetch('/api/analytics/web-vitals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
        keepalive: true,
      }).catch(_error => {
        if (isDevelopment()) {
        }
      })
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): WebVitalMetric[] {
    return [...this.metrics]
  }

  /**
   * Get performance score
   */
  public getPerformanceScore(): number {
    if (this.metrics.length === 0) {
      return 100
    }

    const scores = this.metrics.map(metric => {
      switch (metric.rating) {
        case 'good':
          return 100
        case 'needs-improvement':
          return 75
        case 'poor':
          return 50
        default:
          return 100
      }
    })

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  /**
   * Get performance insights
   */
  public getInsights(): string[] {
    const insights: string[] = []

    for (const metric of this.metrics) {
      if (metric.rating === 'poor') {
        switch (metric.name) {
          case 'LCP':
            insights.push(
              'Large Contentful Paint is slow. Consider optimizing images and reducing server response times.'
            )
            break
          case 'FID':
            insights.push(
              'First Input Delay is high. Reduce JavaScript execution time and code splitting.'
            )
            break
          case 'CLS':
            insights.push(
              'Cumulative Layout Shift is high. Ensure images have dimensions and avoid dynamic content insertion.'
            )
            break
          case 'FCP':
            insights.push(
              'First Contentful Paint is slow. Optimize critical rendering path and reduce resource loading times.'
            )
            break
          case 'TTFB':
            insights.push(
              'Time to First Byte is slow. Optimize server performance and consider edge caching.'
            )
            break
        }
      }
    }

    return insights
  }
}

/**
 * Global monitor instance
 */
let globalMonitor: CoreWebVitalsMonitor | null = null

/**
 * Initialize Core Web Vitals monitoring
 */
export function initCoreWebVitalsMonitoring(
  reportCallback?: (report: PerformanceReport) => void
): CoreWebVitalsMonitor {
  if (typeof window === 'undefined') {
    // Return mock for server-side rendering with all required properties
    const mockMonitor: CoreWebVitalsMonitor = Object.create(CoreWebVitalsMonitor.prototype)

    // Add all required properties and methods for the mock
    Object.assign(mockMonitor, {
      sendReport: () => {},
      getMetrics: () => [],
      getPerformanceScore: () => 100,
      getInsights: () => [],
      sessionId: generateSessionId(),
      metrics: [],
      reportCallback: undefined,
    })

    return mockMonitor
  }

  if (!globalMonitor) {
    globalMonitor = new CoreWebVitalsMonitor(reportCallback)
  }

  return globalMonitor
}

/**
 * Get the global monitor instance
 */
export function getCoreWebVitalsMonitor(): CoreWebVitalsMonitor | null {
  return globalMonitor
}

/**
 * Performance monitoring hook for React components
 */
export function usePerformanceMonitoring() {
  const monitor = getCoreWebVitalsMonitor()

  return {
    monitor,
    metrics: monitor?.getMetrics() || [],
    score: monitor?.getPerformanceScore() || 100,
    insights: monitor?.getInsights() || [],
    sendReport: () => monitor?.sendReport(),
  }
}

/**
 * Performance budget checker
 */
export function checkPerformanceBudget(metrics: WebVitalMetric[]): {
  passed: boolean
  violations: string[]
} {
  const violations: string[] = []

  for (const metric of metrics) {
    if (metric.rating === 'poor') {
      violations.push(`${metric.name} exceeded threshold: ${metric.value}`)
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  }
}

/**
 * Default report callback for development
 */
export function defaultReportCallback(_report: PerformanceReport): void {
  if (isDevelopment()) {
  }
}
