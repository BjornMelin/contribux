/**
 * Service Factory Implementation
 * Creates and configures services with proper dependency injection
 * Following Factory Pattern for complex object creation
 */

import { getContainer, ServiceKeys } from '@/lib/di/container'
import type {
  DatabaseConnectionString,
  GitHubToken,
  Result,
  ServiceFactory,
} from '@/lib/types/advanced'
import { createBrand, Failure, Success } from '@/lib/types/advanced'

// Type for GitHub client instance
type GitHubClient = ReturnType<typeof import('@/lib/github').createGitHubClient>

// Type for database instance - supports both Neon and PGlite
type NeonDatabaseConnection = ReturnType<typeof import('drizzle-orm/neon-http').drizzle>
type PGliteDatabaseConnection = ReturnType<typeof import('drizzle-orm/pglite').drizzle>
type DatabaseConnection = NeonDatabaseConnection | PGliteDatabaseConnection

// Union type for all possible service instances
type ServiceInstance =
  | GitHubClient
  | DatabaseConnection
  | PerformanceMonitor
  | HealthChecker
  | Record<string, unknown>
  | unknown

// Type for environment configuration
interface EnvironmentConfig {
  GITHUB_TOKEN: string
  DATABASE_URL: string
  NODE_ENV: string
}

// GitHub Client Factory
export interface GitHubClientConfig {
  token?: GitHubToken
  baseUrl?: string
  timeout?: number
  retries?: number
  rateLimitHandling?: boolean
}

// GitHub Client Factory Functions
export function createGitHubClientFactory(
  config?: GitHubClientConfig
): ServiceFactory<GitHubClient> {
  return async () => {
    const { createGitHubClient } = await import('@/lib/github')

    const defaultConfig = {
      baseUrl: 'https://api.github.com',
      timeout: 30000,
      retries: 3,
      rateLimitHandling: true,
    }

    const finalConfig = { ...defaultConfig, ...config }

    // Get token from environment if not provided
    if (!finalConfig.token) {
      const container = getContainer()
      const env = (await container.resolve(ServiceKeys.CONFIG)) as EnvironmentConfig
      finalConfig.token = createBrand<string, 'GitHubToken'>(env.GITHUB_TOKEN)
    }

    return createGitHubClient(finalConfig)
  }
}

export function createGitHubClientWithAuth(token: GitHubToken): ServiceFactory<GitHubClient> {
  return createGitHubClientFactory({ token })
}

export function createGitHubClientForTesting(): ServiceFactory<GitHubClient> {
  return createGitHubClientFactory({
    baseUrl: 'http://localhost:3001', // Mock server
    token: createBrand<string, 'GitHubToken'>('test-token'),
    timeout: 5000,
  })
}

// Database Factory
export interface DatabaseConfig {
  connectionString?: DatabaseConnectionString
  poolSize?: number
  ssl?: boolean
  logging?: boolean
}

// Database Factory Functions
export function createDatabaseFactory(config?: DatabaseConfig): ServiceFactory<DatabaseConnection> {
  return async () => {
    const { neon } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-http')
    const schema = await import('@/lib/db/schema')

    let connectionString = config?.connectionString

    if (!connectionString) {
      const container = getContainer()
      const env = (await container.resolve(ServiceKeys.CONFIG)) as EnvironmentConfig
      connectionString = createBrand<string, 'DatabaseConnectionString'>(env.DATABASE_URL)
    }

    const sql = neon(connectionString, {
      fetchOptions: {
        cache: 'no-cache',
      },
    })

    return drizzle(sql, {
      schema,
      logger: config?.logging ?? false,
    })
  }
}

export function createDatabaseForTesting(): ServiceFactory<DatabaseConnection> {
  return async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const schema = await import('@/lib/db/schema')

    const client = new PGlite()
    return drizzle(client, {
      schema,
      logger: true,
    })
  }
}

