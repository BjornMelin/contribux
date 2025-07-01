/**
 * Enhanced Security Middleware
 * Portfolio showcase implementation with CSP, rate limiting, and security headers
 */

import { type NextRequest, NextResponse } from 'next/server'
import { generateSecureToken } from './crypto-simple'
import { getSecurityConfig, securityFeatures } from './feature-flags'

// Rate limiting storage with size limits to prevent memory leaks
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const MAX_RATE_LIMIT_ENTRIES = 10000 // Prevent memory exhaustion

/**
 * Secure rate limiting implementation with memory protection
 */
function checkRateLimit(ip: string): boolean {
  if (!securityFeatures.rateLimiting) return true

  const config = getSecurityConfig()
  const now = Date.now()
  const key = ip

  // Cleanup expired entries and enforce size limits
  cleanupRateLimitMap(now)

  const current = rateLimitMap.get(key)

  if (!current || now > current.resetTime) {
    // Check if we've hit the size limit
    if (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
      // Remove oldest entries (simple LRU-like cleanup)
      const entries = Array.from(rateLimitMap.entries())
      entries.sort((a, b) => a[1].resetTime - b[1].resetTime)
      // Remove oldest 20% of entries
      const toRemove = Math.floor(entries.length * 0.2)
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        const entry = entries[i]
        if (entry) {
          rateLimitMap.delete(entry[0])
        }
      }
    }

    // Reset or first request
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + config.rateLimit.windowMs,
    })
    return true
  }

  if (current.count >= config.rateLimit.maxRequests) {
    return false
  }

  current.count++
  return true
}

/**
 * Cleanup expired rate limit entries
 */
function cleanupRateLimitMap(now: number): void {
  const entries = Array.from(rateLimitMap.entries())
  for (const [key, value] of entries) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}

/**
 * Validate IP address format
 */
function isValidIP(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  // IPv6 regex (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/

  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

/**
 * Get trusted client IP with anti-spoofing protection
 */
function getTrustedClientIP(request: NextRequest): string {
  // Trusted proxy configuration (Vercel, Cloudflare)
  // Note: In production, validate against these trusted proxy ranges
  const _trustedProxies = [
    '127.0.0.1',
    '::1',
    // Vercel edge network (simplified - in production would use full ranges)
    '76.76.19.0/24',
    '76.76.21.0/24',
  ]

  // In production, we'd validate against trusted proxy ranges
  // For now, only trust x-forwarded-for in specific environments
  const isVercelEnvironment = process.env.VERCEL === '1'
  const isCloudflareEnvironment = request.headers.get('cf-ray') !== null

  if (isVercelEnvironment || isCloudflareEnvironment) {
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) {
      // Take the first (leftmost) IP from the chain
      const firstIP = forwardedFor.split(',')[0]?.trim()
      if (firstIP && isValidIP(firstIP)) {
        return firstIP
      }
    }

    const realIP = request.headers.get('x-real-ip')
    if (realIP && isValidIP(realIP)) {
      return realIP
    }
  }

  // Fallback when no valid IP can be extracted
  return 'unknown'
}

/**
 * Generate secure Content Security Policy with nonce (no unsafe-inline)
 */
function generateCSP(nonce: string): string {
  const policies = [
    "default-src 'self'",
    // Secure script-src without unsafe-inline
    `script-src 'self' 'nonce-${nonce}' https://vercel.live`,
    // Secure style-src with hash-based allowance for specific styles
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com 'sha256-tQjf8gvb2ROOMapIxFvFAYBeUJ0v1HCbOcSmDNXGtDo='`,
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.github.com https://vercel.live wss://ws.localhost:* wss://*.vercel.app",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ]

  if (securityFeatures.isDevelopment) {
    // Development-specific relaxations (still secure)
    policies.push(`script-src-elem 'self' 'nonce-${nonce}' https://vercel.live`)
    policies.push(`style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`)
    // Allow localhost connections for development
    policies.push(
      "connect-src 'self' https://api.github.com https://vercel.live http://localhost:* ws://localhost:* wss://ws.localhost:*"
    )
  }

  return policies.join('; ')
}

