/**
 * Main test setup file
 * Runs before each test file
 */
import { beforeAll, afterAll, afterEach } from 'vitest'
import { config } from 'dotenv'

// Load test environment
config({ path: '.env.test' })

// Set up test environment globals
beforeAll(() => {
  // Ensure clean test environment
  process.env.NODE_ENV = 'test'
  
  // Mock console methods to reduce noise in tests
  const originalConsole = { ...console }
  
  // Store original console for restoration
  globalThis.__originalConsole = originalConsole
})

afterEach(() => {
  // Clear any test state between tests
  if (typeof globalThis.vi !== 'undefined') {
    globalThis.vi.clearAllMocks()
  }
})

afterAll(() => {
  // Restore console if it was mocked
  if (globalThis.__originalConsole) {
    Object.assign(console, globalThis.__originalConsole)
  }
})

// Export test utilities for reuse
export * from './utils/modern-test-helpers'
export * from './utils/test-factories'
export * from './utils/test-assertions'
