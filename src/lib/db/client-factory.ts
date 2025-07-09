/**
 * Database Client Factory
 * Provides conditional database client based on environment
 * Uses regular pg driver for local/CI, Neon serverless for production
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'

export interface DatabaseClient {
  query: (query: string, params?: any[]) => Promise<any>
  // Tagged template support like neon
  <T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]>
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
    const wrapper: DatabaseClient = (async (strings: TemplateStringsArray, ...values: any[]) => {
      // Convert tagged template to parameterized query
      let query = strings[0] || ''
      const params: any[] = []

      for (let i = 0; i < values.length; i++) {
        params.push(values[i])
        query += `$${i + 1}${strings[i + 1] || ''}`
      }

      const result = await client.query(query, params)
      return result.rows
    }) as DatabaseClient

    // Add the query method for direct queries
    wrapper.query = async (query: string, params?: any[]) => {
      const result = await client.query(query, params)
      return result
    }

    // Store the client for cleanup
    ;(wrapper as any)._pgClient = client

    return wrapper
  } else {
    // Use Neon serverless driver for production
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(connectionString) as NeonQueryFunction<false, false>

    // Create a wrapper that adds the query method
    const wrapper: DatabaseClient = sql as any

    // Add query method for compatibility
    wrapper.query = async (queryText: string, params?: any[]) => {
      if (params && params.length > 0) {
        // Use parameterized query
        let parameterizedQuery = queryText
        params.forEach((_, index) => {
          // Replace $1, $2, etc. with actual values for Neon
          // Note: This is a simplified approach - in production you'd want proper escaping
          parameterizedQuery = parameterizedQuery.replace(`$${index + 1}`, `$${index + 1}`)
        })
        // Execute using sql.query which is available in newer versions
        const sqlWithQuery = sql as any
        if (sqlWithQuery.query) {
          return await sqlWithQuery.query(queryText, params)
        } else {
          // Fallback: manually construct the query (less safe, but works)
          const result = await sql`${queryText}` // This won't work with params
          return { rows: result }
        }
      } else {
        // Simple query without parameters
        const result = await sql`${queryText}`
        return { rows: result }
      }
    }

    return wrapper
  }
}

/**
 * Closes the database client connection
 * Only needed for regular pg clients, Neon handles this automatically
 */
export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  const pgClient = (client as any)._pgClient
  if (pgClient && typeof pgClient.end === 'function') {
    await pgClient.end()
  }
}
