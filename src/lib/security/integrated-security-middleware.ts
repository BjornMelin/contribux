/**
 * Integrated Security Middleware
 * Orchestrates all security components for comprehensive protection
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiKeyManager } from './api-key-rotation'
import { AuditEventType, AuditSeverity, auditLogger, type SecurityMetadata } from './audit-logger'
import {
  CorsManager,
  checkSuspiciousCorsPatterns,
  DynamicCorsConfig,
  logCorsViolation,
} from './cors-config'
import { SecurityError, SecurityErrorType, withSecurityBoundary } from './error-boundaries'
import { InputValidator } from './input-validation'
import { IPAllowlistManager } from './ip-allowlist'
import { SecurityMonitoringDashboard } from './monitoring-dashboard'
import { getRateLimiter } from './rate-limiting'
import { RequestSigner } from './request-signing'
import { SecurityHeadersManager } from './security-headers'

// Configuration schema
const SecurityMiddlewareConfigSchema = z.object({
  enableRateLimiting: z.boolean().default(true),
  enableRequestSigning: z.boolean().default(true),
  enableIpAllowlist: z.boolean().default(true),
  enableInputValidation: z.boolean().default(true),
  enableSecurityHeaders: z.boolean().default(true),
  enableCors: z.boolean().default(true),
  enableApiKeyValidation: z.boolean().default(true),
  enableMonitoring: z.boolean().default(true),
  enableAuditLogging: z.boolean().default(true),
  // Advanced options
  strictMode: z.boolean().default(false), // Fail on any security check failure
  developmentMode: z.boolean().default(process.env.NODE_ENV === 'development'),
})

export type SecurityMiddlewareConfig = z.infer<typeof SecurityMiddlewareConfigSchema>

// Initialize security components with default configs
const rateLimiter = getRateLimiter('api')
const requestSigner = new RequestSigner({
  algorithm: 'sha256',
  secret: process.env.REQUEST_SIGNING_SECRET || 'default-secret-change-in-production-32-chars',
  timestampTolerance: 300,
  nonceSize: 16,
  includeBody: true,
  includeQueryParams: true,
})
const ipAllowlist = new IPAllowlistManager({
  enabled: process.env.NODE_ENV === 'production',
  allowPrivateIPs: process.env.NODE_ENV === 'development',
  allowLocalhost: process.env.NODE_ENV === 'development',
  cacheExpiry: 300,
  strictMode: true,
})
const inputValidator = new InputValidator()
const headersManager = new SecurityHeadersManager()
const corsConfig = new DynamicCorsConfig()
const apiKeyManager = new ApiKeyManager()
const _monitoringDashboard = new SecurityMonitoringDashboard()

// Helper to extract client info
function extractClientInfo(request: NextRequest): {
  ip: string
  userAgent: string
  requestId: string
} {
  return {
    ip:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
  }
}

// Helper to create security context
function createSecurityContext(request: NextRequest): SecurityMetadata {
  const { ip, userAgent, requestId } = extractClientInfo(request)
  const url = new URL(request.url)

  return {
    ip,
    userAgent,
    requestId,
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(request.headers.entries()),
    timestamp: new Date().toISOString(),
  }
}

// Security check helper functions
async function checkIpAllowlist(
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<boolean> {
  if (!config.enableIpAllowlist || config.developmentMode) {
    return true
  }

  return await withSecurityBoundary(
    async () => {
      const isAllowed = await ipAllowlist.isAllowed(securityContext.ip)
      securityChecks.ipAllowlist = { passed: isAllowed }

      if (!isAllowed) {
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.WARNING,
          actor: { type: 'system', ip: securityContext.ip },
          action: 'Blocked by IP allowlist',
          metadata: { ...securityContext },
          result: 'failure',
        })

        if (config.strictMode) {
          throw new SecurityError(SecurityErrorType.AUTHORIZATION, 'IP not allowed')
        }
      }

      return isAllowed
    },
    {
      operationType: 'ip-allowlist-check',
      ip: securityContext.ip,
      metadata: { path: securityContext.path, method: securityContext.method },
    }
  )
}

async function checkRateLimit(
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<boolean> {
  if (!config.enableRateLimiting) {
    return true
  }

  return await withSecurityBoundary(
    async () => {
      const result = await rateLimiter.limit(securityContext.ip)
      const allowed = result.success
      securityChecks.rateLimit = { passed: allowed }

      if (!allowed) {
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.WARNING,
          actor: { type: 'system', ip: securityContext.ip },
          action: 'Rate limit exceeded',
          metadata: { ...securityContext },
          result: 'failure',
        })

        if (config.strictMode) {
          throw new SecurityError(SecurityErrorType.RATE_LIMIT, 'Rate limit exceeded')
        }
      }

      return allowed
    },
    {
      operationType: 'rate-limit-check',
      ip: securityContext.ip,
      metadata: { path: securityContext.path, method: securityContext.method },
    }
  )
}

async function checkRequestSignature(
  request: NextRequest,
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<boolean> {
  if (!config.enableRequestSigning || !request.url.includes('/api/')) {
    return true
  }

  return await withSecurityBoundary(
    async () => {
      const signature = request.headers.get('x-signature')
      const timestamp = request.headers.get('x-timestamp')

      if (!signature || !timestamp) {
        securityChecks.requestSignature = { passed: false, details: 'Missing signature' }
        return false
      }

      const body = await request.clone().text()
      const url = new URL(request.url)
      const result = requestSigner.verifyRequest(
        request.method,
        url.pathname,
        Object.fromEntries(request.headers.entries()),
        {
          body: body || undefined,
          queryParams: Object.fromEntries(url.searchParams.entries()),
        }
      )
      const isValid = result.valid
      securityChecks.requestSignature = { passed: isValid }

      if (!isValid) {
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.ERROR,
          actor: { type: 'system', ip: securityContext.ip },
          action: 'Invalid request signature',
          metadata: { ...securityContext },
          result: 'failure',
        })
      }

      return isValid
    },
    {
      operationType: 'request-signature-validation',
      ip: securityContext.ip,
      metadata: { path: securityContext.path, method: securityContext.method },
    }
  )
}

async function checkApiKeyValidation(
  request: NextRequest,
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<boolean> {
  if (!config.enableApiKeyValidation || !request.url.includes('/api/protected/')) {
    return true
  }

  return await withSecurityBoundary(
    async () => {
      const apiKey = request.headers.get('x-api-key')

      if (!apiKey) {
        securityChecks.apiKey = { passed: false, details: 'Missing API key' }
        return false
      }

      const keyInfo = await apiKeyManager.validateKey(apiKey)
      securityChecks.apiKey = { passed: keyInfo.valid }

      if (!keyInfo.valid) {
        await auditLogger.log({
          type: AuditEventType.SECURITY_VIOLATION,
          severity: AuditSeverity.ERROR,
          actor: { type: 'system', ip: securityContext.ip },
          action: 'Invalid API key',
          metadata: { ...securityContext, reason: keyInfo.reason } as Record<string, unknown>,
          result: 'failure',
        })
      }

      return keyInfo.valid
    },
    {
      operationType: 'api-key-validation',
      ip: securityContext.ip,
      metadata: { path: securityContext.path, method: securityContext.method },
    }
  )
}

async function checkInputValidation(
  request: NextRequest,
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<boolean> {
  if (!config.enableInputValidation || !['POST', 'PUT', 'PATCH'].includes(request.method)) {
    return true
  }

  return await withSecurityBoundary(
    async () => {
      const contentType = request.headers.get('content-type')

      if (contentType?.includes('application/json')) {
        const body = await request.clone().json()
        const schema = z.object({}).passthrough()
        const result = await inputValidator.validate(schema, body)
        securityChecks.inputValidation = {
          passed: result.success,
          details: result.errors?.errors.map(e => e.message).join(', '),
        }

        if (!result.success) {
          await auditLogger.log({
            type: AuditEventType.SECURITY_VIOLATION,
            severity: AuditSeverity.WARNING,
            actor: { type: 'system', ip: securityContext.ip },
            action: 'Input validation failed',
            metadata: {
              ...securityContext,
              errors: result.errors?.errors.map(e => e.message),
            } as Record<string, unknown>,
            result: 'failure',
          })
        }

        return result.success
      }

      return true
    },
    {
      operationType: 'input-validation',
      ip: securityContext.ip,
      metadata: { path: securityContext.path, method: securityContext.method },
    }
  )
}

function getCorsConfigName(url: URL, developmentMode: boolean): string {
  if (url.pathname.startsWith('/api/public/')) return 'public'
  if (url.pathname.startsWith('/api/private/')) return 'private'
  if (url.pathname.startsWith('/api/partner/')) return 'partner'
  return developmentMode ? 'development' : 'private'
}

async function handleCors(
  request: NextRequest,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<NextResponse | null> {
  if (!config.enableCors) {
    return null
  }

  const url = new URL(request.url)
  const corsConfigName = getCorsConfigName(url, config.developmentMode)
  const corsManagerConfig = corsConfig.getConfig(corsConfigName)

  if (!corsManagerConfig) {
    return null
  }

  const corsManager = new CorsManager(corsManagerConfig)
  const suspiciousCheck = checkSuspiciousCorsPatterns(request)

  if (suspiciousCheck.suspicious) {
    await logCorsViolation(request, suspiciousCheck.reasons.join(', '))
    securityChecks.cors = { passed: false, details: 'Suspicious CORS pattern' }
  }

  if (request.method === 'OPTIONS') {
    return corsManager.handlePreflight(request)
  }

  return null
}

async function applySecurityHeaders(
  request: NextRequest,
  response: NextResponse,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>
): Promise<NextResponse> {
  if (!config.enableSecurityHeaders) {
    return response
  }

  const enhancedResponse = headersManager.applyHeaders(request, response)
  securityChecks.securityHeaders = {
    passed: true,
    details: 'Security headers applied',
  }

  if (config.enableCors) {
    const url = new URL(request.url)
    const corsKey = getCorsConfigName(url, config.developmentMode)
    const corsManagerConfig = corsConfig.getConfig(corsKey)

    if (corsManagerConfig) {
      const corsManager = new CorsManager(corsManagerConfig)
      return corsManager.applyCorsHeaders(request, enhancedResponse)
    }
  }

  return enhancedResponse
}

async function recordSecurityMetrics(
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>,
  startTime: number
): Promise<void> {
  if (!config.enableMonitoring) {
    return
  }

  await withSecurityBoundary(
    async () => {
      // Record basic security metrics
      return true
    },
    {
      operationType: 'security-metrics-recording',
      ip: securityContext.ip,
      metadata: {
        path: securityContext.path,
        method: securityContext.method,
        duration: Date.now() - startTime,
        passed: Object.values(securityChecks).every(check => check.passed),
      },
    }
  )
}

async function auditRequest(
  request: NextRequest,
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>,
  startTime: number
): Promise<void> {
  if (!config.enableAuditLogging) {
    return
  }

  await auditLogger.log({
    type: AuditEventType.API_ACCESS,
    severity: AuditSeverity.INFO,
    actor: {
      type: 'user',
      ip: securityContext.ip,
      userAgent: securityContext.userAgent,
    },
    action: `${request.method} ${new URL(request.url).pathname}`,
    result: 'success',
    metadata: {
      ...securityContext,
      securityChecks,
      processingTime: Date.now() - startTime,
    } as Record<string, unknown>,
  })
}

async function handleSecurityError(
  error: unknown,
  securityContext: SecurityMetadata,
  config: SecurityMiddlewareConfig,
  securityChecks: Record<string, { passed: boolean; details?: string }>,
  startTime: number
): Promise<NextResponse> {
  const errorMessage = error instanceof Error ? error.message : 'Security check failed'
  const errorType = error instanceof SecurityError ? error.type : 'UNKNOWN_ERROR'

  await auditLogger.log({
    type: AuditEventType.SYSTEM_ERROR,
    severity: AuditSeverity.CRITICAL,
    actor: { type: 'system', ip: securityContext.ip },
    action: 'Security middleware error',
    reason: errorMessage,
    metadata: {
      ...securityContext,
      errorType,
      securityChecks,
      processingTime: Date.now() - startTime,
    } as Record<string, unknown>,
    result: 'error',
  })

  if (config.developmentMode) {
    return new NextResponse(
      JSON.stringify({
        error: errorMessage,
        code: errorType,
        checks: securityChecks,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return new NextResponse('Internal Server Error', { status: 500 })
}

// Main security middleware
export async function integratedSecurityMiddleware(
  request: NextRequest,
  config: Partial<SecurityMiddlewareConfig> = {}
): Promise<NextResponse> {
  const startTime = Date.now()
  const validatedConfig = SecurityMiddlewareConfigSchema.parse(config)
  const securityContext = createSecurityContext(request)
  const securityChecks: Record<string, { passed: boolean; details?: string }> = {}

  try {
    // Perform security checks
    const ipAllowed = await checkIpAllowlist(securityContext, validatedConfig, securityChecks)
    if (!ipAllowed && validatedConfig.strictMode) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const rateLimitPassed = await checkRateLimit(securityContext, validatedConfig, securityChecks)
    if (!rateLimitPassed) {
      const response = new NextResponse('Too Many Requests', { status: 429 })
      response.headers.set('Retry-After', '60')
      return response
    }

    const signatureValid = await checkRequestSignature(
      request,
      securityContext,
      validatedConfig,
      securityChecks
    )
    if (!signatureValid && validatedConfig.strictMode) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const apiKeyValid = await checkApiKeyValidation(
      request,
      securityContext,
      validatedConfig,
      securityChecks
    )
    if (!apiKeyValid) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const inputValid = await checkInputValidation(
      request,
      securityContext,
      validatedConfig,
      securityChecks
    )
    if (!inputValid && validatedConfig.strictMode) {
      return new NextResponse('Bad Request', { status: 400 })
    }

    // Handle CORS (may return early for OPTIONS requests)
    const corsResponse = await handleCors(request, validatedConfig, securityChecks)
    if (corsResponse) {
      return corsResponse
    }

    // Create response and apply security enhancements
    const response = NextResponse.next()
    const enhancedResponse = await applySecurityHeaders(
      request,
      response,
      validatedConfig,
      securityChecks
    )

    // Record metrics and audit
    await recordSecurityMetrics(securityContext, validatedConfig, securityChecks, startTime)
    await auditRequest(request, securityContext, validatedConfig, securityChecks, startTime)

    return enhancedResponse
  } catch (error) {
    return await handleSecurityError(
      error,
      securityContext,
      validatedConfig,
      securityChecks,
      startTime
    )
  }
}

// Export preset configurations
export const securityPresets = {
  // Maximum security for production
  production: {
    enableRateLimiting: true,
    enableRequestSigning: true,
    enableIpAllowlist: true,
    enableInputValidation: true,
    enableSecurityHeaders: true,
    enableCors: true,
    enableApiKeyValidation: true,
    enableMonitoring: true,
    enableAuditLogging: true,
    strictMode: true,
    developmentMode: false,
  },

  // Balanced security for staging
  staging: {
    enableRateLimiting: true,
    enableRequestSigning: true,
    enableIpAllowlist: false,
    enableInputValidation: true,
    enableSecurityHeaders: true,
    enableCors: true,
    enableApiKeyValidation: true,
    enableMonitoring: true,
    enableAuditLogging: true,
    strictMode: false,
    developmentMode: false,
  },

  // Development with helpful debugging
  development: {
    enableRateLimiting: true,
    enableRequestSigning: false,
    enableIpAllowlist: false,
    enableInputValidation: true,
    enableSecurityHeaders: true,
    enableCors: true,
    enableApiKeyValidation: false,
    enableMonitoring: true,
    enableAuditLogging: true,
    strictMode: false,
    developmentMode: true,
  },

  // Minimal security for testing
  test: {
    enableRateLimiting: false,
    enableRequestSigning: false,
    enableIpAllowlist: false,
    enableInputValidation: false,
    enableSecurityHeaders: false,
    enableCors: false,
    enableApiKeyValidation: false,
    enableMonitoring: false,
    enableAuditLogging: false,
    strictMode: false,
    developmentMode: true,
  },
} as const

// Convenience function to get preset based on environment
export function getSecurityPreset(): SecurityMiddlewareConfig {
  const env = (process.env.NODE_ENV || 'development') as
    | 'production'
    | 'staging'
    | 'test'
    | 'development'

  switch (env) {
    case 'production':
      return securityPresets.production
    case 'staging':
      return securityPresets.staging
    case 'test':
      return securityPresets.test
    default:
      return securityPresets.development
  }
}

// Export configured middleware
export const securityMiddleware = (request: NextRequest) =>
  integratedSecurityMiddleware(request, getSecurityPreset())
