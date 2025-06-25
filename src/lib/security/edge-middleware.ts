/**
 * Enhanced Vercel Edge Middleware for Ultra-Fast Security
 * Implements rate limiting, DDoS protection, geo-blocking, bot detection,
 * and real-time threat intelligence at the edge
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createSecureHash, generateSecureToken } from './crypto'

// Edge security configuration
export const EDGE_SECURITY_CONFIG = {
  // Rate limiting tiers
  rateLimiting: {
    global: { requests: 1000, window: 60 * 1000 }, // 1000 req/min global
    perIp: { requests: 100, window: 60 * 1000 }, // 100 req/min per IP
    perUser: { requests: 200, window: 60 * 1000 }, // 200 req/min per user
    perEndpoint: { requests: 50, window: 60 * 1000 }, // 50 req/min per sensitive endpoint
  },
  // DDoS protection
  ddos: {
    burstThreshold: 50, // requests in burst window
    burstWindow: 5 * 1000, // 5 seconds
    suspiciousThreshold: 20, // consecutive failed requests
    blockDuration: 15 * 60 * 1000, // 15 minutes
  },
  // Bot detection
  botDetection: {
    maxFingerprints: 10, // max fingerprints per IP
    fingerprintWindow: 60 * 60 * 1000, // 1 hour
    suspiciousPatterns: [
      /bot|crawler|spider|scraper/i,
      /automated|script|tool/i,
      /headless|phantom|selenium/i,
    ],
  },
  // Geo-blocking
  geoBlocking: {
    allowedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP'], // ISO country codes
    blockedCountries: ['CN', 'RU', 'KP'], // High-risk countries
    enableStrictMode: false, // Block all except allowed
  },
  // Challenge thresholds
  challenges: {
    captchaThreshold: 0.6, // Risk score threshold for CAPTCHA
    jsChallenge: 0.4, // Risk score threshold for JS challenge
    blockThreshold: 0.8, // Risk score threshold for blocking
  },
} as const

// Edge storage using global variables (persists for edge function lifetime)
interface EdgeCacheEntry {
  value: unknown
  expires: number
  metadata?: Record<string, unknown>
}

const _edgeCache = new Map<string, EdgeCacheEntry>()
const rateLimitCache = new Map<
  string,
  { count: number; reset: number; burst: number; lastRequest: number }
>()
const threatIntelCache = new Map<string, { risk: number; expires: number; reason: string }>()
const _botDetectionCache = new Map<
  string,
  { fingerprints: Set<string>; firstSeen: number; suspiciousCount: number }
>()

// Types
interface SecurityAnalysis {
  riskScore: number
  threats: string[]
  recommendations: string[]
  clientInfo: ClientInfo
}

interface ClientInfo {
  ip: string
  userAgent: string
  fingerprint: string
  country?: string
  isBot: boolean
  isTor: boolean
  isVpn: boolean
  reputation: number
}

interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  reset: number
  retryAfter?: number
}

interface EdgeSecurityDecision {
  action: 'allow' | 'challenge' | 'block' | 'captcha'
  riskScore: number
  reasons: string[]
  headers: Record<string, string>
  cacheTtl?: number
}

/**
 * Main edge security middleware function
 */
export async function enhancedEdgeMiddleware(
  request: NextRequest
): Promise<NextResponse | undefined> {
  const startTime = Date.now()

  try {
    // Extract client information
    const clientInfo = await extractClientInfo(request)

    // Perform security analysis
    const securityAnalysis = await performSecurityAnalysis(request, clientInfo)

    // Check rate limits
    const rateLimitResult = await checkRateLimits(request, clientInfo)

    // Make security decision
    const decision = await makeSecurityDecision(securityAnalysis, rateLimitResult, request)

    // Apply decision
    const response = await applySecurityDecision(decision, request, clientInfo)

    // Add security headers
    if (response) {
      addSecurityHeaders(response, decision, Date.now() - startTime)
    }

    return response
  } catch (error) {
    console.error('Edge security middleware error:', error)

    // Fail open with basic rate limiting
    const basicLimit = await basicRateLimit(request)
    if (!basicLimit.allowed) {
      return new NextResponse('Rate limit exceeded', {
        status: 429,
        headers: {
          'Retry-After': basicLimit.retryAfter?.toString() || '60',
          'X-RateLimit-Limit': basicLimit.limit.toString(),
          'X-RateLimit-Remaining': '0',
        },
      })
    }

    return undefined
  }
}