/**
 * Apply comprehensive security headers
 */
function applySecurityHeaders(response: NextResponse, nonce: string): void {
  // Content Security Policy
  response.headers.set('Content-Security-Policy', generateCSP(nonce))

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // HSTS (only in production)
  if (securityFeatures.isProduction) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // Permissions Policy
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // CORS headers for API routes
  response.headers.set('Access-Control-Allow-Origin', 'https://contribux.vercel.app')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
}

/**
 * Basic request validation
 */
function validateRequest(request: NextRequest): { valid: boolean; message?: string } {
  // URL parsing available for future validation rules
  const _url = new URL(request.url)

  // Check request size
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number.parseInt(contentLength) > 10 * 1024 * 1024) {
    // 10MB
    return { valid: false, message: 'Request too large' }
  }

  // Validate content type for POST requests
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type')
    if (
      !contentType ||
      (!contentType.includes('application/json') &&
        !contentType.includes('application/x-www-form-urlencoded') &&
        !contentType.includes('multipart/form-data'))
    ) {
      return { valid: false, message: 'Invalid content type' }
    }
  }

  // Check for suspicious patterns in headers
  const suspiciousPatterns = [/<script/i, /javascript:/i, /vbscript:/i, /onload=/i, /onerror=/i]

  // Check common headers for suspicious patterns
  const headersToCheck = ['user-agent', 'referer', 'x-forwarded-for', 'x-real-ip']
  for (const headerName of headersToCheck) {
    const value = request.headers.get(headerName)
    if (value) {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          return { valid: false, message: 'Suspicious header content' }
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Enhanced security middleware
 */
export async function enhancedSecurityMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const startTime = Date.now()

  // Skip middleware for static files and API routes that don't need security
  const url = new URL(request.url)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/favicon.ico') ||
    url.pathname.startsWith('/public/')
  ) {
    return null
  }

  try {
    // Rate limiting check with secure IP extraction
    const clientIP = getTrustedClientIP(request)

    if (!checkRateLimit(clientIP)) {
      return new NextResponse('Rate limit exceeded', { status: 429 })
    }

    // Request validation
    const validation = validateRequest(request)
    if (!validation.valid) {
      return new NextResponse(JSON.stringify({ error: validation.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 200 })
      const nonce = generateSecureToken(16)
      applySecurityHeaders(response, nonce)
      return response
    }

    // Generate nonce for CSP
    const nonce = generateSecureToken(16)

    // Create response with security headers
    const response = NextResponse.next()
    applySecurityHeaders(response, nonce)

    // Add security metrics (if advanced monitoring enabled)
    if (securityFeatures.advancedMonitoring) {
      response.headers.set('X-Security-Processing-Time', `${Date.now() - startTime}ms`)
      response.headers.set('X-Security-Version', '1.0')
    }

    return response
  } catch (_error) {
    // Security-focused error handling - fail securely
    // In production, log to proper monitoring system instead of console

    const fallbackResponse = NextResponse.next()
    fallbackResponse.headers.set('X-Frame-Options', 'DENY')
    fallbackResponse.headers.set('X-Content-Type-Options', 'nosniff')

    return fallbackResponse
  }
}

/**
 * Cleanup rate limit map periodically
 */
setInterval(
  () => {
    const now = Date.now()
    cleanupRateLimitMap(now)

    // Additional size-based cleanup if we're still too large
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES * 0.8) {
      const entries = Array.from(rateLimitMap.entries())
      entries.sort((a, b) => a[1].resetTime - b[1].resetTime)
      // Remove oldest 30% of entries
      const toRemove = Math.floor(entries.length * 0.3)
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        const entry = entries[i]
        if (entry) {
          rateLimitMap.delete(entry[0])
        }
      }
    }
  },
  5 * 60 * 1000
) // Cleanup every 5 minutes
