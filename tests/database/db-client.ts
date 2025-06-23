/**
 * Database client utility for tests with proper TypeScript support
 * Provides a unified interface for PostgreSQL and Neon databases
 */

import { type NeonQueryFunction, neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { Client } from 'pg'

// Load test environment variables
config({ path: '.env.test' })

// Database connection configuration
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for database tests. Check .env.test file.')
}

// TypeScript type assertion after the check
const VALIDATED_TEST_DATABASE_URL = TEST_DATABASE_URL

// Type definitions for query results
export interface QueryRow {
  [key: string]: unknown
}

export interface ExecuteSqlOptions {
  client?: Client
  logQuery?: boolean
}

/**
 * Execute SQL queries with proper parameter handling
 * Supports both local PostgreSQL and Neon databases
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

  if (
    VALIDATED_TEST_DATABASE_URL.includes('localhost') ||
    VALIDATED_TEST_DATABASE_URL.includes('127.0.0.1')
  ) {
    // Use pg driver for local PostgreSQL
    const client = new Client({ connectionString: VALIDATED_TEST_DATABASE_URL })
    try {
      await client.connect()
      const result = await client.query<T>(query, params)
      return result.rows
    } finally {
      await client.end()
    }
  } else {
    // Use neon driver for Neon databases
    const sql = neon(VALIDATED_TEST_DATABASE_URL)

    // Neon expects values to be passed in the template literal directly
    // Build a query function that properly handles parameters
    const results = await executeNeonQuery(sql, query, params)
    return results as T[]
  }
}

/**
 * Execute a query using Neon's template literal syntax
 */
async function executeNeonQuery(
  sql: NeonQueryFunction<false, false>,
  query: string,
  params: unknown[]
): Promise<QueryRow[]> {
  if (params.length === 0) {
    // No parameters, execute directly
    const queryFn = new Function('sql', `return sql\`${query}\``)
    return await queryFn(sql)
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
  return await queryFn(sql, params)
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
 * Automatically handles vector formatting and parameter substitution
 */
export const sql: SqlTemplateFunction = async function sql<T extends QueryRow = QueryRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  // Build the query with placeholders
  let query = strings[0] || ''
  const params: unknown[] = []

  for (let i = 0; i < values.length; i++) {
    const value = values[i]

    // Check if value is a vector (array of numbers with length 1536)
    if (Array.isArray(value) && value.length === 1536 && value.every(v => typeof v === 'number')) {
      params.push(formatVector(value))
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
      // Other numeric arrays - format as PostgreSQL array
      params.push(`{${value.join(',')}}`)
    } else {
      params.push(value)
    }

    query += `$${i + 1}${strings[i + 1] || ''}`
  }

  return executeSql<T>(query, params)
}

/**
 * Create a persistent client for tests that need transactions
 * Only supports local PostgreSQL
 */
export function createTestClient(): Client {
  if (
    VALIDATED_TEST_DATABASE_URL.includes('localhost') ||
    VALIDATED_TEST_DATABASE_URL.includes('127.0.0.1')
  ) {
    return new Client({ connectionString: VALIDATED_TEST_DATABASE_URL })
  }
  throw new Error(
    'Persistent client not supported for Neon databases in tests. Use executeSql for individual queries.'
  )
}

/**
 * Transaction helper for test scenarios
 */
export async function withTransaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (
    !VALIDATED_TEST_DATABASE_URL.includes('localhost') &&
    !VALIDATED_TEST_DATABASE_URL.includes('127.0.0.1')
  ) {
    throw new Error('Transactions are only supported for local PostgreSQL in tests')
  }

  const client = createTestClient()

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
 */
export function isLocalPostgres(): boolean {
  return (
    VALIDATED_TEST_DATABASE_URL.includes('localhost') ||
    VALIDATED_TEST_DATABASE_URL.includes('127.0.0.1')
  )
}

/**
 * Type guard for checking query results
 */
export function hasRows<T extends QueryRow>(result: unknown): result is { rows: T[] } {
  return result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)
}

export type { NeonQueryFunction } from '@neondatabase/serverless'
// Export types for use in tests
export type { Client, QueryResult } from 'pg'
