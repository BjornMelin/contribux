/**
 * Search Integration Test Suite
 * Tests for end-to-end search workflows and database integration
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { errorMessages } from './fixtures/search-data'
import type { SearchTestContext } from './setup/search-setup'
import {
  addContributionOutcome,
  createSearchTestContext,
  insertLowQualityRepository,
  setupSearchTestData,
  setupSearchTestSuite,
  setupUserPreferences,
  teardownSearchTestContext,
  updateOpportunityEngagement,
} from './setup/search-setup'
import { generateEmbedding } from './utils/search-test-helpers'

describe('Search Integration', () => {
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

  describe('End-to-End Search Workflows', () => {
    it('should support complete opportunity discovery workflow', async () => {
      const { connection, testIds } = context
      await setupUserPreferences(context)

      // 1. Find matching opportunities for user
      const { rows: matchingOpps } = await connection.sql(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01,
          result_limit := 10
        )
      `,
        [testIds.userId]
      )

      expect(matchingOpps).toHaveLength(2)
      const selectedOpp = matchingOpps[0]

      // 2. Get repository health metrics for the opportunity
      const { rows: healthMetrics } = await connection.sql(
        'SELECT * FROM get_repository_health_metrics($1)',
        [selectedOpp.repository_id]
      )

      expect(healthMetrics).toHaveLength(1)
      expect(healthMetrics[0].repository_id).toBe(selectedOpp.repository_id)
      expect(healthMetrics[0].health_score).toBeGreaterThan(0)

      // 3. Search for similar opportunities
      const { rows: similarOpps } = await connection.sql(
        `
        SELECT * FROM hybrid_search_opportunities(
          search_text := $1,
          text_weight := 0.5,
          vector_weight := 0.5,
          similarity_threshold := 0.01,
          result_limit := 5
        )
      `,
        [selectedOpp.title.split(' ').slice(0, 2).join(' ')]
      ) // Use first few words

      expect(similarOpps.length).toBeGreaterThan(0)
      expect(similarOpps.some(opp => opp.id === selectedOpp.id)).toBe(true)

      // 4. Check trending opportunities for context
      await updateOpportunityEngagement(context, selectedOpp.id, 150, 15)

      const { rows: trending } = await connection.sql(`
        SELECT * FROM get_trending_opportunities(
          time_window_hours := 24,
          min_engagement := 1,
          result_limit := 10
        )
      `)

      expect(trending.some(opp => opp.id === selectedOpp.id)).toBe(true)
    })

    it('should support complete user matching workflow', async () => {
      const { connection, testIds } = context

      // 1. Search for users similar to current user
      const { rows: similarUsers } = await connection.sql(`
        SELECT * FROM search_similar_users(
          query_embedding := ${generateEmbedding(0.25)},
          similarity_threshold := 0.9,
          result_limit := 10
        )
      `)

      expect(similarUsers).toHaveLength(1)
      expect(similarUsers[0].id).toBe(testIds.userId)

      // 2. Find opportunities that would match similar users
      await setupUserPreferences(context)

      const { rows: userOpportunities } = await connection.sql(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      expect(userOpportunities.length).toBeGreaterThan(0)

      // 3. Cross-reference with repository quality
      for (const opp of userOpportunities) {
        const { rows: repoHealth } = await connection.sql(
          'SELECT * FROM get_repository_health_metrics($1)',
          [opp.repository_id]
        )

        expect(repoHealth).toHaveLength(1)
        expect(repoHealth[0].health_score).toBeGreaterThan(0)
      }
    })

    it('should handle complete repository discovery workflow', async () => {
      const { connection, testIds } = context
      const lowQualityRepoId = await insertLowQualityRepository(context)

      // 1. Search repositories by topic and quality
      const { rows: qualityRepos } = await connection.sql(`
        SELECT * FROM hybrid_search_repositories(
          search_text := 'AI search',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.01
        ) ORDER BY relevance_score DESC
      `)

      expect(qualityRepos).toHaveLength(2)
      expect(qualityRepos[0].id).toBe(testIds.repoId) // Higher quality first

      // 2. Get detailed health metrics for top repository
      const topRepo = qualityRepos[0]
      const { rows: topRepoHealth } = await connection.sql(
        'SELECT * FROM get_repository_health_metrics($1)',
        [topRepo.id]
      )

      expect(topRepoHealth).toHaveLength(1)
      expect(topRepoHealth[0].health_score).toBeGreaterThan(80)

      // 3. Find opportunities in top repository
      const { rows: repoOpportunities } = await connection.sql(
        `
        SELECT * FROM opportunities 
        WHERE repository_id = $1 AND status = 'open'
      `,
        [topRepo.id]
      )

      expect(repoOpportunities.length).toBeGreaterThan(0)

      // 4. Search for similar high-quality repositories
      const { rows: similarRepos } = await connection.sql(`
        SELECT * FROM hybrid_search_repositories(
          query_embedding := ${generateEmbedding(0.1)},
          text_weight := 0.0,
          vector_weight := 1.0,
          similarity_threshold := 0.01
        )
      `)

      expect(similarRepos.length).toBeGreaterThan(1)

      // Clean up
      await connection.sql('DELETE FROM repositories WHERE id = $1', [lowQualityRepoId])
    })
  })

  describe('Cross-Function Integration', () => {
    it('should integrate user preferences with repository health metrics', async () => {
      const { connection, testIds } = context
      await setupUserPreferences(context)

      // Get user matches
      const { rows: matches } = await connection.sql(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01
        )
      `,
        [testIds.userId]
      )

      expect(matches.length).toBeGreaterThan(0)

      // Verify each matched opportunity comes from a healthy repository
      for (const match of matches) {
        const { rows: health } = await connection.sql(
          'SELECT * FROM get_repository_health_metrics($1)',
          [match.repository_id]
        )

        expect(health).toHaveLength(1)
        expect(health[0].health_score).toBeGreaterThan(0)
        expect(health[0].recommendations).toBeDefined()
      }
    })

    it('should integrate trending scores with search relevance', async () => {
      const { connection, testIds } = context

      // Update engagement metrics to make opportunities trending
      await updateOpportunityEngagement(context, testIds.oppId1, 200, 20)
      await updateOpportunityEngagement(context, testIds.oppId2, 75, 8, 1)

      // Get trending opportunities
      const { rows: trending } = await connection.sql(`
        SELECT * FROM get_trending_opportunities(
          time_window_hours := 24,
          min_engagement := 5,
          result_limit := 10
        )
      `)

      expect(trending.length).toBeGreaterThan(0)

      // Search for the same opportunities using text search
      const { rows: searchResults } = await connection.sql(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript AI search',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.01
        )
      `)

      expect(searchResults.length).toBeGreaterThan(0)

      // Verify overlap between trending and search results
      const trendingIds = new Set(trending.map(t => t.id))
      const searchIds = new Set(searchResults.map(s => s.id))
      const overlap = [...trendingIds].filter(id => searchIds.has(id))

      expect(overlap.length).toBeGreaterThan(0)
    })

    it('should integrate vector similarity with text search scoring', async () => {
      const { connection } = context

      // Test hybrid search that combines text and vector signals
      const { rows: hybridResults } = await connection.sql(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript debugging',
          query_embedding := ${generateEmbedding(0.2)},
          text_weight := 0.6,
          vector_weight := 0.4,
          similarity_threshold := 0.01
        )
      `)

      expect(hybridResults.length).toBeGreaterThan(0)

      // Compare with text-only search
      const { rows: textResults } = await connection.sql(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript debugging',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.01
        )
      `)

      // Compare with vector-only search
      const { rows: vectorResults } = await connection.sql(`
        SELECT * FROM hybrid_search_opportunities(
          query_embedding := ${generateEmbedding(0.2)},
          text_weight := 0.0,
          vector_weight := 1.0,
          similarity_threshold := 0.01
        )
      `)

      // Hybrid results should exist and have reasonable scores
      expect(hybridResults.length).toBeGreaterThanOrEqual(textResults.length)
      expect(hybridResults.length).toBeGreaterThanOrEqual(vectorResults.length)

      hybridResults.forEach(result => {
        expect(result.relevance_score).toBeGreaterThan(0)
        expect(result.relevance_score).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('Data Consistency and Integrity', () => {
    it('should maintain data consistency across search functions', async () => {
      const { connection, testIds } = context

      // Verify that the same opportunities appear in different search contexts
      const searchMethods = [
        connection.sql(`
          SELECT id, title FROM hybrid_search_opportunities(
            search_text := 'TypeScript',
            similarity_threshold := 0.01
          )
        `),
        connection.sql(
          `
          SELECT id, title FROM opportunities 
          WHERE repository_id = $1 AND status = 'open'
        `,
          [testIds.repoId]
        ),
      ]

      const results = await Promise.all(searchMethods)

      // Should find consistent opportunity data
      const searchOpps = results[0].rows
      const directOpps = results[1].rows

      expect(searchOpps.length).toBeGreaterThan(0)
      expect(directOpps.length).toBeGreaterThan(0)

      // All search results should be valid opportunities
      const directOppIds = new Set(directOpps.map(o => o.id))
      searchOpps.forEach(opp => {
        expect(directOppIds.has(opp.id)).toBe(true)
      })
    })

    it('should handle cascading updates correctly', async () => {
      const { connection, testIds } = context
      await setupUserPreferences(context)

      // Record contribution outcome
      await addContributionOutcome(context, testIds.oppId1, 3)

      // Verify health metrics reflect the contribution
      const { rows: healthWithOutcome } = await connection.sql(
        'SELECT * FROM get_repository_health_metrics($1)',
        [testIds.repoId]
      )

      expect(healthWithOutcome).toHaveLength(1)
      expect(healthWithOutcome[0].avg_opportunity_completion_time).toBe(3)

      // Verify this doesn't break search functionality
      const { rows: searchAfterOutcome } = await connection.sql(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript',
          similarity_threshold := 0.01
        )
      `)

      expect(searchAfterOutcome.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent entities gracefully', async () => {
      const { connection } = context
      const fakeRepoId = '550e8400-e29b-41d4-a716-446655440099'
      const fakeUserId = '550e8400-e29b-41d4-a716-446655440098'

      // Test repository health metrics with non-existent repo
      await expect(
        connection.sql('SELECT * FROM get_repository_health_metrics($1)', [fakeRepoId])
      ).rejects.toThrow(errorMessages.repositoryNotFound(fakeRepoId))

      // Test user matching with non-existent user
      await expect(
        connection.sql(
          `
          SELECT * FROM find_matching_opportunities_for_user(
            target_user_id := $1
          )
        `,
          [fakeUserId]
        )
      ).rejects.toThrow(errorMessages.userNotFound(fakeUserId))
    })

    it('should handle malformed search inputs gracefully', async () => {
      const { connection } = context

      // Test with very long search text
      const longText = 'a'.repeat(1000)
      const { rows } = await connection.sql(
        `
        SELECT * FROM hybrid_search_opportunities(
          search_text := $1,
          similarity_threshold := 0.01
        )
      `,
        [longText]
      )

      expect(rows).toBeDefined() // Should not crash

      // Test with special characters and SQL injection attempts
      const maliciousText = "'; DROP TABLE opportunities; --"
      const { rows: safeRows } = await connection.sql(
        `
        SELECT * FROM hybrid_search_opportunities(
          search_text := $1,
          similarity_threshold := 0.01
        )
      `,
        [maliciousText]
      )

      expect(safeRows).toBeDefined() // Should handle safely
    })

    it('should handle concurrent access correctly', async () => {
      const { connection, testIds } = context
      await setupUserPreferences(context)

      // Run multiple concurrent operations
      const concurrentOperations = [
        connection.sql(`
          SELECT * FROM hybrid_search_opportunities(
            search_text := 'TypeScript',
            similarity_threshold := 0.01
          )
        `),
        connection.sql(
          `
          SELECT * FROM find_matching_opportunities_for_user(
            target_user_id := $1,
            similarity_threshold := 0.01
          )
        `,
          [testIds.userId]
        ),
        connection.sql(
          `
          SELECT * FROM get_repository_health_metrics($1)
        `,
          [testIds.repoId]
        ),
        connection.sql(`
          SELECT * FROM get_trending_opportunities(
            time_window_hours := 24,
            min_engagement := 1
          )
        `),
      ]

      // All should complete without deadlocks or errors
      const results = await Promise.all(concurrentOperations)

      expect(results).toHaveLength(4)
      results.forEach(result => {
        expect(result.rows).toBeDefined()
      })
    })
  })
})
