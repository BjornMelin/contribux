/**
 * Security Audit Logging Implementation
 * Provides comprehensive event logging, monitoring, and compliance features
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from '@/lib/db/config'
import type {
  AnomalyDetection,
  AuditLogFilters,
  AuthEventType,
  EventSeverity,
  SecurityAuditLog,
  SecurityMetrics,
} from '@/types/auth'

// Event severity mapping
const EVENT_SEVERITY_MAP: Record<string, EventSeverity> = {
  // Info level events
  login_success: 'info',
  logout: 'info',
  session_created: 'info',
  session_refreshed: 'info',
  token_refreshed: 'info',
  consent_granted: 'info',
  data_export_request: 'info',
  config_view: 'info',

  // Warning level events
  login_failure: 'warning',
  invalid_credentials: 'warning',
  rate_limit_exceeded: 'warning',
  session_expired: 'warning',
  token_expired: 'warning',
  consent_revoked: 'warning',
  unusual_activity: 'warning',

  // Error level events
  account_locked: 'error',
  authentication_error: 'error',
  authorization_failure: 'error',
  token_validation_failed: 'error',
  security_violation: 'error',
  data_access_denied: 'error',

  // Critical level events
  data_breach_attempt: 'critical',
  privilege_escalation: 'critical',
  data_deletion_request: 'critical',
  critical_operation: 'critical',
  system_compromise: 'critical',
  token_reuse_detected: 'critical',
}

// Configuration
const FAILED_LOGIN_THRESHOLD = 5
const FAILED_LOGIN_WINDOW = 10 * 60 * 1000 // 10 minutes
const ANOMALY_TIME_WINDOW = 5 * 1000 // 5 seconds for rapid succession
const TYPICAL_HOURS_START = 6 // 6 AM
const TYPICAL_HOURS_END = 22 // 10 PM

// Get event severity
export async function getEventSeverity(eventType: AuthEventType | string): Promise<EventSeverity> {
  return EVENT_SEVERITY_MAP[eventType] || 'info'
}

// Log security event
export async function logSecurityEvent(params: {
  event_type: AuthEventType | string
  event_severity?: EventSeverity
  user_id?: string
  ip_address?: string
  user_agent?: string
  event_data?: Record<string, unknown>
  success: boolean
  error_message?: string
  request_id?: string
  session_id?: string
}): Promise<SecurityAuditLog> {
  const severity = params.event_severity || (await getEventSeverity(params.event_type))

  // Calculate checksum for critical events
  let checksum: string | null = null
  if (severity === 'critical') {
    const data = JSON.stringify({
      event_type: params.event_type,
      user_id: params.user_id,
      event_data: params.event_data,
      timestamp: new Date().toISOString(),
    })
    checksum = createHash('sha256').update(data).digest('hex')
  }

  const result = await sql`
    INSERT INTO security_audit_logs (
      event_type,
      event_severity,
      user_id,
      ip_address,
      user_agent,
      event_data,
      success,
      error_message,
      checksum,
      created_at
    )
    VALUES (
      ${params.event_type},
      ${severity},
      ${params.user_id || null},
      ${params.ip_address || null},
      ${params.user_agent || null},
      ${JSON.stringify(params.event_data || {})},
      ${params.success},
      ${params.error_message || null},
      ${checksum},
      CURRENT_TIMESTAMP
    )
    RETURNING *
  `

  return {
    ...result[0],
    user_id: params.user_id || null,
  } as SecurityAuditLog
}

// Log authentication attempt
export async function logAuthenticationAttempt(params: {
  userId?: string
  email: string
  authMethod: string
  success: boolean
  error?: string
  context: {
    ip_address?: string
    user_agent?: string
    request_id?: string
    session_id?: string
    device_fingerprint?: string
    geo_location?: {
      country?: string
      region?: string
      city?: string
    }
  }
}): Promise<{
  recentFailures: number
  accountLocked: boolean
}> {
  // Check recent failed attempts if this is a failure
  let recentFailures = 0
  let accountLocked = false

  if (!params.success && params.userId) {
    // Get recent failed attempts
    const failedAttempts = await sql`
      SELECT created_at
      FROM security_audit_logs
      WHERE user_id = ${params.userId}
      AND event_type = 'login_failure'
      AND created_at > ${new Date(Date.now() - FAILED_LOGIN_WINDOW)}
      ORDER BY created_at DESC
    `

    recentFailures = failedAttempts.length

    // Check if we need to lock the account
    if (recentFailures >= FAILED_LOGIN_THRESHOLD - 1) {
      accountLocked = true

      // Lock the account
      await sql`
        UPDATE users
        SET locked_at = CURRENT_TIMESTAMP
        WHERE id = ${params.userId}
      `

      // Log account lock event
      await logSecurityEvent({
        event_type: 'account_locked',
        event_severity: 'error',
        user_id: params.userId,
        ip_address: params.context.ip_address,
        user_agent: params.context.user_agent,
        event_data: {
          reason: 'Too many failed login attempts',
          failed_attempts: recentFailures + 1,
        },
        success: true,
      })
    }
  }

  // Log the authentication attempt
  await logSecurityEvent({
    event_type: params.success ? 'login_success' : 'login_failure',
    user_id: params.userId,
    ip_address: params.context.ip_address,
    user_agent: params.context.user_agent,
    event_data: {
      email: params.email,
      auth_method: params.authMethod,
      device_fingerprint: params.context.device_fingerprint,
      geo_location: params.context.geo_location,
      error: params.error,
    },
    success: params.success,
    error_message: params.error,
  })

  return {
    recentFailures,
    accountLocked,
  }
}

// Log session activity
export async function logSessionActivity(params: {
  sessionId: string
  userId: string
  activityType: 'session_created' | 'session_refreshed' | 'session_expired' | 'session_terminated'
  context: {
    ip_address?: string
    user_agent?: string
    request_id?: string
  }
}): Promise<{
  anomalyDetected: boolean
  anomalyType?: string
}> {
  let anomalyDetected = false
  let anomalyType: string | undefined

  // Check for anomalies in existing sessions
  if (params.activityType === 'session_refreshed') {
    const existingSession = await sql`
      SELECT ip_address, user_agent, created_at
      FROM user_sessions
      WHERE id = ${params.sessionId}
      LIMIT 1
    `

    if (existingSession.length > 0) {
      const session = existingSession[0]

      // Check for IP change
      if (session.ip_address !== params.context.ip_address) {
        anomalyDetected = true
        anomalyType = 'ip_change'

        // Log anomaly
        await logSecurityEvent({
          event_type: 'unusual_activity',
          event_severity: 'warning',
          user_id: params.userId,
          ip_address: params.context.ip_address,
          user_agent: params.context.user_agent,
          event_data: {
            anomaly_type: 'ip_change',
            old_ip: session.ip_address,
            new_ip: params.context.ip_address,
            session_id: params.sessionId,
          },
          success: true,
        })
      }

      // Check for user agent change
      if (session.user_agent !== params.context.user_agent) {
        anomalyDetected = true
        anomalyType = anomalyType ? `${anomalyType},user_agent_change` : 'user_agent_change'
      }
    }
  }

  // Log session activity
  await logSecurityEvent({
    event_type: params.activityType,
    user_id: params.userId,
    ip_address: params.context.ip_address,
    user_agent: params.context.user_agent,
    event_data: {
      session_id: params.sessionId,
      anomaly_detected: anomalyDetected,
      anomaly_type: anomalyType,
    },
    success: true,
  })

  return {
    anomalyDetected,
    anomalyType,
  }
}

// Log data access
export async function logDataAccess(params: {
  userId: string
  resourceType: string
  resourceId?: string
  operation: 'read' | 'write' | 'delete' | 'export'
  fields?: string[]
  recordCount?: number
  context: {
    ip_address?: string
    user_agent?: string
    request_id?: string
    session_id?: string
  }
}): Promise<void> {
  await logSecurityEvent({
    event_type: 'data_access',
    user_id: params.userId,
    ip_address: params.context.ip_address,
    user_agent: params.context.user_agent,
    event_data: {
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      operation: params.operation,
      fields: params.fields,
      record_count: params.recordCount,
    },
    success: true,
  })
}

// Log configuration change
export async function logConfigurationChange(params: {
  userId: string
  configType: string
  changes: Record<string, { from: unknown; to: unknown }>
  context: {
    ip_address?: string
    user_agent?: string
    request_id?: string
  }
  privilegeLevel?: 'user' | 'admin' | 'system'
}): Promise<void> {
  // Check privilege requirements for critical configurations
  const criticalConfigs = ['encryption_keys', 'security_settings', 'system_config']
  if (
    criticalConfigs.includes(params.configType) &&
    params.privilegeLevel &&
    params.privilegeLevel !== 'admin'
  ) {
    throw new Error('Insufficient privileges for critical configuration change')
  }

  await logSecurityEvent({
    event_type: 'config_change',
    event_severity: criticalConfigs.includes(params.configType) ? 'warning' : 'info',
    user_id: params.userId,
    ip_address: params.context.ip_address,
    user_agent: params.context.user_agent,
    event_data: {
      config_type: params.configType,
      changes: params.changes,
      privilege_level: params.privilegeLevel,
    },
    success: true,
  })
}

// Get audit logs with filters
export async function getAuditLogs(filters: AuditLogFilters): Promise<SecurityAuditLog[]> {
  // Use a series of conditions with template literals
  let result: unknown[]

  if (
    filters.userId &&
    filters.eventTypes &&
    filters.eventTypes.length > 0 &&
    filters.startDate &&
    filters.endDate
  ) {
    result = await sql`
      SELECT * FROM security_audit_logs
      WHERE user_id = ${filters.userId}
      AND event_type = ANY(${filters.eventTypes})
      AND created_at >= ${filters.startDate}
      AND created_at <= ${filters.endDate}
      ORDER BY created_at DESC
      LIMIT ${filters.limit || 100}
      OFFSET ${filters.offset || 0}
    `
  } else if (filters.userId && filters.eventTypes && filters.eventTypes.length > 0) {
    result = await sql`
      SELECT * FROM security_audit_logs
      WHERE user_id = ${filters.userId}
      AND event_type = ANY(${filters.eventTypes})
      ORDER BY created_at DESC
      LIMIT ${filters.limit || 100}
      OFFSET ${filters.offset || 0}
    `
  } else if (filters.userId) {
    result = await sql`
      SELECT * FROM security_audit_logs
      WHERE user_id = ${filters.userId}
      ORDER BY created_at DESC
      LIMIT ${filters.limit || 100}
      OFFSET ${filters.offset || 0}
    `
  } else if (filters.startDate && filters.endDate) {
    result = await sql`
      SELECT * FROM security_audit_logs
      WHERE created_at >= ${filters.startDate}
      AND created_at <= ${filters.endDate}
      ORDER BY created_at DESC
      LIMIT ${filters.limit || 100}
      OFFSET ${filters.offset || 0}
    `
  } else {
    result = await sql`
      SELECT * FROM security_audit_logs
      ORDER BY created_at DESC
      LIMIT ${filters.limit || 100}
      OFFSET ${filters.offset || 0}
    `
  }

  return result as SecurityAuditLog[]
}

// Get security metrics
export async function getSecurityMetrics(params: {
  timeRange: '24h' | '7d' | '30d'
  groupBy?: 'hour' | 'day' | 'week'
}): Promise<SecurityMetrics & { timeline?: Array<{ date: Date; count: number }> }> {
  const timeRangeMap = {
    '24h': '1 day',
    '7d': '7 days',
    '30d': '30 days',
  }

  const interval = timeRangeMap[params.timeRange]

  // Get various counts
  const [totalLogins, failedLogins, lockedAccounts, anomalies] = await Promise.all([
    sql`
      SELECT COUNT(*) as count
      FROM security_audit_logs
      WHERE event_type = 'login_success'
      AND created_at > CURRENT_TIMESTAMP - INTERVAL ${interval}
    `,
    sql`
      SELECT COUNT(*) as count
      FROM security_audit_logs
      WHERE event_type = 'login_failure'
      AND created_at > CURRENT_TIMESTAMP - INTERVAL ${interval}
    `,
    sql`
      SELECT COUNT(*) as count
      FROM users
      WHERE locked_at IS NOT NULL
    `,
    sql`
      SELECT COUNT(*) as count
      FROM security_audit_logs
      WHERE event_type = 'unusual_activity'
      AND created_at > CURRENT_TIMESTAMP - INTERVAL ${interval}
    `,
  ])

  const totalLoginCount = Number.parseInt(totalLogins[0].count)
  const failedLoginCount = Number.parseInt(failedLogins[0].count)

  const metrics: SecurityMetrics = {
    loginSuccessRate:
      totalLoginCount > 0
        ? Math.round(((totalLoginCount - failedLoginCount) / totalLoginCount) * 100)
        : 100,
    failedLoginCount,
    lockedAccountCount: Number.parseInt(lockedAccounts[0].count),
    anomalyCount: Number.parseInt(anomalies[0].count),
  }

  // Get timeline data if groupBy is specified
  if (params.groupBy) {
    const timelineData = await sql`
      SELECT 
        date_trunc(${params.groupBy}, created_at) as date,
        COUNT(*) as count
      FROM security_audit_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL ${interval}
      GROUP BY date
      ORDER BY date ASC
    `

    return {
      ...metrics,
      timeline: timelineData,
    }
  }

  return metrics
}

// Detect anomalies
export async function detectAnomalies(params: {
  userId: string
  eventType: string
  timestamp?: Date
  context: {
    ip_address?: string
    user_agent?: string
  }
}): Promise<AnomalyDetection> {
  const timestamp = params.timestamp || new Date()

  // Check for unusual time patterns
  const hour = timestamp.getHours()
  let unusualTime = false

  if (hour < TYPICAL_HOURS_START || hour > TYPICAL_HOURS_END) {
    // Check user's typical access pattern
    const typicalPattern = await sql`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM security_audit_logs
      WHERE user_id = ${params.userId}
      AND event_type = ${params.eventType}
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 10
    `

    // If most activity is during typical hours, flag this as unusual
    if (typicalPattern.length > 0) {
      const typicalHours = typicalPattern.map(p => Number.parseInt(p.hour))
      if (!typicalHours.includes(hour)) {
        unusualTime = true
      }
    }
  }

  // Check for rapid succession events
  let rapidSuccession = false

  const recentEvents = await sql`
    SELECT created_at
    FROM security_audit_logs
    WHERE user_id = ${params.userId}
    AND event_type = ${params.eventType}
    AND created_at > ${new Date(timestamp.getTime() - ANOMALY_TIME_WINDOW)}
    ORDER BY created_at DESC
  `

  if (recentEvents.length >= 3) {
    rapidSuccession = true
  }

  const detected = unusualTime || rapidSuccession
  const type = unusualTime ? 'unusual_time' : rapidSuccession ? 'rapid_succession' : undefined

  // Log anomaly if detected
  if (detected) {
    await logSecurityEvent({
      event_type: 'unusual_activity',
      event_severity: 'warning',
      user_id: params.userId,
      ip_address: params.context.ip_address,
      user_agent: params.context.user_agent,
      event_data: {
        original_event: params.eventType,
        anomaly_type: type,
        timestamp: timestamp.toISOString(),
      },
      success: true,
    })
  }

  return {
    detected,
    type,
    confidence: detected ? 0.8 : 0.0,
    details: {
      unusual_time: unusualTime,
      rapid_succession: rapidSuccession,
    },
  }
}

// Export audit report
export async function exportAuditReport(params: {
  startDate: Date
  endDate: Date
  format: 'json' | 'csv'
  userId?: string
}): Promise<
  | string
  | {
      metadata: {
        generated_at: Date
        period: {
          start: Date
          end: Date
        }
        total_events: number
      }
      summary: {
        event_distribution: Array<{
          event_type: string
          event_severity: string
          count: string
        }>
        top_users: Array<{
          user_id: string
          event_count: string
        }>
      }
      events: SecurityAuditLog[]
    }
> {
  // Get audit logs
  const logs = await getAuditLogs({
    startDate: params.startDate,
    endDate: params.endDate,
    userId: params.userId,
  })

  // Get summary statistics
  const [totalEvents, eventDistribution, topUsers] = await Promise.all([
    sql`
      SELECT COUNT(*) as count
      FROM security_audit_logs
      WHERE created_at BETWEEN ${params.startDate} AND ${params.endDate}
    `,
    sql`
      SELECT 
        event_type,
        event_severity,
        COUNT(*) as count
      FROM security_audit_logs
      WHERE created_at BETWEEN ${params.startDate} AND ${params.endDate}
      GROUP BY event_type, event_severity
      ORDER BY count DESC
    `,
    sql`
      SELECT 
        user_id,
        COUNT(*) as event_count
      FROM security_audit_logs
      WHERE created_at BETWEEN ${params.startDate} AND ${params.endDate}
      AND user_id IS NOT NULL
      GROUP BY user_id
      ORDER BY event_count DESC
      LIMIT 10
    `,
  ])

  if (params.format === 'csv') {
    // Generate CSV format
    const headers = [
      'event_type',
      'event_severity',
      'user_id',
      'ip_address',
      'created_at',
      'success',
    ]
    const rows = logs.map(log => [
      log.event_type,
      log.event_severity,
      log.user_id || '',
      log.ip_address || '',
      log.created_at.toISOString(),
      log.success.toString(),
    ])

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')

    return csv
  }

  // Return JSON format
  return {
    metadata: {
      generated_at: new Date(),
      period: {
        start: params.startDate,
        end: params.endDate,
      },
      total_events: Number.parseInt(totalEvents[0].count),
    },
    summary: {
      event_distribution: eventDistribution,
      top_users: topUsers,
    },
    events: logs,
  }
}

// Delete audit log (with restrictions)
export async function deleteAuditLog(logId: string): Promise<void> {
  // Check if it's a critical log
  const log = await sql`
    SELECT event_severity, created_at
    FROM security_audit_logs
    WHERE id = ${logId}
    LIMIT 1
  `

  if (log.length === 0) {
    throw new Error('Audit log not found')
  }

  const auditLog = log[0]

  // Critical logs have 7-year retention
  if (auditLog.event_severity === 'critical') {
    const sevenYearsAgo = new Date()
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7)

    if (auditLog.created_at > sevenYearsAgo) {
      throw new Error('Cannot delete critical logs within retention period')
    }
  }

  // Delete the log
  await sql`
    DELETE FROM security_audit_logs
    WHERE id = ${logId}
  `
}

// Verify audit log integrity
export async function verifyAuditLogIntegrity(logId: string): Promise<boolean> {
  const log = await sql`
    SELECT * FROM security_audit_logs
    WHERE id = ${logId}
    LIMIT 1
  `

  if (log.length === 0 || !log[0].checksum) {
    return true // No checksum to verify
  }

  const auditLog = log[0]

  // Recalculate checksum
  const data = JSON.stringify({
    event_type: auditLog.event_type,
    user_id: auditLog.user_id,
    event_data: auditLog.event_data,
    timestamp: auditLog.created_at.toISOString(),
  })

  const expectedChecksum = createHash('sha256').update(data).digest('hex')

  // Use timing-safe comparison
  return timingSafeEqual(
    Buffer.from(auditLog.checksum, 'hex'),
    Buffer.from(expectedChecksum, 'hex')
  )
}

// Get audit log retention policy
export async function getAuditLogRetentionPolicy() {
  return {
    standard_logs: {
      retention: '2 years',
      auto_delete: true,
    },
    critical_logs: {
      retention: '7 years',
      auto_delete: false,
    },
    compliance_logs: {
      retention: '3 years',
      auto_delete: false,
    },
  }
}

// Monitor real-time security events
export async function monitorSecurityEvents(_params: {
  severity?: EventSeverity[]
  eventTypes?: string[]
  callback: (event: SecurityAuditLog) => void
}): Promise<() => void> {
  // In a real implementation, this would set up a database listener
  // For now, return a cleanup function
  return () => {
    // Cleanup logic
  }
}
