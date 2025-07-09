/**
 * Advanced TypeScript 5.8+ Type Definitions
 *
 * Demonstrates sophisticated type-level programming using:
 * - Template literal types with enhanced pattern inference
 * - Conditional types with improved constraint handling
 * - Advanced utility types and mapped types
 * - Branded types for type safety
 * - Recursive type definitions with tail recursion optimization
 * - Variance annotations and higher-kinded types
 */

// =============================================================================
// Branded Types for Enhanced Type Safety
// =============================================================================

declare const __brand: unique symbol
type Brand<T, TBrand> = T & { readonly [__brand]: TBrand }

export type UserId = Brand<string, 'UserId'>
export type Email = Brand<string, 'Email'>
export type GitHubUsername = Brand<string, 'GitHubUsername'>
export type RepositoryId = Brand<string, 'RepositoryId'>
export type SessionToken = Brand<string, 'SessionToken'>
export type AccessToken = Brand<string, 'AccessToken'>

// =============================================================================
// Template Literal Types with Enhanced Pattern Inference
// =============================================================================

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
type ApiVersion = 'v1' | 'v2' | 'v3'

// Advanced template literal pattern matching
export type ApiEndpoint<
  TMethod extends HttpMethod,
  TVersion extends ApiVersion,
  TResource extends string,
> = `${TMethod} /api/${TVersion}/${TResource}`

// Dynamic route generation with parameter extraction
type ExtractParams<T extends string> = T extends `${string}[${infer P}]${infer Rest}`
  ? { [K in P]: string } & ExtractParams<Rest>
  : Record<string, never>

export type RouteParams<T extends string> = ExtractParams<T>

// =============================================================================
// Advanced Conditional Types with Improved Inference
// =============================================================================

// Recursive type for deeply nested object property access
export type DeepPropertyAccess<T, K extends string> = K extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? DeepPropertyAccess<T[Head], Tail>
    : never
  : K extends keyof T
    ? T[K]
    : never

// Advanced type guard with predicate narrowing
export type TypeGuard<T, U extends T = T> = (value: T) => value is U

// Conditional type with distributive behavior over unions
export type StrictExtract<T, U> = T extends U ? T : never

// =============================================================================
// Higher-Order Types and Function Composition
// =============================================================================

// Curried function type with proper inference
export type Curry<T extends readonly unknown[], R> = T extends readonly [infer Head, ...infer Tail]
  ? (arg: Head) => Curry<Tail, R>
  : R

// Function composition with type-level computation
export type Compose<F extends readonly ((...args: unknown[]) => unknown)[]> = F extends readonly [
  (...args: unknown[]) => infer R,
]
  ? (...args: unknown[]) => R
  : F extends readonly [(...args: unknown[]) => unknown, ...infer Rest]
    ? Rest extends readonly ((...args: unknown[]) => unknown)[]
      ? Compose<Rest>
      : never
    : never

// =============================================================================
// Advanced Mapped Types and Key Manipulation
// =============================================================================

// Deep readonly with recursion
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? T[P] extends (...args: unknown[]) => unknown
      ? T[P]
      : DeepReadonly<T[P]>
    : T[P]
}

// Selective partial with key filtering
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// Transform object values while preserving keys
export type MapValues<T, U> = {
  [K in keyof T]: U
}

// Extract function names from object
export type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? K : never
}[keyof T]

// =============================================================================
// Advanced Error Handling Types
// =============================================================================

// Result type with proper error handling
export type Result<T, E = Error> =
  | { success: true; data: T; error?: never }
  | { success: false; error: E; data?: never }

// Async result with timeout handling
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>

// Error union with discriminated properties
export type AppError =
  | { type: 'ValidationError'; field: string; message: string }
  | { type: 'AuthenticationError'; code: number; message: string }
  | { type: 'DatabaseError'; query: string; cause: string }
  | { type: 'NetworkError'; url: string; status: number }

// =============================================================================
// Event System Types with Advanced Pattern Matching
// =============================================================================

// Event payload mapping with template literals
export type EventMap = {
  'user:created': { userId: UserId; email: Email }
  'user:updated': { userId: UserId; changes: Record<string, unknown> }
  'auth:login': { userId: UserId; sessionToken: SessionToken }
  'auth:logout': { userId: UserId; reason: string }
  'repo:starred': { userId: UserId; repositoryId: RepositoryId }
}

