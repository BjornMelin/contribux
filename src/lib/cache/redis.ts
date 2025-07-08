/**
 * Redis Cache Module
 * Provides Redis client functionality for caching operations using Upstash Redis
 */

import { Redis } from '@upstash/redis'

export interface RedisClient {
  ping(): Promise<string>
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<string>
  del(key: string): Promise<number>
  exists(key: string): Promise<number>
  flushall(): Promise<string>
  disconnect(): Promise<void>
}

/**
 * Upstash Redis client wrapper
 * Implements the RedisClient interface using Upstash's HTTP-based Redis
 */
class UpstashRedisClient implements RedisClient {
  private client: Redis

  constructor() {
    // Use environment variables or fallback to mock mode
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      // Create a mock client for development when credentials are not available
      const mockStore = new Map<string, { value: string; expires?: number }>()
      this.client = {
        ping: async () => 'PONG',
        get: async (key: string) => {
          const item = mockStore.get(key)
          if (!item) return null
          if (item.expires && Date.now() > item.expires) {
            mockStore.delete(key)
            return null
          }
          return item.value
        },
        set: async (key: string, value: string, options?: { ex?: number }) => {
          const expires = options?.ex ? Date.now() + options.ex * 1000 : undefined
          mockStore.set(key, { value, expires })
          return 'OK'
        },
        del: async (...keys: string[]) => {
          let deleted = 0
          for (const key of keys) {
            if (mockStore.delete(key)) deleted++
          }
          return deleted
        },
        exists: async (...keys: string[]) => {
          let count = 0
          for (const key of keys) {
            const item = mockStore.get(key)
            if (item && (!item.expires || Date.now() <= item.expires)) {
              count++
            }
          }
          return count
        },
        flushall: async () => {
          mockStore.clear()
          return 'OK'
        },
        quit: async () => undefined,
        disconnect: async () => undefined,
      } as unknown as Redis
    } else {
      this.client = new Redis({
        url,
        token,
      })
    }
  }

  async ping(): Promise<string> {
    return await this.client.ping()
  }

  async get(key: string): Promise<string | null> {
    const value = await this.client.get(key)
    return value as string | null
  }

  async set(key: string, value: string, ttl?: number): Promise<string> {
    if (ttl) {
      const result = await this.client.set(key, value, { ex: ttl })
      return result as string
    }
    const result = await this.client.set(key, value)
    return result as string
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key)
  }

  async exists(key: string): Promise<number> {
    return await this.client.exists(key)
  }

  async flushall(): Promise<string> {
    return await this.client.flushall()
  }

  async disconnect(): Promise<void> {
    // Upstash Redis is HTTP-based and connectionless, so no need to disconnect
    // This method is kept for interface compatibility
    return Promise.resolve()
  }
}

/**
 * Redis client instance
 * Uses Upstash Redis for production, falls back to mock for development without credentials
 */
export const redis: RedisClient = new UpstashRedisClient()

/**
 * Redis health check
 */
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy'
  latency?: number
  error?: string
}> {
  try {
    const start = Date.now()
    await redis.ping()
    const latency = Date.now() - start

    return {
      status: 'healthy',
      latency,
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export default redis
