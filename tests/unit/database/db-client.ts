/**
 * Database client utility for tests with proper TypeScript support
 * Provides a unified interface using TestDatabaseManager
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { Client } from 'pg'
import { TestDatabaseManager } from '../../src/lib/test-utils/test-database-manager'

// Load test environment variables
config({ path: '.env.test' })

// Get TestDatabaseManager instance
const dbManager = TestDatabaseManager.getInstance()

// Export test database URL for test utilities
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

// Type definitions for query results
export interface QueryRow {
  [key: string]: unknown
}

export interface ExecuteSqlOptions {
  client?: Client
  logQuery?: boolean
}

/**
 * Execute SQL queries using TestDatabaseManager
 * Automatically uses the appropriate strategy (PGlite vs Neon vs PostgreSQL)
 */
export async function executeSql<T extends QueryRow = QueryRow>(
  query: string,
  params: unknown[] = [],
  options?: ExecuteSqlOptions
): Promise<T[]> {
  const { client: providedClient, logQuery = false } = options || {}

  if (logQuery) {
    console.log('Executing query:', query)
    console.log('Parameters:', params)
  }

  if (providedClient) {
    // Use provided client (for transactions)
    const result = await providedClient.query<T>(query, params)
    return result.rows
  }

  // Get connection from TestDatabaseManager
  const connection = await dbManager.getConnection('db-client-test', {})

  // Execute query using the managed connection's sql function
  const results = await executeWithConnection(connection.sql, query, params)
  return results as T[]
}

/**
 * Execute a query using the managed connection
 */
async function executeWithConnection(
  connection: NeonQueryFunction<false, false>,
  query: string,
  params: unknown[]
): Promise<QueryRow[]> {
  if (params.length === 0) {
    // No parameters, execute directly
    const queryFn = new Function('sql', `return sql\`${query}\``)
    return await queryFn(connection)
  }

  // Replace placeholders with actual values in a type-safe way
  // Neon handles parameterization internally when using template literals
  let _paramIndex = 0
  const processedQuery = query.replace(/\$(\d+)/g, (match, num) => {
    const index = Number.parseInt(num) - 1
    if (index >= 0 && index < params.length) {
      _paramIndex = index
      return `\${params[${index}]}`
    }
    return match
  })

  // Create a function that executes the template literal with params in scope
  const queryFn = new Function('sql', 'params', `return sql\`${processedQuery}\``)
  return await queryFn(connection, params)
}

/**
 * Format arrays for PostgreSQL halfvec type
 */
export function formatVector(vector: number[]): string {
  if (!Array.isArray(vector)) {
    throw new TypeError('Vector must be an array')
  }
  if (vector.length !== 1536) {
    throw new Error('Vector must have exactly 1536 dimensions for halfvec')
  }
  return `[${vector.map(v => v.toString()).join(',')}]`
}

/**
 * Format vector for SQL parameters (handles both pg and neon)
 */
export function formatVectorParam(vector: number[]): string {
  return formatVector(vector)
}

// Overloaded sql function signatures for better TypeScript support
export type SqlTemplateFunction = <T extends QueryRow = QueryRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>

/**
 * Type-safe SQL template literal function
 * Automatically handles vector formatting and uses TestDatabaseManager
 */
export const sql: SqlTemplateFunction = async function sql<T extends QueryRow = QueryRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  // Get connection from TestDatabaseManager
  const connection = await dbManager.getConnection('sql-template-test', {})

  // Process values for special types (vectors, arrays)
  const processedValues = values.map(value => {
    // Check if value is a vector (array of numbers with length 1536)
    if (Array.isArray(value) && value.length === 1536 && value.every(v => typeof v === 'number')) {
      return formatVector(value)
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
      // Other numeric arrays - format as PostgreSQL array
      return `{${value.join(',')}}`
    }
    return value
  })

  // Use the managed connection's sql function with template literal syntax
  return (await connection.sql(strings, ...processedValues)) as T[]
}

/**
 * Create a persistent client for tests that need transactions
 * Uses TestDatabaseManager configuration
 */
export async function createTestClient(): Promise<Client> {
  // Get a connection to check the strategy
  const connection = await dbManager.getConnection('createTestClient-check', {})

  if (connection.strategy === 'neon-transaction' || connection.strategy === 'neon-branch') {
    // For Neon strategies, we can get the connection string from environment
    const connectionString = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('No database connection string available for PostgreSQL client')
    }
    return new Client({ connectionString })
  }

  throw new Error(
    `Persistent PostgreSQL client only supported for Neon strategies. Current strategy: ${connection.strategy}. Use sql template for PGlite.`
  )
}

/**
 * Transaction helper for test scenarios
 * Uses TestDatabaseManager to determine the appropriate strategy
 */
export async function withTransaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  // Get a connection to check the strategy
  const connection = await dbManager.getConnection('withTransaction-check', {})

  if (connection.strategy === 'pglite') {
    throw new Error(
      `Transactions are only supported for Neon strategies, current strategy: ${connection.strategy}`
    )
  }

  const client = await createTestClient()

  try {
    await client.connect()
    await client.query('BEGIN')

    try {
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

/**
 * Helper to check if using local PostgreSQL
 * Uses TestDatabaseManager to determine the strategy
 */
export async function isLocalPostgres(): Promise<boolean> {
  // Get a connection to check the strategy
  const connection = await dbManager.getConnection('isLocalPostgres-check', {})
  return connection.strategy !== 'pglite'
}

/**
 * Type guard for checking query results
 */
export function hasRows<T extends QueryRow>(result: unknown): result is { rows: T[] } {
  return !!(
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { rows?: unknown }).rows)
  )
}

export type { NeonQueryFunction } from '@neondatabase/serverless'
// Export types for use in tests
export type { Client, QueryResult } from 'pg'
