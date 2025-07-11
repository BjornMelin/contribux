/**
 * Rate Limit Storage Backends
 * Re-export from main rate limiter for backwards compatibility
 */

export { MemoryStore, RedisStore, type RateLimitStore } from './rate-limiter'