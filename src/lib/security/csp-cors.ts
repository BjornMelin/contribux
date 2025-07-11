/**
 * Advanced CSP and CORS Security Module
 * Enterprise-grade security configuration for Next.js 15
 */

import type { NextRequest, NextResponse } from 'next/server'
import { env, isDevelopment, isProduction } from '@/lib/validation/env'

export interface CSPDirectives {
  'default-src': string[]
  'script-src': string[]
  'style-src': string[]
  'img-src': string[]
  'font-src': string[]
  'connect-src': string[]
  'media-src': string[]
  'object-src': string[]
  'child-src': string[]
  'worker-src': string[]
  'frame-src': string[]
  'form-action': string[]
  'base-uri': string[]
  'manifest-src': string[]
  'report-uri': string[]
  'report-to': string[]
}

/**
 * Enhanced CSP directives for Next.js 15 with React 19
 */
export function getEnhancedCSPDirectives(): CSPDirectives {
  const baseDirectives: CSPDirectives = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-eval'", // Required for Next.js development
      "'unsafe-inline'", // Fallback for older browsers
      'https://vercel.live',
      'https://va.vercel-scripts.com',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for CSS-in-JS and Tailwind
      'https://fonts.googleapis.com',
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https:',
      'https://avatars.githubusercontent.com',
      'https://github.com',
      'https://api.github.com',
    ],
    'font-src': ["'self'", 'data:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      'https://api.github.com',
      'https://github.com',
      'wss://ws.github.com',
      env.DATABASE_URL ? new URL(env.DATABASE_URL).origin : '',
    ].filter(Boolean),
    'media-src': ["'self'", 'data:', 'blob:'],
    'object-src': ["'none'"],
    'child-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'manifest-src': ["'self'"],
    'report-uri': ['/api/security/csp-report'],
    'report-to': ['csp-violations'],
  }

  // Environment-specific adjustments
  if (isDevelopment()) {
    // Development-specific sources
    baseDirectives['connect-src'].push(
      'http://localhost:*',
      'ws://localhost:*',
      'wss://localhost:*'
    )
    baseDirectives['script-src'].push('http://localhost:*')
  }

  if (isProduction()) {
    // Production-specific sources
    baseDirectives['connect-src'].push('https://contribux.vercel.app', 'https://www.contribux.dev')
    // Remove unsafe-eval in production if possible
    baseDirectives['script-src'] = baseDirectives['script-src'].filter(
      src => src !== "'unsafe-eval'"
    )
  }

  return baseDirectives
}

/**
 * Build CSP header string with nonce support
 */
export function buildEnhancedCSP(directives: CSPDirectives, nonce?: string): string {
  const cspParts: string[] = []

  for (const [directive, sources] of Object.entries(directives)) {
    if (sources.length === 0) continue

    const directiveSources = [...sources]

    // Add nonce to script-src and style-src if provided
    if (nonce && (directive === 'script-src' || directive === 'style-src')) {
      directiveSources.push(`'nonce-${nonce}'`)
    }

    cspParts.push(`${directive} ${directiveSources.join(' ')}`)
  }

  return cspParts.join('; ')
}

/**
 * Advanced CORS configuration with dynamic origin validation
 */
export interface CORSConfig {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  credentials: boolean
  maxAge: number
  preflightContinue: boolean
  optionsSuccessStatus: number
}

/**
 * Get CORS configuration based on environment
 */
export function getCORSConfig(): CORSConfig {
  const baseConfig: CORSConfig = {
    allowedOrigins: [],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-File-Name',
      'X-CSRF-Token',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-RateLimit-Policy',
      'X-Request-ID',
      'X-Response-Time',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }

  if (isProduction()) {
    baseConfig.allowedOrigins = [
      'https://contribux.vercel.app',
      'https://www.contribux.dev',
      env.NEXTAUTH_URL,
    ].filter((url): url is string => Boolean(url))
  } else {
    baseConfig.allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001', // Storybook
      env.NEXTAUTH_URL,
    ].filter((url): url is string => Boolean(url))
  }

  return baseConfig
}

/**
 * Apply CORS headers to response
 */
