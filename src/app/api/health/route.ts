/**
 * Health Check API Route
 * Provides system health status for monitoring and load balancers
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { sql } from '@/lib/db/config'

// Health check response schema
const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  version: z.string(),
  checks: z
    .object({
      database: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        response_time_ms: z.number(),
        details: z.string().optional(),
      }),
      memory: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        usage_mb: z.number(),
        free_mb: z.number(),
      }),
    })
    .optional(),
})

export async function GET() {
  const startTime = Date.now()

  try {
    // Database health check
    const dbStartTime = Date.now()
    let dbStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    let dbDetails: string | undefined

    try {
      await sql`SELECT 1 as health_check`
      const dbResponseTime = Date.now() - dbStartTime

      if (dbResponseTime > 1000) {
        dbStatus = 'degraded'
        dbDetails = 'Slow database response'
      }
    } catch (error) {
      dbStatus = 'unhealthy'
      dbDetails = error instanceof Error ? error.message : 'Database connection failed'
    }

    const dbResponseTime = Date.now() - dbStartTime

    // Memory health check
    const memoryUsage = process.memoryUsage()
    const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024)
    const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024)
    const freeMB = totalMB - usedMB

    let memoryStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (usedMB > 500) {
      memoryStatus = 'degraded'
    }
    if (usedMB > 1000) {
      memoryStatus = 'unhealthy'
    }

    // Overall status determination
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (dbStatus === 'degraded' || memoryStatus === 'degraded') {
      overallStatus = 'degraded'
    }
    if (dbStatus === 'unhealthy' || memoryStatus === 'unhealthy') {
      overallStatus = 'unhealthy'
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        database: {
          status: dbStatus,
          response_time_ms: dbResponseTime,
          details: dbDetails,
        },
        memory: {
          status: memoryStatus,
          usage_mb: usedMB,
          free_mb: freeMB,
        },
      },
    }

    // Validate response
    const validatedResponse = HealthResponseSchema.parse(response)

    // Return appropriate HTTP status based on health
    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503

    return NextResponse.json(validatedResponse, { status: httpStatus })
  } catch (error) {
    console.error('Health check error:', error)

    // Return unhealthy status if health check itself fails
    const errorResponse = {
      status: 'unhealthy' as const,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        database: {
          status: 'unhealthy' as const,
          response_time_ms: Date.now() - startTime,
          details: 'Health check failed',
        },
        memory: {
          status: 'unhealthy' as const,
          usage_mb: 0,
          free_mb: 0,
        },
      },
    }

    return NextResponse.json(errorResponse, { status: 503 })
  }
}
