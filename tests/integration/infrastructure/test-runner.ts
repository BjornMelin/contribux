/**
 * Integration Test Runner
 *
 * Provides utilities for running integration tests with proper setup,
 * execution, and teardown phases.
 */

import { afterAll, beforeAll, describe, it } from 'vitest'
import { MemoryProfiler } from './metrics-collector'
import type { IntegrationTestContext } from './test-config'
import { IntegrationTestSetup } from './test-setup'

let globalSetup: IntegrationTestSetup | null = null
let globalContext: IntegrationTestContext | null = null

/**
 * Setup integration test suite
 */
export function setupIntegrationTests(): {
  getContext: () => IntegrationTestContext
  skipIfNoEnv: () => void
} {
  beforeAll(async () => {
    console.log('Setting up integration test environment...')
    globalSetup = new IntegrationTestSetup()
    globalContext = await globalSetup.setup()
  }, 120000) // 2 minute timeout for setup

  afterAll(async () => {
    console.log('Tearing down integration test environment...')
    if (globalSetup) {
      await globalSetup.cleanup()
    }
  }, 60000) // 1 minute timeout for cleanup

  return {
    getContext: () => {
      if (!globalContext) {
        throw new Error('Integration test context not initialized')
      }
      return globalContext
    },
    skipIfNoEnv: () => {
      const hasRequiredEnv = process.env.GITHUB_TEST_TOKEN && process.env.GITHUB_TEST_ORG
      if (!hasRequiredEnv) {
        console.log('Skipping integration tests - missing required environment variables')
        return true
      }
      return false
    },
  }
}

/**
 * Integration test helper with automatic metrics collection
 */
export function integrationTest(
  name: string,
  fn: (context: IntegrationTestContext) => Promise<void>,
  options?: {
    timeout?: number
    memoryProfiling?: boolean
  }
): void {
  const { timeout = 30000, memoryProfiling = true } = options || {}

  it(
    name,
    async () => {
      if (!globalContext) {
        throw new Error('Integration test context not initialized')
      }

      let profiler: MemoryProfiler | undefined

      // Start memory profiling if enabled
      if (memoryProfiling && globalContext.metricsCollector) {
        profiler = new MemoryProfiler(globalContext.metricsCollector)
        profiler.start()
      }

      try {
        // Run the test
        await fn(globalContext)
      } finally {
        // Stop memory profiling
        if (profiler) {
          profiler.stop()
        }
      }
    },
    timeout
  )
}

/**
 * Create a test suite with integration test setup
 */
export function describeIntegration(
  name: string,
  fn: (context: IntegrationTestContext) => void,
  options?: {
    skip?: boolean
    skipIfNoEnv?: boolean
  }
): void {
  const { skip = false, skipIfNoEnv = true } = options || {}

  // Check environment variables
  if (skipIfNoEnv) {
    const hasRequiredEnv = process.env.GITHUB_TEST_TOKEN && process.env.GITHUB_TEST_ORG
    if (!hasRequiredEnv) {
      describe.skip(name, () => {
        it('skipped due to missing environment variables', () => {})
      })
      return
    }
  }

  const describeFn = skip ? describe.skip : describe

  describeFn(name, () => {
    const { getContext } = setupIntegrationTests()

    // Provide context to test suite
    fn(getContext())
  })
}

/**
 * Retry helper for flaky operations
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number
    delay?: number
    backoff?: number
  }
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 2 } = options || {}

  let lastError: Error | undefined

  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (i < retries - 1) {
        const waitTime = delay * backoff ** i
        console.log(`Retry ${i + 1}/${retries} after ${waitTime}ms: ${lastError.message}`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  throw lastError
}

/**
 * Wait for a condition with timeout
 */
export async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  options?: {
    timeout?: number
    interval?: number
    message?: string
  }
): Promise<void> {
  const { timeout = 10000, interval = 100, message = 'Condition not met' } = options || {}

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await condition()
    if (result) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(`${message} (timeout: ${timeout}ms)`)
}

/**
 * Performance test helper
 */
export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T>,
  context?: IntegrationTestContext
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now()

  try {
    const result = await fn()
    const duration = performance.now() - startTime

    // Record metric if collector available
    if (context?.metricsCollector) {
      context.metricsCollector.recordApiCall(name, duration, 200)
    }

    console.log(`${name}: ${duration.toFixed(2)}ms`)

    return { result, duration }
  } catch (error) {
    const duration = performance.now() - startTime

    // Record error metric
    if (context?.metricsCollector) {
      context.metricsCollector.recordApiCall(name, duration, 500)
    }

    throw error
  }
}
