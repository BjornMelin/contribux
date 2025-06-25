/**
 * Test cleanup utilities for proper test isolation and memory optimization
 * Enhanced for Vitest 3.2+ with memory leak prevention
 */

import { afterEach, beforeEach, vi } from 'vitest'

// Global test state management - use property access instead of delete operator

// Store original environment variables
const originalEnv = { ...process.env }

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
}

// Track active resources for cleanup
const resourceTracker = {
  timers: new Set<NodeJS.Timeout>(),
  intervals: new Set<NodeJS.Timeout>(),
  listeners: new Map<string, (() => void)[]>(),
  openConnections: new Set<{ close?: () => void; destroy?: () => void; end?: () => void }>(),
  childProcesses: new Set<{ kill?: () => void }>(),
  fileHandles: new Set<{ close?: () => void }>(),
}

/**
 * Reset all test state to ensure proper isolation and prevent memory leaks
 */
export function resetTestState() {
  // Clear all mocks first
  vi.clearAllMocks()

  // Clear all timers and intervals with enhanced tracking
  clearAllActiveTimers()
  vi.clearAllTimers()

  // Reset environment variables
  process.env = { ...originalEnv }

  // Reset console methods
  console.log = originalConsole.log
  console.error = originalConsole.error
  console.warn = originalConsole.warn
  console.info = originalConsole.info

  // Clear any module-level state
  clearModuleLevelState()

  // Clear tracked resources
  clearTrackedResources()

  // Clear nock if it exists
  try {
    const nock = require('nock')
    nock.cleanAll()
  } catch {
    // nock might not be available in all tests
  }

  // Run cleanup registry
  runCleanupRegistry()

  // Force garbage collection if available
  forceGarbageCollection()
}

/**
 * Clear module-level state that might persist between tests
 */
function clearModuleLevelState() {
  // Clear rate limiter state
  const rateLimitStore = getRateLimitStore()
  if (rateLimitStore) {
    rateLimitStore.clear()
  }

  // Clear Redis state
  clearRedisState()

  // Clear any cached configurations
  clearConfigCache()

  // Clear GitHub client state
  clearGitHubClientState()
}

/**
 * Clear GitHub client cached state
 */
function clearGitHubClientState() {
  // GitHub client instances might cache rate limit info
  // Force module reset to clear these caches
  if ((global as Record<string, unknown>).__githubClientCache) {
    ;(global as Record<string, unknown>).__githubClientCache = undefined
  }

  // Clear any rate limit trackers
  if ((global as Record<string, unknown>).__githubRateLimitState) {
    ;(global as Record<string, unknown>).__githubRateLimitState = undefined
  }
}

/**
 * Get rate limit store if available
 */
function getRateLimitStore(): Map<string, unknown> | null {
  // Rate limit stores are module-level state that need to be cleared
  // Since we can't directly access them, we'll handle this differently
  return null
}

/**
 * Clear Redis state
 */
function clearRedisState() {
  // Redis state will be cleared through module reset
  // Individual tests should handle their own Redis mocking
}

/**
 * Clear configuration cache
 */
function clearConfigCache() {
  // Configuration caches will be cleared through vi.resetModules()
  // This ensures all modules start fresh for each test
}

/**
 * Setup global test isolation
 */
export function setupTestIsolation() {
  // Ensure each test starts with clean state
  beforeEach(() => {
    resetTestState()
  })

  // Clean up after each test
  afterEach(() => {
    resetTestState()
  })
}

/**
 * Create isolated test environment
 */
export function createIsolatedTestEnv() {
  const testEnv = { ...originalEnv }

  return {
    set(key: string, value: string) {
      testEnv[key] = value
      process.env[key] = value
    },

    get(key: string) {
      return testEnv[key]
    },

    reset() {
      process.env = { ...originalEnv }
    },

    restore() {
      process.env = { ...testEnv }
    },
  }
}

/**
 * Clear all active timers and intervals to prevent memory leaks
 */
function clearAllActiveTimers() {
  // Clear tracked timers
  for (const timer of resourceTracker.timers) {
    clearTimeout(timer)
  }
  resourceTracker.timers.clear()

  // Clear tracked intervals
  for (const interval of resourceTracker.intervals) {
    clearInterval(interval)
  }
  resourceTracker.intervals.clear()

  // Clear global timer tracking if available
  if (global.__activeTimers) {
    for (const timer of global.__activeTimers) {
      clearTimeout(timer)
    }
    global.__activeTimers.clear()
  }

  if (global.__activeIntervals) {
    for (const interval of global.__activeIntervals) {
      clearInterval(interval)
    }
    global.__activeIntervals.clear()
  }
}

/**
 * Clear all tracked resources to prevent memory leaks
 */
