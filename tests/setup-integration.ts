import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

// Global test setup for integration tests
beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...')

  // Ensure required environment variables are set
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_TEST) {
    console.warn('⚠️ No database URL found, some tests may fail')
  }

  // Set test-specific environment
  process.env.NODE_ENV = 'test'
  process.env.NEXTAUTH_SECRET = 'test-secret'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
})

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...')

  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
})

beforeEach(async () => {
  // Reset any global state before each test
  process.env.NODE_ENV = 'test'
})

afterEach(async () => {
  // Clean up after each test
  // Note: Database cleanup should be handled by individual tests
  // to prevent interference between parallel test runs
})

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit the process, just log the error
})

// Global error handler for tests
globalThis.addEventListener?.('error', event => {
  console.error('Global error in test:', event.error)
})
