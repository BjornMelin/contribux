// Database connection tests
import { describe, expect, it } from 'vitest'

// Setup for database tests
import './setup'
import { TEST_DATABASE_URL, sql } from './db-client'

describe('Database Configuration', () => {
  describe('Connection URLs', () => {
    it('should have test database URL configured', () => {
      expect(TEST_DATABASE_URL).toBeDefined()
      expect(TEST_DATABASE_URL).toMatch(/postgresql:\/\//)
    })

    it('should point to a valid test database', () => {
      // Should work with either local PostgreSQL or Neon cloud database
      expect(TEST_DATABASE_URL).toMatch(/postgresql:\/\/.+/)
      // Database name should be present
      expect(TEST_DATABASE_URL).toMatch(/\/[a-zA-Z0-9_-]+(\.psql)?($|\?)/)
    })
  })

  describe('Environment Configuration', () => {
    it('should have test environment variables', () => {
      expect(process.env.NODE_ENV).toBe('test')
      // TEST_DATABASE_URL is already loaded from .env.test in db-client.ts
      expect(TEST_DATABASE_URL).toBeDefined()
    })

    it('should have vector search configuration', () => {
      // Use values from .env.test or defaults
      expect(process.env.VECTOR_SEARCH_EF_SEARCH || '200').toBe('200')
      expect(process.env.VECTOR_SIMILARITY_THRESHOLD || '0.7').toBe('0.7')
      expect(process.env.VECTOR_TEXT_WEIGHT || '0.3').toBe('0.3')
      expect(process.env.VECTOR_WEIGHT || '0.7').toBe('0.7')
    })

    it('should have database configuration', () => {
      // TEST_DATABASE_URL is already loaded from .env.test in db-client.ts
      expect(TEST_DATABASE_URL).toBeDefined()
      // Pool settings can have defaults
      const poolMin = process.env.DB_POOL_MIN || '2'
      const poolMax = process.env.DB_POOL_MAX || '20'
      const poolTimeout = process.env.DB_POOL_IDLE_TIMEOUT || '10000'

      expect(Number(poolMin)).toBeGreaterThanOrEqual(1)
      expect(Number(poolMax)).toBeGreaterThan(Number(poolMin))
      expect(Number(poolTimeout)).toBeGreaterThan(0)
    })
  })
})

describe('Database Connection', () => {
  it('should successfully connect to database', async () => {
    const result = await sql`SELECT 1 as test`
    expect(result).toHaveLength(1)
    expect((result as Array<{ test: number }>)[0]?.test).toBe(1)
  })

  it('should handle parameterized queries safely', async () => {
    const testValue = "test'injection"
    const result = await sql`SELECT ${testValue} as safe_param`
    expect((result as Array<{ safe_param: string }>)[0]?.safe_param).toBe(testValue)
  })

  it('should return database version', async () => {
    const result = await sql`SELECT version() as version`
    expect((result as Array<{ version: string }>)[0]?.version).toMatch(/PostgreSQL/)
  })
})
