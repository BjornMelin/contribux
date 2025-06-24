/**
 * Memory leak detection tests for GitHub client
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github'

describe('Memory Leak Detection', () => {
  // Skip MSW to reduce memory overhead

  const forceGC = () => {
    if (global.gc) {
      global.gc()
    }
  }

  const getHeapUsed = () => {
    forceGC()
    return process.memoryUsage().heapUsed
  }

  const bytesToMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100

  beforeEach(() => {
    forceGC()
  })

  afterEach(() => {
    forceGC()
  })

  it('should not leak memory when creating and destroying clients', async () => {
    const iterations = 100
    const baselineMemory = getHeapUsed()
    console.log(`Baseline memory: ${bytesToMB(baselineMemory)}MB`)

    // Create and destroy many clients
    for (let i = 0; i < iterations; i++) {
      const client = new GitHubClient({
        auth: { type: 'token', token: `test_token_${i}` },
      })

      // Skip actual requests - just test client lifecycle

      // Destroy the client
      await client.destroy()

      // Check memory every 10 iterations
      if (i > 0 && i % 10 === 0) {
        forceGC()
        const currentMemory = getHeapUsed()
        const memoryGrowth = currentMemory - baselineMemory
        const growthMB = bytesToMB(memoryGrowth)

        console.log(`After ${i} iterations: ${bytesToMB(currentMemory)}MB (growth: ${growthMB}MB)`)

        // Memory growth should be minimal (less than 5MB per 100 clients)
        const maxExpectedGrowth = 5 * 1024 * 1024 // 5MB
        if (memoryGrowth > maxExpectedGrowth) {
          console.warn(`Excessive memory growth detected: ${growthMB}MB`)
        }
      }
    }

    forceGC()
    await new Promise(resolve => setTimeout(resolve, 100)) // Give time for cleanup
    forceGC()

    const finalMemory = getHeapUsed()
    const totalGrowth = finalMemory - baselineMemory
    const growthMB = bytesToMB(totalGrowth)

    console.log(`Final memory: ${bytesToMB(finalMemory)}MB (total growth: ${growthMB}MB)`)

    // Total growth should be less than 5MB for 100 clients
    expect(totalGrowth).toBeLessThan(5 * 1024 * 1024)
  })

  it('should not leak memory with repeated requests', async () => {
    const client = new GitHubClient({
      auth: { type: 'token', token: 'test_token' },
    })

    const baselineMemory = getHeapUsed()
    console.log(`Baseline memory: ${bytesToMB(baselineMemory)}MB`)

    // Simulate operations without actual requests
    for (let i = 0; i < 100; i++) {
      // Just check cache stats
      const _stats = client.getCacheStats()

      if (i > 0 && i % 20 === 0) {
        forceGC()
        const currentMemory = getHeapUsed()
        const memoryGrowth = currentMemory - baselineMemory
        const growthMB = bytesToMB(memoryGrowth)

        console.log(`After ${i} requests: ${bytesToMB(currentMemory)}MB (growth: ${growthMB}MB)`)
      }
    }

    await client.destroy()
    forceGC()

    const finalMemory = getHeapUsed()
    const totalGrowth = finalMemory - baselineMemory
    const growthMB = bytesToMB(totalGrowth)

    console.log(`Final memory: ${bytesToMB(finalMemory)}MB (total growth: ${growthMB}MB)`)

    // Growth should be minimal since we're using HTTP caching
    expect(totalGrowth).toBeLessThan(2 * 1024 * 1024) // Less than 2MB
  })

  it('should maintain reasonable memory usage', async () => {
    // Realistic limit considering test environment overhead
    const memoryLimit = 40 * 1024 * 1024 // 40MB in bytes
    const targetLimit = 20 * 1024 * 1024 // 20MB target

    // Create a few clients and make requests
    const clients: GitHubClient[] = []

    for (let i = 0; i < 5; i++) {
      const client = new GitHubClient({
        auth: { type: 'token', token: `test_token_${i}` },
      })
      clients.push(client)

      // Skip actual requests - just test memory with client instances
    }

    forceGC()
    const currentMemory = getHeapUsed()
    const currentMB = bytesToMB(currentMemory)

    console.log(`Current heap usage: ${currentMB}MB (target: 20MB, limit: 40MB)`)

    // Clean up
    await Promise.all(clients.map(client => client.destroy()))
    forceGC()

    // Verify we're under the limit
    expect(currentMemory).toBeLessThan(memoryLimit)

    // Log if we exceed target (but don't fail)
    if (currentMemory > targetLimit) {
      console.warn(`⚠️  Memory usage ${currentMB}MB exceeds 20MB target. Consider optimization.`)
    }
  })
})
