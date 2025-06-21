/**
 * Tests for the modern DataLoader implementation
 * 
 * This test suite verifies the core functionality of the DataLoader pattern
 * including batching, caching, error handling, and GitHub-specific features.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataLoader, createRepositoryDataLoader } from '@/lib/github/dataloader'
import type { RepositoryKey, RepositoryData } from '@/lib/github/dataloader'
import type { CacheManager } from '@/lib/github/caching'

describe('DataLoader', () => {
  describe('Basic functionality', () => {
    it('should batch requests correctly', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => `result-${key}`)
      })

      const loader = new DataLoader(batchFn)

      // Make multiple requests
      const promises = [
        loader.load('key1'),
        loader.load('key2'),
        loader.load('key3')
      ]

      const results = await Promise.all(promises)

      // Should have called batch function only once
      expect(batchFn).toHaveBeenCalledTimes(1)
      expect(batchFn).toHaveBeenCalledWith(['key1', 'key2', 'key3'])
      
      // Results should be correct
      expect(results).toEqual(['result-key1', 'result-key2', 'result-key3'])
    })

    it('should cache results by default', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => `result-${key}`)
      })

      const loader = new DataLoader(batchFn)

      // Load the same key twice
      const result1 = await loader.load('key1')
      const result2 = await loader.load('key1')

      // Should have called batch function only once
      expect(batchFn).toHaveBeenCalledTimes(1)
      expect(result1).toBe(result2)
      expect(result1).toBe('result-key1')
    })

    it('should handle errors correctly', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => {
          if (key === 'error-key') {
            return new Error('Test error')
          }
          return `result-${key}`
        })
      })

      const loader = new DataLoader(batchFn)

      const promises = [
        loader.load('key1'),
        loader.load('error-key'),
        loader.load('key3')
      ]

      const results = await Promise.allSettled(promises)

      expect(results[0]).toEqual({ status: 'fulfilled', value: 'result-key1' })
      expect(results[1]).toEqual({ 
        status: 'rejected', 
        reason: expect.objectContaining({ message: 'Test error' })
      })
      expect(results[2]).toEqual({ status: 'fulfilled', value: 'result-key3' })
    })

    it('should respect maxBatchSize option', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => `result-${key}`)
      })

      const loader = new DataLoader(batchFn, { maxBatchSize: 2 })

      // Make three requests (should trigger two batches)
      const promises = [
        loader.load('key1'),
        loader.load('key2'),
        loader.load('key3')
      ]

      await Promise.all(promises)

      // Should have called batch function twice due to batch size limit
      expect(batchFn).toHaveBeenCalledTimes(2)
      expect(batchFn).toHaveBeenNthCalledWith(1, ['key1', 'key2'])
      expect(batchFn).toHaveBeenNthCalledWith(2, ['key3'])
    })

    it('should support loadMany method', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => {
          if (key === 'error-key') {
            return new Error('Test error')
          }
          return `result-${key}`
        })
      })

      const loader = new DataLoader(batchFn)

      const results = await loader.loadMany(['key1', 'error-key', 'key3'])

      expect(results).toHaveLength(3)
      expect(results[0]).toBe('result-key1')
      expect(results[1]).toBeInstanceOf(Error)
      expect(results[2]).toBe('result-key3')
    })

    it('should support custom cache key function', async () => {
      const batchFn = vi.fn(async (keys: readonly { id: string }[]) => {
        return keys.map(key => `result-${key.id}`)
      })

      const loader = new DataLoader(batchFn, {
        cacheKeyFn: (key: { id: string }) => key.id
      })

      const key1 = { id: 'test' }
      const key2 = { id: 'test' } // Different object, same id

      const result1 = await loader.load(key1)
      const result2 = await loader.load(key2)

      // Should have called batch function only once due to custom cache key
      expect(batchFn).toHaveBeenCalledTimes(1)
      expect(result1).toBe(result2)
    })

    it('should support cache operations', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => `result-${key}`)
      })

      const loader = new DataLoader(batchFn)

      // Prime the cache
      loader.prime('primed-key', 'primed-value')

      const result = await loader.load('primed-key')
      expect(result).toBe('primed-value')
      expect(batchFn).not.toHaveBeenCalled()

      // Clear specific key
      loader.clear('primed-key')
      await loader.load('primed-key')
      expect(batchFn).toHaveBeenCalledTimes(1)

      // Clear all keys
      loader.clearAll()
      await loader.load('primed-key')
      expect(batchFn).toHaveBeenCalledTimes(2)
    })

    it('should provide cache metrics', async () => {
      const batchFn = vi.fn(async (keys: readonly string[]) => {
        return keys.map(key => `result-${key}`)
      })

      const loader = new DataLoader(batchFn)

      await loader.load('key1')
      await loader.load('key2')

      const metrics = loader.getCacheMetrics()
      expect(metrics.size).toBe(2)
      expect(metrics.keys).toContain('"key1"')
      expect(metrics.keys).toContain('"key2"')
    })
  })

  describe('GitHub Repository DataLoader', () => {
    it('should create a repository dataloader with correct configuration', () => {
      const mockGraphQL = vi.fn() as any
      mockGraphQL.defaults = vi.fn()
      mockGraphQL.endpoint = vi.fn()
      const loader = createRepositoryDataLoader(mockGraphQL)

      expect(loader).toBeInstanceOf(DataLoader)
      expect(loader.getCacheMetrics().size).toBe(0)
    })

    it('should batch repository requests correctly', async () => {
      const mockResponse = {
        data: {
          repo0: {
            name: 'test-repo-1',
            owner: { login: 'owner1' },
            description: 'Test repository 1',
            stargazerCount: 100,
            forkCount: 10,
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-02T00:00:00Z',
            isPrivate: false,
            url: 'https://github.com/owner1/test-repo-1',
            defaultBranchRef: { name: 'main' }
          },
          repo1: {
            name: 'test-repo-2',
            owner: { login: 'owner2' },
            description: 'Test repository 2',
            stargazerCount: 200,
            forkCount: 20,
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-02T00:00:00Z',
            isPrivate: true,
            url: 'https://github.com/owner2/test-repo-2',
            defaultBranchRef: { name: 'develop' }
          }
        }
      }

      const mockGraphQL = vi.fn().mockResolvedValue(mockResponse) as any
      mockGraphQL.defaults = vi.fn()
      mockGraphQL.endpoint = vi.fn()
      const loader = createRepositoryDataLoader(mockGraphQL)

      const keys: RepositoryKey[] = [
        { owner: 'owner1', repo: 'test-repo-1' },
        { owner: 'owner2', repo: 'test-repo-2' }
      ]

      const results = await Promise.all(keys.map(key => loader.load(key)))

      expect(mockGraphQL).toHaveBeenCalledTimes(1)
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual(mockResponse.data.repo0)
      expect(results[1]).toEqual(mockResponse.data.repo1)
    })

    it('should handle GraphQL errors correctly', async () => {
      const mockResponse = {
        data: {
          repo0: null,
          repo1: {
            name: 'test-repo-2',
            owner: { login: 'owner2' },
            description: 'Test repository 2'
          }
        },
        errors: [
          {
            message: 'Could not resolve to a Repository with the name \'test-repo-1\'.',
            path: ['repo0']
          }
        ]
      }

      const mockGraphQL = vi.fn().mockResolvedValue(mockResponse) as any
      mockGraphQL.defaults = vi.fn()
      mockGraphQL.endpoint = vi.fn()
      const loader = createRepositoryDataLoader(mockGraphQL)

      const keys: RepositoryKey[] = [
        { owner: 'owner1', repo: 'test-repo-1' },
        { owner: 'owner2', repo: 'test-repo-2' }
      ]

      const results = await Promise.allSettled(keys.map(key => loader.load(key)))

      expect(results[0]?.status).toBe('rejected')
      expect(results[1]?.status).toBe('fulfilled')
      
      if (results[0]?.status === 'rejected') {
        expect(results[0].reason?.message).toContain('test-repo-1')
      }
    })

    it('should integrate with cache manager when provided', async () => {
      const mockResponse = {
        data: {
          repo0: {
            name: 'test-repo',
            owner: { login: 'owner' },
            description: 'Test repository'
          }
        }
      }

      const mockGraphQL = vi.fn().mockResolvedValue(mockResponse) as any
      mockGraphQL.defaults = vi.fn()
      mockGraphQL.endpoint = vi.fn()
      const mockCacheManager: CacheManager = {
        generateCacheKey: vi.fn().mockReturnValue('cache-key'),
        set: vi.fn().mockResolvedValue(undefined)
      } as unknown as CacheManager

      const loader = createRepositoryDataLoader(mockGraphQL, mockCacheManager)

      await loader.load({ owner: 'owner', repo: 'test-repo' })

      expect(mockCacheManager.generateCacheKey).toHaveBeenCalledWith(
        'GET',
        '/repos/owner/test-repo',
        {}
      )
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'cache-key',
        expect.objectContaining({
          data: mockResponse.data.repo0,
          createdAt: expect.any(String)
        })
      )
    })

    it('should sanitize repository names for GraphQL', async () => {
      const mockResponse = {
        data: {
          repo0: {
            name: 'test-repo',
            owner: { login: 'owner' },
            description: 'Test repository'
          }
        }
      }

      const mockGraphQL = vi.fn().mockResolvedValue(mockResponse) as any
      mockGraphQL.defaults = vi.fn()
      mockGraphQL.endpoint = vi.fn()
      const loader = createRepositoryDataLoader(mockGraphQL)

      // Use a repository name with special characters
      await loader.load({ owner: 'owner@test', repo: 'test-repo.git' })

      expect(mockGraphQL).toHaveBeenCalledWith(
        expect.stringContaining('repository(owner: "ownertest", name: "test-repogit")')
      )
    })

    it('should handle batch failures gracefully', async () => {
      const mockGraphQL = vi.fn().mockRejectedValue(new Error('Network error')) as any
      mockGraphQL.defaults = vi.fn()
      mockGraphQL.endpoint = vi.fn()
      const loader = createRepositoryDataLoader(mockGraphQL)

      const keys: RepositoryKey[] = [
        { owner: 'owner1', repo: 'test-repo-1' },
        { owner: 'owner2', repo: 'test-repo-2' }
      ]

      const results = await Promise.allSettled(keys.map(key => loader.load(key)))

      expect(results.every(result => result.status === 'rejected')).toBe(true)
      
      results.forEach(result => {
        if (result.status === 'rejected') {
          expect(result.reason?.message).toContain('Network error')
        }
      })
    })
  })

  describe('Error handling', () => {
    it('should validate constructor parameters', () => {
      expect(() => {
        new DataLoader(null as any)
      }).toThrow('DataLoader must be constructed with a batch loading function')
    })

    it('should validate load parameters', async () => {
      const loader = new DataLoader(async (keys: readonly string[]) => keys)

      await expect(() => loader.load(null as any)).rejects.toThrow(
        'DataLoader.load() requires a key'
      )
      
      await expect(() => loader.load(undefined as any)).rejects.toThrow(
        'DataLoader.load() requires a key'
      )
    })

    it('should validate loadMany parameters', async () => {
      const loader = new DataLoader(async (keys: readonly string[]) => keys)

      await expect(() => loader.loadMany(null as any)).rejects.toThrow(
        'DataLoader.loadMany() requires an array of keys'
      )
    })

    it('should handle batch function validation errors', async () => {
      const batchFn = vi.fn().mockResolvedValue(['result1', 'result2']) // Wrong length for 1 key

      const loader = new DataLoader(batchFn)

      await expect(loader.load('key1')).rejects.toThrow(
        'DataLoader batch function must return an array of the same length'
      )
    })

    it('should handle cacheKeyFn errors', async () => {
      const loader = new DataLoader(
        async (keys: readonly string[]) => keys,
        {
          cacheKeyFn: () => {
            throw new Error('Cache key error')
          }
        }
      )

      await expect(loader.load('key1')).rejects.toThrow(
        'DataLoader cacheKeyFn failed: Error: Cache key error'
      )
    })
  })
})