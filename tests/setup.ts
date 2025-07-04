/**
 * Modern test setup file for Vitest 3.2+
 * Runs before each test file
 */

import { config } from 'dotenv'
import { afterEach, beforeAll, vi } from 'vitest'
import '@testing-library/jest-dom'

// Load test environment variables
config({ path: '.env.test' })

// Global test setup
beforeAll(async () => {
  // Ensure clean test environment
  process.env.NODE_ENV = 'test'

  // Use Node.js built-in fetch (Node 18+) if available
  if (typeof globalThis.fetch === 'undefined') {
    console.warn('No fetch implementation available. Some tests may fail.')
  }

  // Ensure TransformStream is available for MSW 2.x
  if (typeof globalThis.TransformStream === 'undefined') {
    try {
      const { TransformStream } = await import('node:stream/web')
      globalThis.TransformStream = TransformStream
    } catch {
      // Fallback for environments without stream/web
      globalThis.TransformStream = class TransformStream {
        // Minimal implementation for MSW compatibility
      }
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
})

// Clean up after each test
afterEach(() => {
  // Clear all mocks between tests
  vi.clearAllMocks()
  // Reset modules to ensure clean state
  vi.resetModules()
})

// Export test utilities for reuse
export * from './utils/integration-test-helpers'
export * from './utils/test-assertions'
export * from './utils/test-factories'
