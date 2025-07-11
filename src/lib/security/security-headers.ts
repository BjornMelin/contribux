/**
 * Enhanced Security Headers Middleware
 * Implements comprehensive security headers based on OWASP recommendations
 * Provides flexible configuration for different security requirements
 */

import { createHash, randomUUID } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

// Security header configuration
export interface SecurityHeadersConfig {
  // Content Security Policy
  contentSecurityPolicy?: {
    directives: Record<string, string[]>
    reportOnly?: boolean
    reportUri?: string
  }

  // Strict Transport Security
  strictTransportSecurity?: {
    maxAge: number
    includeSubDomains?: boolean
    preload?: boolean
  }

  // Frame options
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM'
  xFrameOptionsUri?: string

  // Content type options
  xContentTypeOptions?: boolean

  // XSS Protection (legacy but still useful)
  xXssProtection?: {
    mode: 'block' | 'report'
    reportUri?: string
  }

  // Referrer Policy
  referrerPolicy?:
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'origin'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url'

  // Permissions Policy (formerly Feature Policy)
  permissionsPolicy?: Record<string, string[]>

  // Cross-Origin policies
  crossOriginEmbedderPolicy?: 'require-corp' | 'unsafe-none'
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none'
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin'

  // Custom headers
  customHeaders?: Record<string, string>

  // Nonce generation for CSP
  generateNonce?: boolean

  // Development mode (relaxes some policies)
  developmentMode?: boolean
}

// Default secure CSP directives
const defaultCspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'strict-dynamic'"],
  'style-src': ["'self'", "'unsafe-inline'"], // Needed for some CSS frameworks
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [''],
}

// Production CSP directives (stricter than default)
const productionCspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'strict-dynamic'"],
  'style-src': ["'self'"], // No unsafe-inline in production
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [''],
}

// Production security headers configuration
export const productionSecurityHeaders: SecurityHeadersConfig = {
  contentSecurityPolicy: {
    directives: productionCspDirectives,
    reportUri: '/api/security/csp-report',
  },
  strictTransportSecurity: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true,
  },
  xFrameOptions: 'DENY',
  xContentTypeOptions: true,
  xXssProtection: {
    mode: 'block',
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: ['none'],
    microphone: ['none'],
    geolocation: ['none'],
    payment: ['none'],
    usb: ['none'],
    magnetometer: ['none'],
    accelerometer: ['none'],
    gyroscope: ['none'],
  },
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-site',
}

// Development security headers (more permissive)
export const developmentSecurityHeaders: SecurityHeadersConfig = {
  ...productionSecurityHeaders,
  contentSecurityPolicy: {
    directives: {
      ...defaultCspDirectives,
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow for dev tools
      'connect-src': ["'self'", 'ws:', 'wss:'], // Allow WebSocket for hot reload
    },
  },
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year (less than production)
    includeSubDomains: true,
    preload: false, // No preload for development
  },
  developmentMode: true,
}

/**
 * Security Headers Manager
 */
export class SecurityHeadersManager {
  private config: SecurityHeadersConfig

  constructor(config?: SecurityHeadersConfig) {
    this.config =
      config ||
      (process.env.NODE_ENV === 'production'
        ? productionSecurityHeaders
        : developmentSecurityHeaders)
  }

  /**
   * Apply security headers to response
   */
  applyHeaders(
    request: NextRequest,
    response: NextResponse,
    options?: {
      nonce?: string
      reportOnly?: boolean
      frameOptions?: string | false
      contentTypeOptions?: boolean | string | false
      referrerPolicy?: string
      hsts?: {
        maxAge: number
        includeSubDomains?: boolean
        preload?: boolean
      }
      permissionsPolicy?: Record<string, string[]>
      csp?: {
        useNonce?: boolean
        reportOnly?: boolean
        directives?: Record<string, string[]>
      }
    }
  ): NextResponse {
    const headers = response.headers

    // Generate nonce if needed
    const nonce = this.resolveNonce(options)

    // Apply all security headers using focused helper methods
    this.applyContentSecurityPolicy(headers, options, nonce)
    this.applyTransportSecurity(headers, options)
    this.applyBasicSecurityHeaders(headers, options)
    this.applyAdvancedSecurityPolicies(headers, options)
    this.applyContextualSecurityHeaders(headers, request)

    return response
  }

