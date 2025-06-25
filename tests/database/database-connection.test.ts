/**
 * Database Connection Test
 *
 * Tests the basic database connection functionality without complex imports
 */

import { describe, expect, it } from 'vitest'

describe('Database Connection Infrastructure', () => {
  it('should default to pglite strategy for tests', () => {
    // The strategy should default to pglite even if env var is not set
    const strategy = process.env.TEST_DB_STRATEGY || 'pglite'
    expect(strategy).toBe('pglite')
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('should have NODE_ENV set to test', () => {
    expect(process.env.NODE_ENV).toBe('test')
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
