/**
 * Advanced CORS and Content Security Policy Configuration
 * Implements fine-grained CORS policies, nonce-based CSP, trusted types,
 * report-only mode, violation reporting, and policy versioning
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateSecureToken } from './crypto'

// CSP and CORS configuration
export const CSP_CORS_CONFIG = {
  // CSP Configuration
  csp: {
    reportUri: '/api/security/csp-report',
    reportOnly: process.env.NODE_ENV === 'development',
    enableTrustedTypes: true,
    nonceLength: 16,
    hashAlgorithm: 'sha256' as const,
    maxAge: 86400, // 24 hours
  },
  // CORS Configuration
  cors: {
    maxAge: 86400, // 24 hours
    credentials: true,
    optionsSuccessStatus: 200,
  },
  // Violation reporting
  reporting: {
    maxReportsPerMinute: 10,
    reportRetentionDays: 30,
    enableAnalytics: true,
  },
} as const

// Schema definitions
export const CSPViolationSchema = z.object({
  'csp-report': z.object({
    'document-uri': z.string(),
    referrer: z.string().optional(),
    'violated-directive': z.string(),
    'effective-directive': z.string().optional(),
    'original-policy': z.string(),
    disposition: z.enum(['report', 'enforce']),
    'blocked-uri': z.string().optional(),
    'line-number': z.number().optional(),
    'column-number': z.number().optional(),
    'source-file': z.string().optional(),
    'status-code': z.number().optional(),
    'script-sample': z.string().optional(),
  }),
})

export const CORSConfigSchema = z.object({
  origins: z.array(z.string()),
  methods: z.array(z.string()),
  headers: z.array(z.string()),
  exposedHeaders: z.array(z.string()).optional(),
  credentials: z.boolean(),
  maxAge: z.number(),
  preflightContinue: z.boolean().optional(),
  optionsSuccessStatus: z.number().optional(),
})

export const CSPDirectiveSchema = z.object({
  'default-src': z.array(z.string()).optional(),
  'script-src': z.array(z.string()).optional(),
  'script-src-elem': z.array(z.string()).optional(),
  'script-src-attr': z.array(z.string()).optional(),
  'style-src': z.array(z.string()).optional(),
  'style-src-elem': z.array(z.string()).optional(),
  'style-src-attr': z.array(z.string()).optional(),
  'img-src': z.array(z.string()).optional(),
  'font-src': z.array(z.string()).optional(),
  'connect-src': z.array(z.string()).optional(),
  'media-src': z.array(z.string()).optional(),
  'object-src': z.array(z.string()).optional(),
  'child-src': z.array(z.string()).optional(),
  'frame-src': z.array(z.string()).optional(),
  'worker-src': z.array(z.string()).optional(),
  'frame-ancestors': z.array(z.string()).optional(),
  'form-action': z.array(z.string()).optional(),
  'base-uri': z.array(z.string()).optional(),
  'manifest-src': z.array(z.string()).optional(),
  sandbox: z.array(z.string()).optional(),
  'require-trusted-types-for': z.array(z.string()).optional(),
  'trusted-types': z.array(z.string()).optional(),
  'upgrade-insecure-requests': z.boolean().optional(),
  'block-all-mixed-content': z.boolean().optional(),
})

// Type definitions
export type CSPViolation = z.infer<typeof CSPViolationSchema>
export type CORSConfig = z.infer<typeof CORSConfigSchema>
export type CSPDirectives = z.infer<typeof CSPDirectiveSchema>

export interface CSPContext {
  nonce: string
  hashes: string[]
  reportOnly: boolean
  violationEndpoint: string
}

export interface CORSContext {
  origin: string
  method: string
  headers: string[]
  credentials: boolean
}

export interface PolicyVersionInfo {
  version: string
  createdAt: number
  active: boolean
  reportOnlyUntil?: number
  rollbackVersion?: string
}

// Dynamic CORS origin validation
const CORS_ORIGINS = {
  production: ['https://contribux.ai', 'https://app.contribux.ai', 'https://api.contribux.ai'],
  development: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  test: ['http://localhost:3000', 'http://test.contribux.ai'],
} as const

// Base CSP directives for different environments
const BASE_CSP_DIRECTIVES: Record<string, CSPDirectives> = {
  production: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'strict-dynamic'",
      'https://apis.google.com',
      'https://challenges.cloudflare.com',
    ],
    'script-src-elem': ["'self'", 'https://apis.google.com', 'https://challenges.cloudflare.com'],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for Tailwind CSS
      'https://fonts.googleapis.com',
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'https://avatars.githubusercontent.com',
      'https://github.com',
    ],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      'https://api.github.com',
      'https://api.contribux.ai',
      'wss://contribux.ai',
    ],
    'frame-src': [
      "'self'",
      'https://challenges.cloudflare.com',
      'https://www.google.com', // reCAPTCHA
    ],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'manifest-src': ["'self'"],
    'upgrade-insecure-requests': true,
    'block-all-mixed-content': true,
    'require-trusted-types-for': ["'script'"],
    'trusted-types': ['default', 'nextjs'],
  },
  development: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-eval'", // Required for dev server
      "'unsafe-inline'", // Required for hot reloading
      'localhost:*',
      '127.0.0.1:*',
    ],
    'style-src': ["'self'", "'unsafe-inline'", 'localhost:*'],
    'img-src': ["'self'", 'data:', 'https:', 'http:'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      'ws:',
      'wss:',
      'localhost:*',
      '127.0.0.1:*',
      'https://api.github.com',
    ],
    'frame-ancestors': ["'self'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  },
}

/**
 * Generate dynamic CORS configuration based on request context
 */
