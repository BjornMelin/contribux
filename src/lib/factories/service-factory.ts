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

// GitHub Client Factory
export interface GitHubClientConfig {
  token?: GitHubToken
  baseUrl?: string
  timeout?: number
  retries?: number
  rateLimitHandling?: boolean
}

export class GitHubClientFactory {
  static create(config?: GitHubClientConfig): ServiceFactory<any> {
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
        const env = await container.resolve(ServiceKeys.CONFIG)
        finalConfig.token = createBrand<string, 'GitHubToken'>((env as any).GITHUB_TOKEN)
      }

      return createGitHubClient(finalConfig)
    }
  }

  static createWithAuth(token: GitHubToken): ServiceFactory<any> {
    return GitHubClientFactory.create({ token })
  }

  static createForTesting(): ServiceFactory<any> {
    return GitHubClientFactory.create({
      baseUrl: 'http://localhost:3001', // Mock server
      token: createBrand<string, 'GitHubToken'>('test-token'),
      timeout: 5000,
    })
  }
}

// Database Factory
export interface DatabaseConfig {
  connectionString?: DatabaseConnectionString
  poolSize?: number
  ssl?: boolean
  logging?: boolean
}

export class DatabaseFactory {
  static create(config?: DatabaseConfig): ServiceFactory<any> {
    return async () => {
      const { neon } = await import('@neondatabase/serverless')
      const { drizzle } = await import('drizzle-orm/neon-http')
      const schema = await import('@/lib/db/schema')

      let connectionString = config?.connectionString

      if (!connectionString) {
        const container = getContainer()
        const env = await container.resolve(ServiceKeys.CONFIG)
        connectionString = createBrand<string, 'DatabaseConnectionString'>(
          (env as any).DATABASE_URL
        )
      }

      const sql = neon(connectionString, {
        fetchOptions: {
          cache: 'no-cache',
        },
      })

      return drizzle(sql, {
        schema: schema.schema,
        logger: config?.logging ?? false,
      })
    }
  }

  static createForTesting(): ServiceFactory<any> {
    return async () => {
      const { PGlite } = await import('@electric-sql/pglite')
      const { drizzle } = await import('drizzle-orm/pglite')
      const schema = await import('@/lib/db/schema')

      const client = new PGlite()
      return drizzle(client, {
        schema: schema.schema,
        logger: true,
      })
    }
  }
}

// Repository Factory
export class RepositoryFactory {
  private static instance: RepositoryFactory

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory()
    }
    return RepositoryFactory.instance
  }

  createUserRepository(): ServiceFactory<any> {
    return async () => {
      const { UserRepository } = await import('@/lib/repositories/implementations/user-repository')
      return new UserRepository()
    }
  }

  createRepositoryRepository(): ServiceFactory<any> {
    return async () => {
      const { RepositoryRepository } = await import(
        '@/lib/repositories/implementations/repository-repository'
      )
      return new RepositoryRepository()
    }
  }

  createOpportunityRepository(): ServiceFactory<any> {
    return async () => {
      const { OpportunityRepository } = await import(
        '@/lib/repositories/implementations/opportunity-repository'
      )
      return new OpportunityRepository()
    }
  }

  createCacheRepository(): ServiceFactory<any> {
    return async () => {
      const { CacheRepository } = await import(
        '@/lib/repositories/implementations/cache-repository'
      )
      return new CacheRepository()
    }
  }

  createVectorRepository(type: 'repository' | 'opportunity'): ServiceFactory<any> {
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
  }
}

// Service Factory for Business Logic
export class BusinessServiceFactory {
  static createSearchService(): ServiceFactory<any> {
    return async () => {
      const { SearchService } = await import('@/lib/business-logic/search-service')
      const container = getContainer()

      const repositoryRepo = await container.resolve(ServiceKeys.REPOSITORY_SERVICE)
      const opportunityRepo = await container.resolve('opportunity_repository')
      const vectorRepo = await container.resolve('vector_repository')

      return new SearchService(repositoryRepo, opportunityRepo, vectorRepo)
    }
  }

  static createRecommendationService(): ServiceFactory<any> {
    return async () => {
      const { RecommendationService } = await import('@/lib/business-logic/recommendation-service')
      const container = getContainer()

      const userRepo = await container.resolve('user_repository')
      const vectorRepo = await container.resolve('vector_repository')

      return new RecommendationService(userRepo, vectorRepo)
    }
  }

  static createAnalyticsService(): ServiceFactory<any> {
    return async () => {
      const { AnalyticsService } = await import('@/lib/business-logic/analytics-service')
      const container = getContainer()

      const analyticsRepo = await container.resolve('analytics_repository')

      return new AnalyticsService(analyticsRepo)
    }
  }
}

// Monitoring Factory
export class MonitoringFactory {
  static createPerformanceMonitor(): ServiceFactory<any> {
    return async () => {
      // TODO: Implement PerformanceMonitor once monitoring module is created
      // const { PerformanceMonitor } = await import('@/lib/monitoring/performance-monitor')
      // return new PerformanceMonitor()
      return {
        monitor: () => {},
        getMetrics: () => ({}),
        reset: () => {},
      }
    }
  }

