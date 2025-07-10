/**
 * Error Monitoring and Reporting System
 * Tracks errors, provides analytics, and enables proactive monitoring
 */

import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { ErrorCategory, type ErrorClassification, ErrorSeverity } from './error-classification'
import { createErrorLogger } from '@/lib/logging/pino-config'

// Import crypto for generating IDs
import crypto from 'crypto'

// Context interface for error logging
interface ErrorContext {
  userId?: string
  url?: string
  userAgent?: string
  requestId?: string
  sessionId?: string
  [key: string]: unknown
}

// Trend data interface
interface ErrorTrend {
  timestamp: Date
  errorCount: number
  severityCounts: Record<ErrorSeverity, number>
}

// Error metrics interface
export interface ErrorMetrics {
  totalErrors: number
  errorsByCategory: Record<ErrorCategory, number>
  errorsBySeverity: Record<ErrorSeverity, number>
  errorRate: number // errors per minute
  topErrors: Array<{
    message: string
    count: number
    category: ErrorCategory
    lastSeen: Date
  }>
  healthScore: number // 0-100
}

// Error tracking entry
interface ErrorEntry {
  timestamp: Date
  classification: ErrorClassification
  context?: Record<string, unknown>
  userId?: string
  sessionId?: string
  url?: string
  userAgent?: string
}

// Time window for metrics
const METRICS_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
/**
 * Error Dashboard and Reporting System
 * Provides comprehensive error analytics and reporting capabilities
 */
export class ErrorDashboard {
  private static instance: ErrorDashboard
  private errorMonitor: ErrorMonitor
  private alertingSystem: AlertingSystem

  static getInstance(): ErrorDashboard {
    if (!ErrorDashboard.instance) {
      ErrorDashboard.instance = new ErrorDashboard()
    }
    return ErrorDashboard.instance
  }

  constructor() {
    this.errorMonitor = ErrorMonitor.getInstance()
    this.alertingSystem = AlertingSystem.getInstance()
  }

  /**
   * Get comprehensive system health report
   */
  async getHealthReport(): Promise<SystemHealthReport> {
    const metrics = this.errorMonitor.getMetrics()
    const trends = this.errorMonitor.getTrends(24)

    // Calculate availability (based on critical errors)
    const criticalErrors = trends.reduce(
      (sum, trend) => sum + (trend.severityCounts[ErrorSeverity.CRITICAL] || 0),
      0
    )
    const totalHours = trends.length
    const availability = Math.max(0, ((totalHours - criticalErrors) / totalHours) * 100)

    // Calculate mean time to recovery (MTTR)
    const mttr = await this.calculateMTTR()

    // Get service status for each component
    const componentStatus = await this.getComponentStatus()

    // Calculate error velocity (trend direction)
    const errorVelocity = this.calculateErrorVelocity(trends)

    return {
      timestamp: new Date().toISOString(),
      overall: {
        status: this.getOverallStatus(metrics.healthScore),
        healthScore: metrics.healthScore,
        availability,
        mttr,
        errorVelocity,
      },
      metrics: {
        totalErrors: metrics.totalErrors,
        errorRate: metrics.errorRate,
        errorsByCategory: metrics.errorsByCategory,
        errorsBySeverity: metrics.errorsBySeverity,
        topErrors: metrics.topErrors,
        healthScore: metrics.healthScore,
      },
      components: componentStatus,
      trends: trends.map(trend => ({
        timestamp: trend.timestamp,
        errorCount: trend.errorCount,
        healthScore: this.calculateHourlyHealthScore(trend),
        criticalErrors: trend.severityCounts[ErrorSeverity.CRITICAL] || 0,
      })),
      recommendations: this.generateRecommendations(metrics, trends),
    }
  }

  /**
   * Get error analytics with filtering
   */
  async getErrorAnalytics(filter: ErrorAnalyticsFilter): Promise<ErrorAnalytics> {
    const errors = this.errorMonitor['errors'] // Access private property

    // Apply filters
    const filteredErrors = errors.filter(error => {
      const timestamp = error.timestamp.getTime()
      const isInTimeRange = timestamp >= filter.startTime && timestamp <= filter.endTime

      if (!isInTimeRange) return false

      if (filter.category && error.classification.category !== filter.category) return false
      if (filter.severity && error.classification.severity !== filter.severity) return false
      if (filter.userId && error.userId !== filter.userId) return false

      return true
    })

    // Group errors for analysis
    const groupedByCategory = this.groupErrorsByCategory(filteredErrors)
    const groupedByHour = this.groupErrorsByHour(filteredErrors, filter.startTime, filter.endTime)
    const userImpact = this.calculateUserImpact(filteredErrors)
    const errorPatterns = this.identifyErrorPatterns(filteredErrors)

    return {
      summary: {
        totalErrors: filteredErrors.length,
        uniqueUsers: new Set(filteredErrors.map(e => e.userId).filter(Boolean)).size,
        timeRange: {
          start: new Date(filter.startTime).toISOString(),
          end: new Date(filter.endTime).toISOString(),
        },
      },
      distribution: {
        byCategory: groupedByCategory,
        byHour: groupedByHour,
        bySeverity: this.groupErrorsBySeverity(filteredErrors),
      },
      patterns: errorPatterns,
      userImpact,
      recommendations: this.generateAnalyticsRecommendations(filteredErrors),
    }
  }

  /**
   * Generate incident report
   */
  async generateIncidentReport(incidentId: string): Promise<IncidentReport> {
    // This would typically fetch from a database in a real implementation
    const errors = this.errorMonitor['errors']

    // For demo purposes, create a synthetic incident
    const incidentStart = Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
    const incidentEnd = Date.now() - 1 * 60 * 60 * 1000 // 1 hour ago

    const incidentErrors = errors.filter(error => {
      const timestamp = error.timestamp.getTime()
      return timestamp >= incidentStart && timestamp <= incidentEnd
    })

    const timeline = this.createIncidentTimeline(incidentErrors, incidentStart, incidentEnd)
    const rootCause = this.analyzeRootCause(incidentErrors)
    const impact = this.calculateIncidentImpact(incidentErrors)

    return {
      incidentId,
      title: `System Incident - ${new Date(incidentStart).toISOString()}`,
      severity: this.determineIncidentSeverity(incidentErrors),
      status: 'resolved',
      timelineDetails: {
        detected: new Date(incidentStart),
        acknowledged: new Date(incidentStart + 5 * 60 * 1000), // 5 min later
        resolved: new Date(incidentEnd),
      },
      summary: `Incident involving ${incidentErrors.length} errors across ${Math.ceil((incidentEnd - incidentStart) / (60 * 1000))} minutes`,
      details: {
        affectedComponents: this.getAffectedComponents(incidentErrors),
        errorCount: incidentErrors.length,
        userImpact: impact.usersAffected,
        duration: Math.ceil((incidentEnd - incidentStart) / (60 * 1000)),
      },
      rootCause,
      timeline: timeline,
      resolution: 'System automatically recovered. Enhanced monitoring implemented.',
      followUpActions: [
        'Review error patterns for prevention',
        'Update alerting thresholds',
        'Enhance system resilience',
      ],
    }
  }

