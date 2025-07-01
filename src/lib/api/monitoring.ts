/**
 * API Monitoring and Performance Metrics
 * Comprehensive monitoring system for API performance, errors, and health
 *
 * Features:
 * - Request/response tracking with timing
 * - Error rate monitoring and alerting
 * - Performance metrics and trends
 * - Health check endpoints monitoring
 * - Rate limiting monitoring
 * - Cache performance tracking
 * - Real-time dashboards and alerts
 */

import { z } from 'zod'

// Performance metrics interfaces
interface RequestMetrics {
  url: string
  method: string
  statusCode: number
  duration: number
  timestamp: number
  userAgent?: string
  userId?: string
  error?: string
  cacheHit?: boolean
  retryCount?: number
}

interface EndpointMetrics {
  endpoint: string
  totalRequests: number
  successfulRequests: number
  errorRequests: number
  averageResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  errorRate: number
  throughput: number // requests per minute
  lastAccessed: number
}

interface ErrorMetrics {
  type: 'client' | 'server' | 'network' | 'timeout' | 'validation'
  endpoint: string
  statusCode: number
  message: string
  stack?: string
  timestamp: number
  userId?: string
  requestId?: string
  count: number
}

interface HealthMetrics {
  endpoint: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  lastCheck: number
  consecutiveFailures: number
  uptime: number
  errorRate: number
}

// Configuration
interface MonitoringConfig {
  metricsRetention: number // How long to keep metrics (milliseconds)
  errorThreshold: number // Error rate threshold for alerts (0-1)
  responseTimeThreshold: number // Response time threshold in ms
  healthCheckInterval: number // Health check interval in ms
  alertCooldown: number // Cooldown between alerts in ms
  enableRealTimeAlerts: boolean
}

const defaultConfig: MonitoringConfig = {
  metricsRetention: 24 * 60 * 60 * 1000, // 24 hours
  errorThreshold: 0.05, // 5% error rate
  responseTimeThreshold: 2000, // 2 seconds
  healthCheckInterval: 30000, // 30 seconds
  alertCooldown: 5 * 60 * 1000, // 5 minutes
  enableRealTimeAlerts: true,
}

// Storage for metrics (in production, this would be a time-series database)
class MetricsStore {
  private requests: RequestMetrics[] = []
  private endpoints: Map<string, EndpointMetrics> = new Map()
  private errors: ErrorMetrics[] = []
  private health: Map<string, HealthMetrics> = new Map()
  private alerts: Map<string, number> = new Map() // Last alert timestamp

  constructor(private config: MonitoringConfig) {
    this.startCleanupInterval()
  }

  // Record request metrics
  recordRequest(metrics: RequestMetrics): void {
    this.requests.push(metrics)
    this.updateEndpointMetrics(metrics)

    // Record errors
    if (metrics.statusCode >= 400) {
      this.recordError({
        type: this.categorizeError(metrics.statusCode),
        endpoint: this.normalizeEndpoint(metrics.url),
        statusCode: metrics.statusCode,
        message: metrics.error || `HTTP ${metrics.statusCode}`,
        timestamp: metrics.timestamp,
        userId: metrics.userId ?? undefined,
        count: 1,
      })
    }

    this.checkAlerts()
  }

  private updateEndpointMetrics(request: RequestMetrics): void {
    const endpoint = this.normalizeEndpoint(request.url)
    const existing = this.endpoints.get(endpoint) || {
      endpoint,
      totalRequests: 0,
      successfulRequests: 0,
      errorRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      throughput: 0,
      lastAccessed: Date.now(),
    }

    existing.totalRequests++
    existing.lastAccessed = Date.now()

    if (request.statusCode < 400) {
      existing.successfulRequests++
    } else {
      existing.errorRequests++
    }

    // Calculate response time metrics
    const recentRequests = this.getRecentRequestsForEndpoint(endpoint, 5 * 60 * 1000) // Last 5 minutes
    const responseTimes = recentRequests.map(r => r.duration).sort((a, b) => a - b)

    if (responseTimes.length > 0) {
      existing.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      existing.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0
      existing.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0
    }

    existing.errorRate = existing.errorRequests / existing.totalRequests
    existing.throughput = this.calculateThroughput(endpoint, 60 * 1000) // Per minute

    this.endpoints.set(endpoint, existing)
  }

  private recordError(error: ErrorMetrics): void {
    // Check if similar error exists recently
    const recentSimilar = this.errors.find(
      e =>
        e.endpoint === error.endpoint &&
        e.statusCode === error.statusCode &&
        e.message === error.message &&
        Date.now() - e.timestamp < 60000 // Within last minute
    )

    if (recentSimilar) {
      recentSimilar.count++
    } else {
      this.errors.push(error)
    }
  }

