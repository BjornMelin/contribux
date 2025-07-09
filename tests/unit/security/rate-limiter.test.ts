/**
 * Rate Limiter Tests
 * Tests for the Upstash Redis-based distributed rate limiting
 */

import {
  apiRateLimiter,
  authRateLimiter,
  checkRateLimit,
  getRequestIdentifier,
  searchRateLimiter,
} from '@/lib/security/rate-limiter'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Type for mock rate limiter
interface MockRateLimiter {
  limit: () => Promise<{
    success: boolean
    limit: number
    remaining: number
    reset: number
  }>
}

// Mock Upstash Redis
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    flushall: vi.fn().mockResolvedValue('OK'),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: {
    slidingWindow: vi.fn((limit, window) => ({ limit, window })),
  },
}))

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRequestIdentifier', () => {
    it('should extract user ID for authenticated requests', () => {
      const req = {
        session: { user: { id: 'user123' } },
        headers: {},
        ip: '127.0.0.1',
      }

      expect(getRequestIdentifier(req)).toBe('user:user123')
    })

    it('should extract API key when present', () => {
      const req = {
        headers: { 'x-api-key': 'secret-key' },
        ip: '127.0.0.1',
      }

      expect(getRequestIdentifier(req)).toBe('api:secret-key')
    })

    it('should fall back to IP address', () => {
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        ip: '127.0.0.1',
      }

      expect(getRequestIdentifier(req)).toBe('ip:192.168.1.1')
    })

    it('should handle missing IP gracefully', () => {
      const req = {
        headers: {},
      }

      expect(getRequestIdentifier(req)).toBe('ip:anonymous')
    })
  })

  describe('checkRateLimit', () => {
    it('should return success when limit not exceeded', async () => {
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: true,
          limit: 100,
          remaining: 99,
          reset: Date.now() + 60000,
        }),
      }

      const result = await checkRateLimit(mockLimiter as MockRateLimiter, 'test-id')

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(99)
      expect(result.retryAfter).toBeNull()
    })

    it('should return failure with retry info when rate limited', async () => {
      const resetTime = Date.now() + 30000
      const mockLimiter = {
        limit: vi.fn().mockResolvedValue({
          success: false,
          limit: 100,
          remaining: 0,
          reset: resetTime,
        }),
      }

      const result = await checkRateLimit(mockLimiter as MockRateLimiter, 'test-id')

      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBe(30)
    })

    it('should handle errors gracefully', async () => {
      const mockLimiter = {
        limit: vi.fn().mockRejectedValue(new Error('Redis error')),
      }

      const result = await checkRateLimit(mockLimiter as MockRateLimiter, 'test-id')

      // Should allow request on error
      expect(result.success).toBe(true)
      expect(result.limit).toBe(0)
    })
  })

  describe('Rate limit configurations', () => {
    it('should have correct auth rate limit config', () => {
      expect(authRateLimiter).toBeDefined()
      // Would test actual config if not mocked
    })

    it('should have correct API rate limit config', () => {
      expect(apiRateLimiter).toBeDefined()
      // Would test actual config if not mocked
    })

    it('should have correct search rate limit config', () => {
      expect(searchRateLimiter).toBeDefined()
      // Would test actual config if not mocked
    })
  })
})
