// Component test setup for React Testing Library and JSDOM

// Import jest-dom matchers for Vitest
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

import { cleanup } from '@testing-library/react'
// Make React available globally for JSX transform
import React from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

// @ts-ignore
global.React = React

// Type declarations are available through tests/vitest.d.ts

// Clean up after each test
afterEach(() => {
  // Clean up Testing Library rendered components
  cleanup()

  // Clear all mocks (avoid resetAllMocks to prevent test pollution)
  vi.clearAllMocks()
})

// Setup before each test
beforeEach(() => {
  // Clear all mocks (avoid resetAllMocks to prevent test pollution)
  vi.clearAllMocks()
})

// Mock Next.js router by default for all component tests
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(''),
    has: vi.fn().mockReturnValue(false),
    getAll: vi.fn().mockReturnValue([]),
    entries: vi.fn().mockReturnValue([]),
    forEach: vi.fn(),
    keys: vi.fn().mockReturnValue([]),
    values: vi.fn().mockReturnValue([]),
  }),
  usePathname: () => '/',
  useParams: () => ({}),
}))

// Mock window.location.reload for retry buttons
Object.defineProperty(window, 'location', {
  value: {
    reload: vi.fn(),
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
  },
  writable: true,
})

// Mock ResizeObserver for components that might use it
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Suppress console output in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    // Keep warn and error for debugging test issues
  }
}
