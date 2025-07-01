/**
 * Test Environment Manager
 * Provides comprehensive test environment setup, isolation, and cleanup
 * Phase 4: Developer Experience - Environment management utilities
 */

import { config } from 'dotenv'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import type { UUID } from '@/types/base'

// Environment configuration interface
export interface TestEnvironmentConfig {
  /** Enable database isolation */
  useDatabase?: boolean
  /** Enable authentication mocking */
  useAuth?: boolean
  /** Enable GitHub API mocking */
  useGitHubAPI?: boolean
  /** Enable Next.js router mocking */
  useRouter?: boolean
  /** Enable MSW HTTP mocking */
  useMSW?: boolean
  /** Custom environment variables */
  env?: Record<string, string>
  /** Enable console suppression */
  suppressConsole?: boolean
  /** Enable memory monitoring */
  monitorMemory?: boolean
  /** Test isolation level */
  isolationLevel?: 'none' | 'basic' | 'full'
}

// Default configuration
const DEFAULT_CONFIG: Required<TestEnvironmentConfig> = {
  useDatabase: false,
  useAuth: false,
  useGitHubAPI: false,
  useRouter: false,
  useMSW: false,
  env: {},
  suppressConsole: true,
  monitorMemory: false,
  isolationLevel: 'basic',
}

/**
 * Test Environment Manager - Centralized test environment setup
 */
export class TestEnvironmentManager {
  private config: Required<TestEnvironmentConfig>
  private originalEnv: Record<string, string | undefined> = {}
  private originalConsole: typeof console = {} as typeof console
  private memoryBaseline = 0
  private cleanupTasks: Array<() => void | Promise<void>> = []

  constructor(config: TestEnvironmentConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Setup test environment - call in beforeAll
   */
  async setupEnvironment(): Promise<void> {
    // Load test environment variables
    this.loadEnvironmentVariables()

    // Setup console suppression
    if (this.config.suppressConsole) {
      this.setupConsoleSuppression()
    }

    // Setup memory monitoring
    if (this.config.monitorMemory) {
      this.setupMemoryMonitoring()
    }

    // Setup router mocking if needed
    if (this.config.useRouter) {
      this.setupRouterMocking()
    }

    // Setup authentication mocking if needed
    if (this.config.useAuth) {
      await this.setupAuthMocking()
    }

    // Setup GitHub API mocking if needed
    if (this.config.useGitHubAPI) {
      this.setupGitHubAPIMocking()
    }

    // Setup MSW if needed
    if (this.config.useMSW) {
      await this.setupMSW()
    }

    // Setup database if needed
    if (this.config.useDatabase) {
      await this.setupDatabase()
    }
  }

  /**
   * Setup test isolation - call in beforeEach
   */
  async setupTestIsolation(): Promise<void> {
    if (this.config.isolationLevel === 'none') return

    // Clear all mocks
    vi.clearAllMocks()

    // Reset modules if full isolation
    if (this.config.isolationLevel === 'full') {
      vi.resetModules()
    }

    // Clear DOM if in browser environment
    if (typeof document !== 'undefined') {
      document.body.innerHTML = ''
      document.head.querySelectorAll('style[data-emotion], style[data-styled]').forEach(style => {
        style.remove()
      })
    }

    // Reset timers
    vi.useRealTimers()
  }

  /**
   * Cleanup test - call in afterEach
   */
  async cleanupTest(): Promise<void> {
    // Run custom cleanup tasks
    for (const cleanup of this.cleanupTasks) {
      try {
        await cleanup()
      } catch (error) {
        console.warn('Cleanup task failed:', error)
      }
    }
    this.cleanupTasks = []

    // Clear mocks
    vi.clearAllMocks()

    // Cleanup DOM
    if (typeof document !== 'undefined') {
      document.body.innerHTML = ''
    }

    // Check for memory leaks if monitoring enabled
    if (this.config.monitorMemory) {
      this.checkMemoryLeaks()
    }
  }

  /**
   * Cleanup environment - call in afterAll
   */
  async cleanupEnvironment(): Promise<void> {
    // Restore environment variables
    this.restoreEnvironmentVariables()

    // Restore console
    if (this.config.suppressConsole) {
      this.restoreConsole()
    }

    // Cleanup database if used
    if (this.config.useDatabase) {
      await this.cleanupDatabase()
    }

    // Final cleanup
    vi.clearAllMocks()
    vi.resetModules()
  }

  /**
   * Add custom cleanup task
   */
  addCleanupTask(task: () => void | Promise<void>): void {
    this.cleanupTasks.push(task)
  }

  /**
   * Create isolated test UUID
   */
  createTestUUID(suffix?: string): UUID {
    const timestamp = Date.now().toString()
    const _random = Math.random().toString(36).substr(2, 9)
    const testSuffix = suffix ? `-${suffix}` : ''
    return `550e8400-e29b-41d4-a716-${timestamp.slice(-12)}${testSuffix}` as UUID
  }

  /**
   * Create test-scoped environment variable
   */
  setTestEnv(key: string, value: string): void {
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key]
    }
    process.env[key] = value
  }

  private loadEnvironmentVariables(): void {
    // Load test-specific environment
    config({ path: '.env.test' })

    // Set test environment
    this.setTestEnv('NODE_ENV', 'test')

    // Apply custom environment variables
    for (const [key, value] of Object.entries(this.config.env)) {
      this.setTestEnv(key, value)
    }
  }

  private restoreEnvironmentVariables(): void {
    for (const [key, originalValue] of Object.entries(this.originalEnv)) {
      if (originalValue === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalValue
      }
    }
    this.originalEnv = {}
  }

  private setupConsoleSuppression(): void {
    this.originalConsole = { ...console }

    // Mock console methods to reduce test noise
    const mockMethods = ['log', 'info', 'warn', 'error', 'debug'] as const
    for (const method of mockMethods) {
      // Keep original for error reporting but suppress output
      console[method] = vi.fn()
    }
  }

  private restoreConsole(): void {
    Object.assign(console, this.originalConsole)
  }

  private setupMemoryMonitoring(): void {
    if (global.gc) {
      global.gc()
    }
    this.memoryBaseline = process.memoryUsage().heapUsed
  }

  private checkMemoryLeaks(): void {
    if (global.gc) {
      global.gc()
    }
    const currentMemory = process.memoryUsage().heapUsed
    const memoryIncrease = currentMemory - this.memoryBaseline
    const MEMORY_THRESHOLD = 50 * 1024 * 1024 // 50MB

    if (memoryIncrease > MEMORY_THRESHOLD) {
      console.warn(
        `Potential memory leak detected: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`
      )
    }
  }

  private setupRouterMocking(): void {
    vi.mock('next/navigation', () => ({
      useRouter: vi.fn(() => ({
        push: vi.fn(),
        replace: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
      })),
      useSearchParams: vi.fn(() => ({
        get: vi.fn().mockReturnValue(null),
        toString: vi.fn().mockReturnValue(''),
        has: vi.fn().mockReturnValue(false),
        getAll: vi.fn().mockReturnValue([]),
      })),
      usePathname: vi.fn(() => '/test'),
      useParams: vi.fn(() => ({})),
    }))
  }

  private async setupAuthMocking(): Promise<void> {
    // Mock NextAuth
    vi.mock('@/lib/auth', () => ({
      auth: vi.fn().mockResolvedValue({
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
        },
        accessToken: 'test-access-token',
      }),
    }))
  }

  private setupGitHubAPIMocking(): void {
    vi.mock('@/lib/github/client', () => ({
      GitHubClient: vi.fn().mockImplementation(() => ({
        searchRepositories: vi.fn().mockResolvedValue({
          total_count: 0,
          incomplete_results: false,
          items: [],
        }),
        searchIssues: vi.fn().mockResolvedValue({
          total_count: 0,
          incomplete_results: false,
          items: [],
        }),
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          rateLimit: {
            limit: 5000,
            remaining: 4999,
            reset: Date.now() / 1000 + 3600,
          },
        }),
      })),
      createGitHubClient: vi.fn(),
    }))
  }

  private async setupMSW(): Promise<void> {
    // Dynamic import to avoid MSW issues in non-test environments
    try {
      const { setupServer } = await import('msw/node')
      const { http, HttpResponse } = await import('msw')

      const server = setupServer(
        // Default handlers for common endpoints
        http.get('*/api/health', () => {
          return HttpResponse.json({ status: 'healthy' })
        })
      )

      server.listen({ onUnhandledRequest: 'bypass' })

      this.addCleanupTask(() => {
        server.resetHandlers()
      })

      this.addCleanupTask(() => {
        server.close()
      })
    } catch (error) {
      console.warn('Failed to setup MSW:', error)
    }
  }

  private async setupDatabase(): Promise<void> {
    // Import database testing utilities
    try {
      const { TestDatabaseManager } = await import('@/lib/test-utils/test-database-manager')

      // Setup test database
      const testDb = TestDatabaseManager.getInstance()
      await testDb.setup()

      // Add cleanup
      this.addCleanupTask(async () => {
        await testDb.cleanup()
      })
    } catch (error) {
      console.warn('Failed to setup test database:', error)
    }
  }

  private async cleanupDatabase(): Promise<void> {
    try {
      const { TestDatabaseManager } = await import('@/lib/test-utils/test-database-manager')
      const testDb = TestDatabaseManager.getInstance()
      await testDb.cleanup()
    } catch (error) {
      console.warn('Failed to cleanup test database:', error)
    }
  }
}

