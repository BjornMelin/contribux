/**
 * Security Monitoring and Alerting Dashboard
 * Provides real-time security monitoring, alerting, and analytics
 * Implements comprehensive security metrics and threat detection
 */

import { z } from 'zod'
import { Redis } from '@redis/client'
import { 
  auditLogger, 
  AuditEventType, 
  AuditSeverity,
  AuditEvent 
} from './audit-logger'

// Security metrics
export interface SecurityMetrics {
  timestamp: Date
  
  // Authentication metrics
  authMetrics: {
    successCount: number
    failureCount: number
    mfaUsage: number
    suspiciousAttempts: number
    uniqueUsers: number
  }
  
  // API metrics
  apiMetrics: {
    totalRequests: number
    rateLimitHits: number
    unauthorizedAttempts: number
    averageResponseTime: number
    errorRate: number
  }
  
  // Security violations
  violations: {
    total: number
    byType: Record<string, number>
    bySeverity: Record<AuditSeverity, number>
  }
  
  // Threat indicators
  threats: {
    bruteForceAttempts: number
    sqlInjectionAttempts: number
    xssAttempts: number
    suspiciousIps: string[]
    anomalousPatterns: number
  }
  
  // System health
  health: {
    cpuUsage: number
    memoryUsage: number
    activeConnections: number
    queuedRequests: number
  }
}

// Alert configuration
export interface AlertConfig {
  type: 'threshold' | 'anomaly' | 'pattern' | 'trend'
  metric: string
  condition: 'gt' | 'lt' | 'eq' | 'contains' | 'matches'
  value: number | string | RegExp
  severity: 'low' | 'medium' | 'high' | 'critical'
  cooldownMinutes: number
  actions: AlertAction[]
}

// Alert actions
export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'block' | 'rateLimit'
  config: Record<string, unknown>
}

// Security alert
export interface SecurityAlert {
  id: string
  timestamp: Date
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  metrics: Record<string, unknown>
  status: 'active' | 'acknowledged' | 'resolved'
  resolvedAt?: Date
  resolvedBy?: string
}

/**
 * Security Monitoring Dashboard
 */
export class SecurityMonitoringDashboard {
  private redis: Redis | null
  private alerts: Map<string, AlertConfig> = new Map()
  private activeAlerts: Map<string, SecurityAlert> = new Map()
  private metricsBuffer: SecurityMetrics[] = []
  private flushInterval: NodeJS.Timeout | null = null
  
  constructor(redis?: Redis) {
    this.redis = redis || null
    this.initializeDefaultAlerts()
    this.startMetricsCollection()
  }
  
  /**
   * Initialize default security alerts
   */
  private initializeDefaultAlerts(): void {
    // Authentication failures threshold
    this.addAlert({
      type: 'threshold',
      metric: 'authMetrics.failureCount',
      condition: 'gt',
      value: 10,
      severity: 'high',
      cooldownMinutes: 5,
      actions: [
        { type: 'log', config: {} },
        { type: 'webhook', config: { url: process.env.SECURITY_WEBHOOK_URL } },
      ],
    })
    
    // Rate limit violations
    this.addAlert({
      type: 'threshold',
      metric: 'apiMetrics.rateLimitHits',
      condition: 'gt',
      value: 100,
      severity: 'medium',
      cooldownMinutes: 15,
      actions: [
        { type: 'log', config: {} },
        { type: 'rateLimit', config: { multiplier: 0.5 } },
      ],
    })
    
    // SQL injection attempts
    this.addAlert({
      type: 'threshold',
      metric: 'threats.sqlInjectionAttempts',
      condition: 'gt',
      value: 0,
      severity: 'critical',
      cooldownMinutes: 60,
      actions: [
        { type: 'log', config: {} },
        { type: 'block', config: { duration: 3600 } },
        { type: 'email', config: { to: process.env.SECURITY_EMAIL } },
      ],
    })
    
    // Brute force detection
    this.addAlert({
      type: 'pattern',
      metric: 'threats.bruteForceAttempts',
      condition: 'gt',
      value: 5,
      severity: 'high',
      cooldownMinutes: 30,
      actions: [
        { type: 'log', config: {} },
        { type: 'block', config: { duration: 1800 } },
      ],
    })
    
    // Error rate anomaly
    this.addAlert({
      type: 'anomaly',
      metric: 'apiMetrics.errorRate',
      condition: 'gt',
      value: 0.1, // 10% error rate
      severity: 'medium',
      cooldownMinutes: 10,
      actions: [
        { type: 'log', config: {} },
        { type: 'webhook', config: { url: process.env.OPS_WEBHOOK_URL } },
      ],
    })
  }
  
