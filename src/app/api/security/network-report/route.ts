import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuditEventType, AuditSeverity, auditLogger } from '@/lib/security/audit-logger'

/**
 * Network Error Logging (NEL) Report Schema
 * Based on the W3C Network Error Logging specification
 */
const nelReportSchema = z.object({
  age: z.number().min(0),
  type: z.enum([
    'network-error',
    'dns.unreachable',
    'dns.name_not_resolved',
    'dns.failed',
    'dns.address_changed',
    'tcp.timed_out',
    'tcp.closed',
    'tcp.reset',
    'tcp.refused',
    'tcp.aborted',
    'tcp.address_invalid',
    'tcp.address_unreachable',
    'tcp.failed',
    'tls.version_or_cipher_mismatch',
    'tls.bad_client_auth_cert',
    'tls.cert.name_invalid',
    'tls.cert.date_invalid',
    'tls.cert.authority_invalid',
    'tls.cert.invalid',
    'tls.cert.revoked',
    'tls.cert.pinned_key_not_in_cert_chain',
    'tls.protocol.error',
    'tls.failed',
    'http.error',
    'http.protocol.error',
    'http.response.invalid',
    'http.response.redirect_loop',
    'http.failed',
    'abandoned',
  ]),
  url: z.string().url(),
  referrer: z.string().url().optional(),
  sampling_fraction: z.number().min(0).max(1),
  server_ip: z.string().ip().optional(),
  protocol: z.string().optional(),
  method: z.string().optional(),
  status_code: z.number().min(100).max(599).optional(),
  elapsed_time: z.number().min(0).optional(),
  phase: z.enum(['dns', 'connection', 'request', 'response']).optional(),
  user_agent: z.string().optional(),
})

const nelReportBatchSchema = z.array(nelReportSchema)

/**
 * Analyze NEL report for severity and patterns
 */
function analyzeNetworkError(report: z.infer<typeof nelReportSchema>) {
  const { type, url, status_code, elapsed_time, phase } = report
  
  const errorAnalysis = getErrorAnalysis(type, status_code, elapsed_time)
  const patterns = detectSuspiciousPatterns(type, url, elapsed_time, phase)
  
  return {
    severity: errorAnalysis.severity,
    category: errorAnalysis.category,
    actionRequired: errorAnalysis.actionRequired,
    patterns,
    recommendation: getRecommendation(type, patterns),
  }
}

/**
 * Error type configuration schema
 */
const errorTypeConfigSchema = z.object({
  severity: z.nativeEnum(AuditSeverity),
  category: z.string(),
  actionRequired: z.union([
    z.boolean(),
    z.function()
      .args(z.string(), z.number().optional(), z.number().optional())
      .returns(z.boolean())
  ])
})
type ErrorTypeConfig = z.infer<typeof errorTypeConfigSchema>

/**
 * Get error analysis based on type
 */
function getErrorAnalysis(type: string, statusCode?: number, elapsedTime?: number): {
  severity: AuditSeverity
  category: string
  actionRequired: boolean
} {
  const errorTypeConfigs: Record<string, ErrorTypeConfig> = {
    'dns': {
      severity: AuditSeverity.WARNING,
      category: 'dns-error',
      actionRequired: (t) => t === 'dns.name_not_resolved'
    },
    'tcp': {
      severity: AuditSeverity.WARNING,
      category: 'connection-error',
      actionRequired: (t) => t === 'tcp.refused' || t === 'tcp.timed_out'
    },
    'tls': {
      severity: AuditSeverity.ERROR,
      category: 'tls-error',
      actionRequired: true
    },
    'http': {
      severity: statusCode && statusCode >= 500 ? AuditSeverity.ERROR : AuditSeverity.WARNING,
      category: 'http-error',
      actionRequired: statusCode ? statusCode >= 500 : false
    },
    'abandoned': {
      severity: AuditSeverity.INFO,
      category: 'performance-issue',
      actionRequired: elapsedTime ? elapsedTime > 30000 : false
    }
  }
  
  // Find matching error type
  for (const [prefix, config] of Object.entries(errorTypeConfigs)) {
    if (type === prefix || type.startsWith(`${prefix}.`)) {
      return {
        severity: config.severity,
        category: config.category,
        actionRequired: typeof config.actionRequired === 'function' 
          ? config.actionRequired(type, statusCode, elapsedTime)
          : config.actionRequired
      }
    }
  }
  
  // Default for unknown types
  return {
    severity: AuditSeverity.INFO,
    category: 'network-error',
    actionRequired: false
  }
}

