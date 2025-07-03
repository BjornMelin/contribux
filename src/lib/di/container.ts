/**
 * Simple Dependency Injection Container
 * Provides type-safe service registration and resolution
 * Following KISS principle - simple implementation that works
 */

import type {
  Container,
  Result,
  ServiceDefinition,
  ServiceFactory,
  ServiceKey,
} from '@/lib/types/advanced'
import { Failure, Success } from '@/lib/types/advanced'

export class DIContainer implements Container {
  private services = new Map<ServiceKey, ServiceDefinition>()
  private instances = new Map<ServiceKey, unknown>()
  private resolving = new Set<ServiceKey>()

  /**
   * Register a service with the container
   */
  register<T>(definition: ServiceDefinition<T>): void {
    if (this.services.has(definition.key)) {
      throw new Error(`Service ${String(definition.key)} is already registered`)
    }

    this.services.set(definition.key, definition)
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(
    key: ServiceKey,
    factory: ServiceFactory<T>,
    dependencies?: ServiceKey[]
  ): void {
    this.register({
      key,
      factory,
      singleton: true,
      dependencies,
    })
  }

  /**
   * Register a transient service (new instance each time)
   */
  registerTransient<T>(
    key: ServiceKey,
    factory: ServiceFactory<T>,
    dependencies?: ServiceKey[]
  ): void {
    this.register({
      key,
      factory,
      singleton: false,
      dependencies,
    })
  }

  /**
   * Register a value as a singleton
   */
  registerValue<T>(key: ServiceKey, value: T): void {
    this.registerSingleton(key, () => value)
    this.instances.set(key, value)
  }

  /**
   * Resolve a service by key
   */
  async resolve<T>(key: ServiceKey): Promise<T> {
    const result = await this.tryResolve<T>(key)

    if (!result.success) {
      throw result.error
    }

    return result.data
  }

  /**
   * Try to resolve a service, returning a Result type
   */
  async tryResolve<T>(key: ServiceKey): Promise<Result<T, Error>> {
    try {
      // Check for circular dependencies
      if (this.resolving.has(key)) {
        return Failure(new Error(`Circular dependency detected: ${String(key)}`))
      }

      // Check if we have a cached singleton instance
      if (this.instances.has(key)) {
        return Success(this.instances.get(key) as T)
      }

      // Get service definition
      const definition = this.services.get(key)
      if (!definition) {
        return Failure(new Error(`Service ${String(key)} is not registered`))
      }

      // Mark as resolving to detect circular dependencies
      this.resolving.add(key)

      try {
        // Resolve dependencies first
        const dependencies: unknown[] = []
        if (definition.dependencies) {
          for (const depKey of definition.dependencies) {
            const depResult = await this.tryResolve(depKey)
            if (!depResult.success) {
              return Failure(
                new Error(
                  `Failed to resolve dependency ${String(depKey)} for ${String(key)}: ${depResult.error.message}`
                )
              )
            }
            dependencies.push(depResult.data)
          }
        }

        // Create the service instance
        const instance = await definition.factory.apply(
          null,
          dependencies as Parameters<typeof definition.factory>
        )

        // Cache singleton instances
        if (definition.singleton) {
          this.instances.set(key, instance)
        }

        return Success(instance as T)
      } finally {
        this.resolving.delete(key)
      }
    } catch (error) {
      this.resolving.delete(key)
      return Failure(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Check if a service is registered
   */
  has(key: ServiceKey): boolean {
    return this.services.has(key)
  }

  /**
   * Clear all services and instances
   */
  clear(): void {
    this.services.clear()
    this.instances.clear()
    this.resolving.clear()
  }

  /**
   * Get all registered service keys
   */
  getRegisteredKeys(): ServiceKey[] {
    return Array.from(this.services.keys())
  }

  /**
   * Remove a service registration
   */
  unregister(key: ServiceKey): boolean {
    const removed = this.services.delete(key)
    this.instances.delete(key)
    return removed
  }

  /**
   * Create a child container that inherits from this one
   */
  createChild(): DIContainer {
    const child = new DIContainer()

    // Copy service definitions (not instances)
    for (const [key, definition] of this.services) {
      child.services.set(key, definition)
    }

    return child
  }

  /**
   * Dispose all singleton instances that have a dispose method
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = []

    for (const instance of this.instances.values()) {
      if (instance && typeof instance === 'object' && 'dispose' in instance) {
        const disposeFn = (instance as { dispose: () => void | Promise<void> }).dispose
        if (typeof disposeFn === 'function') {
          const result = disposeFn()
          if (result instanceof Promise) {
            disposePromises.push(result)
          }
        }
      }
    }

    await Promise.all(disposePromises)
    this.clear()
  }
}

// Service keys as symbols for better type safety
export const ServiceKeys = {
  // Database
  DATABASE: Symbol('database'),
  DB_CONNECTION: Symbol('db_connection'),

  // External APIs
  GITHUB_CLIENT: Symbol('github_client'),

  // Business Logic
  REPOSITORY_SERVICE: Symbol('repository_service'),
  SEARCH_SERVICE: Symbol('search_service'),
  USER_SERVICE: Symbol('user_service'),

  // Infrastructure
  LOGGER: Symbol('logger'),
  CACHE: Symbol('cache'),
  PERFORMANCE_MONITOR: Symbol('performance_monitor'),

  // Configuration
  CONFIG: Symbol('config'),
  AUTH_CONFIG: Symbol('auth_config'),

  // Monitoring
  HEALTH_CHECKER: Symbol('health_checker'),
  METRICS_COLLECTOR: Symbol('metrics_collector'),
} as const

// Global container instance
let globalContainer: DIContainer | null = null

/**
 * Get the global container instance
 */
export function getContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer()
  }
  return globalContainer
}

/**
 * Set a custom global container
 */
export function setContainer(container: DIContainer): void {
  globalContainer = container
}

/**
 * Reset the global container
 */
export function resetContainer(): void {
  if (globalContainer) {
    globalContainer.clear()
  }
  globalContainer = null
}

/**
 * Decorator for automatic service registration
 */
export function Injectable(key: ServiceKey, options?: { singleton?: boolean }) {
  return <T extends new (...args: unknown[]) => unknown>(ctor: T) => {
    const container = getContainer()

    container.register({
      key,
      factory: () => new ctor(),
      singleton: options?.singleton ?? true,
    })

    return ctor
  }
}

/**
 * Decorator for dependency injection
 * Simplified implementation without reflect-metadata dependency
 */
export function Inject(keys: ServiceKey[]) {
  return (target: Record<string, unknown>, _propertyKey?: string, parameterIndex?: number) => {
    // Store dependency metadata using simple property
    if (!target.__dependencies) {
      target.__dependencies = []
    }
    if (parameterIndex !== undefined) {
      ;(target.__dependencies as ServiceKey[])[parameterIndex] = keys[parameterIndex]
    }
  }
}

// Utility functions for common patterns

/**
 * Create a factory that resolves dependencies automatically
 */
export function createFactory<T>(
  ctor: new (...args: unknown[]) => T,
  dependencies: ServiceKey[]
): ServiceFactory<T> {
  return async (...injectedDeps: unknown[]) => {
    const container = getContainer()
    const resolvedDeps =
      injectedDeps.length > 0
        ? injectedDeps
        : await Promise.all(dependencies.map(key => container.resolve(key)))

    return new ctor(...resolvedDeps)
  }
}

/**
 * Resolve multiple services at once
 */
export async function resolveAll<T extends Record<string, ServiceKey>>(
  keys: T
): Promise<{ [K in keyof T]: unknown }> {
  const container = getContainer()
  const resolved: Record<string, unknown> = {}

  for (const [name, key] of Object.entries(keys)) {
    resolved[name] = await container.resolve(key)
  }

  return resolved as { [K in keyof T]: unknown }
}

/**
 * Register common services with the container
 */
export function registerCoreServices(container: DIContainer = getContainer()): void {
  // Register configuration
  container.registerSingleton(ServiceKeys.CONFIG, async () => {
    const { env } = await import('@/lib/env')
    return env
  })

  // Register database
  container.registerSingleton(ServiceKeys.DATABASE, async () => {
    const { db } = await import('@/lib/db')
    return db
  })

  // Register GitHub client
  container.registerTransient(ServiceKeys.GITHUB_CLIENT, async () => {
    const { createGitHubClient } = await import('@/lib/github')
    const config = await container.resolve(ServiceKeys.CONFIG)
    return createGitHubClient({
      accessToken: (config as Record<string, unknown>).GITHUB_TOKEN as string,
    })
  })

  // Register logger
  container.registerSingleton(ServiceKeys.LOGGER, async () => {
    const { logger } = await import('@/lib/logger')
    return logger
  })
}

export type { Container, ServiceDefinition, ServiceFactory, ServiceKey }
