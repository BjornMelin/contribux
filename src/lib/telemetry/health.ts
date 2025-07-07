/**
 * Health Check System with OpenTelemetry Integration
 * 
 * Monitors the health of various system components and exposes metrics
 */

import { createSpan, createDatabaseSpan, createGitHubSpan } from './utils'
import { telemetryLogger } from './logger'
import { InstrumentedGitHubClient } from '@/lib/github/instrumented-client'
import { meter } from '@opentelemetry/api'

// Health check metrics
const healthCheckGauge = meter.createUpDownCounter('component_health_status', {
  description: 'Health status of system components (1 = healthy, 0 = unhealthy)',
})

const healthCheckDurationHistogram = meter.createHistogram('health_check_duration_ms', {
  description: 'Duration of health checks in milliseconds',
})

export interface HealthCheckResult {
  component: string
  healthy: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  message?: string
  details?: Record<string, unknown>
  duration: number
  timestamp: string
}

export interface SystemHealthResult {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  components: HealthCheckResult[]
  timestamp: string
}

/**
 * Health check for GitHub API connectivity
 */
export async function checkGitHubHealth(): Promise<HealthCheckResult> {
  return createGitHubSpan(
    'health_check',
    async (span) => {
      const startTime = Date.now()
      const component = 'github_api'
      
      try {
        // Try to create a client and perform a health check
        const client = await InstrumentedGitHubClient.fromSession()
        const healthResult = await client.healthCheck()
        
        const duration = Date.now() - startTime
        
        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
        let message = 'GitHub API is accessible'
        
        if (healthResult.rateLimit) {
          const rateLimitPercentage = (healthResult.rateLimit.remaining / healthResult.rateLimit.limit) * 100
          span.setAttributes({
            'github.rate_limit.percentage': rateLimitPercentage,
            'github.rate_limit.remaining': healthResult.rateLimit.remaining,
          })
          
          if (rateLimitPercentage < 10) {
            status = 'degraded'
            message = 'GitHub API rate limit is low'
          } else if (rateLimitPercentage < 5) {
            status = 'unhealthy'
            message = 'GitHub API rate limit critically low'
          }
        }

        const result: HealthCheckResult = {
          component,
          healthy: healthResult.healthy && status !== 'unhealthy',
          status,
          message,
          details: healthResult.rateLimit,
          duration,
          timestamp: new Date().toISOString(),
        }

        // Record metrics
        healthCheckGauge.add(result.healthy ? 1 : 0, { component })
        healthCheckDurationHistogram.record(duration, { component })

        telemetryLogger.githubApi('GitHub health check completed', {
          operation: 'health_check',
          duration,
          status: result.status,
          rateLimitRemaining: healthResult.rateLimit?.remaining,
        })

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        const result: HealthCheckResult = {
          component,
          healthy: false,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
          timestamp: new Date().toISOString(),
        }

        // Record metrics
        healthCheckGauge.add(0, { component })
        healthCheckDurationHistogram.record(duration, { component })

        telemetryLogger.githubApi('GitHub health check failed', {
          operation: 'health_check',
          duration,
          status: 'unhealthy',
          statusCode: 500,
        })

        return result
      }
    }
  )
}

/**
 * Health check for database connectivity
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  return createDatabaseSpan(
    'health_check',
    async (span) => {
      const startTime = Date.now()
      const component = 'database'
      
      try {
        // Import database client dynamically to avoid circular dependencies
        const { sql } = await import('@/lib/db')
        
        // Simple connectivity test
        await sql`SELECT 1 as health_check`
        
        const duration = Date.now() - startTime
        
        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
        let message = 'Database is accessible'
        
        // Check if query took too long
        if (duration > 1000) {
          status = 'degraded'
          message = 'Database is slow to respond'
        } else if (duration > 5000) {
          status = 'unhealthy'
          message = 'Database response time is critical'
        }

        const result: HealthCheckResult = {
          component,
          healthy: status !== 'unhealthy',
          status,
          message,
          details: { query_duration_ms: duration },
          duration,
          timestamp: new Date().toISOString(),
        }

        // Record metrics
        healthCheckGauge.add(result.healthy ? 1 : 0, { component })
        healthCheckDurationHistogram.record(duration, { component })

        telemetryLogger.database('Database health check completed', {
          operation: 'health_check',
          duration,
          success: true,
        })

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        const result: HealthCheckResult = {
          component,
          healthy: false,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
          timestamp: new Date().toISOString(),
        }

        // Record metrics
        healthCheckGauge.add(0, { component })
        healthCheckDurationHistogram.record(duration, { component })

        telemetryLogger.database('Database health check failed', {
          operation: 'health_check',
          duration,
          success: false,
        })

        return result
      }
    }
  )
}

/**
 * Health check for cache (Redis) connectivity
 */
