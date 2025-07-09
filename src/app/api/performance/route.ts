/**
 * Performance API Routes
 * Provides endpoints for performance monitoring, optimization, and diagnostics
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiMonitoring } from '@/lib/api/monitoring'
import { sql } from '@/lib/db/config'

// Performance response types
interface PerformanceMetrics {
  timestamp: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptime: number
  memory: NodeJS.MemoryUsage
  requests: {
    total: number
    errorRate: number
    avgResponseTime: number
  }
}

interface PerformanceSummary {
  overview: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    uptime: number
    totalRequests: number
    errorRate: number
    avgResponseTime: number
  }
  system: {
    memory: NodeJS.MemoryUsage
    uptime: number
    nodeVersion: string
    platform: string
  }
  monitoring: {
    endpoints: number
    healthChecks: number
    recentErrors: number
  }
}

// Request schemas
const performanceQuerySchema = z.object({
  detailed: z.boolean().default(false),
  timeWindow: z.enum(['5m', '1h', '24h']).default('1h'),
})

// Helper functions
const getTimeWindowMs = (timeWindow: string): number => {
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

const getSystemStatus = (
  memoryUsage: NodeJS.MemoryUsage,
  errorRate: number
): 'healthy' | 'degraded' | 'unhealthy' => {
  const usedMB = memoryUsage.heapUsed / 1024 / 1024

  if (usedMB > 1000 || errorRate > 0.1) {
    return 'unhealthy'
  }

  if (usedMB > 500 || errorRate > 0.05) {
    return 'degraded'
  }

  return 'healthy'
}

/**
 * Database performance check
 */
async function checkDatabasePerformance(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  details?: string
}> {
  const startTime = Date.now()

  try {
    await sql`SELECT 1 as health_check`
    const responseTime = Date.now() - startTime

    if (responseTime > 2000) {
      return { status: 'unhealthy', responseTime, details: 'Very slow database response' }
    }

    if (responseTime > 1000) {
      return { status: 'degraded', responseTime, details: 'Slow database response' }
    }

    return { status: 'healthy', responseTime }
  } catch (error) {
    const responseTime = Date.now() - startTime
    return {
      status: 'unhealthy',
      responseTime,
      details: error instanceof Error ? error.message : 'Database connection failed',
    }
  }
}

/**
 * GET /api/performance
 * Get performance metrics and health status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = performanceQuerySchema.parse({
      detailed: searchParams.get('detailed') === 'true',
      timeWindow: searchParams.get('timeWindow') || '1h',
    })

    const timeWindowMs = getTimeWindowMs(query.timeWindow)

    // Get metrics from monitoring system
    const metrics = apiMonitoring.getMetrics(timeWindowMs)
    const healthStatus = apiMonitoring.getHealthStatus()
    const errorSummary = apiMonitoring.getErrorSummary(timeWindowMs)

    // Get system metrics
    const memoryUsage = process.memoryUsage()
    const uptime = process.uptime()

    // Check database performance
    const dbPerformance = await checkDatabasePerformance()

    // Calculate overall status
    const status = getSystemStatus(memoryUsage, metrics.overview.errorRate)

    const performanceMetrics: PerformanceMetrics = {
      timestamp: new Date().toISOString(),
      status,
      uptime,
      memory: memoryUsage,
      requests: {
        total: metrics.overview.totalRequests,
        errorRate: metrics.overview.errorRate,
        avgResponseTime: metrics.overview.averageResponseTime,
      },
    }

    if (query.detailed) {
      const detailedResponse: PerformanceSummary = {
        overview: {
          status,
          uptime,
          totalRequests: metrics.overview.totalRequests,
          errorRate: metrics.overview.errorRate,
          avgResponseTime: metrics.overview.averageResponseTime,
        },
        system: {
          memory: memoryUsage,
          uptime,
          nodeVersion: process.version,
          platform: process.platform,
        },
        monitoring: {
          endpoints: metrics.endpoints.length,
          healthChecks: healthStatus.length,
          recentErrors: errorSummary.totalErrors,
        },
      }

      return NextResponse.json(
        {
          ...performanceMetrics,
          details: detailedResponse,
          database: dbPerformance,
          endpoints: metrics.endpoints,
          trends: metrics.trends,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=30, s-maxage=60',
            'X-Performance-Timestamp': Date.now().toString(),
          },
        }
      )
    }

    return NextResponse.json(performanceMetrics, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60',
        'X-Performance-Timestamp': Date.now().toString(),
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        error: 'Performance metrics unavailable',
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