  /**
   * Export error data for external analysis
   */
  async exportErrorData(format: 'json' | 'csv', filter: ErrorAnalyticsFilter): Promise<string> {
    const analytics = await this.getErrorAnalytics(filter)

    if (format === 'json') {
      return JSON.stringify(analytics, null, 2)
    }

    if (format === 'csv') {
      return this.convertToCSV(analytics)
    }

    throw new Error(`Unsupported export format: ${format}`)
  }

  /**
   * Private helper methods
   */
  private getOverallStatus(healthScore: number): 'healthy' | 'warning' | 'critical' {
    if (healthScore >= 90) return 'healthy'
    if (healthScore >= 70) return 'warning'
    return 'critical'
  }

  private async calculateMTTR(): Promise<number> {
    // Simplified MTTR calculation
    // In a real implementation, this would analyze incident resolution times
    return 15 // 15 minutes average
  }

  private async getComponentStatus(): Promise<ComponentStatus[]> {
    return [
      {
        name: 'API Gateway',
        status: 'healthy',
        uptime: 99.9,
        responseTime: 150,
        errorRate: 0.1,
      },
      {
        name: 'Database',
        status: 'healthy',
        uptime: 99.95,
        responseTime: 50,
        errorRate: 0.05,
      },
      {
        name: 'GitHub Integration',
        status: 'warning',
        uptime: 98.5,
        responseTime: 800,
        errorRate: 1.2,
      },
      {
        name: 'Search Service',
        status: 'healthy',
        uptime: 99.8,
        responseTime: 200,
        errorRate: 0.3,
      },
    ]
  }

  private calculateErrorVelocity(trends: ErrorTrend[]): number {
    if (trends.length < 2) return 0

    const recent = trends.slice(-6) // Last 6 hours
    const earlier = trends.slice(-12, -6) // 6 hours before that

    const recentAvg = recent.reduce((sum, t) => sum + t.errorCount, 0) / recent.length
    const earlierAvg = earlier.reduce((sum, t) => sum + t.errorCount, 0) / earlier.length

    return ((recentAvg - earlierAvg) / earlierAvg) * 100
  }

  private calculateHourlyHealthScore(trend: ErrorTrend): number {
    // Simplified health score calculation for a single hour
    let score = 100
    score -= trend.errorCount * 2
    score -= (trend.severityCounts[ErrorSeverity.CRITICAL] || 0) * 10
    score -= (trend.severityCounts[ErrorSeverity.HIGH] || 0) * 5
    return Math.max(0, Math.min(100, score))
  }

  private generateRecommendations(metrics: ErrorMetrics, trends: ErrorTrend[]): string[] {
    const recommendations: string[] = []

    if (metrics.healthScore < 70) {
      recommendations.push('System health is degraded. Immediate investigation required.')
    }

    if (metrics.errorRate > 5) {
      recommendations.push(
        'High error rate detected. Review recent deployments and system changes.'
      )
    }

    const authErrors = metrics.errorsByCategory[ErrorCategory.AUTH_EXPIRED] || 0
    if (authErrors > 10) {
      recommendations.push('High authentication error rate. Check token refresh mechanisms.')
    }

    const dbErrors =
      (metrics.errorsByCategory[ErrorCategory.DATABASE_CONNECTION] || 0) +
      (metrics.errorsByCategory[ErrorCategory.DATABASE_TRANSACTION] || 0)
    if (dbErrors > 5) {
      recommendations.push(
        'Database connectivity issues detected. Check database health and connection pooling.'
      )
    }

    // Trend-based recommendations
    const recentTrend = trends.slice(-3) // Last 3 hours
    const avgErrors = recentTrend.reduce((sum, t) => sum + t.errorCount, 0) / recentTrend.length
    if (avgErrors > 20) {
      recommendations.push(
        'Error trend is increasing. Consider scaling resources or implementing circuit breakers.'
      )
    }

    return recommendations
  }

