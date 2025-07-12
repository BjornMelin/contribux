/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ErrorCategory,
  type ErrorClassification,
  ErrorSeverity,
} from '@/lib/errors/error-classification'
import {
  type AlertChannel,
  AlertingSystem,
  type AlertSeverity,
  ErrorDashboard,
  type ErrorMetrics,
  ErrorMonitor,
} from '@/lib/errors/error-monitoring'

// Mock dependencies
vi.mock('@/lib/security/audit-logger', () => ({
  auditLogger: {
    log: vi.fn(),
  },
  AuditEventType: {
    ERROR_LOGGED: 'error_logged',
  },
  AuditSeverity: {
    HIGH: 'high',
  },
}))

vi.mock('@/lib/logging/pino-config', () => ({
  createErrorLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}))

describe('ErrorMonitor', () => {
  let errorMonitor: ErrorMonitor

  beforeEach(() => {
    // Reset singleton instance
    vi.clearAllMocks()
    // @ts-expect-error - Accessing private static property for testing
    ErrorMonitor.instance = undefined
    errorMonitor = ErrorMonitor.getInstance()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ErrorMonitor.getInstance()
      const instance2 = ErrorMonitor.getInstance()

      expect(instance1).toBe(instance2)
    })

    it('should maintain state across getInstance calls', () => {
      const monitor1 = ErrorMonitor.getInstance()
      const classification: ErrorClassification = {
        category: ErrorCategory.NETWORK_TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Network timeout',
      }

      monitor1.logError(new Error('Test error'), classification)

      const monitor2 = ErrorMonitor.getInstance()
      const metrics = monitor2.getMetrics()

      expect(metrics.totalErrors).toBe(1)
    })
  })

  describe('Error Logging', () => {
    it('should log errors with classification', () => {
      const error = new Error('Test error')
      const classification: ErrorClassification = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Database connection failed',
      }

      errorMonitor.logError(error, classification, {
        userId: 'user-123',
        url: '/api/test',
      })

      const metrics = errorMonitor.getMetrics()
      expect(metrics.totalErrors).toBe(1)
      expect(metrics.errorsByCategory[ErrorCategory.DATABASE_CONNECTION]).toBe(1)
      expect(metrics.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1)
    })

    it('should enforce max errors limit', () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.LOW,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      // Log more than max errors (1000)
      for (let i = 0; i < 1100; i++) {
        errorMonitor.logError(new Error(`Error ${i}`), classification)
      }

      const errors = errorMonitor.getErrors()
      expect(errors.length).toBeLessThanOrEqual(1000)
    })

    it('should track error patterns', () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Rate limit exceeded',
      }

      // Log same error multiple times
      for (let i = 0; i < 5; i++) {
        errorMonitor.logError(new Error('Rate limit'), classification)
      }

      const metrics = errorMonitor.getMetrics()
      expect(metrics.topErrors).toHaveLength(1)
      expect(metrics.topErrors[0].count).toBe(5)
      expect(metrics.topErrors[0].message).toBe('Rate limit exceeded')
    })
  })

  describe('Metrics Calculation', () => {
    it('should calculate error rate', () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.NETWORK_TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Timeout',
      }

      // Log errors
      for (let i = 0; i < 15; i++) {
        errorMonitor.logError(new Error('Timeout'), classification)
      }

      const metrics = errorMonitor.getMetrics()
      expect(metrics.errorRate).toBeGreaterThan(0)
      expect(metrics.totalErrors).toBe(15)
    })

    it('should calculate health score', () => {
      const criticalError: ErrorClassification = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.CRITICAL,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Database down',
      }

      const lowError: ErrorClassification = {
        category: ErrorCategory.VALIDATION_FAILED,
        severity: ErrorSeverity.LOW,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Validation error',
      }

      // Log mix of errors
      errorMonitor.logError(new Error('Critical'), criticalError)
      errorMonitor.logError(new Error('Critical'), criticalError)

      for (let i = 0; i < 5; i++) {
        errorMonitor.logError(new Error('Low'), lowError)
      }

      const metrics = errorMonitor.getMetrics()
      expect(metrics.healthScore).toBeLessThan(100)
      expect(metrics.healthScore).toBeGreaterThan(0)
    })

    it('should track errors by category and severity', () => {
      const errors = [
        { category: ErrorCategory.AUTH_EXPIRED, severity: ErrorSeverity.HIGH },
        { category: ErrorCategory.AUTH_EXPIRED, severity: ErrorSeverity.HIGH },
        { category: ErrorCategory.NETWORK_TIMEOUT, severity: ErrorSeverity.MEDIUM },
        { category: ErrorCategory.DATABASE_QUERY, severity: ErrorSeverity.LOW },
      ]

      errors.forEach((err, index) => {
        const classification: ErrorClassification = {
          category: err.category,
          severity: err.severity,
          isTransient: true,
          recoveryStrategies: [],
          userMessage: `Error ${index}`,
        }
        errorMonitor.logError(new Error(`Error ${index}`), classification)
      })

      const metrics = errorMonitor.getMetrics()
      expect(metrics.errorsByCategory[ErrorCategory.AUTH_EXPIRED]).toBe(2)
      expect(metrics.errorsByCategory[ErrorCategory.NETWORK_TIMEOUT]).toBe(1)
      expect(metrics.errorsBySeverity[ErrorSeverity.HIGH]).toBe(2)
      expect(metrics.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1)
    })
  })

  describe('Trends Calculation', () => {
    it('should calculate hourly trends', () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Internal error',
      }

      // Log errors over time
      const now = Date.now()
      vi.setSystemTime(now)

      for (let hour = 0; hour < 3; hour++) {
        vi.setSystemTime(now + hour * 60 * 60 * 1000) // Advance by 1 hour

        for (let i = 0; i < 5; i++) {
          errorMonitor.logError(new Error('Error'), classification)
        }
      }

      const trends = errorMonitor.getTrends(24)
      expect(trends.length).toBeGreaterThan(0)
      expect(trends[trends.length - 1].errorCount).toBe(5)
    })
  })

  describe('Error Clearing', () => {
    it('should clear all errors', () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.LOW,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      errorMonitor.logError(new Error('Error'), classification)
      expect(errorMonitor.getMetrics().totalErrors).toBe(1)

      errorMonitor.clearErrors()
      expect(errorMonitor.getMetrics().totalErrors).toBe(0)
    })
  })
})

