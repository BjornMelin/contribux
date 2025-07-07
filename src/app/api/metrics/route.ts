/**
 * Prometheus Metrics API Endpoint
 * 
 * Exposes application metrics in Prometheus format for monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { register } from 'prom-client'
import { telemetryLogger } from '@/lib/telemetry/logger'
import { createSpan } from '@/lib/telemetry/utils'

export async function GET(request: NextRequest) {
  return createSpan(
    'api.metrics',
    async (span) => {
      span.setAttributes({
        'http.route': '/api/metrics',
        'http.method': 'GET',
      })

      telemetryLogger.api('Metrics request', {
        path: '/api/metrics',
        method: 'GET',
        statusCode: 200,
      })

      try {
        // Get metrics from the default Prometheus registry
        const metrics = await register.metrics()

        return new NextResponse(metrics, {
          status: 200,
          headers: {
            'Content-Type': register.contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        })
      } catch (error) {
        telemetryLogger.error('Metrics collection failed', error, {
          path: '/api/metrics',
          method: 'GET',
        })

        return NextResponse.json(
          {
            error: 'Metrics collection failed',
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
      'http.route': '/api/metrics',
    }
  )
}