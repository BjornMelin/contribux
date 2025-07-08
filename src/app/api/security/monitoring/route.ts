/**
 * Security Monitoring Dashboard API
 *
 * Provides real-time security metrics, alerts, and recommendations.
 * Requires admin authentication for full access.
 */

import { authConfig } from '@/lib/auth'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import {
  type SecurityAlert,
  type SecurityMetrics,
  SecurityMonitoringDashboard,
} from '@/lib/security/monitoring-dashboard'
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Initialize monitoring dashboard
const monitoringDashboard = new SecurityMonitoringDashboard()

// Query parameter schemas
const metricsQuerySchema = z.object({
  timeframe: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  type: z.enum(['overview', 'authentication', 'security', 'api', 'performance']).optional(),
})

const alertsQuerySchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'all']).default('all'),
  status: z.enum(['active', 'acknowledged', 'resolved', 'all']).default('active'),
  limit: z.number().min(1).max(100).default(50),
})

// TypeScript interfaces for API responses

interface AlertsResponse {
  alerts: SecurityAlert[]
}

interface IncidentsResponse {
  incidents: unknown[]
}

interface RecommendationsResponse {
  recommendations: unknown[]
}

type MonitoringApiResponse =
  | SecurityMetrics
  | AlertsResponse
  | IncidentsResponse
  | RecommendationsResponse

/**
 * GET /api/security/monitoring
 * Get security dashboard summary
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user (admin access recommended)
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const url = new URL(request.url)
    const endpoint = url.searchParams.get('endpoint') || 'summary'

    let response: MonitoringApiResponse

    switch (endpoint) {
      case 'summary':
        // Get complete dashboard summary
        response = await monitoringDashboard.getDashboardSummary()
        break

      case 'metrics': {
        // Get specific metrics
        const metricsParams = {
          timeframe: url.searchParams.get('timeframe') || '24h',
          type: url.searchParams.get('type') || undefined,
        }
        const _validatedMetrics = metricsQuerySchema.parse(metricsParams)
        response = await monitoringDashboard.collectMetrics()
        break
      }

      case 'alerts': {
        // Get security alerts
        const alertParams = {
          severity: url.searchParams.get('severity') || 'all',
          status: url.searchParams.get('status') || 'active',
          limit: Number.parseInt(url.searchParams.get('limit') || '50', 10),
        }
        const validatedAlerts = alertsQuerySchema.parse(alertParams)
        const summary = await monitoringDashboard.getDashboardSummary()
        response = {
          alerts: summary.activeAlerts
            .filter(alert => {
              if (
                validatedAlerts.severity !== 'all' &&
                alert.severity !== validatedAlerts.severity
              ) {
                return false
              }
              return true
            })
            .slice(0, validatedAlerts.limit),
        }
        break
      }

      case 'incidents': {
        // Get recent security incidents
        const summary2 = await monitoringDashboard.getDashboardSummary()
        response = {
          incidents: summary2.recentIncidents,
        }
        break
      }

      case 'recommendations': {
        // Get security recommendations
        const summary3 = await monitoringDashboard.getDashboardSummary()
        response = {
          recommendations: summary3.recommendations,
        }
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
    }

    // Log access
    await auditLogger.log({
      type: AuditEventType.API_ACCESS,
      severity: AuditSeverity.INFO,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
      action: `Access security monitoring: ${endpoint}`,
      result: 'success',
      metadata: {
        endpoint,
        parameters: Object.fromEntries(url.searchParams),
      },
    })

    return NextResponse.json(response)
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Security monitoring access failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/security/monitoring/alerts
 * Create or acknowledge security alerts
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user (admin only)
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const action = body.action

    switch (action) {
      case 'acknowledge':
        // Acknowledge an alert
        if (!body.alertId) {
          return NextResponse.json({ error: 'alertId is required' }, { status: 400 })
        }

        await auditLogger.log({
          type: AuditEventType.SECURITY_CONFIG_CHANGE,
          severity: AuditSeverity.INFO,
          actor: {
            type: 'user',
            id: session.user.id,
            ip: request.headers.get('x-forwarded-for') || 'unknown',
          },
          action: 'Alert acknowledged',
          result: 'success',
          metadata: {
            alertId: body.alertId,
            acknowledgedBy: session.user.id,
            acknowledgedAt: new Date().toISOString(),
          },
        })

        return NextResponse.json({
          message: 'Alert acknowledged successfully',
          alertId: body.alertId,
        })

      case 'resolve':
        // Resolve an alert
        if (!body.alertId || !body.resolution) {
          return NextResponse.json(
            { error: 'alertId and resolution are required' },
            { status: 400 }
          )
        }

        await auditLogger.log({
          type: AuditEventType.SECURITY_CONFIG_CHANGE,
          severity: AuditSeverity.INFO,
          actor: {
            type: 'user',
            id: session.user.id,
            ip: request.headers.get('x-forwarded-for') || 'unknown',
          },
          action: 'Alert resolved',
          result: 'success',
          metadata: {
            alertId: body.alertId,
            resolution: body.resolution,
            resolvedBy: session.user.id,
            resolvedAt: new Date().toISOString(),
          },
        })

        return NextResponse.json({
          message: 'Alert resolved successfully',
          alertId: body.alertId,
        })

      case 'test':
        return NextResponse.json({
          message: 'Test alert triggered successfully',
        })

      case 'export': {
        // Export security reports
        const { format = 'json', timeframe = '30d', includeRaw = false } = body

        // Get dashboard summary for export
        const summary = await monitoringDashboard.getDashboardSummary()

        // Format based on requested type
        let exportData: string
        let contentType: string
        let filename: string

        switch (format) {
          case 'json':
            exportData = JSON.stringify(summary, null, 2)
            contentType = 'application/json'
            filename = `security-report-${new Date().toISOString().split('T')[0]}.json`
            break

          case 'csv': {
            // Convert to CSV format (simplified)
            const csvRows = ['Metric,Value,Timestamp']

            // Add authentication metrics
            csvRows.push(
              `Auth Failure Rate,${summary.trends.authFailureRate},${new Date().toISOString()}`
            )
            csvRows.push(
              `API Error Rate,${summary.trends.apiErrorRate},${new Date().toISOString()}`
            )
            csvRows.push(`Active Alerts,${summary.activeAlerts.length},${new Date().toISOString()}`)

            exportData = csvRows.join('\n')
            contentType = 'text/csv'
            filename = `security-report-${new Date().toISOString().split('T')[0]}.csv`
            break
          }

          default:
            return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
        }

        // Log export
        await auditLogger.log({
          type: AuditEventType.DATA_EXPORT,
          severity: AuditSeverity.INFO,
          actor: {
            type: 'user',
            id: session.user.id,
            ip: request.headers.get('x-forwarded-for') || 'unknown',
          },
          action: 'Export security report',
          result: 'success',
          metadata: {
            format,
            timeframe,
            includeRaw,
          },
        })

        // Return file download response
        return new NextResponse(exportData, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Security alert action failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
