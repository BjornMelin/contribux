/**
 * Health Check API Endpoint
 *
 * Provides system health status for monitoring and alerting
 */

import {
  checkCacheHealth,
  checkDatabaseHealth,
  checkGitHubHealth,
  checkSystemHealth,
} from '@/lib/telemetry/health'
import { telemetryLogger } from '@/lib/telemetry/logger'
import { createSpan } from '@/lib/telemetry/utils'
import { type NextRequest, NextResponse } from 'next/server'

// Health check result types
interface ComponentHealthResult {
  component: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  healthy: boolean
  message?: string
  metrics?: Record<string, number>
}

interface SystemHealthResult {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  components: ComponentHealthResult[]
  uptime?: number
  version?: string
}

type HealthResult = ComponentHealthResult | SystemHealthResult

export async function GET(request: NextRequest) {
  return createSpan(
    'api.health_check',
    async span => {
      const url = new URL(request.url)
      const component = url.searchParams.get('component')
      const format = url.searchParams.get('format') || 'json'

      span.setAttributes({
        'http.route': '/api/health',
        'http.component': component || 'all',
        'http.format': format,
      })

      telemetryLogger.api('Health check request', {
        path: '/api/health',
        method: 'GET',
        component: component ?? undefined,
        statusCode: 200,
      })

      try {
        const result = await performHealthCheck(component)
        const statusCode = determineStatusCode(result, component)

        if (format === 'prometheus') {
          return createPrometheusResponse(result, statusCode)
        }

        return createJsonResponse(result, statusCode)
      } catch (error) {
        return handleHealthCheckError(error, component)
      }
    },
    {
      'http.method': 'GET',
      'http.route': '/api/health',
    }
  )
}

/**
 * Perform health check based on component
 */
async function performHealthCheck(component: string | null): Promise<HealthResult> {
  switch (component) {
    case 'github':
      return await checkGitHubHealth()
    case 'database':
      return await checkDatabaseHealth()
    case 'cache':
      return await checkCacheHealth()
    default:
      return await checkSystemHealth()
  }
}

/**
 * Determine HTTP status code based on health result
 */
function determineStatusCode(result: HealthResult, component: string | null): number {
  if (component) {
    const componentResult = result as ComponentHealthResult
    if (componentResult.status === 'unhealthy') {
      return 503
    }
    if (componentResult.status === 'degraded') {
      return 200 // Still operational but with issues
    }
    return 200
  }

  const systemResult = result as SystemHealthResult
  if (systemResult.overall === 'unhealthy') {
    return 503
  }
  if (systemResult.overall === 'degraded') {
    return 200 // Still operational but with issues
  }
  return 200
}

/**
 * Create Prometheus format response
 */
function createPrometheusResponse(result: HealthResult, statusCode: number): NextResponse {
  const metricsText = generatePrometheusMetrics(result)
  return new NextResponse(metricsText, {
    status: statusCode,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

/**
 * Create JSON format response
 */
function createJsonResponse(result: HealthResult, statusCode: number): NextResponse {
  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

/**
 * Handle health check errors
 */
function handleHealthCheckError(error: unknown, component: string | null): NextResponse {
  telemetryLogger.error('Health check failed', error, {
    path: '/api/health',
    method: 'GET',
    component: component ?? undefined,
  })

  return NextResponse.json(
    {
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    },
    {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  )
}

/**
 * Generate Prometheus-compatible metrics from health check results
 */
function generatePrometheusMetrics(result: HealthResult): string {
  const timestamp = Date.now()
  let metrics = ''

  // Type guard to check if this is a SystemHealthResult
  if ('components' in result && 'overall' in result) {
    // System-wide health check
    metrics +=
      '# HELP contribux_component_health Health status of system components (1 = healthy, 0 = unhealthy)\n'
    metrics += '# TYPE contribux_component_health gauge\n'

    for (const component of result.components) {
      const value = component.healthy ? 1 : 0
      metrics += `contribux_component_health{component="${component.component}",status="${component.status}"} ${value} ${timestamp}\n`
    }

    metrics +=
      '\n# HELP contribux_system_health Overall system health status (1 = healthy, 0 = unhealthy)\n'
    metrics += '# TYPE contribux_system_health gauge\n'
    const systemValue = result.overall === 'healthy' ? 1 : 0
    metrics += `contribux_system_health{status="${result.overall}"} ${systemValue} ${timestamp}\n`
  } else {
    // Single component health check (ComponentHealthResult)
    metrics +=
      '# HELP contribux_component_health Health status of system components (1 = healthy, 0 = unhealthy)\n'
    metrics += '# TYPE contribux_component_health gauge\n'
    const value = result.healthy ? 1 : 0
    metrics += `contribux_component_health{component="${result.component}",status="${result.status}"} ${value} ${timestamp}\n`
  }

  return metrics
}
