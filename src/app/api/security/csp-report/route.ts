/**
 * CSP Violation Reporting Endpoint
 * 
 * Receives and processes Content Security Policy violation reports.
 * Implements rate limiting to prevent report flooding.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auditLogger, AuditEventType, AuditSeverity } from '@/lib/security/audit-logger'
import { SecurityMonitoringDashboard } from '@/lib/security/monitoring-dashboard'
import { z } from 'zod'

// Initialize services
const monitoringDashboard = new SecurityMonitoringDashboard()

// CSP Report schema (based on W3C spec)
const cspReportSchema = z.object({
  'csp-report': z.object({
    'document-uri': z.string().url().optional(),
    'referrer': z.string().optional(),
    'violated-directive': z.string(),
    'effective-directive': z.string().optional(),
    'original-policy': z.string(),
    'disposition': z.enum(['enforce', 'report']).optional(),
    'blocked-uri': z.string().optional(),
    'line-number': z.number().optional(),
    'column-number': z.number().optional(),
    'source-file': z.string().optional(),
    'status-code': z.number().optional(),
    'script-sample': z.string().optional()
  })
})

// Rate limiting for CSP reports (prevent flooding)
const reportRateLimiter = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX = 10 // Max 10 reports per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = reportRateLimiter.get(ip)

  if (!record || record.resetTime < now) {
    reportRateLimiter.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false
  }

  record.count++
  return true
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of reportRateLimiter.entries()) {
    if (record.resetTime < now) {
      reportRateLimiter.delete(ip)
    }
  }
}, RATE_LIMIT_WINDOW)

/**
 * POST /api/security/csp-report
 * Receive CSP violation reports
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIp = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown'

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    // Parse and validate report
    let report: any
    try {
      const body = await request.json()
      const validation = cspReportSchema.safeParse(body)
      
      if (!validation.success) {
        // Log invalid report format
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.WARNING,
          actor: {
            type: 'system',
            ip: clientIp,
            userAgent: request.headers.get('user-agent') || 'unknown'
          },
          action: 'Invalid CSP report format',
          result: 'failure',
          reason: 'Schema validation failed',
          metadata: {
            errors: validation.error.errors
          }
        })

        return NextResponse.json(
          { error: 'Invalid report format' },
          { status: 400 }
        )
      }

      report = validation.data['csp-report']
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      )
    }

    // Analyze the violation
    const violationAnalysis = analyzeCSPViolation(report)

    // Log the CSP violation
    await auditLogger.log({
      type: AuditEventType.SECURITY_VIOLATION,
      severity: violationAnalysis.severity,
      actor: {
        type: 'system',
        ip: clientIp,
        userAgent: request.headers.get('user-agent') || 'unknown'
      },
      action: 'CSP violation reported',
      result: 'success',
      reason: report['violated-directive'],
      metadata: {
        documentUri: report['document-uri'],
        blockedUri: report['blocked-uri'],
        violatedDirective: report['violated-directive'],
        effectiveDirective: report['effective-directive'],
        sourceFile: report['source-file'],
        lineNumber: report['line-number'],
        columnNumber: report['column-number'],
        scriptSample: report['script-sample'],
        analysis: violationAnalysis
      }
    })

    // TODO: Implement alert triggering when public API is available
    // Critical CSP violations should trigger security alerts

    // Return 204 No Content (standard for CSP reporting)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    // Log error but return 204 to prevent retry storms
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'CSP report processing failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error'
    })

    return new NextResponse(null, { status: 204 })
  }
}

/**
 * Analyze CSP violation to determine severity and potential security impact
 */
function analyzeCSPViolation(report: any): {
  severity: AuditSeverity
  message: string
  isLikelyAttack: boolean
  category: string
} {
  const violatedDirective = report['violated-directive']
  const blockedUri = report['blocked-uri'] || ''
  const sourceFile = report['source-file'] || ''

  // Check for inline script/style violations (potential XSS)
  if (violatedDirective.includes('script-src') && blockedUri.includes('inline')) {
    return {
      severity: AuditSeverity.ERROR,
      message: 'Inline script blocked - potential XSS attempt',
      isLikelyAttack: true,
      category: 'xss'
    }
  }

  // Check for data: URI violations (potential data exfiltration)
  if (blockedUri.startsWith('data:') && violatedDirective.includes('img-src')) {
    return {
      severity: AuditSeverity.WARNING,
      message: 'Data URI blocked in image source',
      isLikelyAttack: false,
      category: 'data-uri'
    }
  }

  // Check for external script violations
  if (violatedDirective.includes('script-src') && blockedUri.includes('://')) {
    const isKnownCDN = ['cdnjs.cloudflare.com', 'unpkg.com', 'jsdelivr.net']
      .some(cdn => blockedUri.includes(cdn))
    
    if (!isKnownCDN) {
      return {
        severity: AuditSeverity.ERROR,
        message: 'External script blocked from unknown source',
        isLikelyAttack: true,
        category: 'external-script'
      }
    }
  }

  // Check for frame-ancestors violations (clickjacking attempts)
  if (violatedDirective.includes('frame-ancestors')) {
    return {
      severity: AuditSeverity.ERROR,
      message: 'Frame embedding attempt blocked - potential clickjacking',
      isLikelyAttack: true,
      category: 'clickjacking'
    }
  }

  // Check for form-action violations
  if (violatedDirective.includes('form-action')) {
    return {
      severity: AuditSeverity.ERROR,
      message: 'Form submission to unauthorized target blocked',
      isLikelyAttack: true,
      category: 'form-hijacking'
    }
  }

  // Check for connect-src violations (API calls)
  if (violatedDirective.includes('connect-src')) {
    const isLocalhost = blockedUri.includes('localhost') || blockedUri.includes('127.0.0.1')
    
    return {
      severity: isLocalhost ? AuditSeverity.DEBUG : AuditSeverity.WARNING,
      message: `API connection blocked to ${blockedUri}`,
      isLikelyAttack: !isLocalhost,
      category: 'api-connection'
    }
  }

  // Default case for other violations
  return {
    severity: AuditSeverity.WARNING,
    message: `CSP violation: ${violatedDirective}`,
    isLikelyAttack: false,
    category: 'other'
  }
}

/**
 * GET /api/security/csp-report
 * Get CSP violation statistics (admin only)
 */
export async function GET(request: NextRequest) {
  // This endpoint could be used to retrieve CSP violation statistics
  // For now, return method not allowed
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}