describe('AlertingSystem', () => {
  let alertingSystem: AlertingSystem

  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error - Accessing private static property for testing
    AlertingSystem.instance = undefined
    alertingSystem = AlertingSystem.getInstance()
  })

  describe('Alert Channel Management', () => {
    it('should add and retrieve alert channels', () => {
      const consoleChannel: AlertChannel = {
        name: 'console',
        type: 'console',
        enabled: true,
        send: vi.fn(),
      }

      alertingSystem.addChannel(consoleChannel)
      const channels = alertingSystem.getChannels()

      expect(channels).toHaveLength(1)
      expect(channels[0].name).toBe('console')
    })

    it('should handle multiple channels', () => {
      const channels: AlertChannel[] = [
        {
          name: 'console',
          type: 'console',
          enabled: true,
          send: vi.fn(),
        },
        {
          name: 'webhook',
          type: 'webhook',
          enabled: true,
          config: { url: 'https://example.com/webhook' },
          send: vi.fn(),
        },
      ]

      channels.forEach(channel => alertingSystem.addChannel(channel))

      expect(alertingSystem.getChannels()).toHaveLength(2)
    })
  })

  describe('Alert Rules', () => {
    it('should add alerting rules', () => {
      const rule = {
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds threshold',
        condition: (metrics: ErrorMetrics) => metrics.errorRate > 10,
        severity: 'high' as AlertSeverity,
        channels: ['console'],
      }

      alertingSystem.addRule(rule)
      const rules = alertingSystem.getRules()

      expect(rules).toHaveLength(1)
      expect(rules[0].name).toBe('High Error Rate')
    })

    it('should evaluate rules against metrics', async () => {
      const mockSend = vi.fn().mockResolvedValue(true)
      const channel: AlertChannel = {
        name: 'test',
        type: 'console',
        enabled: true,
        send: mockSend,
      }

      alertingSystem.addChannel(channel)
      alertingSystem.addRule({
        name: 'Test Rule',
        description: 'Test',
        condition: () => true, // Always trigger
        severity: 'high' as AlertSeverity,
        channels: ['test'],
      })

      const metrics: ErrorMetrics = {
        totalErrors: 100,
        errorsByCategory: {},
        errorsBySeverity: {},
        errorRate: 20,
        topErrors: [],
        healthScore: 50,
      }

      await alertingSystem.checkAlerts(metrics)

      expect(mockSend).toHaveBeenCalled()
    })
  })

  describe('Alert Suppression', () => {
    it('should suppress duplicate alerts', async () => {
      const mockSend = vi.fn().mockResolvedValue(true)
      const channel: AlertChannel = {
        name: 'test',
        type: 'console',
        enabled: true,
        send: mockSend,
      }

      alertingSystem.addChannel(channel)
      const rule = {
        name: 'Test Rule',
        description: 'Test',
        condition: () => true,
        severity: 'high' as AlertSeverity,
        channels: ['test'],
        cooldownMinutes: 5,
      }
      alertingSystem.addRule(rule)

      const metrics: ErrorMetrics = {
        totalErrors: 100,
        errorsByCategory: {},
        errorsBySeverity: {},
        errorRate: 20,
        topErrors: [],
        healthScore: 50,
      }

      // First alert should send
      await alertingSystem.checkAlerts(metrics)
      expect(mockSend).toHaveBeenCalledTimes(1)

      // Second alert should be suppressed
      await alertingSystem.checkAlerts(metrics)
      expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it('should allow alerts after cooldown', async () => {
      const mockSend = vi.fn().mockResolvedValue(true)
      const channel: AlertChannel = {
        name: 'test',
        type: 'console',
        enabled: true,
        send: mockSend,
      }

      alertingSystem.addChannel(channel)
      const rule = {
        name: 'Test Rule',
        description: 'Test',
        condition: () => true,
        severity: 'high' as AlertSeverity,
        channels: ['test'],
        cooldownMinutes: 1,
      }
      alertingSystem.addRule(rule)

      const metrics: ErrorMetrics = {
        totalErrors: 100,
        errorsByCategory: {},
        errorsBySeverity: {},
        errorRate: 20,
        topErrors: [],
        healthScore: 50,
      }

      // First alert
      await alertingSystem.checkAlerts(metrics)

      // Advance time past cooldown
      vi.advanceTimersByTime(2 * 60 * 1000)

      // Should send again
      await alertingSystem.checkAlerts(metrics)
      expect(mockSend).toHaveBeenCalledTimes(2)
    })
  })

  describe('Alert History', () => {
    it('should maintain alert history', async () => {
      const channel: AlertChannel = {
        name: 'test',
        type: 'console',
        enabled: true,
        send: vi.fn().mockResolvedValue(true),
      }

      alertingSystem.addChannel(channel)
      alertingSystem.addRule({
        name: 'Test Rule',
        description: 'Test',
        condition: () => true,
        severity: 'high' as AlertSeverity,
        channels: ['test'],
      })

      const metrics: ErrorMetrics = {
        totalErrors: 100,
        errorsByCategory: {},
        errorsBySeverity: {},
        errorRate: 20,
        topErrors: [],
        healthScore: 50,
      }

      await alertingSystem.checkAlerts(metrics)

      const history = alertingSystem.getAlertHistory(1)
      expect(history).toHaveLength(1)
      expect(history[0].rule).toBe('Test Rule')
    })
  })
})

