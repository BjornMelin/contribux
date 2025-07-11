/**
 * @vitest-environment node
 */

import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MemoryStore,
  RateLimiter,
  RedisStore,
  rateLimitMiddleware,
} from '@/lib/middleware/rate-limit-middleware'

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn().mockReturnThis(),
    exec: vi.fn(),
    ttl: vi.fn(),
  })),
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn((name: string) => {
      const mockHeaders: Record<string, string> = {
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'test-agent',
      }
      return mockHeaders[name] || null
    }),
  })),
}))

describe('Rate Limiting Tests', () => {
  describe('RateLimiter Core', () => {
    let rateLimiter: RateLimiter
    let store: MemoryStore

    beforeEach(() => {
      store = new MemoryStore()
      rateLimiter = new RateLimiter({
        windowMs: 60000, // 1 minute
        max: 10,
        store,
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
      store.reset()
    })

    it('should allow requests within limit', async () => {
      const identifier = 'test-user'

      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.check(identifier)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(9 - i)
        expect(result.resetAt).toBeInstanceOf(Date)
      }
    })

    it('should block requests exceeding limit', async () => {
      const identifier = 'test-user'

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.check(identifier)
      }

      // 11th request should be blocked
      const result = await rateLimiter.check(identifier)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should reset after window expires', async () => {
      const identifier = 'test-user'

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.check(identifier)
      }

      // Move time forward past the window
      vi.setSystemTime(Date.now() + 61000)

      // Should be allowed again
      const result = await rateLimiter.check(identifier)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it('should handle skip conditions', async () => {
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        max: 10,
        store,
        skip: identifier => identifier.startsWith('admin-'),
      })

      // Admin users should bypass rate limiting
      for (let i = 0; i < 20; i++) {
        const result = await rateLimiter.check('admin-user')
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(Number.POSITIVE_INFINITY)
      }
    })

    it('should support custom key generators', async () => {
      const keyGenerator = vi.fn((identifier: string) => `custom:${identifier}`)

      rateLimiter = new RateLimiter({
        windowMs: 60000,
        max: 10,
        store,
        keyGenerator,
      })

      await rateLimiter.check('user123')
      expect(keyGenerator).toHaveBeenCalledWith('user123')
    })
  })

  describe('RedisStore', () => {
    let redisStore: RedisStore
    let mockRedis: any

    beforeEach(() => {
      // Create a proper mock Redis client
      mockRedis = {
        pipeline: vi.fn(),
        get: vi.fn(),
        del: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        exec: vi.fn(),
      }
      redisStore = new RedisStore({ client: mockRedis })
    })

    it('should increment counter in Redis', async () => {
      mockRedis.pipeline.mockReturnValue({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
        ]),
      })

      const result = await redisStore.increment('test-key')

      expect(result.count).toBe(1)
      expect(mockRedis.pipeline).toHaveBeenCalled()
    })

    it('should handle Redis errors gracefully', async () => {
      mockRedis.pipeline.mockReturnValue({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('Redis error')),
      })

      await expect(redisStore.increment('test-key')).rejects.toThrow('Redis error')
    })

    it('should get current count', async () => {
      mockRedis.get.mockResolvedValue('5')

      const count = await redisStore.get('test-key')
      expect(count).toBe(5)
    })

    it('should reset key', async () => {
      mockRedis.del.mockResolvedValue(1)

      await redisStore.reset('test-key')
      expect(mockRedis.del).toHaveBeenCalledWith('test-key')
    })
  })

  describe('Rate Limit Middleware', () => {
    it('should apply rate limiting to API routes', async () => {
      const request = new NextRequest('http://localhost/api/search', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const middleware = rateLimitMiddleware({
        windowMs: 60000,
        max: 5,
      })

      // Make requests within limit
      for (let i = 0; i < 5; i++) {
        const response = await middleware(request, handler)
        expect(response.status).toBe(200)
        expect(response.headers.get('x-ratelimit-limit')).toBe('5')
        expect(response.headers.get('x-ratelimit-remaining')).toBe(String(4 - i))
      }

      // 6th request should be rate limited
      const response = await middleware(request, handler)
      expect(response.status).toBe(429)
      expect(response.headers.get('x-ratelimit-remaining')).toBe('0')
      expect(response.headers.get('retry-after')).toBeDefined()

      const body = await response.json()
      expect(body.error).toContain('Too many requests')
    })

    it('should use IP-based rate limiting', async () => {
      const middleware = rateLimitMiddleware({
        windowMs: 60000,
        max: 3,
        keyGenerator: 'ip',
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      // Different IPs should have separate limits
      const request1 = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })

      const request2 = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.2' },
      })

      // Both IPs can make 3 requests
      for (let i = 0; i < 3; i++) {
        const response1 = await middleware(request1, handler)
        const response2 = await middleware(request2, handler)
        expect(response1.status).toBe(200)
        expect(response2.status).toBe(200)
      }
    })

    it('should support user-based rate limiting', async () => {
      const middleware = rateLimitMiddleware({
        windowMs: 60000,
        max: 10,
        keyGenerator: 'user',
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      // Authenticated request
      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer valid-token',
          'x-user-id': 'user123',
        },
      })

      const response = await middleware(request, handler)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-ratelimit-limit')).toBe('10')
    })

    it('should handle custom rate limit handlers', async () => {
      const onLimitReached = vi.fn()

      const middleware = rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        onLimitReached,
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const request = new NextRequest('http://localhost/api/test')

      // First request OK
      await middleware(request, handler)

      // Second request triggers limit
      await middleware(request, handler)

      expect(onLimitReached).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: expect.any(String),
          limit: 1,
          windowMs: 60000,
        })
      )
    })
  })

  describe('Advanced Rate Limiting', () => {
    it('should support sliding window rate limiting', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        slidingWindow: true,
      })

      const identifier = 'test-user'

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check(identifier)
      }

      // Move time forward 30 seconds
      vi.setSystemTime(Date.now() + 30000)

      // Make 5 more requests
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.check(identifier)
        expect(result.allowed).toBe(true)
      }

      // 11th request should still be blocked (sliding window)
      const result = await rateLimiter.check(identifier)
      expect(result.allowed).toBe(false)
    })

    it('should support distributed rate limiting', async () => {
      let counter = 0
      const redisClient = {
        pipeline: vi.fn().mockReturnValue({
          incr: vi.fn().mockReturnThis(),
          expire: vi.fn().mockReturnThis(),
          exec: vi.fn().mockImplementation(() => {
            counter++
            return Promise.resolve([
              [null, counter],
              [null, 1],
            ])
          }),
        }),
        get: vi.fn(),
        del: vi.fn(),
      }
      const store = new RedisStore({
        client: redisClient,
        prefix: 'rl:distributed:',
      })

      const rateLimiter1 = new RateLimiter({
        windowMs: 60000,
        max: 10,
        store,
      })

      const rateLimiter2 = new RateLimiter({
        windowMs: 60000,
        max: 10,
        store,
      })

      // Simulate requests from different servers
      const identifier = 'shared-user'

      // 5 requests from server 1
      for (let i = 0; i < 5; i++) {
        await rateLimiter1.check(identifier)
      }

      // 5 requests from server 2
      for (let i = 0; i < 5; i++) {
        await rateLimiter2.check(identifier)
      }

      // 11th request should be blocked on either server
      const result1 = await rateLimiter1.check(identifier)
      const result2 = await rateLimiter2.check(identifier)

      expect(result1.allowed).toBe(false)
      expect(result2.allowed).toBe(false)
    })

    it('should support tiered rate limits', async () => {
      const rateLimiters = {
        free: new RateLimiter({
          windowMs: 3600000, // 1 hour
          max: 100,
        }),
        pro: new RateLimiter({
          windowMs: 3600000,
          max: 1000,
        }),
        enterprise: new RateLimiter({
          windowMs: 3600000,
          max: 10000,
        }),
      }

      // Function to get user tier
      const getUserTier = (userId: string) => {
        if (userId.includes('enterprise')) return 'enterprise'
        if (userId.includes('pro')) return 'pro'
        return 'free'
      }

      // Test different tiers
      const users = [
        { id: 'free-user', expectedLimit: 100 },
        { id: 'pro-user', expectedLimit: 1000 },
        { id: 'enterprise-user', expectedLimit: 10000 },
      ]

      for (const user of users) {
        const tier = getUserTier(user.id)
        const rateLimiter = rateLimiters[tier as keyof typeof rateLimiters]
        const result = await rateLimiter.check(user.id)

        expect(result.limit).toBe(user.expectedLimit)
      }
    })

    it('should support cost-based rate limiting', async () => {
      // Different operations have different costs
      const operationCosts = {
        search: 1,
        aiAnalysis: 10,
        bulkExport: 50,
      }

      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        max: 100, // 100 cost units per minute
        points: true, // Enable point-based limiting
      })

      const identifier = 'test-user'
      let totalCost = 0

      // Perform various operations
      const operations = [
        { type: 'search', count: 50 },
        { type: 'aiAnalysis', count: 3 },
        { type: 'bulkExport', count: 1 },
      ]

      for (const op of operations) {
        for (let i = 0; i < op.count; i++) {
          const cost = operationCosts[op.type as keyof typeof operationCosts]
          const result = await rateLimiter.consume(identifier, cost)

          if (totalCost + cost <= 100) {
            expect(result.allowed).toBe(true)
            totalCost += cost
          } else {
            expect(result.allowed).toBe(false)
            break
          }
        }
      }
    })
  })

  describe('Rate Limit Bypass & Special Cases', () => {
    it('should bypass rate limiting for whitelisted IPs', async () => {
      const whitelist = ['127.0.0.1', '192.168.1.100']

      const middleware = rateLimitMiddleware({
        windowMs: 60000,
        max: 1,
        skip: req => {
          const ip = req.headers.get('x-forwarded-for') || ''
          return whitelist.includes(ip)
        },
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      // Should bypass rate limiting
      for (let i = 0; i < 10; i++) {
        const response = await middleware(request, handler)
        expect(response.status).toBe(200)
      }
    })

    it('should apply different limits for different endpoints', async () => {
      const endpointLimits = {
        '/api/search': { windowMs: 60000, max: 60 },
        '/api/ai/analyze': { windowMs: 60000, max: 10 },
        '/api/export': { windowMs: 3600000, max: 5 },
      }

      const getEndpointLimiter = (path: string) => {
        const config = endpointLimits[path as keyof typeof endpointLimits]
        return config ? new RateLimiter(config) : null
      }

      // Test different endpoints
      for (const [endpoint, config] of Object.entries(endpointLimits)) {
        const limiter = getEndpointLimiter(endpoint)
        expect(limiter).toBeDefined()

        const result = await limiter?.check('test-user')
        expect(result.limit).toBe(config.max)
      }
    })

    it('should handle API key-based rate limiting', async () => {
      const apiKeyLimits = new Map([
        ['key-basic-123', { tier: 'basic', limit: 100 }],
        ['key-pro-456', { tier: 'pro', limit: 1000 }],
        ['key-unlimited-789', { tier: 'unlimited', limit: Number.POSITIVE_INFINITY }],
      ])

      const middleware = rateLimitMiddleware({
        windowMs: 3600000,
        max: req => {
          const apiKey = req.headers.get('x-api-key')
          const config = apiKeyLimits.get(apiKey || '')
          return config?.limit || 10 // Default limit
        },
        keyGenerator: req => {
          return req.headers.get('x-api-key') || 'anonymous'
        },
      })

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: 'test' }))

      // Test basic tier
      const basicRequest = new NextRequest('http://localhost/api/test', {
        headers: { 'x-api-key': 'key-basic-123' },
      })

      const response = await middleware(basicRequest, handler)
      expect(response.headers.get('x-ratelimit-limit')).toBe('100')
    })
  })
})
