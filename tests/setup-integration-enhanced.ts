/**
 * Enhanced Integration Test Setup
 * Dedicated setup for integration tests with full service mocking and database isolation
 */

import { setupIntegrationTests } from './config/enhanced-test-setup'

// Setup enhanced integration test environment
const { config, addCleanupTask, getDbManager, getMockManager } = setupIntegrationTests()

// Export utilities specific to integration testing
export { config, addCleanupTask, getDbManager, getMockManager }

// Integration-specific test utilities
export const integrationTestUtils = {
  /**
   * Get active service mocks
   */
  getActiveMocks: () => {
    const mockManager = getMockManager()
    return mockManager ? mockManager.getActiveMocks() : []
  },

  /**
   * Get test database connection
   */
  getDatabaseConnection: () => {
    const dbManager = getDbManager()
    return dbManager ? dbManager.getConnections()[0] : null
  },

  /**
   * Get test user for authentication flows
   */
  getTestUser: () => config.services.auth.defaultUser,

  /**
   * Simulate GitHub API error for error testing
   */
  simulateGitHubError: (enabled = true) => {
    // This would be used by tests to enable/disable error simulation
    // The actual implementation depends on how mocks are structured
    process.env.TEST_GITHUB_ERROR_SIMULATION = enabled.toString()
  },

  /**
   * Wait for all services to be ready
   */
  waitForServices: async (timeoutMs = 15000) => {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      // Check database
      const dbManager = getDbManager()
      if (dbManager) {
        const dbHealth = await dbManager.healthCheck()
        if (!dbHealth.healthy) {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
      }

      // Check mocks
      const mockManager = getMockManager()
      if (mockManager) {
        const activeMocks = mockManager.getActiveMocks()
        if (activeMocks.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
      }

      return true
    }

    throw new Error(`Services not ready after ${timeoutMs}ms`)
  },

  /**
   * Reset all service mocks to default state
   */
  resetMocks: async () => {
    const mockManager = getMockManager()
    if (mockManager) {
      // Reset MSW handlers and clear vi mocks
      vi.clearAllMocks()
    }
  },

  /**
   * Get test session for authentication testing
   */
  getTestSession: () => ({
    user: config.services.auth.defaultUser,
    expires: new Date(Date.now() + config.services.auth.sessionTimeout).toISOString(),
    accessToken: 'test-access-token-integration',
  }),
}

// Re-export vi for test convenience
export { vi } from 'vitest'

console.log('🔗 Enhanced integration test setup loaded')
