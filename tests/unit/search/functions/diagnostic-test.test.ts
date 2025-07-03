/**
 * Diagnostic Test for Data Insertion Issues
 * Simple test to verify data insertion and retrieval works
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SearchTestContext } from './setup/search-setup'
import {
  createSearchTestContext,
  setupSearchTestData,
  setupSearchTestSuite,
  teardownSearchTestContext,
} from './setup/search-setup'

describe('Diagnostic Tests', () => {
  let context: SearchTestContext

  beforeAll(async () => {
    context = await createSearchTestContext()
    await setupSearchTestSuite(context)
  })

  beforeEach(async () => {
    await setupSearchTestData(context)
  })

  afterAll(async () => {
    await teardownSearchTestContext(context)
  })

  it('should have basic table structure', async () => {
    const { connection } = context

    // Check repositories table
    const repoCount = await connection.sql`SELECT COUNT(*) as count FROM repositories`
    console.log('Repositories count:', repoCount.rows)
    expect(repoCount.rows[0].count).toBe('1')

    // Check opportunities table
    const oppCount = await connection.sql`SELECT COUNT(*) as count FROM opportunities`
    console.log('Opportunities count:', oppCount.rows)
    expect(oppCount.rows[0].count).toBe('2')

    // Check users table
    const userCount = await connection.sql`SELECT COUNT(*) as count FROM users`
    console.log('Users count:', userCount.rows)
    expect(userCount.rows[0].count).toBe('1')
  })

  it('should retrieve inserted test data', async () => {
    const { connection, testIds } = context

    // Get repository
    const repo =
      await connection.sql`SELECT id, name, description FROM repositories WHERE id = ${testIds.repoId}`
    console.log('Repository data:', repo.rows)
    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0].name).toBe('test-repo')

    // Get opportunities
    const opps =
      await connection.sql`SELECT id, title, description FROM opportunities WHERE repository_id = ${testIds.repoId}`
    console.log('Opportunities data:', opps.rows)
    expect(opps.rows).toHaveLength(2)
    expect(opps.rows[0].title).toContain('TypeScript')

    // Get user
    const user =
      await connection.sql`SELECT id, github_username FROM users WHERE id = ${testIds.userId}`
    console.log('User data:', user.rows)
    expect(user.rows).toHaveLength(1)
    expect(user.rows[0].github_username).toBe('testuser')
  })

  it('should execute basic search function', async () => {
    const { connection } = context

    // Test simple search without parameters
    const result = await connection.sql`
      SELECT * FROM hybrid_search_opportunities('TypeScript', NULL, 1.0, 0.0, 0.01, 10)
    `
    console.log('Search result:', result.rows)
    expect(result.rows).toBeDefined()

    if (result.rows.length > 0) {
      expect(result.rows[0].title).toContain('TypeScript')
    }
  })
})
