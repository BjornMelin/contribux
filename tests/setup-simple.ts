/**
 * Simplified High-Performance Test Setup
 * Replaces complex enhanced setup with fast, reliable configuration
 */

import { config } from 'dotenv'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import '@testing-library/jest-dom'
import { closeMSW, setupMSW } from './utils/msw-simple'

// Load test environment files
config({ path: '.env.test.local' })
config({ path: '.env.test' })

beforeAll(async () => {
  // Set essential environment variables
  process.env.NODE_ENV = 'test'
  process.env.SKIP_ENV_VALIDATION = 'true'
  process.env.VITEST = 'true'
  process.env.LOG_LEVEL = 'error'

  // Setup minimal browser APIs
  setupBrowserAPIs()

  // Setup crypto API with proper stubbing
  setupCryptoAPI()

  // Setup MSW for API mocking
  setupMSW()

  console.log('✅ Fast test setup loaded')
})

afterEach(() => {
  // Lightweight cleanup
  vi.clearAllMocks()
})

afterAll(() => {
  // Close MSW server
  closeMSW()
})

/**
 * Setup browser APIs for testing
 */
function setupBrowserAPIs() {
  // Mock fetch if not available
  if (typeof globalThis.fetch === 'undefined') {
    const mockResponse: Partial<Response> = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    }
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)
  }

  // Mock TransformStream for MSW
  if (typeof globalThis.TransformStream === 'undefined') {
    globalThis.TransformStream = class MockTransformStream {
      readable = new ReadableStream()
      writable = new WritableStream()
    } as unknown as typeof TransformStream
  }

  // Mock navigator
  if (!globalThis.navigator) {
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
  }

  // Mock location
  if (!globalThis.location) {
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
  }

  // Mock matchMedia
  if (!globalThis.matchMedia) {
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
}

/**
 * Setup crypto API with proper Vitest stubbing
 * Fixes: "Cannot set property crypto of #<Object> which has only a getter"
 */
function setupCryptoAPI() {
  // Use vi.stubGlobal instead of direct assignment
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('test-uuid-12345'),
    getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
      return array
    }),
    subtle: {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      generateKey: vi.fn().mockResolvedValue({}),
      encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
      decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
    },
  })
}

/**
 * Console setup for clean test output
 */
if (process.env.LOG_LEVEL === 'error') {
  const originalError = console.error
  console.log = vi.fn()
  console.info = vi.fn()
  console.warn = vi.fn()
  console.error = (...args: unknown[]) => {
    // Show debug messages temporarily
    originalError(...args)
  }
}
