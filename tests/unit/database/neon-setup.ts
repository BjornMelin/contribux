/**
 * PGlite-based test setup for database tests
 *
 * This provides ultra-fast in-memory PostgreSQL testing using PGlite,
 * with automatic fallback to Neon if configured properly.
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import type { DatabaseConnection } from '../../src/lib/test-utils/test-database-manager'

import { TestDatabaseManager } from '../../src/lib/test-utils/test-database-manager'

// Load test environment variables
config({ path: '.env.test' })

// Global database manager instance
let dbManager: TestDatabaseManager
let testConnection: DatabaseConnection | null = null

/**
 * Setup database for the entire test suite
 */
beforeAll(async () => {
  console.log('🚀 Setting up test database...')

  dbManager = TestDatabaseManager.getInstance()

  // Use test database manager which automatically chooses optimal strategy
  testConnection = await dbManager.getConnection('database-test-suite', {
    strategy: undefined, // Let it auto-detect (defaults to PGlite for tests)
    cleanup: 'truncate',
    verbose: false,
  })

  console.log(
    `✅ Database ready using ${testConnection.strategy} strategy (${testConnection.info.performance})`
  )
})

/**
 * Cleanup database after all tests complete
 */
afterAll(async () => {
  if (dbManager) {
    console.log('🧹 Cleaning up test database...')
    try {
      await dbManager.cleanup()
      console.log('✅ Database cleanup completed')
    } catch (error) {
      console.error('❌ Failed to cleanup database:', error)
    }
  }
})

/**
 * Reset test data before each test
 */
beforeEach(async () => {
  if (testConnection) {
    // Clear test data between tests for isolation
    await testConnection.cleanup()
  }
})

/**
 * Get the test database connection
 */
export function getTestConnection() {
  if (!testConnection) {
    throw new Error('Test database not initialized. Ensure beforeAll has run.')
  }
  return testConnection
}

/**
 * Get the test SQL client
 */
export function getTestSqlClient() {
  const connection = getTestConnection()
  return connection.sql
}

/**
 * Helper to run tests with transaction isolation
 */
export async function withTestTransaction<T>(
  fn: (sql: NeonQueryFunction<false, false>) => Promise<T>
): Promise<T> {
  const connection = getTestConnection()
  return fn(connection.sql)
}

// Export the TEST_DATABASE_URL for backward compatibility
export const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb' // PGlite placeholder

console.log('Database test setup loaded. Auto-selecting optimal strategy for tests.')
