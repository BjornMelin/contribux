/**
 * Content Security Policy (CSP) Middleware
 * Comprehensive CSP implementation with validation and reporting
 */

import { type NextRequest, NextResponse } from 'next/server'
import { buildCSP, generateNonce, getCSPDirectives, type CSPDirectives } from '@/lib/security/csp'

export { type CSPDirectives } from '@/lib/security/csp'

// Re-exports for test compatibility
export { generateNonce } from '@/lib/security/csp'

// Export additional functions needed by tests - functions are exported below in their definitions

export interface CSPMiddlewareConfig {
  directives?: CSPDirectives | ((req: NextRequest) => CSPDirectives)
  reportOnly?: boolean
  reportUri?: string
  useNonce?: boolean
}

export function cspMiddleware(config: CSPMiddlewareConfig) {
  return async (request: NextRequest, handler: (req: any) => Promise<NextResponse>): Promise<NextResponse> => {
    // Generate nonce if required
    const nonce = config.useNonce ? generateNonce() : undefined
    
    // Get directives (static or dynamic)
    let directives = typeof config.directives === 'function' 
      ? config.directives(request)
      : config.directives || getCSPDirectives()

    // Environment-specific modifications
    if (process.env.NODE_ENV === 'development') {
      // Add development-specific sources
      directives = {
        ...directives,
        'connect-src': [
          ...(directives['connect-src'] || []),
          'ws://localhost:3000',
          'wss://localhost:3000'
        ],
        'script-src': [
          ...(directives['script-src'] || []),
          "'unsafe-eval'"
        ]
      }
    } else if (process.env.NODE_ENV === 'production') {
      // Add production-specific strict security directives
      directives = {
        ...directives,
        'upgrade-insecure-requests': directives['upgrade-insecure-requests'] || [],
        'block-all-mixed-content': directives['block-all-mixed-content'] || []
      }
    }

    // Replace nonce placeholder if present
    const processedDirectives = processNoncePlaceholders(directives, nonce)
    
    // Build CSP header
    const cspHeader = buildCSP(processedDirectives, nonce)
    
    // Add nonce to request if generated
    const enhancedRequest = nonce ? Object.assign(request, { nonce }) : request
    
    // Call handler
    const response = await handler(enhancedRequest)
    
    // Add CSP header
    const headerName = config.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
    response.headers.set(headerName, cspHeader)
    
    return response
  }
}

function processNoncePlaceholders(directives: CSPDirectives, nonce?: string): CSPDirectives {
  if (!nonce) return directives
  
  const processed: CSPDirectives = {}
  
  for (const [directive, sources] of Object.entries(directives)) {
    if (sources) {
      processed[directive as keyof CSPDirectives] = sources.map(source => 
        source.replace('{nonce}', nonce)
      )
    } else {
      processed[directive as keyof CSPDirectives] = sources
    }
  }
  
  return processed
}

export function generateCSPHeader(directives: CSPDirectives, options?: { warnUnsafe?: boolean }): string {
  if (options?.warnUnsafe) {
    validateCSPSecurity(directives)
  }
  
  return buildCSP(directives)
}

export function validateCSPDirective(directive: string, source: string): boolean {
  // Basic validation rules
  const validKeywords = [
    "'self'", "'unsafe-inline'", "'unsafe-eval'", "'none'", "'strict-dynamic'",
    "'unsafe-hashes'", "'report-sample'", "'wasm-unsafe-eval'"
  ]
  
  const validSchemes = ['data:', 'blob:', 'filesystem:', 'https:', 'http:', 'ws:', 'wss:']
  
  // Reject dangerous or invalid schemes
  if (source.startsWith('javascript:') || source.startsWith('vbscript:')) {
    return false
  }
  
  // Reject unquoted keywords (missing quotes)
  if (['unsafe-inline', 'unsafe-eval', 'none', 'self', 'strict-dynamic'].includes(source)) {
    return false
  }
  
  // Reject wildcard without scheme
  if (source === '*') {
    return false
  }
  
  // Check for valid keywords FIRST
  if (validKeywords.includes(source)) {
    // Special case: frame-ancestors doesn't support unsafe-inline
    if (directive === 'frame-ancestors' && source === "'unsafe-inline'") {
      return false
    }
    return true
  }
  
  // Check for nonce/hash (must be quoted and properly formatted)
  if ((source.startsWith("'nonce-") && source.endsWith("'")) ||
      (source.startsWith("'sha256-") && source.endsWith("'")) ||
      (source.startsWith("'sha384-") && source.endsWith("'")) ||
      (source.startsWith("'sha512-") && source.endsWith("'"))) {
    return true
  }
  
  // Check for valid schemes
  if (validSchemes.some(scheme => source.startsWith(scheme))) {
    // HTTP not allowed for most directives by default (security best practice)
    // Only allow in development or when explicitly configured
    if (source.startsWith('http:') && directive !== 'connect-src') {
      return false
    }
    return true
  }
  
  // Check for valid hostnames
  if (source.includes('.') && !source.includes(' ')) {
    return true
  }
  
  // Check for sandbox values
  if (directive === 'sandbox') {
    const validSandboxValues = [
      'allow-forms', 'allow-same-origin', 'allow-scripts', 'allow-popups',
      'allow-modals', 'allow-orientation-lock', 'allow-pointer-lock',
      'allow-presentation', 'allow-popups-to-escape-sandbox', 'allow-top-navigation'
    ]
    return validSandboxValues.includes(source)
  }
  
  // Reject unknown quoted keywords
  if (source.startsWith("'") && source.endsWith("'")) {
    return false
  }
  
  return false
}

