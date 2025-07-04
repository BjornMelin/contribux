/**
 * Global setup for all test environments
 * Runs once before all tests
 */
import { config } from 'dotenv'

export default async function setup() {
  // Load test environment variables
  config({ path: '.env.test' })

  // Set up global test environment
  process.env.NODE_ENV = 'test'
  process.env.VITEST = 'true'

  // Polyfills for testing environment
  if (typeof globalThis.TransformStream === 'undefined') {
    // Minimal TransformStream polyfill for MSW compatibility
    globalThis.TransformStream = class TransformStream {
      readable: ReadableStream
      writable: WritableStream

      constructor() {
        const { readable, writable } = new TransformStream()
        this.readable = readable
        this.writable = writable
      }
    } as any
  }

  // Global test utilities
  globalThis.__TEST_ENVIRONMENT__ = 'vitest'

  console.log('🧪 Global test setup completed')
}

export async function teardown() {
  // Cleanup after all tests
  console.log('🧹 Global test teardown completed')
}
