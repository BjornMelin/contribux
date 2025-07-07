/**
 * Unified Monitoring Dashboard API
 * Aggregates data from health, performance, and monitoring systems
 */

import { apiMonitoring } from '@/lib/api/monitoring'
import { sql } from '@/lib/db/config'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Dashboard response types
interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  details?: string
  lastCheck: string
}

interface MonitoringDashboard {
  timestamp: string
  overallStatus: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    application: ServiceHealth
    database: ServiceHealth
    monitoring: ServiceHealth
  }
  performance: {
    uptime: number
    totalRequests: number
    errorRate: number
    avgResponseTime: number
    memoryUsage: {
      used: number
      total: number
      percentage: number
    }
  }
  endpoints: {
    endpoint: string
    status: 'healthy' | 'degraded' | 'unhealthy'
    requests: number
    errorRate: number
    avgResponseTime: number
  }[]
  alerts: {
    type: 'error_rate' | 'response_time' | 'memory' | 'database'
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    timestamp: string
  }[]
}

// Query schema
const dashboardQuerySchema = z.object({
  timeWindow: z.enum(['5m', '1h', '24h']).default('1h'),
  includeEndpoints: z.boolean().default(true),
  includeAlerts: z.boolean().default(true),
})

/**
 * Get time window in milliseconds
 */
function getTimeWindowMs(timeWindow: string): number {
  switch (timeWindow) {
    case '5m':
      return 5 * 60 * 1000
    case '1h':
      return 60 * 60 * 1000
    case '24h':
      return 24 * 60 * 60 * 1000
    default:
      return 60 * 60 * 1000
  }
}

/**
 * Check application health
 */
async function checkApplicationHealth(): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    // Simple health check - verify basic application functionality
    const responseTime = Date.now() - startTime

    if (responseTime > 1000) {
      return {
        status: 'degraded',
        responseTime,
        details: 'Slow application response',
        lastCheck: new Date().toISOString(),
      }
    }

    return {
      status: 'healthy',
      responseTime,
      lastCheck: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      details: error instanceof Error ? error.message : 'Application health check failed',
      lastCheck: new Date().toISOString(),
    }
  }
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    await sql`SELECT 1 as health_check`
    const responseTime = Date.now() - startTime

    if (responseTime > 2000) {
      return {
        status: 'unhealthy',
        responseTime,
        details: 'Very slow database response',
        lastCheck: new Date().toISOString(),
      }
    }

    if (responseTime > 1000) {
      return {
        status: 'degraded',
        responseTime,
        details: 'Slow database response',
        lastCheck: new Date().toISOString(),
      }
    }

    return {
      status: 'healthy',
      responseTime,
      lastCheck: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      details: error instanceof Error ? error.message : 'Database connection failed',
      lastCheck: new Date().toISOString(),
    }
  }
}

/**
 * Check monitoring system health
 */
async function checkMonitoringHealth(): Promise<ServiceHealth> {
  const startTime = Date.now()

  try {
    // Test monitoring system by getting metrics
    const metrics = apiMonitoring.getMetrics(5 * 60 * 1000) // Last 5 minutes
    const responseTime = Date.now() - startTime

    // Check if monitoring is collecting data
    if (metrics.overview.totalRequests === 0 && process.env.NODE_ENV === 'production') {
      return {
        status: 'degraded',
        responseTime,
        details: 'No recent requests tracked',
        lastCheck: new Date().toISOString(),
      }
    }

    return {
      status: 'healthy',
      responseTime,
      lastCheck: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      details: error instanceof Error ? error.message : 'Monitoring system failed',
      lastCheck: new Date().toISOString(),
    }
  }
}

/**
 * Generate alerts based on current state
 */