// Repository Factory Functions
export const repositoryFactory = {
  createUserRepository(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { UserRepository } = await import('@/lib/repositories/implementations/user-repository')
      return new UserRepository()
    }
  },

  createRepositoryRepository(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { RepositoryRepository } = await import(
        '@/lib/repositories/implementations/repository-repository'
      )
      return new RepositoryRepository()
    }
  },

  createOpportunityRepository(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { OpportunityRepository } = await import(
        '@/lib/repositories/implementations/opportunity-repository'
      )
      return new OpportunityRepository()
    }
  },

  createCacheRepository(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { CacheRepository } = await import(
        '@/lib/repositories/implementations/cache-repository'
      )
      return new CacheRepository()
    }
  },

  createVectorRepository(type: 'repository' | 'opportunity'): ServiceFactory<ServiceInstance> {
    return async () => {
      if (type === 'repository') {
        const { RepositoryVectorRepository } = await import(
          '@/lib/repositories/implementations/vector-repository'
        )
        return new RepositoryVectorRepository()
      }
      const { OpportunityVectorRepository } = await import(
        '@/lib/repositories/implementations/vector-repository'
      )
      return new OpportunityVectorRepository()
    }
  },
}

// Business Service Factory Functions
export const businessServiceFactory = {
  createSearchService(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { SearchService } = await import('@/lib/business-logic/search-service')
      return new SearchService()
    }
  },

  createRecommendationService(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { RecommendationService } = await import('@/lib/business-logic/recommendation-service')
      return new RecommendationService()
    }
  },

  createAnalyticsService(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { AnalyticsService } = await import('@/lib/business-logic/analytics-service')
      return new AnalyticsService()
    }
  },
}

// Monitoring Factory Functions
interface PerformanceMonitor {
  monitor: () => void
  getMetrics: () => Record<string, unknown>
  reset: () => void
}

interface HealthChecker {
  check: () => Promise<{ status: string }>
  getStatus: () => { status: string }
  addCheck: () => void
}

export const monitoringFactory = {
  createPerformanceMonitor(): ServiceFactory<PerformanceMonitor> {
    return async () => {
      // TODO: Implement PerformanceMonitor once monitoring module is created
      // const { PerformanceMonitor } = await import('@/lib/monitoring/performance-monitor')
      // return new PerformanceMonitor()
      return {
        monitor: () => {
          // TODO: Implement monitoring logic
        },
        getMetrics: () => ({}),
        reset: () => {
          // TODO: Implement reset logic
        },
      }
    }
  },

  createHealthChecker(): ServiceFactory<HealthChecker> {
    return async () => {
      // TODO: Implement HealthChecker once monitoring module is created
      // const { HealthChecker } = await import('@/lib/monitoring/health-checker')
      // const container = getContainer()
      // const db = await container.resolve(ServiceKeys.DATABASE)
      // const cache = await container.resolve('cache')
      // return new HealthChecker(db, cache)
      return {
        check: () => Promise.resolve({ status: 'healthy' }),
        getStatus: () => ({ status: 'healthy' }),
        addCheck: () => {
          // TODO: Implement health check addition logic
        },
      }
    }
  },

  createLoggerService(_config?: {
    level?: string
    format?: string
  }): ServiceFactory<ServiceInstance> {
    return async () => {
      const { logger } = await import('@/lib/logger')
      return logger
    }
  },
}

// Configuration Factory Functions
interface DatabaseConfigResult {
  url: string
  ssl: boolean
  poolSize: number
  timeout: number
}

export const configurationFactory = {
  createEnvironmentConfig(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { env } = await import('@/lib/env')
      return env
    }
  },

  createAuthConfig(): ServiceFactory<ServiceInstance> {
    return async () => {
      const { authConfig } = await import('@/lib/auth')
      return authConfig
    }
  },

  createDatabaseConfig(): ServiceFactory<DatabaseConfigResult> {
    return async () => {
      const container = getContainer()
      const env = (await container.resolve(ServiceKeys.CONFIG)) as EnvironmentConfig

      return {
        url: env.DATABASE_URL,
        ssl: env.NODE_ENV === 'production',
        poolSize: 10,
        timeout: 30000,
      }
    }
  },
}

// Abstract Factory for creating families of related objects
export abstract class AbstractServiceFactory {
  abstract createRepository(type: string): ServiceFactory<ServiceInstance>
  abstract createService(type: string): ServiceFactory<ServiceInstance>
  abstract createMonitoring(type: string): ServiceFactory<ServiceInstance>
}

