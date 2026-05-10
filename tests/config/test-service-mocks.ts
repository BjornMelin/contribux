/**
 * Enhanced Test Service Mocks
 * Provides comprehensive mocking for external services with environment-specific configuration
 */

import { afterAll, beforeAll, vi } from 'vitest'
import type { TestEnvironmentConfig } from './test-environment.config'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      login: 'testuser',
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
    },
    accessToken: 'test-access-token',
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      login: 'testuser',
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
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

vi.mock('@/lib/cache/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}))

vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Mocked OpenAI response',
                role: 'assistant',
              },
            },
          ],
        }),
      },
    },
  })),
}))

// MSW handler type for better type safety
interface MSWHandler {
  info: {
    header: string
    method: string
    path: string
  }
  // Additional properties as needed by MSW
  [key: string]: unknown
}

// Mock server instance type
// MSW handlers are dynamically imported and don't have a stable type
// Using unknown[] is appropriate here as the handlers are validated at runtime by MSW
interface MockServer {
  listen: (options?: { onUnhandledRequest?: string }) => void
  resetHandlers: () => void
  close: () => void
  use: (...handlers: unknown[]) => void
}

// Service mock registry
const serviceMocks = new Map<string, boolean | object>()
let mockServer: MockServer | null = null

/**
 * Enhanced Service Mock Manager
 */
export class TestServiceMockManager {
  private config: TestEnvironmentConfig
  private cleanupTasks: Array<() => void | Promise<void>> = []

  constructor(config: TestEnvironmentConfig) {
    this.config = config
  }

  /**
   * Setup all service mocks based on configuration
   */
  async setupMocks(): Promise<void> {
    // Setup MSW server if enabled
    if (this.config.useMSW) {
      await this.setupMSWServer()
    }

    // Setup GitHub API mocks
    if (this.config.useGitHubAPI) {
      this.setupGitHubMocks()
    }

    // Setup authentication mocks
    if (this.config.useAuth) {
      this.setupAuthMocks()
    }

    // Setup router mocks
    if (this.config.useRouter) {
      this.setupRouterMocks()
    }

    // Setup external service mocks
    this.setupExternalServiceMocks()
  }

  /**
   * Setup MSW server for HTTP request mocking
   */
  private async setupMSWServer(): Promise<void> {
    try {
      const { setupServer } = await import('msw/node')
      const { http, HttpResponse } = await import('msw')

      const handlers = [
        // Default health check
        http.get('*/api/health', () => {
          return HttpResponse.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: 'test',
          })
        }),

        // Default metrics endpoint
        http.get('*/api/metrics', () => {
          return HttpResponse.json({
            requests: 0,
            responseTime: 0,
            errors: 0,
          })
        }),

        // GitHub API mocks
        ...(this.config.services.github.enabled ? this.createGitHubHandlers() : []),

        // Authentication mocks
        ...(this.config.services.auth.enabled ? this.createAuthHandlers() : []),

        // External service mocks
        ...this.createExternalServiceHandlers(),
      ]

      mockServer = setupServer(...handlers)
      mockServer.listen({ onUnhandledRequest: 'bypass' })

      this.addCleanupTask(() => {
        if (mockServer) {
          mockServer.resetHandlers()
          mockServer.close()
          mockServer = null
        }
      })

