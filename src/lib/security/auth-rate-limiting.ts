/**
 * Enhanced Authentication Rate Limiting
 * Provides strict rate limiting for authentication endpoints to prevent brute force attacks
 * Portfolio showcase implementation with progressive delays and security monitoring
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getSecurityFeatures } from './feature-flags'

// Enhanced rate limiting storage for authentication endpoints
const authRateLimitMap = new Map<string, AuthRateLimit>()
const suspiciousIPMap = new Map<string, SuspiciousActivity>()
const MAX_AUTH_ENTRIES = 5000 // Memory protection

interface AuthRateLimit {
  attempts: number
  firstAttempt: number
  lastAttempt: number
  lockoutUntil?: number
  successfulAuth?: number
}

interface SuspiciousActivity {
  failedAttempts: number
  lastFailedAttempt: number
  blockedUntil?: number
  escalationLevel: number // 0=normal, 1=warning, 2=suspicious, 3=blocked
}

interface AuthRateLimitConfig {
  maxAttempts: number
  windowMs: number
  lockoutDuration: number
  progressiveDelay: boolean
  suspiciousThreshold: number
  blockDuration: number
}

/**
 * Get authentication rate limiting configuration based on environment
 */
function getAuthRateLimitConfig(): AuthRateLimitConfig {
  const features = getSecurityFeatures()

  return {
    // Base authentication rate limits
    maxAttempts: features.isDevelopment ? 10 : 5, // Very strict in production
    windowMs: 15 * 60 * 1000, // 15 minutes window
    lockoutDuration: features.isDevelopment ? 5 * 60 * 1000 : 30 * 60 * 1000, // 5m dev, 30m prod

    // Progressive security features
    progressiveDelay: true,
    suspiciousThreshold: features.isDevelopment ? 20 : 10, // Pattern detection
    blockDuration: features.isDevelopment ? 15 * 60 * 1000 : 4 * 60 * 60 * 1000, // 15m dev, 4h prod
  }
}

/**
 * Get client IP with enhanced validation for auth endpoints
 */
function getClientIP(request: NextRequest): string {
  // Enhanced IP extraction for authentication security
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfIP = request.headers.get('cf-connecting-ip') // Cloudflare

  // In production, prioritize trusted proxy headers
  if (process.env.NODE_ENV === 'production') {
    if (cfIP) return cfIP
    if (realIP) return realIP
    if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  }

  // Development fallback
  return forwarded?.split(',')[0]?.trim() || realIP || 'development-ip'
}

/**
 * Calculate progressive delay based on attempt count
 */
function calculateProgressiveDelay(attempts: number): number {
  if (attempts <= 3) return 0
  if (attempts <= 5) return 2000 // 2 seconds
  if (attempts <= 7) return 5000 // 5 seconds
  if (attempts <= 10) return 10000 // 10 seconds
  return 30000 // 30 seconds for persistent attackers
}

/**
 * Update suspicious activity tracking
 */
function updateSuspiciousActivity(ip: string, failed: boolean): void {
  const now = Date.now()
  const current = suspiciousIPMap.get(ip) || {
    failedAttempts: 0,
    lastFailedAttempt: now,
    escalationLevel: 0,
  }

  if (failed) {
    current.failedAttempts++
    current.lastFailedAttempt = now

    // Escalate threat level based on patterns
    const config = getAuthRateLimitConfig()
    if (current.failedAttempts >= config.suspiciousThreshold) {
      current.escalationLevel = Math.min(
        3,
        Math.floor(current.failedAttempts / config.suspiciousThreshold)
      )

      // Block highly suspicious IPs
      if (current.escalationLevel >= 3) {
        current.blockedUntil = now + config.blockDuration
      }
    }
  } else {
    // Successful auth - reduce suspicion but don't reset completely
    current.failedAttempts = Math.max(0, current.failedAttempts - 2)
    if (current.failedAttempts === 0) {
      current.escalationLevel = 0
      current.blockedUntil = undefined
    }
  }

  suspiciousIPMap.set(ip, current)
}