  /**
   * Apply HTTP Strict Transport Security configuration
   */
  private applyTransportSecurity(
    headers: Headers,
    options?: {
      hsts?: {
        maxAge: number
        includeSubDomains?: boolean
        preload?: boolean
      }
      isHttps?: boolean
    }
  ): void {
    // Only apply HSTS if explicitly provided in options
    // When undefined is passed, it means HTTPS was not detected
    if (options?.hsts) {
      this.applyStrictTransportSecurity(headers, options)
    } else if (options === undefined && this.config.strictTransportSecurity) {
      // Apply default config only when no options object was passed at all
      this.applyStrictTransportSecurity(headers, options)
    }
  }

  /**
   * Apply basic security headers (frame options, content type, XSS protection)
   */
  private applyBasicSecurityHeaders(
    headers: Headers,
    options?: {
      frameOptions?: string | false
      contentTypeOptions?: boolean | string | false
    }
  ): void {
    this.applyFrameOptions(headers, options)
    this.applyContentTypeOptions(headers, options)
    this.applyXSSProtection(headers)
  }

  /**
   * Apply advanced security policies (referrer, permissions, cross-origin)
   */
  private applyAdvancedSecurityPolicies(
    headers: Headers,
    options?: {
      referrerPolicy?: string
      permissionsPolicy?: Record<string, string[]>
    }
  ): void {
    this.applyReferrerPolicy(headers, options)
    this.applyPermissionsPolicy(headers, options)
    this.applyCrossOriginPolicies(headers)
  }

  /**
   * Apply contextual security headers (custom headers, security context, cleanup)
   */
  private applyContextualSecurityHeaders(headers: Headers, request: NextRequest): void {
    this.applyCustomHeaders(headers)
    this.applySecurityContext(headers, request)
    this.removeSecurityHeaders(headers)
  }

  /**
   * Resolve nonce value for CSP
   */
  private resolveNonce(options?: {
    nonce?: string
    csp?: { useNonce?: boolean }
  }): string | undefined {
    return options?.nonce || options?.csp?.useNonce
      ? this.generateNonce()
      : this.config.generateNonce
        ? this.generateNonce()
        : undefined
  }

  /**
   * Apply Content Security Policy header
   */
  private applyContentSecurityPolicy(
    headers: Headers,
    options?: {
      csp?: {
        useNonce?: boolean
        reportOnly?: boolean
        directives?: Record<string, string[]>
      }
      reportOnly?: boolean
    },
    nonce?: string
  ): void {
    const cspConfig = options?.csp || this.config.contentSecurityPolicy
    if (!cspConfig) return

    const directives =
      options?.csp?.directives ||
      this.config.contentSecurityPolicy?.directives ||
      defaultCspDirectives
    const cspHeader = this.buildCspHeader(
      { directives, reportUri: this.config.contentSecurityPolicy?.reportUri },
      nonce
    )
    const headerName =
      options?.csp?.reportOnly ||
      options?.reportOnly ||
      this.config.contentSecurityPolicy?.reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy'
    headers.set(headerName, cspHeader)
  }

  /**
   * Apply Strict Transport Security header
   */
  private applyStrictTransportSecurity(
    headers: Headers,
    options?: {
      hsts?: {
        maxAge: number
        includeSubDomains?: boolean
        preload?: boolean
      }
    }
  ): void {
    const hstsConfig = options?.hsts || this.config.strictTransportSecurity
    if (!hstsConfig) return

    const { maxAge, includeSubDomains, preload } = hstsConfig
    let value = `max-age=${maxAge}`
    if (includeSubDomains) value += '; includeSubDomains'
    if (preload) value += '; preload'
    headers.set('Strict-Transport-Security', value)
  }

  /**
   * Apply X-Frame-Options header
   */
  private applyFrameOptions(headers: Headers, options?: { frameOptions?: string | false }): void {
    const frameOptions =
      options?.frameOptions !== undefined ? options.frameOptions : this.config.xFrameOptions
    if (frameOptions === false || !frameOptions) return

    let value: string = frameOptions as string
    if (value === 'ALLOW-FROM' && this.config.xFrameOptionsUri) {
      value = `ALLOW-FROM ${this.config.xFrameOptionsUri}`
    }
    headers.set('X-Frame-Options', value)
  }

  /**
   * Apply X-Content-Type-Options header
   */
  private applyContentTypeOptions(
    headers: Headers,
    options?: { contentTypeOptions?: boolean | string | false }
  ): void {
    const contentTypeOptions =
      options?.contentTypeOptions !== undefined
        ? options.contentTypeOptions
        : this.config.xContentTypeOptions
    
    // Handle both boolean and string values
    if (contentTypeOptions === true || contentTypeOptions === 'nosniff') {
      headers.set('X-Content-Type-Options', 'nosniff')
    }
  }

