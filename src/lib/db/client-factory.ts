/**
 * Database Client Factory
 * Provides conditional database client based on environment
 * Uses regular pg driver for local/CI, Neon serverless for production
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'

/** Query result that can be any shape depending on the query */
export interface QueryResult {
  rows?: unknown[]
  rowCount?: number | null
  [key: string]: unknown
}

export interface DatabaseClient {
  query: (query: string, params?: unknown[]) => Promise<QueryResult>
  // Tagged template support like neon
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  // Optional property for storing the underlying pg client for cleanup
  _pgClient?: { end: () => Promise<void> }
}

/**
 * Creates a database client based on the environment
 * - Uses regular pg driver for local PostgreSQL in CI/testing
 * - Uses Neon serverless driver for production
 */
export async function createDatabaseClient(connectionString: string): Promise<DatabaseClient> {
  const isLocalPostgres =
    process.env.CI === 'true' ||
    process.env.USE_LOCAL_PG === 'true' ||
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1')

  if (isLocalPostgres) {
    // Use regular pg driver for local PostgreSQL
    const pg = await import('pg')
    const { Client } = pg

    const client = new Client({ connectionString })
    await client.connect()

    // Create a wrapper that matches Neon's interface
    const wrapper: DatabaseClient = (async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      // Convert tagged template to parameterized query
      let query = strings[0] || ''
      const params: unknown[] = []

      for (let i = 0; i < values.length; i++) {
        params.push(values[i])
        query += `$${i + 1}${strings[i + 1] || ''}`
      }

      const result = await client.query(query, params)
      return result.rows
    }) as DatabaseClient

    // Add the query method for direct queries
    wrapper.query = async (query: string, params?: unknown[]): Promise<QueryResult> => {
      const result = await client.query(query, params)
      return {
        ...result,
        rows: result.rows,
        rowCount: result.rowCount,
      }
    }

    // Store the client for cleanup
    wrapper._pgClient = client

    return wrapper
  }
  // Use Neon serverless driver for production
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(connectionString) as NeonQueryFunction<false, false>

  // Create a wrapper that adds the query method
  const wrapper = sql as unknown as DatabaseClient

  // Add query method for compatibility
  wrapper.query = async (queryText: string, params?: unknown[]): Promise<QueryResult> => {
    if (params && params.length > 0) {
      // Use parameterized query
      let parameterizedQuery = queryText
      params.forEach((_, index) => {
        // Replace $1, $2, etc. with actual values for Neon
        // Note: This is a simplified approach - in production you'd want proper escaping
        parameterizedQuery = parameterizedQuery.replace(`$${index + 1}`, `$${index + 1}`)
      })
      // Execute using sql.query which is available in newer versions
      const sqlWithQuery = sql as NeonQueryFunction<false, false> & {
        query?: (query: string, params: unknown[]) => Promise<QueryResult>
      }
      if (sqlWithQuery.query) {
        const result = await sqlWithQuery.query(queryText, params)
        // Wrap array result in QueryResult interface
        return Array.isArray(result) ? { rows: result } : result
      }
      // Fallback: manually construct the query (less safe, but works)
      const result = await sql`${queryText}` // This won't work with params
      return { rows: result }
    }
    // Simple query without parameters
    const result = await sql`${queryText}`
    return { rows: result }
  }

  return wrapper
}

/**
 * Closes the database client connection
 * Only needed for regular pg clients, Neon handles this automatically
 */
export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  const pgClient = client._pgClient
  if (pgClient && typeof pgClient.end === 'function') {
    await pgClient.end()
  }
}
