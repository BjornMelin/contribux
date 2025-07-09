/**
 * Comprehensive test suite for service factory implementation
 * Tests factory pattern, dependency injection, and service creation
 */

import type { MockedFunction } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all dynamic imports and dependencies
vi.mock('@/lib/di/container', () => ({
  ServiceKeys: {
    CONFIG: 'config',
    DATABASE: 'database',
  },
  getContainer: vi.fn(() => ({
    resolve: vi.fn(),
  })),
}))

vi.mock('@/lib/types/advanced', () => ({
  Failure: vi.fn(error => ({ success: false, error })),
  Success: vi.fn(value => ({ success: true, value })),
  createBrand: vi.fn(value => value),
}))

vi.mock('@/lib/github', () => ({
  createGitHubClient: vi.fn(() => ({
    rest: { repos: { get: vi.fn() } },
    auth: { token: 'test-token' },
  })),
}))

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn()),
}))

vi.mock('drizzle-orm/neon-http', () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
}))

vi.mock('drizzle-orm/pglite', () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
}))

vi.mock('@electric-sql/pglite', () => ({
  PGlite: vi.fn(() => ({
    query: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('@/lib/db/schema', () => ({
  users: {},
  repositories: {},
  opportunities: {},
}))

vi.mock('@/lib/repositories/implementations/user-repository', () => ({
  UserRepository: vi.fn(() => ({
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
}))

vi.mock('@/lib/repositories/implementations/repository-repository', () => ({
  RepositoryRepository: vi.fn(() => ({
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
  })),
}))

vi.mock('@/lib/repositories/implementations/opportunity-repository', () => ({
  OpportunityRepository: vi.fn(() => ({
    findById: vi.fn(),
    findByRepository: vi.fn(),
    create: vi.fn(),
  })),
}))

vi.mock('@/lib/repositories/implementations/cache-repository', () => ({
  CacheRepository: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  })),
}))

vi.mock('@/lib/repositories/implementations/vector-repository', () => ({
  RepositoryVectorRepository: vi.fn(() => ({
    search: vi.fn(),
    index: vi.fn(),
    delete: vi.fn(),
  })),
  OpportunityVectorRepository: vi.fn(() => ({
    search: vi.fn(),
    index: vi.fn(),
    delete: vi.fn(),
  })),
}))

vi.mock('@/lib/business-logic/search-service', () => ({
  SearchService: vi.fn(() => ({
    search: vi.fn(),
    searchRepositories: vi.fn(),
    searchOpportunities: vi.fn(),
  })),
}))

vi.mock('@/lib/business-logic/recommendation-service', () => ({
  RecommendationService: vi.fn(() => ({
    getRecommendations: vi.fn(),
    getPersonalizedRecommendations: vi.fn(),
  })),
}))

vi.mock('@/lib/business-logic/analytics-service', () => ({
  AnalyticsService: vi.fn(() => ({
    trackEvent: vi.fn(),
    getMetrics: vi.fn(),
    generateReport: vi.fn(),
  })),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    GITHUB_TOKEN: 'test-github-token',
    DATABASE_URL: 'postgresql://test:test@localhost/test',
  },
}))

vi.mock('@/lib/auth', () => ({
  authConfig: {
    providers: [],
    secret: 'test-secret',
  },
}))

vi.mock('../../../tests/mocks/repository-mocks', () => ({
  createMockRepository: vi.fn(type => ({
    type,
    mockMethod: vi.fn(),
  })),
}))

vi.mock('../../../tests/mocks/service-mocks', () => ({
  createMockService: vi.fn(type => ({
    type,
    mockMethod: vi.fn(),
  })),
}))

import { getContainer } from '@/lib/di/container'
// Import the actual module after mocking dependencies
import {
  businessServiceFactory,
  configurationFactory,
  createDatabaseFactory,
  createDatabaseForTesting,
  createFactory,
  createGitHubClientFactory,
  createGitHubClientForTesting,
  createGitHubClientWithAuth,
  createService,
  getFactory,
  getFactoryOrDefault,
  monitoringFactory,
  ProductionServiceFactory,
  registerFactory,
  repositoryFactory,
  ServiceBuilder,
  serviceBuilder,
  TestingServiceFactory,
} from '@/lib/factories/service-factory'
import { createBrand } from '@/lib/types/advanced'

describe('Service Factory', () => {
  let mockContainer: { resolve: MockedFunction<(key: string) => Promise<Record<string, unknown>>> }
  let mockResolve: MockedFunction<(key: string) => Promise<Record<string, unknown>>>

  beforeEach(() => {
    mockResolve = vi.fn()
    mockContainer = {
      resolve: mockResolve,
    }
    ;(getContainer as MockedFunction<typeof getContainer>).mockReturnValue(mockContainer)

    // Setup common environment mock
    mockResolve.mockImplementation(key => {
      if (key === 'config') {
        return Promise.resolve({
          GITHUB_TOKEN: 'test-github-token',
          DATABASE_URL: 'postgresql://test:test@localhost/test',
          NODE_ENV: 'test',
        })
      }
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('GitHub Client Factory', () => {
    it('should create GitHub client factory with default config', async () => {
      const factory = createGitHubClientFactory()
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
      expect(mockResolve).toHaveBeenCalledWith('config')
    })

    it('should create GitHub client factory with custom config', async () => {
      const config = {
        token: createBrand('custom-token'),
        baseUrl: 'https://custom.github.com',
        timeout: 60000,
        retries: 5,
        rateLimitHandling: false,
      }

      const factory = createGitHubClientFactory(config)
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
      // Should not call container.resolve since token is provided
      expect(mockResolve).not.toHaveBeenCalled()
    })

    it('should create GitHub client with auth token', async () => {
      const token = createBrand('auth-token')
      const factory = createGitHubClientWithAuth(token)
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
    })

    it('should create GitHub client for testing', async () => {
      const factory = createGitHubClientForTesting()
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
    })

    it('should handle missing environment token gracefully', async () => {
      mockResolve.mockImplementation(key => {
        if (key === 'config') {
          return Promise.resolve({
            DATABASE_URL: 'postgresql://test:test@localhost/test',
            NODE_ENV: 'test',
            // Missing GITHUB_TOKEN
          })
        }
        return Promise.resolve({})
      })

      const factory = createGitHubClientFactory()
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
    })
  })

  describe('Database Factory', () => {
    it('should create database factory with default config', async () => {
      const factory = createDatabaseFactory()
      const db = await factory()

      expect(db).toHaveProperty('select')
      expect(db).toHaveProperty('insert')
      expect(db).toHaveProperty('update')
      expect(db).toHaveProperty('delete')
      expect(mockResolve).toHaveBeenCalledWith('config')
    })

    it('should create database factory with custom config', async () => {
      const config = {
        connectionString: createBrand('postgresql://custom:custom@localhost/custom'),
        poolSize: 20,
        ssl: true,
        logging: true,
      }

      const factory = createDatabaseFactory(config)
      const db = await factory()

      expect(db).toHaveProperty('select')
      expect(db).toHaveProperty('insert')
      expect(db).toHaveProperty('update')
      expect(db).toHaveProperty('delete')
      // Should not call container.resolve since connectionString is provided
      expect(mockResolve).not.toHaveBeenCalled()
    })

    it('should create database for testing', async () => {
      const factory = createDatabaseForTesting()
      const db = await factory()

      expect(db).toHaveProperty('select')
      expect(db).toHaveProperty('insert')
      expect(db).toHaveProperty('update')
      expect(db).toHaveProperty('delete')
    })

    it('should handle database connection string from environment', async () => {
      const customUrl = 'postgresql://env:env@localhost/env'
      mockResolve.mockImplementation(key => {
        if (key === 'config') {
          return Promise.resolve({
            GITHUB_TOKEN: 'test-github-token',
            DATABASE_URL: customUrl,
            NODE_ENV: 'test',
          })
        }
        return Promise.resolve({})
      })

      const factory = createDatabaseFactory()
      const db = await factory()

      expect(db).toHaveProperty('select')
      expect(mockResolve).toHaveBeenCalledWith('config')
    })
  })

  describe('Repository Factory', () => {
    it('should create user repository', async () => {
      const factory = repositoryFactory.createUserRepository()
      const repository = await factory()

      expect(repository).toHaveProperty('findById')
      expect(repository).toHaveProperty('create')
      expect(repository).toHaveProperty('update')
      expect(repository).toHaveProperty('delete')
    })

    it('should create repository repository', async () => {
      const factory = repositoryFactory.createRepositoryRepository()
      const repository = await factory()

      expect(repository).toHaveProperty('findById')
      expect(repository).toHaveProperty('findByName')
      expect(repository).toHaveProperty('create')
    })

    it('should create opportunity repository', async () => {
      const factory = repositoryFactory.createOpportunityRepository()
      const repository = await factory()

      expect(repository).toHaveProperty('findById')
      expect(repository).toHaveProperty('findByRepository')
      expect(repository).toHaveProperty('create')
    })

    it('should create cache repository', async () => {
      const factory = repositoryFactory.createCacheRepository()
      const repository = await factory()

      expect(repository).toHaveProperty('get')
      expect(repository).toHaveProperty('set')
      expect(repository).toHaveProperty('delete')
      expect(repository).toHaveProperty('clear')
    })

    it('should create repository vector repository', async () => {
      const factory = repositoryFactory.createVectorRepository('repository')
      const repository = await factory()

      expect(repository).toHaveProperty('search')
      expect(repository).toHaveProperty('index')
      expect(repository).toHaveProperty('delete')
    })

    it('should create opportunity vector repository', async () => {
      const factory = repositoryFactory.createVectorRepository('opportunity')
      const repository = await factory()

      expect(repository).toHaveProperty('search')
      expect(repository).toHaveProperty('index')
      expect(repository).toHaveProperty('delete')
    })
  })

  describe('Business Service Factory', () => {
    it('should create search service', async () => {
      const factory = businessServiceFactory.createSearchService()
      const service = await factory()

      expect(service).toHaveProperty('search')
      expect(service).toHaveProperty('searchRepositories')
      expect(service).toHaveProperty('searchOpportunities')
    })

    it('should create recommendation service', async () => {
      const factory = businessServiceFactory.createRecommendationService()
      const service = await factory()

      expect(service).toHaveProperty('getRecommendations')
      expect(service).toHaveProperty('getPersonalizedRecommendations')
    })

    it('should create analytics service', async () => {
      const factory = businessServiceFactory.createAnalyticsService()
      const service = await factory()

      expect(service).toHaveProperty('trackEvent')
      expect(service).toHaveProperty('getMetrics')
      expect(service).toHaveProperty('generateReport')
    })
  })

  describe('Monitoring Factory', () => {
    it('should create performance monitor', async () => {
      const factory = monitoringFactory.createPerformanceMonitor()
      const monitor = await factory()

      expect(monitor).toHaveProperty('monitor')
      expect(monitor).toHaveProperty('getMetrics')
      expect(monitor).toHaveProperty('reset')
      expect(typeof monitor.monitor).toBe('function')
      expect(typeof monitor.getMetrics).toBe('function')
      expect(typeof monitor.reset).toBe('function')
    })

    it('should create health checker', async () => {
      const factory = monitoringFactory.createHealthChecker()
      const checker = await factory()

      expect(checker).toHaveProperty('check')
      expect(checker).toHaveProperty('getStatus')
      expect(checker).toHaveProperty('addCheck')
      expect(typeof checker.check).toBe('function')
      expect(typeof checker.getStatus).toBe('function')
      expect(typeof checker.addCheck).toBe('function')

      // Test health checker methods
      const checkResult = await checker.check()
      expect(checkResult).toEqual({ status: 'healthy' })

      const status = checker.getStatus()
      expect(status).toEqual({ status: 'healthy' })
    })

    it('should create logger service', async () => {
      const factory = monitoringFactory.createLoggerService()
      const logger = await factory()

      expect(logger).toHaveProperty('info')
      expect(logger).toHaveProperty('error')
      expect(logger).toHaveProperty('warn')
      expect(logger).toHaveProperty('debug')
    })

    it('should create logger service with config', async () => {
      const config = {
        level: 'debug',
        format: 'json',
      }

      const factory = monitoringFactory.createLoggerService(config)
      const logger = await factory()

      expect(logger).toHaveProperty('info')
      expect(logger).toHaveProperty('error')
      expect(logger).toHaveProperty('warn')
      expect(logger).toHaveProperty('debug')
    })
  })

  describe('Configuration Factory', () => {
    it('should create environment config', async () => {
      const factory = configurationFactory.createEnvironmentConfig()
      const config = await factory()

      expect(config).toHaveProperty('NODE_ENV')
      expect(config).toHaveProperty('GITHUB_TOKEN')
      expect(config).toHaveProperty('DATABASE_URL')
    })

    it('should create auth config', async () => {
      const factory = configurationFactory.createAuthConfig()
      const config = await factory()

      expect(config).toHaveProperty('providers')
      expect(config).toHaveProperty('secret')
    })

    it('should create database config', async () => {
      const factory = configurationFactory.createDatabaseConfig()
      const config = await factory()

      expect(config).toHaveProperty('url')
      expect(config).toHaveProperty('ssl')
      expect(config).toHaveProperty('poolSize')
      expect(config).toHaveProperty('timeout')
      expect(config.poolSize).toBe(10)
      expect(config.timeout).toBe(30000)
      expect(mockResolve).toHaveBeenCalledWith('config')
    })

    it('should create database config with production SSL', async () => {
      mockResolve.mockImplementation(key => {
        if (key === 'config') {
          return Promise.resolve({
            GITHUB_TOKEN: 'test-github-token',
            DATABASE_URL: 'postgresql://prod:prod@localhost/prod',
            NODE_ENV: 'production',
          })
        }
        return Promise.resolve({})
      })

      const factory = configurationFactory.createDatabaseConfig()
      const config = await factory()

      expect(config.ssl).toBe(true)
      expect(config.url).toBe('postgresql://prod:prod@localhost/prod')
    })
  })

  describe('Abstract Service Factory', () => {
    describe('ProductionServiceFactory', () => {
      let factory: ProductionServiceFactory

      beforeEach(() => {
        factory = new ProductionServiceFactory()
      })

      it('should create repository services', async () => {
        const userRepo = await factory.createRepository('user')()
        expect(userRepo).toHaveProperty('findById')

        const repoRepo = await factory.createRepository('repository')()
        expect(repoRepo).toHaveProperty('findByName')

        const oppRepo = await factory.createRepository('opportunity')()
        expect(oppRepo).toHaveProperty('findByRepository')

        const cacheRepo = await factory.createRepository('cache')()
        expect(cacheRepo).toHaveProperty('get')
      })

      it('should throw error for unknown repository type', async () => {
        expect(() => factory.createRepository('unknown')).toThrow(
          'Unknown repository type: unknown'
        )
      })

      it('should create business services', async () => {
        const searchService = await factory.createService('search')()
        expect(searchService).toHaveProperty('search')

        const recoService = await factory.createService('recommendation')()
        expect(recoService).toHaveProperty('getRecommendations')

        const analyticsService = await factory.createService('analytics')()
        expect(analyticsService).toHaveProperty('trackEvent')
      })

      it('should throw error for unknown service type', async () => {
        expect(() => factory.createService('unknown')).toThrow('Unknown service type: unknown')
      })

      it('should create monitoring services', async () => {
        const perfMonitor = await factory.createMonitoring('performance')()
        expect(perfMonitor).toHaveProperty('monitor')

        const healthChecker = await factory.createMonitoring('health')()
        expect(healthChecker).toHaveProperty('check')

        const logger = await factory.createMonitoring('logger')()
        expect(logger).toHaveProperty('info')
      })

      it('should throw error for unknown monitoring type', async () => {
        expect(() => factory.createMonitoring('unknown')).toThrow(
          'Unknown monitoring type: unknown'
        )
      })
    })

    describe('TestingServiceFactory', () => {
      let factory: TestingServiceFactory

      beforeEach(() => {
        factory = new TestingServiceFactory()
      })

      it('should create mock repository services', async () => {
        const repo = await factory.createRepository('user')()
        expect(repo).toHaveProperty('type', 'user')
        expect(repo).toHaveProperty('mockMethod')
      })

      it('should create mock business services', async () => {
        const service = await factory.createService('search')()
        expect(service).toHaveProperty('type', 'search')
        expect(service).toHaveProperty('mockMethod')
      })

      it('should create mock monitoring services', async () => {
        const monitor = await factory.createMonitoring('performance')()
        expect(monitor).toHaveProperty('type', 'performance')
        expect(monitor).toHaveProperty('track')
        expect(monitor).toHaveProperty('getMetrics')
        expect(monitor).toHaveProperty('reset')
      })
    })
  })

  describe('Factory Registry', () => {
    beforeEach(() => {
      // Clear existing factories to ensure test isolation
      const factoriesMap = (global as unknown as { __factories?: Map<string, unknown> }).__factories
      if (factoriesMap) {
        factoriesMap.clear()
      }
    })

    it('should register and retrieve factories', () => {
      const customFactory = new ProductionServiceFactory()
      registerFactory('custom', customFactory)

      const result = getFactory('custom')
      expect(result.success).toBe(true)
      expect(result.value).toBe(customFactory)
    })

    it('should return failure for unknown factory', () => {
      const result = getFactory('nonexistent')
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error.message).toContain('Factory not found: nonexistent')
    })

    it('should get factory or default', () => {
      const customFactory = new TestingServiceFactory()
      registerFactory('custom', customFactory)

      const retrieved = getFactoryOrDefault('custom')
      expect(retrieved).toBe(customFactory)

      const defaultFactory = getFactoryOrDefault('nonexistent')
      expect(defaultFactory).toBeInstanceOf(ProductionServiceFactory)
    })

    it('should create factory for environment', () => {
      const prodFactory = createFactory('production')
      expect(prodFactory).toBeInstanceOf(ProductionServiceFactory)

      const testFactory = createFactory('testing')
      expect(testFactory).toBeInstanceOf(TestingServiceFactory)

      const defaultFactory = createFactory()
      expect(defaultFactory).toBeInstanceOf(ProductionServiceFactory)
    })
  })

  describe('Service Creation Utility', () => {
    beforeEach(() => {
      // Ensure default factories are registered
      registerFactory('production', new ProductionServiceFactory())
      registerFactory('testing', new TestingServiceFactory())
    })

    it('should create repository service', async () => {
      const service = await createService('user', 'repository', 'production')
      expect(service).toHaveProperty('findById')
    })

    it('should create business service', async () => {
      const service = await createService('search', 'service', 'production')
      expect(service).toHaveProperty('search')
    })

    it('should create monitoring service', async () => {
      const service = await createService('performance', 'monitoring', 'production')
      expect(service).toHaveProperty('monitor')
    })

    it('should create testing service', async () => {
      const service = await createService('user', 'repository', 'testing')
      expect(service).toHaveProperty('type', 'user')
      expect(service).toHaveProperty('mockMethod')
    })

    it('should throw error for unknown service category', async () => {
      await expect(createService('test', 'unknown' as never, 'production')).rejects.toThrow(
        'Unknown service category: unknown'
      )
    })

    it('should default to production environment', async () => {
      const service = await createService('user', 'repository')
      expect(service).toHaveProperty('findById')
    })
  })

  describe('Service Builder', () => {
    it('should create service builder', () => {
      const builder = serviceBuilder()
      expect(builder).toBeInstanceOf(ServiceBuilder)
    })

    it('should build with config', async () => {
      const mockFactory = vi.fn(() => Promise.resolve({ test: 'service' }))
      const config = { timeout: 5000, retries: 3 }
      const dependency = { name: 'database', instance: {} }

      const builder = serviceBuilder().withConfig(config).withDependency(dependency)

      const factoryFn = builder.build(mockFactory)
      const result = await factoryFn()

      expect(result).toEqual({ test: 'service' })
      expect(mockFactory).toHaveBeenCalled()
    })

    it('should chain configuration methods', () => {
      const builder = serviceBuilder()
      const chainedBuilder = builder
        .withConfig({ key: 'value' })
        .withDependency({ name: 'dep', instance: {} })

      expect(chainedBuilder).toBe(builder)
    })

    it('should merge multiple configs', () => {
      const builder = serviceBuilder()
      const finalBuilder = builder.withConfig({ key1: 'value1' }).withConfig({ key2: 'value2' })

      // Builder should maintain internal state correctly
      expect(finalBuilder).toBe(builder)
    })

    it('should handle multiple dependencies', () => {
      const builder = serviceBuilder()
      const finalBuilder = builder
        .withDependency({ name: 'dep1', instance: {} })
        .withDependency({ name: 'dep2', instance: {} })

      expect(finalBuilder).toBe(builder)
    })

    it('should build without config or dependencies', async () => {
      const mockFactory = vi.fn(() => Promise.resolve({ minimal: 'service' }))
      const builder = serviceBuilder()

      const factoryFn = builder.build(mockFactory)
      const result = await factoryFn()

      expect(result).toEqual({ minimal: 'service' })
      expect(mockFactory).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle factory creation errors gracefully', async () => {
      const mockError = new Error('Factory creation failed')
      vi.doMock('@/lib/github', () => {
        throw mockError
      })

      const factory = createGitHubClientFactory()
      await expect(factory()).rejects.toThrow('Factory creation failed')
    })

    it('should handle container resolution errors', async () => {
      mockResolve.mockRejectedValue(new Error('Container resolution failed'))

      const factory = createGitHubClientFactory()
      await expect(factory()).rejects.toThrow('Container resolution failed')
    })

    it('should handle database connection errors', async () => {
      vi.doMock('@neondatabase/serverless', () => {
        throw new Error('Database connection failed')
      })

      const factory = createDatabaseFactory()
      await expect(factory()).rejects.toThrow('Database connection failed')
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined/null configs', async () => {
      const factory = createGitHubClientFactory(undefined)
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
    })

    it('should handle empty environment config', async () => {
      mockResolve.mockResolvedValue({})

      const factory = createGitHubClientFactory()
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
    })

    it('should handle malformed database URL gracefully', async () => {
      mockResolve.mockImplementation(key => {
        if (key === 'config') {
          return Promise.resolve({
            DATABASE_URL: 'invalid-url',
            NODE_ENV: 'test',
          })
        }
        return Promise.resolve({})
      })

      const factory = createDatabaseFactory()
      const db = await factory()

      expect(db).toHaveProperty('select')
    })

    it('should handle missing optional config values', async () => {
      const config = {
        // Missing timeout, retries, etc.
        baseUrl: 'https://custom.github.com',
      }

      const factory = createGitHubClientFactory(config)
      const client = await factory()

      expect(client).toHaveProperty('rest')
      expect(client).toHaveProperty('auth')
    })
  })

  describe('Integration Scenarios', () => {
    it('should create complete service stack', async () => {
      const factory = new ProductionServiceFactory()

      // Create repository layer
      const userRepo = await factory.createRepository('user')()
      const repoRepo = await factory.createRepository('repository')()

      // Create service layer
      const searchService = await factory.createService('search')()
      const recoService = await factory.createService('recommendation')()

      // Create monitoring layer
      const perfMonitor = await factory.createMonitoring('performance')()
      const healthChecker = await factory.createMonitoring('health')()

      // Verify all services are created correctly
      expect(userRepo).toHaveProperty('findById')
      expect(repoRepo).toHaveProperty('findByName')
      expect(searchService).toHaveProperty('search')
      expect(recoService).toHaveProperty('getRecommendations')
      expect(perfMonitor).toHaveProperty('monitor')
      expect(healthChecker).toHaveProperty('check')
    })

    it('should support factory switching for testing', async () => {
      // Create production service
      const prodService = await createService('user', 'repository', 'production')
      expect(prodService).toHaveProperty('findById')

      // Switch to testing environment
      const testService = await createService('user', 'repository', 'testing')
      expect(testService).toHaveProperty('type', 'user')
      expect(testService).toHaveProperty('mockMethod')
    })

    it('should handle complex service builder scenarios', async () => {
      const mockDatabase = { query: vi.fn() }
      const mockCache = { get: vi.fn(), set: vi.fn() }
      const config = {
        timeout: 10000,
        retries: 5,
        enableMetrics: true,
      }

      const mockFactory = vi.fn(() =>
        Promise.resolve({
          search: vi.fn(),
          getRecommendations: vi.fn(),
        })
      )

      const serviceBuilderInstance = serviceBuilder()
        .withConfig(config)
        .withDependency({ name: 'database', instance: mockDatabase })
        .withDependency({ name: 'cache', instance: mockCache })

      const factoryFn = serviceBuilderInstance.build(mockFactory)
      const service = await factoryFn()

      expect(service).toHaveProperty('search')
      expect(service).toHaveProperty('getRecommendations')
      expect(mockFactory).toHaveBeenCalled()
    })
  })
})