  /**
   * Collect current security metrics
   */
  async collectMetrics(): Promise<SecurityMetrics> {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    
    // Query recent audit events
    const events = await auditLogger.query({
      startDate: fiveMinutesAgo,
      endDate: now,
    })
    
    // Calculate metrics
    const metrics: SecurityMetrics = {
      timestamp: now,
      authMetrics: {
        successCount: this.countEvents(events, AuditEventType.AUTH_SUCCESS),
        failureCount: this.countEvents(events, AuditEventType.AUTH_FAILURE),
        mfaUsage: this.countEvents(events, AuditEventType.AUTH_MFA_SUCCESS),
        suspiciousAttempts: this.countSuspiciousAuth(events),
        uniqueUsers: this.countUniqueUsers(events),
      },
      apiMetrics: {
        totalRequests: this.countEvents(events, AuditEventType.API_ACCESS),
        rateLimitHits: this.countEvents(events, AuditEventType.API_RATE_LIMIT),
        unauthorizedAttempts: this.countUnauthorized(events),
        averageResponseTime: await this.getAverageResponseTime(),
        errorRate: this.calculateErrorRate(events),
      },
      violations: {
        total: this.countEvents(events, AuditEventType.SECURITY_VIOLATION),
        byType: this.groupViolationsByType(events),
        bySeverity: this.groupEventsBySeverity(events),
      },
      threats: {
        bruteForceAttempts: await this.detectBruteForce(events),
        sqlInjectionAttempts: await this.detectSqlInjection(events),
        xssAttempts: await this.detectXss(events),
        suspiciousIps: await this.getSuspiciousIps(events),
        anomalousPatterns: await this.detectAnomalies(events),
      },
      health: {
        cpuUsage: await this.getCpuUsage(),
        memoryUsage: await this.getMemoryUsage(),
        activeConnections: await this.getActiveConnections(),
        queuedRequests: await this.getQueuedRequests(),
      },
    }
    
    // Store metrics
    this.metricsBuffer.push(metrics)
    if (this.metricsBuffer.length > 100) {
      this.metricsBuffer.shift()
    }
    
    // Check alerts
    await this.checkAlerts(metrics)
    
    return metrics
  }
  
  /**
   * Get dashboard summary
   */
  async getDashboardSummary(): Promise<{
    currentMetrics: SecurityMetrics
    activeAlerts: SecurityAlert[]
    recentIncidents: AuditEvent[]
    trends: {
      authFailureRate: number
      apiErrorRate: number
      threatLevel: 'low' | 'medium' | 'high' | 'critical'
    }
    recommendations: string[]
  }> {
    const currentMetrics = await this.collectMetrics()
    const activeAlerts = Array.from(this.activeAlerts.values())
      .filter(a => a.status === 'active')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    // Get recent security incidents
    const recentIncidents = await auditLogger.query({
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(),
      severities: [AuditSeverity.ERROR, AuditSeverity.CRITICAL],
      limit: 10,
    })
    
    // Calculate trends
    const authFailureRate = currentMetrics.authMetrics.failureCount / 
      (currentMetrics.authMetrics.successCount + currentMetrics.authMetrics.failureCount)
    
    const apiErrorRate = currentMetrics.apiMetrics.errorRate
    
    const threatLevel = this.calculateThreatLevel(currentMetrics, activeAlerts)
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentMetrics,
      activeAlerts,
      threatLevel
    )
    
