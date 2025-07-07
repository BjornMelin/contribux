/**
 * CORS Configuration and Middleware
 * Provides flexible and secure Cross-Origin Resource Sharing configuration
 * Implements OWASP recommendations for CORS security
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditLogger, AuditEventType, AuditSeverity } from './audit-logger'

// CORS configuration schema
export const CorsConfigSchema = z.object({
  // Allowed origins
  origins: z.union([
    z.literal('*'), // Not recommended for production
    z.array(z.string().url()),
    z.function().args(z.string()).returns(z.boolean()),
  ]),
  
  // Allowed methods
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])),
  
  // Allowed headers
  allowedHeaders: z.union([
    z.literal('*'),
    z.array(z.string()),
  ]),
  
  // Exposed headers
  exposedHeaders: z.array(z.string()).optional(),
  
  // Credentials
  credentials: z.boolean(),
  
  // Max age for preflight cache
  maxAge: z.number().optional(),
  
  // Preflight continue
  preflightContinue: z.boolean().optional(),
  
  // Options success status
  optionsSuccessStatus: z.number().optional(),
})

export type CorsConfig = z.infer<typeof CorsConfigSchema>

// Preset CORS configurations
export const CorsPresets = {
  // Public API (most permissive)
  publicApi: {
    origins: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: '*',
    credentials: false,
    maxAge: 86400,
  } as CorsConfig,
  
  // Same origin only (most restrictive)
  sameOrigin: {
    origins: [],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  } as CorsConfig,
  
  // Trusted partners
  trustedPartners: {
    origins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
    credentials: true,
    maxAge: 3600,
  } as CorsConfig,
  
  // Development
  development: {
    origins: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: '*',
    credentials: true,
    maxAge: 3600,
  } as CorsConfig,
}

/**
 * CORS Manager
 */
export class CorsManager {
  private config: CorsConfig
  
  constructor(config: CorsConfig) {
    this.config = config
  }
  
  /**
   * Check if origin is allowed
   */
  isOriginAllowed(origin: string | null): boolean {
    if (!origin) return false
    
    if (this.config.origins === '*') {
      return true
    }
    
    if (Array.isArray(this.config.origins)) {
      return this.config.origins.includes(origin)
    }
    
    if (typeof this.config.origins === 'function') {
      return this.config.origins(origin)
    }
    
    return false
  }
  
  /**
   * Handle CORS preflight request
   */
  handlePreflight(request: NextRequest): NextResponse {
    const origin = request.headers.get('origin')
    const requestMethod = request.headers.get('access-control-request-method')
    const requestHeaders = request.headers.get('access-control-request-headers')
    
    // Check if origin is allowed
    if (!this.isOriginAllowed(origin)) {
      return new NextResponse(null, { status: 403 })
    }
    
    // Check if method is allowed
    if (requestMethod && !this.config.methods.includes(requestMethod as any)) {
      return new NextResponse(null, { status: 405 })
    }
    
    // Build response
    const response = new NextResponse(null, {
      status: this.config.optionsSuccessStatus || 204,
    })
    
    // Set CORS headers
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    
    response.headers.set(
      'Access-Control-Allow-Methods',
      this.config.methods.join(', ')
    )
    
    // Handle allowed headers
    if (this.config.allowedHeaders === '*') {
      response.headers.set(
        'Access-Control-Allow-Headers',
        requestHeaders || '*'
      )
    } else {
      response.headers.set(
        'Access-Control-Allow-Headers',
        this.config.allowedHeaders.join(', ')
      )
    }
    
    // Set credentials
    if (this.config.credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }
    
    // Set max age
    if (this.config.maxAge) {
      response.headers.set(
        'Access-Control-Max-Age',
        this.config.maxAge.toString()
      )
    }
    
    // Add Vary header
    response.headers.append('Vary', 'Origin')
    response.headers.append('Vary', 'Access-Control-Request-Method')
    response.headers.append('Vary', 'Access-Control-Request-Headers')
    
    return response
  }
  
  /**
   * Apply CORS headers to response
   */
  applyCorsHeaders(
    request: NextRequest,
    response: NextResponse
  ): NextResponse {
    const origin = request.headers.get('origin')
    
    // Check if origin is allowed
    if (!this.isOriginAllowed(origin)) {
      // Don't set CORS headers for disallowed origins
      return response
    }
    
    // Set allowed origin
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    
    // Set exposed headers
    if (this.config.exposedHeaders && this.config.exposedHeaders.length > 0) {
      response.headers.set(
        'Access-Control-Expose-Headers',
        this.config.exposedHeaders.join(', ')
      )
    }
    
    // Set credentials
    if (this.config.credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }
    
    // Add Vary header
    response.headers.append('Vary', 'Origin')
    
    return response
  }
  
