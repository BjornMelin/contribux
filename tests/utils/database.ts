/**
 * Database test utilities
 * Provides database connection and query utilities for tests
 */

import { Pool, type PoolClient } from 'pg'

/**
 * Get test database URL based on environment configuration
 */
export function getTestDatabaseUrl(): string {
  // Priority order: TEST -> DEV -> Main
  const testUrl = process.env.DATABASE_URL_TEST
  const devUrl = process.env.DATABASE_URL_DEV
  const mainUrl = process.env.DATABASE_URL

  if (testUrl) {
    return testUrl
  }

  if (devUrl) {
    console.warn('Using DEV database URL for tests. Consider setting DATABASE_URL_TEST.')
    return devUrl
  }

  if (mainUrl) {
    console.warn('Using main database URL for tests. This is not recommended for production.')
    return mainUrl
  }

  throw new Error(
    'No database URL found. Please set DATABASE_URL_TEST, DATABASE_URL_DEV, or DATABASE_URL environment variable.'
  )
}

/**
 * Create a test database pool with proper configuration
 */
export function createTestPool(): Pool {
  const connectionString = getTestDatabaseUrl()

  return new Pool({
    connectionString,
    // Test-specific pool configuration
    min: 1,
    max: 5,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
    // Use SSL in production-like environments
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  })
}

/**
 * SQL template literal function for type-safe queries
 */
export async function sql<T = unknown>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const pool = createTestPool()

  try {
    // Build query string
    let query = ''
    for (let i = 0; i < strings.length; i++) {
      query += strings[i]
      if (i < values.length) {
        query += `$${i + 1}`
      }
    }

    const result = await pool.query(query, values)
    return result.rows
  } finally {
    await pool.end()
  }
}

/**
 * Execute SQL with parameters
 */
export async function executeSql<T = unknown>(query: string, params: unknown[] = []): Promise<T[]> {
  const pool = createTestPool()

  try {
    const result = await pool.query(query, params)
    return result.rows
  } finally {
    await pool.end()
  }
}

/**
 * Format vector array for PostgreSQL halfvec type
 */
export function formatVector(vector: number[]): string {
  if (!Array.isArray(vector)) {
    throw new TypeError('Vector must be an array')
  }
  if (vector.length !== 1536) {
    throw new Error('Vector must have exactly 1536 dimensions')
  }
  return `[${vector.join(',')}]`
}

/**
 * Format vector parameter for SQL queries
 */
export function formatVectorParam(vector: number[]): string {
  return formatVector(vector)
}

/**
 * Type for generic query result row
 */
export interface QueryRow {
  [key: string]: unknown
}

/**
 * Test database connection helper
 */
export class TestDatabaseHelper {
  private pool: Pool

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || getTestDatabaseUrl(),
      min: 1,
      max: 3,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 5000,
    })
  }

  async query<T extends QueryRow = QueryRow>(text: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(text, params)
    return result.rows
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect()
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as test')
      return true
    } catch (error) {
      console.error('Database connection test failed:', error)
      return false
    }
  }

  async setupTestData(): Promise<void> {
    // Create test data for search functions if needed
    // This would typically be handled by migrations or seed data
  }

  async cleanupTestData(): Promise<void> {
    // Clean up any test-specific data
    // Be careful not to truncate important tables
  }
}
