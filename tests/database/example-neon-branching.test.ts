/**
 * Example test demonstrating Neon branching for test isolation
 *
 * This shows how tests can run in completely isolated database branches,
 * ensuring no test pollution and perfect reproducibility.
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { beforeEach, describe, expect, it } from 'vitest'
import { getTestSqlClient, withTestSubBranch } from './neon-setup'

describe('Neon Branching Test Example', () => {
  let sql: NeonQueryFunction<false, false>

  beforeEach(() => {
    // Each test gets the test suite's branch
    sql = getTestSqlClient()
  })

  it('should create and query data in isolated branch', async () => {
    // Create a test table
    await sql`
      CREATE TABLE IF NOT EXISTS test_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Insert test data
    await sql`INSERT INTO test_items (name) VALUES ('Test Item 1')`
    await sql`INSERT INTO test_items (name) VALUES ('Test Item 2')`

    // Query the data
    const items = await sql`SELECT * FROM test_items ORDER BY id`

    expect(items).toHaveLength(2)
    // Type assertion for query results from Neon SQL
    const firstItem = items[0] as { name: string }
    const secondItem = items[1] as { name: string }
    expect(firstItem.name).toBe('Test Item 1')
    expect(secondItem.name).toBe('Test Item 2')
  })

  it('should not see data from other tests', async () => {
    // This test runs on a clean branch - no data from previous test
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'test_items'
    `

    // The table might exist (from schema) but should have no data
    if (tables.length > 0) {
      const items = await sql`SELECT * FROM test_items`
      expect(items).toHaveLength(0)
    }
  })

  it('should support sub-branches for complex test scenarios', async () => {
    // Create a sub-branch for this specific test scenario
    await withTestSubBranch('complex-scenario', async subBranchConnection => {
      const { neon } = await import('@neondatabase/serverless')
      const subSql = neon(subBranchConnection)

      // Create test data in the sub-branch
      await subSql`
        CREATE TABLE IF NOT EXISTS sub_branch_data (
          id SERIAL PRIMARY KEY,
          value TEXT
        )
      `

      await subSql`INSERT INTO sub_branch_data (value) VALUES ('sub-branch-only')`

      const data = await subSql`SELECT * FROM sub_branch_data`
      expect(data).toHaveLength(1)
      // Type assertion for query results from Neon SQL
      const dataItem = data[0] as { value: string }
      expect(dataItem.value).toBe('sub-branch-only')
    })

    // After the sub-branch is deleted, the main test branch doesn't have this data
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'sub_branch_data'
    `
    expect(tables).toHaveLength(0)
  })

  it('should handle concurrent tests efficiently', async () => {
    // Neon branches allow true parallel test execution
    const promises = Array.from({ length: 5 }, async (_, i) => {
      await sql`
        CREATE TABLE IF NOT EXISTS concurrent_test_${i} (
          id INT PRIMARY KEY,
          value TEXT
        )
      `

      await sql`
        INSERT INTO concurrent_test_${i} (id, value) 
        VALUES (${i}, ${`value-${i}`})
      `

      const result = await sql`
        SELECT * FROM concurrent_test_${i} WHERE id = ${i}
      `

      return result[0]
    })

    const results = await Promise.all(promises)

    expect(results).toHaveLength(5)
    results.forEach((result, i) => {
      // Type assertion for query results from Neon SQL
      const typedResult = result as { id: number; value: string }
      expect(typedResult.id).toBe(i)
      expect(typedResult.value).toBe(`value-${i}`)
    })
  })

  describe('Performance Benefits', () => {
    it('should create branches instantly', async () => {
      const start = Date.now()

      await withTestSubBranch('performance-test', async () => {
        // Branch is created and ready
        const elapsed = Date.now() - start

        // Neon branches typically create in under 3 seconds
        expect(elapsed).toBeLessThan(3000)
      })
    })

    it('should have production-like performance', async () => {
      // Create a table with indexes like production
      await sql`
        CREATE TABLE IF NOT EXISTS perf_test (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          data JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `

      await sql`CREATE INDEX IF NOT EXISTS idx_user_id ON perf_test(user_id)`

      // Insert test data
      const insertPromises = Array.from(
        { length: 100 },
        (_, i) =>
          sql`
          INSERT INTO perf_test (user_id, data) 
          VALUES (${Math.floor(i / 10)}, ${{ value: i }})
        `
      )
      await Promise.all(insertPromises)

      // Query with index
      const start = Date.now()
      const results = await sql`
        SELECT * FROM perf_test WHERE user_id = 5
      `
      const queryTime = Date.now() - start

      expect(results).toHaveLength(10)
      // Serverless queries are typically fast
      expect(queryTime).toBeLessThan(100)
    })
  })
})
