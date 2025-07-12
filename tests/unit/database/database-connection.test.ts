/**
 * Database Connection Test
 *
 * Tests the basic database connection functionality without complex imports
 */

import { describe, expect, it } from 'vitest'

// Helper function to resolve the actual strategy used by the test database manager
function resolveTestDatabaseStrategy(): string {
  const envStrategy = process.env.TEST_DB_STRATEGY

  if (envStrategy) {
    // Map legacy values to current strategy names (same logic as TestDatabaseManager)
    if (envStrategy === 'postgres' || envStrategy === 'local') {
      // For tests, prefer in-memory testing with PGlite
      return process.env.NODE_ENV === 'test' ? 'pglite' : 'neon-transaction'
    }
    if (envStrategy === 'neon') {
      // Map 'neon' to appropriate strategy based on environment
      return process.env.NODE_ENV === 'test' ? 'pglite' : 'neon-transaction'
    }
    return envStrategy
  }

  // Default to pglite for tests
  return 'pglite'
}

describe.skip('Database Connection Infrastructure', () => {
  it('should resolve to pglite strategy for tests', () => {
    // The strategy should resolve to pglite even if env var is set to legacy values
    const resolvedStrategy = resolveTestDatabaseStrategy()
    expect(resolvedStrategy).toBe('pglite')
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('should have NODE_ENV set to test', () => {
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('should correctly map legacy strategy names', () => {
    const originalStrategy = process.env.TEST_DB_STRATEGY
    const originalNodeEnv = process.env.NODE_ENV

    try {
      // Ensure we're in test environment
      process.env.NODE_ENV = 'test'

      // Test postgres -> pglite mapping
      process.env.TEST_DB_STRATEGY = 'postgres'
      expect(resolveTestDatabaseStrategy()).toBe('pglite')

      // Test local -> pglite mapping
      process.env.TEST_DB_STRATEGY = 'local'
      expect(resolveTestDatabaseStrategy()).toBe('pglite')

      // Test neon -> pglite mapping
      process.env.TEST_DB_STRATEGY = 'neon'
      expect(resolveTestDatabaseStrategy()).toBe('pglite')

      // Test direct pglite value
      process.env.TEST_DB_STRATEGY = 'pglite'
      expect(resolveTestDatabaseStrategy()).toBe('pglite')

      // Test mock strategy (should pass through)
      process.env.TEST_DB_STRATEGY = 'mock'
      expect(resolveTestDatabaseStrategy()).toBe('mock')
    } finally {
      // Restore original values
      process.env.TEST_DB_STRATEGY = originalStrategy
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('should load PGlite when needed', async () => {
    // Dynamic import to avoid resolution issues
    try {
      const { PGlite } = await import('@electric-sql/pglite')
      expect(PGlite).toBeDefined()
    } catch (error) {
      console.error('PGlite import failed:', error)
      throw error
    }
  })

  it('should create a basic PGlite instance', async () => {
    const { PGlite } = await import('@electric-sql/pglite')

    const db = new PGlite('memory://')
    expect(db).toBeDefined()

    // Test basic query
    const result = await db.query('SELECT 1 as test')
    expect(result.rows).toHaveLength(1)
    // Type guard for unknown query result
    const row = result.rows[0] as Record<string, unknown>
    expect(row.test).toBe(1)

    await db.close()
  })

  it('should create tables in PGlite', async () => {
    const { PGlite } = await import('@electric-sql/pglite')

    const db = new PGlite('memory://')

    // Create a simple test table
    await db.query(`
      CREATE TABLE test_table (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Insert test data
    await db.query(
      `
      INSERT INTO test_table (name) VALUES ($1)
    `,
      ['Test User']
    )

    // Query the data
    const result = await db.query('SELECT * FROM test_table')
    expect(result.rows).toHaveLength(1)
    // Type guard for unknown query result
    const row = result.rows[0] as Record<string, unknown>
    expect(row.name).toBe('Test User')
    expect(row.id).toBe(1)

    await db.close()
  })
})
