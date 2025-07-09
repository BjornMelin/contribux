/**
 * Test Database Manager Tests
 *
 * Tests the TestDatabaseManager functionality with PGlite
 */

import type { TestDatabaseManager as TestDatabaseManagerType } from '@/lib/test-utils/test-database-manager'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Test Database Manager', () => {
  let TestDatabaseManager: typeof TestDatabaseManagerType
  let getTestDatabase: typeof import(
    '../../../src/lib/test-utils/test-database-manager'
  ).getTestDatabase

  beforeEach(async () => {
    // Dynamic import to avoid module resolution issues during startup
    const module = await import('../../../src/lib/test-utils/test-database-manager')
    TestDatabaseManager = module.TestDatabaseManager
    getTestDatabase = module.getTestDatabase
  })

  it('should create a database manager instance', () => {
    const manager = TestDatabaseManager.getInstance()
    expect(manager).toBeDefined()
  })

  it('should determine optimal strategy as pglite for tests', async () => {
    const manager = TestDatabaseManager.getInstance()

    // Access the private method via reflection for testing
    const strategy = (
      manager as TestDatabaseManagerType & { determineOptimalStrategy: () => string }
    ).determineOptimalStrategy()
    expect(strategy).toBe('pglite')
  })

  it('should get test database connection with PGlite', async () => {
    const connection = await getTestDatabase('test-manager-test', {
      strategy: 'pglite',
      verbose: true,
    })

    expect(connection).toBeDefined()
    expect(connection.strategy).toBe('pglite')
    expect(connection.info.performance).toBe('ultra-fast')
    expect(connection.sql).toBeDefined()
    expect(typeof connection.sql).toBe('function')

    // Test a basic query
    const result = await connection.sql`SELECT 1 as test`
    expect(result).toHaveLength(1)
    expect(result[0].test).toBe(1)

    // Cleanup
    await connection.cleanup()
  })

  it('should create database schema automatically', async () => {
    let connection: Awaited<ReturnType<typeof getTestDatabase>> | null = null

    try {
      connection = await getTestDatabase('schema-test', {
        strategy: 'pglite',
        verbose: false,
      })

      // Check that basic tables exist
      const tables = await connection.sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `

      const tableNames = tables.map((t: { table_name: string }) => t.table_name)
      expect(tableNames).toContain('users')
      expect(tableNames).toContain('repositories')
      expect(tableNames).toContain('opportunities')
      expect(tableNames).toContain('user_skills')

      // Test inserting data
      const [user] = await connection.sql`
        INSERT INTO users (github_id, github_username, email, name)
        VALUES ('123', 'testuser', 'test@example.com', 'Test User')
        RETURNING *
      `

      expect(user.github_username).toBe('testuser')
      expect(user.email).toBe('test@example.com')
    } finally {
      // Cleanup with error handling
      if (connection) {
        try {
          await connection.cleanup()
        } catch (error) {
          // Ignore cleanup errors during test cleanup
          console.warn('Cleanup error for schema test:', error)
        }
      }
    }
  }, 10000) // Extended timeout to 10 seconds

  it('should handle vector operations (converted for PGlite)', async () => {
    const connection = await getTestDatabase('vector-test', {
      strategy: 'pglite',
    })

    // Create test repository
    const [repo] = await connection.sql`
      INSERT INTO repositories (github_id, name, full_name, description, url, language, stars, forks, health_score)
      VALUES ('456', 'test-repo', 'user/test-repo', 'Test repository', 'https://github.com/user/test-repo', 'TypeScript', 100, 10, 0.8)
      RETURNING *
    `

    expect(repo.id).toBeDefined()
    const repoId = repo.id as string

    // Create opportunity with embedding (stored as TEXT in PGlite)
    const embedding = Array.from({ length: 1536 }, () => 0.5)
    const [opportunity] = await connection.sql`
      INSERT INTO opportunities (repository_id, issue_number, title, description, labels, difficulty, estimated_hours, skills_required, ai_analysis, score, embedding)
      VALUES (
        ${repoId}, 1, 'Test opportunity', 'A test opportunity', 
        ${JSON.stringify(['bug', 'good first issue'])}, 'beginner', 4,
        ${JSON.stringify(['TypeScript', 'React'])}, ${JSON.stringify({ complexity: 0.5 })}, 0.8,
        ${JSON.stringify(embedding)}
      )
      RETURNING *
    `

    expect(opportunity.title).toBe('Test opportunity')
    expect(opportunity.difficulty).toBe('beginner')

    // In PGlite, embedding is stored as TEXT, so we can still query it
    const opportunities = await connection.sql`
      SELECT * FROM opportunities WHERE repository_id = ${repoId}
    `

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0].embedding).toBeDefined()

    // Cleanup
    await connection.cleanup()
  })

  it('should support multiple concurrent connections', async () => {
    let connections: Awaited<ReturnType<typeof getTestDatabase>>[] = []

    try {
      connections = await Promise.all([
        getTestDatabase('concurrent-1', { strategy: 'pglite' }),
        getTestDatabase('concurrent-2', { strategy: 'pglite' }),
        getTestDatabase('concurrent-3', { strategy: 'pglite' }),
      ])

      expect(connections).toHaveLength(3)

      // Each should be independent
      for (let i = 0; i < connections.length; i++) {
        const result = await connections[i].sql`SELECT ${i + 1} as test_id`
        expect(Number(result[0].test_id)).toBe(i + 1)
      }
    } finally {
      // Cleanup all with error handling
      await Promise.allSettled(
        connections.map(async conn => {
          try {
            await conn.cleanup()
          } catch (error) {
            // Ignore cleanup errors during test cleanup
            console.warn('Cleanup error for connection:', error)
          }
        })
      )
    }
  })

  it('should provide connection statistics', async () => {
    const manager = TestDatabaseManager.getInstance()

    let conn1: Awaited<ReturnType<typeof getTestDatabase>> | null = null
    let conn2: Awaited<ReturnType<typeof getTestDatabase>> | null = null

    try {
      // Create a few connections
      conn1 = await getTestDatabase('stats-1', { strategy: 'pglite' })
      conn2 = await getTestDatabase('stats-2', { strategy: 'pglite' })

      const stats = manager.getStats()
      expect(stats.totalConnections).toBeGreaterThanOrEqual(2)
      expect(stats.byStrategy.pglite).toBeGreaterThanOrEqual(2)
      expect(stats.byPerformance['ultra-fast']).toBeGreaterThanOrEqual(2)
    } finally {
      // Cleanup with proper error handling
      if (conn1) {
        try {
          await conn1.cleanup()
        } catch (error) {
          // Ignore cleanup errors during test cleanup
          console.warn('Cleanup error for conn1:', error)
        }
      }
      if (conn2) {
        try {
          await conn2.cleanup()
        } catch (error) {
          // Ignore cleanup errors during test cleanup
          console.warn('Cleanup error for conn2:', error)
        }
      }
    }
  }, 10000) // Extended timeout to 10 seconds
})
