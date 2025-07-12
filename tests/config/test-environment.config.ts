/**
 * Dedicated Test Environment Configuration
 * Provides comprehensive test environment setup with full isolation
 */

import path from 'node:path'
import { config } from 'dotenv'
import type { TestUser } from '@/lib/test-utils/database-factories'

// Test environment types
export type TestEnvironmentType = 'unit' | 'integration' | 'database' | 'e2e' | 'performance'

// Environment configuration interface
export interface TestEnvironmentConfig {
  /** Test environment type */
  type: TestEnvironmentType
  /** Enable database isolation */
  useDatabase: boolean
  /** Enable authentication mocking */
  useAuth: boolean
  /** Enable GitHub API mocking */
  useGitHubAPI: boolean
  /** Enable Next.js router mocking */
  useRouter: boolean
  /** Enable MSW HTTP mocking */
  useMSW: boolean
  /** Test database configuration */
  database: TestDatabaseConfig
  /** Service mock configuration */
  services: TestServiceConfig
  /** Environment variables */
  env: Record<string, string>
  /** Isolation level */
  isolationLevel: 'none' | 'basic' | 'full'
  /** Resource limits */
  resources: TestResourceConfig
}

export interface TestDatabaseConfig {
  /** Database URL template */
  urlTemplate: string
  /** Database name prefix for test isolation */
  namePrefix: string
  /** Connection pool settings */
  pool: {
    min: number
    max: number
    idleTimeout: number
  }
  /** Enable automatic cleanup */
  autoCleanup: boolean
  /** Migration strategy */
  migrations: 'none' | 'fresh' | 'incremental'
}

export interface TestServiceConfig {
  /** GitHub API mock settings */
  github: {
    enabled: boolean
    rateLimitEnabled: boolean
    errorSimulation: boolean
  }
  /** Authentication mock settings */
  auth: {
    enabled: boolean
    defaultUser: TestUser | null
    sessionTimeout: number
  }
  /** External service mocks */
  external: {
    redis: boolean
    openai: boolean
    webhooks: boolean
  }
}

export interface TestResourceConfig {
  /** Memory limit per test (MB) */
  memoryLimit: number
  /** Test timeout (ms) */
  timeout: number
  /** Hook timeout (ms) */
  hookTimeout: number
  /** Retry attempts */
  retries: number
  /** Concurrency level */
  concurrency: number
}

/**
 * Test Environment Configurations by Type
 */
export const TEST_ENVIRONMENTS: Record<TestEnvironmentType, TestEnvironmentConfig> = {
  unit: {
    type: 'unit',
    useDatabase: false,
    useAuth: false,
    useGitHubAPI: false,
    useRouter: false,
    useMSW: false,
    database: {
      urlTemplate: '',
      namePrefix: '',
      pool: { min: 0, max: 0, idleTimeout: 0 },
      autoCleanup: false,
      migrations: 'none',
    },
    services: {
      github: { enabled: false, rateLimitEnabled: false, errorSimulation: false },
      auth: { enabled: false, defaultUser: null, sessionTimeout: 0 },
      external: { redis: false, openai: false, webhooks: false },
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      ENABLE_OAUTH: 'false',
      ENABLE_WEBAUTHN: 'false',
      ENABLE_AUDIT_LOGS: 'false',
    },
    isolationLevel: 'basic',
    resources: {
      memoryLimit: 128,
      timeout: 10000,
      hookTimeout: 5000,
      retries: 1,
      concurrency: 4,
    },
  },

  integration: {
    type: 'integration',
    useDatabase: true,
    useAuth: true,
    useGitHubAPI: true,
    useRouter: true,
    useMSW: true,
    database: {
      urlTemplate: 'postgresql://test:test@localhost:5432/contribux_test_integration_{timestamp}',
      namePrefix: 'integration',
      pool: { min: 1, max: 3, idleTimeout: 10000 },
      autoCleanup: true,
      migrations: 'fresh',
    },
    services: {
      github: { enabled: true, rateLimitEnabled: true, errorSimulation: true },
      auth: {
        enabled: true,
        defaultUser: {
          id: 'test-user-integration',
          github_id: 'github-integration-123',
          github_username: 'integration-test-user',
          email: 'integration@test.com',
          name: 'Integration Test User',
          avatar_url: 'https://github.com/images/test-user-integration.png',
          preferences: {},
        },
        sessionTimeout: 3600000,
      },
      external: { redis: true, openai: false, webhooks: true },
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ENABLE_OAUTH: 'true',
      ENABLE_WEBAUTHN: 'true',
      ENABLE_AUDIT_LOGS: 'true',
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'test-secret-integration-32-chars-minimum',
      GITHUB_CLIENT_ID: 'test-github-integration',
      GITHUB_CLIENT_SECRET: 'test-github-secret-integration',
    },
    isolationLevel: 'full',
    resources: {
      memoryLimit: 512,
      timeout: 30000,
      hookTimeout: 15000,
      retries: 2,
      concurrency: 1,
    },
  },

  database: {
    type: 'database',
    useDatabase: true,
    useAuth: false,
    useGitHubAPI: false,
    useRouter: false,
    useMSW: false,
    database: {
      urlTemplate: 'postgresql://test:test@localhost:5432/contribux_test_db_{timestamp}',
      namePrefix: 'database',
      pool: { min: 1, max: 5, idleTimeout: 10000 },
      autoCleanup: true,
      migrations: 'incremental',
    },
    services: {
      github: { enabled: false, rateLimitEnabled: false, errorSimulation: false },
      auth: { enabled: false, defaultUser: null, sessionTimeout: 0 },
      external: { redis: false, openai: false, webhooks: false },
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      DATABASE_POOL_MAX: '5',
      DATABASE_POOL_MIN: '1',
    },
    isolationLevel: 'full',
    resources: {
      memoryLimit: 256,
      timeout: 15000,
      hookTimeout: 8000,
      retries: 2,
      concurrency: 3,
    },
  },

  e2e: {
    type: 'e2e',
    useDatabase: true,
    useAuth: true,
    useGitHubAPI: true,
    useRouter: true,
    useMSW: true,
    database: {
      urlTemplate: 'postgresql://test:test@localhost:5432/contribux_test_e2e_{timestamp}',
      namePrefix: 'e2e',
      pool: { min: 2, max: 10, idleTimeout: 15000 },
      autoCleanup: true,
      migrations: 'fresh',
    },
    services: {
      github: { enabled: true, rateLimitEnabled: false, errorSimulation: false },
      auth: {
        enabled: true,
        defaultUser: {
          id: 'test-user-e2e',
          github_id: 'github-e2e-456',
          github_username: 'e2e-test-user',
          email: 'e2e@test.com',
          name: 'E2E Test User',
          avatar_url: 'https://github.com/images/test-user-e2e.png',
          preferences: {},
        },
        sessionTimeout: 7200000,
      },
      external: { redis: true, openai: true, webhooks: true },
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ENABLE_OAUTH: 'true',
      ENABLE_WEBAUTHN: 'true',
      ENABLE_AUDIT_LOGS: 'true',
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'test-secret-e2e-32-chars-minimum-for-testing',
      GITHUB_CLIENT_ID: 'test-github-e2e',
      GITHUB_CLIENT_SECRET: 'test-github-secret-e2e',
      PLAYWRIGHT_HEADLESS: 'true',
    },
    isolationLevel: 'full',
    resources: {
      memoryLimit: 1024,
      timeout: 60000,
      hookTimeout: 30000,
      retries: 3,
      concurrency: 1,
    },
  },

  performance: {
    type: 'performance',
    useDatabase: true,
    useAuth: false,
    useGitHubAPI: true,
    useRouter: false,
    useMSW: true,
    database: {
      urlTemplate: 'postgresql://test:test@localhost:5432/contribux_test_perf_{timestamp}',
      namePrefix: 'performance',
      pool: { min: 5, max: 20, idleTimeout: 30000 },
      autoCleanup: true,
      migrations: 'fresh',
    },
    services: {
      github: { enabled: true, rateLimitEnabled: true, errorSimulation: false },
      auth: { enabled: false, defaultUser: null, sessionTimeout: 0 },
      external: { redis: true, openai: false, webhooks: false },
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      DATABASE_POOL_MAX: '20',
      DATABASE_POOL_MIN: '5',
      ENABLE_PERFORMANCE_MONITORING: 'true',
    },
    isolationLevel: 'full',
    resources: {
      memoryLimit: 2048,
      timeout: 120000,
      hookTimeout: 60000,
      retries: 1,
      concurrency: 4,
    },
  },
}

