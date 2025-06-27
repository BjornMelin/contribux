/**
 * Modern Vitest Test Setup Configuration
 * Simplified for maintainability using modular utilities
 *
 * Features:
 * - MSW 2.x for reliable API route testing via setupEnhancedMSW()
 * - Security mocks via setupSecurityMocks()
 * - Test environment management via createTestEnv()
 * - Enhanced cleanup via setupEnhancedTestIsolation()
 */

// MSW polyfill for Node.js environment - ensure TransformStream is globally available
// @ts-ignore - Node.js 22+ has built-in TransformStream, ensure it's always accessible for MSW
if (typeof TransformStream !== 'undefined') {
  globalThis.TransformStream = TransformStream
}

// Modern jest-dom matchers for enhanced assertions
import * as matchers from '@testing-library/jest-dom/matchers'
import { config } from 'dotenv'
import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest'
// Database utilities
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'
import { resetTestState, setupEnhancedTestIsolation } from './test-utils/cleanup'
import { setupSecurityMocks } from './test-utils/crypto'
import { createTestEnv } from './test-utils/env'
// Memory monitoring integration
import { setupMemoryMonitoringHooks } from './test-utils/memory-integration'
import { setupCommonMocks, setupFetchPolyfill } from './test-utils/mocks'
// Modular utilities - replace complex setup with clean imports
import { setupEnhancedMSW } from './test-utils/msw'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Load test environment variables
config({ path: '.env.test' })

// Setup test environment with safe defaults
const _testEnv = createTestEnv()

// Setup security mocks (WebCrypto, WebAuthn, EventEmitter)
const securityMocks = setupSecurityMocks()

// Setup MSW for HTTP mocking
setupEnhancedMSW()

// Setup common mocks (Database, WebAuthn Server, Audit System)
await setupFetchPolyfill()
setupCommonMocks()

// Suppress verbose console output in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  console.log = vi.fn()
  console.debug = vi.fn()
  console.info = vi.fn()
}

// Enhanced test isolation setup with memory optimization
setupEnhancedTestIsolation()

// Setup comprehensive memory monitoring
setupMemoryMonitoringHooks()

// Global test isolation with database cleanup
beforeEach(() => {
  resetTestState()
})

afterEach(async () => {
  resetTestState()
})

// Cleanup database connections and resources after all tests
afterAll(async () => {
  const dbManager = TestDatabaseManager.getInstance()
  await dbManager.cleanup()

  // Clean up security mocks
  securityMocks.cleanup()

  // Clear global test state
  if ((global as NodeJS.Global).__testCleanupRegistry) {
    ;(global as NodeJS.Global).__testCleanupRegistry?.clear()
  }
})
