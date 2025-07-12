/**
 * Enhanced Database Test Setup
 * Dedicated setup for database tests with full isolation
 */

import { setupDatabaseTests } from './config/enhanced-test-setup'

// Setup enhanced database test environment
const { config, addCleanupTask, getDbManager } = setupDatabaseTests()

// Export utilities specific to database testing
export { config, addCleanupTask, getDbManager }

// Database-specific test utilities
export const dbTestUtils = {
  /**
   * Get test database connection details
   */
  getConnection: () => {
    const dbManager = getDbManager()
    return dbManager ? dbManager.getConnections()[0] : null
  },

  /**
   * Check database health
   */
  checkHealth: async () => {
    const dbManager = getDbManager()
    return dbManager ? dbManager.healthCheck() : { healthy: false, connections: 0 }
  },

  /**
   * Wait for database to be ready
   */
  waitForReady: async (timeoutMs = 10000) => {
    const startTime = Date.now()
    const dbManager = getDbManager()

    if (!dbManager) {
      throw new Error('Database manager not available')
    }

    while (Date.now() - startTime < timeoutMs) {
      const health = await dbManager.healthCheck()
      if (health.healthy) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    throw new Error(`Database not ready after ${timeoutMs}ms`)
  },

  /**
   * Get current test database name
   */
  getDatabaseName: () => {
    const connection = dbTestUtils.getConnection()
    return connection?.name || 'unknown'
  },
}

console.log('🗄️ Enhanced database test setup loaded')