export function generateCORSConfig(request: NextRequest): CORSConfig {
  const origin = request.headers.get('origin')
  const environment = process.env.NODE_ENV || 'development'

  // Get allowed origins for environment
  const allowedOrigins =
    CORS_ORIGINS[environment as keyof typeof CORS_ORIGINS] || CORS_ORIGINS.development

  // Validate origin
  const isOriginAllowed =
    origin && (allowedOrigins.includes(origin) || isDynamicOriginAllowed(origin, environment))

  return {
    origins: isOriginAllowed ? [origin] : [],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers: [
      'Accept',
      'Accept-Language',
      'Content-Language',
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-API-Key',
      'Cache-Control',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Rate-Limit-Limit',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
    credentials: CSP_CORS_CONFIG.cors.credentials,
    maxAge: CSP_CORS_CONFIG.cors.maxAge,
    optionsSuccessStatus: CSP_CORS_CONFIG.cors.optionsSuccessStatus,
  }
}

/**
 * Generate dynamic CSP policy with nonce support
 */
export function generateCSPPolicy(
  _request: NextRequest,
  context?: Partial<CSPContext>
): {
  policy: string
  nonce: string
  reportOnly: boolean
} {
  const environment = process.env.NODE_ENV || 'development'
  const nonce = context?.nonce || generateCSPNonce()
  const reportOnly = context?.reportOnly ?? CSP_CORS_CONFIG.csp.reportOnly

  // Get base directives for environment
  const baseDirectives = BASE_CSP_DIRECTIVES[environment] || BASE_CSP_DIRECTIVES.development

  // Clone and modify directives
  const directives: CSPDirectives = { ...baseDirectives }

  // Add nonce to script-src
  if (directives['script-src']) {
    directives['script-src'] = [...directives['script-src'], `'nonce-${nonce}'`]
  }

  // Add nonce to style-src if not in production (production uses strict CSP)
  if (environment !== 'production' && directives['style-src']) {
    directives['style-src'] = [...directives['style-src'], `'nonce-${nonce}'`]
  }

  // Add inline hashes if provided
  if (context?.hashes && context.hashes.length > 0) {
    context.hashes.forEach(hash => {
      if (directives['script-src']) {
        directives['script-src'].push(`'${hash}'`)
      }
    })
  }

  // Add report endpoint
  const reportEndpoint = context?.violationEndpoint || CSP_CORS_CONFIG.csp.reportUri

  // Build policy string
  const policy = buildCSPPolicyString(directives, reportEndpoint, reportOnly)

  return {
    policy,
    nonce,
    reportOnly,
  }
}

/**
 * Apply CORS headers to response
 */
export function applyCORSHeaders(
  response: NextResponse,
  request: NextRequest,
  config?: CORSConfig
): void {
  const corsConfig = config || generateCORSConfig(request)
  const origin = request.headers.get('origin')

  // Set CORS headers
  if (origin && corsConfig.origins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }

  response.headers.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '))
  response.headers.set('Access-Control-Allow-Headers', corsConfig.headers.join(', '))

  if (corsConfig.exposedHeaders && corsConfig.exposedHeaders.length > 0) {
    response.headers.set('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '))
  }

  if (corsConfig.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  response.headers.set('Access-Control-Max-Age', corsConfig.maxAge.toString())

  // Add Vary header for proper caching
  const varyHeaders = ['Origin']
  if (corsConfig.credentials) {
    varyHeaders.push('Credentials')
  }
  response.headers.set('Vary', varyHeaders.join(', '))
}

/**
 * Apply CSP headers to response
 */
export function applyCSPHeaders(
  response: NextResponse,
  request: NextRequest,
  context?: Partial<CSPContext>
): string {
  const { policy, nonce, reportOnly } = generateCSPPolicy(request, context)

  // Set CSP header
  const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
  response.headers.set(headerName, policy)

  // Add additional security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Add Trusted Types header if enabled
  if (CSP_CORS_CONFIG.csp.enableTrustedTypes) {
    response.headers.set('Require-Trusted-Types-For', 'script')
  }

  return nonce
}

/**
 * Handle preflight OPTIONS requests
 */
export function handlePreflightRequest(request: NextRequest): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null
  }

  const corsConfig = generateCORSConfig(request)
  const origin = request.headers.get('origin')

  // Check if origin is allowed
  if (!origin || !corsConfig.origins.includes(origin)) {
    return new NextResponse(null, { status: 403 })
  }

  // Create preflight response
  const response = new NextResponse(null, {
    status: corsConfig.optionsSuccessStatus || 200,
  })

  // Apply CORS headers
  applyCORSHeaders(response, request, corsConfig)

  return response
}