export function applyCORSHeaders(
  response: NextResponse,
  request: NextRequest,
  config: CORSConfig = getCORSConfig()
): void {
  const origin = request.headers.get('origin')
  const method = request.method

  // Determine allowed origin
  let allowedOrigin = '*'
  if (config.credentials && origin) {
    allowedOrigin = config.allowedOrigins.includes(origin)
      ? origin
      : config.allowedOrigins[0] || '*'
  }

  // Set CORS headers
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  response.headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '))
  response.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '))
  response.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
  response.headers.set('Access-Control-Allow-Credentials', config.credentials.toString())
  response.headers.set('Access-Control-Max-Age', config.maxAge.toString())

  // Add Vary header for proper caching
  const varyHeaders = ['Origin']
  if (method === 'OPTIONS') {
    varyHeaders.push('Access-Control-Request-Method', 'Access-Control-Request-Headers')
  }
  response.headers.set('Vary', varyHeaders.join(', '))

  // Handle preflight requests
  if (method === 'OPTIONS') {
    response.headers.set('Content-Length', '0')
  }
}

/**
 * Security headers for enhanced protection
 */
export interface SecurityHeaders {
  'X-Frame-Options': string
  'X-Content-Type-Options': string
  'X-XSS-Protection': string
  'Referrer-Policy': string
  'Permissions-Policy': string
  'Cross-Origin-Embedder-Policy': string
  'Cross-Origin-Opener-Policy': string
  'Cross-Origin-Resource-Policy': string
  'Strict-Transport-Security': string
}

/**
 * Get security headers based on environment
 */
export function getSecurityHeaders(): SecurityHeaders {
  const baseHeaders: SecurityHeaders = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()',
      'display-capture=()',
      'screen-wake-lock=()',
      'web-share=()',
      'picture-in-picture=()',
      'fullscreen=(self)',
    ].join(', '),
    'Cross-Origin-Embedder-Policy': isProduction() ? 'require-corp' : 'unsafe-none',
    'Cross-Origin-Opener-Policy': isProduction() ? 'same-origin' : 'unsafe-none',
    'Cross-Origin-Resource-Policy': isProduction() ? 'same-site' : 'cross-origin',
    'Strict-Transport-Security': isProduction()
      ? 'max-age=63072000; includeSubDomains; preload'
      : 'max-age=31536000; includeSubDomains',
  }

  return baseHeaders
}

/**
 * Apply all security headers to response
 */
export function applySecurityHeaders(response: NextResponse, nonce?: string): void {
  const headers = getSecurityHeaders()
  const cspDirectives = getEnhancedCSPDirectives()

  // Apply CSP
  const csp = buildEnhancedCSP(cspDirectives, nonce)
  response.headers.set('Content-Security-Policy', csp)

  // Apply other security headers
  for (const [header, value] of Object.entries(headers)) {
    response.headers.set(header, value)
  }

  // Remove potentially dangerous headers
  response.headers.delete('X-Powered-By')
  response.headers.delete('Server')

  // Add additional security headers
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  // Add reporting headers for production
  if (isProduction()) {
    // Network Error Logging
    response.headers.set(
      'NEL',
      JSON.stringify({
        report_to: 'network-errors',
        max_age: 86400,
        include_subdomains: true,
        success_fraction: 0.01,
        failure_fraction: 1.0,
      })
    )

    // Report-To header
    response.headers.set(
      'Report-To',
      JSON.stringify([
        {
          group: 'csp-violations',
          max_age: 86400,
          endpoints: [{ url: '/api/security/csp-report' }],
        },
        {
          group: 'network-errors',
          max_age: 86400,
          endpoints: [{ url: '/api/security/network-report' }],
        },
      ])
    )
  }
}

/**
 * Validate and sanitize origin for security
 */
export function validateOrigin(origin: string | null): boolean {
  if (!origin) return false

  const config = getCORSConfig()
  return config.allowedOrigins.includes(origin)
}

/**
 * Generate Content Security Policy violation report handler
 */
export function createCSPViolationHandler() {
  return (_request: NextRequest) => {}
}