/**
 * Create test environment manager with configuration
 */
export function createTestEnvironment(config?: TestEnvironmentConfig): TestEnvironmentManager {
  return new TestEnvironmentManager(config)
}

/**
 * Setup test suite with environment manager
 */
export function setupTestSuite(config?: TestEnvironmentConfig) {
  const envManager = createTestEnvironment(config)

  beforeAll(async () => {
    await envManager.setupEnvironment()
  })

  beforeEach(async () => {
    await envManager.setupTestIsolation()
  })

  afterEach(async () => {
    await envManager.cleanupTest()
  })

  afterAll(async () => {
    await envManager.cleanupEnvironment()
  })

  return envManager
}

/**
 * Quick setup patterns for common test scenarios
 */

// Unit test environment (minimal setup)
export const setupUnitTestEnvironment = () =>
  setupTestSuite({
    isolationLevel: 'basic',
    suppressConsole: true,
  })

// Component test environment (with router and auth)
export const setupComponentTestEnvironment = () =>
  setupTestSuite({
    useRouter: true,
    useAuth: true,
    isolationLevel: 'full',
    suppressConsole: true,
  })

// Integration test environment (with database and MSW)
export const setupIntegrationTestEnvironment = () =>
  setupTestSuite({
    useDatabase: true,
    useMSW: true,
    useAuth: true,
    isolationLevel: 'full',
    monitorMemory: true,
  })

// E2E test environment (full setup)
export const setupE2ETestEnvironment = () =>
  setupTestSuite({
    useDatabase: true,
    useMSW: true,
    useAuth: true,
    useRouter: true,
    useGitHubAPI: true,
    isolationLevel: 'full',
    monitorMemory: true,
    env: {
      NODE_ENV: 'test',
      // Hardcoded test secrets removed - use environment variables or secure test utilities
    },
  })