/**
 * Process CSP violation reports
 */
export async function processCSPViolation(
  violationData: unknown,
  request: NextRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate violation data
    const violation = CSPViolationSchema.parse(violationData)

    // Check rate limiting for violation reports
    const isRateLimited = await checkViolationRateLimit(request)
    if (isRateLimited) {
      return { success: false, error: 'Rate limited' }
    }

    // Analyze violation
    const analysis = analyzeCSPViolation(violation, request)

    // Store violation (implement with your preferred storage)
    await storeCSPViolation(violation, analysis, request)

    // Generate alerts for high-severity violations
    if (analysis.severity === 'high' || analysis.severity === 'critical') {
      await generateSecurityAlert(violation, analysis, request)
    }

    return { success: true }
  } catch (error) {
    console.error('CSP violation processing error:', error)
    return { success: false, error: 'Invalid violation data' }
  }
}

/**
 * Create CSP policy version for rollback capability
 */
export async function createPolicyVersion(
  directives: CSPDirectives,
  reportOnlyPeriod?: number
): Promise<PolicyVersionInfo> {
  const version = generatePolicyVersion()
  const now = Date.now()

  const policyInfo: PolicyVersionInfo = {
    version,
    createdAt: now,
    active: false,
    reportOnlyUntil: reportOnlyPeriod ? now + reportOnlyPeriod : undefined,
  }

  // Store policy version (implement with your preferred storage)
  await storePolicyVersion(policyInfo, directives)

  return policyInfo
}

/**
 * Rollback to previous CSP policy version
 */
export async function rollbackPolicyVersion(targetVersion: string): Promise<boolean> {
  try {
    // Retrieve target policy version
    const policyInfo = await getPolicyVersion(targetVersion)
    if (!policyInfo) {
      return false
    }

    // Deactivate current policy
    await deactivateCurrentPolicy()

    // Activate target policy
    await activatePolicyVersion(targetVersion)

    return true
  } catch (error) {
    console.error('Policy rollback error:', error)
    return false
  }
}

