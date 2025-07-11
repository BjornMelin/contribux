/**
 * Production Health Check Endpoint
 * Validates deployment status, database connectivity, and service health
 * Enhanced with Zod 3.x Enterprise Validation Patterns
 */

import { neon } from '@neondatabase/serverless'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createEnterpriseValidationMiddleware,
  formatValidationErrorsForAPI,
  ValidationPerformanceMonitor,
} from '@/lib/validation/enterprise-schemas'

// Modern Zod 3.x Health Status Schema with Enterprise Patterns
const HealthStatusSchema = z
  .object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.string().datetime(),
    version: z.string().min(1),
    environment: z.string().min(1),
    services: z.object({
      database: z.object({
        status: z.enum(['connected', 'disconnected', 'error']),
        latency: z.number().min(0).optional(),
        error: z.string().optional(),
      }),
      memory: z.object({
        used: z.number().min(0),
        total: z.number().min(0),
        percentage: z.number().min(0).max(100),
      }),
      deployment: z.object({
        build_time: z.string().min(1),
        commit_hash: z.string().min(1),
        branch: z.string().min(1),
      }),
    }),
    uptime: z.number().min(0),
    response_time_ms: z.number().min(0),
    request_id: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    // Business logic validation for health status consistency
    if (data.status === 'unhealthy' && data.services.database.status === 'connected') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Health status cannot be unhealthy when database is connected',
        path: ['status'],
      })
    }

    if (data.services.memory.percentage > 95 && data.status === 'healthy') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cannot be healthy with critically high memory usage',
        path: ['status'],
      })
    }

    // Validate latency is present when database is connected
    if (
      data.services.database.status === 'connected' &&
      data.services.database.latency === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Latency must be provided when database is connected',
        path: ['services', 'database', 'latency'],
      })
    }
  })

// Create enterprise validation middleware for health responses
const validateHealthResponse = createEnterpriseValidationMiddleware(HealthStatusSchema, {
  enablePerformanceMonitoring: true,
  errorFormatter: (error: z.ZodError) => {
    const formatted = formatValidationErrorsForAPI(error)
    return formatted.field_errors
  },
})

// Type inference from Zod schema
type HealthStatus = z.infer<typeof HealthStatusSchema>

// Helper function to check database connectivity
async function checkDatabaseHealth(): Promise<{
  status: 'connected' | 'disconnected' | 'error'
  latency?: number
  error?: string
}> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return {
      status: 'error',
      error: 'DATABASE_URL not configured',
    }
  }

  try {
    const sql = neon(databaseUrl)
    const dbStartTime = Date.now()
    await sql`SELECT 1 as status`
    const dbLatency = Date.now() - dbStartTime

    return {
      status: 'connected',
      latency: dbLatency,
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown database error',
    }
  }
}

// Helper function to check memory usage
function checkMemoryHealth(): { used: number; total: number; percentage: number } {
  try {
    const memoryUsage = process.memoryUsage()
    return {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    }
  } catch {
    return { used: 0, total: 0, percentage: 0 }
  }
}

// Helper function to determine overall health status
function determineHealthStatus(
  databaseStatus: string,
  memoryPercentage: number
): 'healthy' | 'degraded' | 'unhealthy' {
  if (databaseStatus === 'error') {
    return 'unhealthy'
  }
  if (databaseStatus === 'error' && memoryPercentage > 90) {
    return 'degraded'
  }
  if (memoryPercentage > 90) {
    return 'degraded'
  }
  return 'healthy'
}

// Helper function to get HTTP status code from health status
function getHttpStatusCode(healthStatus: string): number {
  switch (healthStatus) {
    case 'unhealthy':
      return 503
    case 'degraded':
      return 200
    default:
      return 200
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  try {
    // Track health check performance
    const healthCheckResult = await ValidationPerformanceMonitor.track('health-check', async () => {
      // Initialize basic health status
      const healthStatus: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'unknown',
        services: {
          database: { status: 'disconnected' },
          memory: { used: 0, total: 0, percentage: 0 },
          deployment: {
            build_time: process.env.VERCEL_GIT_COMMIT_MESSAGE || 'unknown',
            commit_hash: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
            branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
          },
        },
        uptime: process.uptime(),
        response_time_ms: 1, // Temporary placeholder, will be updated
        request_id: requestId,
      }

      // Perform health checks
      const databaseHealth = await checkDatabaseHealth()
      const memoryHealth = checkMemoryHealth()

      healthStatus.services.database = databaseHealth
      healthStatus.services.memory = memoryHealth
      healthStatus.status = determineHealthStatus(databaseHealth.status, memoryHealth.percentage)
      // Don't set response_time_ms here yet, will be set after validation

      return healthStatus
    })

    // Set final response time and validate health response using enterprise patterns
    healthCheckResult.response_time_ms = Date.now() - startTime
    const validatedHealth = await validateHealthResponse(healthCheckResult)
    const httpStatus = getHttpStatusCode(validatedHealth.status)

    return NextResponse.json(validatedHealth, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${validatedHealth.response_time_ms}ms`,
        'X-Health-Status': validatedHealth.status,
        'X-Request-ID': requestId,
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    // Critical health check failure with structured error response
    if (error instanceof z.ZodError) {
      // Validation error in health check response
      const formattedErrors = formatValidationErrorsForAPI(error)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'HEALTH_CHECK_VALIDATION_FAILED',
            message: 'Health check response validation failed',
            type: 'validation',
            field_errors: formattedErrors.field_errors,
          },
          metadata: {
            request_id: requestId,
            timestamp: new Date().toISOString(),
            version: 'v1.0.0',
          },
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Health-Status': 'unhealthy',
            'X-Request-ID': requestId,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    // General health check failure
    const errorStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      error: error instanceof Error ? error.message : 'Health check failed',
      request_id: requestId,
      response_time_ms: Date.now() - startTime,
    }

    return NextResponse.json(errorStatus, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': 'unhealthy',
        'X-Request-ID': requestId,
        'Content-Type': 'application/json',
      },
    })
  }
}

// Support HEAD requests for simple health checks
export async function HEAD(_request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID()

  try {
    // Quick database connectivity check with performance tracking
    const healthResult = await ValidationPerformanceMonitor.track('health-check-head', async () => {
      const databaseUrl = process.env.DATABASE_URL
      if (databaseUrl) {
        const sql = neon(databaseUrl)
        await sql`SELECT 1`
      }
      return 'healthy'
    })

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Health-Status': healthResult,
        'X-Request-ID': requestId,
      },
    })
  } catch (_error) {
    return new NextResponse(null, {
      status: 503,
      headers: {
        'X-Health-Status': 'unhealthy',
        'X-Request-ID': requestId,
      },
    })
  }
}
