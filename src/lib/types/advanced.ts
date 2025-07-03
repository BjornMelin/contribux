/**
 * Advanced TypeScript Utilities for Enhanced Type Safety
 * Provides branded types, utility types, and conditional types for better DX
 */

import type React from 'react'

// Branded types for enhanced type safety
export type Brand<T, B> = T & { readonly __brand: B }

// Domain-specific branded types
export type UserId = Brand<string, 'UserId'>
export type RepositoryId = Brand<string, 'RepositoryId'>
export type GitHubToken = Brand<string, 'GitHubToken'>
export type SearchQuery = Brand<string, 'SearchQuery'>
export type DatabaseConnectionString = Brand<string, 'DatabaseConnectionString'>

// Search criteria interface
export interface SearchCriteria {
  [key: string]: unknown
}

// Utility to create branded types
export const createBrand = <T, B>(value: T): Brand<T, B> => value as Brand<T, B>

// Result pattern for error handling
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

// Create success result
export const Success = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
})

// Create error result
export const Failure = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
})

// Optional type with null safety
export type Optional<T> = T | null | undefined

// NonEmpty array type
export type NonEmptyArray<T> = [T, ...T[]]

// Deep readonly type
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

// Extract keys with specific value type
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never
}[keyof T]

// Conditional type for API response
export type ApiResponse<T> =
  | {
      success: true
      data: T
      meta?: {
        page?: number
        total?: number
        hasNext?: boolean
      }
    }
  | {
      success: false
      error: {
        code: string
        message: string
        details?: unknown
      }
    }

// Function type utilities
export type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>
export type SyncFunction<T extends unknown[], R> = (...args: T) => R

// Configuration type builder
export type ConfigBuilder<T> = {
  [K in keyof T]: T[K] extends string
    ? { value: T[K]; required: boolean; default?: T[K] }
    : T[K] extends number
      ? { value: T[K]; required: boolean; default?: T[K]; min?: number; max?: number }
      : { value: T[K]; required: boolean; default?: T[K] }
}

// Event system types
export type EventMap = Record<string, unknown>
export type EventListener<T> = (data: T) => void | Promise<void>
export type EventUnsubscribe = () => void

// Repository pattern types
export interface Repository<T, ID = string> {
  findById(id: ID): Promise<Optional<T>>
  findAll(): Promise<T[]>
  create(entity: Omit<T, 'id'>): Promise<T>
  update(id: ID, updates: Partial<T>): Promise<Optional<T>>
  delete(id: ID): Promise<boolean>
}

// Service pattern types
export interface Service {
  readonly name: string
  initialize?(): Promise<void>
  destroy?(): Promise<void>
}

// Factory pattern types
export interface Factory<T> {
  create(...args: unknown[]): T | Promise<T>
}

// Observer pattern types
export interface Observer<T> {
  update(data: T): void | Promise<void>
}

export interface Observable<T> {
  subscribe(observer: Observer<T>): EventUnsubscribe
  notify(data: T): void | Promise<void>
}

// Validation types
export type ValidationRule<T> = (value: T) => Result<T, string>
export type ValidationSchema<T> = {
  [K in keyof T]: ValidationRule<T[K]>[]
}

// Cache types
export interface CacheEntry<T> {
  value: T
  expiresAt: number
  createdAt: number
}

export interface Cache<K, V> {
  get(key: K): Promise<Optional<V>>
  set(key: K, value: V, ttl?: number): Promise<void>
  delete(key: K): Promise<boolean>
  clear(): Promise<void>
}

// HTTP client types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type HttpHeaders = Record<string, string>

export interface HttpRequest {
  method: HttpMethod
  url: string
  headers?: HttpHeaders
  body?: unknown
  timeout?: number
}

export interface HttpResponse<T = unknown> {
  status: number
  statusText: string
  headers: HttpHeaders
  data: T
}

// Dependency injection types
export type ServiceKey = string | symbol
export type ServiceFactory<T> = () => T | Promise<T>
export type ServiceInstance<T> = T

export interface ServiceDefinition<T = unknown> {
  key: ServiceKey
  factory: ServiceFactory<T>
  singleton?: boolean
  dependencies?: ServiceKey[]
}

export interface Container {
  register<T>(definition: ServiceDefinition<T>): void
  resolve<T>(key: ServiceKey): Promise<T>
  has(key: ServiceKey): boolean
  clear(): void
}

// Component prop utilities
export type PropsWithClassName<T = object> = T & { className?: string }
export type PropsWithChildren<T = object> = T & { children?: React.ReactNode }
export type PropsWithTestId<T = object> = T & { testId?: string }

// Compound component utilities
export type CompoundComponent<P, S> = React.FC<P> & S

// Error boundary types
export interface ErrorInfo {
  componentStack: string
  errorBoundary?: string
  eventType?: string
}

export interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

// Performance monitoring types
export interface PerformanceMetric {
  name: string
  value: number
  unit: 'ms' | 'bytes' | 'count'
  timestamp: number
  tags?: Record<string, string>
}

export interface PerformanceMonitor {
  start(name: string): () => PerformanceMetric
  record(metric: PerformanceMetric): void
  getMetrics(name?: string): PerformanceMetric[]
  clear(): void
}

// Type guards
export const isSuccess = <T, E>(result: Result<T, E>): result is { success: true; data: T } =>
  result.success

export const isFailure = <T, E>(result: Result<T, E>): result is { success: false; error: E } =>
  !result.success

export const isNonEmpty = <T>(array: T[]): array is NonEmptyArray<T> => array.length > 0

export const isDefined = <T>(value: Optional<T>): value is T =>
  value !== null && value !== undefined

// Utility functions
export const pipe =
  <T extends unknown[], R>(...fns: Array<(arg: unknown) => unknown>) =>
  (...args: T): R =>
    fns.reduce((acc, fn) => fn(acc), args[0]) as R

export const compose =
  <T extends unknown[], R>(...fns: Array<(arg: unknown) => unknown>) =>
  (...args: T): R =>
    fns.reduceRight((acc, fn) => fn(acc), args[0]) as R

export const memoize = <T extends unknown[], R>(
  fn: (...args: T) => R,
  keyFn?: (...args: T) => string
): ((...args: T) => R) => {
  const cache = new Map<string, R>()

  return (...args: T): R => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args)

    if (cache.has(key)) {
      const cached = cache.get(key)
      if (cached !== undefined) {
        return cached
      }
    }

    const result = fn(...args)
    cache.set(key, result)
    return result
  }
}

// Async utilities
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export const timeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, sleep(ms).then(() => Promise.reject(new Error(`Timeout after ${ms}ms`)))])

export const retry = async <T>(fn: () => Promise<T>, maxAttempts = 3, delay = 1000): Promise<T> => {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        await sleep(delay * attempt)
      }
    }
  }

  throw lastError
}
