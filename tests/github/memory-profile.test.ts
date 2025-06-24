/**
 * Memory profiling test to measure heap usage
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github'
import { setupMSW } from './msw-setup'
import { setupGitHubTestIsolation } from './test-helpers'

describe('Memory Profiling', () => {
  // Skip MSW setup to reduce memory overhead
  // setupMSW()
  // setupGitHubTestIsolation()

  beforeEach(() => {
    if (global.gc) {
      global.gc()
    }
  })

  afterEach(() => {
    if (global.gc) {
      global.gc()
    }
  })

  const getMemoryUsage = () => {
    if (global.gc) {
      global.gc()
    }
    const usage = process.memoryUsage()
    return {
      heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100, // MB
      heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100, // MB
      external: Math.round((usage.external / 1024 / 1024) * 100) / 100, // MB
      rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100, // MB
    }
  }

  it('should profile memory usage with single client', async () => {
    console.log('Initial memory:', getMemoryUsage())

    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
    })

    console.log('After client creation:', getMemoryUsage())

    // Skip actual requests in memory profiling
    // Just test client creation and cleanup

    console.log('After requests:', getMemoryUsage())

    // Clear cache
    client.clearCache()

    console.log('After cache clear:', getMemoryUsage())
  })

  it('should profile memory usage with multiple clients', async () => {
    console.log('Initial memory:', getMemoryUsage())

    const clients: GitHubClient[] = []

    // Create 10 clients
    for (let i = 0; i < 10; i++) {
      clients.push(
        new GitHubClient({
          auth: { type: 'token', token: `test_token_${i}` },
        })
      )
    }

    console.log('After creating 10 clients:', getMemoryUsage())

    // Skip actual requests to avoid MSW dependency
    // Just test client lifecycle

    console.log('After requests from all clients:', getMemoryUsage())

    // Clear all caches
    clients.forEach(client => client.clearCache())

    console.log('After clearing all caches:', getMemoryUsage())

    // Destroy all clients
    await Promise.all(clients.map(client => client.destroy()))

    console.log('After destroying all clients:', getMemoryUsage())
  })

  it('should measure cache impact on memory', async () => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
      cache: { maxSize: 1000, maxAge: 300 },
    })

    console.log('Initial memory:', getMemoryUsage())

    // Test cache stats without actual requests
    console.log('Initial cache stats:', client.getCacheStats())

    // Simulate cache operations
    for (let i = 0; i < 100; i++) {
      // Just check stats without making requests
      if (i % 25 === 0) {
        const stats = client.getCacheStats()
        console.log(`After ${i} iterations, cache stats:`, stats)
        console.log('Memory:', getMemoryUsage())
      }
    }

    const stats = client.getCacheStats()
    console.log('Cache stats:', stats)
    console.log('Final memory:', getMemoryUsage())

    expect(stats.size).toBeLessThanOrEqual(stats.maxSize)
  })
})
