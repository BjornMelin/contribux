/**
 * Health Check API Endpoint
 * 
 * Provides system health status for monitoring and alerting
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkSystemHealth, checkGitHubHealth, checkDatabaseHealth, checkCacheHealth } from '@/lib/telemetry/health'
import { telemetryLogger } from '@/lib/telemetry/logger'
import { createSpan } from '@/lib/telemetry/utils'

export async function GET(request: NextRequest) {
  return createSpan(
    'api.health_check',
    async (span) => {
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
        let result

        // Handle specific component health checks
        switch (component) {
          case 'github':
            result = await checkGitHubHealth()
            break
          case 'database':
            result = await checkDatabaseHealth()
            break
          case 'cache':
            result = await checkCacheHealth()
            break
          default:
            result = await checkSystemHealth()
        }

        // Determine HTTP status code based on health
        let statusCode = 200
        if (component) {
          // Single component check
          const componentResult = result as any
          if (componentResult.status === 'unhealthy') {
            statusCode = 503
          } else if (componentResult.status === 'degraded') {
            statusCode = 200 // Still operational but with issues
          }
        } else {
          // System-wide check
          const systemResult = result as any
          if (systemResult.overall === 'unhealthy') {
            statusCode = 503
          } else if (systemResult.overall === 'degraded') {
            statusCode = 200 // Still operational but with issues
          }
        }

        // Handle different response formats
        if (format === 'prometheus') {
          // Return Prometheus-compatible metrics format
          const metricsText = generatePrometheusMetrics(result)
          return new NextResponse(metricsText, {
            status: statusCode,
            headers: {
              'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          })
        }

        // Default JSON format
        return NextResponse.json(result, {
          status: statusCode,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })
      } catch (error) {
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
    },
    {
      'http.method': 'GET',
      'http.route': '/api/health',
    }
  )
}

/**
 * Generate Prometheus-compatible metrics from health check results
 */
function generatePrometheusMetrics(result: any): string {
  const timestamp = Date.now()
  let metrics = ''

  if (result.components) {
    // System-wide health check
    metrics += '# HELP contribux_component_health Health status of system components (1 = healthy, 0 = unhealthy)\n'
    metrics += '# TYPE contribux_component_health gauge\n'

    for (const component of result.components) {
      const value = component.healthy ? 1 : 0
      metrics += `contribux_component_health{component="${component.component}",status="${component.status}"} ${value} ${timestamp}\n`
    }

    metrics += '\n# HELP contribux_system_health Overall system health status (1 = healthy, 0 = unhealthy)\n'
    metrics += '# TYPE contribux_system_health gauge\n'
    const systemValue = result.overall === 'healthy' ? 1 : 0
    metrics += `contribux_system_health{status="${result.overall}"} ${systemValue} ${timestamp}\n`
  } else {
    // Single component health check
    metrics += '# HELP contribux_component_health Health status of system components (1 = healthy, 0 = unhealthy)\n'
    metrics += '# TYPE contribux_component_health gauge\n'
    const value = result.healthy ? 1 : 0
    metrics += `contribux_component_health{component="${result.component}",status="${result.status}"} ${value} ${timestamp}\n`
  }

  return metrics
}