/**
 * Extract comprehensive client information
 */
async function extractClientInfo(request: NextRequest): Promise<ClientInfo> {
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') || ''

  // Generate client fingerprint
  const fingerprint = await generateClientFingerprint(request)

  // Get geolocation info (in production, use edge geo API)
  const country = getCountryFromHeaders(request)

  // Detect bots and automation
  const isBot = detectBot(userAgent, request)

  // Detect Tor/VPN (simplified - use threat intel in production)
  const isTor = detectTor(ip, request)
  const isVpn = detectVpn(ip, request)

  // Calculate IP reputation
  const reputation = await calculateIpReputation(ip)

  return {
    ip,
    userAgent,
    fingerprint,
    ...(country && { country }),
    isBot,
    isTor,
    isVpn,
    reputation,
  }
}

/**
 * Perform comprehensive security analysis
 */
async function performSecurityAnalysis(
  request: NextRequest,
  clientInfo: ClientInfo
): Promise<SecurityAnalysis> {
  const threats: string[] = []
  let riskScore = 0

  // Analyze IP reputation
  if (clientInfo.reputation < 0.3) {
    threats.push('low_ip_reputation')
    riskScore += 0.4
  }

  // Check for Tor/VPN usage
  if (clientInfo.isTor) {
    threats.push('tor_usage')
    riskScore += 0.6
  }

  if (clientInfo.isVpn) {
    threats.push('vpn_usage')
    riskScore += 0.3
  }

  // Bot detection
  if (clientInfo.isBot) {
    threats.push('automated_client')
    riskScore += 0.5
  }

  // Geo-blocking analysis
  if (
    clientInfo.country &&
    (EDGE_SECURITY_CONFIG.geoBlocking.blockedCountries as readonly string[]).includes(
      clientInfo.country
    )
  ) {
    threats.push('blocked_geography')
    riskScore += 0.7
  }

  // Analyze request patterns
  const patternAnalysis = await analyzeRequestPatterns(request, clientInfo)
  threats.push(...patternAnalysis.threats)
  riskScore += patternAnalysis.riskIncrease

  // DDoS detection
  const ddosRisk = await detectDDoSPatterns(clientInfo.ip)
  if (ddosRisk > 0.5) {
    threats.push('ddos_pattern')
    riskScore += ddosRisk
  }

  // Generate recommendations
  const recommendations = generateSecurityRecommendations(threats, riskScore)

  return {
    riskScore: Math.min(1, riskScore),
    threats,
    recommendations,
    clientInfo,
  }
}

/**
 * Advanced rate limiting with multiple tiers
 */
async function checkRateLimits(
  request: NextRequest,
  clientInfo: ClientInfo
): Promise<RateLimitResult> {
  const now = Date.now()
  const ip = clientInfo.ip
  const endpoint = request.nextUrl.pathname

  // Check global rate limit first
  const globalResult = await checkSingleRateLimit(
    'global',
    EDGE_SECURITY_CONFIG.rateLimiting.global,
    now
  )
  if (!globalResult.allowed) {
    return globalResult
  }

  // Check per-IP rate limit
  const ipResult = await checkSingleRateLimit(
    `ip:${ip}`,
    EDGE_SECURITY_CONFIG.rateLimiting.perIp,
    now
  )
  if (!ipResult.allowed) {
    return ipResult
  }

  // Check per-endpoint rate limit for sensitive endpoints
  if (isSensitiveEndpoint(endpoint)) {
    const endpointResult = await checkSingleRateLimit(
      `endpoint:${endpoint}:${ip}`,
      EDGE_SECURITY_CONFIG.rateLimiting.perEndpoint,
      now
    )
    if (!endpointResult.allowed) {
      return endpointResult
    }
  }

  // Check burst protection
  const burstResult = await checkBurstProtection(ip, now)
  if (!burstResult.allowed) {
    return burstResult
  }

  return globalResult // Return the most permissive result
}

/**
 * Make security decision based on analysis
 */