  private groupErrorsByCategory(errors: ErrorEntry[]): Record<string, number> {
    return errors.reduce(
      (acc, error) => {
        const category = error.classification.category
        acc[category] = (acc[category] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  }

  private groupErrorsByHour(
    errors: ErrorEntry[],
    startTime: number,
    endTime: number
  ): Array<{
    hour: string
    count: number
    severity: Record<string, number>
  }> {
    const hours: Array<{ hour: string; count: number; severity: Record<string, number> }> = []
    const hourMs = 60 * 60 * 1000

    for (let time = startTime; time < endTime; time += hourMs) {
      const hourStart = time
      const hourEnd = time + hourMs
      const hourErrors = errors.filter(e => {
        const timestamp = e.timestamp.getTime()
        return timestamp >= hourStart && timestamp < hourEnd
      })

      const severityCounts = hourErrors.reduce(
        (acc, error) => {
          acc[error.classification.severity] = (acc[error.classification.severity] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      hours.push({
        hour: new Date(hourStart).toISOString(),
        count: hourErrors.length,
        severity: severityCounts,
      })
    }

    return hours
  }

  private groupErrorsBySeverity(errors: ErrorEntry[]): Record<string, number> {
    return errors.reduce(
      (acc, error) => {
        const severity = error.classification.severity
        acc[severity] = (acc[severity] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  }

  private calculateUserImpact(errors: ErrorEntry[]): UserImpactAnalysis {
    const affectedUsers = new Set(errors.map(e => e.userId).filter(Boolean))
    const sessionImpact = new Set(errors.map(e => e.sessionId).filter(Boolean))

    // Calculate error distribution by user
    const errorsByUser: Record<string, number> = {}
    errors.forEach(error => {
      if (error.userId) {
        errorsByUser[error.userId] = (errorsByUser[error.userId] || 0) + 1
      }
    })

    return {
      totalUsers: affectedUsers.size,
      totalSessions: sessionImpact.size,
      averageErrorsPerUser: affectedUsers.size > 0 ? errors.length / affectedUsers.size : 0,
      highImpactUsers: Object.entries(errorsByUser)
        .filter(([_, count]) => count >= 5)
        .map(([userId, count]) => ({ userId, errorCount: count })),
    }
  }

  private identifyErrorPatterns(errors: ErrorEntry[]): ErrorPattern[] {
    const patterns: Map<string, ErrorPattern> = new Map()

    errors.forEach(error => {
      const key = `${error.classification.category}:${error.classification.userMessage}`

      if (!patterns.has(key)) {
        patterns.set(key, {
          pattern: error.classification.userMessage,
          category: error.classification.category,
          frequency: 0,
          firstSeen: error.timestamp,
          lastSeen: error.timestamp,
          affectedUsers: new Set<string>(),
          trend: 'stable',
        })
      }

      const pattern = patterns.get(key)!
      pattern.frequency++
      pattern.lastSeen = error.timestamp > pattern.lastSeen ? error.timestamp : pattern.lastSeen
      if (error.userId) {
        if (pattern.affectedUsers instanceof Set) {
          pattern.affectedUsers.add(error.userId)
        }
      }
    })

    return Array.from(patterns.values()).map(pattern => ({
      ...pattern,
      affectedUsers:
        pattern.affectedUsers instanceof Set ? pattern.affectedUsers.size : pattern.affectedUsers,
      trend: this.calculatePatternTrend(pattern),
    })) as ErrorPattern[]
  }

  private calculatePatternTrend(pattern: {
    firstSeen: Date
    lastSeen: Date
    frequency: number
  }): 'increasing' | 'decreasing' | 'stable' {
    // Simplified trend calculation
    const duration = pattern.lastSeen.getTime() - pattern.firstSeen.getTime()
    const rate = pattern.frequency / (duration / (60 * 60 * 1000)) // errors per hour

    if (rate > 5) return 'increasing'
    if (rate < 1) return 'decreasing'
    return 'stable'
  }

  private generateAnalyticsRecommendations(errors: ErrorEntry[]): string[] {
    const recommendations: string[] = []

    // Check for common patterns
    const categories = this.groupErrorsByCategory(errors)
    const topCategory = Object.entries(categories).sort(([, a], [, b]) => b - a)[0]

    if (topCategory && topCategory[1] > errors.length * 0.3) {
      recommendations.push(
        `High concentration of ${topCategory[0]} errors. Focus investigation on this category.`
      )
    }

    return recommendations
  }

  private createIncidentTimeline(
    errors: ErrorEntry[],
    start: number,
    end: number
  ): IncidentTimelineEvent[] {
    const timeline: IncidentTimelineEvent[] = []

    timeline.push({
      timestamp: new Date(start),
      event: 'Incident detected',
      description: 'Elevated error rates detected by monitoring system',
      type: 'detection',
    })

    if (errors.length > 0) {
      const firstCritical = errors.find(e => e.classification.severity === ErrorSeverity.CRITICAL)
      if (firstCritical) {
        timeline.push({
          timestamp: firstCritical.timestamp,
          event: 'Critical error occurred',
          description: firstCritical.classification.userMessage,
          type: 'escalation',
        })
      }
    }

    timeline.push({
      timestamp: new Date(end),
      event: 'Incident resolved',
      description: 'Error rates returned to normal levels',
      type: 'resolution',
    })

    return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  private analyzeRootCause(errors: ErrorEntry[]): string {
    const categories = this.groupErrorsByCategory(errors)
    const topCategory = Object.entries(categories).sort(([, a], [, b]) => b - a)[0]

    if (!topCategory) return 'Root cause analysis inconclusive'

    switch (topCategory[0]) {
      case ErrorCategory.DATABASE_CONNECTION:
        return 'Database connectivity issues were the primary cause'
      case ErrorCategory.THIRD_PARTY_SERVICE:
        return 'External service failures triggered the incident'
      case ErrorCategory.RATE_LIMIT_EXCEEDED:
        return 'Traffic spike exceeded rate limiting thresholds'
      default:
        return `Primary cause: ${topCategory[0]} errors (${topCategory[1]} occurrences)`
    }
  }

  private calculateIncidentImpact(errors: ErrorEntry[]): {
    usersAffected: number
    sessionsAffected: number
  } {
    return {
      usersAffected: new Set(errors.map(e => e.userId).filter(Boolean)).size,
      sessionsAffected: new Set(errors.map(e => e.sessionId).filter(Boolean)).size,
    }
  }

  private determineIncidentSeverity(errors: ErrorEntry[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = errors.filter(
      e => e.classification.severity === ErrorSeverity.CRITICAL
    ).length
    const highCount = errors.filter(e => e.classification.severity === ErrorSeverity.HIGH).length

    if (criticalCount > 5) return 'critical'
    if (criticalCount > 0 || highCount > 10) return 'high'
    if (errors.length > 50) return 'medium'
    return 'low'
  }

  private getAffectedComponents(errors: ErrorEntry[]): string[] {
    const components = new Set<string>()

    errors.forEach(error => {
      if (error.classification.category.includes('DATABASE')) {
        components.add('Database')
      }
      if (error.classification.category.includes('AUTH')) {
        components.add('Authentication')
      }
      if (error.classification.category.includes('THIRD_PARTY')) {
        components.add('External Services')
      }
      // Add more component mapping as needed
    })

    return Array.from(components)
  }

  private convertToCSV(analytics: ErrorAnalytics): string {
    const headers = ['Timestamp', 'Category', 'Severity', 'Count', 'Users Affected']
    const rows: string[][] = []

    // Add distribution data
    Object.entries(analytics.distribution.byCategory).forEach(([category, count]) => {
      rows.push([analytics.summary.timeRange.start, category, 'Various', count.toString(), 'N/A'])
    })

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }
}

/**
 * Production Alerting Configuration
 * Sets up alerting channels and rules for production deployment
 */
export class ProductionAlertingConfig {
  /**
   * Initialize production alerting system
   */
  static async initialize(): Promise<void> {
    const alerting = alertingSystem

    // Configure alert channels
    await ProductionAlertingConfig.configureAlertChannels(alerting)

    // Set up custom alerting rules
    await ProductionAlertingConfig.configureAlertingRules(alerting)

    // Test alert channels (in development only)
    if (process.env.NODE_ENV === 'development') {
      await ProductionAlertingConfig.testAlertChannels(alerting)
    }
  }

  /**
   * Configure alert channels based on environment variables
   */
  private static async configureAlertChannels(alerting: AlertingSystem): Promise<void> {
    // Slack integration
    if (process.env.SLACK_WEBHOOK_URL) {
      alerting.registerChannel({
        type: 'slack',
        name: 'Slack Alerts',
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        severityFilter: ['critical', 'error', 'warning'],
      })
    }

    // Discord integration
    if (process.env.DISCORD_WEBHOOK_URL) {
      alerting.registerChannel({
        type: 'discord',
        name: 'Discord Alerts',
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        severityFilter: ['critical', 'error'],
      })
    }

    // PagerDuty integration for critical alerts
    if (process.env.PAGERDUTY_INTEGRATION_KEY) {
      alerting.registerChannel({
        type: 'pagerduty',
        name: 'PagerDuty Critical',
        pagerDutyKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        severityFilter: ['critical'],
      })
    }

    // Email alerts for high-severity issues
    if (process.env.ALERT_EMAIL_RECIPIENTS) {
      alerting.registerChannel({
        type: 'email',
        name: 'Email Alerts',
        emailTo: process.env.ALERT_EMAIL_RECIPIENTS.split(','),
        severityFilter: ['critical', 'error'],
      })
    }

    // Generic webhook for custom integrations
    if (process.env.CUSTOM_WEBHOOK_URL) {
      alerting.registerChannel({
        type: 'webhook',
        name: 'Custom Webhook',
        webhookUrl: process.env.CUSTOM_WEBHOOK_URL,
        headers: {
          Authorization: `Bearer ${process.env.WEBHOOK_AUTH_TOKEN}`,
          'X-Source': 'contribux-error-monitoring',
        },
        severityFilter: ['critical', 'error', 'warning', 'info'],
      })
    }
  }

  /**
   * Configure production-specific alerting rules
   */
  private static async configureAlertingRules(alerting: AlertingSystem): Promise<void> {
    // High-priority rules for production
    alerting.addRule({
      name: 'Database Outage Detection',
      type: 'repeated_errors',
      categoryFilter: [ErrorCategory.DATABASE_CONNECTION],
      threshold: 3,
      severityThreshold: ErrorSeverity.HIGH,
      suppressionMinutes: 2, // Quick re-alerting for DB issues
      description: 'Immediate alert for potential database outages',
      condition: (classification, metrics) => {
        // Custom condition for database alerts
        const dbErrors =
          (metrics.errorsByCategory[ErrorCategory.DATABASE_CONNECTION] || 0) +
          (metrics.errorsByCategory[ErrorCategory.DATABASE_TRANSACTION] || 0)
        return dbErrors >= 3 && metrics.errorRate > 5
      },
    })

    alerting.addRule({
      name: 'Security Incident Detection',
      type: 'repeated_errors',
      categoryFilter: [
        ErrorCategory.AUTH_INVALID,
        ErrorCategory.PERMISSION_DENIED,
        ErrorCategory.VALIDATION_FAILED,
      ],
      threshold: 10,
      severityThreshold: ErrorSeverity.MEDIUM,
      suppressionMinutes: 5,
      description: 'Alert for potential security attacks',
      condition: (classification, metrics, context) => {
        // Detect potential brute force attacks
        const authErrors =
          (metrics.errorsByCategory[ErrorCategory.AUTH_INVALID] || 0) +
          (metrics.errorsByCategory[ErrorCategory.PERMISSION_DENIED] || 0)

        // Check for rapid succession of auth failures from same IP
        const contextWithIp = context as typeof context & { metadata?: { ip?: string } }
        if (contextWithIp?.metadata?.ip && authErrors >= 10) {
          return true
        }

        return false
      },
    })

    alerting.addRule({
      name: 'API Performance Degradation',
      type: 'error_spike',
      threshold: 15, // 15 errors per minute
      severityThreshold: ErrorSeverity.MEDIUM,
      suppressionMinutes: 10,
      description: 'Alert when API performance degrades significantly',
      condition: (classification, metrics) => {
        // Alert if error rate is high AND health score is dropping
        return metrics.errorRate > 15 && metrics.healthScore < 80
      },
    })

    alerting.addRule({
      name: 'External Service Degradation',
      type: 'repeated_errors',
      categoryFilter: [
        ErrorCategory.THIRD_PARTY_SERVICE,
        ErrorCategory.RATE_LIMIT_EXCEEDED,
        ErrorCategory.NETWORK_TIMEOUT,
      ],
      threshold: 5,
      severityThreshold: ErrorSeverity.MEDIUM,
      suppressionMinutes: 15,
      description: 'Alert for external service issues that may affect users',
    })

    alerting.addRule({
      name: 'Memory/Performance Issues',
      type: 'critical_error',
      severityThreshold: ErrorSeverity.CRITICAL,
      suppressionMinutes: 5,
      description: 'Immediate alert for critical system errors',
      condition: (classification, metrics) => {
        // Additional checks for system-level issues
        return (
          classification.severity === ErrorSeverity.CRITICAL ||
          (metrics.healthScore < 50 && metrics.errorRate > 20)
        )
      },
    })
  }

  /**
   * Test alert channels in development
   */
  private static async testAlertChannels(alerting: AlertingSystem): Promise<void> {
    const testClassification: ErrorClassification = {
      category: ErrorCategory.INTERNAL_ERROR,
      severity: ErrorSeverity.LOW,
      isTransient: false,
      recoveryStrategies: [],
      userMessage: 'Test alert - please ignore',
      technicalDetails: 'This is a test alert to verify channel configuration',
    }

    console.log('🧪 Testing alert channels...')

    try {
      await alerting.processError(new Error('Test alert'), testClassification, {
        url: 'http://localhost:3000/test',
        metadata: {
          test: true,
          timestamp: new Date().toISOString(),
        },
      })
      console.log('✅ Alert channels test completed')
    } catch (error) {
      console.error('❌ Alert channels test failed:', error)
    }
  }

  /**
   * Get alerting configuration status
   */
  static getConfigurationStatus(): {
    channels: number
    rules: number
    environment: string
    integrations: {
      slack: boolean
      discord: boolean
      pagerduty: boolean
      email: boolean
      webhook: boolean
    }
  } {
    return {
      channels: alertingSystem['alertChannels'].length,
      rules: alertingSystem['alertingRules'].length,
      environment: process.env.NODE_ENV || 'unknown',
      integrations: {
        slack: !!process.env.SLACK_WEBHOOK_URL,
        discord: !!process.env.DISCORD_WEBHOOK_URL,
        pagerduty: !!process.env.PAGERDUTY_INTEGRATION_KEY,
        email: !!process.env.ALERT_EMAIL_RECIPIENTS,
        webhook: !!process.env.CUSTOM_WEBHOOK_URL,
      },
    }
  }

  /**
   * Create environment-specific error monitoring logger
   */
  static createMonitoringLogger(component: string): ReturnType<typeof createErrorLogger> {
    return createErrorLogger({
      component,
      operation: 'error_monitoring',
      ...(process.env.VERCEL_GIT_COMMIT_SHA && {
        requestId: `deploy-${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)}`,
      }),
    })
  }

  /**
   * Health check for error monitoring system
   */
  static async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: {
      errorMonitor: boolean
      alertingSystem: boolean
      dashboard: boolean
      channels: number
      lastAlert?: string
    }
  }> {
    try {
      const monitor = ErrorMonitor.getInstance()
      const dashboard = ErrorDashboard.getInstance()
      const alerting = alertingSystem

      // Test basic functionality
      const metrics = monitor.getMetrics()
      const alertStats = alerting.getAlertingStats()

      const isHealthy =
        metrics !== null && alertStats !== null && alerting['alertChannels'].length > 0

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        details: {
          errorMonitor: !!metrics,
          alertingSystem: !!alertStats,
          dashboard: !!dashboard,
          channels: alerting['alertChannels'].length,
          lastAlert:
            alertStats.totalAlerts > 0
              ? alerting.getAlertHistory(1)[0]?.timestamp.toISOString()
              : undefined,
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          errorMonitor: false,
          alertingSystem: false,
          dashboard: false,
          channels: 0,
        },
      }
    }
  }
}

/**
 * Types for error dashboard and reporting
 */
export interface SystemHealthReport {
  timestamp: string
  overall: {
    status: 'healthy' | 'warning' | 'critical'
    healthScore: number
    availability: number
    mttr: number
    errorVelocity: number
  }
  metrics: ErrorMetrics
  components: ComponentStatus[]
  trends: Array<{
    timestamp: Date
    errorCount: number
    healthScore: number
    criticalErrors: number
  }>
  recommendations: string[]
}

export interface ComponentStatus {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  uptime: number
  responseTime: number
  errorRate: number
}

export interface ErrorAnalyticsFilter {
  startTime: number
  endTime: number
  category?: ErrorCategory
  severity?: ErrorSeverity
  userId?: string
}

export interface ErrorAnalytics {
  summary: {
    totalErrors: number
    uniqueUsers: number
    timeRange: {
      start: string
      end: string
    }
  }
  distribution: {
    byCategory: Record<string, number>
    byHour: Array<{
      hour: string
      count: number
      severity: Record<string, number>
    }>
    bySeverity: Record<string, number>
  }
  patterns: ErrorPattern[]
  userImpact: UserImpactAnalysis
  recommendations: string[]
}

export interface ErrorPattern {
  pattern: string
  category: ErrorCategory
  frequency: number
  firstSeen: Date
  lastSeen: Date
  affectedUsers: number | Set<string>
  trend: 'increasing' | 'decreasing' | 'stable'
}

export interface UserImpactAnalysis {
  totalUsers: number
  totalSessions: number
  averageErrorsPerUser: number
  highImpactUsers: Array<{
    userId: string
    errorCount: number
  }>
}

export interface IncidentReport {
  incidentId: string
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'acknowledged' | 'resolved'
  timelineDetails: {
    detected: Date
    acknowledged: Date
    resolved: Date
  }
  summary: string
  details: {
    affectedComponents: string[]
    errorCount: number
    userImpact: number
    duration: number
  }
  rootCause: string
  timeline: IncidentTimelineEvent[]
  resolution: string
  followUpActions: string[]
}

export interface IncidentTimelineEvent {
  timestamp: Date
  event: string
  description: string
  type: 'detection' | 'escalation' | 'mitigation' | 'resolution'
}

/**
 * Global error dashboard instance
 */
export const errorDashboard = ErrorDashboard.getInstance()

/**
 * Error monitoring service
 */
export class ErrorMonitor {
  private static instance: ErrorMonitor
  private errors: ErrorEntry[] = []
  private errorPatterns: Map<string, number> = new Map()

  // Singleton pattern
  static getInstance(): ErrorMonitor {
    if (!ErrorMonitor.instance) {
      ErrorMonitor.instance = new ErrorMonitor()
    }
    return ErrorMonitor.instance
  }

  /**
   * Track an error
   */
  async track(
    error: unknown,
    classification: ErrorClassification,
    context?: {
      userId?: string
      sessionId?: string
      url?: string
      userAgent?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<void> {
    // Create error entry
    const entry: ErrorEntry = {
      timestamp: new Date(),
      classification,
      context: context?.metadata,
      userId: context?.userId,
      sessionId: context?.sessionId,
      url: context?.url,
      userAgent: context?.userAgent,
    }

    // Add to tracking
    this.errors.push(entry)

    // Update patterns
    const patternKey = `${classification.category}:${classification.userMessage}`
    this.errorPatterns.set(patternKey, (this.errorPatterns.get(patternKey) || 0) + 1)

    // Clean old entries
    this.cleanOldEntries()

    // Check for anomalies
    await this.checkForAnomalies(classification)

    // Log high severity errors
    if (
      classification.severity === ErrorSeverity.HIGH ||
      classification.severity === ErrorSeverity.CRITICAL
    ) {
      await this.logHighSeverityError(error, classification, context)
    }
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    const now = Date.now()
    const windowStart = now - METRICS_WINDOW_MS

    // Filter errors within window
    const recentErrors = this.errors.filter(e => e.timestamp.getTime() >= windowStart)

    // Calculate metrics
    const errorsByCategory: Record<string, number> = {} as Record<ErrorCategory, number>
    const errorsBySeverity: Record<string, number> = {} as Record<ErrorSeverity, number>

    for (const error of recentErrors) {
      errorsByCategory[error.classification.category] =
        (errorsByCategory[error.classification.category] || 0) + 1
      errorsBySeverity[error.classification.severity] =
        (errorsBySeverity[error.classification.severity] || 0) + 1
    }

    // Calculate error rate (per minute)
    const errorRate = recentErrors.length / (METRICS_WINDOW_MS / 60000)

    // Get top errors
    const topErrors = Array.from(this.errorPatterns.entries())
      .map(([pattern, count]) => {
        const [category, message] = pattern.split(':')
        const lastError = recentErrors
          .filter(e => `${e.classification.category}:${e.classification.userMessage}` === pattern)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]

        return {
          message,
          count,
          category: category as ErrorCategory,
          lastSeen: lastError?.timestamp || new Date(0),
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Calculate health score (0-100)
    const healthScore = this.calculateHealthScore(recentErrors, errorRate)

    return {
      totalErrors: recentErrors.length,
      errorsByCategory: errorsByCategory as Record<ErrorCategory, number>,
      errorsBySeverity: errorsBySeverity as Record<ErrorSeverity, number>,
      errorRate,
      topErrors,
      healthScore,
    }
  }

  /**
   * Get error trends over time
   */
  getTrends(hours = 24): Array<{
    timestamp: Date
    errorCount: number
    severityCounts: Record<ErrorSeverity, number>
  }> {
    const now = Date.now()
    const intervalMs = 60 * 60 * 1000 // 1 hour intervals
    const trends = []

    for (let i = 0; i < hours; i++) {
      const intervalEnd = now - i * intervalMs
      const intervalStart = intervalEnd - intervalMs

      const intervalErrors = this.errors.filter(
        e => e.timestamp.getTime() >= intervalStart && e.timestamp.getTime() < intervalEnd
      )

      const severityCounts: Record<string, number> = {} as Record<ErrorSeverity, number>
      for (const error of intervalErrors) {
        severityCounts[error.classification.severity] =
          (severityCounts[error.classification.severity] || 0) + 1
      }

      trends.unshift({
        timestamp: new Date(intervalEnd),
        errorCount: intervalErrors.length,
        severityCounts: severityCounts as Record<ErrorSeverity, number>,
      })
    }

    return trends
  }

  /**
   * Check for error anomalies
   */
  private async checkForAnomalies(classification: ErrorClassification): Promise<void> {
    const metrics = this.getMetrics()

    // Check for error spikes
    if (metrics.errorRate > 10) {
      // More than 10 errors per minute
      await auditLogger.log({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.WARNING,
        actor: { id: 'system', type: 'system' },
        action: 'Error spike detected',
        result: 'failure',
        metadata: {
          errorRate: metrics.errorRate,
          category: classification.category,
          severity: classification.severity,
        },
      })
    }

    // Check for critical error patterns
    const criticalErrors = this.errors.filter(
      e =>
        e.classification.severity === ErrorSeverity.CRITICAL &&
        e.timestamp.getTime() >= Date.now() - 300000 // Last 5 minutes
    )

    if (criticalErrors.length >= 3) {
      await auditLogger.log({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.CRITICAL,
        actor: { id: 'system', type: 'system' },
        action: 'Multiple critical errors detected',
        result: 'failure',
        metadata: {
          criticalErrorCount: criticalErrors.length,
          categories: [...new Set(criticalErrors.map(e => e.classification.category))],
        },
      })
    }
  }

  /**
   * Log high severity errors
   */
  private async logHighSeverityError(
    error: unknown,
    classification: ErrorClassification,
    context?: ErrorContext
  ): Promise<void> {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity:
        classification.severity === ErrorSeverity.CRITICAL
          ? AuditSeverity.CRITICAL
          : AuditSeverity.ERROR,
      actor: {
        id: context?.userId || 'system',
        type: context?.userId ? 'user' : 'system',
      },
      action: 'High severity error occurred',
      result: 'error',
      reason: classification.userMessage,
      metadata: {
        category: classification.category,
        severity: classification.severity,
        isTransient: classification.isTransient,
        technicalDetails: classification.technicalDetails,
        url: context?.url,
        userAgent: context?.userAgent,
        errorData:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : String(error),
      },
    })
  }

  /**
   * Calculate health score based on error metrics
   */
  private calculateHealthScore(errors: ErrorEntry[], errorRate: number): number {
    // Base score
    let score = 100

    // Deduct for error rate
    score -= Math.min(30, errorRate * 3) // Max 30 point deduction

    // Deduct for critical errors
    const criticalCount = errors.filter(
      e => e.classification.severity === ErrorSeverity.CRITICAL
    ).length
    score -= criticalCount * 10 // 10 points per critical error

    // Deduct for high severity errors
    const highCount = errors.filter(e => e.classification.severity === ErrorSeverity.HIGH).length
    score -= highCount * 5 // 5 points per high severity error

    // Deduct for non-transient errors
    const permanentErrors = errors.filter(e => !e.classification.isTransient).length
    score -= permanentErrors * 2 // 2 points per permanent error

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Clean old error entries
   */
  private cleanOldEntries(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000 // 24 hours

    // Remove old errors
    this.errors = this.errors.filter(e => e.timestamp.getTime() >= cutoffTime)

    // Clean error patterns with no recent occurrences
    for (const [pattern, _] of this.errorPatterns) {
      const hasRecentError = this.errors.some(
        e => `${e.classification.category}:${e.classification.userMessage}` === pattern
      )
      if (!hasRecentError) {
        this.errorPatterns.delete(pattern)
      }
    }
  }

  /**
   * Generate error report
   */
  generateReport(): {
    summary: string
    metrics: ErrorMetrics
    trends: ErrorTrend[]
    recommendations: string[]
  } {
    const metrics = this.getMetrics()
    const trends = this.getTrends(24)

    const recommendations = []

    // Add recommendations based on metrics
    if (metrics.healthScore < 50) {
      recommendations.push('System health is poor. Immediate attention required.')
    }

    if (metrics.errorRate > 5) {
      recommendations.push('High error rate detected. Review recent changes.')
    }

    const authErrors = metrics.errorsByCategory[ErrorCategory.AUTH_EXPIRED] || 0
    if (authErrors > 10) {
      recommendations.push('Many authentication errors. Check token refresh logic.')
    }

    const networkErrors = metrics.errorsByCategory[ErrorCategory.NETWORK_UNAVAILABLE] || 0
    if (networkErrors > 20) {
      recommendations.push('Network connectivity issues detected. Check service availability.')
    }

    return {
      summary: `Health Score: ${metrics.healthScore}/100. Total errors in last 15 minutes: ${metrics.totalErrors}. Error rate: ${metrics.errorRate.toFixed(2)}/min.`,
      metrics,
      trends,
      recommendations,
    }
  }
}

/**
 * Real-time alerting system for production error monitoring
 * Integrates with existing ErrorMonitor and Pino logging
 */
export class AlertingSystem {
  private static instance: AlertingSystem
  private alertChannels: AlertChannel[] = []
  private alertingRules: AlertingRule[] = []
  private suppressedAlerts: Set<string> = new Set()
  private alertHistory: AlertEvent[] = []

  static getInstance(): AlertingSystem {
    if (!AlertingSystem.instance) {
      AlertingSystem.instance = new AlertingSystem()
    }
    return AlertingSystem.instance
  }

  constructor() {
    this.initializeDefaultRules()
  }

  /**
   * Register alert channel (Slack, Discord, PagerDuty, etc.)
   */
  registerChannel(channel: AlertChannel): void {
    this.alertChannels.push(channel)
  }

  /**
   * Add custom alerting rule
   */
  addRule(rule: AlertingRule): void {
    this.alertingRules.push(rule)
  }

  /**
   * Process error and trigger alerts if needed
   */
  async processError(
    error: unknown,
    classification: ErrorClassification,
    context?: ErrorContext
  ): Promise<void> {
    const errorMonitor = ErrorMonitor.getInstance()
    const metrics = errorMonitor.getMetrics()

    // Check each alerting rule
    for (const rule of this.alertingRules) {
      if (await this.shouldTriggerAlert(rule, classification, metrics, context)) {
        await this.sendAlert(rule, classification, metrics, context, error)
      }
    }
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(
    rule: AlertingRule,
    classification: ErrorClassification,
    metrics: ErrorMetrics,
    context?: ErrorContext,
    originalError?: unknown
  ): Promise<void> {
    const alertKey = `${rule.name}:${classification.category}:${classification.severity}`

    // Check suppression
    if (this.suppressedAlerts.has(alertKey)) {
      return
    }

    // Create alert event
    const alertEvent: AlertEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      rule: rule.name,
      severity: this.mapSeverityToAlertLevel(classification.severity),
      title: this.generateAlertTitle(rule, classification, metrics),
      description: this.generateAlertDescription(classification, metrics, context),
      metadata: {
        errorCategory: classification.category,
        errorSeverity: classification.severity,
        healthScore: metrics.healthScore,
        errorRate: metrics.errorRate,
        context,
        technicalDetails: classification.technicalDetails,
      },
    }

    // Store alert event
    this.alertHistory.push(alertEvent)

    // Send through channels
    const relevantChannels = this.alertChannels.filter(channel =>
      channel.severityFilter.includes(alertEvent.severity)
    )

    const promises = relevantChannels.map(channel =>
      this.sendToChannel(channel, alertEvent, originalError)
    )

    await Promise.allSettled(promises)

    // Suppress similar alerts for specified duration
    if (rule.suppressionMinutes > 0) {
      this.suppressedAlerts.add(alertKey)
      setTimeout(
        () => {
          this.suppressedAlerts.delete(alertKey)
        },
        rule.suppressionMinutes * 60 * 1000
      )
    }

    // Log alert
    const alertLogger = createErrorLogger({
      component: 'AlertingSystem',
      operation: 'sendAlert',
    })

    alertLogger.warn(
      {
        alert: alertEvent,
        rule: rule.name,
        channels: relevantChannels.length,
      },
      `Alert sent: ${alertEvent.title}`
    )
  }

  /**
   * Check if alert should be triggered
   */
  private async shouldTriggerAlert(
    rule: AlertingRule,
    classification: ErrorClassification,
    metrics: ErrorMetrics,
    context?: ErrorContext
  ): Promise<boolean> {
    // Check severity threshold
    if (!this.meetsSeverityThreshold(classification.severity, rule.severityThreshold)) {
      return false
    }

    // Check category filter
    if (rule.categoryFilter && !rule.categoryFilter.includes(classification.category)) {
      return false
    }

    // Check custom condition
    if (rule.condition) {
      return rule.condition(classification, metrics, context)
    }

    // Default conditions based on rule type
    switch (rule.type) {
      case 'error_spike':
        return metrics.errorRate > (rule.threshold || 10)

      case 'health_degradation':
        return metrics.healthScore < (rule.threshold || 70)

      case 'critical_error':
        return classification.severity === ErrorSeverity.CRITICAL

      case 'repeated_errors': {
        const patternCount =
          metrics.topErrors.find(e => e.category === classification.category)?.count || 0
        return patternCount >= (rule.threshold || 5)
      }

      default:
        return false
    }
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(
    channel: AlertChannel,
    alert: AlertEvent,
    originalError?: unknown
  ): Promise<void> {
    try {
      switch (channel.type) {
        case 'webhook':
          await this.sendWebhookAlert(channel, alert)
          break

        case 'slack':
          await this.sendSlackAlert(channel, alert)
          break

        case 'discord':
          await this.sendDiscordAlert(channel, alert)
          break

        case 'email':
          await this.sendEmailAlert(channel, alert)
          break

        case 'pagerduty':
          await this.sendPagerDutyAlert(channel, alert)
          break

        default:
          console.warn(`Unknown alert channel type: ${channel.type}`)
      }
    } catch (error) {
      console.error(`Failed to send alert to ${channel.type}:`, error)
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(channel: AlertChannel, alert: AlertEvent): Promise<void> {
    if (!channel.webhookUrl) return

    const payload = {
      alert,
      timestamp: alert.timestamp.toISOString(),
      service: 'contribux',
      environment: process.env.NODE_ENV,
    }

    await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(channel.headers || {}),
      },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(channel: AlertChannel, alert: AlertEvent): Promise<void> {
    if (!channel.webhookUrl) return

    const color = this.getSlackColor(alert.severity)
    const payload = {
      attachments: [
        {
          color,
          title: alert.title,
          text: alert.description,
          fields: [
            {
              title: 'Severity',
              value: alert.severity,
              short: true,
            },
            {
              title: 'Health Score',
              value: `${alert.metadata.healthScore}/100`,
              short: true,
            },
            {
              title: 'Error Rate',
              value: `${alert.metadata.errorRate.toFixed(2)}/min`,
              short: true,
            },
            {
              title: 'Category',
              value: alert.metadata.errorCategory,
              short: true,
            },
          ],
          footer: 'Contribux Error Monitoring',
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    }

    await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Send Discord alert
   */
  private async sendDiscordAlert(channel: AlertChannel, alert: AlertEvent): Promise<void> {
    if (!channel.webhookUrl) return

    const color = this.getDiscordColor(alert.severity)
    const payload = {
      embeds: [
        {
          title: alert.title,
          description: alert.description,
          color,
          fields: [
            {
              name: 'Severity',
              value: alert.severity,
              inline: true,
            },
            {
              name: 'Health Score',
              value: `${alert.metadata.healthScore}/100`,
              inline: true,
            },
            {
              name: 'Error Rate',
              value: `${alert.metadata.errorRate.toFixed(2)}/min`,
              inline: true,
            },
          ],
          footer: {
            text: 'Contribux Error Monitoring',
          },
          timestamp: alert.timestamp.toISOString(),
        },
      ],
    }

    await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Send email alert (basic implementation)
   */
  private async sendEmailAlert(channel: AlertChannel, alert: AlertEvent): Promise<void> {
    // This would integrate with your email service (SendGrid, AWS SES, etc.)
    console.log('Email alert would be sent:', {
      to: channel.emailTo,
      subject: alert.title,
      body: alert.description,
    })
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(channel: AlertChannel, alert: AlertEvent): Promise<void> {
    if (!channel.pagerDutyKey) return

    const payload = {
      routing_key: channel.pagerDutyKey,
      event_action: 'trigger',
      payload: {
        summary: alert.title,
        source: 'contribux-error-monitoring',
        severity: alert.severity.toLowerCase(),
        component: 'error-monitoring',
        group: 'backend',
        class: alert.metadata.errorCategory,
        custom_details: {
          description: alert.description,
          healthScore: alert.metadata.healthScore,
          errorRate: alert.metadata.errorRate,
          technicalDetails: alert.metadata.technicalDetails,
        },
      },
    }

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  /**
   * Initialize default alerting rules
   */
  private initializeDefaultRules(): void {
    this.alertingRules = [
      {
        name: 'Critical Error Alert',
        type: 'critical_error',
        severityThreshold: ErrorSeverity.CRITICAL,
        suppressionMinutes: 5,
        description: 'Immediate alert for critical errors',
      },
      {
        name: 'Error Spike Detection',
        type: 'error_spike',
        threshold: 10, // errors per minute
        severityThreshold: ErrorSeverity.MEDIUM,
        suppressionMinutes: 15,
        description: 'Alert when error rate exceeds threshold',
      },
      {
        name: 'Health Degradation',
        type: 'health_degradation',
        threshold: 70, // health score
        severityThreshold: ErrorSeverity.LOW,
        suppressionMinutes: 30,
        description: 'Alert when system health degrades',
      },
      {
        name: 'Authentication Failures',
        type: 'repeated_errors',
        categoryFilter: [ErrorCategory.AUTH_EXPIRED, ErrorCategory.AUTH_INVALID],
        threshold: 5,
        severityThreshold: ErrorSeverity.MEDIUM,
        suppressionMinutes: 10,
        description: 'Alert for repeated authentication failures',
      },
      {
        name: 'Database Connection Issues',
        type: 'repeated_errors',
        categoryFilter: [ErrorCategory.DATABASE_CONNECTION, ErrorCategory.DATABASE_TRANSACTION],
        threshold: 3,
        severityThreshold: ErrorSeverity.HIGH,
        suppressionMinutes: 5,
        description: 'Alert for database connectivity issues',
      },
    ]
  }

  /**
   * Helper methods
   */
  private meetsSeverityThreshold(current: ErrorSeverity, threshold: ErrorSeverity): boolean {
    const severityOrder = [
      ErrorSeverity.LOW,
      ErrorSeverity.MEDIUM,
      ErrorSeverity.HIGH,
      ErrorSeverity.CRITICAL,
    ]
    return severityOrder.indexOf(current) >= severityOrder.indexOf(threshold)
  }

  private mapSeverityToAlertLevel(severity: ErrorSeverity): AlertSeverity {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'critical'
      case ErrorSeverity.HIGH:
        return 'error'
      case ErrorSeverity.MEDIUM:
        return 'warning'
      case ErrorSeverity.LOW:
        return 'info'
      default:
        return 'info'
    }
  }

  private generateAlertTitle(
    rule: AlertingRule,
    classification: ErrorClassification,
    metrics: ErrorMetrics
  ): string {
    switch (rule.type) {
      case 'critical_error':
        return `🚨 Critical Error: ${classification.userMessage}`
      case 'error_spike':
        return `📈 Error Spike Detected: ${metrics.errorRate.toFixed(1)}/min`
      case 'health_degradation':
        return `⚠️ System Health Degraded: ${metrics.healthScore}/100`
      case 'repeated_errors':
        return `🔄 Repeated Errors: ${classification.category}`
      default:
        return `Alert: ${rule.name}`
    }
  }

  private generateAlertDescription(
    classification: ErrorClassification,
    metrics: ErrorMetrics,
    context?: ErrorContext
  ): string {
    const parts = [
      `**Error:** ${classification.userMessage}`,
      `**Category:** ${classification.category}`,
      `**Severity:** ${classification.severity}`,
      `**Health Score:** ${metrics.healthScore}/100`,
      `**Current Error Rate:** ${metrics.errorRate.toFixed(2)} errors/min`,
    ]

    if (context?.url) {
      parts.push(`**URL:** ${context.url}`)
    }

    if (context?.userId) {
      parts.push(`**User:** ${context.userId}`)
    }

    if (classification.technicalDetails) {
      parts.push(`**Technical Details:** ${classification.technicalDetails}`)
    }

    return parts.join('\n')
  }

  private getSlackColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return 'danger'
      case 'error':
        return 'warning'
      case 'warning':
        return '#ff9500'
      case 'info':
        return 'good'
      default:
        return '#cccccc'
    }
  }

  private getDiscordColor(severity: AlertSeverity): number {
    switch (severity) {
      case 'critical':
        return 0xff0000 // red
      case 'error':
        return 0xff6600 // orange
      case 'warning':
        return 0xffcc00 // yellow
      case 'info':
        return 0x0099ff // blue
      default:
        return 0xcccccc // gray
    }
  }

  /**
   * Get alert history
   */
  getAlertHistory(hours = 24): AlertEvent[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000
    return this.alertHistory.filter(alert => alert.timestamp.getTime() >= cutoff)
  }

  /**
   * Get alerting statistics
   */
  getAlertingStats(): {
    totalAlerts: number
    alertsBySeverity: Record<AlertSeverity, number>
    alertsByRule: Record<string, number>
    suppressedCount: number
  } {
    const recentAlerts = this.getAlertHistory(24)

    const alertsBySeverity: Record<string, number> = {}
    const alertsByRule: Record<string, number> = {}

    for (const alert of recentAlerts) {
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1
      alertsByRule[alert.rule] = (alertsByRule[alert.rule] || 0) + 1
    }

    return {
      totalAlerts: recentAlerts.length,
      alertsBySeverity: alertsBySeverity as Record<AlertSeverity, number>,
      alertsByRule,
      suppressedCount: this.suppressedAlerts.size,
    }
  }
}

/**
 * Global alerting system instance
 */
export const alertingSystem = AlertingSystem.getInstance()

/**
 * Types for alerting system
 */
export interface AlertChannel {
  type: 'webhook' | 'slack' | 'discord' | 'email' | 'pagerduty'
  name: string
  severityFilter: AlertSeverity[]
  webhookUrl?: string
  headers?: Record<string, string>
  emailTo?: string[]
  pagerDutyKey?: string
}

export interface AlertingRule {
  name: string
  type: 'error_spike' | 'health_degradation' | 'critical_error' | 'repeated_errors'
  severityThreshold: ErrorSeverity
  categoryFilter?: ErrorCategory[]
  threshold?: number
  suppressionMinutes: number
  description: string
  condition?: (
    classification: ErrorClassification,
    metrics: ErrorMetrics,
    context?: ErrorContext
  ) => boolean
}

export interface AlertEvent {
  id: string
  timestamp: Date
  rule: string
  severity: AlertSeverity
  title: string
  description: string
  metadata: {
    errorCategory: ErrorCategory
    errorSeverity: ErrorSeverity
    healthScore: number
    errorRate: number
    context?: ErrorContext
    technicalDetails?: string
  }
}

export type AlertSeverity = 'critical' | 'error' | 'warning' | 'info'

// Export singleton instance
export const errorMonitor = ErrorMonitor.getInstance()
