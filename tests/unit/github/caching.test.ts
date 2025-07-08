import { GitHubCacheManager, MemoryCacheAdapter } from '@/lib/github/caching'
import { beforeEach, describe, expect, it } from 'vitest'

// Type for accessing private methods in tests (unused but kept for future test expansion)
interface _GitHubCacheManagerWithPrivates extends GitHubCacheManager {
  hashString(str: string): string
}

describe('GitHubCacheManager', () => {
  let cacheManager: GitHubCacheManager
  let storage: MemoryCacheAdapter

  beforeEach(() => {
    storage = new MemoryCacheAdapter()
    cacheManager = new GitHubCacheManager(storage)
  })

  describe('generateCacheKey', () => {
    it('should generate consistent keys regardless of object key order', () => {
      const params1 = { sort: 'stars', order: 'desc', per_page: 10, page: 1 }
      const params2 = { page: 1, per_page: 10, order: 'desc', sort: 'stars' }
      const params3 = { order: 'desc', page: 1, sort: 'stars', per_page: 10 }

      const key1 = cacheManager.generateCacheKey('GET', '/repos', params1)
      const key2 = cacheManager.generateCacheKey('GET', '/repos', params2)
      const key3 = cacheManager.generateCacheKey('GET', '/repos', params3)

      expect(key1).toBe(key2)
      expect(key2).toBe(key3)
    })

    it('should handle nested objects with consistent key ordering', () => {
      const params1 = {
        filter: { language: 'typescript', stars: '>100' },
        options: { includeArchived: false, includeForks: true },
      }
      const params2 = {
        options: { includeForks: true, includeArchived: false },
        filter: { stars: '>100', language: 'typescript' },
      }

      const key1 = cacheManager.generateCacheKey('GET', '/search', params1)
      const key2 = cacheManager.generateCacheKey('GET', '/search', params2)

      expect(key1).toBe(key2)
    })

    it('should generate different keys for different parameters', () => {
      const key1 = cacheManager.generateCacheKey('GET', '/repos', { page: 1 })
      const key2 = cacheManager.generateCacheKey('GET', '/repos', { page: 2 })

      expect(key1).not.toBe(key2)
    })

    it('should hash long keys', () => {
      const longParams = {
        description: 'a'.repeat(150),
        query: 'b'.repeat(100),
      }

      const key = cacheManager.generateCacheKey('GET', '/search', longParams)
      expect(key).toMatch(/^github:GET:\/search:[a-z0-9]+$/)
      expect(key.length).toBeLessThan(100)
    })
  })

  describe('keys pattern matching', () => {
    beforeEach(async () => {
      await storage.set('github:repos:owner1:repo1', { data: 'test1' }, 300)
      await storage.set('github:repos:owner1:repo2', { data: 'test2' }, 300)
      await storage.set('github:repos:owner2:repo1', { data: 'test3' }, 300)
      await storage.set('github:users:user1', { data: 'test4' }, 300)
      await storage.set('github:search:query1', { data: 'test5' }, 300)
    })

    it('should find keys with wildcard pattern', async () => {
      const keys = await storage.keys('github:repos:owner1:*')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('github:repos:owner1:repo1')
      expect(keys).toContain('github:repos:owner1:repo2')
    })

    it('should escape special regex characters in pattern', async () => {
      await storage.set('github:repos:owner.name:repo', { data: 'test' }, 300)
      await storage.set('github:repos:owner+name:repo', { data: 'test' }, 300)
      await storage.set('github:repos:owner[name]:repo', { data: 'test' }, 300)

      const keys1 = await storage.keys('github:repos:owner.name:*')
      expect(keys1).toHaveLength(1)
      expect(keys1).toContain('github:repos:owner.name:repo')

      const keys2 = await storage.keys('github:repos:owner+name:*')
      expect(keys2).toHaveLength(1)
      expect(keys2).toContain('github:repos:owner+name:repo')

      const keys3 = await storage.keys('github:repos:owner[name]:*')
      expect(keys3).toHaveLength(1)
      expect(keys3).toContain('github:repos:owner[name]:repo')
    })

    it('should handle multiple wildcards', async () => {
      const keys = await storage.keys('github:*:owner1:*')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('github:repos:owner1:repo1')
      expect(keys).toContain('github:repos:owner1:repo2')
    })

    it('should return all keys when no pattern provided', async () => {
      const keys = await storage.keys()
      expect(keys).toHaveLength(5)
    })
  })

  describe('hash function', () => {
    it('should generate consistent positive hashes', () => {
      const testStrings = [
        'short',
        'a much longer string that needs hashing',
        'special-chars!@#$%^&*()',
        '{"json":"data","nested":{"key":"value"}}',
        'unicode: 你好世界 🌍',
      ]

      for (const str of testStrings) {
        // @ts-ignore - accessing private method for testing
        const key1 = (cacheManager as { hashString: (str: string) => string }).hashString(str)
        // @ts-ignore - accessing private method for testing
        const key2 = (cacheManager as { hashString: (str: string) => string }).hashString(str)

        expect(key1).toBe(key2) // Consistent hashing
        expect(key1).toMatch(/^[0-9a-z]+$/) // Valid base36
        expect(Number.parseInt(key1, 36)).toBeGreaterThanOrEqual(0) // Positive number
      }
    })

    it('should generate different hashes for different inputs', () => {
      // @ts-ignore - accessing private method for testing
      const hash1 = (cacheManager as { hashString: (str: string) => string }).hashString('test1')
      // @ts-ignore - accessing private method for testing
      const hash2 = (cacheManager as { hashString: (str: string) => string }).hashString('test2')
      // @ts-ignore - accessing private method for testing
      const hash3 = (cacheManager as { hashString: (str: string) => string }).hashString('test1') // Same as hash1

      expect(hash1).not.toBe(hash2)
      expect(hash1).toBe(hash3)
    })
  })

  describe('cache operations', () => {
    it('should set and get values', async () => {
      const key = cacheManager.generateCacheKey('GET', '/repos', { page: 1 })
      const data = { repos: ['repo1', 'repo2'] }

      const setResult = await cacheManager.set(key, data)
      expect(setResult).toBe(true)

      const retrieved = await cacheManager.get(key)
      expect(retrieved).toEqual(data)
    })

    it('should invalidate by pattern', async () => {
      await cacheManager.set('github:repos:owner1:repo1', { data: 1 })
      await cacheManager.set('github:repos:owner1:repo2', { data: 2 })
      await cacheManager.set('github:repos:owner2:repo1', { data: 3 })
      await cacheManager.set('github:users:user1', { data: 4 })

      const deleted = await cacheManager.invalidatePattern('github:repos:owner1:*')
      expect(deleted).toBe(2)

      const remaining = await cacheManager.keys()
      expect(remaining).toHaveLength(2)
      expect(remaining).toContain('github:repos:owner2:repo1')
      expect(remaining).toContain('github:users:user1')
    })
  })

  describe('convenience key generators', () => {
    it('should generate repository keys', () => {
      const key1 = cacheManager.repositoryKey('owner', 'repo')
      const key2 = cacheManager.repositoryKey('owner', 'repo', 'issues')

      expect(key1).toBe('github:repos:owner:repo')
      expect(key2).toBe('github:repos:owner:repo:issues')
    })

    it('should generate user keys', () => {
      const key1 = cacheManager.userKey('username')
      const key2 = cacheManager.userKey('username', 'repos')

      expect(key1).toBe('github:users:username')
      expect(key2).toBe('github:users:username:repos')
    })

    it('should generate search keys with consistent parameter ordering', () => {
      const key1 = cacheManager.searchKey('typescript', { sort: 'stars', order: 'desc' })
      const key2 = cacheManager.searchKey('typescript', { order: 'desc', sort: 'stars' })

      expect(key1).toBe(key2)
    })
  })
})
