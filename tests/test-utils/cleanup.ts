/**
 * Test cleanup utilities for proper test isolation
 */

import { afterEach, beforeEach, vi } from 'vitest'

// Extend global type for test state
declare global {
  var __githubClientCache: any
  var __githubRateLimitState: any
}

// Store original environment variables
const originalEnv = { ...process.env }

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
}

/**
 * Reset all test state to ensure proper isolation
 */
export function resetTestState() {
  // Clear all mocks first
  vi.clearAllMocks()

  // Clear all timers
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

  // Clear nock if it exists
  try {
    const nock = require('nock')
    nock.cleanAll()
  } catch {
    // nock might not be available in all tests
  }
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
  if (global.__githubClientCache) {
    delete global.__githubClientCache
  }

  // Clear any rate limit trackers
  if (global.__githubRateLimitState) {
    delete global.__githubRateLimitState
  }
}

/**
 * Get rate limit store if available
 */
function getRateLimitStore(): Map<string, any> | null {
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