async function makeSecurityDecision(
  analysis: SecurityAnalysis,
  rateLimitResult: RateLimitResult,
  _request: NextRequest
): Promise<EdgeSecurityDecision> {
  let action: EdgeSecurityDecision['action'] = 'allow'
  const reasons: string[] = []
  const headers: Record<string, string> = {}

  // Rate limiting decision
  if (!rateLimitResult.allowed) {
    action = 'block'
    reasons.push('rate_limit_exceeded')
    headers['Retry-After'] = rateLimitResult.retryAfter?.toString() || '60'
    headers['X-RateLimit-Limit'] = rateLimitResult.limit.toString()
    headers['X-RateLimit-Remaining'] = rateLimitResult.remaining.toString()
  }

  // Risk-based decision
  else if (analysis.riskScore >= EDGE_SECURITY_CONFIG.challenges.blockThreshold) {
    action = 'block'
    reasons.push('high_risk_score', ...analysis.threats)
  } else if (analysis.riskScore >= EDGE_SECURITY_CONFIG.challenges.captchaThreshold) {
    action = 'captcha'
    reasons.push('medium_risk_score', ...analysis.threats)
  } else if (analysis.riskScore >= EDGE_SECURITY_CONFIG.challenges.jsChallenge) {
    action = 'challenge'
    reasons.push('elevated_risk_score', ...analysis.threats)
  }

  // Override for specific threats
  if (analysis.threats.includes('ddos_pattern')) {
    action = 'block'
    reasons.push('ddos_protection')
  }

  if (analysis.threats.includes('blocked_geography')) {
    action = 'block'
    reasons.push('geo_blocking')
  }

  return {
    action,
    riskScore: analysis.riskScore,
    reasons: Array.from(new Set(reasons)),
    headers,
    cacheTtl: calculateCacheTtl(action, analysis.riskScore),
  }
}

/**
 * Apply security decision and return appropriate response
 */
async function applySecurityDecision(
  decision: EdgeSecurityDecision,
  request: NextRequest,
  clientInfo: ClientInfo
): Promise<NextResponse | undefined> {
  // Log security decision
  await logSecurityDecision(decision, request, clientInfo)

  switch (decision.action) {
    case 'allow':
      return undefined // Continue to next middleware

    case 'block':
      return new NextResponse('Access Denied', {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...decision.headers,
        },
      })

    case 'captcha':
      return await serveCaptchaChallenge(request, decision)

    case 'challenge':
      return await serveJavaScriptChallenge(request, decision)

    default:
      return undefined
  }
}

/**
 * Add comprehensive security headers
 */
function addSecurityHeaders(
  response: NextResponse,
  decision: EdgeSecurityDecision,
  processingTime: number
): void {
  // Core security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Edge security specific headers
  response.headers.set('X-Edge-Security-Score', decision.riskScore.toString())
  response.headers.set('X-Edge-Processing-Time', `${processingTime}ms`)
  response.headers.set('X-Edge-Decision', decision.action)

  if (decision.cacheTtl) {
    response.headers.set(
      'Cache-Control',
      `private, max-age=${Math.floor(decision.cacheTtl / 1000)}`
    )
  }

  // Add custom headers from decision
  Object.entries(decision.headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
}

// Helper functions

function getClientIp(request: NextRequest): string {
  // Check various headers for the real client IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback to CF-Connecting-IP (Cloudflare) or Vercel headers
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) {
    return cfIp
  }

  const vercelIp = request.headers.get('x-vercel-forwarded-for')
  if (vercelIp) {
    return vercelIp
  }

  return 'unknown'
}

async function generateClientFingerprint(request: NextRequest): Promise<string> {
  const components = [
    request.headers.get('user-agent') || '',
    request.headers.get('accept') || '',
    request.headers.get('accept-language') || '',
    request.headers.get('accept-encoding') || '',
    getClientIp(request),
  ]

  return await createSecureHash(components.join('|'))
}

function getCountryFromHeaders(request: NextRequest): string | undefined {
  // Try various geo headers
  return (
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('x-country-code') ||
    undefined
  )
}

function detectBot(userAgent: string, request: NextRequest): boolean {
  // Check user agent patterns
  for (const pattern of EDGE_SECURITY_CONFIG.botDetection.suspiciousPatterns) {
    if (pattern.test(userAgent)) {
      return true
    }
  }

  // Check for missing common headers
  const commonHeaders = ['accept', 'accept-language', 'accept-encoding']
  const missingHeaders = commonHeaders.filter(header => !request.headers.get(header))

  return missingHeaders.length >= 2
}

