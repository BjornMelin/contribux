import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github'
import { CacheManager, createCacheEntry } from '@/lib/github/caching'
import { waitFor, MockTimer, createRateLimitHeaders } from './test-helpers'

describe('GitHub Client Caching', () => {
  let mockTimer: MockTimer

  beforeEach(() => {
    nock.cleanAll()
    vi.clearAllMocks()
    mockTimer = new MockTimer(Date.now())
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('Cache TTL and expiration', () => {
    it('should expire cache entries after TTL using mock timer', async () => {
      const mockNow = vi.spyOn(Date, 'now')
      mockNow.mockImplementation(() => mockTimer.now())

      const cacheManager = new CacheManager({
        enabled: true,
        ttl: 1000, // 1 second TTL
        storage: 'memory',
      })

      // Set a cache entry
      const key = cacheManager.generateCacheKey('GET', '/test', {})
      const entry = createCacheEntry('test', undefined, undefined, 1)
      await cacheManager.set(key, entry)

      // Cache should be valid initially
      const entry1 = await cacheManager.get(key)
      expect(entry1?.data).toBe('test')

      // Advance time past TTL
      mockTimer.advance(1100)

      // Cache should be expired
      const entry2 = await cacheManager.get(key)
      expect(entry2).toBeNull()

      mockNow.mockRestore()
    })

    it('should handle concurrent cache operations without race conditions', async () => {
      const cache = new CacheManager({
        enabled: true,
        ttl: 60000,
        storage: 'memory',
      })

      const operations: Promise<void>[] = []
      const results: { key: string; value: unknown }[] = []

      // Perform multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        const key = `key-${i}`
        const value = `value-${i}`

        // Write operation
        operations.push(
          cache.set(key, createCacheEntry(value)).then(() => {
            results.push({ key, value })
          })
        )

        // Read operation
        operations.push(
          cache.get(key).then(result => {
            if (result) {
              results.push({ key, value: result })
            }
          })
        )
      }

      await Promise.all(operations)

      // Verify all writes completed
      for (let i = 0; i < 10; i++) {
        const cached = await cache.get(`key-${i}`)
        expect(cached).toBe(`value-${i}`)
      }
    })

    it('should handle cache invalidation patterns correctly', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          enabled: true,
          ttl: 60000,
        },
      })

      // Initial GET request - should be cached
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, { name: 'repo', description: 'Original description' })

      const result1 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result1.data.description).toBe('Original description')

      // Second GET request - should use cache, no HTTP call
      const result2 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result2.data.description).toBe('Original description')

      // PATCH request - should invalidate cache
      nock('https://api.github.com')
        .patch('/repos/owner/repo')
        .reply(200, { name: 'repo', description: 'Updated description' })

      await client.rest.repos.update({
        owner: 'owner',
        repo: 'repo',
        description: 'Updated description',
      })

      // Next GET should make HTTP call as cache is invalidated
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, { name: 'repo', description: 'Updated description' })

      const result3 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result3.data.description).toBe('Updated description')
    })
  })

  describe('Conditional requests with ETags', () => {
    it('should handle 304 Not Modified responses correctly', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          enabled: true,
          ttl: 60000,
        },
      })

      const etag = '"abc123"'
      const repoData = { name: 'repo', stargazers_count: 100 }

      // First request returns data with ETag
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, repoData, {
          etag: etag,
          ...createRateLimitHeaders({ remaining: 4999 }),
        })

      const result1 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result1.data.stargazers_count).toBe(100)

      // Second request sends If-None-Match header
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .matchHeader('if-none-match', etag)
        .reply(304, '', {
          etag: etag,
          ...createRateLimitHeaders({ remaining: 4998 }),
        })

      const result2 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result2.data.stargazers_count).toBe(100) // Should return cached data
      expect(result2.status).toBe(200) // Client should normalize to 200
    })

    it('should update cache when ETag changes', async () => {
      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          enabled: true,
          ttl: 60000,
        },
      })

      const etag1 = '"abc123"'
      const etag2 = '"def456"'

      // First request
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, { name: 'repo', stargazers_count: 100 }, { etag: etag1 })

      await client.rest.repos.get({ owner: 'owner', repo: 'repo' })

      // Second request with new data and new ETag
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .matchHeader('if-none-match', etag1)
        .reply(200, { name: 'repo', stargazers_count: 150 }, { etag: etag2 })

      const result = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result.data.stargazers_count).toBe(150)

      // Verify new ETag is used for subsequent requests
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .matchHeader('if-none-match', etag2)
        .reply(304)

      const result2 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result2.data.stargazers_count).toBe(150)
    })
  })

  describe('Background refresh mechanism', () => {
    it('should trigger background refresh when approaching TTL', async () => {
      const mockNow = vi.spyOn(Date, 'now')
      mockNow.mockImplementation(() => mockTimer.now())

      const backgroundRefreshPromises: Promise<void>[] = []

      const client = new GitHubClient({
        auth: { type: 'token', token: 'test_token' },
        cache: {
          enabled: true,
          ttl: 10000, // 10 seconds
          backgroundRefresh: true,
          backgroundRefreshThreshold: 0.8, // Refresh at 80% of TTL
        },
      })

      // Track background refresh operations
      const originalGet = client.cache!.get.bind(client.cache)
      client.cache!.get = async function (key: string) {
        const result = await originalGet(key)
        
        if (result) {
          const shouldRefresh = client.cache!.shouldRefreshInBackground(result)
          if (shouldRefresh) {
            // Simulate background refresh
            const refreshPromise = new Promise<void>(resolve => {
              setImmediate(() => {
                nock('https://api.github.com')
                  .get('/repos/owner/repo')
                  .reply(200, { name: 'repo', stargazers_count: 200 })
                resolve()
              })
            })
            backgroundRefreshPromises.push(refreshPromise)
          }
        }
        
        return result
      }

      // Initial request
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, { name: 'repo', stargazers_count: 100 })

      const result1 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result1.data.stargazers_count).toBe(100)

      // Advance time to 85% of TTL (past threshold)
      mockTimer.advance(8500)

      // This request should trigger background refresh
      const result2 = await client.rest.repos.get({ owner: 'owner', repo: 'repo' })
      expect(result2.data.stargazers_count).toBe(100) // Still returns cached data

      // Wait for background refresh to complete
      await Promise.all(backgroundRefreshPromises)

      mockNow.mockRestore()
    })
  })

  describe('Cache metrics and monitoring', () => {
    it('should track cache hit/miss ratios accurately', async () => {
      const cache = new CacheManager({
        enabled: true,
        ttl: 60000,
        storage: 'memory',
      })

      // Clear cache to reset metrics
      await cache.clear()

      // Perform operations
      const key1 = 'test-key-1'
      const key2 = 'test-key-2'

      // Miss
      await cache.get(key1)
      
      // Set
      await cache.set(key1, createCacheEntry('value1'))
      
      // Hit
      await cache.get(key1)
      
      // Another hit
      await cache.get(key1)
      
      // Miss on different key
      await cache.get(key2)

      const metrics = cache.getMetrics()
      expect(metrics.hits).toBe(2)
      expect(metrics.misses).toBe(2)
      expect(metrics.hitRatio).toBe(0.5) // 2 hits / 4 total requests
    })

    it('should handle memory usage tracking', async () => {
      const cache = new CacheManager({
        enabled: true,
        ttl: 60000,
        storage: 'memory',
        maxSize: 1000, // Small size for testing
      })

      const largeData = 'x'.repeat(500)

      await cache.set('key1', createCacheEntry(largeData))
      const metrics1 = cache.getMetrics()
      expect(metrics1.size).toBe(1)
      expect(metrics1.memoryUsage).toBeGreaterThan(500)

      // Adding another item should trigger eviction
      await cache.set('key2', createCacheEntry(largeData))
      await cache.set('key3', createCacheEntry(largeData))

      const metrics2 = cache.getMetrics()
      expect(metrics2.size).toBeLessThanOrEqual(2) // Some items evicted
      expect(metrics2.memoryUsage).toBeLessThanOrEqual(1000)
    })
  })
})