  static createHealthChecker(): ServiceFactory<any> {
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
        addCheck: () => {},
      }
    }
  }

  static createLoggerService(config?: { level?: string; format?: string }): ServiceFactory<any> {
    return async () => {
      const { createLogger } = await import('@/lib/logger')
      return createLogger(config)
    }
  }
}

// Configuration Factory
export class ConfigurationFactory {
  static createEnvironmentConfig(): ServiceFactory<any> {
    return async () => {
      const { env } = await import('@/lib/env')
      return env
    }
  }

  static createAuthConfig(): ServiceFactory<any> {
    return async () => {
      const { authConfig } = await import('@/lib/auth')
      return authConfig
    }
  }

  static createDatabaseConfig(): ServiceFactory<any> {
    return async () => {
      const container = getContainer()
      const env = await container.resolve(ServiceKeys.CONFIG)

      return {
        url: (env as any).DATABASE_URL,
        ssl: (env as any).NODE_ENV === 'production',
        poolSize: 10,
        timeout: 30000,
      }
    }
  }
}

// Abstract Factory for creating families of related objects
export abstract class AbstractServiceFactory {
  abstract createRepository(type: string): ServiceFactory<any>
  abstract createService(type: string): ServiceFactory<any>
  abstract createMonitoring(type: string): ServiceFactory<any>
}

export class ProductionServiceFactory extends AbstractServiceFactory {
  createRepository(type: string): ServiceFactory<any> {
    const factory = RepositoryFactory.getInstance()

    switch (type) {
      case 'user':
        return factory.createUserRepository()
      case 'repository':
        return factory.createRepositoryRepository()
      case 'opportunity':
        return factory.createOpportunityRepository()
      case 'cache':
        return factory.createCacheRepository()
      default:
        throw new Error(`Unknown repository type: ${type}`)
    }
  }

  createService(type: string): ServiceFactory<any> {
    switch (type) {
      case 'search':
        return BusinessServiceFactory.createSearchService()
      case 'recommendation':
        return BusinessServiceFactory.createRecommendationService()
      case 'analytics':
        return BusinessServiceFactory.createAnalyticsService()
      default:
        throw new Error(`Unknown service type: ${type}`)
    }
  }

  createMonitoring(type: string): ServiceFactory<any> {
    switch (type) {
      case 'performance':
        return MonitoringFactory.createPerformanceMonitor()
      case 'health':
        return MonitoringFactory.createHealthChecker()
      case 'logger':
        return MonitoringFactory.createLoggerService()
      default:
        throw new Error(`Unknown monitoring type: ${type}`)
    }
  }
}

export class TestingServiceFactory extends AbstractServiceFactory {
  createRepository(type: string): ServiceFactory<any> {
    // Return mock implementations for testing
    return async () => {
      const { createMockRepository } = await import('@/tests/mocks/repository-mocks')
      return createMockRepository(type)
    }
  }

  createService(type: string): ServiceFactory<any> {
    return async () => {
      const { createMockService } = await import('@/tests/mocks/service-mocks')
      return createMockService(type)
    }
  }

  createMonitoring(type: string): ServiceFactory<any> {
    return async () => {
      // TODO: Implement monitoring mocks once monitoring module is created
      // const { createMockMonitoring } = await import('@/tests/mocks/monitoring-mocks')
      // return createMockMonitoring(type)
      return {
        type,
        track: () => {},
        getMetrics: () => ({}),
        reset: () => {},
      }
    }
  }
}

// Factory registry for dynamic factory selection
export class FactoryRegistry {
  private static factories = new Map<string, AbstractServiceFactory>()

  static register(name: string, factory: AbstractServiceFactory): void {
    FactoryRegistry.factories.set(name, factory)
  }

  static get(name: string): Result<AbstractServiceFactory, Error> {
    const factory = FactoryRegistry.factories.get(name)
    return factory ? Success(factory) : Failure(new Error(`Factory not found: ${name}`))
  }

  static getOrDefault(name: string): AbstractServiceFactory {
    return FactoryRegistry.factories.get(name) || new ProductionServiceFactory()
  }
}

// Initialize default factories
FactoryRegistry.register('production', new ProductionServiceFactory())
FactoryRegistry.register('testing', new TestingServiceFactory())

// Utility functions for easy factory usage
export function createFactory(
  environment: 'production' | 'testing' = 'production'
): AbstractServiceFactory {
  return FactoryRegistry.getOrDefault(environment)
}

export async function createService<T>(
  type: string,
  category: 'repository' | 'service' | 'monitoring',
  environment: 'production' | 'testing' = 'production'
): Promise<T> {
  const factory = createFactory(environment)

  let serviceFactory: ServiceFactory<T>

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

  return await serviceFactory()
}

// Builder pattern for complex service configurations
export class ServiceBuilder<T> {
  private config: any = {}
  private dependencies: any[] = []

  withConfig(config: any): this {
    this.config = { ...this.config, ...config }
    return this
  }

  withDependency(dependency: any): this {
    this.dependencies.push(dependency)
    return this
  }

  build(factory: ServiceFactory<T>): () => Promise<T> {
    return async () => {
      return await factory(this.config, ...this.dependencies)
    }
  }
}

export function serviceBuilder<T>(): ServiceBuilder<T> {
  return new ServiceBuilder<T>()
}