  // Health check methods
  recordHealthCheck(endpoint: string, isHealthy: boolean, responseTime: number): void {
    const existing = this.health.get(endpoint) || {
      endpoint,
      status: 'healthy' as const,
      responseTime: 0,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      uptime: 100,
      errorRate: 0,
    }

    existing.lastCheck = Date.now()
    existing.responseTime = responseTime

    if (isHealthy) {
      existing.consecutiveFailures = 0
      existing.status = responseTime > this.config.responseTimeThreshold ? 'degraded' : 'healthy'
    } else {
      existing.consecutiveFailures++
      existing.status = existing.consecutiveFailures >= 3 ? 'unhealthy' : 'degraded'
    }

    // Calculate uptime (simplified)
    const recentChecks = this.getRecentHealthChecks(endpoint, 60 * 60 * 1000) // Last hour
    const healthyChecks = recentChecks.filter(check => check.consecutiveFailures === 0).length
    existing.uptime = recentChecks.length > 0 ? (healthyChecks / recentChecks.length) * 100 : 100

    this.health.set(endpoint, existing)
  }

  // Alert checking
  private checkAlerts(): void {
    if (!this.config.enableRealTimeAlerts) return

    for (const [endpoint, metrics] of this.endpoints) {
      const lastAlert = this.alerts.get(endpoint) || 0
      const now = Date.now()

      // Check if cooldown period has passed
      if (now - lastAlert < this.config.alertCooldown) continue

      // Error rate alert
      if (metrics.errorRate > this.config.errorThreshold && metrics.totalRequests > 10) {
        this.triggerAlert('high_error_rate', {
          endpoint,
          errorRate: metrics.errorRate,
          threshold: this.config.errorThreshold,
          totalRequests: metrics.totalRequests,
        })
        this.alerts.set(endpoint, now)
      }

      // Response time alert
      if (metrics.averageResponseTime > this.config.responseTimeThreshold) {
        this.triggerAlert('slow_response', {
          endpoint,
          responseTime: metrics.averageResponseTime,
          threshold: this.config.responseTimeThreshold,
        })
        this.alerts.set(endpoint + '_response', now)
      }
    }
  }

  private triggerAlert(type: string, data: any): void {
    console.warn(`🚨 Alert [${type}]:`, data)

    // In production, send to alerting service
    // Examples: PagerDuty, Slack, email, etc.
    if (process.env.NODE_ENV === 'production') {
      // this.sendToAlertingService(type, data)
    }
  }

  // Utility methods
  private normalizeEndpoint(url: string): string {
    try {
      const parsedUrl = new URL(url, 'http://localhost')
      // Replace dynamic segments with placeholders
      return parsedUrl.pathname
        .replace(/\/[a-f0-9-]{36}\//g, '/:uuid/') // UUIDs
        .replace(/\/\d+\//g, '/:id/') // Numeric IDs
        .replace(/\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+$/g, '/:owner/:repo') // GitHub owner/repo
    } catch {
      return url
    }
  }

  private categorizeError(statusCode: number): ErrorMetrics['type'] {
    if (statusCode >= 400 && statusCode < 500) return 'client'
    if (statusCode >= 500) return 'server'
    return 'network'
  }

  private getRecentRequestsForEndpoint(endpoint: string, timeWindow: number): RequestMetrics[] {
    const cutoff = Date.now() - timeWindow
    return this.requests.filter(
      r => this.normalizeEndpoint(r.url) === endpoint && r.timestamp > cutoff
    )
  }

  private getRecentHealthChecks(endpoint: string, timeWindow: number): HealthMetrics[] {
    // Simplified - in practice, you'd store health check history
    const current = this.health.get(endpoint)
    return current ? [current] : []
  }

  private calculateThroughput(endpoint: string, timeWindow: number): number {
    const recentRequests = this.getRecentRequestsForEndpoint(endpoint, timeWindow)
    return recentRequests.length
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.config.metricsRetention

      // Clean old requests
      this.requests = this.requests.filter(r => r.timestamp > cutoff)

      // Clean old errors
      this.errors = this.errors.filter(e => e.timestamp > cutoff)

      // Clean old alerts
      for (const [key, timestamp] of this.alerts) {
        if (timestamp < cutoff) {
          this.alerts.delete(key)
        }
      }
    }, 60000) // Every minute
  }

  // Getters for metrics
  getRequestMetrics(timeWindow: number = 60 * 60 * 1000): RequestMetrics[] {
    const cutoff = Date.now() - timeWindow
    return this.requests.filter(r => r.timestamp > cutoff)
  }

  getEndpointMetrics(): EndpointMetrics[] {
    return Array.from(this.endpoints.values())
  }

  getErrorMetrics(timeWindow: number = 60 * 60 * 1000): ErrorMetrics[] {
    const cutoff = Date.now() - timeWindow
    return this.errors.filter(e => e.timestamp > cutoff)
  }

  getHealthMetrics(): HealthMetrics[] {
    return Array.from(this.health.values())
  }

  // Dashboard data
  getDashboardData(timeWindow: number = 60 * 60 * 1000) {
    const recentRequests = this.getRequestMetrics(timeWindow)
    const recentErrors = this.getErrorMetrics(timeWindow)

    const totalRequests = recentRequests.length
    const totalErrors = recentErrors.length
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0

    const responseTimes = recentRequests.map(r => r.duration)
    const averageResponseTime =
      responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0

    return {
      overview: {
        totalRequests,
        totalErrors,
        errorRate,
        averageResponseTime,
        throughput: totalRequests / (timeWindow / 60000), // per minute
      },
      endpoints: this.getEndpointMetrics(),
      errors: recentErrors,
      health: this.getHealthMetrics(),
      trends: this.calculateTrends(timeWindow),
    }
  }

