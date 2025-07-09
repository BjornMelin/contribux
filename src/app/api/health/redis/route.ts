/**
 * Redis Health Check API Route
 * Monitors Redis connection and rate limiting health
 */

import { NextResponse } from 'next/server'
import { checkRedisHealth } from '@/lib/cache/redis'
import {
  apiRateLimiter,
  authRateLimiter,
  checkRateLimit,
  searchRateLimiter,
} from '@/lib/security/rate-limiter'

/**
 * GET /api/health/redis
 * Check Redis and rate limiting health status
 */
export async function GET() {
  try {
    // Check Redis connection
    const redisHealth = await checkRedisHealth()

    // Test rate limiters
    const testId = `health-check-${Date.now()}`
    const [authCheck, apiCheck, searchCheck] = await Promise.all([
      checkRateLimit(authRateLimiter, testId),
      checkRateLimit(apiRateLimiter, testId),
      checkRateLimit(searchRateLimiter, testId),
    ])

    const rateLimiterHealth = {
      auth: {
        operational: authCheck.success || authCheck.remaining === 0,
        limit: authCheck.limit,
        remaining: authCheck.remaining,
      },
      api: {
        operational: apiCheck.success || apiCheck.remaining === 0,
        limit: apiCheck.limit,
        remaining: apiCheck.remaining,
      },
      search: {
        operational: searchCheck.success || searchCheck.remaining === 0,
        limit: searchCheck.limit,
        remaining: searchCheck.remaining,
      },
    }

    const allHealthy =
      redisHealth.status === 'healthy' &&
      rateLimiterHealth.auth.operational &&
      rateLimiterHealth.api.operational &&
      rateLimiterHealth.search.operational

    return NextResponse.json(
      {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        redis: redisHealth,
        rateLimiters: rateLimiterHealth,
        upstashConfigured: !!(
          process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ),
      },
      {
        status: allHealthy ? 200 : 503,
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 503,
      }
    )
  }
}
