/**
 * Search Function Test Utilities
 * Shared utilities for search function testing
 */

import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { z } from 'zod'

// Schema definitions for test validation
export const OpportunitySearchResultSchema = z.object({
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

export const RepositorySearchResultSchema = z.object({
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

export const UserSearchResultSchema = z.object({
  id: z.string().uuid(),
  github_id: z.number(),
  github_username: z.string(),
  email: z.string().nullable(),
  skill_level: z.string(),
  similarity_score: z.number().min(0).max(1),
})

// Test data generators
export function generateTestIds() {
  return {
    repoId: randomUUID(),
    userId: randomUUID(),
    oppId1: randomUUID(),
    oppId2: randomUUID(),
  }
}

// Database utilities
export async function setupSearchFunctions(pool: Pool) {
  // Verify extensions are loaded
  const { rows: extensions } = await pool.query(`
    SELECT extname FROM pg_extension 
    WHERE extname IN ('vector', 'pg_trgm', 'pgcrypto')
  `)

  if (extensions.length !== 3) {
    throw new Error('Required extensions not loaded')
  }

  // Reload the search functions
  await pool.query(`
    DROP FUNCTION IF EXISTS hybrid_search_repositories(TEXT, halfvec(1536), DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);
    DROP FUNCTION IF EXISTS get_repository_health_metrics(UUID);
  `)

  // Read and execute the search functions
  const fs = require('node:fs')
  const path = require('node:path')
  const sqlFile = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'database',
    'init',
    'search_functions.sql'
  )
  const sql = fs.readFileSync(sqlFile, 'utf8')
  await pool.query(sql)
}

export async function cleanupTestData(pool: Pool, testIds: ReturnType<typeof generateTestIds>) {
  const { repoId, userId } = testIds

  // Order matters due to foreign key constraints
  await pool.query(
    'DELETE FROM contribution_outcomes WHERE opportunity_id IN (SELECT id FROM opportunities WHERE repository_id = $1)',
    [repoId]
  )
  await pool.query(
    'DELETE FROM user_repository_interactions WHERE user_id = $1 OR repository_id = $2',
    [userId, repoId]
  )
  await pool.query('DELETE FROM user_preferences WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM opportunities WHERE repository_id = $1', [repoId])
  await pool.query('DELETE FROM repositories WHERE id = $1', [repoId])
  await pool.query('DELETE FROM users WHERE id = $1', [userId])

  // Clean up any leftover data
  await pool.query('DELETE FROM repositories WHERE github_id IN (12345, 67890, 54321)')
  await pool.query('DELETE FROM repositories WHERE full_name LIKE $1', ['test-org/%'])
}

// Vector utilities
export function generateEmbedding(value: number, dimensions = 1536): string {
  return `array_fill(${value}::real, ARRAY[${dimensions}])::halfvec(${dimensions})`
}

export function generateOrthogonalEmbedding(): string {
  return `
    (SELECT array_agg(
      CASE WHEN i % 2 = 0 THEN 1.0::real ELSE -1.0::real END
    )::halfvec(1536)
    FROM generate_series(1, 1536) AS i)
  `
}

// Test data insertion utilities
export async function insertTestRepository(
  pool: Pool,
  testIds: ReturnType<typeof generateTestIds>
) {
  const { repoId } = testIds

  await pool.query(
    `
    INSERT INTO repositories (
      id, github_id, full_name, name, description, url, clone_url,
      owner_login, owner_type, language, topics, stars_count, health_score, 
      activity_score, community_score, first_time_contributor_friendly,
      status, description_embedding
    ) VALUES (
      $1, 12345, 'test-org/test-repo', 'test-repo',
      'A test repository for testing AI-powered search functionality',
      'https://github.com/test-org/test-repo',
      'https://github.com/test-org/test-repo.git',
      'test-org', 'Organization',
      'TypeScript', ARRAY['testing', 'ai', 'search'],
      100, 85.5, 92.0, 75.0, true, 'active',
      ${generateEmbedding(0.1)}
    )
  `,
    [repoId]
  )
}

export async function insertTestOpportunities(
  pool: Pool,
  testIds: ReturnType<typeof generateTestIds>
) {
  const { repoId, oppId1, oppId2 } = testIds

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
      ${generateEmbedding(0.2)},
      ${generateEmbedding(0.2)}
    ),
    (
      $3, $2, 2, 'Add AI-powered search capabilities',
      'Implement vector search using embeddings for better search results',
      'https://github.com/test-org/test-repo/issues/2',
      'feature', 'advanced', 2,
      ARRAY['AI/ML', 'PostgreSQL', 'vector-search'], ARRAY['Python', 'PostgreSQL'],
      false, false, 16, 'open',
      ${generateEmbedding(0.3)},
      ${generateEmbedding(0.3)}
    )
  `,
    [oppId1, repoId, oppId2]
  )
}

export async function insertTestUser(pool: Pool, testIds: ReturnType<typeof generateTestIds>) {
  const { userId } = testIds

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
      ${generateEmbedding(0.25)}
    )
  `,
    [userId]
  )
}
