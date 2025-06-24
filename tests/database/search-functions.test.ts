/**
 * Database Search Functions Test Suite
 * Tests for hybrid_search_opportunities, hybrid_search_repositories,
 * and other AI-powered search functions
 */

import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createTestPool, getTestDatabaseUrl } from '../test-utils'

// Schema definitions for test validation
const OpportunitySearchResultSchema = z.object({
  id: z.string().uuid(),
  repository_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(['bug_fix', 'feature', 'documentation', 'test', 'refactor', 'security']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  priority: z.number(),
  required_skills: z.array(z.string()),
  technologies: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  estimated_hours: z.number().nullable(),
  created_at: z.date(),
  relevance_score: z.number().min(0).max(1),
})

const RepositorySearchResultSchema = z.object({
  id: z.string().uuid(),
  github_id: z.number(),
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  stars_count: z.number(),
  health_score: z.number(),
  activity_score: z.number(),
  first_time_contributor_friendly: z.boolean(),
  created_at: z.date(),
  relevance_score: z.number().min(0),
})

describe('Database Search Functions', () => {
  let pool: Pool
  const testRepoId = '550e8400-e29b-41d4-a716-446655440000'
  const testUserId = '550e8400-e29b-41d4-a716-446655440001'
  const testOppId1 = '550e8400-e29b-41d4-a716-446655440002'
  const testOppId2 = '550e8400-e29b-41d4-a716-446655440003'

  beforeAll(async () => {
    const connectionString = getTestDatabaseUrl()
    if (!connectionString) {
      throw new Error('Test database URL not configured')
    }

    pool = createTestPool()

    // Verify extensions are loaded
    const { rows: extensions } = await pool.query(`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('vector', 'pg_trgm', 'pgcrypto')
    `)
    expect(extensions).toHaveLength(3)
    
    // Reload the search functions with corrected types
    console.log('Reloading search functions with type fixes...')
    await pool.query(`
      DROP FUNCTION IF EXISTS hybrid_search_repositories(TEXT, halfvec(1536), DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);
      DROP FUNCTION IF EXISTS get_repository_health_metrics(UUID);
    `)
    
    // Read and execute the updated search functions
    const fs = require('fs')
    const path = require('path')
    const sqlFile = path.join(__dirname, '..', '..', 'database', 'init', 'search_functions.sql')
    const sql = fs.readFileSync(sqlFile, 'utf8')
    await pool.query(sql)
    console.log('Search functions reloaded successfully!')
  })

  beforeEach(async () => {
    // Clean up ALL test data to ensure complete isolation
    await pool.query('DELETE FROM contribution_outcomes')
    await pool.query('DELETE FROM user_repository_interactions')
    await pool.query('DELETE FROM user_preferences')
    await pool.query('DELETE FROM opportunities')
    await pool.query('DELETE FROM repositories')
    await pool.query('DELETE FROM users')
    
    // Additional cleanup for specific test IDs to prevent conflicts
    await pool.query('DELETE FROM repositories WHERE id = ANY($1)', [[testRepoId, '550e8400-e29b-41d4-a716-446655440004']])
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [[testUserId, '550e8400-e29b-41d4-a716-446655440005']])
    await pool.query('DELETE FROM opportunities WHERE id = ANY($1)', [[testOppId1, testOppId2]])

    // Insert test repository
    await pool.query(
      `
      INSERT INTO repositories (
        id, github_id, full_name, name, description, url, clone_url,
        owner_login, owner_type, language, topics, stars_count, health_score, 
        activity_score, first_time_contributor_friendly,
        status, description_embedding
      ) VALUES (
        $1, 12345, 'test-org/test-repo', 'test-repo',
        'A test repository for testing AI-powered search functionality',
        'https://github.com/test-org/test-repo',
        'https://github.com/test-org/test-repo.git',
        'test-org', 'Organization',
        'TypeScript', ARRAY['testing', 'ai', 'search'],
        100, 85.5, 92.0, true, 'active',
        array_fill(0.1::real, ARRAY[1536])::halfvec(1536)
      )
    `,
      [testRepoId]
    )

    // Insert test opportunities
    await pool.query(
      `
      INSERT INTO opportunities (
        id, repository_id, github_issue_number, title, description, url, type,
        difficulty, priority, required_skills, technologies,
        good_first_issue, help_wanted, estimated_hours,
        status, title_embedding, description_embedding
      ) VALUES 
      (
        $1, $2, 1, 'Fix TypeScript type errors in search module',
        'Several type errors need to be fixed in the search functionality',
        'https://github.com/test-org/test-repo/issues/1',
        'bug_fix', 'intermediate', 1, 
        ARRAY['TypeScript', 'debugging'], ARRAY['TypeScript', 'Node.js'],
        false, true, 4, 'open',
        array_fill(0.2::real, ARRAY[1536])::halfvec(1536),
        array_fill(0.2::real, ARRAY[1536])::halfvec(1536)
      ),
      (
        $3, $2, 2, 'Add AI-powered search capabilities',
        'Implement vector search using embeddings for better search results',
        'https://github.com/test-org/test-repo/issues/2',
        'feature', 'advanced', 2,
        ARRAY['AI/ML', 'PostgreSQL', 'vector-search'], ARRAY['Python', 'PostgreSQL'],
        false, false, 16, 'open',
        array_fill(0.3::real, ARRAY[1536])::halfvec(1536),
        array_fill(0.3::real, ARRAY[1536])::halfvec(1536)
      )
    `,
      [testOppId1, testRepoId, testOppId2]
    )

    // Insert test user
    await pool.query(
      `
      INSERT INTO users (
        id, github_id, github_username, github_name,
        email, skill_level, preferred_languages,
        availability_hours, profile_embedding
      ) VALUES (
        $1, 67890, 'testuser', 'Test User',
        'test@example.com', 'intermediate',
        ARRAY['TypeScript', 'Python'], 20,
        array_fill(0.25::real, ARRAY[1536])::halfvec(1536)
      )
    `,
      [testUserId]
    )
  })

  afterAll(async () => {
    // Comprehensive cleanup
    await pool.query('DELETE FROM contribution_outcomes')
    await pool.query('DELETE FROM user_repository_interactions')
    await pool.query('DELETE FROM user_preferences')
    await pool.query('DELETE FROM opportunities')
    await pool.query('DELETE FROM repositories')
    await pool.query('DELETE FROM users')
    await pool.end()
  })

  describe('hybrid_search_opportunities', () => {
    it('should search opportunities by text only', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript type errors',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.1,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(testOppId1)
      expect(rows[0].relevance_score).toBeGreaterThan(0.5)

      // Validate schema
      const result = OpportunitySearchResultSchema.parse(rows[0])
      expect(result.title).toContain('TypeScript type errors')
    })

    it('should search opportunities by vector similarity only', async () => {
      // Create a query embedding similar to opportunity 2
      const queryEmbedding = 'array_fill(0.31::real, ARRAY[1536])::halfvec(1536)'

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          query_embedding := ${queryEmbedding},
          text_weight := 0.0,
          vector_weight := 1.0,
          similarity_threshold := 0.1,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(2)
      // Opportunity 2 should rank higher due to closer embedding
      expect(rows[0].id).toBe(testOppId2)
      expect(rows[0].relevance_score).toBeGreaterThan(rows[1].relevance_score)
    })

    it('should perform hybrid search with both text and vector', async () => {
      const queryEmbedding = 'array_fill(0.25::real, ARRAY[1536])::halfvec(1536)'

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'AI search',
          query_embedding := ${queryEmbedding},
          text_weight := 0.3,
          vector_weight := 0.7,
          similarity_threshold := 0.1,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(2)
      // Both should have reasonable scores
      rows.forEach(row => {
        expect(row.relevance_score).toBeGreaterThan(0.1)
        expect(row.relevance_score).toBeLessThanOrEqual(1.0)
      })
    })

    it('should respect similarity threshold', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'completely unrelated query xyz123',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.8,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(0)
    })

    it('should limit results correctly', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := 'TypeScript type errors',
          similarity_threshold := 0.1,
          result_limit := 1
        )
      `)

      expect(rows).toHaveLength(1)
    })

    it('should handle empty search text gracefully', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          search_text := '',
          text_weight := 0.5,
          vector_weight := 0.5,
          similarity_threshold := 0.1
        )
      `)

      expect(rows).toHaveLength(2)
      // All should have moderate scores
      rows.forEach(row => {
        expect(row.relevance_score).toBeGreaterThan(0.4)
        expect(row.relevance_score).toBeLessThan(0.6)
      })
    })

    it('should throw error for invalid weight configuration', async () => {
      await expect(
        pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          text_weight := 0.0,
          vector_weight := 0.0
        )
      `)
      ).rejects.toThrow('Text weight and vector weight cannot both be zero')
    })

    it('should throw error for invalid result limit', async () => {
      await expect(
        pool.query(`
        SELECT * FROM hybrid_search_opportunities(
          result_limit := 0
        )
      `)
      ).rejects.toThrow('Result limit must be positive')
    })
  })

  describe('hybrid_search_repositories', () => {
    it('should search repositories by text', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_repositories(
          search_text := 'AI search',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.1
        )
      `)

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(testRepoId)

      // Validate schema
      const result = RepositorySearchResultSchema.parse(rows[0])
      expect(result.topics).toContain('ai')
      expect(result.topics).toContain('search')
    })

    it('should boost repository scores based on quality metrics', async () => {
      // Insert another repository with lower quality scores
      const lowQualityRepoId = '550e8400-e29b-41d4-a716-446655440004'
      await pool.query(
        `
        INSERT INTO repositories (
          id, github_id, full_name, name, description, url, clone_url,
          owner_login, owner_type, language, topics, stars_count, health_score,
          activity_score, status, description_embedding
        ) VALUES (
          $1, 54321, 'test-org/low-quality', 'low-quality',
          'Another AI search repository with lower metrics',
          'https://github.com/test-org/low-quality',
          'https://github.com/test-org/low-quality.git',
          'test-org', 'Organization', 'JavaScript', ARRAY['ai', 'search'],
          5, 40.0, 30.0, 'active',
          array_fill(0.1::real, ARRAY[1536])::halfvec(1536)
        )
      `,
        [lowQualityRepoId]
      )

      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_repositories(
          search_text := 'AI search',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.1
        )
      `)

      expect(rows).toHaveLength(2)
      // Higher quality repo should rank first
      expect(rows[0].id).toBe(testRepoId)
      expect(rows[0].relevance_score).toBeGreaterThan(rows[1].relevance_score)

      // Clean up
      await pool.query('DELETE FROM repositories WHERE id = $1', [lowQualityRepoId])
    })

    it('should match repository topics', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM hybrid_search_repositories(
          search_text := 'testing',
          text_weight := 1.0,
          vector_weight := 0.0,
          similarity_threshold := 0.1
        )
      `)

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(testRepoId)
      expect(rows[0].topics).toContain('testing')
    })
  })

  describe('search_similar_users', () => {
    it('should find similar users by embedding', async () => {
      // Insert another user with similar embedding
      const similarUserId = '550e8400-e29b-41d4-a716-446655440005'
      await pool.query(
        `
        INSERT INTO users (
          id, github_id, github_username, email,
          skill_level, profile_embedding
        ) VALUES (
          $1, 11111, 'similaruser', 'similar@example.com',
          'intermediate',
          array_fill(0.26::real, ARRAY[1536])::halfvec(1536)
        )
      `,
        [similarUserId]
      )

      const queryEmbedding = 'array_fill(0.25::real, ARRAY[1536])::halfvec(1536)'
      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          similarity_threshold := 0.9,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(2)
      // Original test user should be first (exact match)
      expect(rows[0].id).toBe(testUserId)
      expect(rows[0].similarity_score).toBeGreaterThan(0.99)

      // Similar user should be second
      expect(rows[1].id).toBe(similarUserId)
      expect(rows[1].similarity_score).toBeGreaterThan(0.9)

      // Clean up
      await pool.query('DELETE FROM users WHERE id = $1', [similarUserId])
    })

    it('should respect similarity threshold for users', async () => {
      const queryEmbedding = 'array_fill(0.9::real, ARRAY[1536])::halfvec(1536)'
      const { rows } = await pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          similarity_threshold := 0.95
        )
      `)

      expect(rows).toHaveLength(0)
    })

    it('should throw error for invalid limit', async () => {
      const queryEmbedding = 'array_fill(0.25::real, ARRAY[1536])::halfvec(1536)'
      await expect(
        pool.query(`
        SELECT * FROM search_similar_users(
          query_embedding := ${queryEmbedding},
          result_limit := -1
        )
      `)
      ).rejects.toThrow('Result limit must be positive')
    })
  })

  describe('find_matching_opportunities_for_user', () => {
    beforeEach(async () => {
      // Insert user preferences
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
        [testUserId]
      )
    })

    it('should find matching opportunities for user', async () => {
      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.1,
          result_limit := 10
        )
      `,
        [testUserId]
      )

      expect(rows).toHaveLength(2)

      // Should include match reasons
      rows.forEach(row => {
        expect(row.match_score).toBeGreaterThan(0)
        expect(Array.isArray(row.match_reasons)).toBe(true)
        expect(row.match_reasons.length).toBeGreaterThan(0)
      })

      // Bug fix should score higher due to preference match
      const bugFix = rows.find(r => r.type === 'bug_fix')
      const feature = rows.find(r => r.type === 'feature')
      expect(bugFix).toBeDefined()
      expect(feature).toBeDefined()
    })

    it('should exclude opportunities from repositories user has contributed to', async () => {
      // Mark user as having contributed to the repository
      await pool.query(
        `
        INSERT INTO user_repository_interactions (
          user_id, repository_id, contributed,
          last_interaction
        ) VALUES (
          $1, $2, true, NOW()
        )
      `,
        [testUserId, testRepoId]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.1
        )
      `,
        [testUserId]
      )

      expect(rows).toHaveLength(0)

      // Clean up
      await pool.query('DELETE FROM user_repository_interactions WHERE user_id = $1', [testUserId])
    })

    it('should throw error for non-existent user', async () => {
      const fakeUserId = '550e8400-e29b-41d4-a716-446655440099'
      await expect(
        pool.query(
          `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1
        )
      `,
          [fakeUserId]
        )
      ).rejects.toThrow(`User not found: ${fakeUserId}`)
    })

    it('should consider skill level compatibility', async () => {
      // Update opportunity difficulties to test skill matching
      await pool.query(
        `
        UPDATE opportunities 
        SET difficulty = 'intermediate'
        WHERE id = $1
      `,
        [testOppId1]
      )

      await pool.query(
        `
        UPDATE opportunities 
        SET difficulty = 'expert'
        WHERE id = $1
      `,
        [testOppId2]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM find_matching_opportunities_for_user(
          target_user_id := $1,
          similarity_threshold := 0.1
        )
      `,
        [testUserId]
      )

      // Intermediate opportunity should score higher for intermediate user
      expect(rows[0].difficulty).toBe('intermediate')
      expect(rows[0].match_score).toBeGreaterThan(rows[1].match_score)
    })
  })

  describe('get_trending_opportunities', () => {
    beforeEach(async () => {
      // Update opportunities with engagement metrics
      await pool.query(
        `
        UPDATE opportunities
        SET view_count = 100, application_count = 10
        WHERE id = $1
      `,
        [testOppId1]
      )

      await pool.query(
        `
        UPDATE opportunities
        SET view_count = 50, application_count = 5,
            created_at = NOW() - INTERVAL '2 hours'
        WHERE id = $1
      `,
        [testOppId2]
      )
    })

    it('should return trending opportunities', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM get_trending_opportunities(
          time_window_hours := 24,
          min_engagement := 1,
          result_limit := 10
        )
      `)

      expect(rows).toHaveLength(2)

      // Higher engagement opportunity should rank first
      expect(rows[0].id).toBe(testOppId1)
      expect(rows[0].view_count).toBe(100)
      expect(rows[0].application_count).toBe(10)
      expect(rows[0].trending_score).toBeGreaterThan(rows[1].trending_score)
    })

    it('should filter by time window', async () => {
      // Update one opportunity to be outside time window
      await pool.query(
        `
        UPDATE opportunities
        SET created_at = NOW() - INTERVAL '8 days'
        WHERE id = $1
      `,
        [testOppId2]
      )

      const { rows } = await pool.query(`
        SELECT * FROM get_trending_opportunities(
          time_window_hours := 168 -- 1 week
        )
      `)

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(testOppId1)
    })

    it('should filter by minimum engagement', async () => {
      const { rows } = await pool.query(`
        SELECT * FROM get_trending_opportunities(
          min_engagement := 200
        )
      `)

      expect(rows).toHaveLength(0)
    })
  })

  describe('get_repository_health_metrics', () => {
    it('should calculate repository health metrics', async () => {
      const { rows } = await pool.query(
        `
        SELECT * FROM get_repository_health_metrics($1)
      `,
        [testRepoId]
      )

      expect(rows).toHaveLength(1)
      const metrics = rows[0]

      expect(metrics.repository_id).toBe(testRepoId)
      expect(metrics.health_score).toBe(85.5)
      expect(metrics.activity_score).toBe(92.0)
      expect(metrics.total_opportunities).toBe(2)
      expect(metrics.open_opportunities).toBe(2)

      // Check recommendations
      const recommendations = metrics.recommendations
      expect(recommendations).toBeDefined()
      expect(recommendations.health_status).toBe('excellent')
      expect(recommendations.key_strengths).toContain('active_development')
      expect(recommendations.key_strengths).toContain('strong_community')
    })

    it('should throw error for non-existent repository', async () => {
      const fakeRepoId = '550e8400-e29b-41d4-a716-446655440099'
      await expect(
        pool.query(
          `
        SELECT * FROM get_repository_health_metrics($1)
      `,
          [fakeRepoId]
        )
      ).rejects.toThrow(`Repository not found: ${fakeRepoId}`)
    })

    it('should calculate average completion time when outcomes exist', async () => {
      // Insert a contribution outcome
      await pool.query(
        `
        INSERT INTO contribution_outcomes (
          id, opportunity_id, user_id,
          started_at, completed_at, status
        ) VALUES (
          gen_random_uuid(), $1, $2,
          NOW() - INTERVAL '5 hours', NOW(), 'accepted'
        )
      `,
        [testOppId1, testUserId]
      )

      const { rows } = await pool.query(
        `
        SELECT * FROM get_repository_health_metrics($1)
      `,
        [testRepoId]
      )

      expect(rows[0].avg_opportunity_completion_time).toBe(5)

      // Clean up
      await pool.query('DELETE FROM contribution_outcomes WHERE opportunity_id = $1', [testOppId1])
    })
  })
})
