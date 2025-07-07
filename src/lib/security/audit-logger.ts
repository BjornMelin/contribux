/**
 * Comprehensive Security Audit Logging System
 * Provides structured logging for security events with compliance support
 * Implements log retention, filtering, and analysis capabilities
 */

import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { Redis } from '@redis/client'

// Audit event types
export enum AuditEventType {
  // Authentication events
  AUTH_SUCCESS = 'auth.success',
  AUTH_FAILURE = 'auth.failure',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_TOKEN_REFRESH = 'auth.token.refresh',
  AUTH_MFA_SUCCESS = 'auth.mfa.success',
  AUTH_MFA_FAILURE = 'auth.mfa.failure',
  
  // Authorization events
  AUTHZ_SUCCESS = 'authz.success',
  AUTHZ_FAILURE = 'authz.failure',
  AUTHZ_ROLE_CHANGE = 'authz.role.change',
  
  // API access events
  API_ACCESS = 'api.access',
  API_RATE_LIMIT = 'api.rate_limit',
  API_ERROR = 'api.error',
  
  // Security events
  SECURITY_VIOLATION = 'security.violation',
  SECURITY_SCAN = 'security.scan',
  SECURITY_CONFIG_CHANGE = 'security.config.change',
  
  // Data access events
  DATA_ACCESS = 'data.access',
  DATA_MODIFICATION = 'data.modification',
  DATA_EXPORT = 'data.export',
  DATA_DELETION = 'data.deletion',
  
  // Webhook events
  WEBHOOK_RECEIVED = 'webhook.received',
  WEBHOOK_VALIDATED = 'webhook.validated',
  WEBHOOK_FAILED = 'webhook.failed',
  
  // System events
  SYSTEM_START = 'system.start',
  SYSTEM_STOP = 'system.stop',
  SYSTEM_ERROR = 'system.error',
  SYSTEM_CONFIG_CHANGE = 'system.config.change',
}

// Audit event severity levels
export enum AuditSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// Audit event schema
export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  type: z.nativeEnum(AuditEventType),
  severity: z.nativeEnum(AuditSeverity),
  
  // Actor information
  actor: z.object({
    id: z.string().optional(),
    type: z.enum(['user', 'system', 'api', 'webhook']),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  
  // Target information
  target: z.object({
    type: z.string(),
    id: z.string().optional(),
    name: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }).optional(),
  
  // Event details
  action: z.string(),
  result: z.enum(['success', 'failure', 'error']),
  reason: z.string().optional(),
  
  // Additional context
  metadata: z.record(z.unknown()).optional(),
  
  // Compliance fields
  compliance: z.object({
    regulations: z.array(z.string()).optional(),
    dataClassification: z.string().optional(),
    retentionDays: z.number().optional(),
  }).optional(),
})

export type AuditEvent = z.infer<typeof AuditEventSchema>

// Audit logger configuration
export interface AuditLoggerConfig {
  enabled: boolean
  logToConsole: boolean
  logToFile: boolean
  logToDatabase: boolean
  filePath?: string
  redisClient?: Redis | null
  retentionDays: number
  minSeverity: AuditSeverity
  excludeTypes?: AuditEventType[]
  includeOnlyTypes?: AuditEventType[]
  sanitizeFields?: string[]
  complianceMode?: boolean
}

/**
 * Security Audit Logger
 */
export class SecurityAuditLogger {
  private config: AuditLoggerConfig
  private redis: Redis | null
  private queue: AuditEvent[] = []
  private flushInterval: NodeJS.Timeout | null = null