describe('ErrorDashboard', () => {
  let dashboard: ErrorDashboard
  let errorMonitor: ErrorMonitor

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singletons
    // @ts-expect-error - Accessing private static property for testing
    ErrorDashboard.instance = undefined
    // @ts-expect-error - Accessing private static property for testing
    ErrorMonitor.instance = undefined
    // @ts-expect-error - Accessing private static property for testing
    AlertingSystem.instance = undefined

    errorMonitor = ErrorMonitor.getInstance()
    dashboard = ErrorDashboard.getInstance()
  })

  describe('Health Report', () => {
    it('should generate comprehensive health report', async () => {
      // Log some errors
      const classification: ErrorClassification = {
        category: ErrorCategory.NETWORK_TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Timeout',
      }

      for (let i = 0; i < 5; i++) {
        errorMonitor.logError(new Error('Test'), classification)
      }

      const report = await dashboard.getHealthReport()

      expect(report.overall.status).toBeDefined()
      expect(report.overall.healthScore).toBeGreaterThan(0)
      expect(report.overall.availability).toBeGreaterThan(0)
      expect(report.metrics.totalErrors).toBe(5)
      expect(report.components).toBeDefined()
      expect(report.recommendations).toBeInstanceOf(Array)
    })

    it('should calculate availability correctly', async () => {
      const criticalError: ErrorClassification = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.CRITICAL,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Database down',
      }

      errorMonitor.logError(new Error('Critical'), criticalError)

      const report = await dashboard.getHealthReport()
      expect(report.overall.availability).toBeLessThan(100)
    })

    it('should provide recommendations based on errors', async () => {
      const dbError: ErrorClassification = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Database connection failed',
      }

      for (let i = 0; i < 10; i++) {
        errorMonitor.logError(new Error('DB Error'), dbError)
      }

      const report = await dashboard.getHealthReport()
      const recommendations = report.recommendations

      expect(recommendations.length).toBeGreaterThan(0)
      expect(recommendations.some(r => r.includes('database'))).toBe(true)
    })
  })

  describe('Error Analytics', () => {
    it('should filter errors by time range', async () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      const now = Date.now()

      // Log errors at different times
      vi.setSystemTime(now - 2 * 60 * 60 * 1000) // 2 hours ago
      errorMonitor.logError(new Error('Old error'), classification)

      vi.setSystemTime(now - 30 * 60 * 1000) // 30 minutes ago
      errorMonitor.logError(new Error('Recent error'), classification)

      const analytics = await dashboard.getErrorAnalytics({
        startTime: now - 60 * 60 * 1000, // Last hour
        endTime: now,
      })

      expect(analytics.summary.totalErrors).toBe(1)
    })

    it('should filter errors by category', async () => {
      const authError: ErrorClassification = {
        category: ErrorCategory.AUTH_EXPIRED,
        severity: ErrorSeverity.HIGH,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Auth expired',
      }

      const dbError: ErrorClassification = {
        category: ErrorCategory.DATABASE_CONNECTION,
        severity: ErrorSeverity.HIGH,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'DB error',
      }

      errorMonitor.logError(new Error('Auth'), authError)
      errorMonitor.logError(new Error('DB'), dbError)
      errorMonitor.logError(new Error('DB2'), dbError)

      const analytics = await dashboard.getErrorAnalytics({
        startTime: 0,
        endTime: Date.now(),
        category: ErrorCategory.DATABASE_CONNECTION,
      })

      expect(analytics.summary.totalErrors).toBe(2)
    })

    it('should identify error patterns', async () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        severity: ErrorSeverity.MEDIUM,
        isTransient: true,
        recoveryStrategies: [],
        userMessage: 'Rate limit exceeded',
      }

      // Log same error multiple times
      for (let i = 0; i < 10; i++) {
        errorMonitor.logError(new Error('Rate limit'), classification, {
          userId: i < 5 ? 'user-1' : 'user-2',
        })
      }

      const analytics = await dashboard.getErrorAnalytics({
        startTime: 0,
        endTime: Date.now(),
      })

      expect(analytics.patterns).toHaveLength(1)
      expect(analytics.patterns[0].frequency).toBe(10)
      expect(analytics.patterns[0].affectedUsers).toBe(2)
    })
  })

  describe('Data Export', () => {
    it('should export data as JSON', async () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      errorMonitor.logError(new Error('Test'), classification)

      const json = await dashboard.exportErrorData('json', {
        startTime: 0,
        endTime: Date.now(),
      })

      const data = JSON.parse(json)
      expect(data.summary.totalErrors).toBe(1)
    })

    it('should export data as CSV', async () => {
      const classification: ErrorClassification = {
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM,
        isTransient: false,
        recoveryStrategies: [],
        userMessage: 'Error',
      }

      errorMonitor.logError(new Error('Test'), classification)

      const csv = await dashboard.exportErrorData('csv', {
        startTime: 0,
        endTime: Date.now(),
      })

      expect(csv).toContain('Timestamp')
      expect(csv).toContain('Category')
      expect(csv).toContain('Severity')
    })

    it('should throw on unsupported format', async () => {
      await expect(
        // @ts-expect-error - Testing invalid format
        dashboard.exportErrorData('xml', { startTime: 0, endTime: Date.now() })
      ).rejects.toThrow('Unsupported export format')
    })
  })
})