function detectTor(ip: string, request: NextRequest): boolean {
  // Simplified Tor detection - in production, use threat intelligence
  return request.headers.get('x-tor-exit-node') === '1' || ip.startsWith('127.') // Placeholder for Tor exit node detection
}

function detectVpn(_ip: string, request: NextRequest): boolean {
  // Simplified VPN detection - in production, use threat intelligence
  return request.headers.get('x-vpn-detected') === '1' || false // Placeholder for VPN detection
}

async function calculateIpReputation(ip: string): Promise<number> {
  // Check threat intel cache
  const cached = threatIntelCache.get(ip)
  if (cached && cached.expires > Date.now()) {
    return 1 - cached.risk // Convert risk to reputation
  }

  // In production, query threat intelligence APIs
  // For now, return neutral reputation
  const reputation = 0.5

  // Cache result
  threatIntelCache.set(ip, {
    risk: 1 - reputation,
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    reason: 'default',
  })

  return reputation
}

async function analyzeRequestPatterns(
  request: NextRequest,
  _clientInfo: ClientInfo
): Promise<{ threats: string[]; riskIncrease: number }> {
  const threats: string[] = []
  let riskIncrease = 0

  // Check for suspicious paths
  const path = request.nextUrl.pathname
  const suspiciousPaths = ['/admin', '/.env', '/config', '/backup', '/.git']

  if (suspiciousPaths.some(p => path.includes(p))) {
    threats.push('suspicious_path')
    riskIncrease += 0.3
  }

  // Check request method
  if (['TRACE', 'TRACK', 'CONNECT'].includes(request.method)) {
    threats.push('suspicious_method')
    riskIncrease += 0.4
  }

  // Check for SQL injection patterns in query parameters
  const query = request.nextUrl.search
  const sqlPatterns = /(\bselect\b|\bunion\b|\binsert\b|\bdelete\b|\bdrop\b)/i
  if (sqlPatterns.test(query)) {
    threats.push('sql_injection_attempt')
    riskIncrease += 0.6
  }

  return { threats, riskIncrease }
}

async function detectDDoSPatterns(ip: string): Promise<number> {
  const now = Date.now()
  const key = `ddos:${ip}`
  const record = rateLimitCache.get(key)

  if (!record) {
    rateLimitCache.set(key, {
      count: 1,
      reset: now + EDGE_SECURITY_CONFIG.ddos.burstWindow,
      burst: 1,
      lastRequest: now,
    })
    return 0
  }

  // Check burst rate
  const timeSinceLastRequest = now - record.lastRequest
  if (timeSinceLastRequest < 100) {
    // Less than 100ms between requests
    record.burst++
  } else {
    record.burst = Math.max(1, record.burst - 1) // Decay burst counter
  }

  record.lastRequest = now
  record.count++

  // Calculate DDoS risk based on burst rate
  const burstRisk = Math.min(1, record.burst / EDGE_SECURITY_CONFIG.ddos.burstThreshold)

  return burstRisk
}

async function checkSingleRateLimit(
  key: string,
  config: { requests: number; window: number },
  now: number
): Promise<RateLimitResult> {
  const record = rateLimitCache.get(key)

  if (!record || record.reset < now) {
    // Create new record
    const reset = now + config.window
    rateLimitCache.set(key, {
      count: 1,
      reset,
      burst: 0,
      lastRequest: now,
    })

    return {
      allowed: true,
      limit: config.requests,
      remaining: config.requests - 1,
      reset,
    }
  }

  // Check if limit exceeded
  if (record.count >= config.requests) {
    return {
      allowed: false,
      limit: config.requests,
      remaining: 0,
      reset: record.reset,
      retryAfter: Math.ceil((record.reset - now) / 1000),
    }
  }

  // Increment count
  record.count++
  rateLimitCache.set(key, record)

  return {
    allowed: true,
    limit: config.requests,
    remaining: config.requests - record.count,
    reset: record.reset,
  }
}

async function checkBurstProtection(ip: string, now: number): Promise<RateLimitResult> {
  return await checkSingleRateLimit(
    `burst:${ip}`,
    {
      requests: EDGE_SECURITY_CONFIG.ddos.burstThreshold,
      window: EDGE_SECURITY_CONFIG.ddos.burstWindow,
    },
    now
  )
}

