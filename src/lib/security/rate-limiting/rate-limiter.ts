/**
 * Comprehensive Rate Limiting System
 * Implements token bucket and sliding window algorithms with Redis backend
 * Provides configurable rate limiting for different endpoints and use cases
 */

import type { RedisClientType } from '@redis/client'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

// Rate limiting algorithms
export enum RateLimitAlgorithm {
  TOKEN_BUCKET = 'token_bucket',
  SLIDING_WINDOW = 'sliding_window',
  FIXED_WINDOW = 'fixed_window',
}

// Rate limit configuration schema
export const RateLimitConfigSchema = z.object({
  algorithm: z.nativeEnum(RateLimitAlgorithm),
  maxRequests: z.number().int().positive(),
  windowMs: z.number().int().positive(),
  blockDurationMs: z.number().int().positive().optional(),
  keyPrefix: z.string().optional(),
  skipSuccessfulRequests: z.boolean().optional(),
  skipFailedRequests: z.boolean().optional(),
})

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>

// Rate limit result
export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: Date
  retryAfter?: number
}

// Rate limiter interface
export interface IRateLimiter {
  checkLimit(identifier: string, config?: Partial<RateLimitConfig>): Promise<RateLimitResult>
  resetLimit(identifier: string): Promise<void>
  getRemainingLimit(identifier: string): Promise<number>
}

/**
 * Redis-based rate limiter implementation
 */
export class RedisRateLimiter implements IRateLimiter {
  private redis: RedisClientType | null = null
  private defaultConfig: RateLimitConfig

  constructor(redis: RedisClientType | null, defaultConfig: RateLimitConfig) {
    this.redis = redis
    this.defaultConfig = defaultConfig
  }

  async checkLimit(
    identifier: string,
    config?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const finalConfig = { ...this.defaultConfig, ...config }
    const key = this.generateKey(identifier, finalConfig.keyPrefix)

    if (!this.redis) {
      // Fallback to in-memory rate limiting
      return this.checkInMemoryLimit(identifier, finalConfig)
    }

    try {
      switch (finalConfig.algorithm) {
        case RateLimitAlgorithm.TOKEN_BUCKET:
          return await this.checkTokenBucket(key, finalConfig)
        case RateLimitAlgorithm.SLIDING_WINDOW:
          return await this.checkSlidingWindow(key, finalConfig)
        case RateLimitAlgorithm.FIXED_WINDOW:
          return await this.checkFixedWindow(key, finalConfig)
        default:
          throw new Error(`Unsupported algorithm: ${finalConfig.algorithm}`)
      }
    } catch (_error) {
      return this.checkInMemoryLimit(identifier, finalConfig)
    }
  }

  async resetLimit(identifier: string): Promise<void> {
    if (!this.redis) return

    const keys = [
      this.generateKey(identifier, this.defaultConfig.keyPrefix),
      `${this.generateKey(identifier, this.defaultConfig.keyPrefix)}:*`,
    ]

    try {
      await Promise.all(keys.map(key => this.redis?.del(key)))
    } catch {
      // Ignore Redis deletion errors - failed cleanup should not break application flow
    }
  }

  async getRemainingLimit(identifier: string): Promise<number> {
    const result = await this.checkLimit(identifier)
    return result.remaining
  }

  /**
   * Token bucket algorithm implementation
   */
  private async checkTokenBucket(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now()
    const bucketKey = `${key}:bucket`
    const timestampKey = `${key}:timestamp`

    // Lua script for atomic token bucket operations
    const luaScript = `
      local key = KEYS[1]
      local timestampKey = KEYS[2]
      local maxTokens = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      local tokens = redis.call('GET', key)
      local lastRefill = redis.call('GET', timestampKey)
      
      if not tokens then
        tokens = maxTokens
        lastRefill = now
      else
        tokens = tonumber(tokens)
        lastRefill = tonumber(lastRefill)
        
        -- Calculate tokens to add based on time passed
        local timePassed = now - lastRefill
        local tokensToAdd = math.floor(timePassed / windowMs * maxTokens)
        tokens = math.min(maxTokens, tokens + tokensToAdd)
        
        if tokensToAdd > 0 then
          lastRefill = now
        end
      end
      
      if tokens > 0 then
        tokens = tokens - 1
        redis.call('SET', key, tokens)
        redis.call('SET', timestampKey, lastRefill)
        redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        redis.call('EXPIRE', timestampKey, math.ceil(windowMs / 1000))
        return {1, tokens, lastRefill}
      else
        return {0, tokens, lastRefill}
      end
    `

    const result = (await this.redis?.eval(luaScript, {
      keys: [bucketKey, timestampKey],
      arguments: [config.maxRequests.toString(), config.windowMs.toString(), now.toString()],
    })) as [number, number, number]

    const [allowed, remaining, lastRefill] = result
    const reset = new Date(lastRefill + config.windowMs)

    return {
      success: allowed === 1,
      limit: config.maxRequests,
      remaining,
      reset,
      retryAfter: allowed === 0 ? Math.ceil((reset.getTime() - now) / 1000) : undefined,
    }
  }

