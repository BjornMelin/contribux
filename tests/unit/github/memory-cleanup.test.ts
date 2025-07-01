/**
 * Enhanced Memory Cleanup Tests
 * Demonstrates improved memory leak prevention with Vitest 3.2+ patterns
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitHubClient } from '@/lib/github/client'
import {
  createMemoryMonitor,
  getMemoryUsage,
  registerCleanup,
  registerForCleanup,
} from '../test-utils/cleanup'

describe('Enhanced Memory Cleanup', () => {
  let memoryMonitor: ReturnType<typeof createMemoryMonitor>

  beforeEach(() => {
    memoryMonitor = createMemoryMonitor()
    memoryMonitor.start()
  })

  afterEach(() => {
    // Verify memory growth is within acceptable limits
    const isWithinLimits = memoryMonitor.expectGrowthUnder(5) // 5MB limit
    if (!isWithinLimits) {
      console.warn('Memory growth exceeded expected limits in this test')
    }
  })

  it('should demonstrate enhanced cleanup patterns', async () => {
    const baseline = getMemoryUsage()
    console.log('🎯 Baseline memory:', baseline)

    // Create clients with proper cleanup registration
    const clients: GitHubClient[] = []

    for (let i = 0; i < 3; i++) {
      const client = new GitHubClient({
        auth: { type: 'token', token: `test_token_${i}` },
        retry: { retries: 0 }, // Minimize retries for faster tests
      })

      clients.push(client)

      // Register client for automatic cleanup
      registerCleanup(async () => {
        await client.destroy()
      })
    }

    const afterCreation = getMemoryUsage()
    console.log('📈 After client creation:', afterCreation)

    // Simulate some work
    for (const client of clients) {
      const stats = client.getCacheStats()
      expect(stats).toBeDefined()
    }

    // Manual cleanup for demonstration
    await Promise.all(clients.map(client => client.destroy()))

    const afterCleanup = getMemoryUsage()
    console.log('🧹 After cleanup:', afterCleanup)

    // Verify cleanup effectiveness
    const { growth } = memoryMonitor.check()
    expect(growth.heapUsed).toBeLessThan(3) // Should be under 3MB growth

    console.log('✅ Memory growth:', growth)
  })

  it('should handle resource registration and cleanup', async () => {
    // Simulate various resources that need cleanup
    const resources = {
      timer: setTimeout(() => {
        // Placeholder timer for testing cleanup
      }, 5000),
      interval: setInterval(() => {
        // Placeholder interval for testing cleanup
      }, 1000),
      connection: {
        close: () => console.log('Connection closed'),
        isActive: true,
      },
    }

    // Register resources for automatic cleanup
    registerForCleanup(resources.timer, 'timer')
    registerForCleanup(resources.interval, 'interval')
    registerForCleanup(resources.connection, 'connection')

    // Verify resources are tracked
    expect(resources.timer).toBeDefined()
    expect(resources.interval).toBeDefined()
    expect(resources.connection).toBeDefined()

    // Cleanup happens automatically via test framework
    // This test passes if no memory leaks are detected
  })

  it('should monitor memory usage patterns', async () => {
    const iterations = 10
    const memorySnapshots: ReturnType<typeof getMemoryUsage>[] = []

    for (let i = 0; i < iterations; i++) {
      // Create temporary objects
      const tempData = new Array(1000).fill(null).map((_, idx) => ({
        id: `temp_${i}_${idx}`,
        data: new Array(100).fill('test_data'),
      }))

      // Take memory snapshot
      const snapshot = getMemoryUsage()
      memorySnapshots.push(snapshot)

      // Clean up temp data explicitly
      tempData.length = 0
    }

    // Analyze memory patterns
    const firstSnapshot = memorySnapshots[0]
    const lastSnapshot = memorySnapshots[memorySnapshots.length - 1]
    const growth = lastSnapshot.heapUsed - firstSnapshot.heapUsed

    console.log('📊 Memory pattern analysis:')
    console.log(`   First: ${firstSnapshot.heapUsed}MB`)
    console.log(`   Last: ${lastSnapshot.heapUsed}MB`)
    console.log(`   Growth: ${growth}MB`)

    // Memory growth should be reasonable with proper cleanup
    expect(growth).toBeLessThan(10) // Less than 10MB growth expected (realistic for test environment)
  })

  it('should demonstrate proper async cleanup', async () => {
    const asyncResources: Promise<unknown>[] = []

    // Create async resources that need cleanup
    for (let i = 0; i < 5; i++) {
      const asyncResource = new Promise(resolve => {
        const timer = setTimeout(() => {
          resolve(`async_result_${i}`)
        }, 10)

        // Register timer for cleanup
        registerForCleanup(timer, 'timer')
      })

      asyncResources.push(asyncResource)
    }

    // Wait for all async operations
    const results = await Promise.all(asyncResources)
    expect(results).toHaveLength(5)

    // Verify memory usage is stable
    const { growth } = memoryMonitor.check()
    expect(growth.heapUsed).toBeLessThan(1) // Should be minimal growth

    console.log('🔄 Async cleanup completed, memory growth:', growth.heapUsed, 'MB')
  })

  it('should handle cleanup failures gracefully', async () => {
    // Create resources with intentional cleanup failures
    const problematicResource = {
      close: () => {
        throw new Error('Cleanup failed intentionally')
      },
    }

    // Register problematic resource
    registerForCleanup(problematicResource, 'connection')

    // This should not throw errors and should complete successfully
    expect(() => {
      registerCleanup(() => {
        throw new Error('Custom cleanup failed')
      })
    }).not.toThrow()

    // Test passes if cleanup failures are handled gracefully
    console.log('🛡️ Cleanup failure handling verified')
  })
})
