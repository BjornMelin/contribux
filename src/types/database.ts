/**
 * Database Type Definitions
 *
 * Enhanced PostgreSQL type mappings with strict TypeScript compliance.
 * Provides comprehensive type safety for database operations with proper
 * null handling and exactOptionalPropertyTypes support.
 */

import { z } from 'zod'
import type { UUID } from './base'
import { UUIDSchema } from './base'

// ==================== POSTGRESQL TYPE MAPPINGS ====================

/**
 * PostgreSQL data types mapped to TypeScript types
 */
export const PostgreSQLType = {
  // Numeric types
  SMALLINT: 'smallint',
  INTEGER: 'integer',
  BIGINT: 'bigint',
  DECIMAL: 'decimal',
  NUMERIC: 'numeric',
  REAL: 'real',
  DOUBLE_PRECISION: 'double precision',
  SMALLSERIAL: 'smallserial',
  SERIAL: 'serial',
  BIGSERIAL: 'bigserial',

  // Character types
  CHARACTER: 'character',
  VARCHAR: 'character varying',
  TEXT: 'text',

  // Binary types
  BYTEA: 'bytea',

  // Date/time types
  TIMESTAMP: 'timestamp without time zone',
  TIMESTAMPTZ: 'timestamp with time zone',
  DATE: 'date',
  TIME: 'time without time zone',
  TIMETZ: 'time with time zone',
  INTERVAL: 'interval',

  // Boolean type
  BOOLEAN: 'boolean',

  // UUID type
  UUID: 'uuid',

  // JSON types
  JSON: 'json',
  JSONB: 'jsonb',

  // Array types
  ARRAY: 'ARRAY',

  // Vector type (pgvector extension)
  VECTOR: 'vector',
  HALFVEC: 'halfvec',

  // Network types
  INET: 'inet',
  CIDR: 'cidr',
  MACADDR: 'macaddr',
} as const

export type PostgreSQLType = (typeof PostgreSQLType)[keyof typeof PostgreSQLType]

export const PostgreSQLTypeSchema = z.nativeEnum(PostgreSQLType)

/**
 * Enhanced database column metadata
 */
export interface DatabaseColumn {
  readonly columnName: string
  readonly dataType: PostgreSQLType
  readonly isNullable: boolean
  readonly columnDefault?: string
  readonly characterMaximumLength?: number
  readonly numericPrecision?: number
  readonly numericScale?: number
  readonly udtName: string
  readonly isArray: boolean
  readonly arrayDimensions?: number
}

/**
 * Zod schema for database column validation
 */
export const DatabaseColumnSchema = z.object({
  columnName: z.string().min(1),
  dataType: PostgreSQLTypeSchema,
  isNullable: z.boolean(),
  columnDefault: z.string().optional(),
  characterMaximumLength: z.number().int().positive().optional(),
  numericPrecision: z.number().int().positive().optional(),
  numericScale: z.number().int().min(0).optional(),
  udtName: z.string().min(1),
  isArray: z.boolean(),
  arrayDimensions: z.number().int().positive().optional(),
})

/**
 * Database table metadata
 */
export interface DatabaseTable {
  readonly tableName: string
  readonly tableSchema: string
  readonly tableType: 'BASE TABLE' | 'VIEW' | 'MATERIALIZED VIEW' | 'FOREIGN TABLE'
  readonly estimatedRows?: number
  readonly tableSize?: number // in bytes
  readonly indexSize?: number // in bytes
}

/**
 * Zod schema for database table validation
 */
export const DatabaseTableSchema = z.object({
  tableName: z.string().min(1),
  tableSchema: z.string().min(1),
  tableType: z.enum(['BASE TABLE', 'VIEW', 'MATERIALIZED VIEW', 'FOREIGN TABLE']),
  estimatedRows: z.number().int().min(0).optional(),
  tableSize: z.number().int().min(0).optional(),
  indexSize: z.number().int().min(0).optional(),
})

// ==================== QUERY RESULT TYPES ====================

/**
 * Generic query result interface
 */
export interface QueryResult<T = unknown> {
  readonly rows: readonly T[]
  readonly rowCount: number
  readonly command?: string
  readonly oid?: number
  readonly fields?: readonly QueryResultField[]
}

/**
 * Query result field metadata
 */
export interface QueryResultField {
  readonly name: string
  readonly tableID: number
  readonly columnID: number
  readonly dataTypeID: number
  readonly dataTypeSize: number
  readonly dataTypeModifier: number
  readonly format: 'text' | 'binary'
}

/**
 * Zod schema for query result validation
 */
