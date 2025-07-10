/**
 * Enhanced Test Setup
 * Unified test environment setup with comprehensive isolation and configuration
 */

import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import {
  type TestEnvironmentType,
  type TestEnvironmentConfig,
  loadTestEnvironment,
  validateTestEnvironment,
} from './test-environment.config'
import { EnhancedTestDatabaseManager } from './test-database-manager'
import { TestServiceMockManager } from './test-service-mocks'

// Global test state
interface TestGlobalState {
  envManager: TestEnvironmentManager | null
  dbManager: EnhancedTestDatabaseManager | null
  mockManager: TestServiceMockManager | null
  config: TestEnvironmentConfig | null
  memoryBaseline: number
  cleanupTasks: Array<() => Promise<void>>
}

const globalState: TestGlobalState = {
  envManager: null,
  dbManager: null,
  mockManager: null,
  config: null,
  memoryBaseline: 0,
  cleanupTasks: [],
}

/**
 * Enhanced Test Environment Manager
 */
export class TestEnvironmentManager {
  private originalEnv: Record<string, string | undefined> = {}
  private originalConsole: typeof console = {} as typeof console

  constructor(private config: TestEnvironmentConfig) {}

  /**
   * Setup complete test environment
   */
  async setup(): Promise<void> {
    // Validate configuration
    validateTestEnvironment(this.config)

    // Setup environment variables
    this.setupEnvironmentVariables()

    // Setup console management
    this.setupConsoleManagement()

    // Setup memory monitoring
    this.setupMemoryMonitoring()

    // Setup browser APIs for jsdom
    this.setupBrowserAPIs()

    console.log(`🧪 Test environment setup complete: ${this.config.type}`)
  }

  /**
   * Setup environment variables with isolation
   */
  private setupEnvironmentVariables(): void {
    // Backup original environment
    for (const key of Object.keys(process.env)) {
      this.originalEnv[key] = process.env[key]
    }

    // Apply test-specific environment
    for (const [key, value] of Object.entries(this.config.env)) {
      process.env[key] = value
    }

    // Set test-specific variables
    process.env.NODE_ENV = 'test'
    process.env.SKIP_ENV_VALIDATION = 'true'
    process.env.VITEST = 'true'
  }

  /**
   * Setup console management
   */
  private setupConsoleManagement(): void {
    // Backup original console
    this.originalConsole = { ...console }

    // Suppress console noise based on log level
    const logLevel = this.config.env.LOG_LEVEL || 'warn'

    if (logLevel === 'error') {
      console.log = vi.fn()
      console.info = vi.fn()
      console.warn = vi.fn()
    } else if (logLevel === 'warn') {
      console.log = vi.fn()
      console.info = vi.fn()
    }
  }

  /**
   * Setup memory monitoring
   */
  private setupMemoryMonitoring(): void {
    if (global.gc) {
      global.gc()
    }
    globalState.memoryBaseline = process.memoryUsage().heapUsed
  }

  /**
   * Setup browser APIs for testing
   */
  private setupBrowserAPIs(): void {
    // Mock fetch if not available
    if (typeof globalThis.fetch === 'undefined') {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(''),
      }) as any
    }

    // Mock TransformStream for MSW compatibility
    if (typeof globalThis.TransformStream === 'undefined') {
      globalThis.TransformStream = class MockTransformStream {
        readable = new ReadableStream()
        writable = new WritableStream()
      } as any
    }

    // Mock navigator
    if (typeof globalThis.navigator === 'undefined') {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'test-user-agent',
          clipboard: {
            writeText: vi.fn().mockResolvedValue(undefined),
            readText: vi.fn().mockResolvedValue(''),
          },
        },
        writable: true,
      })
    }

    // Mock location
    if (typeof globalThis.location === 'undefined') {
      Object.defineProperty(globalThis, 'location', {
        value: {
          href: 'http://localhost:3000',
          origin: 'http://localhost:3000',
          pathname: '/',
          search: '',
          hash: '',
        },
        writable: true,
      })
    }

    // Mock matchMedia
    if (typeof globalThis.matchMedia === 'undefined') {
      Object.defineProperty(globalThis, 'matchMedia', {
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
        writable: true,
      })
    }
  }

  /**
   * Setup test isolation
   */
  async setupIsolation(): Promise<void> {
    // Clear all mocks
    vi.clearAllMocks()

    // Reset modules for full isolation
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
   * Cleanup test
   */
  async cleanupTest(): Promise<void> {
    // Clear mocks
    vi.clearAllMocks()

    // Check for memory leaks
    this.checkMemoryLeaks()

    // Clear DOM
    if (typeof document !== 'undefined') {
      document.body.innerHTML = ''
    }
  }

  /**
   * Cleanup environment
   */
  async cleanup(): Promise<void> {
    // Restore environment variables
    for (const [key, originalValue] of Object.entries(this.originalEnv)) {
      if (originalValue === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalValue
      }
    }

    // Restore console
    Object.assign(console, this.originalConsole)

    // Final cleanup
    vi.clearAllMocks()
    vi.resetModules()
  }

  /**
   * Check for memory leaks
   */
  private checkMemoryLeaks(): void {
    if (global.gc) {
      global.gc()
    }

    const currentMemory = process.memoryUsage().heapUsed
    const memoryIncrease = currentMemory - globalState.memoryBaseline
    const threshold = this.config.resources.memoryLimit * 1024 * 1024 // Convert MB to bytes

    if (memoryIncrease > threshold) {
      console.warn(
        `⚠️ Memory usage increased by ${Math.round(memoryIncrease / 1024 / 1024)}MB ` +
          `(threshold: ${this.config.resources.memoryLimit}MB)`
      )
    }
  }
}