      serviceMocks.set('msw-server', mockServer)
    } catch (error) {
      console.warn('Failed to setup MSW server:', error)
    }
  }

  /**
   * Create GitHub API handlers
   */
  private createGitHubHandlers(): MSWHandler[] {
    const { http, HttpResponse } = require('msw')
    const config = this.config.services.github

    const handlers = [
      // Repository search
      http.get('https://api.github.com/search/repositories', ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''

        if (config.errorSimulation && query.includes('error')) {
          return HttpResponse.json({ message: 'Test error simulation' }, { status: 500 })
        }

        return HttpResponse.json({
          total_count: 2,
          incomplete_results: false,
          items: [
            {
              id: 1,
              name: 'test-repo-1',
              full_name: 'testuser/test-repo-1',
              description: 'Test repository 1',
              html_url: 'https://github.com/testuser/test-repo-1',
              language: 'TypeScript',
              stargazers_count: 100,
              forks_count: 50,
            },
            {
              id: 2,
              name: 'test-repo-2',
              full_name: 'testuser/test-repo-2',
              description: 'Test repository 2',
              html_url: 'https://github.com/testuser/test-repo-2',
              language: 'JavaScript',
              stargazers_count: 75,
              forks_count: 25,
            },
          ],
        })
      }),

      // Issues search
      http.get('https://api.github.com/search/issues', ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''

        if (config.errorSimulation && query.includes('error')) {
          return HttpResponse.json({ message: 'Test error simulation' }, { status: 500 })
        }

        return HttpResponse.json({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              id: 1,
              number: 123,
              title: 'Test Issue',
              body: 'This is a test issue for unit tests',
              user: {
                login: 'testuser',
                id: 1,
              },
              state: 'open',
              html_url: 'https://github.com/testuser/test-repo-1/issues/123',
              repository_url: 'https://api.github.com/repos/testuser/test-repo-1',
            },
          ],
        })
      }),

      // Rate limit endpoint
      http.get('https://api.github.com/rate_limit', () => {
        return HttpResponse.json({
          rate: {
            limit: config.rateLimitEnabled ? 100 : 5000,
            remaining: config.rateLimitEnabled ? 50 : 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
          },
        })
      }),

      // User endpoint
      http.get('https://api.github.com/user', () => {
        return HttpResponse.json({
          login: 'testuser',
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
        })
      }),
    ]

    return handlers
  }

  /**
   * Create authentication handlers
   */
  private createAuthHandlers(): MSWHandler[] {
    const { http, HttpResponse } = require('msw')
    const config = this.config.services.auth

    return [
      // NextAuth session endpoint
      http.get('*/api/auth/session', () => {
        return HttpResponse.json({
          user: config.defaultUser,
          expires: new Date(Date.now() + config.sessionTimeout).toISOString(),
        })
      }),

      // NextAuth providers endpoint
      http.get('*/api/auth/providers', () => {
        return HttpResponse.json({
          github: {
            id: 'github',
            name: 'GitHub',
            type: 'oauth',
          },
          google: {
            id: 'google',
            name: 'Google',
            type: 'oauth',
          },
        })
      }),

      // Custom auth endpoints
      http.post('*/api/auth/signin', () => {
        return HttpResponse.json({ success: true })
      }),

      http.post('*/api/auth/signout', () => {
        return HttpResponse.json({ success: true })
      }),
    ]
  }

  /**
   * Create external service handlers
   */
  private createExternalServiceHandlers(): MSWHandler[] {
    const { http, HttpResponse } = require('msw')
    const external = this.config.services.external
    const handlers = []

    // Redis mocks
    if (external.redis) {
      handlers.push(
        http.get('*/redis/health', () => {
          return HttpResponse.json({ status: 'connected' })
        })
      )
    }

    // OpenAI mocks
    if (external.openai) {
      handlers.push(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            choices: [
              {
                message: {
                  content: 'Test response from OpenAI mock',
                  role: 'assistant',
                },
              },
            ],
          })
        })
      )
    }

    // Webhook mocks
    if (external.webhooks) {
      handlers.push(
        http.post('*/webhooks/github', () => {
          return HttpResponse.json({ received: true })
        })
      )
    }

    return handlers
  }

  /**
   * Register GitHub API mocking state.
   */
  private setupGitHubMocks(): void {
    serviceMocks.set('github-msw', this.config.services.github.enabled)
  }

  /**
   * Setup authentication mocks
   */
  private setupAuthMocks(): void {
    serviceMocks.set('auth-mock', true)
  }

  /**
   * Setup router mocks
   */
  private setupRouterMocks(): void {
    serviceMocks.set('router-mock', true)
  }

  /**
   * Setup external service mocks
   */
  private setupExternalServiceMocks(): void {
    const external = this.config.services.external

    serviceMocks.set('external-mocks', external)
  }

  /**
   * Add cleanup task
   */
  private addCleanupTask(task: () => void | Promise<void>): void {
    this.cleanupTasks.push(task)
  }

  /**
   * Cleanup all mocks
   */
  async cleanup(): Promise<void> {
    // Run cleanup tasks
    for (const task of this.cleanupTasks) {
      try {
        await task()
      } catch (error) {
        console.warn('Mock cleanup task failed:', error)
      }
    }

    // Clear service mocks
    serviceMocks.clear()

    // Reset all mocks
    vi.resetAllMocks()
    vi.clearAllMocks()
  }

  /**
   * Get active mocks
   */
  getActiveMocks(): string[] {
    return Array.from(serviceMocks.keys())
  }

  /**
   * Register runtime MSW handlers on the shared test server.
   */
  useMSWHandlers(...handlers: unknown[]): void {
    if (!mockServer) {
      throw new Error('MSW server is not initialized')
    }

    mockServer.use(...handlers)
  }

  /**
   * Reset runtime MSW handlers to the configured defaults.
   */
  resetMSWHandlers(): void {
    mockServer?.resetHandlers()
  }
}

/**
 * Create service mock manager
 */
export function createTestServiceMocks(config: TestEnvironmentConfig): TestServiceMockManager {
  return new TestServiceMockManager(config)
}

/**
 * Setup test service mocks for Vitest
 */
export function setupTestServiceMocks(config: TestEnvironmentConfig) {
  let mockManager: TestServiceMockManager

  beforeAll(async () => {
    mockManager = createTestServiceMocks(config)
    await mockManager.setupMocks()
  })

  afterAll(async () => {
    if (mockManager) {
      await mockManager.cleanup()
    }
  })

  return mockManager
}

export default TestServiceMockManager