/**
 * Check if IP is currently blocked due to suspicious activity
 */
function isBlockedIP(ip: string): boolean {
  const suspicious = suspiciousIPMap.get(ip)
  if (!suspicious?.blockedUntil) return false

  const now = Date.now()
  if (now > suspicious.blockedUntil) {
    // Unblock expired blocks
    suspicious.blockedUntil = undefined
    suspicious.escalationLevel = Math.max(0, suspicious.escalationLevel - 1)
    return false
  }

  return true
}

/**
 * Enhanced authentication rate limiting check
 */
export function checkAuthRateLimit(request: NextRequest): {
  allowed: boolean
  remainingAttempts?: number
  retryAfter?: number
  escalationLevel?: number
} {
  const features = getSecurityFeatures()
  if (!features.rateLimiting) {
    return { allowed: true }
  }

  // Ensure cleanup timer is running
  ensureCleanupTimer()

  const config = getAuthRateLimitConfig()
  const ip = getClientIP(request)
  const now = Date.now()

  // Cleanup expired entries
  cleanupAuthRateLimit(now)

  // Check if IP is blocked due to suspicious activity
  if (isBlockedIP(ip)) {
    const suspicious = suspiciousIPMap.get(ip)
    return {
      allowed: false,
      retryAfter: suspicious?.blockedUntil ? suspicious.blockedUntil - now : config.blockDuration,
      escalationLevel: suspicious?.escalationLevel || 0,
    }
  }

  const current = authRateLimitMap.get(ip) || {
    attempts: 0,
    firstAttempt: now,
    lastAttempt: now,
  }

  // Check if we're in a lockout period
  if (current.lockoutUntil && now < current.lockoutUntil) {
    return {
      allowed: false,
      retryAfter: current.lockoutUntil - now,
      escalationLevel: suspiciousIPMap.get(ip)?.escalationLevel || 0,
    }
  }

  // Reset window if enough time has passed
  if (now - current.firstAttempt > config.windowMs) {
    current.attempts = 0
    current.firstAttempt = now
    current.lockoutUntil = undefined
  }

  // Check attempt limits
  if (current.attempts >= config.maxAttempts) {
    // Trigger lockout
    current.lockoutUntil = now + config.lockoutDuration
    authRateLimitMap.set(ip, current)

    // Update suspicious activity
    updateSuspiciousActivity(ip, true)

    return {
      allowed: false,
      retryAfter: config.lockoutDuration,
      escalationLevel: suspiciousIPMap.get(ip)?.escalationLevel || 0,
    }
  }

  // Allow request but increment counter
  current.attempts++
  current.lastAttempt = now
  authRateLimitMap.set(ip, current)

  return {
    allowed: true,
    remainingAttempts: config.maxAttempts - current.attempts,
    escalationLevel: suspiciousIPMap.get(ip)?.escalationLevel || 0,
  }
}

/**
 * Record authentication result (success/failure) for enhanced tracking
 */
export function recordAuthResult(request: NextRequest, success: boolean): void {
  const ip = getClientIP(request)
  const now = Date.now()

  // Update rate limit tracking
  const current = authRateLimitMap.get(ip)
  if (current) {
    if (success) {
      // Successful auth - record success timestamp
      current.successfulAuth = now
      // Reduce attempt count for successful authentication
      current.attempts = Math.max(0, current.attempts - 1)
    }
    authRateLimitMap.set(ip, current)
  }

  // Update suspicious activity tracking
  updateSuspiciousActivity(ip, !success)
}

/**
 * Create rate limit response with security headers
 */
