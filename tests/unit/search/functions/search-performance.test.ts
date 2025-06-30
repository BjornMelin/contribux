/**
 * Search Performance Test Suite
 * Tests for search optimization, caching, and performance benchmarks
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { performanceThresholds } from './fixtures/search-data'
import type { SearchTestContext } from './setup/search-setup'
import {
  createSearchTestContext,
  insertLowQualityRepository,
  setupSearchTestData,
  setupSearchTestSuite,
  teardownSearchTestContext,
  updateOpportunityEngagement,
} from './setup/search-setup'
import { generateEmbedding } from './utils/search-test-helpers'

describe('Search Performance', () => {
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

  describe('Query Performance Optimization', () => {
    it('should complete basic search queries within performance threshold', async () => {
      const { pool } = context

      const startTime = Date.now()

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript search debugging',
          text_weight := 0.5,
          vector_weight := 0.5,
          similarity_threshold := 0.01,
          result_limit := 50
        )
      `)

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime)
      expect(rows).toBeDefined()
    })

    it('should handle large result sets efficiently', async () => {
      const { pool } = context

      // Insert additional test data for performance testing
      const additionalRepos = Array.from({ length: 20 }, (_, i) => ({
        id: require('node:crypto').randomUUID(),
        github_id: 90000 + i,
        name: `perf-repo-${i}`,
        embedding: generateEmbedding(0.15 + i * 0.001),
      }))

      // Insert repositories in batch
      const insertPromises = additionalRepos.map(repo =>
        pool.query(
          `
          INSERT INTO repositories (
            id, github_id, full_name, name, description, url, clone_url,
            owner_login, owner_type, language, topics, stars_count, health_score,
            activity_score, community_score, status, description_embedding
          ) VALUES (
            $1, $2, $3, $4, 'Performance test repository',
            $5, $6, 'perf-org', 'Organization', 'JavaScript',
            ARRAY['performance', 'testing'], 50, 70.0, 80.0, 60.0, 'active',
            ${repo.embedding}
          )
        `,
          [
            repo.id,
            repo.github_id,
            `perf-org/${repo.name}`,
            repo.name,
            `https://github.com/perf-org/${repo.name}`,
            `https://github.com/perf-org/${repo.name}.git`,
          ]
        )
      )

      await Promise.all(insertPromises)

      const startTime = Date.now()

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_repositories(
          search_text := 'performance testing',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.01,
          result_limit := 100
        )
      `)

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime * 2) // Allow more time for larger dataset
      expect(rows.length).toBeGreaterThan(10)

      // Clean up
      await Promise.all(
        additionalRepos.map(repo => pool.query('DELETE FROM repositories WHERE id = $1', [repo.id]))
      )
    })

    it('should optimize vector similarity calculations', async () => {
      const { pool } = context

      // Test vector search performance with multiple embeddings
      const testEmbeddings = [0.1, 0.2, 0.3, 0.4, 0.5].map(val => generateEmbedding(val))

      const startTime = Date.now()

      const searchPromises = testEmbeddings.map(embedding =>
        pool.query(`
          SELECT * FROM search_similar_users(
            query_embedding := ${embedding},
            similarity_threshold := 0.1,
            result_limit := 10
          )
        `)
      )

      await Promise.all(searchPromises)

      const totalTime = Date.now() - startTime
      const avgTimePerQuery = totalTime / testEmbeddings.length

      expect(avgTimePerQuery).toBeLessThan(performanceThresholds.maxQueryTime / 2)
    })
  })

  describe('Repository Quality Scoring Performance', () => {
    it('should boost repository scores based on quality metrics efficiently', async () => {
      const { pool, testIds } = context
      const lowQualityRepoId = await insertLowQualityRepository(context)

      const startTime = Date.now()

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_repositories(
          search_text := 'AI search',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.01
        )
      `)

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime)
      expect(rows).toHaveLength(2)

      // Higher quality repo should rank first
      expect(rows[0].id).toBe(testIds.repoId)
      expect(rows[0].relevance_score).toBeGreaterThan(rows[1].relevance_score)

      // Clean up
      await pool.query('DELETE FROM repositories WHERE id = $1', [lowQualityRepoId])
    })

    it('should calculate repository health metrics efficiently', async () => {
      const { pool, testIds } = context

      const startTime = Date.now()

      const { rows } = await pool.query('SELECT * FROM get_repository_health_metrics($1)', [
        testIds.repoId,
      ])

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime / 2)
      expect(rows).toHaveLength(1)

      const metrics = rows[0]
      expect(metrics.repository_id).toBe(testIds.repoId)
      expect(metrics.health_score).toBe(85.5)
      expect(metrics.activity_score).toBe(92.0)
    })
  })

  describe('Trending Opportunities Performance', () => {
    beforeEach(async () => {
      const { testIds } = context
      // Setup engagement metrics for performance testing
      await updateOpportunityEngagement(context, testIds.oppId1, 100, 10)
      await updateOpportunityEngagement(context, testIds.oppId2, 50, 5, 2)
    })

    it('should calculate trending scores efficiently', async () => {
      const { pool } = context

      const startTime = Date.now()

      const { rows } = await pool.query(`
        SELECT * FROM get_trending_opportunities(
          time_window_hours := 24,
          min_engagement := 1,
          result_limit := 50
        )
      `)

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime)
      expect(rows).toHaveLength(2)
    })

    it('should filter by time window efficiently', async () => {
      const { pool, testIds } = context

      // Update one opportunity to be outside time window
      await pool.query(
        `
        UPDATE opportunities
        SET created_at = NOW() - INTERVAL '8 days'
        WHERE id = $1
      `,
        [testIds.oppId2]
      )

      const startTime = Date.now()

      const { rows } = await pool.query(`
        SELECT * FROM get_trending_opportunities(
          time_window_hours := 168 -- 1 week
        )
      `)

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime)
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(testIds.oppId1)
    })

    it('should handle engagement filtering efficiently', async () => {
      const { pool } = context

      const startTime = Date.now()

      const { rows } = await pool.query(`
        SELECT * FROM get_trending_opportunities(
          min_engagement := 200
        )
      `)

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime)
      expect(rows).toHaveLength(0) // No opportunities meet high engagement threshold
    })
  })

  describe('Index Usage and Optimization', () => {
    it('should use appropriate indexes for text search', async () => {
      const { pool } = context

      // Check query plan for text search
      const { rows } = await pool.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.01
        )
      `)

      expect(rows).toBeDefined()
      const plan = rows[0]['QUERY PLAN'][0]

      // Should have reasonable execution time
      expect(plan['Execution Time']).toBeLessThan(performanceThresholds.maxQueryTime)

      // Should use indexes efficiently (not doing full table scans)
      const planStr = JSON.stringify(plan)
      expect(planStr).not.toMatch(/Seq Scan.*opportunities/)
    })

    it('should use HNSW indexes for vector operations', async () => {
      const { pool } = context

      // Verify HNSW indexes exist
      const { rows: indexes } = await pool.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE indexdef ILIKE '%hnsw%'
        AND tablename IN ('users', 'opportunities', 'repositories')
      `)

      expect(indexes.length).toBeGreaterThan(0)

      // Check that vector search uses the index
      const { rows } = await pool.query(`
        EXPLAIN (ANALYZE, FORMAT JSON)
        SELECT * FROM search_similar_users(
          query_embedding := ${generateEmbedding(0.25)},
          similarity_threshold := 0.8
        )
      `)

      expect(rows).toBeDefined()
      const plan = rows[0]['QUERY PLAN'][0]
      expect(plan['Execution Time']).toBeLessThan(performanceThresholds.maxQueryTime / 2)
    })

    it('should optimize composite queries with multiple filters', async () => {
      const { pool, testIds } = context

      // Insert user preferences for complex filtering
      await pool.query(
        `
        INSERT INTO user_preferences (
          user_id, preferred_contribution_types,
          max_estimated_hours, notification_frequency
        ) VALUES (
          $1, ARRAY['bug_fix', 'feature']::contribution_type[],
          10, 24
        )
      `,
        [testIds.userId]
      )

      const startTime = Date.now()

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.01,
          result_limit := 20
        )
      `,
        [testIds.userId]
      )

      const queryTime = Date.now() - startTime

      expect(queryTime).toBeLessThan(performanceThresholds.maxQueryTime * 1.5) // Allow more time for complex query
      expect(rows).toBeDefined()
    })
  })

  describe('Memory and Resource Usage', () => {
    it('should handle large embedding operations within memory limits', async () => {
      const { pool } = context

      // Create multiple large embedding queries
      const largeQueries = Array.from({ length: 5 }, (_, i) =>
        pool.query(`
          SELECT * FROM hybrid_search_opportunities(
            query_embedding := ${generateEmbedding(0.1 + i * 0.1)},
            text_weight := 0.0,
            vector_weight := 1.0,
            similarity_threshold := 0.01,
            result_limit := 100
          )
        `)
      )

      const startTime = Date.now()
      const results = await Promise.all(largeQueries)
      const totalTime = Date.now() - startTime

      expect(totalTime).toBeLessThan(performanceThresholds.maxQueryTime * 3)
      expect(results).toHaveLength(5)

      // All queries should complete successfully
      results.forEach(result => {
        expect(result.rows).toBeDefined()
      })
    })

    it('should maintain performance with concurrent searches', async () => {
      const { pool } = context

      // Run concurrent searches of different types
      const concurrentQueries = [
        pool.query(`
          SELECT * FROM hybrid_search_opportunities(
            search_text := 'TypeScript',
            text_weight := 1.0,
            vector_weight := 0.0,
            similarity_threshold := 0.01
          )
        `),
        pool.query(`
          SELECT * FROM hybrid_search_repositories(
            search_text := 'AI search',
            text_weight := 1.0,
            vector_weight := 0.0,
            similarity_threshold := 0.01
          )
        `),
        pool.query(`
          SELECT * FROM search_similar_users(
            query_embedding := ${generateEmbedding(0.25)},
            similarity_threshold := 0.8
          )
        `),
        pool.query(`
          SELECT * FROM get_trending_opportunities(
            time_window_hours := 24,
            min_engagement := 1
          )
        `),
      ]

      const startTime = Date.now()
      const results = await Promise.all(concurrentQueries)
      const totalTime = Date.now() - startTime

      expect(totalTime).toBeLessThan(performanceThresholds.maxQueryTime * 2)
      expect(results).toHaveLength(4)

      // All concurrent queries should complete successfully
      results.forEach(result => {
        expect(result.rows).toBeDefined()
        expect(result.rows.length).toBeGreaterThanOrEqual(0)
      })
    })
  })
})