/**
 * Load test environment configuration
 */
export function loadTestEnvironment(envType: TestEnvironmentType): TestEnvironmentConfig {
  const envConfig = TEST_ENVIRONMENTS[envType]

  // Load environment files in order of precedence
  const envFiles = ['.env.test.local', '.env.test', '.env.local', '.env']

  for (const envFile of envFiles) {
    const envPath = path.resolve(process.cwd(), envFile)
    try {
      config({ path: envPath, override: false })
    } catch {
      // Ignore missing files
    }
  }

  // Override with test-specific environment variables
  for (const [key, value] of Object.entries(envConfig.env)) {
    process.env[key] = value
  }

  return envConfig
}

/**
 * Get database URL for test environment
 */
export function getTestDatabaseUrl(envConfig: TestEnvironmentConfig): string {
  if (!envConfig.useDatabase) {
    return ''
  }

  const timestamp = Date.now()
  const processId = process.pid
  const randomSuffix = Math.random().toString(36).substr(2, 6)

  return envConfig.database.urlTemplate.replace(
    '{timestamp}',
    `${timestamp}_${processId}_${randomSuffix}`
  )
}

/**
 * Create test environment name
 */
export function createTestEnvironmentName(envConfig: TestEnvironmentConfig): string {
  const timestamp = Date.now()
  const processId = process.pid
  return `${envConfig.database.namePrefix}_${timestamp}_${processId}`
}

/**
 * Validate test environment configuration
 */
export function validateTestEnvironment(envConfig: TestEnvironmentConfig): void {
  // Validate database configuration
  if (envConfig.useDatabase) {
    if (!envConfig.database.urlTemplate) {
      throw new Error(`Database URL template required for ${envConfig.type} tests`)
    }
    if (envConfig.database.pool.max < envConfig.database.pool.min) {
      throw new Error('Database pool max must be >= min')
    }
  }

  // Validate resource limits
  if (envConfig.resources.timeout <= 0) {
    throw new Error('Test timeout must be positive')
  }
  if (envConfig.resources.concurrency <= 0) {
    throw new Error('Test concurrency must be positive')
  }

  // Validate required environment variables for integration tests
  if (envConfig.type === 'integration' || envConfig.type === 'e2e') {
    const requiredVars = ['NEXTAUTH_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']
    for (const varName of requiredVars) {
      if (!envConfig.env[varName]) {
        throw new Error(`${varName} required for ${envConfig.type} tests`)
      }
    }
  }
}

export default TEST_ENVIRONMENTS