export function createRateLimitResponse(
  message: string,
  retryAfter?: number,
  escalationLevel?: number
): NextResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Rate-Limit-Type': 'authentication',
  }

  if (retryAfter) {
    headers['Retry-After'] = Math.ceil(retryAfter / 1000).toString()
    headers['X-Rate-Limit-Reset'] = new Date(Date.now() + retryAfter).toISOString()
  }

  if (escalationLevel !== undefined) {
    headers['X-Security-Level'] = escalationLevel.toString()
  }

  return NextResponse.json(
    {
      error: message,
      type: 'rate_limit_exceeded',
      retryAfter: retryAfter ? Math.ceil(retryAfter / 1000) : undefined,
    },
    {
      status: 429,
      headers,
    }
  )
}

/**
 * Progressive delay middleware for authentication endpoints
 */
export async function applyProgressiveDelay(request: NextRequest): Promise<void> {
  const config = getAuthRateLimitConfig()
  if (!config.progressiveDelay) return

  const ip = getClientIP(request)
  const current = authRateLimitMap.get(ip)

  if (current && current.attempts > 3) {
    const delay = calculateProgressiveDelay(current.attempts)
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

/**
 * Cleanup expired authentication rate limit entries
 */
function cleanupAuthRateLimit(now: number): void {
  const config = getAuthRateLimitConfig()

  // Clean up rate limit entries
  for (const [ip, data] of authRateLimitMap.entries()) {
    if (
      (data.lockoutUntil && now > data.lockoutUntil && now - data.lastAttempt > config.windowMs) ||
      (now - data.firstAttempt > config.windowMs && data.attempts === 0)
    ) {
      authRateLimitMap.delete(ip)
    }
  }

  // Clean up suspicious activity entries
  for (const [ip, data] of suspiciousIPMap.entries()) {
    if (
      (!data.blockedUntil || now > data.blockedUntil) &&
      now - data.lastFailedAttempt > 24 * 60 * 60 * 1000 && // 24 hours
      data.failedAttempts === 0
    ) {
      suspiciousIPMap.delete(ip)
    }
  }

  // Emergency cleanup if maps get too large
  if (authRateLimitMap.size > MAX_AUTH_ENTRIES) {
    const entries = Array.from(authRateLimitMap.entries())
    entries.sort((a, b) => a[1].lastAttempt - b[1].lastAttempt)
    // Remove oldest 30%
    const toRemove = Math.floor(entries.length * 0.3)
    for (let i = 0; i < toRemove; i++) {
      authRateLimitMap.delete(entries[i]?.[0])
    }
  }
}

/**
 * Get authentication rate limit statistics (for monitoring)
 */
export function getAuthRateLimitStats(): {
  totalTrackedIPs: number
  suspiciousIPs: number
  blockedIPs: number
  highRiskIPs: number
} {
  const now = Date.now()
  let suspiciousCount = 0
  let blockedCount = 0
  let highRiskCount = 0

  for (const [, data] of suspiciousIPMap.entries()) {
    if (data.blockedUntil && now < data.blockedUntil) {
      blockedCount++
    }
    if (data.escalationLevel >= 2) {
      suspiciousCount++
    }
    if (data.escalationLevel >= 3) {
      highRiskCount++
    }
  }

  return {
    totalTrackedIPs: authRateLimitMap.size,
    suspiciousIPs: suspiciousCount,
    blockedIPs: blockedCount,
    highRiskIPs: highRiskCount,
  }
}

// Periodic cleanup (only in runtime environment)
let cleanupTimer: NodeJS.Timeout | null = null

function ensureCleanupTimer(): void {
  // Only start cleanup timer in actual runtime environment (not during build or static analysis)
  if (
    typeof window === 'undefined' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.NODE_ENV === 'production' &&
    typeof process !== 'undefined' &&
    !process.env.NEXT_PHASE && // Next.js build phases
    !cleanupTimer
  ) {
    try {
      cleanupTimer = setInterval(
        () => {
          cleanupAuthRateLimit(Date.now())
        },
        10 * 60 * 1000 // Cleanup every 10 minutes
      )
    } catch (_error) {
      // Ignore cleanup errors - not critical for operation
    }
  }
}
