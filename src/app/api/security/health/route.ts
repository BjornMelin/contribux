import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { SecurityHeadersManager } from '@/lib/security/security-headers'
import { CorsManager } from '@/lib/security/cors-config'
import { ApiKeyManager } from '@/lib/security/api-key-rotation'
import { SecurityMonitoringDashboard } from '@/lib/security/monitoring-dashboard'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'
import { env } from '@/lib/validation/env'
import { rateLimitService } from '@/lib/security/rate-limit'
import { z } from 'zod'

// Response schema
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  components: z.record(z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    message: z.string(),
    details: z.record(z.any()).optional()
  })),
  securityScore: z.number().min(0).max(100),
  recommendations: z.array(z.string())
})

type HealthResponse = z.infer<typeof healthResponseSchema>

// Component status checker
async function checkComponentHealth(name: string, checker: () => Promise<boolean>): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
  details?: Record<string, any>
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
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Initialize monitoring dashboard
    const dashboard = new SecurityMonitoringDashboard()
    const apiKeyManager = new ApiKeyManager()
    const headersManager = new SecurityHeadersManager()
    const corsManager = new CorsManager()

    // Perform health checks
    const components: HealthResponse['components'] = {}

    // Check authentication system
    components['authentication'] = await checkComponentHealth('Authentication', async () => {
      return !!session && !!session.accessToken
    })

    // Check rate limiting
    components['rateLimiting'] = await checkComponentHealth('Rate Limiting', async () => {
      const stats = await rateLimitService.getStats()
      return stats !== null && !stats.blocked
    })

    // Check audit logging
    components['auditLogging'] = await checkComponentHealth('Audit Logging', async () => {
      // Test audit logger by attempting to log a health check event
      await auditLogger.log({
        type: AuditEventType.SYSTEM_HEALTH_CHECK,
        severity: AuditSeverity.INFO,
        actor: {
          type: 'system',
          userId: session.user!.id,
        },
        action: 'Security health check performed',
        result: 'success',
      })
      return true
    })

    // Check security headers
    components['securityHeaders'] = await checkComponentHealth('Security Headers', async () => {
      const testResponse = new NextResponse()
      const result = headersManager.validateHeaders(testResponse)
      return result.missing.length === 0 && result.issues.length === 0
    })

    // Check CORS configuration
    components['cors'] = await checkComponentHealth('CORS Configuration', async () => {
      const policies = corsManager.getPolicies()
      return policies.size > 0
    })

    // Check API key management
    components['apiKeyManagement'] = await checkComponentHealth('API Key Management', async () => {
      // Just verify the service is accessible
      const keys = await apiKeyManager.listKeys(session.user!.id, { limit: 1 })
      return true // Service is operational if no exception
    })

    // Check monitoring dashboard
    components['monitoring'] = await checkComponentHealth('Security Monitoring', async () => {
      const metrics = await dashboard.collectMetrics()
      return metrics !== null
    })

    // Check database connectivity
    components['database'] = await checkComponentHealth('Database', async () => {
      // Simple query to verify database is accessible
      const { db } = await import('@/lib/db')
      await db.$queryRaw`SELECT 1`
      return true
    })

    // Check external services (GitHub API)
    components['githubApi'] = await checkComponentHealth('GitHub API', async () => {
      const rateLimitInfo = await fetch('https://api.github.com/rate_limit', {
        headers: session.accessToken ? {
          'Authorization': `Bearer ${session.accessToken}`,
        } : {},
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
      recommendations.push('Overall security posture needs improvement - review all degraded components')
    }

    // Prepare response
    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components,
      securityScore,
      recommendations
    }

    // Validate response
    const validatedResponse = healthResponseSchema.parse(response)

    // Log health check
    await auditLogger.log({
      type: AuditEventType.SYSTEM_EVENT,
      severity: overallStatus === 'healthy' ? AuditSeverity.INFO : AuditSeverity.WARNING,
      actor: {
        type: 'user',
        userId: session.user.id,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
      action: 'Security health check completed',
      result: 'success',
      metadata: {
        overallStatus,
        securityScore,
        componentStatuses: Object.entries(components).reduce((acc, [name, component]) => ({
          ...acc,
          [name]: component.status
        }), {}),
        recommendationCount: recommendations.length,
      }
    })

    return NextResponse.json(validatedResponse)

  } catch (error) {
    console.error('Security health check error:', error)

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

    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    )
  }
}

// OPTIONS method for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const corsManager = new CorsManager()
  return corsManager.handlePreflight(request)
}