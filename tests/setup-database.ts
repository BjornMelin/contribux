import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// Global test setup for database tests
beforeAll(async () => {
  console.log('🗄️ Setting up database test environment...')
  
  // Validate database connection
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST
  if (!dbUrl) {
    throw new Error('DATABASE_URL or DATABASE_URL_TEST must be set for database tests')
  }

  console.log('✅ Database URL configured')
  
  // Set test environment
  process.env.NODE_ENV = 'test'
})

afterAll(async () => {
  console.log('🧹 Cleaning up database test environment...')
  
  // Force garbage collection
  if (global.gc) {
    global.gc()
  }
})

beforeEach(async () => {
  // Each database test should handle its own setup/teardown
  // to ensure proper isolation
})

afterEach(async () => {
  // Each database test should handle its own cleanup
  // This prevents conflicts between tests
})

// Database connection timeout handler
const originalTimeout = setTimeout
global.setTimeout = ((fn: any, delay: number, ...args: any[]) => {
  // Reduce database operation timeouts in test environment
  if (delay > 10000) {
    delay = 10000 // Max 10s timeout for database operations
  }
  return originalTimeout(fn, delay, ...args)
}) as typeof setTimeout

// Handle database connection errors
process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason === 'object' && 'code' in reason) {
    console.error('Database connection error:', reason)
  } else {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  }
})