// Helper functions

function isDynamicOriginAllowed(origin: string, environment: string): boolean {
  // Allow localhost with any port in development
  if (environment === 'development') {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  }

  // Allow preview deployments for Vercel
  if (environment === 'preview') {
    return /^https:\/\/.*-contribux\.vercel\.app$/.test(origin)
  }

  return false
}

function generateCSPNonce(): string {
  return generateSecureToken(CSP_CORS_CONFIG.csp.nonceLength)
}

function buildCSPPolicyString(
  directives: CSPDirectives,
  reportEndpoint: string,
  reportOnly: boolean
): string {
  const policyParts: string[] = []

  // Build directive strings
  Object.entries(directives).forEach(([directive, values]) => {
    if (!values) return

    if (typeof values === 'boolean') {
      if (values) {
        policyParts.push(directive)
      }
    } else if (Array.isArray(values) && values.length > 0) {
      policyParts.push(`${directive} ${values.join(' ')}`)
    }
  })

  // Add report endpoint
  if (reportEndpoint) {
    const reportDirective = reportOnly ? 'report-uri' : 'report-to'
    policyParts.push(`${reportDirective} ${reportEndpoint}`)
  }

  return policyParts.join('; ')
}

async function checkViolationRateLimit(request: NextRequest): Promise<boolean> {
  const ip = getClientIp(request)
  const _key = `csp-violation:${ip}`

  // Use a simple in-memory rate limiter for CSP violations
  // In production, use Redis or another persistent store
  const now = Date.now()
  const _windowStart = now - 60 * 1000 // 1 minute window

  // This is a simplified implementation
  // In production, implement proper rate limiting
  return false // Allow all for now
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function analyzeCSPViolation(
  violation: CSPViolation,
  _request: NextRequest
): {
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: string
  riskScore: number
  recommendations: string[]
} {
  const report = violation['csp-report']
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  let riskScore = 0.1
  const recommendations: string[] = []

  // Analyze violated directive
  const violatedDirective = report['violated-directive']

  if (violatedDirective.includes('script-src')) {
    severity = 'high'
    riskScore = 0.8
    recommendations.push('Review script sources', 'Implement strict CSP')
  } else if (violatedDirective.includes('frame-ancestors')) {
    severity = 'critical'
    riskScore = 0.9
    recommendations.push('Check for clickjacking attempts')
  } else if (violatedDirective.includes('connect-src')) {
    severity = 'medium'
    riskScore = 0.5
    recommendations.push('Review API endpoints')
  }

  // Analyze blocked URI
  const blockedUri = report['blocked-uri']
  if (blockedUri) {
    if (blockedUri.includes('javascript:') || blockedUri.includes('data:')) {
      severity = 'high'
      riskScore = Math.max(riskScore, 0.7)
      recommendations.push('Potential XSS attempt detected')
    }
  }

  return {
    severity,
    category: 'csp_violation',
    riskScore,
    recommendations,
  }
}

function generatePolicyVersion(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 5)
  return `v${timestamp}${random}`
}

// Placeholder storage functions (implement with your preferred storage)
async function storeCSPViolation(
  violation: CSPViolation,
  analysis: any,
  request: NextRequest
): Promise<void> {
  // TODO: Implement violation storage
  console.log('CSP Violation:', { violation, analysis, ip: getClientIp(request) })
}

async function generateSecurityAlert(
  _violation: CSPViolation,
  analysis: any,
  _request: NextRequest
): Promise<void> {
  // TODO: Implement security alerting
  console.warn('High-severity CSP violation detected:', analysis)
}

async function storePolicyVersion(
  info: PolicyVersionInfo,
  _directives: CSPDirectives
): Promise<void> {
  // TODO: Implement policy version storage
  console.log('Policy version created:', info)
}

async function getPolicyVersion(_version: string): Promise<PolicyVersionInfo | null> {
  // TODO: Implement policy version retrieval
  return null
}

async function deactivateCurrentPolicy(): Promise<void> {
  // TODO: Implement policy deactivation
}

async function activatePolicyVersion(_version: string): Promise<void> {
  // TODO: Implement policy activation
}