  /**
   * Apply X-XSS-Protection header (legacy but still useful)
   */
  private applyXSSProtection(headers: Headers): void {
    if (!this.config.xXssProtection) return

    let value = '1'
    if (this.config.xXssProtection.mode === 'block') {
      value += '; mode=block'
    }
    if (this.config.xXssProtection.reportUri) {
      value += `; report=${this.config.xXssProtection.reportUri}`
    }
    headers.set('X-XSS-Protection', value)
  }

  /**
   * Apply Referrer-Policy header
   */
  private applyReferrerPolicy(headers: Headers, options?: { referrerPolicy?: string }): void {
    const referrerPolicy = options?.referrerPolicy || this.config.referrerPolicy
    if (referrerPolicy) {
      headers.set('Referrer-Policy', referrerPolicy)
    }
  }

  /**
   * Apply Permissions-Policy header
   */
  private applyPermissionsPolicy(
    headers: Headers,
    options?: { permissionsPolicy?: Record<string, string[]> }
  ): void {
    const permissionsPolicy = options?.permissionsPolicy || this.config.permissionsPolicy
    if (permissionsPolicy) {
      const policy = this.buildPermissionsPolicy(permissionsPolicy)
      headers.set('Permissions-Policy', policy)
    }
  }

  /**
   * Apply Cross-Origin policies
   */
  private applyCrossOriginPolicies(headers: Headers): void {
    if (this.config.crossOriginEmbedderPolicy) {
      headers.set('Cross-Origin-Embedder-Policy', this.config.crossOriginEmbedderPolicy)
    }

    if (this.config.crossOriginOpenerPolicy) {
      headers.set('Cross-Origin-Opener-Policy', this.config.crossOriginOpenerPolicy)
    }

    if (this.config.crossOriginResourcePolicy) {
      headers.set('Cross-Origin-Resource-Policy', this.config.crossOriginResourcePolicy)
    }
  }

  /**
   * Apply custom headers
   */
  private applyCustomHeaders(headers: Headers): void {
    if (!this.config.customHeaders) return

    for (const [name, value] of Object.entries(this.config.customHeaders)) {
      headers.set(name, value)
    }
  }

  /**
   * Apply security context headers
   */
  private applySecurityContext(headers: Headers, request: NextRequest): void {
    headers.set('X-Request-ID', request.headers.get('x-request-id') || randomUUID())
    headers.set('X-Security-Headers-Version', '1.0.0')
  }

  /**
   * Remove potentially dangerous headers
   */
  private removeSecurityHeaders(headers: Headers): void {
    headers.delete('X-Powered-By')
    headers.delete('Server')
  }

  /**
   * Build CSP header string
   */
  private buildCspHeader(
    cspConfig: NonNullable<SecurityHeadersConfig['contentSecurityPolicy']>,
    nonce?: string
  ): string {
    const directives: string[] = []

    for (const [directive, values] of Object.entries(cspConfig.directives)) {
      let directiveStr = directive

      if (values.length > 0) {
        // Add nonce to script-src and style-src if provided
        const processedValues = values.map(value => {
          if (nonce && (directive === 'script-src' || directive === 'style-src')) {
            // Add nonce for 'self' and 'strict-dynamic' values
            if (value === "'self'" || value === "'strict-dynamic'") {
              return `'nonce-${nonce}' ${value}`
            }
          }
          return value
        })

        directiveStr += ` ${processedValues.join(' ')}`
      }

      directives.push(directiveStr.trim())
    }

    // Add report-uri if specified
    if (cspConfig.reportUri) {
      directives.push(`report-uri ${cspConfig.reportUri}`)
      directives.push('report-to csp-endpoint') // Modern reporting
    }

    return directives.join('; ')
  }

  /**
   * Build Permissions-Policy header
   */
  private buildPermissionsPolicy(policies: Record<string, string[]>): string {
    const policyStrings: string[] = []

    for (const [feature, allowList] of Object.entries(policies)) {
      if (allowList.length === 0 || (allowList.length === 1 && allowList[0] === 'none')) {
        policyStrings.push(`${feature}=()`)
      } else {
        const values = allowList.map(v => (v === 'self' ? 'self' : `"${v}"`))
        policyStrings.push(`${feature}=(${values.join(' ')})`)
      }
    }

    return policyStrings.join(', ')
  }

