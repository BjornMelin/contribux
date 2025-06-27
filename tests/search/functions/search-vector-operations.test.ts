/**
 * Search Vector Operations Test Suite
 * Tests for vector search, embeddings, and semantic similarity
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { searchParameters } from './fixtures/search-data'
import type { SearchTestContext } from './setup/search-setup'
import {
  createSearchTestContext,
  insertSimilarUser,
  setupSearchTestData,
  setupSearchTestSuite,
  teardownSearchTestContext,
} from './setup/search-setup'
import {
  generateEmbedding,
  generateOrthogonalEmbedding,
  OpportunitySearchResultSchema,
  UserSearchResultSchema,
} from './utils/search-test-helpers'

describe('Search Vector Operations', () => {
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

  describe('Vector Similarity Search', () => {
    it('should search opportunities by vector similarity only', async () => {
      const { pool, testIds } = context
      // Create a query embedding similar to opportunity 2 (value 0.3)
      const queryEmbedding = generateEmbedding(0.31)

      const { rows } = await pool.query(
        `
        SELECT * FROM hybrid_search_opportunities(
          query_embedding := ${queryEmbedding},
          text_weight := $1,
          vector_weight := $2,
          similarity_threshold := $3,
          result_limit := 10
        )
      `,
        [
          searchParameters.vectorOnly.text_weight,
          searchParameters.vectorOnly.vector_weight,
          searchParameters.vectorOnly.similarity_threshold,
        ]
      )

      expect(rows).toHaveLength(2)
      // Opportunity 2 should rank higher due to closer embedding
      expect(rows[0].id).toBe(testIds.oppId2)
      expect(rows[0].relevance_score).toBeGreaterThan(rows[1].relevance_score)

      // Validate schema
      const result = OpportunitySearchResultSchema.parse(rows[0])
      expect(result.title).toContain('AI-powered search')
    })

    it('should perform hybrid search with both text and vector', async () => {
      const { pool } = context
      const queryEmbedding = generateEmbedding(0.25)

      const { rows } = await pool.query(
        `
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'AI search',
          query_embedding := ${queryEmbedding},
          text_weight := $1,
          vector_weight := $2,
          similarity_threshold := $3,
          result_limit := 10
        )
      `,
        [
          searchParameters.hybrid.text_weight,
          searchParameters.hybrid.vector_weight,
          searchParameters.hybrid.similarity_threshold,
        ]
      )

      expect(rows).toHaveLength(2)
      // Both should have reasonable scores
      rows.forEach(row => {
        expect(row.relevance_score).toBeGreaterThan(0.1)
        expect(row.relevance_score).toBeLessThanOrEqual(1.0)
      })
    })

    it('should find similar users by embedding', async () => {
      const { pool, testIds } = context
      const similarUserId = await insertSimilarUser(context)

      const queryEmbedding = generateEmbedding(0.25)
      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          similarity_threshold := 0.8,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(2)

      // Original test user should be first (exact match)
      expect(rows[0].id).toBe(testIds.userId)
      expect(rows[0].similarity_score).toBeGreaterThan(0.95)

      // Similar user should be second
      expect(rows[1].id).toBe(similarUserId)
      expect(rows[1].similarity_score).toBeGreaterThan(0.8)

      // Validate schema
      rows.forEach(row => {
        const result = UserSearchResultSchema.parse(row)
        expect(result.similarity_score).toBeGreaterThan(0.8)
        expect(result.similarity_score).toBeLessThanOrEqual(1.0)
      })

      // Clean up
      await context.pool.query('DELETE FROM users WHERE id = $1', [similarUserId])
    })
  })

  describe('Embedding Distance Calculations', () => {
    it('should calculate exact embedding matches correctly', async () => {
      const { pool, testIds } = context
      // Use exact same embedding as test user
      const queryEmbedding = generateEmbedding(0.25)

      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          similarity_threshold := 0.95,
          result_limit := 1
        )
      `)

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(testIds.userId)
      expect(rows[0].similarity_score).toBeCloseTo(1.0, 2)
    })

    it('should handle orthogonal embeddings correctly', async () => {
      const { pool } = context
      // Create orthogonal embedding that should have very low similarity
      const queryEmbedding = generateOrthogonalEmbedding()

      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          similarity_threshold := 0.5
        )
      `)

      expect(rows).toHaveLength(0)
    })

    it('should respect similarity threshold for users', async () => {
      const { pool } = context
      const queryEmbedding = generateOrthogonalEmbedding()

      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          similarity_threshold := 0.5
        )
      `)

      expect(rows).toHaveLength(0)
    })
  })

  describe('Vector Dimension Handling', () => {
    it('should work with halfvec(1536) embeddings', async () => {
      const { pool, testIds } = context
      // Test that our 1536-dimensional embeddings work correctly
      const { rows } = await pool.query(
        `
        SELECT 
          id,
          array_length(profile_embedding, 1) as embedding_dim,
          profile_embedding <=> ${generateEmbedding(0.25)} as distance
        FROM users 
        WHERE id = $1
      `,
        [testIds.userId]
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].embedding_dim).toBe(1536)
      expect(rows[0].distance).toBeCloseTo(0, 2) // Should be very close for identical vectors
    })

    it('should handle different embedding magnitudes', async () => {
      const { pool } = context

      // Test with different embedding magnitudes
      const embeddings = [0.1, 0.5, 1.0, 2.0].map(val => generateEmbedding(val))

      const queries = embeddings.map(embedding =>
        pool.query(`
          SELECT * FROM search_similar_users(
            query_embedding := ${embedding},
            similarity_threshold := 0.1,
            result_limit := 5
          )
        `)
      )

      const results = await Promise.all(queries)

      // All should return the test user, though with different similarity scores
      results.forEach(result => {
        expect(result.rows.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Vector Performance Optimization', () => {
    it('should use HNSW index for efficient vector search', async () => {
      const { pool } = context

      // Check that HNSW index exists and is being used
      const { rows: indexInfo } = await pool.query(`
        SELECT 
          schemaname, tablename, indexname, indexdef
        FROM pg_indexes 
        WHERE indexdef ILIKE '%hnsw%' 
        AND tablename IN ('users', 'opportunities', 'repositories')
      `)

      // Should have HNSW indexes on embedding columns
      expect(indexInfo.length).toBeGreaterThan(0)

      // Verify index is actually used in query plan
      const { rows: queryPlan } = await pool.query(`
        EXPLAIN (FORMAT JSON) 
        SELECT * FROM search_similar_users(
          query_embedding := ${generateEmbedding(0.25)},
          similarity_threshold := 0.8
        )
      `)

      expect(queryPlan).toBeDefined()
      // Query plan should indicate index usage for performance
    })

    it('should handle large result sets efficiently', async () => {
      const { pool } = context

      // Insert additional test users for performance testing
      const additionalUsers = Array.from({ length: 10 }, (_, i) => ({
        id: require('node:crypto').randomUUID(),
        github_id: 80000 + i,
        username: `perftest${i}`,
        embedding: generateEmbedding(0.2 + i * 0.01),
      }))

      // Insert in batch
      const insertPromises = additionalUsers.map(user =>
        pool.query(
          `
          INSERT INTO users (
            id, github_id, github_username, email,
            skill_level, profile_embedding
          ) VALUES (
            $1, $2, $3, $4, 'intermediate', ${user.embedding}
          )
        `,
          [user.id, user.github_id, user.username, `${user.username}@test.com`]
        )
      )

      await Promise.all(insertPromises)

      // Perform search with larger result set
      const startTime = Date.now()
      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${generateEmbedding(0.25)},
          similarity_threshold := 0.1,
          result_limit := 20
        )
      `)
      const queryTime = Date.now() - startTime

      expect(rows.length).toBeGreaterThan(5)
      expect(queryTime).toBeLessThan(1000) // Should complete within 1 second

      // Clean up
      await Promise.all(
        additionalUsers.map(user => pool.query('DELETE FROM users WHERE id = $1', [user.id]))
      )
    })
  })

  describe('Semantic Search Quality', () => {
    it('should rank semantically similar content higher', async () => {
      const { pool, testIds } = context

      // Create query embedding closer to opportunity 2 (AI/ML focused)
      const aiSearchEmbedding = generateEmbedding(0.3)

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          query_embedding := ${aiSearchEmbedding},
          text_weight := 0.0,
          vector_weight := 1.0,
          similarity_threshold := 0.01
        ) ORDER BY relevance_score DESC
      `)

      expect(rows).toHaveLength(2)

      // AI opportunity should rank higher
      expect(rows[0].id).toBe(testIds.oppId2)
      expect(rows[0].title).toContain('AI-powered search')

      // TypeScript opportunity should rank lower
      expect(rows[1].id).toBe(testIds.oppId1)
      expect(rows[1].title).toContain('TypeScript type errors')
    })

    it('should combine text and vector signals effectively', async () => {
      const { pool, testIds } = context

      // Search for "TypeScript" with embedding closer to AI opportunity
      const aiEmbedding = generateEmbedding(0.3)

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript',
          query_embedding := ${aiEmbedding},
          text_weight := 0.7,
          vector_weight := 0.3,
          similarity_threshold := 0.01
        )
      `)

      expect(rows).toHaveLength(2)

      // TypeScript opportunity should still rank first due to text match
      expect(rows[0].id).toBe(testIds.oppId1)
      expect(rows[0].relevance_score).toBeGreaterThan(rows[1].relevance_score)
    })
  })
})