function isSensitiveEndpoint(path: string): boolean {
  const sensitivePatterns = ['/api/auth', '/api/admin', '/api/user', '/api/payment']
  return sensitivePatterns.some(pattern => path.startsWith(pattern))
}

function generateSecurityRecommendations(threats: string[], riskScore: number): string[] {
  const recommendations: string[] = []

  if (threats.includes('low_ip_reputation')) {
    recommendations.push('ip_reputation_check')
  }

  if (threats.includes('automated_client')) {
    recommendations.push('bot_challenge')
  }

  if (threats.includes('ddos_pattern')) {
    recommendations.push('rate_limiting', 'connection_throttling')
  }

  if (riskScore > 0.7) {
    recommendations.push('enhanced_monitoring', 'manual_review')
  }

  return recommendations
}

function calculateCacheTtl(action: string, riskScore: number): number {
  switch (action) {
    case 'block':
      return 15 * 60 * 1000 // 15 minutes
    case 'captcha':
      return 5 * 60 * 1000 // 5 minutes
    case 'challenge':
      return 2 * 60 * 1000 // 2 minutes
    default:
      return Math.max(30 * 1000, (1 - riskScore) * 60 * 1000) // 30s to 1 minute
  }
}

async function logSecurityDecision(
  decision: EdgeSecurityDecision,
  request: NextRequest,
  clientInfo: ClientInfo
): Promise<void> {
  // In production, send to security monitoring system
  console.log('Edge Security Decision:', {
    action: decision.action,
    riskScore: decision.riskScore,
    reasons: decision.reasons,
    ip: clientInfo.ip,
    path: request.nextUrl.pathname,
    userAgent: clientInfo.userAgent,
    timestamp: new Date().toISOString(),
  })
}

async function serveCaptchaChallenge(
  _request: NextRequest,
  decision: EdgeSecurityDecision
): Promise<NextResponse> {
  // In production, integrate with CAPTCHA service
  const challengeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Security Check</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
      <h1>Security Verification Required</h1>
      <p>Please complete the security check to continue.</p>
      <p>Reason: ${decision.reasons.join(', ')}</p>
      <!-- CAPTCHA widget would go here -->
    </body>
    </html>
  `

  return new NextResponse(challengeHtml, {
    status: 403,
    headers: {
      'Content-Type': 'text/html',
      ...decision.headers,
    },
  })
}

async function serveJavaScriptChallenge(
  _request: NextRequest,
  decision: EdgeSecurityDecision
): Promise<NextResponse> {
  const challengeToken = generateSecureToken(16)

  const challengeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Verifying...</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body>
      <h1>Verifying your browser...</h1>
      <p>This process is automatic. You will be redirected shortly.</p>
      <script>
        // JavaScript challenge logic
        setTimeout(() => {
          window.location.href = window.location.href + '?challenge=${challengeToken}';
        }, 2000);
      </script>
    </body>
    </html>
  `

  return new NextResponse(challengeHtml, {
    status: 403,
    headers: {
      'Content-Type': 'text/html',
      ...decision.headers,
    },
  })
}

async function basicRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const ip = getClientIp(request)
  const now = Date.now()

  return await checkSingleRateLimit(
    `basic:${ip}`,
    { requests: 60, window: 60 * 1000 }, // 60 requests per minute
    now
  )
}

/**
 * Main edge security middleware function
 */
export async function edgeSecurityMiddleware(request: NextRequest): Promise<NextResponse> {
  const _startTime = Date.now()

  try {
    // Quick rate limiting check
    const rateLimitResult = await basicRateLimit(request)
    if (!rateLimitResult.allowed) {
      return new NextResponse('Rate limit exceeded', {
        status: 429,
        headers: {
          'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      })
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Edge security middleware error:', error)
    return NextResponse.next()
  }
}

// Export individual configuration objects for testing
export const RATE_LIMIT_CONFIG = EDGE_SECURITY_CONFIG.rateLimiting
export const DDOS_CONFIG = EDGE_SECURITY_CONFIG.ddos
export const GEO_BLOCKING_CONFIG = EDGE_SECURITY_CONFIG.geoBlocking
export const BOT_DETECTION_CONFIG = EDGE_SECURITY_CONFIG.botDetection
