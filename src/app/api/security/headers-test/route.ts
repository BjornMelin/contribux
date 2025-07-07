/**
 * Security Headers Testing Endpoint
 * 
 * Validates security headers configuration and provides recommendations.
 * Useful for development and security audits.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SecurityHeadersManager } from '@/lib/security/security-headers'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'

// Initialize security headers manager
const securityHeadersManager = new SecurityHeadersManager()

/**
 * GET /api/security/headers-test
 * Test security headers on current response
 */
export async function GET(request: NextRequest) {
  try {
    // Create a test response
    const testResponse = NextResponse.json({
      message: 'Security headers test endpoint',
      timestamp: new Date().toISOString()
    })

    // Apply security headers
    const securedResponse = securityHeadersManager.applyHeaders(
      request,
      testResponse,
      // Use production headers for testing
      process.env.NODE_ENV === 'production' ? undefined : {
        csp: {
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'"],
            'frame-ancestors': ["'none'"]
          }
        }
      }
    )

    // Validate the headers
    const validation = securityHeadersManager.validateHeaders(securedResponse)

    // Get all headers for inspection
    const headers: Record<string, string> = {}
    securedResponse.headers.forEach((value, key) => {
      headers[key] = value
    })

    // Analyze security headers
    const analysis = analyzeSecurityHeaders(headers)

    // Log the test
    const session = await getServerSession(authOptions)
    await auditLogger.log({
      type: AuditEventType.SYSTEM_EVENT,
      severity: AuditSeverity.INFO,
      actor: {
        type: session?.user ? 'user' : 'anonymous',
        userId: session?.user?.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      },
      action: 'Security headers test performed',
      result: 'success',
      metadata: {
        validation,
        analysis
      }
    })

    // Return detailed response
    return NextResponse.json({
      headers,
      validation,
      analysis,
      recommendations: generateRecommendations(validation, analysis),
      score: calculateSecurityScore(validation, analysis)
    })
  } catch (error) {
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'Security headers test failed',
      result: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/security/headers-test/validate
 * Validate security headers from an external URL
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user (optional but recommended)
    const session = await getServerSession(authOptions)
    
    // Parse request body
    const body = await request.json()
    const { url, headers: customHeaders } = body

    if (!url && !customHeaders) {
      return NextResponse.json(
        { error: 'Either url or headers must be provided' },
        { status: 400 }
      )
    }

    let headersToValidate: Record<string, string> = {}

    if (customHeaders) {
      // Validate provided headers
      headersToValidate = customHeaders
    } else {
      // Fetch headers from URL (with timeout)
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          // Don't follow redirects to test the actual endpoint
          redirect: 'manual'
        })

        clearTimeout(timeoutId)

        // Extract headers
        response.headers.forEach((value, key) => {
          headersToValidate[key] = value
        })
      } catch (error) {
        return NextResponse.json(
          { error: 'Failed to fetch headers from URL' },
          { status: 400 }
        )
      }
    }

    // Create a mock response with the headers
    const mockResponse = new NextResponse()
    Object.entries(headersToValidate).forEach(([key, value]) => {
      mockResponse.headers.set(key, value)
    })

    // Validate headers
    const validation = securityHeadersManager.validateHeaders(mockResponse)
    const analysis = analyzeSecurityHeaders(headersToValidate)

    // Log the validation
    await auditLogger.log({
      type: AuditEventType.SYSTEM_EVENT,
      severity: AuditSeverity.INFO,
      actor: {
        type: session?.user ? 'user' : 'anonymous',
        userId: session?.user?.id,
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      },
      action: 'External security headers validation',
      result: 'success',
      metadata: {
        url: url || 'custom headers',
        validation,
        analysis
      }
    })

    return NextResponse.json({
      validation,
      analysis,
      recommendations: generateRecommendations(validation, analysis),
      score: calculateSecurityScore(validation, analysis)
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Analyze security headers for additional insights
 */
function analyzeSecurityHeaders(headers: Record<string, string>) {
  const analysis: any = {
    securityFeatures: [],
    warnings: [],
    info: []
  }

  // Check HTTPS enforcement
  if (headers['strict-transport-security']) {
    const hsts = headers['strict-transport-security']
    analysis.securityFeatures.push('HTTPS enforced via HSTS')
    
    if (!hsts.includes('includeSubDomains')) {
      analysis.warnings.push('HSTS should include subdomains')
    }
    if (!hsts.includes('preload')) {
      analysis.info.push('Consider adding preload directive to HSTS')
    }
  }

  // Check CSP
  if (headers['content-security-policy']) {
    const csp = headers['content-security-policy']
    analysis.securityFeatures.push('Content Security Policy active')
    
    if (csp.includes('unsafe-inline')) {
      analysis.warnings.push('CSP allows unsafe-inline scripts')
    }
    if (csp.includes('unsafe-eval')) {
      analysis.warnings.push('CSP allows unsafe-eval')
    }
    if (!csp.includes('upgrade-insecure-requests')) {
      analysis.info.push('Consider adding upgrade-insecure-requests to CSP')
    }
  }

  // Check frame options
  if (headers['x-frame-options']) {
    analysis.securityFeatures.push('Clickjacking protection enabled')
  }

  // Check content type options
  if (headers['x-content-type-options'] === 'nosniff') {
    analysis.securityFeatures.push('MIME type sniffing protection enabled')
  }

  // Check XSS protection (legacy but still relevant)
  if (headers['x-xss-protection']) {
    analysis.securityFeatures.push('Legacy XSS filter enabled')
  }

  // Check referrer policy
  if (headers['referrer-policy']) {
    const policy = headers['referrer-policy']
    analysis.securityFeatures.push(`Referrer policy: ${policy}`)
    
    if (policy === 'no-referrer-when-downgrade') {
      analysis.info.push('Consider stricter referrer policy like strict-origin-when-cross-origin')
    }
  }

  // Check permissions policy
  if (headers['permissions-policy']) {
    analysis.securityFeatures.push('Permissions policy configured')
  }

  // Check cache control
  if (headers['cache-control']) {
    const cacheControl = headers['cache-control']
    if (cacheControl.includes('no-store') || cacheControl.includes('no-cache')) {
      analysis.securityFeatures.push('Secure cache headers configured')
    }
  }

  return analysis
}

/**
 * Generate recommendations based on validation and analysis
 */
function generateRecommendations(validation: any, analysis: any): string[] {
  const recommendations: string[] = []

  // Missing headers recommendations
  validation.missing.forEach((header: string) => {
    switch (header) {
      case 'Strict-Transport-Security':
        recommendations.push('Add HSTS header to enforce HTTPS connections')
        break
      case 'Content-Security-Policy':
        recommendations.push('Implement CSP to prevent XSS and injection attacks')
        break
      case 'X-Frame-Options':
        recommendations.push('Add X-Frame-Options to prevent clickjacking')
        break
      case 'X-Content-Type-Options':
        recommendations.push('Add X-Content-Type-Options: nosniff to prevent MIME sniffing')
        break
      case 'Referrer-Policy':
        recommendations.push('Configure Referrer-Policy to control information leakage')
        break
      case 'Permissions-Policy':
        recommendations.push('Use Permissions-Policy to control browser features')
        break
    }
  })

  // Issues recommendations
  validation.issues.forEach((issue: any) => {
    recommendations.push(`Fix ${issue.header}: ${issue.issue}`)
  })

  // Analysis-based recommendations
  analysis.warnings.forEach((warning: string) => {
    recommendations.push(`⚠️  ${warning}`)
  })

  return recommendations
}

/**
 * Calculate security score based on headers
 */
function calculateSecurityScore(validation: any, analysis: any): {
  score: number
  grade: string
  breakdown: Record<string, number>
} {
  const breakdown: Record<string, number> = {
    requiredHeaders: 0,
    securityFeatures: 0,
    configuration: 0
  }

  // Score for required headers (60 points)
  const requiredHeaders = [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'Referrer-Policy'
  ]
  
  const presentRequired = requiredHeaders.filter(
    header => !validation.missing.includes(header)
  ).length
  
  breakdown.requiredHeaders = (presentRequired / requiredHeaders.length) * 60

  // Score for security features (25 points)
  breakdown.securityFeatures = Math.min(
    (analysis.securityFeatures.length / 8) * 25,
    25
  )

  // Score for configuration quality (15 points)
  const penaltyPoints = validation.issues.length * 3 + analysis.warnings.length * 2
  breakdown.configuration = Math.max(15 - penaltyPoints, 0)

  // Calculate total score
  const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0)

  // Determine grade
  let grade: string
  if (totalScore >= 90) grade = 'A'
  else if (totalScore >= 80) grade = 'B'
  else if (totalScore >= 70) grade = 'C'
  else if (totalScore >= 60) grade = 'D'
  else grade = 'F'

  return {
    score: Math.round(totalScore),
    grade,
    breakdown
  }
}