/**
 * Fallback Strategy Validation Test
 * Ensures the mock database strategy works correctly when PGlite fails
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SearchTestContext } from './setup/search-setup'
import {
  createSearchTestContext,
  setupSearchTestData,
  setupSearchTestSuite,
  teardownSearchTestContext,
} from './setup/search-setup'
import { OpportunitySearchResultSchema } from './utils/search-test-helpers'

describe('Fallback Strategy Tests', () => {
  let context: SearchTestContext

  beforeAll(async () => {
    // Force mock strategy to test fallback behavior
    process.env.TEST_DB_STRATEGY = 'mock'
    context = await createSearchTestContext()
    await setupSearchTestSuite(context)
  })

  beforeEach(async () => {
    await setupSearchTestData(context)
  })

  afterAll(async () => {
    await teardownSearchTestContext(context)
    process.env.TEST_DB_STRATEGY = undefined
  })

  it('should use mock strategy when forced', async () => {
    expect(context.connection.strategy).toBe('mock')
    expect(context.connection.info.performance).toBe('ultra-fast')
  })

  it('should handle basic table operations', async () => {
    const { connection } = context

    // Test repositories count
    const repoCount = await connection.sql`SELECT COUNT(*) as count FROM repositories`
    expect(repoCount).toHaveLength(1)
    expect(repoCount[0].count).toBe(1)

    // Test opportunities count
    const oppCount = await connection.sql`SELECT COUNT(*) as count FROM opportunities`
    expect(oppCount).toHaveLength(1)
    expect(oppCount[0].count).toBe(2)

    // Test users count
    const userCount = await connection.sql`SELECT COUNT(*) as count FROM users`
    expect(userCount).toHaveLength(1)
    expect(userCount[0].count).toBe(1)
  })

  it('should handle search function calls', async () => {
    const { connection } = context

    // Test TypeScript search
    const result = await connection.sql`
      SELECT * FROM hybrid_search_opportunities('TypeScript', NULL, 1.0, 0.0, 0.01, 10)
    `

    expect(result).toHaveLength(1)
    expect(result[0].title).toContain('TypeScript')
    expect(result[0].relevance_score).toBe(0.9)

    // Validate against schema
    const validatedResult = OpportunitySearchResultSchema.parse(result[0])
    expect(validatedResult.title).toContain('TypeScript type errors')
  })

  it('should handle error conditions properly', async () => {
    const { connection } = context

    // Test zero weights error
    await expect(
      connection.sql`
        SELECT * FROM hybrid_search_opportunities('', NULL, 0.0, 0.0, 0.01, 10)
      `
    ).rejects.toThrow('Text weight and vector weight cannot both be zero')

    // Test invalid limit error
    await expect(
      connection.sql`
        SELECT * FROM hybrid_search_opportunities('test', NULL, 1.0, 0.0, 0.01, 0)
      `
    ).rejects.toThrow('Result limit must be positive')
  })

  it('should handle repository search', async () => {
    const { connection } = context

    const result = await connection.sql`
      SELECT * FROM hybrid_search_repositories('test', NULL, 1.0, 0.0, 0.01, 10)
    `

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('test-repo')
    expect(result[0].topics).toEqual(['testing', 'ai', 'search'])
    expect(result[0].activity_score).toBe(85.0)
  })

  it('should handle empty search results', async () => {
    const { connection } = context

    const result = await connection.sql`
      SELECT * FROM hybrid_search_opportunities('nonexistent', NULL, 1.0, 0.0, 0.01, 10)
    `

    expect(result).toHaveLength(0)
  })

  it('should handle database modifications', async () => {
    const { connection } = context

    // Test INSERT operation
    await connection.sql`
      INSERT INTO repositories (id, github_id, name, full_name, description, url, language)
      VALUES ('new-repo-id', '99999', 'new-repo', 'test/new-repo', 'New test repo', 'https://github.com/test/new-repo', 'JavaScript')
    `

    // Test UPDATE operation
    await connection.sql`
      UPDATE opportunities SET view_count = 200 WHERE title LIKE '%TypeScript%'
    `

    // Test DELETE operation
    await connection.sql`
      DELETE FROM opportunities WHERE view_count < 50
    `

    // These should all succeed without throwing errors
    expect(true).toBe(true)
  })
})