/**
 * Enhanced Test Setup Function
 */
export function setupEnhancedTestEnvironment(envType: TestEnvironmentType) {
  // Load configuration
  const config = loadTestEnvironment(envType)
  globalState.config = config

  beforeAll(async () => {
    console.log(`🚀 Setting up ${envType} test environment...`)

    // Setup environment manager
    globalState.envManager = new TestEnvironmentManager(config)
    await globalState.envManager.setup()

    // Setup database if enabled
    if (config.useDatabase) {
      globalState.dbManager = EnhancedTestDatabaseManager.getInstance(config)
      await globalState.dbManager.setup()
    }

    // Setup service mocks if enabled
    if (config.useMSW || config.useAuth || config.useGitHubAPI || config.useRouter) {
      globalState.mockManager = new TestServiceMockManager(config)
      await globalState.mockManager.setupMocks()
    }

    console.log(`✅ ${envType} test environment ready`)
  }, config.resources.hookTimeout)

  beforeEach(async () => {
    if (globalState.envManager) {
      await globalState.envManager.setupIsolation()
    }
  })

  afterEach(async () => {
    // Run cleanup tasks
    for (const task of globalState.cleanupTasks) {
      try {
        await task()
      } catch (error) {
        console.warn('Cleanup task failed:', error)
      }
    }
    globalState.cleanupTasks = []

    if (globalState.envManager) {
      await globalState.envManager.cleanupTest()
    }
  })

  afterAll(async () => {
    console.log(`🧹 Cleaning up ${envType} test environment...`)

    // Cleanup in reverse order
    if (globalState.mockManager) {
      await globalState.mockManager.cleanup()
    }

    if (globalState.dbManager) {
      await globalState.dbManager.cleanup()
    }

    if (globalState.envManager) {
      await globalState.envManager.cleanup()
    }

    // Static cleanup for database managers
    await EnhancedTestDatabaseManager.cleanupAll()

    console.log(`✅ ${envType} test environment cleaned up`)
  }, config.resources.hookTimeout)

  // Return utility functions
  return {
    config,
    addCleanupTask: (task: () => Promise<void>) => {
      globalState.cleanupTasks.push(task)
    },
    getEnvManager: () => globalState.envManager,
    getDbManager: () => globalState.dbManager,
    getMockManager: () => globalState.mockManager,
  }
}

/**
 * Quick setup functions for different test types
 */

// Unit tests - minimal setup
export const setupUnitTests = () => setupEnhancedTestEnvironment('unit')

// Integration tests - database + mocks
export const setupIntegrationTests = () => setupEnhancedTestEnvironment('integration')

// Database tests - database focused
export const setupDatabaseTests = () => setupEnhancedTestEnvironment('database')

// E2E tests - full setup
export const setupE2ETests = () => setupEnhancedTestEnvironment('e2e')

// Performance tests - optimized for load testing
export const setupPerformanceTests = () => setupEnhancedTestEnvironment('performance')

/**
 * Test environment utilities
 */
export const testUtils = {
  getCurrentConfig: () => globalState.config,
  getMemoryUsage: () => {
    const current = process.memoryUsage().heapUsed
    const baseline = globalState.memoryBaseline
    return {
      current: Math.round(current / 1024 / 1024),
      baseline: Math.round(baseline / 1024 / 1024),
      increase: Math.round((current - baseline) / 1024 / 1024),
    }
  },
  triggerGC: () => {
    if (global.gc) {
      global.gc()
    }
  },
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
}

export default setupEnhancedTestEnvironment