export const QueryResultSchema = <T>(rowSchema: z.ZodType<T>) =>
  z.object({
    rows: z.array(rowSchema),
    rowCount: z.number().int().min(0),
    command: z.string().optional(),
    oid: z.number().int().optional(),
    fields: z
      .array(
        z.object({
          name: z.string(),
          tableID: z.number().int(),
          columnID: z.number().int(),
          dataTypeID: z.number().int(),
          dataTypeSize: z.number().int(),
          dataTypeModifier: z.number().int(),
          format: z.enum(['text', 'binary']),
        })
      )
      .optional(),
  })

// ==================== DATABASE CLIENT INTERFACES ====================

/**
 * Connection configuration for PostgreSQL
 */
export interface DatabaseConfig {
  readonly host: string
  readonly port: number
  readonly database: string
  readonly username: string
  readonly password: string
  readonly ssl: boolean | 'require' | 'prefer' | 'allow'
  readonly connectionTimeoutMs: number
  readonly idleTimeoutMs: number
  readonly maxConnections: number
  readonly minConnections: number
}

/**
 * Zod schema for database configuration validation
 */
export const DatabaseConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().max(65535),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.union([z.boolean(), z.enum(['require', 'prefer', 'allow'])]),
  connectionTimeoutMs: z.number().int().positive(),
  idleTimeoutMs: z.number().int().positive(),
  maxConnections: z.number().int().positive().max(100),
  minConnections: z.number().int().min(0),
})

/**
 * Enhanced SQL function interface with proper typing
 */
export interface SQLFunction {
  <T = unknown>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<QueryResult<T>>

  // Client management (for testing)
  readonly client?: DatabaseClient

  // Mock methods for testing
  mockImplementation?: (
    fn: (
      strings: TemplateStringsArray,
      ...values: readonly unknown[]
    ) => Promise<QueryResult<unknown>>
  ) => void
  mockResolvedValueOnce?: <T>(value: QueryResult<T>) => SQLFunction
}

/**
 * Database client interface
 */
export interface DatabaseClient {
  connect(): Promise<void>
  query<T = unknown>(query: string, values?: readonly unknown[]): Promise<QueryResult<T>>
  end(): Promise<void>
  readonly isConnected: boolean
}

/**
 * Transaction interface
 */
export interface DatabaseTransaction {
  query<T = unknown>(query: string, values?: readonly unknown[]): Promise<QueryResult<T>>
  commit(): Promise<void>
  rollback(): Promise<void>
  readonly isActive: boolean
}

// ==================== DATABASE PERFORMANCE & MONITORING ====================

/**
 * Database connection pool statistics
 */
export interface ConnectionPoolStats {
  readonly totalConnections: number
  readonly idleConnections: number
  readonly activeConnections: number
  readonly waitingCount: number
  readonly maxConnections: number
  readonly minConnections: number
}

/**
 * Query performance metrics
 */
export interface QueryMetrics {
  readonly queryId: UUID
  readonly query: string
  readonly executionTime: number // milliseconds
  readonly planningTime: number // milliseconds
  readonly rowsReturned: number
  readonly rowsExamined: number
  readonly indexesUsed: readonly string[]
  readonly executedAt: Date
}

/**
 * Database health check result
 */
export interface DatabaseHealthCheck {
  readonly isHealthy: boolean
  readonly latency: number // milliseconds
  readonly activeConnections: number
  readonly version: string
  readonly lastCheck: Date
  readonly errors: readonly string[]
}

/**
 * Zod schemas for monitoring types
 */
export const ConnectionPoolStatsSchema = z.object({
  totalConnections: z.number().int().min(0),
  idleConnections: z.number().int().min(0),
  activeConnections: z.number().int().min(0),
  waitingCount: z.number().int().min(0),
  maxConnections: z.number().int().positive(),
  minConnections: z.number().int().min(0),
})

export const QueryMetricsSchema = z.object({
  queryId: UUIDSchema,
  query: z.string().min(1),
  executionTime: z.number().min(0),
  planningTime: z.number().min(0),
  rowsReturned: z.number().int().min(0),
  rowsExamined: z.number().int().min(0),
  indexesUsed: z.array(z.string()),
  executedAt: z.date(),
})

export const DatabaseHealthCheckSchema = z.object({
  isHealthy: z.boolean(),
  latency: z.number().min(0),
  activeConnections: z.number().int().min(0),
  version: z.string().min(1),
  lastCheck: z.date(),
  errors: z.array(z.string()),
})

// ==================== VECTOR SEARCH TYPES ====================

/**
 * Vector embedding for semantic search
 */
export interface VectorEmbedding {
  readonly id: UUID
  readonly vector: readonly number[]
  readonly dimensions: number
  readonly metadata?: Record<string, unknown>
}

/**
 * Vector search query
 */
