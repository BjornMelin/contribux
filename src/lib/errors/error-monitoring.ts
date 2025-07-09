/**
 * Error Monitoring and Reporting System
 * Tracks errors, provides analytics, and enables proactive monitoring
 */

import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { ErrorCategory, type ErrorClassification, ErrorSeverity } from './error-classification'

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

// Export singleton instance
export const errorMonitor = ErrorMonitor.getInstance()
