/**
 * Rate Limiter Module
 * Separated for dynamic loading to reduce initial bundle size
 */

import type { NextRequest } from 'next/server'

// Lazy-loaded dependencies
let Redis: typeof import('ioredis').default | null = null
let RateLimiterRedis: typeof import('rate-limiter-flexible').RateLimiterRedis | null = null
let RateLimiterMemory: typeof import('rate-limiter-flexible').RateLimiterMemory | null = null

// Redis client and rate limiter instances
let redisClient: import('ioredis').default | null = null
let redisRateLimiter: import('rate-limiter-flexible').RateLimiterRedis | null = null
let memoryRateLimiter: import('rate-limiter-flexible').RateLimiterMemory | null = null
let redisAvailable = false

// Circuit breaker state
const circuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  timeout: 30000,
  maxFailures: 5,
}

/**
 * Initialize Redis client and rate limiters
 */
export async function initializeRedis(): Promise<void> {
  await initializeMemoryRateLimiter()

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    console.log('Redis URL not provided, using in-memory rate limiting')
    return
  }

  try {
    // Dynamic import of Redis
    Redis = (await import('ioredis')).default
    const { RateLimiterRedis: RLRedis } = await import('rate-limiter-flexible')
    RateLimiterRedis = RLRedis

    redisClient = new Redis(redisUrl, {
      connectTimeout: 5000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      keepAlive: 30000,
      family: 0,
    })

    redisClient.on('connect', () => {
      console.log('Redis connected successfully')
      redisAvailable = true
      resetCircuitBreaker()
    })

    redisClient.on('error', error => {
      console.error('Redis connection error:', error)
      handleRedisFailure()
    })

    redisClient.on('close', () => {
      console.log('Redis connection closed')
      redisAvailable = false
    })

    redisRateLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_middleware',
      points: 60,
      duration: 60,
      blockDuration: 60,
      execEvenly: true,
    })

    console.log('Redis rate limiter initialized')
  } catch (error) {
    console.error('Failed to initialize Redis:', error)
    handleRedisFailure()
  }
}

/**
 * Initialize memory-based rate limiter
 */
async function initializeMemoryRateLimiter(): Promise<void> {
  try {
    const { RateLimiterMemory: RLMemory } = await import('rate-limiter-flexible')
    RateLimiterMemory = RLMemory

    memoryRateLimiter = new RateLimiterMemory({
      keyPrefix: 'rl_memory',
      points: 60,
      duration: 60,
      blockDuration: 60,
      execEvenly: true,
    })
    console.log('Memory rate limiter initialized')
  } catch (error) {
    console.error('Failed to initialize memory rate limiter:', error)
  }
}

/**
 * Handle Redis failure
 */
function handleRedisFailure(): void {
  circuitBreakerState.failures++
  circuitBreakerState.lastFailure = Date.now()
  redisAvailable = false

  if (circuitBreakerState.failures >= circuitBreakerState.maxFailures) {
    circuitBreakerState.isOpen = true
    console.log('Circuit breaker opened due to Redis failures')
  }
}

/**
 * Reset circuit breaker
 */
function resetCircuitBreaker(): void {
  circuitBreakerState.failures = 0
  circuitBreakerState.lastFailure = 0
  circuitBreakerState.isOpen = false
}

/**
 * Check if circuit breaker is open
 */
function isCircuitBreakerOpen(): boolean {
  if (!circuitBreakerState.isOpen) {
    return false
  }

  if (Date.now() - circuitBreakerState.lastFailure > circuitBreakerState.timeout) {
    console.log('Circuit breaker timeout expired, attempting Redis reconnection')
    circuitBreakerState.isOpen = false
    circuitBreakerState.failures = Math.max(0, circuitBreakerState.failures - 1)
    return false
  }

  return true
}

/**
 * Get appropriate rate limiter
 */
export async function getRateLimiter() {
  if (!redisRateLimiter && !memoryRateLimiter) {
    await initializeRedis()
  }

  if (redisRateLimiter && redisAvailable && !isCircuitBreakerOpen()) {
    return redisRateLimiter
  }

  return memoryRateLimiter
}

/**
 * Enhanced rate limiting with Redis and memory fallback
 */
export async function rateLimit(
  request: NextRequest,
  options?: {
    limit?: number
    window?: number
    keyGenerator?: (req: NextRequest) => string
  }
) {
  const limit = options?.limit || 60
  const window = options?.window || 60 * 1000

  const key = options?.keyGenerator
    ? options.keyGenerator(request)
    : getClientIp(request) || 'anonymous'

  const rateLimiter = await getRateLimiter()
  if (!rateLimiter) {
    // Fallback to allowing the request if no rate limiter available
    return {
      allowed: true,
      limit,
      remaining: limit,
      reset: Date.now() + window,
    }
  }

  try {
    const result = await rateLimiter.consume(key)
    return {
      allowed: true,
      limit,
      remaining: result.remainingPoints || limit - 1,
      reset: Date.now() + (result.msBeforeNext || window),
    }
  } catch (rejRes: unknown) {
    if (rejRes && typeof rejRes === 'object' && 'remainingPoints' in rejRes) {
      const rateLimitError = rejRes as { msBeforeNext?: number }
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset: Date.now() + (rateLimitError.msBeforeNext || window),
      }
    }
    throw rejRes
  }
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]
    return firstIp ? firstIp.trim() : null
  }

  const realIp = request.headers.get('x-real-ip')
  return realIp || null
}

/**
 * Get rate limiter status
 */
export function getRateLimiterStatus() {
  const isRedisActive = redisRateLimiter && redisAvailable && !isCircuitBreakerOpen()

  return {
    redisAvailable,
    memoryFallbackActive: !!memoryRateLimiter,
    circuitBreakerOpen: circuitBreakerState.isOpen,
    redisFailures: circuitBreakerState.failures,
    activeStore: isRedisActive ? 'redis' : memoryRateLimiter ? 'memory' : 'none',
  }
}

/**
 * Shutdown rate limiter
 */
export async function shutdownRateLimiter(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit()
      console.log('Redis connection closed gracefully')
    } catch (error) {
      console.error('Error closing Redis connection:', error)
    }
  }
}
