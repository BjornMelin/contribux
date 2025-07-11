/**
 * Test Environment Configuration Validation
 * Ensures the enhanced test environment is working correctly
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  loadTestEnvironment,
  validateTestEnvironment,
  getTestDatabaseUrl,
  createTestEnvironmentName,
  TEST_ENVIRONMENTS,
} from './test-environment.config'
import { EnhancedTestDatabaseManager } from './test-database-manager'
import { TestServiceMockManager } from './test-service-mocks'

describe('Enhanced Test Environment Configuration', () => {
  describe('Environment Configuration Loading', () => {
    it('should load unit test configuration correctly', () => {
      const config = loadTestEnvironment('unit')

      expect(config.type).toBe('unit')
      expect(config.useDatabase).toBe(false)
      expect(config.useAuth).toBe(false)
      expect(config.isolationLevel).toBe('basic')
      expect(config.env.NODE_ENV).toBe('test')
      expect(config.env.ENABLE_OAUTH).toBe('false')
    })

    it('should load integration test configuration correctly', () => {
      const config = loadTestEnvironment('integration')

      expect(config.type).toBe('integration')
      expect(config.useDatabase).toBe(true)
      expect(config.useAuth).toBe(true)
      expect(config.useGitHubAPI).toBe(true)
      expect(config.isolationLevel).toBe('full')
      expect(config.env.ENABLE_OAUTH).toBe('true')
    })

    it('should load database test configuration correctly', () => {
      const config = loadTestEnvironment('database')

      expect(config.type).toBe('database')
      expect(config.useDatabase).toBe(true)
      expect(config.database.migrations).toBe('incremental')
      expect(config.database.pool.max).toBe(5)
    })

    it('should load e2e test configuration correctly', () => {
      const config = loadTestEnvironment('e2e')

      expect(config.type).toBe('e2e')
      expect(config.useDatabase).toBe(true)
      expect(config.useAuth).toBe(true)
      expect(config.useMSW).toBe(true)
      expect(config.resources.timeout).toBe(60000)
    })

    it('should load performance test configuration correctly', () => {
      const config = loadTestEnvironment('performance')

      expect(config.type).toBe('performance')
      expect(config.database.pool.max).toBe(20)
      expect(config.resources.memoryLimit).toBe(2048)
      expect(config.resources.timeout).toBe(120000)
    })
  })

  describe('Environment Configuration Validation', () => {
    it('should validate unit test configuration', () => {
      const config = TEST_ENVIRONMENTS.unit
      expect(() => validateTestEnvironment(config)).not.toThrow()
    })

    it('should validate integration test configuration', () => {
      const config = TEST_ENVIRONMENTS.integration
      expect(() => validateTestEnvironment(config)).not.toThrow()
    })

    it('should validate database test configuration', () => {
      const config = TEST_ENVIRONMENTS.database
      expect(() => validateTestEnvironment(config)).not.toThrow()
    })

    it('should throw error for invalid database configuration', () => {
      const invalidConfig = {
        ...TEST_ENVIRONMENTS.database,
        database: {
          ...TEST_ENVIRONMENTS.database.database,
          pool: { min: 10, max: 5, idleTimeout: 1000 }, // max < min
        },
      }

      expect(() => validateTestEnvironment(invalidConfig)).toThrow(
        'Database pool max must be >= min'
      )
    })

    it('should throw error for missing required environment variables', () => {
      const invalidConfig = {
        ...TEST_ENVIRONMENTS.integration,
        env: {
          ...TEST_ENVIRONMENTS.integration.env,
          NEXTAUTH_SECRET: '', // Required but empty
        },
      }

      expect(() => validateTestEnvironment(invalidConfig)).toThrow()
    })
  })

  describe('Database URL Generation', () => {
    it('should generate unique database URLs for database tests', () => {
      const config = TEST_ENVIRONMENTS.database

      const url1 = getTestDatabaseUrl(config)
      const url2 = getTestDatabaseUrl(config)

      expect(url1).toContain('contribux_test_db_')
      expect(url2).toContain('contribux_test_db_')
      expect(url1).not.toBe(url2) // Should be unique
    })

    it('should return empty string for non-database tests', () => {
      const config = TEST_ENVIRONMENTS.unit
      const url = getTestDatabaseUrl(config)

      expect(url).toBe('')
    })

    it('should include timestamp and process ID in database URL', () => {
      const config = TEST_ENVIRONMENTS.integration
      const url = getTestDatabaseUrl(config)

      expect(url).toMatch(/contribux_test_integration_\d+_\d+_[a-z0-9]+/)
    })
  })

  describe('Environment Name Generation', () => {
    it('should generate unique environment names', async () => {
      const config = TEST_ENVIRONMENTS.database

      const name1 = createTestEnvironmentName(config)
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5))
      const name2 = createTestEnvironmentName(config)

      expect(name1).toContain('database_')
      expect(name2).toContain('database_')
      expect(name1).not.toBe(name2)
    })

    it('should include prefix from configuration', () => {
      const config = TEST_ENVIRONMENTS.integration
      const name = createTestEnvironmentName(config)

      expect(name.startsWith('integration_')).toBe(true)
    })
  })

  describe('Resource Configuration', () => {
    it('should have appropriate resource limits for each test type', () => {
      // Unit tests - minimal resources
      expect(TEST_ENVIRONMENTS.unit.resources.memoryLimit).toBe(128)
      expect(TEST_ENVIRONMENTS.unit.resources.timeout).toBe(10000)
      expect(TEST_ENVIRONMENTS.unit.resources.concurrency).toBe(4)

      // Integration tests - balanced resources
      expect(TEST_ENVIRONMENTS.integration.resources.memoryLimit).toBe(512)
      expect(TEST_ENVIRONMENTS.integration.resources.timeout).toBe(30000)
      expect(TEST_ENVIRONMENTS.integration.resources.concurrency).toBe(1)

      // Performance tests - high resources
      expect(TEST_ENVIRONMENTS.performance.resources.memoryLimit).toBe(2048)
      expect(TEST_ENVIRONMENTS.performance.resources.timeout).toBe(120000)
      expect(TEST_ENVIRONMENTS.performance.resources.concurrency).toBe(4)
    })
  })

  describe('Service Configuration', () => {
    it('should configure services appropriately for each test type', () => {
      // Unit tests - no external services
      expect(TEST_ENVIRONMENTS.unit.services.github.enabled).toBe(false)
      expect(TEST_ENVIRONMENTS.unit.services.auth.enabled).toBe(false)
      expect(TEST_ENVIRONMENTS.unit.services.external.redis).toBe(false)

      // Integration tests - full service mocking
      expect(TEST_ENVIRONMENTS.integration.services.github.enabled).toBe(true)
      expect(TEST_ENVIRONMENTS.integration.services.auth.enabled).toBe(true)
      expect(TEST_ENVIRONMENTS.integration.services.external.redis).toBe(true)

      // E2E tests - realistic service behavior
      expect(TEST_ENVIRONMENTS.e2e.services.github.enabled).toBe(true)
      expect(TEST_ENVIRONMENTS.e2e.services.github.rateLimitEnabled).toBe(false) // No rate limiting for E2E
      expect(TEST_ENVIRONMENTS.e2e.services.external.openai).toBe(true)
    })
  })
})

describe('Enhanced Test Database Manager', () => {
  describe('Database Manager Creation', () => {
    it('should create singleton instances for each environment type', () => {
      const config1 = TEST_ENVIRONMENTS.database
      const config2 = TEST_ENVIRONMENTS.integration

      const manager1a = EnhancedTestDatabaseManager.getInstance(config1)
      const manager1b = EnhancedTestDatabaseManager.getInstance(config1)
      const manager2 = EnhancedTestDatabaseManager.getInstance(config2)

      expect(manager1a).toBe(manager1b) // Same instance for same config type
      expect(manager1a).not.toBe(manager2) // Different instances for different types
    })

    it('should throw error when database not enabled', async () => {
      const config = TEST_ENVIRONMENTS.unit // Database disabled
      const manager = EnhancedTestDatabaseManager.getInstance(config)

      await expect(manager.setup()).rejects.toThrow('Database not enabled for unit tests')
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const config = TEST_ENVIRONMENTS.database
      const manager = EnhancedTestDatabaseManager.getInstance(config)

      const health = await manager.healthCheck()

      expect(health).toHaveProperty('healthy')
      expect(health).toHaveProperty('connections')
      expect(typeof health.healthy).toBe('boolean')
      expect(typeof health.connections).toBe('number')
    })
  })
})

describe('Test Service Mock Manager', () => {
  describe('Mock Manager Creation', () => {
    it('should create mock manager with correct configuration', () => {
      const config = TEST_ENVIRONMENTS.integration
      const mockManager = new TestServiceMockManager(config)

      expect(mockManager).toBeDefined()
    })

    it('should setup mocks based on configuration', async () => {
      const config = TEST_ENVIRONMENTS.integration
      const mockManager = new TestServiceMockManager(config)

      // This should not throw
      await expect(mockManager.setupMocks()).resolves.not.toThrow()
    })
  })

  describe('Mock Cleanup', () => {
    it('should cleanup mocks properly', async () => {
      const config = TEST_ENVIRONMENTS.unit
      const mockManager = new TestServiceMockManager(config)

      await mockManager.setupMocks()
      await expect(mockManager.cleanup()).resolves.not.toThrow()
    })
  })
})

describe('Environment Variable Isolation', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeAll(() => {
    originalEnv = { ...process.env }
  })

  it('should isolate environment variables per test type', () => {
    // Load unit test environment
    const _unitConfig = loadTestEnvironment('unit')
    expect(process.env.ENABLE_OAUTH).toBe('false')

    // Load integration test environment
    const _integrationConfig = loadTestEnvironment('integration')
    expect(process.env.ENABLE_OAUTH).toBe('true')

    // Restore original environment
    process.env = originalEnv
  })

  it('should set test-specific environment variables', () => {
    const _config = loadTestEnvironment('integration')

    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.NEXTAUTH_SECRET).toBeDefined()
    expect(process.env.GITHUB_CLIENT_ID).toBeDefined()

    // Restore original environment
    process.env = originalEnv
  })
})