  /**
   * Sliding window algorithm implementation
   */
  private async checkSlidingWindow(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - config.windowMs

    // Remove old entries and count current window
    await this.redis?.zRemRangeByScore(key, 0, windowStart)
    const count = (await this.redis?.zCard(key)) ?? 0

    if (count < config.maxRequests) {
      // Add current request
      await this.redis?.zAdd(key, { score: now, value: `${now}` })
      await this.redis?.expire(key, Math.ceil(config.windowMs / 1000))

      return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - count - 1,
        reset: new Date(now + config.windowMs),
      }
    }

    // Get oldest entry to calculate retry time
    const oldestEntry = await this.redis?.zRange(key, 0, 0)
    const oldestTimestamp =
      oldestEntry && oldestEntry.length > 0 ? Number.parseInt(oldestEntry[0]) : now
    const reset = new Date(oldestTimestamp + config.windowMs)

    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      reset,
      retryAfter: Math.ceil((reset.getTime() - now) / 1000),
    }
  }

  /**
   * Fixed window algorithm implementation
   */
  private async checkFixedWindow(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now()
    const window = Math.floor(now / config.windowMs)
    const windowKey = `${key}:${window}`

    const count = (await this.redis?.incr(windowKey)) ?? 1

    if (count === 1) {
      await this.redis?.expire(windowKey, Math.ceil(config.windowMs / 1000))
    }

    const windowEnd = (window + 1) * config.windowMs
    const reset = new Date(windowEnd)

    return {
      success: count <= config.maxRequests,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      reset,
      retryAfter: count > config.maxRequests ? Math.ceil((windowEnd - now) / 1000) : undefined,
    }
  }

  /**
   * In-memory fallback rate limiting
   */
  private inMemoryLimits = new Map<string, { count: number; reset: number }>()

  private checkInMemoryLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now()
    const key = this.generateKey(identifier, config.keyPrefix)
    const limit = this.inMemoryLimits.get(key)

    if (!limit || now > limit.reset) {
      // New window
      this.inMemoryLimits.set(key, {
        count: 1,
        reset: now + config.windowMs,
      })

      // Cleanup old entries periodically
      if (this.inMemoryLimits.size > 10000) {
        this.cleanupInMemoryLimits(now)
      }

      return {
        success: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - 1,
        reset: new Date(now + config.windowMs),
      }
    }

    if (limit.count >= config.maxRequests) {
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset: new Date(limit.reset),
        retryAfter: Math.ceil((limit.reset - now) / 1000),
      }
    }

    limit.count++
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - limit.count,
      reset: new Date(limit.reset),
    }
  }

  private cleanupInMemoryLimits(_now: number): void {
    const entries = Array.from(this.inMemoryLimits.entries())
    entries.sort((a, b) => a[1].reset - b[1].reset)

    const toRemove = Math.floor(entries.length * 0.3)
    for (let i = 0; i < toRemove; i++) {
      this.inMemoryLimits.delete(entries[i][0])
    }
  }

  private generateKey(identifier: string, prefix?: string): string {
    return prefix ? `${prefix}:${identifier}` : identifier
  }
}

/**
 * Extract client identifier from request
 */
export function getClientIdentifier(request: NextRequest): string {
  // Priority order for client identification
  const userId = request.headers.get('x-user-id')
  if (userId) return `user:${userId}`

  const apiKey = request.headers.get('x-api-key')
  if (apiKey) return `api:${apiKey.substring(0, 8)}`

  const sessionId = request.cookies.get('session')?.value
  if (sessionId) return `session:${sessionId.substring(0, 16)}`

  // Fallback to IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'

  return `ip:${ip}`
}

/**
 * Rate limit presets for different endpoints
 */
export const RATE_LIMIT_PRESETS = {
  // Authentication endpoints
  auth: {
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes
    keyPrefix: 'auth',
  },

  // API endpoints
  api: {
    algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
    keyPrefix: 'api',
  },

  // Webhook endpoints
  webhook: {
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
    maxRequests: 1000,
    windowMs: 60 * 1000, // 1 minute
    keyPrefix: 'webhook',
  },

  // Search endpoints
  search: {
    algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
    keyPrefix: 'search',
  },

  // Strict rate limiting for sensitive operations
  strict: {
    algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 24 * 60 * 60 * 1000, // 24 hours
    keyPrefix: 'strict',
  },
} as const