function clearTrackedResources() {
  // Close any open connections
  for (const connection of resourceTracker.openConnections) {
    try {
      if (connection && typeof connection.close === 'function') {
        connection.close()
      } else if (connection && typeof connection.destroy === 'function') {
        connection.destroy()
      } else if (connection && typeof connection.end === 'function') {
        connection.end()
      }
    } catch (error) {
      console.warn('Failed to close connection:', error)
    }
  }
  resourceTracker.openConnections.clear()

  // Terminate child processes
  for (const process of resourceTracker.childProcesses) {
    try {
      if (process && typeof process.kill === 'function') {
        process.kill()
      }
    } catch (error) {
      console.warn('Failed to kill child process:', error)
    }
  }
  resourceTracker.childProcesses.clear()

  // Close file handles
  for (const handle of resourceTracker.fileHandles) {
    try {
      if (handle && typeof handle.close === 'function') {
        handle.close()
      }
    } catch (error) {
      console.warn('Failed to close file handle:', error)
    }
  }
  resourceTracker.fileHandles.clear()

  // Remove event listeners
  for (const [target, listeners] of resourceTracker.listeners) {
    for (const listener of listeners) {
      try {
        if (typeof target === 'string' && (global as Record<string, unknown>)[target]) {
          const globalTarget = (global as Record<string, unknown>)[target] as {
            removeEventListener?: (event: string, listener: () => void) => void
          }
          globalTarget?.removeEventListener?.('*', listener)
        }
      } catch (error) {
        console.warn('Failed to remove event listener:', error)
      }
    }
  }
  resourceTracker.listeners.clear()
}

/**
 * Run cleanup registry for custom cleanup functions
 */
function runCleanupRegistry() {
  if (global.__testCleanupRegistry) {
    for (const cleanupFn of global.__testCleanupRegistry) {
      try {
        const result = cleanupFn()
        if (result instanceof Promise) {
          result.catch(error => console.warn('Cleanup function failed:', error))
        }
      } catch (error) {
        console.warn('Cleanup function failed:', error)
      }
    }
    global.__testCleanupRegistry.clear()
  }
}

/**
 * Force garbage collection if available
 */
function forceGarbageCollection() {
  if (global.gc && typeof global.gc === 'function') {
    try {
      global.gc()
    } catch (_error) {
      // GC might not be available in all environments
    }
  }
}

/**
 * Register a resource for cleanup
 */
export function registerForCleanup(
  resource: unknown,
  type: 'connection' | 'process' | 'handle' | 'timer' | 'interval'
) {
  switch (type) {
    case 'connection':
      resourceTracker.openConnections.add(
        resource as { close?: () => void; destroy?: () => void; end?: () => void }
      )
      break
    case 'process':
      resourceTracker.childProcesses.add(resource as { kill?: () => void })
      break
    case 'handle':
      resourceTracker.fileHandles.add(resource as { close?: () => void })
      break
    case 'timer':
      resourceTracker.timers.add(resource as NodeJS.Timeout)
      break
    case 'interval':
      resourceTracker.intervals.add(resource as NodeJS.Timeout)
      break
  }
}

/**
 * Register a custom cleanup function
 */
export function registerCleanup(cleanupFn: () => Promise<void> | void) {
  if (!global.__testCleanupRegistry) {
    global.__testCleanupRegistry = new Set()
  }
  global.__testCleanupRegistry.add(cleanupFn)
}

/**
 * Enhanced setup for test isolation with memory optimization
 */
export function setupEnhancedTestIsolation() {
  // Initialize global cleanup registry
  if (!global.__testCleanupRegistry) {
    global.__testCleanupRegistry = new Set()
  }

  beforeEach(() => {
    // Reset state before each test
    resetTestState()

    // Track new resources from this point
    resourceTracker.timers.clear()
    resourceTracker.intervals.clear()
    resourceTracker.listeners.clear()
    resourceTracker.openConnections.clear()
    resourceTracker.childProcesses.clear()
    resourceTracker.fileHandles.clear()
  })

  afterEach(async () => {
    // Clean up after each test
    resetTestState()

    // Additional async cleanup delay for Node.js resource cleanup
    await new Promise(resolve => setTimeout(resolve, 10))

    // Force final GC
    forceGarbageCollection()
  })
}

/**
 * Memory usage monitoring for tests
 */
export function getMemoryUsage() {
  const usage = process.memoryUsage()
  return {
    heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100, // MB
    heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100, // MB
    external: Math.round((usage.external / 1024 / 1024) * 100) / 100, // MB
    rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100, // MB
  }
}

/**
 * Monitor memory growth during tests
 */
export function createMemoryMonitor() {
  let baseline: ReturnType<typeof getMemoryUsage> | null = null

  return {
    start() {
      forceGarbageCollection()
      baseline = getMemoryUsage()
      return baseline
    },

    check() {
      if (!baseline) throw new Error('Memory monitor not started')
      forceGarbageCollection()
      const current = getMemoryUsage()
      const growth = {
        heapUsed: current.heapUsed - baseline.heapUsed,
        heapTotal: current.heapTotal - baseline.heapTotal,
        external: current.external - baseline.external,
        rss: current.rss - baseline.rss,
      }
      return { current, baseline, growth }
    },

    expectGrowthUnder(limitMB: number) {
      const { growth } = this.check()
      if (growth.heapUsed > limitMB) {
        console.warn(`Memory growth ${growth.heapUsed}MB exceeds limit ${limitMB}MB`)
      }
      return growth.heapUsed < limitMB
    },
  }
}
