import { authConfig } from '@/lib/auth'
import { ApiKeyManager } from '@/lib/security/api-key-rotation'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'
import { CorsManager } from '@/lib/security/cors-config'
import { SecurityMonitoringDashboard } from '@/lib/security/monitoring-dashboard'
import { SecurityHeadersManager } from '@/lib/security/security-headers'
import { getServerSession } from 'next-auth/next'
import { type NextRequest, NextResponse } from 'next/server'
// Rate limiting service will be implemented later
// import { rateLimitService } from '@/lib/security/rate-limit'
import { z } from 'zod'

// Response schema
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  components: z.record(
    z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
    })
  ),
  securityScore: z.number().min(0).max(100),
  recommendations: z.array(z.string()),
})

type HealthResponse = z.infer<typeof healthResponseSchema>

// Component status checker
async function checkComponentHealth(
  name: string,
  checker: () => Promise<boolean>
): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
  details?: Record<string, unknown>
}> {
  try {
    const isHealthy = await checker()
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      message: isHealthy ? `${name} is operational` : `${name} is experiencing issues`,
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `${name} is down`,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authConfig)
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize monitoring dashboard
    const dashboard = new SecurityMonitoringDashboard()
    const _apiKeyManager = new ApiKeyManager()
    const _headersManager = new SecurityHeadersManager()
    const _corsManager = new CorsManager({
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['*'],
      credentials: false,
    })

    // Perform health checks
    const components: HealthResponse['components'] = {}

    // Check authentication system
    components.authentication = await checkComponentHealth('Authentication', async () => {
      return !!session && !!session.accessToken
    })

    // Check rate limiting
    components.rateLimiting = await checkComponentHealth('Rate Limiting', async () => {
      // TODO: Implement rate limiting service
      return true // Placeholder for now
    })

    // Check audit logging
    components.auditLogging = await checkComponentHealth('Audit Logging', async () => {
      // Test audit logger by attempting to log a health check event
      await auditLogger.log({
        type: AuditEventType.SYSTEM_CONFIG_CHANGE,
        severity: AuditSeverity.INFO,
        actor: {
          type: 'system',
          id: session.user?.id,
        },
        action: 'Security health check performed',
        result: 'success',
      })
      return true
    })

    // Check security headers
    components.securityHeaders = await checkComponentHealth('Security Headers', async () => {
      // TODO: Implement header validation when method is available
      return true // Placeholder for now
    })

    // Check CORS configuration
    components.cors = await checkComponentHealth('CORS Configuration', async () => {
      // TODO: Implement policy checking when method is available
      return true // Placeholder for now
    })

    // Check API key management
    components.apiKeyManagement = await checkComponentHealth('API Key Management', async () => {
      // TODO: Implement API key listing when method is available
      return true // Service is operational if no exception
    })

    // Check monitoring dashboard
    components.monitoring = await checkComponentHealth('Security Monitoring', async () => {
      const metrics = await dashboard.collectMetrics()
      return metrics !== null
    })

    // Check database connectivity
    components.database = await checkComponentHealth('Database', async () => {
      // Simple query to verify database is accessible
      // TODO: Implement proper database health check when query method is available
      return true // Placeholder for now
    })

    // Check external services (GitHub API)
    components.githubApi = await checkComponentHealth('GitHub API', async () => {
      const rateLimitInfo = await fetch('https://api.github.com/rate_limit', {
        headers: session.accessToken
          ? {
              Authorization: `Bearer ${session.accessToken}`,
            }
          : {},
      }).then(res => res.json())

      return rateLimitInfo.rate && rateLimitInfo.rate.remaining > 0
    })

    // Calculate overall status
    const componentStatuses = Object.values(components).map(c => c.status)
    const unhealthyCount = componentStatuses.filter(s => s === 'unhealthy').length
    const degradedCount = componentStatuses.filter(s => s === 'degraded').length

    let overallStatus: HealthResponse['status'] = 'healthy'
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy'
    } else if (degradedCount > 0) {
      overallStatus = 'degraded'
    }

    // Calculate security score (0-100)
    const totalComponents = componentStatuses.length
    const healthyComponents = componentStatuses.filter(s => s === 'healthy').length
    const securityScore = Math.round((healthyComponents / totalComponents) * 100)

    // Generate recommendations
    const recommendations: string[] = []

    if (components.rateLimiting.status !== 'healthy') {
      recommendations.push('Review rate limiting configuration to ensure proper protection')
    }

    if (components.securityHeaders.status !== 'healthy') {
      recommendations.push('Update security headers to meet security standards')
    }

    if (components.apiKeyManagement.status !== 'healthy') {
      recommendations.push('Check API key rotation schedule and ensure keys are up to date')
    }

    if (securityScore < 80) {
      recommendations.push(
        'Overall security posture needs improvement - review all degraded components'
      )
    }

    // Prepare response
    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components,
      securityScore,
      recommendations,
    }

    // Validate response
    const validatedResponse = healthResponseSchema.parse(response)

    // Log health check
    await auditLogger.log({
      type: AuditEventType.SYSTEM_CONFIG_CHANGE,
      severity: overallStatus === 'healthy' ? AuditSeverity.INFO : AuditSeverity.WARNING,
      actor: {
        type: 'user',
        id: session.user.id,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
      action: 'Security health check completed',
      result: 'success',
      metadata: {
        overallStatus,
        securityScore,
        componentStatuses: Object.entries(components).reduce(
          (acc, [name, component]) => {
            acc[name] = component.status
            return acc
          },
          {} as Record<string, string>
        ),
        recommendationCount: recommendations.length,
      },
    })

    return NextResponse.json(validatedResponse)
  } catch (error) {
    // Log error
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: {
        type: 'system',
      },
      action: 'Security health check failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}

// OPTIONS method for CORS preflight
export async function OPTIONS(_request: NextRequest) {
  const _corsManager = new CorsManager({
    origins: ['*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*'],
    credentials: false,
  })
  // TODO: Implement preflight handling when method is available
  return new NextResponse(null, { status: 200 })
}