  /**
   * Generate CSP nonce
   */
  private generateNonce(): string {
    return createHash('sha256')
      .update(randomUUID())
      .digest('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16)
  }

  /**
   * Create middleware function
   */
  createMiddleware() {
    return (request: NextRequest, response: NextResponse) => {
      return this.applyHeaders(request, response)
    }
  }

  /**
   * Generate CSP header string (public method for testing)
   */
  generateCSP(customDirectives?: Record<string, string[]>): string {
    const directives =
      customDirectives || this.config.contentSecurityPolicy?.directives || defaultCspDirectives

    const cspConfig = {
      directives,
      reportUri: this.config.contentSecurityPolicy?.reportUri,
    }

    return this.buildCspHeader(cspConfig)
  }

  /**
   * Get report-to header configuration
   */
  getReportToHeader(): string {
    const endpoints = [
      {
        url: '/api/security/csp-report',
      },
    ]

    const reportTo = {
      group: 'csp-endpoint',
      max_age: 86400,
      endpoints,
    }

    return JSON.stringify(reportTo)
  }

  /**
   * Validate security headers in response
   */
  validateHeaders(response: NextResponse): {
    missing: string[]
    issues: Array<{ header: string; issue: string }>
  } {
    const missing: string[] = []
    const issues: Array<{ header: string; issue: string }> = []

    // Check for essential security headers
    const headers = response.headers

    if (!headers.get('X-Frame-Options')) {
      missing.push('X-Frame-Options')
    } else {
      const frameOptions = headers.get('X-Frame-Options')
      if (frameOptions === 'ALLOWALL') {
        issues.push({ header: 'X-Frame-Options', issue: 'Weak value: ALLOWALL' })
      }
    }

    if (!headers.get('X-Content-Type-Options')) {
      missing.push('X-Content-Type-Options')
    }

    if (!headers.get('Content-Security-Policy')) {
      missing.push('Content-Security-Policy')
    } else {
      const csp = headers.get('Content-Security-Policy')
      if (csp?.includes('*')) {
        issues.push({ header: 'Content-Security-Policy', issue: 'Contains wildcard source' })
      }
    }

    if (!headers.get('Strict-Transport-Security')) {
      missing.push('Strict-Transport-Security')
    }

    return { missing, issues }
  }

  /**
   * Check for security violations
   */
  async checkViolations(request: NextRequest, response: NextResponse): Promise<void> {
    const { auditLogger, AuditEventType, AuditSeverity } = await import('./audit-logger')

    // Check for potential clickjacking
    const referer = request.headers.get('referer')
    const frameOptions = request.headers.get('x-frame-options')

    if (referer && frameOptions === 'ALLOWALL') {
      await auditLogger.log({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.WARNING,
        actor: {
          type: 'system',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
        },
        action: 'Potential clickjacking attempt detected',
        result: 'failure',
        metadata: {
          referer,
          frameOptions,
        },
      })
    }

    // Check for CSP violations
    if (request.url.includes('/csp-report') && request.method === 'POST') {
      await auditLogger.log({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.WARNING,
        actor: {
          type: 'system',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
        },
        action: 'CSP violation reported',
        result: 'failure',
        metadata: {
          url: request.url,
        },
      })
    }

    // Check for missing security headers
    const validation = this.validateHeaders(response)
    if (validation.missing.length > 0) {
      await auditLogger.log({
        type: AuditEventType.SECURITY_VIOLATION,
        severity: AuditSeverity.WARNING,
        actor: {
          type: 'system',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
        },
        action: 'Missing security headers detected',
        result: 'failure',
        metadata: {
          missing: validation.missing,
        },
      })
    }
  }

  /**
   * Validate CSP directives
   */
  validateCspDirectives(directives: Record<string, string[]>): {
    valid: boolean
    warnings: string[]
    errors: string[]
  } {
    const warnings: string[] = []
    const errors: string[] = []

    // Check for unsafe directives
    if (directives['script-src']?.includes("'unsafe-inline'")) {
      warnings.push("'unsafe-inline' in script-src weakens CSP protection")
    }

    if (directives['script-src']?.includes("'unsafe-eval'")) {
      warnings.push("'unsafe-eval' in script-src allows code injection")
    }

    // Check for missing important directives
    if (!directives['default-src']) {
      errors.push("Missing 'default-src' directive")
    }

    if (!directives['frame-ancestors']) {
      warnings.push("Missing 'frame-ancestors' directive for clickjacking protection")
    }

    // Check for overly permissive directives
    if (directives['default-src']?.includes('*')) {
      errors.push("Wildcard in 'default-src' defeats CSP purpose")
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    }
  }
}

// Export default instance
export const securityHeaders = new SecurityHeadersManager()

/**
 * Security headers middleware for Next.js
 */
export function securityHeadersMiddleware(
  config?: SecurityHeadersConfig
): (request: NextRequest) => NextResponse {
  const manager = new SecurityHeadersManager(config)

  return (request: NextRequest) => {
    const response = NextResponse.next()
    return manager.applyHeaders(request, response)
  }
}