export async function checkCacheHealth(): Promise<HealthCheckResult> {
  return createSpan(
    'cache.health_check',
    async (span) => {
      const startTime = Date.now()
      const component = 'cache'
      
      try {
        // Import Redis client dynamically
        const { redis } = await import('@/lib/cache/redis')
        
        // Simple ping test
        const pong = await redis.ping()
        
        const duration = Date.now() - startTime
        
        const isHealthy = pong === 'PONG'
        
        const result: HealthCheckResult = {
          component,
          healthy: isHealthy,
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: isHealthy ? 'Cache is accessible' : 'Cache ping failed',
          details: { ping_response: pong },
          duration,
          timestamp: new Date().toISOString(),
        }

        // Record metrics
        healthCheckGauge.add(result.healthy ? 1 : 0, { component })
        healthCheckDurationHistogram.record(duration, { component })

        telemetryLogger.cache('Cache health check completed', {
          operation: 'ping',
          key: 'health_check',
        })

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        const result: HealthCheckResult = {
          component,
          healthy: false,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Cache unavailable',
          duration,
          timestamp: new Date().toISOString(),
        }

        // Record metrics
        healthCheckGauge.add(0, { component })
        healthCheckDurationHistogram.record(duration, { component })

        telemetryLogger.cache('Cache health check failed', {
          operation: 'ping',
          key: 'health_check',
        })

        return result
      }
    },
    {
      'service.component': 'cache',
      'cache.operation': 'health_check',
    }
  )
}

/**
 * Comprehensive system health check
 */
export async function checkSystemHealth(): Promise<SystemHealthResult> {
  return createSpan(
    'system.health_check',
    async (span) => {
      telemetryLogger.info('Starting system health check')
      
      const startTime = Date.now()
      
      // Run all health checks in parallel
      const [githubHealth, databaseHealth, cacheHealth] = await Promise.allSettled([
        checkGitHubHealth(),
        checkDatabaseHealth(),
        checkCacheHealth(),
      ])

      const components: HealthCheckResult[] = []
      
      // Process GitHub health check result
      if (githubHealth.status === 'fulfilled') {
        components.push(githubHealth.value)
      } else {
        components.push({
          component: 'github_api',
          healthy: false,
          status: 'unhealthy',
          message: 'Health check failed to execute',
          duration: 0,
          timestamp: new Date().toISOString(),
        })
      }

      // Process database health check result
      if (databaseHealth.status === 'fulfilled') {
        components.push(databaseHealth.value)
      } else {
        components.push({
          component: 'database',
          healthy: false,
          status: 'unhealthy',
          message: 'Health check failed to execute',
          duration: 0,
          timestamp: new Date().toISOString(),
        })
      }

      // Process cache health check result
      if (cacheHealth.status === 'fulfilled') {
        components.push(cacheHealth.value)
      } else {
        components.push({
          component: 'cache',
          healthy: false,
          status: 'unhealthy',
          message: 'Health check failed to execute',
          duration: 0,
          timestamp: new Date().toISOString(),
        })
      }

      // Determine overall system health
      const unhealthyComponents = components.filter(c => c.status === 'unhealthy')
      const degradedComponents = components.filter(c => c.status === 'degraded')
      
      let overall: 'healthy' | 'degraded' | 'unhealthy'
      if (unhealthyComponents.length > 0) {
        overall = 'unhealthy'
      } else if (degradedComponents.length > 0) {
        overall = 'degraded'
      } else {
        overall = 'healthy'
      }

      const duration = Date.now() - startTime
      
      const result: SystemHealthResult = {
        overall,
        components,
        timestamp: new Date().toISOString(),
      }

      span.setAttributes({
        'system.health.overall': overall,
        'system.health.unhealthy_count': unhealthyComponents.length,
        'system.health.degraded_count': degradedComponents.length,
        'system.health.healthy_count': components.filter(c => c.status === 'healthy').length,
      })

      telemetryLogger.info('System health check completed', {
        duration,
        overall,
        components: components.length,
        unhealthy: unhealthyComponents.length,
        degraded: degradedComponents.length,
      })

      return result
    },
    {
      'service.component': 'system',
      'health.operation': 'comprehensive_check',
    }
  )
}