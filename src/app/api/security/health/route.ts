/**
 * Security Health Check Endpoint
 * Portfolio demonstration of security monitoring and observability
 */

import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db/config'
import { getSecurityConfig, securityFeatures } from '@/lib/security/feature-flags'

/**
 * Security health check data structure
 */
interface SecurityHealthStatus {
  timestamp: string
  status: 'healthy' | 'warning' | 'critical'
  services: {
    database: 'connected' | 'disconnected' | 'error'
    webauthn: 'available' | 'unavailable' | 'disabled'
    rateLimit: 'active' | 'inactive'
    securityHeaders: 'enabled' | 'disabled'
  }
  features: {
    webauthnEnabled: boolean
    rateLimitingEnabled: boolean
    advancedMonitoringEnabled: boolean
    securityDashboardEnabled: boolean
  }
  metrics?: {
    totalWebAuthnCredentials: number
    activeUserSessions: number
    recentSecurityEvents: number
  }
  configuration: {
    environment: string
    webauthnRpId: string
    securityLevel: 'basic' | 'enhanced' | 'enterprise'
  }
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<'connected' | 'disconnected' | 'error'> {
  try {
    await sql`SELECT 1`
    return 'connected'
  } catch (error) {
    console.error('Database health check failed:', error)
    return 'error'
  }
}

/**
 * Check WebAuthn availability
 */
function checkWebAuthn(): 'available' | 'unavailable' | 'disabled' {
  if (!securityFeatures.webauthn) {
    return 'disabled'
  }

  try {
    const config = getSecurityConfig()
    return config.webauthn.rpId ? 'available' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/**
 * Get security metrics (if advanced monitoring enabled)
 */
async function getSecurityMetrics() {
  if (!securityFeatures.advancedMonitoring) {
    return undefined
  }

  try {
    // Get WebAuthn credential count
    const webauthnCount = await sql`
      SELECT COUNT(*) as count FROM webauthn_credentials
    `

    // Get active user sessions (from NextAuth sessions)
    const sessionCount = await sql`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE expires > NOW()
    `

    return {
      totalWebAuthnCredentials: Number(webauthnCount?.[0]?.count || 0),
      activeUserSessions: Number(sessionCount?.[0]?.count || 0),
      recentSecurityEvents: 0, // Placeholder for security event counting
    }
  } catch (error) {
    console.error('Failed to get security metrics:', error)
    return {
      totalWebAuthnCredentials: 0,
      activeUserSessions: 0,
      recentSecurityEvents: 0,
    }
  }
}

/**
 * Determine overall security level
 */
function getSecurityLevel(): 'basic' | 'enhanced' | 'enterprise' {
  if (securityFeatures.advancedMonitoring && securityFeatures.securityDashboard) {
    return 'enterprise'
  }
  if (securityFeatures.webauthn && securityFeatures.rateLimiting) {
    return 'enhanced'
  }
  return 'basic'
}

/**
 * GET /api/security/health
 * Returns security system health status
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Perform health checks
    const databaseStatus = await checkDatabase()
    const webauthnStatus = checkWebAuthn()
    const config = getSecurityConfig()

    // Get metrics if enabled
    const metrics = await getSecurityMetrics()

    // Determine overall status
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'

    if (databaseStatus === 'error') {
      overallStatus = 'critical'
    } else if (
      databaseStatus === 'disconnected' ||
      (securityFeatures.webauthn && webauthnStatus === 'unavailable')
    ) {
      overallStatus = 'warning'
    }

    const healthStatus: SecurityHealthStatus = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      services: {
        database: databaseStatus,
        webauthn: webauthnStatus,
        rateLimit: securityFeatures.rateLimiting ? 'active' : 'inactive',
        securityHeaders: securityFeatures.securityHeaders ? 'enabled' : 'disabled',
      },
      features: {
        webauthnEnabled: securityFeatures.webauthn,
        rateLimitingEnabled: securityFeatures.rateLimiting,
        advancedMonitoringEnabled: securityFeatures.advancedMonitoring,
        securityDashboardEnabled: securityFeatures.securityDashboard,
      },
      ...(metrics && { metrics }),
      configuration: {
        environment: process.env.NODE_ENV || 'unknown',
        webauthnRpId: config.webauthn.rpId,
        securityLevel: getSecurityLevel(),
      },
    }

    return NextResponse.json(healthStatus, {
      status: overallStatus === 'critical' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Security health check error:', error)

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        status: 'critical',
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    )
  }
}
