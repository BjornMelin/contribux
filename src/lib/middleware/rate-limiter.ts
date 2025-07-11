/**
 * Core Rate Limiter Implementation
 * Provides flexible rate limiting with multiple storage backends
 */

import { type NextRequest } from 'next/server'

export interface RateLimitConfig {
  windowMs: number
  max: number
  store?: RateLimitStore
  keyGenerator?: (identifier: string) => string
  skip?: (identifier: string) => boolean
  onLimitReached?: (context: RateLimitContext) => void
  message?: string
  standardHeaders?: boolean
  legacyHeaders?: boolean
  slidingWindow?: boolean
  points?: boolean
}

export interface RateLimitContext {
  identifier: string
  limit: number
  windowMs: number
  endpoint?: string
  method?: string
  userAgent?: string
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: Date
  retryAfter?: number
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }>
  get(key: string): Promise<number>
  reset(key: string): Promise<void>
}

export class MemoryStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: Date }>()

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
    const now = new Date()
    const existing = this.store.get(key)
    
    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + windowMs)
      const entry = { count: 1, resetAt }
      this.store.set(key, entry)
      return entry
    }
    
    existing.count++
    this.store.set(key, existing)
    return existing
  }

  async get(key: string): Promise<number> {
    const entry = this.store.get(key)
    return entry?.count || 0
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  // Test helper methods
  clear(): void {
    this.store.clear()
  }
}

export class RedisStore implements RateLimitStore {
  constructor(private options: { client: any; prefix?: string }) {}

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
    const fullKey = this.options.prefix ? `${this.options.prefix}${key}` : key
    const pipeline = this.options.client.pipeline()
    const ttlSeconds = Math.ceil(windowMs / 1000)
    
    pipeline.incr(fullKey)
    pipeline.expire(fullKey, ttlSeconds)
    
    const results = await pipeline.exec()
    const count = results[0][1] as number
    const resetAt = new Date(Date.now() + windowMs)
    
    return { count, resetAt }
  }

  async get(key: string): Promise<number> {
    const fullKey = this.options.prefix ? `${this.options.prefix}${key}` : key
    const result = await this.options.client.get(fullKey)
    return result ? parseInt(result, 10) : 0
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.options.prefix ? `${this.options.prefix}${key}` : key
    await this.options.client.del(fullKey)
  }
}

export class RateLimiter {
  private config: Required<RateLimitConfig>
  private store: RateLimitStore

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      max: config.max,
      store: config.store || new MemoryStore(),
      keyGenerator: config.keyGenerator || ((identifier: string) => identifier),
      skip: config.skip || (() => false),
      onLimitReached: config.onLimitReached || (() => {}),
      message: config.message || 'Rate limit exceeded',
      standardHeaders: config.standardHeaders ?? true,
      legacyHeaders: config.legacyHeaders ?? false,
      slidingWindow: config.slidingWindow ?? false,
      points: config.points ?? false,
    }
    this.store = this.config.store
  }

  async check(identifier: string): Promise<RateLimitResult> {
    // Check skip condition
    if (this.config.skip(identifier)) {
      return {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetAt: new Date(Date.now() + this.config.windowMs),
      }
    }

    // Apply key generator if provided, otherwise use identifier directly
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier

    // Get current count
    const { count, resetAt } = await this.store.increment(key, this.config.windowMs)
    
    const allowed = count <= this.config.max
    const remaining = Math.max(0, this.config.max - count)
    
    const result: RateLimitResult = {
      allowed,
      limit: this.config.max,
      remaining,
      resetAt,
    }

    if (!allowed) {
      result.retryAfter = Math.ceil((resetAt.getTime() - Date.now()) / 1000)
      
      // Call limit reached handler
      this.config.onLimitReached({
        identifier,
        limit: this.config.max,
        windowMs: this.config.windowMs,
      })
    }

    return result
  }

  async consume(identifier: string, points: number = 1): Promise<RateLimitResult> {
    // For points-based limiting, we need to track the total cost
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier

    // Simulate consuming multiple points by calling increment multiple times
    let totalCount = 0
    let resetAt = new Date()
    
    for (let i = 0; i < points; i++) {
      const result = await this.store.increment(key, this.config.windowMs)
      totalCount = result.count
      resetAt = result.resetAt
    }

    const allowed = totalCount <= this.config.max
    const remaining = Math.max(0, this.config.max - totalCount)
    
    const result: RateLimitResult = {
      allowed,
      limit: this.config.max,
      remaining,
      resetAt,
    }

    if (!allowed) {
      result.retryAfter = Math.ceil((resetAt.getTime() - Date.now()) / 1000)
    }

    return result
  }
}

// Helper function to get IP from Next.js request
export function getIPFromRequest(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIP = req.headers.get('x-real-ip')
  const ip = forwarded ? forwarded.split(',')[0].trim() : realIP || 'anonymous'
  return ip
}

// Helper function to get user ID from request
export function getUserFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  const userIdHeader = req.headers.get('x-user-id')
  
  if (userIdHeader) return userIdHeader
  if (auth?.startsWith('Bearer ')) {
    // Extract user ID from token (simplified)
    return `user:${auth.slice(7, 27)}`
  }
  
  return null
}

// Key generator functions
export const keyGenerators = {
  ip: (req: NextRequest) => `ip:${getIPFromRequest(req)}`,
  user: (req: NextRequest) => {
    const user = getUserFromRequest(req)
    return user || `ip:${getIPFromRequest(req)}`
  },
  combined: (req: NextRequest) => {
    const user = getUserFromRequest(req)
    const ip = getIPFromRequest(req)
    return user ? `${user}:${ip}` : `ip:${ip}`
  },
}