/**
 * Detect suspicious patterns in the error
 */
function detectSuspiciousPatterns(
  type: string,
  url: string,
  elapsedTime?: number,
  phase?: string
): NetworkErrorPatterns {
  return {
    isDNSAttack: type.startsWith('dns.') && url.includes('suspicious'),
    isPerformanceIssue: elapsedTime ? elapsedTime > 10000 : false,
    isCertificateIssue: type.startsWith('tls.cert.'),
    isConnectionIssue: type.startsWith('tcp.') && phase === 'connection',
  }
}

/**
 * Get recommendation based on error type and patterns
 */
/**
 * Network error patterns interface
 */
interface NetworkErrorPatterns {
  isCertificateIssue: boolean
  isDNSAttack: boolean
  isPerformanceIssue: boolean
  isConnectionIssue: boolean
}

function getRecommendation(type: string, patterns: NetworkErrorPatterns): string {
  if (patterns.isCertificateIssue) {
    return 'Check SSL/TLS certificate validity and configuration'
  }
  if (patterns.isDNSAttack) {
    return 'Investigate potential DNS-based attack'
  }
  if (patterns.isPerformanceIssue) {
    return 'Review server performance and response times'
  }
  if (patterns.isConnectionIssue) {
    return 'Check network connectivity and firewall rules'
  }
  if (type.startsWith('http.')) {
    return 'Review HTTP response handling and error codes'
  }
  return 'Monitor for recurring patterns'
}

/**
 * Simple rate limiting for NEL reports
 */
const nelRateLimitMap = new Map<string, { count: number; lastReset: number }>()
const NEL_RATE_LIMIT = 100 // reports per minute
const NEL_RATE_WINDOW = 60 * 1000 // 1 minute

function checkNELRateLimit(clientIp: string): boolean {
  const now = Date.now()
  const entry = nelRateLimitMap.get(clientIp)

  if (!entry) {
    nelRateLimitMap.set(clientIp, { count: 1, lastReset: now })
    return true
  }

  // Reset if window expired
  if (now - entry.lastReset > NEL_RATE_WINDOW) {
    entry.count = 1
    entry.lastReset = now
    return true
  }

  // Check if limit exceeded
  if (entry.count >= NEL_RATE_LIMIT) {
    return false
  }

  entry.count += 1
  return true
}

/**
 * POST handler for Network Error Logging reports
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIp =
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

    // Check rate limit
    if (!checkNELRateLimit(clientIp)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Parse and validate report
    let reports: z.infer<typeof nelReportSchema>[]
    try {
      const body = await request.json()
      const validation = nelReportBatchSchema.safeParse(body)

      if (!validation.success) {
        // Log invalid report format
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.WARNING,
          actor: {
            type: 'system',
            ip: clientIp,
            userAgent: request.headers.get('user-agent') || 'unknown',
          },
          action: 'Invalid NEL report format',
          result: 'failure',
          reason: 'Schema validation failed',
          metadata: {
            errors: validation.error.errors,
          },
        })

        return NextResponse.json({ error: 'Invalid report format' }, { status: 400 })
      }

      reports = validation.data
    } catch (_error) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Process each report
    for (const report of reports) {
      const analysis = analyzeNetworkError(report)

      // Log the network error
      await auditLogger.log({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: analysis.severity,
        actor: {
          type: 'system',
          ip: clientIp,
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
        action: 'Network error reported',
        result: 'success',
        reason: report.type,
        metadata: {
          url: report.url,
          type: report.type,
          statusCode: report.status_code,
          elapsedTime: report.elapsed_time,
          phase: report.phase,
          serverIp: report.server_ip,
          protocol: report.protocol,
          method: report.method,
          analysis,
        },
      })

      // TODO: Implement alert triggering for critical network errors
      // Critical network errors should trigger infrastructure alerts
    }

    // Return 204 No Content (standard for NEL reporting)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    // Log error but return 204 to prevent retry storms
    await auditLogger.log({
      type: AuditEventType.SYSTEM_ERROR,
      severity: AuditSeverity.ERROR,
      actor: { type: 'system' },
      action: 'NEL report processing failed',
      result: 'failure',
      reason: error instanceof Error ? error.message : 'Unknown error',
    })

    return new NextResponse(null, { status: 204 })
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