export class ProductionServiceFactory extends AbstractServiceFactory {
  createRepository(type: string): ServiceFactory<ServiceInstance> {
    switch (type) {
      case 'user':
        return repositoryFactory.createUserRepository()
      case 'repository':
        return repositoryFactory.createRepositoryRepository()
      case 'opportunity':
        return repositoryFactory.createOpportunityRepository()
      case 'cache':
        return repositoryFactory.createCacheRepository()
      default:
        throw new Error(`Unknown repository type: ${type}`)
    }
  }

  createService(type: string): ServiceFactory<ServiceInstance> {
    switch (type) {
      case 'search':
        return businessServiceFactory.createSearchService()
      case 'recommendation':
        return businessServiceFactory.createRecommendationService()
      case 'analytics':
        return businessServiceFactory.createAnalyticsService()
      default:
        throw new Error(`Unknown service type: ${type}`)
    }
  }

  createMonitoring(type: string): ServiceFactory<ServiceInstance> {
    switch (type) {
      case 'performance':
        return monitoringFactory.createPerformanceMonitor()
      case 'health':
        return monitoringFactory.createHealthChecker()
      case 'logger':
        return monitoringFactory.createLoggerService()
      default:
        throw new Error(`Unknown monitoring type: ${type}`)
    }
  }
}

export class TestingServiceFactory extends AbstractServiceFactory {
  createRepository(type: string): ServiceFactory<ServiceInstance> {
    // Return mock implementations for testing
    return async () => {
      const { createMockRepository } = await import('../../../tests/mocks/repository-mocks')
      return createMockRepository(type)
    }
  }

  createService(type: string): ServiceFactory<ServiceInstance> {
    return async () => {
      const { createMockService } = await import('../../../tests/mocks/service-mocks')
      return createMockService(type)
    }
  }

  createMonitoring(type: string): ServiceFactory<ServiceInstance> {
    return async () => {
      // TODO: Implement monitoring mocks once monitoring module is created
      // const { createMockMonitoring } = await import('@/tests/mocks/monitoring-mocks')
      // return createMockMonitoring(type)
      return {
        type,
        track: () => {
          // TODO: Implement tracking logic
        },
        getMetrics: () => ({}),
        reset: () => {
          // TODO: Implement reset logic
        },
      }
    }
  }
}

// Factory registry for dynamic factory selection
const factories = new Map<string, AbstractServiceFactory>()

export function registerFactory(name: string, factory: AbstractServiceFactory): void {
  factories.set(name, factory)
}

export function getFactory(name: string): Result<AbstractServiceFactory, Error> {
  const factory = factories.get(name)
  return factory ? Success(factory) : Failure(new Error(`Factory not found: ${name}`))
}

export function getFactoryOrDefault(name: string): AbstractServiceFactory {
  return factories.get(name) || new ProductionServiceFactory()
}

// Initialize default factories
registerFactory('production', new ProductionServiceFactory())
registerFactory('testing', new TestingServiceFactory())

// Utility functions for easy factory usage
export function createFactory(
  environment: 'production' | 'testing' = 'production'
): AbstractServiceFactory {
  return getFactoryOrDefault(environment)
}

export async function createService<T extends ServiceInstance = ServiceInstance>(
  type: string,
  category: 'repository' | 'service' | 'monitoring',
  environment: 'production' | 'testing' = 'production'
): Promise<T> {
  const factory = createFactory(environment)

  let serviceFactory: ServiceFactory<ServiceInstance>

  switch (category) {
    case 'repository':
      serviceFactory = factory.createRepository(type)
      break
    case 'service':
      serviceFactory = factory.createService(type)
      break
    case 'monitoring':
      serviceFactory = factory.createMonitoring(type)
      break
    default:
      throw new Error(`Unknown service category: ${category}`)
  }

  const instance = await serviceFactory()
  return instance as T
}

// Builder pattern for complex service configurations
interface ServiceConfig {
  [key: string]: unknown
}

interface ServiceDependency {
  name: string
  instance: unknown
}

export class ServiceBuilder<T> {
  private config: ServiceConfig = {}
  private dependencies: ServiceDependency[] = []

  withConfig(config: ServiceConfig): this {
    this.config = { ...this.config, ...config }
    return this
  }

  withDependency(dependency: ServiceDependency): this {
    this.dependencies.push(dependency)
    return this
  }

  build(factory: ServiceFactory<T>): () => Promise<T> {
    return async () => {
      return await factory()
    }
  }
}

export function serviceBuilder<T>(): ServiceBuilder<T> {
  return new ServiceBuilder<T>()
}