export async function reportCSPViolation(
  request: NextRequest,
  options?: { filterNoise?: boolean }
): Promise<void> {
  try {
    const body = await request.json()
    const report = body['csp-report']
    
    if (!report) return
    
    // Filter out noise (browser extensions, etc.)
    if (options?.filterNoise && isNoiseViolation(report)) {
      return
    }
    
    console.warn('CSP Violation', {
      directive: report['violated-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
    })
  } catch (error) {
    console.error('Failed to process CSP violation report:', error)
  }
}

function isNoiseViolation(report: any): boolean {
  const blockedUri = report['blocked-uri'] || ''
  
  // Filter out browser extension violations
  if (blockedUri.startsWith('chrome-extension://') || 
      blockedUri.startsWith('moz-extension://') ||
      blockedUri.startsWith('safari-extension://')) {
    return true
  }
  
  // Filter out other known noise sources
  const noisePatterns = [
    'about:blank',
    'javascript:void(0)',
    'data:text/html,chromewebdata'
  ]
  
  return noisePatterns.some(pattern => blockedUri.includes(pattern))
}

export class CSPViolationAggregator {
  private violations = new Map<string, number>()
  
  add(violation: { directive: string; blockedUri: string; sourceFile?: string }): void {
    // Create a key for grouping similar violations
    const key = `${violation.directive}:${this.normalizeUri(violation.blockedUri)}`
    const current = this.violations.get(key) || 0
    this.violations.set(key, current + 1)
  }
  
  getSummary(): Record<string, number> {
    return Object.fromEntries(this.violations.entries())
  }
  
  private normalizeUri(uri: string): string {
    // Remove query parameters and fragments for grouping
    try {
      const url = new URL(uri)
      return `${url.protocol}//${url.host}`
    } catch {
      // If not a valid URL, extract domain or use as-is
      if (uri.startsWith('http')) {
        const domain = uri.split('/')[2]
        return `http://${domain}`
      }
      return uri
    }
  }
}

function validateCSPSecurity(directives: CSPDirectives): void {
  const warnings: Array<{ directive: string; issue: string }> = []
  
  // Check for unsafe directives
  for (const [directive, sources] of Object.entries(directives)) {
    if (!sources) continue
    
    if (sources.includes('*')) {
      warnings.push({ directive, issue: 'Wildcard source' })
    }
    
    if (sources.includes("'unsafe-inline'")) {
      warnings.push({ directive, issue: 'unsafe-inline' })
    }
    
    if (sources.includes("'unsafe-eval'")) {
      warnings.push({ directive, issue: 'unsafe-eval' })
    }
  }
  
  // Log warnings
  warnings.forEach(warning => {
    console.warn('Unsafe CSP directive', warning)
  })
}

export function analyzeCSPSecurity(directives: CSPDirectives): Array<{
  directive?: string
  current?: string
  suggestion: string
  severity: 'low' | 'medium' | 'high'
}> {
  const suggestions: Array<{
    directive?: string
    current?: string
    suggestion: string
    severity: 'low' | 'medium' | 'high'
  }> = []
  
  // Check script-src
  if (directives['script-src']?.includes("'unsafe-inline'")) {
    suggestions.push({
      directive: 'script-src',
      current: "'unsafe-inline'",
      suggestion: 'Use nonces or hashes instead',
      severity: 'high'
    })
  }
  
  // Check for missing object-src
  if (!directives['object-src']) {
    suggestions.push({
      directive: 'object-src',
      suggestion: "Add object-src 'none' to prevent plugin-based XSS",
      severity: 'medium'
    })
  }
  
  // Check for missing base-uri
  if (!directives['base-uri']) {
    suggestions.push({
      directive: 'base-uri',
      suggestion: "Add base-uri 'self' to prevent base tag injection",
      severity: 'medium'
    })
  }
  
  return suggestions
}

export function parseCSPHeader(cspHeader: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {}
  
  const directives = cspHeader.split(';').map(d => d.trim()).filter(Boolean)
  
  for (const directive of directives) {
    const parts = directive.split(/\s+/)
    const directiveName = parts[0]
    const sources = parts.slice(1)
    
    if (directiveName) {
      parsed[directiveName] = sources
    }
  }
  
  return parsed
}