export interface VectorSearchQuery {
  readonly vector: readonly number[]
  readonly limit: number
  readonly threshold: number // similarity threshold (0-1)
  readonly includeMetadata: boolean
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  readonly id: UUID
  readonly score: number // similarity score (0-1)
  readonly metadata?: Record<string, unknown>
}

/**
 * Zod schemas for vector types
 */
export const VectorEmbeddingSchema = z.object({
  id: UUIDSchema,
  vector: z.array(z.number()),
  dimensions: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
})

export const VectorSearchQuerySchema = z.object({
  vector: z.array(z.number()),
  limit: z.number().int().positive().max(1000),
  threshold: z.number().min(0).max(1),
  includeMetadata: z.boolean(),
})

export const VectorSearchResultSchema = z.object({
  id: UUIDSchema,
  score: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
})

// ==================== DATABASE ERROR TYPES ====================

/**
 * Database error codes (PostgreSQL)
 */
export const DatabaseErrorCode = {
  // Connection errors
  CONNECTION_FAILURE: '08000',
  CONNECTION_EXCEPTION: '08003',
  CONNECTION_DOES_NOT_EXIST: '08003',

  // Authentication errors
  INVALID_AUTHORIZATION_SPECIFICATION: '28000',
  INVALID_PASSWORD: '28P01',

  // Constraint violations
  INTEGRITY_CONSTRAINT_VIOLATION: '23000',
  NOT_NULL_VIOLATION: '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',

  // Data exceptions
  DATA_EXCEPTION: '22000',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  DIVISION_BY_ZERO: '22012',
  INVALID_TEXT_REPRESENTATION: '22P02',

  // Transaction errors
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',

  // System errors
  SYSTEM_ERROR: 'XX000',
  OUT_OF_MEMORY: 'XX001',
  DISK_FULL: 'XX002',
} as const

export type DatabaseErrorCode = (typeof DatabaseErrorCode)[keyof typeof DatabaseErrorCode]

export const DatabaseErrorCodeSchema = z.nativeEnum(DatabaseErrorCode)

/**
 * Enhanced database error interface
 */
export interface DatabaseError extends Error {
  readonly code: DatabaseErrorCode
  readonly detail: string | undefined
  readonly hint: string | undefined
  readonly position: string | undefined
  readonly internalPosition: string | undefined
  readonly internalQuery: string | undefined
  readonly where: string | undefined
  readonly schema: string | undefined
  readonly table: string | undefined
  readonly column: string | undefined
  readonly dataType: string | undefined
  readonly constraint: string | undefined
  readonly file: string | undefined
  readonly line: string | undefined
  readonly routine: string | undefined
}

// ==================== MIGRATION TYPES ====================

/**
 * Database migration metadata
 */
export interface Migration {
  readonly id: UUID
  readonly version: string
  readonly name: string
  readonly up: string // SQL for applying migration
  readonly down: string // SQL for reverting migration
  readonly checksum: string
  readonly appliedAt: Date | undefined
  readonly executionTime: number | undefined // milliseconds
}

/**
 * Migration status
 */
export const MigrationStatus = {
  PENDING: 'pending',
  APPLIED: 'applied',
  FAILED: 'failed',
  REVERTED: 'reverted',
} as const

export type MigrationStatus = (typeof MigrationStatus)[keyof typeof MigrationStatus]

export const MigrationStatusSchema = z.nativeEnum(MigrationStatus)

/**
 * Zod schema for migration validation
 */
export const MigrationSchema = z.object({
  id: UUIDSchema,
  version: z.string().min(1),
  name: z.string().min(1),
  up: z.string().min(1),
  down: z.string().min(1),
  checksum: z.string().min(1),
  appliedAt: z.date().optional(),
  executionTime: z.number().int().min(0).optional(),
})

// ==================== TYPE UTILITIES ====================

/**
 * Utility type for database row with timestamps
 */
export type DatabaseRow<T> = T & {
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Utility type for insertable database row (without generated fields)
 */
export type InsertableRow<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Utility type for updatable database row
 */
export type UpdatableRow<T> = Partial<Omit<T, 'id' | 'createdAt'>> & {
  readonly updatedAt: Date
}

/**
 * Type guard for checking if a value is a valid UUID
 */
export const isValidUUID = (value: unknown): value is UUID => {
  return typeof value === 'string' && UUIDSchema.safeParse(value).success
}

/**
 * Type guard for checking if a value is a valid date
 */
export const isValidDate = (value: unknown): value is Date => {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Branded type for SQL queries to prevent injection
 */
export type SafeSQL = string & { readonly __brand: 'SafeSQL' }

/**
 * Create a safe SQL string (should only be used with validated/sanitized SQL)
 */
export const createSafeSQL = (sql: string): SafeSQL => sql as SafeSQL