    return {
      currentMetrics,
      activeAlerts,
      recentIncidents,
      trends: {
        authFailureRate,
        apiErrorRate,
        threatLevel,
      },
      recommendations,
    }
  }
  
  /**
   * Get security timeline
   */
  async getSecurityTimeline(
    hours: number = 24
  ): Promise<{
    timeline: Array<{
      timestamp: Date
      events: AuditEvent[]
      metrics: SecurityMetrics
    }>
    summary: {
      totalEvents: number
      criticalEvents: number
      topEventTypes: Array<{ type: string; count: number }>
    }
  }> {
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000)
    
    // Get all events in timeframe
    const allEvents = await auditLogger.query({
      startDate,
      endDate,
    })
    
    // Group by hour
    const timeline: Array<{
      timestamp: Date
      events: AuditEvent[]
      metrics: SecurityMetrics
    }> = []
    
    for (let i = 0; i < hours; i++) {
      const hourStart = new Date(startDate.getTime() + i * 60 * 60 * 1000)
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000)
      
      const hourEvents = allEvents.filter(e => 
        e.timestamp >= hourStart && e.timestamp < hourEnd
      )
      
      // Find matching metrics from buffer
      const metrics = this.metricsBuffer.find(m =>
        m.timestamp >= hourStart && m.timestamp < hourEnd
      ) || await this.collectMetrics()
      
      timeline.push({
        timestamp: hourStart,
        events: hourEvents,
        metrics,
      })
    }
    
    // Calculate summary
    const criticalEvents = allEvents.filter(e => 
      e.severity === AuditSeverity.CRITICAL
    ).length
    
    const eventTypeCounts = allEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const topEventTypes = Object.entries(eventTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }))
    
    return {
      timeline,
      summary: {
        totalEvents: allEvents.length,
        criticalEvents,
        topEventTypes,
      },
    }
  }
  
  /**
   * Add custom alert
   */
  addAlert(config: AlertConfig): void {
    const id = `${config.metric}-${config.condition}-${config.value}`
    this.alerts.set(id, config)
  }
  
  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(
    alertId: string,
    userId: string
  ): Promise<void> {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) return
    
    alert.status = 'acknowledged'
    
    await auditLogger.log({
      type: AuditEventType.SECURITY_CONFIG_CHANGE,
      severity: AuditSeverity.INFO,
      actor: {
        id: userId,
        type: 'user',
      },
      action: 'Security alert acknowledged',
      result: 'success',
      metadata: {
        alertId,
        alertType: alert.type,
      },
    })
  }
  
  /**
   * Resolve alert
   */
  async resolveAlert(
    alertId: string,
    userId: string,
    resolution?: string
  ): Promise<void> {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) return
    
    alert.status = 'resolved'
    alert.resolvedAt = new Date()
    alert.resolvedBy = userId
    
    await auditLogger.log({
      type: AuditEventType.SECURITY_CONFIG_CHANGE,
      severity: AuditSeverity.INFO,
      actor: {
        id: userId,
        type: 'user',
      },
      action: 'Security alert resolved',
      result: 'success',
      metadata: {
        alertId,
        alertType: alert.type,
        resolution,
      },
    })
  }
  
  /**
   * Check alerts against current metrics
   */
  private async checkAlerts(metrics: SecurityMetrics): Promise<void> {
    for (const [id, config] of this.alerts) {
      const value = this.getMetricValue(metrics, config.metric)
      const triggered = this.evaluateCondition(value, config.condition, config.value)
      
      if (triggered) {
        await this.triggerAlert(id, config, metrics)
      }
    }
  }
  
  /**
   * Trigger an alert
   */
  private async triggerAlert(
    alertId: string,
    config: AlertConfig,
    metrics: SecurityMetrics
  ): Promise<void> {
    // Check cooldown
    const existingAlert = Array.from(this.activeAlerts.values())
      .find(a => 
        a.type === alertId &&
        a.status === 'active' &&
        new Date().getTime() - a.timestamp.getTime() < config.cooldownMinutes * 60 * 1000
      )
    
    if (existingAlert) return
    
    // Create alert
    const alert: SecurityAlert = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: alertId,
      severity: config.severity,
      title: `Security Alert: ${config.metric}`,
      description: `${config.metric} ${config.condition} ${config.value}`,
      metrics: { value: this.getMetricValue(metrics, config.metric) },
      status: 'active',
    }
    
    this.activeAlerts.set(alert.id, alert)
    
    // Execute actions
    for (const action of config.actions) {
      await this.executeAlertAction(action, alert, metrics)
    }
  }
  
  /**
   * Execute alert action
   */
  private async executeAlertAction(
    action: AlertAction,
    alert: SecurityAlert,
    metrics: SecurityMetrics
  ): Promise<void> {
    switch (action.type) {
      case 'log':
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: this.mapAlertSeverity(alert.severity),
          actor: {
            type: 'system',
          },
          action: `Security alert triggered: ${alert.title}`,
          result: 'failure',
          reason: alert.description,
          metadata: {
            alertId: alert.id,
            metrics: alert.metrics,
          },
        })
        break
        
      case 'email':
        // Email implementation would go here
        console.log('[SecurityAlert] Email alert:', alert)
        break
        
      case 'webhook':
        // Webhook implementation would go here
        console.log('[SecurityAlert] Webhook alert:', alert)
        break
        
      case 'block':
        // Blocking implementation would go here
        console.log('[SecurityAlert] Block action:', action.config)
        break
        
      case 'rateLimit':
        // Rate limit adjustment would go here
        console.log('[SecurityAlert] Rate limit action:', action.config)
        break
    }
  }
  
  /**
   * Helper methods
   */
  private countEvents(events: AuditEvent[], type: AuditEventType): number {
    return events.filter(e => e.type === type).length
  }
  
  private countUniqueUsers(events: AuditEvent[]): number {
    const users = new Set(events.map(e => e.actor.id).filter(Boolean))
    return users.size
  }
  
  private countSuspiciousAuth(events: AuditEvent[]): number {
    return events.filter(e => 
      e.type === AuditEventType.AUTH_FAILURE &&
      e.metadata?.suspicious === true
    ).length
  }
  
  private countUnauthorized(events: AuditEvent[]): number {
    return events.filter(e => 
      e.type === AuditEventType.AUTHZ_FAILURE ||
      (e.type === AuditEventType.API_ACCESS && e.metadata?.statusCode === 401)
    ).length
  }
  
  private calculateErrorRate(events: AuditEvent[]): number {
    const apiEvents = events.filter(e => e.type === AuditEventType.API_ACCESS)
    if (apiEvents.length === 0) return 0
    
    const errors = apiEvents.filter(e => 
      e.metadata?.statusCode && e.metadata.statusCode >= 500
    ).length
    
    return errors / apiEvents.length
  }
  
  private groupViolationsByType(events: AuditEvent[]): Record<string, number> {
    const violations = events.filter(e => e.type === AuditEventType.SECURITY_VIOLATION)
    return violations.reduce((acc, e) => {
      const violationType = e.metadata?.violationType as string || 'unknown'
      acc[violationType] = (acc[violationType] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }
  
  private groupEventsBySeverity(events: AuditEvent[]): Record<AuditSeverity, number> {
    return events.reduce((acc, e) => {
      acc[e.severity] = (acc[e.severity] || 0) + 1
      return acc
    }, {} as Record<AuditSeverity, number>)
  }
  
  private async detectBruteForce(events: AuditEvent[]): Promise<number> {
    // Simple brute force detection: multiple failed auth from same IP
    const failedAuths = events.filter(e => e.type === AuditEventType.AUTH_FAILURE)
    const ipCounts = failedAuths.reduce((acc, e) => {
      const ip = e.actor.ip || 'unknown'
      acc[ip] = (acc[ip] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return Object.values(ipCounts).filter(count => count > 5).length
  }
  
  private async detectSqlInjection(events: AuditEvent[]): Promise<number> {
    return events.filter(e => 
      e.metadata?.threat === 'sql_injection' ||
      (e.reason && /sql.*injection/i.test(e.reason))
    ).length
  }
  
  private async detectXss(events: AuditEvent[]): Promise<number> {
    return events.filter(e => 
      e.metadata?.threat === 'xss' ||
      (e.reason && /xss|cross.*site.*script/i.test(e.reason))
    ).length
  }
  
  private async getSuspiciousIps(events: AuditEvent[]): Promise<string[]> {
    const suspiciousIps = new Set<string>()
    
    events.forEach(e => {
      if (
        e.type === AuditEventType.SECURITY_VIOLATION ||
        (e.type === AuditEventType.AUTH_FAILURE && e.metadata?.suspicious)
      ) {
        if (e.actor.ip) {
          suspiciousIps.add(e.actor.ip)
        }
      }
    })
    
    return Array.from(suspiciousIps)
  }
  
  private async detectAnomalies(events: AuditEvent[]): Promise<number> {
    // Simple anomaly detection based on unusual patterns
    let anomalies = 0
    
    // Check for unusual time patterns
    const hourCounts = events.reduce((acc, e) => {
      const hour = e.timestamp.getHours()
      acc[hour] = (acc[hour] || 0) + 1
      return acc
    }, {} as Record<number, number>)
    
    const avgCount = events.length / 24
    anomalies += Object.values(hourCounts)
      .filter(count => count > avgCount * 3).length
    
    return anomalies
  }
  
  private async getCpuUsage(): Promise<number> {
    // Placeholder - would integrate with actual monitoring
    return Math.random() * 100
  }
  
  private async getMemoryUsage(): Promise<number> {
    // Placeholder - would integrate with actual monitoring
    return Math.random() * 100
  }
  
  private async getActiveConnections(): Promise<number> {
    // Placeholder - would integrate with actual monitoring
    return Math.floor(Math.random() * 1000)
  }
  
  private async getQueuedRequests(): Promise<number> {
    // Placeholder - would integrate with actual monitoring
    return Math.floor(Math.random() * 100)
  }
  
  private async getAverageResponseTime(): Promise<number> {
    // Placeholder - would integrate with actual monitoring
    return Math.random() * 500
  }
  
  private getMetricValue(metrics: SecurityMetrics, path: string): any {
    const parts = path.split('.')
    let value: any = metrics
    
    for (const part of parts) {
      value = value[part]
      if (value === undefined) return 0
    }
    
    return value
  }
  
  private evaluateCondition(
    value: any,
    condition: string,
    threshold: any
  ): boolean {
    switch (condition) {
      case 'gt':
        return value > threshold
      case 'lt':
        return value < threshold
      case 'eq':
        return value === threshold
      case 'contains':
        return String(value).includes(String(threshold))
      case 'matches':
        return new RegExp(threshold).test(String(value))
      default:
        return false
    }
  }
  
  private calculateThreatLevel(
    metrics: SecurityMetrics,
    alerts: SecurityAlert[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
    const highAlerts = alerts.filter(a => a.severity === 'high').length
    
    if (criticalAlerts > 0) return 'critical'
    if (highAlerts > 2) return 'critical'
    if (highAlerts > 0) return 'high'
    
    const totalThreats = 
      metrics.threats.bruteForceAttempts +
      metrics.threats.sqlInjectionAttempts +
      metrics.threats.xssAttempts
    
    if (totalThreats > 10) return 'high'
    if (totalThreats > 5) return 'medium'
    
    return 'low'
  }
  
  private generateRecommendations(
    metrics: SecurityMetrics,
    alerts: SecurityAlert[],
    threatLevel: string
  ): string[] {
    const recommendations: string[] = []
    
    // High auth failure rate
    if (metrics.authMetrics.failureCount > metrics.authMetrics.successCount * 0.1) {
      recommendations.push('Consider implementing stricter rate limiting for authentication endpoints')
    }
    
    // Low MFA usage
    if (metrics.authMetrics.mfaUsage < metrics.authMetrics.successCount * 0.5) {
      recommendations.push('Encourage or enforce MFA adoption for better account security')
    }
    
    // High error rate
    if (metrics.apiMetrics.errorRate > 0.05) {
      recommendations.push('Investigate high API error rate - possible system issues')
    }
    
    // Active threats
    if (metrics.threats.bruteForceAttempts > 0) {
      recommendations.push('Active brute force attempts detected - review IP blocking rules')
    }
    
    if (metrics.threats.sqlInjectionAttempts > 0) {
      recommendations.push('SQL injection attempts detected - audit input validation')
    }
    
    // Critical alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical')
    if (criticalAlerts.length > 0) {
      recommendations.push(`Address ${criticalAlerts.length} critical security alerts immediately`)
    }
    
    return recommendations
  }
  
  private mapAlertSeverity(severity: string): AuditSeverity {
    switch (severity) {
      case 'critical':
        return AuditSeverity.CRITICAL
      case 'high':
        return AuditSeverity.ERROR
      case 'medium':
        return AuditSeverity.WARNING
      default:
        return AuditSeverity.INFO
    }
  }
  
  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.flushInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        console.error('[SecurityMonitoring] Metrics collection error:', error)
      })
    }, 60000) // Collect every minute
  }
  
  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
  }
}

// Export default instance
export const securityDashboard = new SecurityMonitoringDashboard()

/**
 * Security monitoring API endpoints
 */
export const securityMonitoringApi = {
  /**
   * Get dashboard summary
   */
  async getDashboard(): Promise<any> {
    return securityDashboard.getDashboardSummary()
  },
  
  /**
   * Get security timeline
   */
  async getTimeline(hours = 24): Promise<any> {
    return securityDashboard.getSecurityTimeline(hours)
  },
  
  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    return securityDashboard.acknowledgeAlert(alertId, userId)
  },
  
  /**
   * Resolve alert
   */
  async resolveAlert(
    alertId: string, 
    userId: string,
    resolution?: string
  ): Promise<void> {
    return securityDashboard.resolveAlert(alertId, userId, resolution)
  },
}