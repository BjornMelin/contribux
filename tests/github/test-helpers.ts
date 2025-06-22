/**
 * Test helpers for async and timing-sensitive tests
 */

import { vi, beforeEach, afterEach } from 'vitest'
import nock from 'nock'

// Store references to created clients for cleanup
const activeClients = new Set<{ destroy: () => Promise<void> }>()

/**
 * Register a client for automatic cleanup
 */
export function registerClientForCleanup(client: { destroy: () => Promise<void> }) {
  activeClients.add(client)
}

/**
 * Setup GitHub test isolation
 */
export function setupGitHubTestIsolation() {
  beforeEach(() => {
    // Clean all nock interceptors
    nock.cleanAll()
    
    // Disable net connect to ensure all requests are mocked
    nock.disableNetConnect()
    
    // Clear all mocks
    vi.clearAllMocks()
    
    // Clear any global GitHub state
    if (global.__githubClientCache) {
      delete global.__githubClientCache
    }
    if (global.__githubRateLimitState) {
      delete global.__githubRateLimitState
    }
    
    // Reset nock back to clean state
    nock.restore()
    nock.activate()
  })

  afterEach(async () => {
    // Clean all nock interceptors
    nock.cleanAll()
    
    // Re-enable net connect
    nock.enableNetConnect()
    
    // Destroy all active clients
    const destroyPromises = Array.from(activeClients).map(async (client) => {
      try {
        await client.destroy()
      } catch (error) {
        // Ignore cleanup errors
      }
    })
    await Promise.all(destroyPromises)
    activeClients.clear()
    
    // Clear all mocks
    vi.clearAllMocks()
    
    // Restore nock to clean state
    nock.restore()
  })
}

/**
 * Create a tracked GitHub client that will be automatically cleaned up
 */
export function createTrackedClient(ClientClass: any, config?: any) {
  const client = new ClientClass(config)
  registerClientForCleanup(client)
  return client
}

/**
 * Wait for a condition to be true with configurable polling
 * @param condition Function that returns true when condition is met
 * @param options Configuration for polling behavior
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number
    interval?: number
    errorMessage?: string
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, errorMessage = 'Condition not met within timeout' } =
    options

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await condition()
    if (result) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(errorMessage)
}

/**
 * Wait for a value to change from its current state
 * @param getValue Function that returns the current value
 * @param initialValue The initial value to wait for change from
 * @param options Configuration for polling behavior
 */
export async function waitForChange<T>(
  getValue: () => T | Promise<T>,
  initialValue: T,
  options: {
    timeout?: number
    interval?: number
    errorMessage?: string
  } = {}
): Promise<T> {
  const { timeout = 5000, interval = 50, errorMessage = 'Value did not change within timeout' } =
    options

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const currentValue = await getValue()
    if (currentValue !== initialValue) {
      return currentValue
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(errorMessage)
}

/**
 * Create a controllable timer mock for deterministic testing
 */
export class MockTimer {
  private currentTime: number
  private timers: Array<{
    id: number
    callback: () => void
    time: number
    interval?: number
  }> = []
  private nextId = 1

  constructor(initialTime = 0) {
    this.currentTime = initialTime
  }

  now(): number {
    return this.currentTime
  }

  setTimeout(callback: () => void, delay: number): number {
    const id = this.nextId++
    this.timers.push({
      id,
      callback,
      time: this.currentTime + delay,
    })
    return id
  }

  setInterval(callback: () => void, interval: number): number {
    const id = this.nextId++
    this.timers.push({
      id,
      callback,
      time: this.currentTime + interval,
      interval,
    })
    return id
  }

  clearTimeout(id: number): void {
    this.timers = this.timers.filter(timer => timer.id !== id)
  }

  clearInterval(id: number): void {
    this.clearTimeout(id)
  }

  advance(ms: number): void {
    const targetTime = this.currentTime + ms
    
    while (this.currentTime < targetTime) {
      // Find the next timer to fire
      const nextTimer = this.timers
        .filter(timer => timer.time <= targetTime)
        .sort((a, b) => a.time - b.time)[0]

      if (!nextTimer) {
        this.currentTime = targetTime
        break
      }

      // Advance to timer time
      this.currentTime = nextTimer.time

      // Execute callback
      nextTimer.callback()

      // Handle intervals
      if (nextTimer.interval) {
        nextTimer.time += nextTimer.interval
      } else {
        // Remove one-time timers
        this.timers = this.timers.filter(timer => timer.id !== nextTimer.id)
      }
    }
  }

  reset(): void {
    this.currentTime = 0
    this.timers = []
    this.nextId = 1
  }
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

/**
 * Helper to test retry behavior deterministically
 */
export class RetryTestHelper {
  private attempts = 0
  private responses: Array<{ error?: Error; data?: unknown }> = []

  constructor(responses: Array<{ error?: Error; data?: unknown }>) {
    this.responses = responses
  }

  async execute(): Promise<unknown> {
    const response = this.responses[this.attempts] || { error: new Error('No more responses') }
    this.attempts++

    if (response.error) {
      throw response.error
    }
    return response.data
  }

  getAttempts(): number {
    return this.attempts
  }

  reset(): void {
    this.attempts = 0
  }
}

/**
 * Mock rate limit headers for consistent testing
 */
export function createRateLimitHeaders(options: {
  limit?: number
  remaining?: number
  reset?: number
  used?: number
  retryAfter?: number
} = {}): Record<string, string> {
  const {
    limit = 5000,
    remaining = 4999,
    reset = Math.floor(Date.now() / 1000) + 3600,
    used = limit - remaining,
    retryAfter,
  } = options

  const headers: Record<string, string> = {
    'x-ratelimit-limit': limit.toString(),
    'x-ratelimit-remaining': remaining.toString(),
    'x-ratelimit-reset': reset.toString(),
    'x-ratelimit-used': used.toString(),
  }

  if (retryAfter !== undefined) {
    headers['retry-after'] = retryAfter.toString()
  }

  return headers
}

/**
 * Create mock GitHub error responses
 */
export function createGitHubError(
  status: number,
  message: string,
  headers: Record<string, string> = {}
): Error & { status: number; response: { data: unknown; headers: Record<string, string> } } {
  const error = new Error(message) as Error & {
    status: number
    response: { data: unknown; headers: Record<string, string> }
  }
  error.status = status
  error.response = {
    data: { message },
    headers,
  }
  return error
}