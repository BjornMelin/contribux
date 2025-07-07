/**
 * Security Monitoring Dashboard Tests
 * Tests security monitoring, alerting, and analytics functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Redis } from '@redis/client'
import {
  SecurityMonitoringDashboard,
  SecurityMetrics,
  AlertConfig,
  SecurityAlert,
} from '@/lib/security/monitoring-dashboard'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'

// Mock Redis
vi.mock('@redis/client', () => ({
  Redis: vi.fn(),
}))

// Mock audit logger
vi.mock('@/lib/security/audit-logger', () => ({
  auditLogger: {
    log: vi.fn(),
    query: vi.fn(),
  },
  AuditEventType: {
    AUTH_SUCCESS: 'AUTH_SUCCESS',
    AUTH_FAILURE: 'AUTH_FAILURE',
    AUTH_MFA_SUCCESS: 'AUTH_MFA_SUCCESS',
    API_ACCESS: 'API_ACCESS',
    API_RATE_LIMIT: 'API_RATE_LIMIT',
    AUTHZ_FAILURE: 'AUTHZ_FAILURE',
    SECURITY_VIOLATION: 'SECURITY_VIOLATION',
    SECURITY_CONFIG_CHANGE: 'SECURITY_CONFIG_CHANGE',
  },
  AuditSeverity: {
    INFO: 'INFO',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL',
  },
}))

describe('SecurityMonitoringDashboard', () => {
  let dashboard: SecurityMonitoringDashboard
  let mockRedis: any

  beforeEach(() => {
    mockRedis = {
      keys: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    }
    
    dashboard = new SecurityMonitoringDashboard(mockRedis)
    
    // Mock timer functions
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await dashboard.stop()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('collectMetrics', () => {
    it('should collect security metrics', async () => {
      const mockEvents = [
        { type: AuditEventType.AUTH_SUCCESS, timestamp: new Date() },
        { type: AuditEventType.AUTH_FAILURE, timestamp: new Date() },
        { type: AuditEventType.API_ACCESS, timestamp: new Date() },
        { type: AuditEventType.API_RATE_LIMIT, timestamp: new Date() },
        { 
          type: AuditEventType.SECURITY_VIOLATION,
          timestamp: new Date(),
          metadata: { violationType: 'xss' },
        },
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const metrics = await dashboard.collectMetrics()

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        authMetrics: {
          successCount: 1,
          failureCount: 1,
          mfaUsage: 0,
          suspiciousAttempts: 0,
          uniqueUsers: 0,
        },
        apiMetrics: {
          totalRequests: 1,
          rateLimitHits: 1,
          unauthorizedAttempts: 0,
          averageResponseTime: expect.any(Number),
          errorRate: 0,
        },
        violations: {
          total: 1,
          byType: { xss: 1 },
          bySeverity: {},
        },
        threats: {
          bruteForceAttempts: 0,
          sqlInjectionAttempts: 0,
          xssAttempts: 0,
          suspiciousIps: [],
          anomalousPatterns: 0,
        },
        health: {
          cpuUsage: expect.any(Number),
          memoryUsage: expect.any(Number),
          activeConnections: expect.any(Number),
          queuedRequests: expect.any(Number),
        },
      })
    })

    it('should detect suspicious authentication patterns', async () => {
      const mockEvents = [
        { 
          type: AuditEventType.AUTH_FAILURE,
          timestamp: new Date(),
          metadata: { suspicious: true },
        },
        { 
          type: AuditEventType.AUTH_FAILURE,
          timestamp: new Date(),
          metadata: { suspicious: false },
        },
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const metrics = await dashboard.collectMetrics()

      expect(metrics.authMetrics.suspiciousAttempts).toBe(1)
    })

    it('should calculate error rate correctly', async () => {
      const mockEvents = [
        { type: AuditEventType.API_ACCESS, metadata: { statusCode: 200 } },
        { type: AuditEventType.API_ACCESS, metadata: { statusCode: 500 } },
        { type: AuditEventType.API_ACCESS, metadata: { statusCode: 502 } },
        { type: AuditEventType.API_ACCESS, metadata: { statusCode: 404 } },
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const metrics = await dashboard.collectMetrics()

      expect(metrics.apiMetrics.errorRate).toBe(0.5) // 2 out of 4 are 5xx errors
    })

    it('should detect brute force attempts', async () => {
      const mockEvents = Array(6).fill(null).map(() => ({
        type: AuditEventType.AUTH_FAILURE,
        timestamp: new Date(),
        actor: { ip: '192.168.1.1' },
      }))

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const metrics = await dashboard.collectMetrics()

      expect(metrics.threats.bruteForceAttempts).toBe(1)
    })

    it('should detect SQL injection attempts', async () => {
      const mockEvents = [
        { 
          type: AuditEventType.SECURITY_VIOLATION,
          metadata: { threat: 'sql_injection' },
        },
        { 
          type: AuditEventType.SECURITY_VIOLATION,
          reason: 'SQL injection detected',
        },
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const metrics = await dashboard.collectMetrics()

      expect(metrics.threats.sqlInjectionAttempts).toBe(2)
    })

    it('should identify suspicious IPs', async () => {
      const mockEvents = [
        {
          type: AuditEventType.SECURITY_VIOLATION,
          actor: { ip: '10.0.0.1' },
        },
        {
          type: AuditEventType.AUTH_FAILURE,
          metadata: { suspicious: true },
          actor: { ip: '10.0.0.2' },
        },
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const metrics = await dashboard.collectMetrics()

      expect(metrics.threats.suspiciousIps).toContain('10.0.0.1')
      expect(metrics.threats.suspiciousIps).toContain('10.0.0.2')
    })
  })

  describe('alert management', () => {
    it('should trigger alerts when thresholds are exceeded', async () => {
      const mockEvents = Array(15).fill(null).map(() => ({
        type: AuditEventType.AUTH_FAILURE,
        timestamp: new Date(),
      }))

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      await dashboard.collectMetrics()

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuditEventType.SECURITY_VIOLATION,
          action: expect.stringContaining('Security alert triggered'),
        })
      )
    })

    it('should respect alert cooldown periods', async () => {
      const mockEvents = Array(15).fill(null).map(() => ({
        type: AuditEventType.AUTH_FAILURE,
        timestamp: new Date(),
      }))

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      // First trigger
      await dashboard.collectMetrics()
      vi.clearAllMocks()

      // Second trigger within cooldown
      await dashboard.collectMetrics()

      // Should not trigger again
      expect(auditLogger.log).not.toHaveBeenCalled()
    })

    it('should add custom alerts', () => {
      const customAlert: AlertConfig = {
        type: 'threshold',
        metric: 'custom.metric',
        condition: 'gt',
        value: 100,
        severity: 'high',
        cooldownMinutes: 10,
        actions: [{ type: 'log', config: {} }],
      }

      dashboard.addAlert(customAlert)

      // Alert should be added (we can't directly test private property)
      expect(() => dashboard.addAlert(customAlert)).not.toThrow()
    })

    it('should acknowledge alerts', async () => {
      // Create an active alert
      const alert: SecurityAlert = {
        id: 'alert123',
        timestamp: new Date(),
        type: 'test',
        severity: 'high',
        title: 'Test Alert',
        description: 'Test',
        metrics: {},
        status: 'active',
      }

      // Use the dashboard's internal method to add the alert
      ;(dashboard as any).activeAlerts.set(alert.id, alert)

      await dashboard.acknowledgeAlert('alert123', 'user123')

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Security alert acknowledged',
          metadata: expect.objectContaining({
            alertId: 'alert123',
          }),
        })
      )
    })

    it('should resolve alerts', async () => {
      // Create an active alert
      const alert: SecurityAlert = {
        id: 'alert456',
        timestamp: new Date(),
        type: 'test',
        severity: 'high',
        title: 'Test Alert',
        description: 'Test',
        metrics: {},
        status: 'active',
      }

      ;(dashboard as any).activeAlerts.set(alert.id, alert)

      await dashboard.resolveAlert('alert456', 'user123', 'Fixed the issue')

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Security alert resolved',
          metadata: expect.objectContaining({
            alertId: 'alert456',
            resolution: 'Fixed the issue',
          }),
        })
      )
    })
  })

  describe('getDashboardSummary', () => {
    it('should generate dashboard summary with recommendations', async () => {
      const mockEvents = [
        ...Array(20).fill(null).map(() => ({
          type: AuditEventType.AUTH_FAILURE,
          timestamp: new Date(),
        })),
        ...Array(10).fill(null).map(() => ({
          type: AuditEventType.AUTH_SUCCESS,
          timestamp: new Date(),
        })),
        ...Array(5).fill(null).map(() => ({
          type: AuditEventType.API_ACCESS,
          metadata: { statusCode: 500 },
          timestamp: new Date(),
        })),
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const summary = await dashboard.getDashboardSummary()

      expect(summary).toHaveProperty('currentMetrics')
      expect(summary).toHaveProperty('activeAlerts')
      expect(summary).toHaveProperty('recentIncidents')
      expect(summary).toHaveProperty('trends')
      expect(summary).toHaveProperty('recommendations')

      expect(summary.trends.authFailureRate).toBeGreaterThan(0.5)
      expect(summary.recommendations).toContain(
        'Consider implementing stricter rate limiting for authentication endpoints'
      )
    })

    it('should calculate threat level correctly', async () => {
      // Create critical alerts
      const criticalAlert: SecurityAlert = {
        id: 'critical1',
        timestamp: new Date(),
        type: 'sql_injection',
        severity: 'critical',
        title: 'SQL Injection Detected',
        description: 'Critical security threat',
        metrics: {},
        status: 'active',
      }

      ;(dashboard as any).activeAlerts.set(criticalAlert.id, criticalAlert)

      vi.mocked(auditLogger.query).mockResolvedValue([])

      const summary = await dashboard.getDashboardSummary()

      expect(summary.trends.threatLevel).toBe('critical')
    })
  })

  describe('getSecurityTimeline', () => {
    it('should generate security timeline', async () => {
      const now = new Date()
      const mockEvents = [
        {
          type: AuditEventType.AUTH_SUCCESS,
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
          severity: AuditSeverity.INFO,
        },
        {
          type: AuditEventType.SECURITY_VIOLATION,
          timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
          severity: AuditSeverity.CRITICAL,
        },
      ]

      vi.mocked(auditLogger.query).mockResolvedValue(mockEvents)

      const timeline = await dashboard.getSecurityTimeline(3)

      expect(timeline.timeline).toHaveLength(3)
      expect(timeline.summary.totalEvents).toBe(2)
      expect(timeline.summary.criticalEvents).toBe(1)
      expect(timeline.summary.topEventTypes).toContainEqual({
        type: AuditEventType.AUTH_SUCCESS,
        count: 1,
      })
    })
  })

  describe('alert conditions', () => {
    it('should evaluate different conditions correctly', async () => {
      const metrics: SecurityMetrics = {
        timestamp: new Date(),
        authMetrics: {
          successCount: 100,
          failureCount: 25,
          mfaUsage: 50,
          suspiciousAttempts: 5,
          uniqueUsers: 20,
        },
        apiMetrics: {
          totalRequests: 1000,
          rateLimitHits: 50,
          unauthorizedAttempts: 10,
          averageResponseTime: 200,
          errorRate: 0.05,
        },
        violations: {
          total: 5,
          byType: {},
          bySeverity: {},
        },
        threats: {
          bruteForceAttempts: 2,
          sqlInjectionAttempts: 0,
          xssAttempts: 0,
          suspiciousIps: [],
          anomalousPatterns: 0,
        },
        health: {
          cpuUsage: 50,
          memoryUsage: 60,
          activeConnections: 100,
          queuedRequests: 10,
        },
      }

      // Test greater than condition
      const gtAlert: AlertConfig = {
        type: 'threshold',
        metric: 'authMetrics.failureCount',
        condition: 'gt',
        value: 20,
        severity: 'high',
        cooldownMinutes: 5,
        actions: [{ type: 'log', config: {} }],
      }
      
      dashboard.addAlert(gtAlert)
      
      vi.mocked(auditLogger.query).mockResolvedValue([])
      
      // Manually trigger alert checking
      await (dashboard as any).checkAlerts(metrics)
      
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.stringContaining('Security alert triggered'),
        })
      )
    })
  })

  describe('automatic metrics collection', () => {
    it('should start collecting metrics periodically', async () => {
      vi.mocked(auditLogger.query).mockResolvedValue([])
      
      const collectSpy = vi.spyOn(dashboard, 'collectMetrics')
      
      // Fast-forward time by 1 minute
      await vi.advanceTimersByTimeAsync(60000)
      
      expect(collectSpy).toHaveBeenCalled()
    })
  })
})