  /**
   * Create CORS middleware
   */
  createMiddleware() {
    return async (request: NextRequest): Promise<NextResponse | null> => {
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return this.handlePreflight(request)
      }
      
      // For other requests, return null to continue
      return null
    }
  }
  
  /**
   * Validate CORS configuration
   */
  static validateConfig(config: CorsConfig): {
    valid: boolean
    warnings: string[]
    errors: string[]
  } {
    const warnings: string[] = []
    const errors: string[] = []
    
    // Check for security issues
    if (config.origins === '*' && config.credentials) {
      errors.push('Cannot use wildcard origin with credentials')
    }
    
    if (config.origins === '*') {
      warnings.push('Using wildcard origin is not recommended for production')
    }
    
    if (config.allowedHeaders === '*') {
      warnings.push('Using wildcard for allowed headers may expose sensitive headers')
    }
    
    if (!config.maxAge || config.maxAge > 86400) {
      warnings.push('Consider setting maxAge to reduce preflight requests')
    }
    
    return {
      valid: errors.length === 0,
      warnings,
      errors,
    }
  }
}

/**
 * Dynamic CORS configuration based on environment
 */
export class DynamicCorsConfig {
  private configs: Map<string, CorsConfig> = new Map()
  
  constructor() {
    // Set up default configurations
    this.configs.set('public', CorsPresets.publicApi)
    this.configs.set('private', CorsPresets.sameOrigin)
    this.configs.set('partner', CorsPresets.trustedPartners)
    this.configs.set('development', CorsPresets.development)
  }
  
  /**
   * Add or update a configuration
   */
  setConfig(name: string, config: CorsConfig): void {
    this.configs.set(name, config)
  }
  
  /**
   * Get configuration by name
   */
  getConfig(name: string): CorsConfig | undefined {
    return this.configs.get(name)
  }
  
  /**
   * Create middleware with dynamic route-based configuration
   */
  createDynamicMiddleware(
    routeConfig: (request: NextRequest) => string | CorsConfig | null
  ) {
    return async (request: NextRequest): Promise<NextResponse | null> => {
      const configOrName = routeConfig(request)
      
      if (!configOrName) {
        // No CORS handling for this route
        return null
      }
      
      let config: CorsConfig
      
      if (typeof configOrName === 'string') {
        const namedConfig = this.configs.get(configOrName)
        if (!namedConfig) {
          console.error(`CORS config '${configOrName}' not found`)
          return null
        }
        config = namedConfig
      } else {
        config = configOrName
      }
      
      const manager = new CorsManager(config)
      
      // Handle preflight
      if (request.method === 'OPTIONS') {
        return manager.handlePreflight(request)
      }
      
      return null
    }
  }
}

/**
 * CORS violation detection and logging
 */
export class CorsSecurityMonitor {
  /**
   * Log CORS violation attempt
   */
  static async logViolation(
    request: NextRequest,
    reason: string
  ): Promise<void> {
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const userAgent = request.headers.get('user-agent')
    
    await auditLogger.log({
      type: AuditEventType.SECURITY_VIOLATION,
      severity: AuditSeverity.WARNING,
      actor: {
        type: 'system',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent,
      },
      action: 'CORS violation attempt',
      result: 'failure',
      reason,
      metadata: {
        origin,
        referer,
        method: request.method,
        path: new URL(request.url).pathname,
      },
    })
  }
  
  /**
   * Check for suspicious CORS patterns
   */
  static checkSuspiciousPatterns(request: NextRequest): {
    suspicious: boolean
    reasons: string[]
  } {
    const reasons: string[] = []
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    
    // Check for origin/referer mismatch
    if (origin && referer) {
      try {
        const originUrl = new URL(origin)
        const refererUrl = new URL(referer)
        
        if (originUrl.origin !== refererUrl.origin) {
          reasons.push('Origin/Referer mismatch')
        }
      } catch {}
    }
    
    // Check for null origin (can be legitimate but also suspicious)
    if (origin === 'null') {
      reasons.push('Null origin detected')
    }
    
    // Check for file:// origin
    if (origin?.startsWith('file://')) {
      reasons.push('File protocol origin')
    }
    
    // Check for missing origin on cross-origin request
    if (!origin && request.method !== 'GET' && request.method !== 'HEAD') {
      reasons.push('Missing origin on state-changing request')
    }
    
    return {
      suspicious: reasons.length > 0,
      reasons,
    }
  }
}

// Export default CORS configurations
export const corsConfig = new DynamicCorsConfig()

/**
 * Route-based CORS middleware example
 */
export function createRouteCorsMiddleware() {
  return corsConfig.createDynamicMiddleware((request) => {
    const path = new URL(request.url).pathname
    
    // Public API endpoints
    if (path.startsWith('/api/public/')) {
      return 'public'
    }
    
    // Partner API endpoints
    if (path.startsWith('/api/partner/')) {
      return 'partner'
    }
    
    // Webhook endpoints (no CORS)
    if (path.startsWith('/api/webhooks/')) {
      return null
    }
    
    // Development mode
    if (process.env.NODE_ENV === 'development') {
      return 'development'
    }
    
    // Default to private (same-origin only)
    return 'private'
  })
}