  constructor(config: AuditLoggerConfig) {
    this.config = config
    this.redis = config.redisClient || null
    
    if (this.config.enabled) {
      this.startFlushInterval()
    }
  }

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) return

    // Check if event type should be logged
    if (!this.shouldLog(event.type, event.severity)) return

    const auditEvent: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date(),
    }

    // Sanitize sensitive data
    const sanitized = this.sanitizeEvent(auditEvent)

    // Add to queue
    this.queue.push(sanitized)

    // Log critical events immediately
    if (event.severity === AuditSeverity.CRITICAL) {
      await this.flush()
    }
  }

  /**
   * Create standardized audit events
   */
  async logAuthSuccess(userId: string, method: string, ip?: string): Promise<void> {
    await this.log({
      type: AuditEventType.AUTH_SUCCESS,
      severity: AuditSeverity.INFO,
      actor: {
        id: userId,
        type: 'user',
        ip,
      },
      action: `Authentication via ${method}`,
      result: 'success',
    })
  }

  async logAuthFailure(username: string, method: string, reason: string, ip?: string): Promise<void> {
    await this.log({
      type: AuditEventType.AUTH_FAILURE,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'user',
        ip,
      },
      target: {
        type: 'user',
        name: username,
      },
      action: `Authentication attempt via ${method}`,
      result: 'failure',
      reason,
    })
  }

  async logApiAccess(
    userId: string | undefined,
    method: string,
    path: string,
    statusCode: number,
    ip?: string
  ): Promise<void> {
    await this.log({
      type: AuditEventType.API_ACCESS,
      severity: statusCode >= 400 ? AuditSeverity.WARNING : AuditSeverity.INFO,
      actor: {
        id: userId,
        type: userId ? 'user' : 'api',
        ip,
      },
      target: {
        type: 'api_endpoint',
        name: `${method} ${path}`,
      },
      action: 'API request',
      result: statusCode < 400 ? 'success' : 'failure',
      metadata: {
        statusCode,
        method,
        path,
      },
    })
  }

  async logSecurityViolation(
    type: string,
    details: string,
    ip?: string,
    userId?: string
  ): Promise<void> {
    await this.log({
      type: AuditEventType.SECURITY_VIOLATION,
      severity: AuditSeverity.CRITICAL,
      actor: {
        id: userId,
        type: userId ? 'user' : 'system',
        ip,
      },
      action: `Security violation: ${type}`,
      result: 'failure',
      reason: details,
      compliance: {
        regulations: ['SOC2', 'ISO27001'],
        dataClassification: 'security-incident',
        retentionDays: 2555, // 7 years
      },
    })
  }

  async logDataAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    ip?: string
  ): Promise<void> {
    await this.log({
      type: AuditEventType.DATA_ACCESS,
      severity: AuditSeverity.INFO,
      actor: {
        id: userId,
        type: 'user',
        ip,
      },
      target: {
        type: resourceType,
        id: resourceId,
      },
      action: `Data access: ${action}`,
      result: 'success',
      compliance: {
        regulations: ['GDPR', 'CCPA'],
        dataClassification: 'user-data',
        retentionDays: 365,
      },
    })
  }

  /**
   * Query audit logs
   */
  async query(filters: {
    startDate?: Date
    endDate?: Date
    types?: AuditEventType[]
    severities?: AuditSeverity[]
    actorId?: string
    targetId?: string
    limit?: number
    offset?: number
  }): Promise<AuditEvent[]> {
    if (!this.redis) {
      console.warn('[AuditLogger] Cannot query logs without Redis connection')
      return []
    }

    // Build query
    const key = 'audit:events'
    const start = filters.startDate?.getTime() || 0
    const end = filters.endDate?.getTime() || Date.now()

    // Get events from Redis sorted set
    const eventIds = await this.redis.zRangeByScore(
      key,
      start,
      end,
      {
        LIMIT: {
          offset: filters.offset || 0,
          count: filters.limit || 100,
        },
      }
    )

    // Fetch full events
    const events: AuditEvent[] = []
    for (const eventId of eventIds) {
      const data = await this.redis.get(`audit:event:${eventId}`)
      if (data) {
        try {
          const event = JSON.parse(data) as AuditEvent
          
          // Apply filters
          if (filters.types && !filters.types.includes(event.type)) continue
          if (filters.severities && !filters.severities.includes(event.severity)) continue
          if (filters.actorId && event.actor.id !== filters.actorId) continue
          if (filters.targetId && event.target?.id !== filters.targetId) continue
          
          events.push(event)
        } catch (error) {
          console.error('[AuditLogger] Failed to parse event:', error)
        }
      }
    }

    return events
  }

  /**
   * Generate audit report
   */
  async generateReport(
    startDate: Date,
    endDate: Date,
    groupBy: 'type' | 'severity' | 'actor' | 'day'
  ): Promise<Record<string, number>> {
    const events = await this.query({ startDate, endDate })
    const report: Record<string, number> = {}

    for (const event of events) {
      let key: string
      
      switch (groupBy) {
        case 'type':
          key = event.type
          break
        case 'severity':
          key = event.severity
          break
        case 'actor':
          key = event.actor.id || 'anonymous'
          break
        case 'day':
          key = event.timestamp.toISOString().split('T')[0]
          break
      }
      
      report[key] = (report[key] || 0) + 1
    }

    return report
  }

  /**
   * Check if event should be logged
   */
  private shouldLog(type: AuditEventType, severity: AuditSeverity): boolean {
    // Check severity threshold
    const severityLevels = {
      [AuditSeverity.DEBUG]: 0,
      [AuditSeverity.INFO]: 1,
      [AuditSeverity.WARNING]: 2,
      [AuditSeverity.ERROR]: 3,
      [AuditSeverity.CRITICAL]: 4,
    }
    
    if (severityLevels[severity] < severityLevels[this.config.minSeverity]) {
      return false
    }

    // Check type filters
    if (this.config.includeOnlyTypes && !this.config.includeOnlyTypes.includes(type)) {
      return false
    }
    
    if (this.config.excludeTypes && this.config.excludeTypes.includes(type)) {
      return false
    }

    return true
  }

  /**
   * Sanitize sensitive data from events
   */
  private sanitizeEvent(event: AuditEvent): AuditEvent {
    if (!this.config.sanitizeFields || this.config.sanitizeFields.length === 0) {
      return event
    }

    const sanitized = JSON.parse(JSON.stringify(event))
    
    // Recursively sanitize fields
    const sanitizeObject = (obj: any, path: string = '') => {
      for (const key in obj) {
        const fullPath = path ? `${path}.${key}` : key
        
        if (this.config.sanitizeFields?.includes(fullPath)) {
          obj[key] = '[REDACTED]'
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key], fullPath)
        }
      }
    }
    
    sanitizeObject(sanitized)
    return sanitized
  }

  /**
   * Flush queued events
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return

    const events = [...this.queue]
    this.queue = []

    // Log to console
    if (this.config.logToConsole) {
      for (const event of events) {
        console.log('[AUDIT]', JSON.stringify(event))
      }
    }

    // Log to Redis
    if (this.config.logToDatabase && this.redis) {
      try {
        const pipeline = this.redis.multi()
        
        for (const event of events) {
          const eventKey = `audit:event:${event.id}`
          const ttl = (event.compliance?.retentionDays || this.config.retentionDays) * 86400
          
          // Store event
          pipeline.set(eventKey, JSON.stringify(event), { EX: ttl })
          
          // Add to sorted set for querying
          pipeline.zAdd('audit:events', {
            score: event.timestamp.getTime(),
            value: event.id,
          })
          
          // Add to type index
          pipeline.zAdd(`audit:type:${event.type}`, {
            score: event.timestamp.getTime(),
            value: event.id,
          })
          
          // Add to severity index
          pipeline.zAdd(`audit:severity:${event.severity}`, {
            score: event.timestamp.getTime(),
            value: event.id,
          })
        }
        
        await pipeline.exec()
      } catch (error) {
        console.error('[AuditLogger] Failed to write to Redis:', error)
      }
    }
  }

  /**
   * Start flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch(error => {
        console.error('[AuditLogger] Flush error:', error)
      })
    }, 5000) // Flush every 5 seconds
  }

  /**
   * Stop the audit logger
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    
    await this.flush()
  }
}

// Default audit logger instance
export const auditLogger = new SecurityAuditLogger({
  enabled: process.env.NODE_ENV === 'production',
  logToConsole: process.env.NODE_ENV !== 'production',
  logToFile: false,
  logToDatabase: true,
  retentionDays: 90,
  minSeverity: AuditSeverity.INFO,
  sanitizeFields: ['password', 'token', 'secret', 'apiKey'],
  complianceMode: true,
})