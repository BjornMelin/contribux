/**
 * Search Core Algorithms Test Suite
 * Tests for basic search algorithms, ranking, and relevance scoring
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { errorMessages, searchParameters, searchQueries } from './fixtures/search-data'
import type { SearchTestContext } from './setup/search-setup'
import {
  createSearchTestContext,
  setupSearchTestData,
  setupSearchTestSuite,
  teardownSearchTestContext,
} from './setup/search-setup'
import {
  OpportunitySearchResultSchema,
  RepositorySearchResultSchema,
} from './utils/search-test-helpers'

describe('Search Core Algorithms', () => {
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

  describe('Text Search Algorithm', () => {
    it('should perform text-only search for opportunities', async () => {
      const { connection, testIds } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          ${searchQueries.text.typescript},
          NULL,
          ${searchParameters.textOnly.text_weight},
          ${searchParameters.textOnly.vector_weight},
          ${searchParameters.textOnly.similarity_threshold},
          10
        )
      `

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].id).toBe(testIds.oppId1)
      expect(result.rows[0].relevance_score).toBeGreaterThan(0.5)

      const parsedResult = OpportunitySearchResultSchema.parse(result.rows[0])
      expect(parsedResult.title).toContain('TypeScript type errors')
    })

    it('should perform text-only search for repositories', async () => {
      const { connection, testIds } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_repositories(
          ${searchQueries.text.aiSearch},
          NULL,
          ${searchParameters.textOnly.text_weight},
          ${searchParameters.textOnly.vector_weight},
          ${searchParameters.textOnly.similarity_threshold},
          10
        )
      `

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].id).toBe(testIds.repoId)

      const parsedResult = RepositorySearchResultSchema.parse(result.rows[0])
      expect(parsedResult.topics).toContain('ai')
      expect(parsedResult.topics).toContain('search')
    })

    it('should match repository topics in text search', async () => {
      const { connection, testIds } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_repositories(
          ${searchQueries.text.testing},
          NULL,
          ${searchParameters.textOnly.text_weight},
          ${searchParameters.textOnly.vector_weight},
          ${searchParameters.textOnly.similarity_threshold},
          10
        )
      `

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].id).toBe(testIds.repoId)
      expect(result.rows[0].topics).toContain('testing')
    })
  })

  describe('Relevance Scoring', () => {
    it('should calculate relevance scores correctly', async () => {
      const { connection } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          ${searchQueries.text.typescript},
          NULL,
          ${searchParameters.textOnly.text_weight},
          ${searchParameters.textOnly.vector_weight},
          ${searchParameters.textOnly.similarity_threshold},
          10
        )
      `

      expect(result.rows).toHaveLength(1)
      const opportunity = result.rows[0]

      // Relevance score should be within valid range
      expect(opportunity.relevance_score).toBeGreaterThan(0)
      expect(opportunity.relevance_score).toBeLessThanOrEqual(1)

      // High text match should produce high relevance
      expect(opportunity.relevance_score).toBeGreaterThan(0.5)
    })

    it('should handle empty search text gracefully', async () => {
      const { connection } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          ${searchQueries.text.empty},
          NULL,
          ${searchParameters.hybrid.text_weight},
          ${searchParameters.hybrid.vector_weight},
          ${searchParameters.hybrid.similarity_threshold},
          10
        )
      `

      expect(result.rows).toHaveLength(2)
      // All should have moderate scores for empty search
      result.rows.forEach(row => {
        expect(row.relevance_score).toBeGreaterThan(0.4)
        expect(row.relevance_score).toBeLessThan(0.6)
      })
    })
  })

  describe('Search Threshold Management', () => {
    it('should respect similarity threshold', async () => {
      const { connection } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          ${searchQueries.text.unrelated},
          NULL,
          ${searchParameters.strict.text_weight},
          ${searchParameters.strict.vector_weight},
          ${searchParameters.strict.similarity_threshold},
          10
        )
      `

      expect(result.rows).toHaveLength(0)
    })

    it('should limit results correctly', async () => {
      const { connection } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          ${searchQueries.text.typescript},
          NULL,
          1.0,
          0.0,
          ${searchParameters.textOnly.similarity_threshold},
          1
        )
      `

      expect(result.rows).toHaveLength(1)
    })
  })

  describe('Algorithm Error Handling', () => {
    it('should throw error for invalid weight configuration', async () => {
      const { connection } = context
      await expect(
        connection.sql`
          SELECT * FROM hybrid_search_opportunities(
            '',
            NULL,
            0.0,
            0.0,
            0.01,
            10
          )
        `
      ).rejects.toThrow(errorMessages.zeroWeights)
    })

    it('should throw error for invalid result limit', async () => {
      const { connection } = context
      await expect(
        connection.sql`
          SELECT * FROM hybrid_search_opportunities(
            '',
            NULL,
            1.0,
            0.0,
            0.01,
            0
          )
        `
      ).rejects.toThrow(errorMessages.invalidLimit)
    })

    it('should throw error for negative result limit in user search', async () => {
      const { connection } = context
      const queryEmbedding = 'array_fill(0.25::real, ARRAY[1536])::halfvec(1536)'

      await expect(
        connection.sql`
          SELECT * FROM search_similar_users(
            ${queryEmbedding},
            0.9,
            -1
          )
        `
      ).rejects.toThrow(errorMessages.invalidLimit)
    })
  })

  describe('Query Processing', () => {
    it('should handle special characters in search text', async () => {
      const { connection } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          'TypeScript & debugging @#$%',
          NULL,
          1.0,
          0.0,
          0.01,
          10
        )
      `

      // Should still find the TypeScript opportunity
      expect(result.rows.length).toBeGreaterThanOrEqual(1)
    })

    it('should be case insensitive for text search', async () => {
      const { connection, testIds } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          'TYPESCRIPT TYPE ERRORS',
          NULL,
          1.0,
          0.0,
          0.01,
          10
        )
      `

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].id).toBe(testIds.oppId1)
    })
  })

  describe('Ranking Algorithm', () => {
    it('should rank results by relevance score', async () => {
      const { connection } = context
      const result = await connection.sql`
        SELECT * FROM hybrid_search_opportunities(
          'search',
          NULL,
          1.0,
          0.0,
          0.01,
          10
        ) ORDER BY relevance_score DESC
      `

      // Should have multiple results
      expect(result.rows.length).toBeGreaterThan(1)

      // Verify descending order
      for (let i = 1; i < result.rows.length; i++) {
        expect(result.rows[i - 1].relevance_score).toBeGreaterThanOrEqual(
          result.rows[i].relevance_score
        )
      }
    })

    it('should handle identical relevance scores consistently', async () => {
      const { connection } = context

      // Run the same query multiple times
      const queries = Array(3)
        .fill(null)
        .map(
          () =>
            connection.sql`
          SELECT * FROM hybrid_search_opportunities(
            'search',
            NULL,
            1.0,
            0.0,
            0.01,
            10
          ) ORDER BY relevance_score DESC, id
        `
        )

      const results = await Promise.all(queries)

      // Results should be consistently ordered
      const firstResult = results[0].rows
      results.slice(1).forEach(result => {
        expect(result.rows).toEqual(firstResult)
      })
    })
  })
})