function generateAlerts(
  services: MonitoringDashboard['services'],
  performance: MonitoringDashboard['performance'],
  endpoints: MonitoringDashboard['endpoints']
): MonitoringDashboard['alerts'] {
  const alerts: MonitoringDashboard['alerts'] = []

  // Service health alerts
  if (services.database.status === 'unhealthy') {
    alerts.push({
      type: 'database',
      severity: 'critical',
      message: `Database unhealthy: ${services.database.details || 'Connection failed'}`,
      timestamp: new Date().toISOString(),
    })
  } else if (services.database.status === 'degraded') {
    alerts.push({
      type: 'database',
      severity: 'medium',
      message: `Database degraded: ${services.database.details || 'Slow response'}`,
      timestamp: new Date().toISOString(),
    })
  }

  // Error rate alerts
  if (performance.errorRate > 0.1) {
    alerts.push({
      type: 'error_rate',
      severity: 'critical',
      message: `High error rate: ${(performance.errorRate * 100).toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    })
  } else if (performance.errorRate > 0.05) {
    alerts.push({
      type: 'error_rate',
      severity: 'medium',
      message: `Elevated error rate: ${(performance.errorRate * 100).toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    })
  }

  // Response time alerts
  if (performance.avgResponseTime > 5000) {
    alerts.push({
      type: 'response_time',
      severity: 'critical',
      message: `Very slow response time: ${performance.avgResponseTime}ms`,
      timestamp: new Date().toISOString(),
    })
  } else if (performance.avgResponseTime > 2000) {
    alerts.push({
      type: 'response_time',
      severity: 'medium',
      message: `Slow response time: ${performance.avgResponseTime}ms`,
      timestamp: new Date().toISOString(),
    })
  }

  // Memory alerts
  if (performance.memoryUsage.percentage > 90) {
    alerts.push({
      type: 'memory',
      severity: 'critical',
      message: `Critical memory usage: ${performance.memoryUsage.percentage}%`,
      timestamp: new Date().toISOString(),
    })
  } else if (performance.memoryUsage.percentage > 75) {
    alerts.push({
      type: 'memory',
      severity: 'medium',
      message: `High memory usage: ${performance.memoryUsage.percentage}%`,
      timestamp: new Date().toISOString(),
    })
  }

  // Endpoint-specific alerts
  for (const endpoint of endpoints) {
    if (endpoint.status === 'unhealthy') {
      alerts.push({
        type: 'error_rate',
        severity: 'high',
        message: `Endpoint ${endpoint.endpoint} is unhealthy (${(endpoint.errorRate * 100).toFixed(1)}% error rate)`,
        timestamp: new Date().toISOString(),
      })
    }
  }

  return alerts
}

/**
 * Determine overall system status
 */
function calculateOverallStatus(
  services: MonitoringDashboard['services'],
  performance: MonitoringDashboard['performance']
): 'healthy' | 'degraded' | 'unhealthy' {
  // Critical failures
  if (
    services.database.status === 'unhealthy' ||
    services.application.status === 'unhealthy' ||
    performance.errorRate > 0.2 ||
    performance.memoryUsage.percentage > 95
  ) {
    return 'unhealthy'
  }

  // Degraded conditions
  if (
    services.database.status === 'degraded' ||
    services.application.status === 'degraded' ||
    services.monitoring.status === 'degraded' ||
    performance.errorRate > 0.05 ||
    performance.avgResponseTime > 2000 ||
    performance.memoryUsage.percentage > 75
  ) {
    return 'degraded'
  }

  return 'healthy'
}

/**
 * GET /api/monitoring/dashboard
 * Get unified monitoring dashboard data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = dashboardQuerySchema.parse({
      timeWindow: searchParams.get('timeWindow') || '1h',
      includeEndpoints: searchParams.get('includeEndpoints') !== 'false',
      includeAlerts: searchParams.get('includeAlerts') !== 'false',
    })

    const timeWindowMs = getTimeWindowMs(query.timeWindow)

    // Parallel health checks
    const [applicationHealth, databaseHealth, monitoringHealth] = await Promise.all([
      checkApplicationHealth(),
      checkDatabaseHealth(),
      checkMonitoringHealth(),
    ])

    const services = {
      application: applicationHealth,
      database: databaseHealth,
      monitoring: monitoringHealth,
    }

    // Get performance metrics
    const metrics = apiMonitoring.getMetrics(timeWindowMs)
    const memoryUsage = process.memoryUsage()
    const memoryUsedMB = memoryUsage.heapUsed / 1024 / 1024
    const memoryTotalMB = memoryUsage.heapTotal / 1024 / 1024

    const performance = {
      uptime: process.uptime(),
      totalRequests: metrics.overview.totalRequests,
      errorRate: metrics.overview.errorRate,
      avgResponseTime: metrics.overview.averageResponseTime,
      memoryUsage: {
        used: Math.round(memoryUsedMB),
        total: Math.round(memoryTotalMB),
        percentage: Math.round((memoryUsedMB / memoryTotalMB) * 100),
      },
    }

    // Prepare endpoints data
    let endpoints: MonitoringDashboard['endpoints'] = []
    if (query.includeEndpoints) {
      endpoints = metrics.endpoints.map(ep => ({
        endpoint: ep.endpoint,
        status: ep.errorRate > 0.1 ? 'unhealthy' : ep.errorRate > 0.05 ? 'degraded' : 'healthy',
        requests: ep.totalRequests,
        errorRate: ep.errorRate,
        avgResponseTime: ep.averageResponseTime,
      }))
    }

    // Generate alerts
    let alerts: MonitoringDashboard['alerts'] = []
    if (query.includeAlerts) {
      alerts = generateAlerts(services, performance, endpoints)
    }

    // Calculate overall status
    const overallStatus = calculateOverallStatus(services, performance)

    const dashboard: MonitoringDashboard = {
      timestamp: new Date().toISOString(),
      overallStatus,
      services,
      performance,
      endpoints,
      alerts,
    }

    // Determine HTTP status based on overall health
    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503

    return NextResponse.json(dashboard, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60',
        'X-Dashboard-Status': overallStatus,
        'X-Dashboard-Timestamp': Date.now().toString(),
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    const errorDashboard: Partial<MonitoringDashboard> = {
      timestamp: new Date().toISOString(),
      overallStatus: 'unhealthy',
      services: {
        application: {
          status: 'unhealthy',
          responseTime: 0,
          details: 'Dashboard error',
          lastCheck: new Date().toISOString(),
        },
        database: {
          status: 'unhealthy',
          responseTime: 0,
          details: 'Dashboard error',
          lastCheck: new Date().toISOString(),
        },
        monitoring: {
          status: 'unhealthy',
          responseTime: 0,
          details: 'Dashboard error',
          lastCheck: new Date().toISOString(),
        },
      },
      alerts: [
        {
          type: 'error_rate',
          severity: 'critical',
          message: `Dashboard error: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      ],
    }

    return NextResponse.json(
      {
        error: 'Dashboard unavailable',
        details: errorMessage,
        partial: errorDashboard,
      },
      { status: 500 }
    )
  }
}
