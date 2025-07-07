/**
 * Integrated Security Middleware
 * Orchestrates all security components for comprehensive protection
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRateLimiter } from './rate-limiting'
import { RequestSigner } from './request-signing'
import { IpAllowlistManager } from './ip-allowlist'
import { auditLogger, AuditEventType, AuditSeverity, SecurityMetadata } from './audit-logger'
import { InputValidator } from './input-validation'
import { SecurityHeadersManager, securityHeadersMiddleware } from './security-headers'
import { CorsManager, DynamicCorsConfig, CorsSecurityMonitor } from './cors-config'
import { ApiKeyManager } from './api-key-rotation'
import { SecurityMonitoringDashboard } from './monitoring-dashboard'
import { withSecurityBoundary, SecurityError } from './error-boundaries'

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

// Initialize security components
const rateLimiter = getRateLimiter('api')
const requestSigner = new RequestSigner()
const ipAllowlist = new IpAllowlistManager()
const inputValidator = new InputValidator()
const headersManager = new SecurityHeadersManager()
const corsConfig = new DynamicCorsConfig()
const apiKeyManager = new ApiKeyManager()
const monitoringDashboard = new SecurityMonitoringDashboard()

// Helper to extract client info
function extractClientInfo(request: NextRequest): {
  ip: string
  userAgent: string
  requestId: string
} {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
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

// Main security middleware
export async function integratedSecurityMiddleware(
  request: NextRequest,
  config: Partial<SecurityMiddlewareConfig> = {}
): Promise<NextResponse> {
  const startTime = Date.now()
  const validatedConfig = SecurityMiddlewareConfigSchema.parse(config)
  const securityContext = createSecurityContext(request)
  
  // Track security checks results
  const securityChecks: Record<string, { passed: boolean; details?: string }> = {}

  try {
    // 1. IP Allowlist Check
    if (validatedConfig.enableIpAllowlist && !validatedConfig.developmentMode) {
      const ipCheckResult = await withSecurityBoundary(async () => {
        const isAllowed = await ipAllowlist.isAllowed(securityContext.ip)
        securityChecks.ipAllowlist = { passed: isAllowed }
        
        if (!isAllowed) {
          await auditLogger.log({
            type: AuditEventType.SECURITY_VIOLATION,
            severity: AuditSeverity.WARNING,
            actor: { type: 'system', ip: securityContext.ip },
            action: 'Blocked by IP allowlist',
            metadata: securityContext,
          })
          
          if (validatedConfig.strictMode) {
            throw new SecurityError('IP not allowed', 'IP_BLOCKED')
          }
        }
        
        return isAllowed
      })

      if (!ipCheckResult && validatedConfig.strictMode) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    // 2. Rate Limiting
    if (validatedConfig.enableRateLimiting) {
      const rateLimitResult = await withSecurityBoundary(async () => {
        const allowed = await rateLimiter.isAllowed(securityContext.ip)
        securityChecks.rateLimit = { passed: allowed }
        
        if (!allowed) {
          await auditLogger.log({
            type: AuditEventType.SECURITY_VIOLATION,
            severity: AuditSeverity.WARNING,
            actor: { type: 'system', ip: securityContext.ip },
            action: 'Rate limit exceeded',
            metadata: securityContext,
          })
          
          if (validatedConfig.strictMode) {
            throw new SecurityError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED')
          }
        }
        
        return allowed
      })

      if (!rateLimitResult) {
        const response = new NextResponse('Too Many Requests', { status: 429 })
        response.headers.set('Retry-After', '60')
        return response
      }
    }

    // 3. Request Signature Validation (for API routes)
    if (validatedConfig.enableRequestSigning && request.url.includes('/api/')) {
      const signatureValid = await withSecurityBoundary(async () => {
        const signature = request.headers.get('x-signature')
        const timestamp = request.headers.get('x-timestamp')
        
        if (!signature || !timestamp) {
          securityChecks.requestSignature = { passed: false, details: 'Missing signature' }
          return false
        }

        const body = await request.clone().text()
        const isValid = requestSigner.verifySignature(body, signature, timestamp)
        securityChecks.requestSignature = { passed: isValid }
        
        if (!isValid) {
          await auditLogger.log({
            type: AuditEventType.SECURITY_VIOLATION,
            severity: AuditSeverity.HIGH,
            actor: { type: 'system', ip: securityContext.ip },
            action: 'Invalid request signature',
            metadata: securityContext,
          })
        }
        
        return isValid
      })

      if (!signatureValid && validatedConfig.strictMode) {
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    // 4. API Key Validation (for protected routes)
    if (validatedConfig.enableApiKeyValidation && request.url.includes('/api/protected/')) {
      const apiKeyValid = await withSecurityBoundary(async () => {
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
            severity: AuditSeverity.HIGH,
            actor: { type: 'system', ip: securityContext.ip },
            action: 'Invalid API key',
            metadata: { ...securityContext, reason: keyInfo.reason },
          })
        }
        
        return keyInfo.valid
      })

      if (!apiKeyValid) {
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    // 5. Input Validation (for POST/PUT/PATCH requests)
    if (validatedConfig.enableInputValidation && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const validationResult = await withSecurityBoundary(async () => {
        const contentType = request.headers.get('content-type')
        
        if (contentType?.includes('application/json')) {
          const body = await request.clone().json()
          
          // Basic input validation schema (customize per route)
          const schema = z.object({}).passthrough() // Allow any fields but validate structure
          
          const result = await inputValidator.validate(schema, body)
          securityChecks.inputValidation = { 
            passed: result.success,
            details: result.errors?.join(', ')
          }
          
          if (!result.success) {
            await auditLogger.log({
              type: AuditEventType.SECURITY_VIOLATION,
              severity: AuditSeverity.MEDIUM,
              actor: { type: 'system', ip: securityContext.ip },
              action: 'Input validation failed',
              metadata: { ...securityContext, errors: result.errors },
            })
          }
          
          return result.success
        }
        
        return true
      })

      if (!validationResult && validatedConfig.strictMode) {
        return new NextResponse('Bad Request', { status: 400 })
      }
    }

    // 6. CORS Handling
    if (validatedConfig.enableCors) {
      // Determine CORS config based on route
      const corsManager = corsConfig.getCorsManager((req) => {
        const url = new URL(req.url)
        if (url.pathname.startsWith('/api/public/')) return 'public'
        if (url.pathname.startsWith('/api/private/')) return 'private'
        if (url.pathname.startsWith('/api/partner/')) return 'partner'
        return validatedConfig.developmentMode ? 'development' : 'private'
      })(request)

      if (corsManager) {
        // Check for suspicious CORS patterns
        const suspiciousCheck = CorsSecurityMonitor.checkSuspiciousPatterns(request)
        if (suspiciousCheck.suspicious) {
          await CorsSecurityMonitor.logViolation(request, suspiciousCheck.reasons.join(', '))
          securityChecks.cors = { passed: false, details: 'Suspicious CORS pattern' }
        }

        // Handle preflight
        if (request.method === 'OPTIONS') {
          return corsManager.handlePreflight(request)
        }
      }
    }

    // 7. Create response and continue processing
    const response = NextResponse.next()

    // 8. Apply Security Headers
    if (validatedConfig.enableSecurityHeaders) {
      const enhancedResponse = await securityHeadersMiddleware(request, response)
      
      // Validate headers were applied correctly
      const validation = headersManager.validateHeaders(enhancedResponse)
      securityChecks.securityHeaders = { 
        passed: validation.missing.length === 0 && validation.issues.length === 0,
        details: [...validation.missing, ...validation.issues.map(i => i.issue)].join(', ')
      }

      // Apply CORS headers if enabled
      if (validatedConfig.enableCors) {
        const url = new URL(request.url)
        const corsKey = url.pathname.startsWith('/api/public/') ? 'public' :
                       url.pathname.startsWith('/api/partner/') ? 'partner' :
                       validatedConfig.developmentMode ? 'development' : 'private'
        
        const corsManager = new CorsManager(corsConfig.getConfig(corsKey))
        return corsManager.applyCorsHeaders(request, enhancedResponse)
      }

      return enhancedResponse
    }

    // 9. Record security metrics
    if (validatedConfig.enableMonitoring) {
      await withSecurityBoundary(async () => {
        await monitoringDashboard.recordMetric('security_checks', {
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          checks: securityChecks,
          passed: Object.values(securityChecks).every(check => check.passed),
        })
      })
    }

    // 10. Audit successful request
    if (validatedConfig.enableAuditLogging) {
      await auditLogger.log({
        type: AuditEventType.ACCESS,
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
        },
      })
    }

    return response
  } catch (error) {
    // Handle security errors
    const errorMessage = error instanceof Error ? error.message : 'Security check failed'
    const errorCode = error instanceof SecurityError ? error.code : 'UNKNOWN_ERROR'

    await auditLogger.log({
      type: AuditEventType.ERROR,
      severity: AuditSeverity.CRITICAL,
      actor: { type: 'system', ip: securityContext.ip },
      action: 'Security middleware error',
      error: errorMessage,
      metadata: {
        ...securityContext,
        errorCode,
        securityChecks,
        processingTime: Date.now() - startTime,
      },
    })

    // Return secure error response
    if (validatedConfig.developmentMode) {
      return new NextResponse(
        JSON.stringify({ 
          error: errorMessage,
          code: errorCode,
          checks: securityChecks,
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Production: Don't leak error details
    return new NextResponse('Internal Server Error', { status: 500 })
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
  const env = process.env.NODE_ENV || 'development'
  
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