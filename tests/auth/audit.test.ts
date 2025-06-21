import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  logSecurityEvent,
  logAuthenticationAttempt,
  logSessionActivity,
  logDataAccess,
  logConfigurationChange,
  getAuditLogs,
  getSecurityMetrics,
  detectAnomalies,
  exportAuditReport
} from '@/lib/auth/audit'
import { sql } from '@/lib/db/config'
import type { AuthEventType, EventSeverity, SecurityAuditLog } from '@/types/auth'

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn()
}))

describe('Security Audit Logging', () => {
  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    github_username: 'testuser'
  }

  const mockContext = {
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    request_id: 'req-123',
    session_id: 'session-123'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Event Logging', () => {
    it('should log security events with full context', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'login_success',
        event_severity: 'info',
        created_at: new Date()
      }])

      const log = await logSecurityEvent({
        event_type: 'login_success',
        event_severity: 'info',
        user_id: mockUser.id,
        ip_address: mockContext.ip_address,
        user_agent: mockContext.user_agent,
        event_data: {
          auth_method: 'webauthn',
          session_id: mockContext.session_id
        },
        success: true
      })

      expect(log).toMatchObject({
        event_type: 'login_success',
        event_severity: 'info',
        user_id: mockUser.id
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('INSERT INTO security_audit_logs')
      expect(calls[0]?.[0]?.[0]).toContain('event_data')
    })

    it('should handle events without user context', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ id: 'log-456' }])

      await logSecurityEvent({
        event_type: 'rate_limit_exceeded',
        event_severity: 'warning',
        ip_address: mockContext.ip_address,
        event_data: {
          endpoint: '/api/auth/login',
          limit: 10,
          window: '1m'
        },
        success: false,
        error_message: 'Too many requests'
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('INSERT INTO security_audit_logs')
    })

    it('should assign appropriate severity levels', async () => {
      const mockSql = vi.mocked(sql)
      
      const severityTests = [
        { event: 'login_success', expected: 'info' },
        { event: 'login_failure', expected: 'warning' },
        { event: 'account_locked', expected: 'error' },
        { event: 'data_breach_attempt', expected: 'critical' }
      ]

      for (const test of severityTests) {
        mockSql.mockResolvedValueOnce([{ id: 'log-x' }])
        
        const severity = await getEventSeverity(test.event as AuthEventType)
        expect(severity).toBe(test.expected)
      }
    })
  })

  describe('Authentication Logging', () => {
    it('should log authentication attempts with device fingerprint', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'login_success',
        event_severity: 'info',
        created_at: new Date()
      }])

      await logAuthenticationAttempt({
        userId: mockUser.id,
        email: mockUser.email,
        authMethod: 'oauth',
        success: true,
        context: {
          ...mockContext,
          device_fingerprint: 'fp-123456',
          geo_location: {
            country: 'US',
            region: 'CA',
            city: 'San Francisco'
          }
        }
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('event_type')
      expect(calls[0]?.[0]?.[0]).toContain('event_data')
      // The SQL template should have parameters passed
      // Find the JSON stringified event_data in the parameters
      const allParams = calls[0]?.slice(1).flat() || []
      const eventDataParam = allParams.find(param => 
        typeof param === 'string' && param.includes('device_fingerprint')
      )
      expect(eventDataParam).toBeDefined()
      expect(eventDataParam).toContain('device_fingerprint')
    })

    it('should track failed login attempts', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock existing failed attempts
      mockSql.mockResolvedValueOnce([
        { created_at: new Date(Date.now() - 60000) }, // 1 min ago
        { created_at: new Date(Date.now() - 120000) } // 2 min ago
      ])
      
      // Mock log insertion
      mockSql.mockResolvedValueOnce([])
      
      // Mock account lock
      mockSql.mockResolvedValueOnce([])

      const result = await logAuthenticationAttempt({
        userId: mockUser.id,
        email: mockUser.email,
        authMethod: 'webauthn',
        success: false,
        error: 'Invalid credentials',
        context: mockContext
      })

      expect(result.recentFailures).toBe(2)
      expect(result.accountLocked).toBe(false)
    })

    it('should auto-lock account after threshold', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock 5 recent failed attempts
      mockSql.mockResolvedValueOnce([
        { created_at: new Date(Date.now() - 60000) },
        { created_at: new Date(Date.now() - 120000) },
        { created_at: new Date(Date.now() - 180000) },
        { created_at: new Date(Date.now() - 240000) },
        { created_at: new Date(Date.now() - 300000) }
      ])
      
      // Mock account lock update
      mockSql.mockResolvedValueOnce([])
      
      // Mock account lock event log
      mockSql.mockResolvedValueOnce([{
        id: 'lock-log-123',
        event_type: 'account_locked',
        event_severity: 'error',
        created_at: new Date()
      }])
      
      // Mock login failure log
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'login_failure',
        event_severity: 'warning',
        created_at: new Date()
      }])

      const result = await logAuthenticationAttempt({
        userId: mockUser.id,
        email: mockUser.email,
        authMethod: 'oauth',
        success: false,
        error: 'Invalid credentials',
        context: mockContext
      })

      expect(result.accountLocked).toBe(true)
      
      // Verify account was locked
      const calls = mockSql.mock.calls
      const lockCall = calls.find(call =>
        call[0] && call[0][0] && call[0][0].includes('UPDATE users')
      )
      expect(lockCall).toBeDefined()
    })
  })

  describe('Session Activity Tracking', () => {
    it('should log session creation and updates', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'session_created',
        event_severity: 'info',
        created_at: new Date()
      }])

      await logSessionActivity({
        sessionId: 'session-123',
        userId: mockUser.id,
        activityType: 'session_created',
        context: mockContext
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('event_type')
      expect(calls[0]?.[1]).toBe('session_created')
    })

    it('should detect session anomalies', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock existing session
      mockSql.mockResolvedValueOnce([{
        ip_address: '10.0.0.1', // Different IP
        user_agent: mockContext.user_agent,
        created_at: new Date()
      }])
      
      // Mock anomaly log insertion
      mockSql.mockResolvedValueOnce([{
        id: 'anomaly-log-123',
        event_type: 'unusual_activity',
        event_severity: 'warning',
        created_at: new Date()
      }])
      
      // Mock session activity log
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'session_refreshed',
        event_severity: 'info',
        created_at: new Date()
      }])

      const result = await logSessionActivity({
        sessionId: 'session-123',
        userId: mockUser.id,
        activityType: 'session_refreshed',
        context: mockContext
      })

      expect(result.anomalyDetected).toBe(true)
      expect(result.anomalyType).toBe('ip_change')
    })
  })

  describe('Data Access Logging', () => {
    it('should log sensitive data access', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'data_access',
        event_severity: 'info',
        created_at: new Date()
      }])

      await logDataAccess({
        userId: mockUser.id,
        resourceType: 'user_data',
        resourceId: 'user-456',
        operation: 'read',
        fields: ['email', 'github_token'],
        context: mockContext
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('event_type')
      expect(calls[0]?.[1]).toBe('data_access')
      // Find the JSON stringified event_data in the parameters
      const allParams = calls[0]?.slice(1).flat() || []
      const eventDataParam = allParams.find(param => 
        typeof param === 'string' && param.includes('resource_type')
      )
      expect(eventDataParam).toBeDefined()
      expect(eventDataParam).toContain('resource_type')
    })

    it('should track bulk data operations', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'data_access',
        event_severity: 'info',
        created_at: new Date()
      }])

      await logDataAccess({
        userId: mockUser.id,
        resourceType: 'user_export',
        operation: 'export',
        recordCount: 1000,
        context: mockContext
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('event_data')
      // Find the JSON stringified event_data in the parameters
      const allParams = calls[0]?.slice(1).flat() || []
      const eventDataParam = allParams.find(param => 
        typeof param === 'string' && param.includes('record_count')
      )
      expect(eventDataParam).toBeDefined()
      expect(eventDataParam).toContain('record_count')
    })
  })

  describe('Configuration Changes', () => {
    it('should log security configuration changes', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        event_type: 'config_change',
        event_severity: 'warning',
        created_at: new Date()
      }])

      await logConfigurationChange({
        userId: mockUser.id,
        configType: 'security_settings',
        changes: {
          two_factor_enabled: { from: false, to: true },
          session_timeout: { from: 3600, to: 1800 }
        },
        context: mockContext,
        privilegeLevel: 'admin'
      })

      const calls = mockSql.mock.calls
      expect(calls[0]?.[0]?.[0]).toContain('event_type')
      expect(calls[0]?.[1]).toBe('config_change')
    })

    it('should require elevated privileges for critical changes', async () => {
      await expect(
        logConfigurationChange({
          userId: mockUser.id,
          configType: 'encryption_keys',
          changes: { algorithm: { from: 'AES-128', to: 'AES-256' } },
          context: mockContext,
          privilegeLevel: 'user'
        })
      ).rejects.toThrow('Insufficient privileges')
    })
  })

  describe('Audit Log Queries', () => {
    it('should retrieve audit logs with filters', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        {
          id: 'log-1',
          event_type: 'login_success',
          created_at: new Date()
        },
        {
          id: 'log-2',
          event_type: 'data_access',
          created_at: new Date()
        }
      ])

      const logs = await getAuditLogs({
        userId: mockUser.id,
        eventTypes: ['login_success', 'data_access'],
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        limit: 100
      })

      expect(logs).toHaveLength(2)
      
      const calls = mockSql.mock.calls
      // The SQL template combines all parts into a single string
      const sqlQuery = calls[0]?.[0]?.join ? calls[0][0].join(' ') : calls[0]?.[0]?.[0]
      expect(sqlQuery).toContain('SELECT')
      expect(sqlQuery).toContain('WHERE')
      expect(sqlQuery).toContain('ORDER BY')
    })

    it('should support pagination', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce(Array(50).fill({ id: 'log-x' }))

      const page1 = await getAuditLogs({
        limit: 50,
        offset: 0
      })

      expect(page1).toHaveLength(50)
      
      const calls = mockSql.mock.calls
      // The SQL template combines all parts into a single string
      const sqlQuery = calls[0]?.[0]?.join ? calls[0][0].join(' ') : calls[0]?.[0]?.[0]
      expect(sqlQuery).toContain('LIMIT')
      expect(sqlQuery).toContain('OFFSET')
    })
  })

  describe('Security Metrics', () => {
    it('should calculate security metrics', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock various counts
      mockSql.mockResolvedValueOnce([{ count: '100' }]) // Total logins
      mockSql.mockResolvedValueOnce([{ count: '5' }])   // Failed logins
      mockSql.mockResolvedValueOnce([{ count: '2' }])   // Locked accounts
      mockSql.mockResolvedValueOnce([{ count: '10' }])  // Anomalies

      const metrics = await getSecurityMetrics({
        timeRange: '24h'
      })

      expect(metrics).toMatchObject({
        loginSuccessRate: 95,
        failedLoginCount: 5,
        lockedAccountCount: 2,
        anomalyCount: 10
      })
    })

    it('should track metrics over time', async () => {
      const mockSql = vi.mocked(sql)
      // Mock all the metric queries
      mockSql.mockResolvedValueOnce([{ count: '220' }]) // Total logins
      mockSql.mockResolvedValueOnce([{ count: '10' }])  // Failed logins
      mockSql.mockResolvedValueOnce([{ count: '0' }])   // Locked accounts
      mockSql.mockResolvedValueOnce([{ count: '5' }])   // Anomalies
      // Mock timeline data
      mockSql.mockResolvedValueOnce([
        { date: '2024-01-01', count: 100 },
        { date: '2024-01-02', count: 120 },
        { date: '2024-01-03', count: 90 }
      ])

      const timeSeries = await getSecurityMetrics({
        timeRange: '7d',
        groupBy: 'day'
      })

      expect(timeSeries.timeline).toHaveLength(3)
    })
  })

  describe('Anomaly Detection', () => {
    it('should detect unusual access patterns', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock user's typical access pattern
      mockSql.mockResolvedValueOnce([
        { hour: 9, count: 10 },
        { hour: 10, count: 15 },
        { hour: 11, count: 12 }
      ])
      
      // Mock recent events (for rapid succession check)
      mockSql.mockResolvedValueOnce([])
      
      // Mock anomaly log
      mockSql.mockResolvedValueOnce([{
        id: 'anomaly-log-123',
        event_type: 'unusual_activity',
        event_severity: 'warning',
        created_at: new Date()
      }])

      const anomaly = await detectAnomalies({
        userId: mockUser.id,
        eventType: 'login_attempt',
        timestamp: new Date('2024-01-01T03:00:00Z'), // 3 AM login
        context: mockContext
      })

      expect(anomaly.detected).toBe(true)
      expect(anomaly.type).toBe('unusual_time')
    })

    it('should detect rapid succession events', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock typical access pattern (empty for non-typical hours check)
      mockSql.mockResolvedValueOnce([])
      
      // Mock recent events
      mockSql.mockResolvedValueOnce([
        { created_at: new Date(Date.now() - 1000) },  // 1 sec ago
        { created_at: new Date(Date.now() - 2000) },  // 2 sec ago
        { created_at: new Date(Date.now() - 3000) }   // 3 sec ago
      ])
      
      // Mock anomaly log
      mockSql.mockResolvedValueOnce([{
        id: 'anomaly-log-123',
        event_type: 'unusual_activity',
        event_severity: 'warning',
        created_at: new Date()
      }])

      const anomaly = await detectAnomalies({
        userId: mockUser.id,
        eventType: 'data_export',
        context: mockContext
      })

      expect(anomaly.detected).toBe(true)
      expect(anomaly.type).toBe('rapid_succession')
    })
  })

  describe('Audit Reporting', () => {
    it('should generate audit report', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock report data
      mockSql.mockResolvedValueOnce([]) // Events
      mockSql.mockResolvedValueOnce([{ count: '1000' }]) // Total events
      mockSql.mockResolvedValueOnce([]) // Event distribution
      mockSql.mockResolvedValueOnce([]) // Top users

      const report = await exportAuditReport({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        format: 'json'
      })

      expect(report).toMatchObject({
        metadata: expect.objectContaining({
          generated_at: expect.any(Date),
          period: expect.any(Object)
        }),
        summary: expect.any(Object),
        events: expect.any(Array)
      })
    })

    it('should support CSV export format', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValue([])

      const report = await exportAuditReport({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        format: 'csv'
      })

      expect(typeof report).toBe('string')
      expect(report).toContain('event_type,event_severity')
    })
  })

  describe('Compliance Features', () => {
    it('should ensure tamper-proof logging', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{
        id: 'log-123',
        checksum: 'abc123'
      }])

      const log = await logSecurityEvent({
        event_type: 'critical_operation',
        event_severity: 'critical',
        user_id: mockUser.id,
        event_data: { operation: 'delete_user' },
        success: true
      })

      // Verify checksum was calculated
      expect(log.checksum).toBeDefined()
    })

    it('should retain critical logs according to policy', async () => {
      const mockSql = vi.mocked(sql)
      
      // Try to delete critical log
      mockSql.mockResolvedValueOnce([{
        event_severity: 'critical',
        created_at: new Date('2020-01-01') // 4 years old
      }])

      await expect(
        deleteAuditLog('log-123')
      ).rejects.toThrow('Cannot delete critical logs within retention period')
    })
  })
})

// Import helper functions
import { 
  getEventSeverity,
  deleteAuditLog 
} from '@/lib/auth/audit'