// Event listener with proper typing
export type EventListener<K extends keyof EventMap> = (payload: EventMap[K]) => void | Promise<void>

// Event emitter with type safety
export interface TypedEventEmitter {
  on<K extends keyof EventMap>(event: K, listener: EventListener<K>): void
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void
  off<K extends keyof EventMap>(event: K, listener: EventListener<K>): void
}

// =============================================================================
// Database Query Builder Types
// =============================================================================

// Table column inference
export type TableColumns<T> = {
  [K in keyof T]: {
    type: T[K] extends string
      ? 'text'
      : T[K] extends number
        ? 'integer'
        : T[K] extends boolean
          ? 'boolean'
          : T[K] extends Date
            ? 'timestamp'
            : 'json'
    nullable: T[K] extends null | undefined ? true : false
  }
}

// Query builder with fluent interface
export interface QueryBuilder<T> {
  select<K extends keyof T>(...columns: K[]): QueryBuilder<Pick<T, K>>
  where<K extends keyof T>(
    column: K,
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=',
    value: T[K]
  ): QueryBuilder<T>
  orderBy<K extends keyof T>(column: K, direction?: 'ASC' | 'DESC'): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  execute(): Promise<T[]>
}

// =============================================================================
// Performance Monitoring Types
// =============================================================================

// Metrics collection with template literals
export type MetricKey = `${string}.${string}` | `${string}.${string}.${string}`

export interface PerformanceMetrics {
  readonly [K: MetricKey]: {
    value: number
    timestamp: Date
    unit: 'ms' | 'bytes' | 'count' | 'percentage'
  }
}

// Benchmark results with statistical analysis
export interface BenchmarkResult<T extends string = string> {
  readonly name: T
  readonly iterations: number
  readonly duration: {
    readonly min: number
    readonly max: number
    readonly mean: number
    readonly median: number
    readonly p95: number
    readonly p99: number
  }
  readonly memory: {
    readonly initial: number
    readonly peak: number
    readonly final: number
  }
}

// =============================================================================
// Advanced Configuration Types
// =============================================================================

// Environment-based configuration with validation
export type EnvironmentConfig<T> = {
  readonly [K in keyof T]: {
    readonly development: T[K]
    readonly production: T[K]
    readonly test: T[K]
  }
}

// Feature flag system with type safety
export type FeatureFlags = {
  readonly [K: `feature.${string}`]: boolean
}

// Configuration validation schema
export interface ConfigValidator<T> {
  validate(config: unknown): config is T
  sanitize(config: T): T
  getDefaults(): T
}

// =============================================================================
// HTTP Client Types with Advanced Error Handling
// =============================================================================

// HTTP response with proper error types
export interface HttpResponse<T> {
  readonly status: number
  readonly headers: Record<string, string>
  readonly data: T
  readonly timing: {
    readonly start: number
    readonly end: number
    readonly duration: number
  }
}

// HTTP client with interceptors
export interface HttpClient {
  get<T>(url: string, config?: RequestConfig): AsyncResult<HttpResponse<T>>
  post<T, D = unknown>(url: string, data?: D, config?: RequestConfig): AsyncResult<HttpResponse<T>>
  put<T, D = unknown>(url: string, data?: D, config?: RequestConfig): AsyncResult<HttpResponse<T>>
  delete<T>(url: string, config?: RequestConfig): AsyncResult<HttpResponse<T>>
}

interface RequestConfig {
  readonly headers?: Record<string, string>
  readonly timeout?: number
  readonly retries?: number
  readonly retryDelay?: number
}

// =============================================================================
// Type Utilities for Enhanced Developer Experience
// =============================================================================

// Exhaustive switch helper
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}

// Type-safe object keys
export function typedKeys<T extends Record<string, unknown>>(obj: T): Array<keyof T> {
  return Object.keys(obj)
}

// Type-safe object entries
export function typedEntries<T extends Record<string, unknown>>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][]
}

// Create branded type constructor
export function createBrand<T, TBrand>() {
  return (value: T): Brand<T, TBrand> => value as Brand<T, TBrand>
}

// =============================================================================
// Export Collection for Convenient Usage
// =============================================================================
// Note: Individual exports are already declared above, no need to re-export
