/**
 * Enhanced Security Headers Middleware
 * Implements comprehensive security headers based on OWASP recommendations
 * Provides flexible configuration for different security requirements
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'

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

// Production security headers configuration
export const productionSecurityHeaders: SecurityHeadersConfig = {
  contentSecurityPolicy: {
    directives: defaultCspDirectives,
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
  strictTransportSecurity: undefined, // Disable for local development
  developmentMode: true,
}

/**
 * Security Headers Manager
 */
export class SecurityHeadersManager {
  private config: SecurityHeadersConfig
  
  constructor(config?: SecurityHeadersConfig) {
    this.config = config || (
      process.env.NODE_ENV === 'production'
        ? productionSecurityHeaders
        : developmentSecurityHeaders
    )
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
    }
  ): NextResponse {
    const headers = response.headers
    
    // Generate nonce if needed
    const nonce = options?.nonce || (
      this.config.generateNonce ? this.generateNonce() : undefined
    )
    
    // Content Security Policy
    if (this.config.contentSecurityPolicy) {
      const cspHeader = this.buildCspHeader(this.config.contentSecurityPolicy, nonce)
      const headerName = options?.reportOnly || this.config.contentSecurityPolicy.reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy'
      headers.set(headerName, cspHeader)
    }
    
    // Strict Transport Security
    if (this.config.strictTransportSecurity) {
      const { maxAge, includeSubDomains, preload } = this.config.strictTransportSecurity
      let value = `max-age=${maxAge}`
      if (includeSubDomains) value += '; includeSubDomains'
      if (preload) value += '; preload'
      headers.set('Strict-Transport-Security', value)
    }
    
    // X-Frame-Options
    if (this.config.xFrameOptions) {
      let value = this.config.xFrameOptions
      if (value === 'ALLOW-FROM' && this.config.xFrameOptionsUri) {
        value = `ALLOW-FROM ${this.config.xFrameOptionsUri}`
      }
      headers.set('X-Frame-Options', value)
    }
    
    // X-Content-Type-Options
    if (this.config.xContentTypeOptions) {
      headers.set('X-Content-Type-Options', 'nosniff')
    }
    
    // X-XSS-Protection (legacy but still useful)
    if (this.config.xXssProtection) {
      let value = '1'
      if (this.config.xXssProtection.mode === 'block') {
        value += '; mode=block'
      }
      if (this.config.xXssProtection.reportUri) {
        value += `; report=${this.config.xXssProtection.reportUri}`
      }
      headers.set('X-XSS-Protection', value)
    }
    
    // Referrer-Policy
    if (this.config.referrerPolicy) {
      headers.set('Referrer-Policy', this.config.referrerPolicy)
    }
    
    // Permissions-Policy
    if (this.config.permissionsPolicy) {
      const policy = this.buildPermissionsPolicy(this.config.permissionsPolicy)
      headers.set('Permissions-Policy', policy)
    }
    
    // Cross-Origin policies
    if (this.config.crossOriginEmbedderPolicy) {
      headers.set('Cross-Origin-Embedder-Policy', this.config.crossOriginEmbedderPolicy)
    }
    
    if (this.config.crossOriginOpenerPolicy) {
      headers.set('Cross-Origin-Opener-Policy', this.config.crossOriginOpenerPolicy)
    }
    
    if (this.config.crossOriginResourcePolicy) {
      headers.set('Cross-Origin-Resource-Policy', this.config.crossOriginResourcePolicy)
    }
    
    // Custom headers
    if (this.config.customHeaders) {
      for (const [name, value] of Object.entries(this.config.customHeaders)) {
        headers.set(name, value)
      }
    }
    
    // Add security context headers
    headers.set('X-Request-ID', request.headers.get('x-request-id') || randomUUID())
    headers.set('X-Security-Headers-Version', '1.0.0')
    
    // Remove potentially dangerous headers
    headers.delete('X-Powered-By')
    headers.delete('Server')
    
    return response
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
            if (value === "'strict-dynamic'") {
              return `'nonce-${nonce}' ${value}`
            }
          }
          return value
        })
        
        directiveStr += ' ' + processedValues.join(' ')
      }
      
      directives.push(directiveStr.trim())
    }
    
    // Add report-uri if specified
    if (cspConfig.reportUri) {
      directives.push(`report-uri ${cspConfig.reportUri}`)
      directives.push(`report-to csp-endpoint`) // Modern reporting
    }
    
    return directives.join('; ')
  }
  
  /**
   * Build Permissions-Policy header
   */
  private buildPermissionsPolicy(policies: Record<string, string[]>): string {
    const policyStrings: string[] = []
    
    for (const [feature, allowList] of Object.entries(policies)) {
      if (allowList.length === 0) {
        policyStrings.push(`${feature}=()`)
      } else {
        const values = allowList.map(v => v === 'self' ? 'self' : `"${v}"`)
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