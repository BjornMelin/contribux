/**
 * Enhanced Test Setup - Drop-in replacement for existing setup.ts
 * Provides backward compatibility while adding enhanced isolation features
 */

import { config } from 'dotenv'
import { afterEach, beforeAll, vi } from 'vitest'
import '@testing-library/jest-dom'
import { setupEnhancedTestEnvironment } from './config/enhanced-test-setup'

// Detect test environment type from environment variables or file patterns
function detectTestEnvironmentType() {
  // Check for specific test environment indicators
  if (process.env.VITEST_CONFIG?.includes('database')) return 'database'
  if (process.env.VITEST_CONFIG?.includes('integration')) return 'integration'
  if (process.env.VITEST_CONFIG?.includes('performance')) return 'performance'

  // Default to unit tests
  return 'unit'
}

// Auto-detect and setup enhanced test environment
const testType = detectTestEnvironmentType()
const { config: testConfig, addCleanupTask } = setupEnhancedTestEnvironment(testType as any)

// Backward compatibility - legacy environment loading
beforeAll(async () => {
  // Load legacy environment files for compatibility
  try {
    config({ path: '.env.test.local' })
    config({ path: '.env.test' })
  } catch {
    // Ignore missing files
  }

  // Legacy browser API setup for tests that depend on it
  setupLegacyBrowserAPIs()

  // Skip environment validation for tests
  process.env.SKIP_ENV_VALIDATION = 'true'

  console.log(`🔧 Enhanced test setup active (${testType} mode)`)
})

afterEach(() => {
  // Legacy cleanup - maintain existing behavior
  vi.clearAllMocks()
  vi.resetModules()
})

/**
 * Legacy browser API setup for backward compatibility
 */
function setupLegacyBrowserAPIs() {
  // Use Node.js built-in fetch if available
  if (typeof globalThis.fetch === 'undefined') {
    console.warn('No fetch implementation available. Some tests may fail.')
  }

  // Ensure TransformStream is available for MSW 2.x
  if (typeof globalThis.TransformStream === 'undefined') {
    try {
      import('node:stream/web').then(({ TransformStream }) => {
        globalThis.TransformStream = TransformStream
      })
    } catch {
      // Fallback for environments without stream/web
      globalThis.TransformStream = class TransformStream {
        // Minimal implementation for MSW compatibility
      } as any
    }
  }

  // Mock browser APIs that may be needed in tests
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'test-user-agent',
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    },
    writable: true,
  })

  // Mock location for tests that need it
  Object.defineProperty(globalThis, 'location', {
    value: {
      href: 'http://localhost:3000',
      origin: 'http://localhost:3000',
      pathname: '/',
      search: '',
      hash: '',
    },
    writable: true,
  })

  // Mock matchMedia for responsive components
  Object.defineProperty(globalThis, 'matchMedia', {
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    writable: true,
  })
}

/**
 * Database connection timeout handler - Legacy support
 */
const originalTimeout = setTimeout
global.setTimeout = ((fn: TimerHandler, delay: number, ...args: unknown[]) => {
  // Reduce database operation timeouts in test environment
  const adjustedDelay = delay > 10000 ? 10000 : delay // Max 10s timeout for database operations
  return originalTimeout(fn, adjustedDelay, ...args)
}) as typeof setTimeout

/**
 * Handle database connection errors - Legacy support
 */
process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason === 'object' && 'code' in reason) {
    console.error('Database connection error:', reason)
  } else {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  }
})

// Export test utilities for compatibility
export * from './utils/integration-test-helpers'
export * from './utils/test-assertions'
export * from './utils/test-factories'

// Export enhanced utilities
export { type testUtils, testConfig, addCleanupTask }
export {
  setupUnitTests,
  setupIntegrationTests,
  setupDatabaseTests,
  setupE2ETests,
  setupPerformanceTests,
} from './config/enhanced-test-setup'

console.log(`✅ Enhanced test setup loaded for ${testType} tests`)
