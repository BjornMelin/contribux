/**
 * PGlite Type Definitions
 *
 * Enhanced type definitions for PGlite integration
 * to provide type safety for database operations
 */

import type { PGlite } from '@electric-sql/pglite'

/**
 * PGlite Query Result Row
 */
export type PGliteRow = Record<string, unknown>

/**
 * PGlite Query Result
 */
export interface PGliteResult<T = PGliteRow> {
  rows: T[]
  affectedRows?: number
  fields: Array<{
    name: string
    dataTypeID: number
  }>
}

/**
 * Query parameters that can be safely passed to PGlite
 */
export type QueryParameter =
  | string
  | number
  | boolean
  | null
  | Date
  | Buffer
  | Array<string | number | boolean | null>
  | Record<string, unknown>

/**
 * Template literal query function parameters
 */
export type TemplateQueryValues = readonly QueryParameter[]

/**
 * Neon-compatible query function signature
 */
export interface NeonCompatibleQueryFunction<T = PGliteRow> {
  (strings: TemplateStringsArray, ...values: TemplateQueryValues): Promise<T[]>
  query?: (text: string, params?: QueryParameter[]) => Promise<PGliteResult<T>>
}

/**
 * Enhanced PGlite client with better type safety
 */
export interface TypedPGliteClient extends PGlite {
  /**
   * Execute a typed query with parameters
   */
  typedQuery<T = PGliteRow>(query: string, params?: QueryParameter[]): Promise<PGliteResult<T>>

  /**
   * Execute a transaction with multiple queries
   */
  typedTransaction<T = unknown>(queries: string[], params?: QueryParameter[][]): Promise<T>
}

/**
 * Test data factory return type
 */
export interface TestDataFactory {
  getItems(): Promise<PGliteRow[]>
  getItemById(id: number): Promise<PGliteRow[]>
  searchBySimilarity(embedding: number[]): Promise<PGliteRow[]>
}

/**
 * Performance measurement result
 */
export interface PerformanceMeasurement<T = unknown> {
  result: T
  duration: number
}

/**
 * Benchmark query definition
 */
export interface BenchmarkQuery {
  name: string
  fn: () => Promise<unknown>
}

/**
 * Performance benchmark results
 */
export interface BenchmarkResults {
  queryName: string
  iterations: number
  average: number
  minimum: number
  maximum: number
  standardDeviation: number
}

/**
 * Type guard to check if a value is a valid query parameter
 */
export function isValidQueryParameter(value: unknown): value is QueryParameter {
  if (value === null) return true

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return true
  }

  if (value instanceof Date || Buffer.isBuffer(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(
      item =>
        item === null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
    )
  }

  if (type === 'object' && value !== null && value !== undefined) {
    return Object.values(value).every(val => isValidQueryParameter(val))
  }

  return false
}

/**
 * Type guard for PGlite result
 */
export function isPGliteResult(value: unknown): value is PGliteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'rows' in value &&
    'fields' in value &&
    Array.isArray((value as Record<string, unknown>).rows) &&
    Array.isArray((value as Record<string, unknown>).fields)
  )
}

/**
 * Utility type for extracting row type from query result
 */
export type ExtractRowType<T> = T extends PGliteResult<infer R> ? R : PGliteRow

/**
 * Common test table schema types
 */
export interface TestTableRow {
  id: number
  name: string
  data: Record<string, unknown>
  embedding: number[]
  created_at: Date
}

/**
 * Vector similarity search result
 */
export interface VectorSearchResult extends TestTableRow {
  distance: number
}