  private calculateTrends(timeWindow: number) {
    const requests = this.getRequestMetrics(timeWindow)
    const intervals = 12 // 12 intervals
    const intervalSize = timeWindow / intervals

    const trends = Array.from({ length: intervals }, (_, i) => {
      const start = Date.now() - timeWindow + i * intervalSize
      const end = start + intervalSize

      const intervalRequests = requests.filter(r => r.timestamp >= start && r.timestamp < end)
      const intervalErrors = intervalRequests.filter(r => r.statusCode >= 400)

      return {
        timestamp: start,
        requests: intervalRequests.length,
        errors: intervalErrors.length,
        errorRate:
          intervalRequests.length > 0 ? intervalErrors.length / intervalRequests.length : 0,
        averageResponseTime:
          intervalRequests.length > 0
            ? intervalRequests.reduce((sum, r) => sum + r.duration, 0) / intervalRequests.length
            : 0,
      }
    })

    return trends
  }
}

// Main monitoring class
export class APIMonitoring {
  private store: MetricsStore

  constructor(config: MonitoringConfig = defaultConfig) {
    this.store = new MetricsStore(config)
    this.startHealthChecks()
  }

  // Request tracking middleware
  trackRequest(
    url: string,
    method: string,
    statusCode: number,
    duration: number,
    options: {
      userId?: string
      error?: string
      cacheHit?: boolean
      retryCount?: number
      userAgent?: string
    } = {}
  ): void {
    this.store.recordRequest({
      url,
      method,
      statusCode,
      duration,
      timestamp: Date.now(),
      ...options,
    })
  }

  // Health check methods
  async performHealthCheck(endpoint: string, healthCheckFn: () => Promise<boolean>): Promise<void> {
    const startTime = Date.now()

    try {
      const isHealthy = await Promise.race([
        healthCheckFn(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        ),
      ])

      const responseTime = Date.now() - startTime
      this.store.recordHealthCheck(endpoint, isHealthy, responseTime)
    } catch (error) {
      const responseTime = Date.now() - startTime
      this.store.recordHealthCheck(endpoint, false, responseTime)
    }
  }

  private startHealthChecks(): void {
    const healthCheckEndpoints = [
      '/api/health',
      '/api/search/repositories',
      '/api/search/opportunities',
    ]

    setInterval(async () => {
      for (const endpoint of healthCheckEndpoints) {
        await this.performHealthCheck(endpoint, async () => {
          try {
            const response = await fetch(`http://localhost:3000${endpoint}?health=check`, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            })
            return response.ok
          } catch {
            return false
          }
        })
      }
    }, defaultConfig.healthCheckInterval)
  }

  // Public API for getting metrics
  getMetrics(timeWindow?: number) {
    return this.store.getDashboardData(timeWindow)
  }

  getEndpointMetrics() {
    return this.store.getEndpointMetrics()
  }

  getHealthStatus() {
    return this.store.getHealthMetrics()
  }

  getErrorSummary(timeWindow?: number) {
    const errors = this.store.getErrorMetrics(timeWindow)
    const errorsByType = errors.reduce(
      (acc, error) => {
        acc[error.type] = (acc[error.type] || 0) + error.count
        return acc
      },
      {} as Record<string, number>
    )

    const errorsByEndpoint = errors.reduce(
      (acc, error) => {
        acc[error.endpoint] = (acc[error.endpoint] || 0) + error.count
        return acc
      },
      {} as Record<string, number>
    )

    return {
      totalErrors: errors.reduce((sum, e) => sum + e.count, 0),
      errorsByType,
      errorsByEndpoint,
      recentErrors: errors.slice(-10), // Last 10 errors
    }
  }
}

// Global monitoring instance
export const apiMonitoring = new APIMonitoring()

// Express middleware for automatic request tracking
export function createMonitoringMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now()

    // Store original end function
    const originalEnd = res.end

    res.end = (...args: any[]) => {
      const duration = Date.now() - startTime

      apiMonitoring.trackRequest(req.url, req.method, res.statusCode, duration, {
        userId: req.user?.id,
        userAgent: req.get('User-Agent'),
        cacheHit: res.get('X-Cache-Status') === 'HIT',
      })

      // Call original end function
      originalEnd.apply(res, args)
    }

    next()
  }
}

// Server-side monitoring utilities for API endpoints
// Note: React hooks are not available in server-side context
export function getAPIMonitoringSnapshot() {
  return {
    metrics: apiMonitoring.getMetrics(),
    healthStatus: apiMonitoring.getHealthStatus(),
    errorSummary: apiMonitoring.getErrorSummary(),
  }
}

// Export monitoring utilities
export {
  MetricsStore,
  type RequestMetrics,
  type EndpointMetrics,
  type ErrorMetrics,
  type HealthMetrics,
}
export default apiMonitoring
