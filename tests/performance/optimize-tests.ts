/**
 * Test Performance Optimization Utilities
 *
 * This module provides utilities to optimize test execution time
 * and reduce resource usage during test runs.
 */

import { describe, it, vi } from 'vitest'

/**
 * Reduce iteration counts for expensive tests in test environment
 */
export const TEST_ITERATIONS = {
  // Memory leak detection iterations
  MEMORY_EXTENDED_OPS: process.env.CI ? 20 : 5,
  MEMORY_HIGH_VOLUME_PAGES: process.env.CI ? 10 : 3,
  MEMORY_CLIENT_COUNT: process.env.CI ? 5 : 2,
  MEMORY_BATCH_COUNT: process.env.CI ? 10 : 3,
  MEMORY_CYCLE_COUNT: process.env.CI ? 5 : 2,

  // Load testing iterations
  LOAD_CONCURRENT_REQUESTS: process.env.CI ? 100 : 20,
  LOAD_TOKEN_ROTATION_COUNT: process.env.CI ? 50 : 10,
  LOAD_WEBHOOK_COUNT: process.env.CI ? 30 : 10,
  LOAD_STRESS_ITERATIONS: process.env.CI ? 20 : 5,

  // Rate limiting test iterations
  RATE_LIMIT_REQUEST_COUNT: process.env.CI ? 10 : 5,
  RATE_LIMIT_RETRY_COUNT: process.env.CI ? 5 : 2,
}

/**
 * Reduce wait times for tests
 */
export const TEST_TIMEOUTS = {
  // Short waits
  TICK: process.env.CI ? 10 : 5,
  SHORT: process.env.CI ? 100 : 50,
  MEDIUM: process.env.CI ? 500 : 200,
  LONG: process.env.CI ? 1000 : 500,

  // Memory test specific
  MEMORY_STABILIZATION: process.env.CI ? 100 : 50,
  MEMORY_GC_WAIT: process.env.CI ? 50 : 20,

  // Rate limit specific
  RATE_LIMIT_BACKOFF: process.env.CI ? 100 : 50,
  RATE_LIMIT_RECOVERY: process.env.CI ? 500 : 200,
}

/**
 * Mock heavy operations in test environment
 */
export function setupPerformanceOptimizations() {
  // Mock expensive crypto operations
  if (!process.env.CI) {
    vi.mock('crypto', async () => {
      const actual = await vi.importActual<typeof import('crypto')>('crypto')
      return {
        ...actual,
        randomBytes: (size: number) => {
          // Faster pseudo-random for tests
          return Buffer.from(
            Array(size)
              .fill(0)
              .map(() => Math.floor(Math.random() * 256))
          )
        },
      }
    })
  }
}

/**
 * Skip expensive tests in fast mode
 */
export function describePerformance(name: string, fn: () => void) {
  const skipExpensive = process.env.FAST_TESTS === 'true' && process.env.FORCE_ALL_TESTS !== 'true'
  return skipExpensive ? describe.skip(name, fn) : describe(name, fn)
}

/**
 * Run with reduced iterations in fast mode
 */
export function itPerformance(name: string, fn: () => void | Promise<void>, timeout?: number) {
  const skipExpensive = process.env.FAST_TESTS === 'true' && process.env.FORCE_ALL_TESTS !== 'true'
  return skipExpensive ? it.skip(name, fn, timeout) : it(name, fn, timeout)
}

/**
 * Skip very slow tests in fast mode
 */
export function itSlow(name: string, fn: () => void | Promise<void>, timeout?: number) {
  const skipSlow = process.env.FAST_TESTS === 'true'
  return skipSlow ? it.skip(name, fn, timeout) : it(name, fn, timeout)
}

/**
 * Optimize memory tracking for tests
 */
export class OptimizedMemoryTracker {
  private usage = 0
  private allocations = new Map<string, number>()
  private checkInterval = process.env.CI ? 100 : 50

  allocate(size: number): string {
    const id = Math.random().toString(36).substring(7)
    this.allocations.set(id, size)
    this.usage += size
    return id
  }

  free(id: string): void {
    const size = this.allocations.get(id)
    if (size) {
      this.usage -= size
      this.allocations.delete(id)
    }
  }

  getUsage(): number {
    return this.usage
  }

  getAllocationCount(): number {
    return this.allocations.size
  }

  reset(): void {
    this.usage = 0
    this.allocations.clear()
  }

  // Faster cleanup for tests
  quickCleanup(): void {
    this.reset()
  }
}

/**
 * Batch API mocking for performance
 */
export function setupBatchMocking(
  nock: Record<string, unknown>,
  baseUrl = 'https://api.github.com'
) {
  const responses = new Map<string, Record<string, unknown>>()

  // Pre-generate responses
  for (let i = 1; i <= 100; i++) {
    responses.set(`/repos/owner/repo${i}`, {
      id: i,
      name: `repo${i}`,
      description: `Test repository ${i}`,
    })
  }

  // Set up persistent mock
  const scope = nock(baseUrl)
    .persist()
    .get(/\/repos\/owner\/repo\d+/)
    .reply((uri: string) => {
      const match = uri.match(/repo(\d+)/)
      const num = match?.[1] ? Number.parseInt(match[1]) : 1
      const response = responses.get(`/repos/owner/repo${num}`)
      return [200, response || { error: 'Not found' }]
    })

  return scope
}

/**
 * Fast wait utility for tests
 */
export async function fastWait(ms: number): Promise<void> {
  if (process.env.FAST_TESTS === 'true') {
    // In fast mode, use minimal waits
    await new Promise(resolve => setImmediate(resolve))
  } else {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Optimize concurrent test execution
 */
export async function runConcurrentTests<T>(
  tasks: Array<() => Promise<T>>,
  options: { maxConcurrency?: number; delay?: number } = {}
): Promise<T[]> {
  const { maxConcurrency = 10, delay = 0 } = options
  const results: T[] = []

  // Run in batches for better performance
  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    const batch = tasks.slice(i, i + maxConcurrency)
    const batchResults = await Promise.all(batch.map(task => task()))
    results.push(...batchResults)

    if (delay > 0 && i + maxConcurrency < tasks.length) {
      await fastWait(delay)
    }
  }

  return results
}
