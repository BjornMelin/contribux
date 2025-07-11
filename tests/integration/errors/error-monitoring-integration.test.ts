/**
 * @vitest-environment node
 */

import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorHandler } from '@/lib/errors/enhanced-error-handler'
import { ErrorCategory, ErrorSeverity } from '@/lib/errors/error-classification'
import { AlertingSystem, ErrorDashboard, ErrorMonitor } from '@/lib/errors/error-monitoring'

// Mock API handlers
const mockHealthHandler = async (_req: NextRequest) => {
  try {
    const dashboard = ErrorDashboard.getInstance()
    const report = await dashboard.getHealthReport()

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return ErrorHandler.handleError(error)
  }
}

const mockAnalyticsHandler = async (req: NextRequest) => {
  try {
    const dashboard = ErrorDashboard.getInstance()
    const url = new URL(req.url)
    const category = url.searchParams.get('category') as ErrorCategory | null
    const severity = url.searchParams.get('severity') as ErrorSeverity | null

    const analytics = await dashboard.getErrorAnalytics({
      startTime: Date.now() - 24 * 60 * 60 * 1000,
      endTime: Date.now(),
      category: category || undefined,
      severity: severity || undefined,
    })

    return new Response(JSON.stringify(analytics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return ErrorHandler.handleError(error)
  }
}

describe('Error Monitoring Integration Tests', () => {
  let errorMonitor: ErrorMonitor
  let alertingSystem: AlertingSystem
  let dashboard: ErrorDashboard

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singletons
    // @ts-expect-error - Accessing private static property for testing
    ErrorMonitor.instance = undefined
    // @ts-expect-error - Accessing private static property for testing
    AlertingSystem.instance = undefined
    // @ts-expect-error - Accessing private static property for testing
    ErrorDashboard.instance = undefined

    errorMonitor = ErrorMonitor.getInstance()
    alertingSystem = AlertingSystem.getInstance()
    dashboard = ErrorDashboard.getInstance()
  })

  describe('Health Report API', () => {
    it('should return comprehensive health report', async () => {
      // Log some errors
      const errors = [
        {
          category: ErrorCategory.DATABASE_CONNECTION,
          severity: ErrorSeverity.CRITICAL,
          message: 'Database connection failed',
        },
        {
          category: ErrorCategory.NETWORK_TIMEOUT,
          severity: ErrorSeverity.MEDIUM,
          message: 'API timeout',
        },
        {
          category: ErrorCategory.VALIDATION_FAILED,
          severity: ErrorSeverity.LOW,
          message: 'Invalid input',
        },
      ]

      errors.forEach(err => {
        errorMonitor.logError(new Error(err.message), {
          category: err.category,
          severity: err.severity,
          isTransient: true,
          recoveryStrategies: [],
          userMessage: err.message,
        })
      })

      const req = new Request('http://localhost:3000/api/monitoring/health')
      const response = await mockHealthHandler(req as unknown as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.overall).toBeDefined()
      expect(data.overall.healthScore).toBeLessThan(100)
      expect(data.metrics.totalErrors).toBe(3)
      expect(data.metrics.errorsByCategory[ErrorCategory.DATABASE_CONNECTION]).toBe(1)
      expect(data.components).toBeInstanceOf(Array)
      expect(data.recommendations).toBeInstanceOf(Array)
    })

    it('should handle empty error state', async () => {
      const req = new Request('http://localhost:3000/api/monitoring/health')
      const response = await mockHealthHandler(req as unknown as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.overall.healthScore).toBe(100)
      expect(data.metrics.totalErrors).toBe(0)
    })
  })

  describe('Analytics API', () => {
    it('should filter analytics by category', async () => {
      // Log errors of different categories
      const dbError = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'DB error',
      }

      const authError = {
        category: ErrorCategory.AUTH_EXPIRED,
        severity: ErrorSeverity.HIGH,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Auth expired',
      }

      for (let i = 0; i < 5; i++) {
        errorMonitor.logError(new Error('DB'), dbError)
      }

      for (let i = 0; i < 3; i++) {
        errorMonitor.logError(new Error('Auth'), authError)
      }

      const req = new Request(
        'http://localhost:3000/api/monitoring/analytics?category=database_connection'
      )
      const response = await mockAnalyticsHandler(req as unknown as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.summary.totalErrors).toBe(5)
      expect(data.distribution.byCategory[ErrorCategory.DATABASE_CONNECTION]).toBe(5)
      expect(data.distribution.byCategory[ErrorCategory.AUTH_EXPIRED]).toBeUndefined()
    })

    it('should filter analytics by severity', async () => {
      const criticalError = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.CRITICAL,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Critical error',
      }

      const lowError = {
        category: ErrorCategory.VALIDATION_FAILED,
        severity: ErrorSeverity.LOW,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Validation error',
      }

      errorMonitor.logError(new Error('Critical'), criticalError)
      errorMonitor.logError(new Error('Critical'), criticalError)
      errorMonitor.logError(new Error('Low'), lowError)

      const req = new Request('http://localhost:3000/api/monitoring/analytics?severity=critical')
      const response = await mockAnalyticsHandler(req as unknown as NextRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.summary.totalErrors).toBe(2)
    })
  })

  describe('Alert Integration', () => {
    it('should trigger alerts through API', async () => {
      const mockWebhook = vi.fn().mockResolvedValue(true)

      // Set up alerting
      alertingSystem.addChannel({
        name: 'webhook',
        type: 'webhook',
        enabled: true,
        config: { url: 'https://example.com/webhook' },
        send: mockWebhook,
      })

      alertingSystem.addRule({
        name: 'High Error Rate',
        description: 'Alert on high error rate',
        condition: metrics => metrics.errorRate > 5,
        severity: 'high',
        channels: ['webhook'],
      })

      // Generate errors to trigger alert
      const error = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.HIGH,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      // Log many errors quickly
      for (let i = 0; i < 20; i++) {
        errorMonitor.logError(new Error('Test'), error)
      }

      // Check alerts
      await alertingSystem.checkAlerts(errorMonitor.getMetrics())

      expect(mockWebhook).toHaveBeenCalled()
      const alertCall = mockWebhook.mock.calls[0][0]
      expect(alertCall.rule).toBe('High Error Rate')
      expect(alertCall.severity).toBe('high')
    })

    it('should respect alert cooldown periods', async () => {
      const mockSend = vi.fn().mockResolvedValue(true)

      alertingSystem.addChannel({
        name: 'test',
        type: 'console',
        enabled: true,
        send: mockSend,
      })

      alertingSystem.addRule({
        name: 'Test Alert',
        description: 'Test',
        condition: () => true,
        severity: 'medium',
        channels: ['test'],
        cooldownMinutes: 5,
      })

      const metrics = errorMonitor.getMetrics()

      // First alert
      await alertingSystem.checkAlerts(metrics)
      expect(mockSend).toHaveBeenCalledTimes(1)

      // Second alert should be suppressed
      await alertingSystem.checkAlerts(metrics)
      expect(mockSend).toHaveBeenCalledTimes(1)

      // Advance time
      vi.advanceTimersByTime(6 * 60 * 1000)

      // Third alert should go through
      await alertingSystem.checkAlerts(metrics)
      expect(mockSend).toHaveBeenCalledTimes(2)
    })
  })

  describe('Export Functionality', () => {
    it('should export error data as CSV', async () => {
      // Log some errors
      const error = {
        category: ErrorCategory.NETWORK_TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Timeout',
      }

      errorMonitor.logError(new Error('Test'), error, {
        userId: 'user-123',
        url: '/api/test',
      })

      const csv = await dashboard.exportErrorData('csv', {
        startTime: 0,
        endTime: Date.now(),
      })

      expect(csv).toContain('Timestamp')
      expect(csv).toContain('Category')
      expect(csv).toContain('Severity')
      expect(csv).toContain('network_timeout')
      expect(csv).toContain('medium')
    })

    it('should export error data as JSON with proper structure', async () => {
      const error = {
        category: ErrorCategory.DATABASE_QUERY,
        severity: ErrorSeverity.HIGH,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Query failed',
      }

      errorMonitor.logError(new Error('DB Query'), error)

      const json = await dashboard.exportErrorData('json', {
        startTime: 0,
        endTime: Date.now(),
      })

      const data = JSON.parse(json)

      expect(data.summary).toBeDefined()
      expect(data.summary.totalErrors).toBe(1)
      expect(data.distribution).toBeDefined()
      expect(data.patterns).toBeDefined()
      expect(data.userImpact).toBeDefined()
    })
  })

  describe('Real-time Monitoring', () => {
    it('should track error velocity', async () => {
      const error = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      // Log errors at different rates
      const now = Date.now()

      // First hour - 5 errors
      vi.setSystemTime(now - 2 * 60 * 60 * 1000)
      for (let i = 0; i < 5; i++) {
        errorMonitor.logError(new Error('Test'), error)
      }

      // Second hour - 20 errors (increasing)
      vi.setSystemTime(now - 1 * 60 * 60 * 1000)
      for (let i = 0; i < 20; i++) {
        errorMonitor.logError(new Error('Test'), error)
      }

      vi.setSystemTime(now)
      const report = await dashboard.getHealthReport()

      expect(report.overall.errorVelocity).toBeGreaterThan(0)
      expect(report.recommendations).toContain(expect.stringContaining('Error trend is increasing'))
    })

    it('should detect error patterns', async () => {
      const sameError = {
        category: ErrorCategory.GITHUB_API_ERROR,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'GitHub API rate limit exceeded',
      }

      // Log same error multiple times from different users
      for (let i = 0; i < 10; i++) {
        errorMonitor.logError(new Error('GitHub'), sameError, {
          userId: `user-${i % 3}`,
        })
      }

      const analytics = await dashboard.getErrorAnalytics({
        startTime: 0,
        endTime: Date.now(),
      })

      expect(analytics.patterns).toHaveLength(1)
      expect(analytics.patterns[0].pattern).toContain('GitHub API')
      expect(analytics.patterns[0].frequency).toBe(10)
      expect(analytics.patterns[0].affectedUsers).toBe(3)
    })
  })

  describe('Component Health Tracking', () => {
    it('should track individual component health', async () => {
      // Log component-specific errors
      const dbErrors = Array(10)
        .fill(null)
        .map(() => ({
          category: ErrorCategory.DATABASE_CONNECTION,
          severity: ErrorSeverity.HIGH,
          isTransient: true,
          recoveryStrategies: [],
          userMessage: 'Database error',
        }))

      const githubErrors = Array(5)
        .fill(null)
        .map(() => ({
          category: ErrorCategory.GITHUB_API_ERROR,
          severity: ErrorSeverity.MEDIUM,
          isTransient: true,
          recoveryStrategies: [],
          userMessage: 'GitHub error',
        }))

      dbErrors.forEach(err => errorMonitor.logError(new Error('DB'), err))
      githubErrors.forEach(err => errorMonitor.logError(new Error('GitHub'), err))

      const report = await dashboard.getHealthReport()

      // Component status should reflect errors
      const dbComponent = report.components.find(c => c.name === 'Database')
      const githubComponent = report.components.find(c => c.name === 'GitHub Integration')

      expect(dbComponent).toBeDefined()
      expect(githubComponent).toBeDefined()

      // GitHub should show warning due to errors
      expect(githubComponent?.status).toBe('warning')
    })
  })

  describe('Incident Management', () => {
    it('should generate incident reports', async () => {
      // Simulate an incident with burst of errors
      const incidentErrors = Array(50)
        .fill(null)
        .map((_, i) => ({
          error: new Error(`Incident error ${i}`),
          classification: {
            category: ErrorCategory.SERVICE_UNAVAILABLE,
            severity: ErrorSeverity.CRITICAL,
            isTransient: true,
            recoveryStrategies: [],
            userMessage: 'Service unavailable',
          },
          context: {
            userId: `user-${i % 10}`,
            timestamp: Date.now() - (50 - i) * 1000, // Spread over 50 seconds
          },
        }))

      incidentErrors.forEach(({ error, classification, context }) => {
        errorMonitor.logError(error, classification, context)
      })

      const report = await dashboard.getIncidentReport('incident-1')

      expect(report.severity).toBe('critical')
      expect(report.timeline).toHaveLength(3) // detection, escalation, resolution
      expect(report.details.errorCount).toBe(50)
      expect(report.details.userImpact).toBe(10)
      expect(report.rootCause).toContain('External service failures')
    })
  })
})
