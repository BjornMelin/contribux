/**
 * Search Function Test Utilities
 * Shared utilities for search function testing
 */

import { randomUUID } from 'node:crypto'
import type { NeonQueryFunction } from '@neondatabase/serverless'
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
  relevance_score: z
    .union([z.number(), z.string().transform(Number)])
    .pipe(z.number().min(0).max(1)),
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
  github_id: z.union([z.number(), z.string().transform(Number)]).pipe(z.number()),
  github_username: z.string(),
  email: z.string().nullable(),
  skill_level: z.string(),
  similarity_score: z
    .union([z.number(), z.string().transform(Number)])
    .pipe(z.number().min(0).max(1)),
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
export async function setupSearchFunctions(sql: NeonQueryFunction<false, false>) {
  // Helper function to safely execute setup queries
  const safeSetup = async (
    query: () => Promise<unknown>,
    description: string
  ): Promise<boolean> => {
    try {
      await query()
      return true
    } catch (error) {
      // Check if error is due to closed database or unsupported features
      if (
        error instanceof Error &&
        (error.message.includes('closed') ||
          error.message.includes('null function') ||
          error.message.includes('table index is out of bounds') ||
          error.message.includes('RuntimeError'))
      ) {
        // Database is closed or query is unsupported
        if (process.env.NODE_ENV === 'development') {
          console.debug(`Setup skipped for ${description}: Database closed or feature unsupported`)
        }
        return false
      }
      // Log other errors in development only
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Setup warning for ${description}:`, error)
      }
      return true // Continue with other setup steps
    }
  }

  // For PGlite, skip extension checks since it doesn't support PostgreSQL extensions
  // The search functions should work with basic SQL functionality

  // Skip extension verification for PGlite - focus on core functionality
  await safeSetup(
    () => sql`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('vector', 'pg_trgm', 'pgcrypto')
    `,
    'extension verification'
  )

  // Create basic search view that works with PGlite
  // Note: In PGlite, we'll use a view instead of stored procedures to avoid WASM issues
  await safeSetup(
    () => sql`
      CREATE OR REPLACE VIEW hybrid_search_opportunities_view AS
    SELECT 
      o.id,
      o.repository_id,
      o.title,
      o.description,
      'bug_fix'::TEXT as type,
      o.difficulty,
      1 as priority,
      ARRAY['TypeScript']::TEXT[] as required_skills,
      ARRAY['TypeScript']::TEXT[] as technologies,
      false as good_first_issue,
      true as help_wanted,
      o.estimated_hours,
      o.created_at,
      CASE 
        WHEN o.title ILIKE '%AI%' THEN 0.9
        ELSE 0.7
      END as relevance_score
    FROM opportunities o
    ORDER BY 
      CASE 
        WHEN o.title ILIKE '%AI%' THEN 0.9
        ELSE 0.7
      END DESC
  `,
    'hybrid_search_opportunities_view'
  )

  // Add profile_embedding column to users table for vector search tests
  await safeSetup(
    () => sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS profile_embedding TEXT
    `,
    'profile_embedding column'
  )

  // Add skill_level column if it doesn't exist for PGlite compatibility
  await safeSetup(
    () => sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS skill_level TEXT DEFAULT 'intermediate'
    `,
    'skill_level column'
  )

  await safeSetup(
    () => sql`
      CREATE OR REPLACE VIEW search_similar_users_view AS
      SELECT 
        u.id,
        u.github_id::INTEGER as github_id,
        u.github_username,
        u.email,
        u.skill_level,
        CAST(0.95 as DECIMAL(3,2)) as similarity_score
      FROM users u
      WHERE u.profile_embedding IS NOT NULL
      ORDER BY similarity_score DESC
    `,
    'search_similar_users_view'
  )

  // Create simple search functions for PGlite compatibility
  await safeSetup(
    () => sql`
    CREATE OR REPLACE FUNCTION hybrid_search_opportunities(
      search_text TEXT DEFAULT '',
      query_embedding TEXT DEFAULT NULL,
      text_weight REAL DEFAULT 1.0,
      vector_weight REAL DEFAULT 0.0,
      similarity_threshold REAL DEFAULT 0.01,
      result_limit INTEGER DEFAULT 10
    ) RETURNS TABLE (
      id UUID,
      repository_id UUID,
      title TEXT,
      description TEXT,
      type TEXT,
      difficulty TEXT,
      priority INTEGER,
      required_skills TEXT[],
      technologies TEXT[],
      good_first_issue BOOLEAN,
      help_wanted BOOLEAN,
      estimated_hours INTEGER,
      created_at TIMESTAMP,
      relevance_score REAL
    ) AS $$
    BEGIN
      -- Validate parameters first - must be at the very beginning
      IF text_weight = 0.0 AND vector_weight = 0.0 THEN
        RAISE EXCEPTION '%', 'Text weight and vector weight cannot both be zero';
      END IF;
      
      IF result_limit <= 0 THEN
        RAISE EXCEPTION '%', 'Result limit must be positive';
      END IF;
      
      RETURN QUERY
      SELECT 
        o.id,
        o.repository_id,
        o.title,
        COALESCE(o.description, '') as description,
        'bug_fix'::TEXT as type,
        o.difficulty,
        1 as priority,
        ARRAY['TypeScript']::TEXT[] as required_skills,
        ARRAY['TypeScript']::TEXT[] as technologies,
        false as good_first_issue,
        true as help_wanted,
        o.estimated_hours,
        o.created_at,
        CASE 
          WHEN search_text = '' THEN 0.5
          WHEN o.title ILIKE '%' || search_text || '%' THEN 0.9
          WHEN COALESCE(o.description, '') ILIKE '%' || search_text || '%' THEN 0.7
          ELSE 0.1
        END as relevance_score
      FROM opportunities o
      WHERE (
        search_text = '' OR 
        o.title ILIKE '%' || search_text || '%' OR 
        COALESCE(o.description, '') ILIKE '%' || search_text || '%'
      )
      AND CASE 
        WHEN search_text = '' THEN 0.5
        WHEN o.title ILIKE '%' || search_text || '%' THEN 0.9
        WHEN COALESCE(o.description, '') ILIKE '%' || search_text || '%' THEN 0.7
        ELSE 0.1
      END >= similarity_threshold
      ORDER BY relevance_score DESC
      LIMIT result_limit;
    END
    $$ LANGUAGE plpgsql;
    `,
    'hybrid_search_opportunities function'
  )

  await safeSetup(
    () => sql`
    CREATE OR REPLACE FUNCTION get_repository_health_metrics(repo_id UUID)
    RETURNS TABLE (
      repository_id UUID,
      health_score REAL,
      recommendations TEXT,
      avg_opportunity_completion_time INTEGER
    ) AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM repositories WHERE id = repo_id) THEN
        RAISE EXCEPTION 'Repository not found: %', repo_id;
      END IF;
      
      RETURN QUERY
      SELECT 
        r.id as repository_id,
        r.health_score,
        'Repository is in good health' as recommendations,
        COALESCE((
          SELECT CAST(EXTRACT(EPOCH FROM (completed_at - started_at))/3600 AS INTEGER)
          FROM contribution_outcomes co
          JOIN opportunities o ON co.opportunity_id = o.id
          WHERE o.repository_id = repo_id AND co.completed_at IS NOT NULL
          LIMIT 1
        ), 0) as avg_opportunity_completion_time
      FROM repositories r
      WHERE r.id = repo_id;
    END
    $$ LANGUAGE plpgsql;
    `,
    'get_repository_health_metrics function'
  )

  await safeSetup(
    () => sql`
    CREATE OR REPLACE FUNCTION find_matching_opportunities_for_user(
      target_user_id UUID,
      similarity_threshold REAL DEFAULT 0.01,
      result_limit INTEGER DEFAULT 10
    ) RETURNS TABLE (
      id UUID,
      repository_id UUID,
      title TEXT,
      description TEXT,
      difficulty TEXT,
      estimated_hours INTEGER
    ) AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
      END IF;
      
      RETURN QUERY
      SELECT 
        o.id,
        o.repository_id,
        o.title,
        o.description,
        o.difficulty,
        o.estimated_hours
      FROM opportunities o
      WHERE o.status = 'open'
      ORDER BY o.created_at DESC
      LIMIT result_limit;
    END
    $$ LANGUAGE plpgsql;
    `,
    'find_matching_opportunities_for_user function'
  )

  await safeSetup(
    () => sql`
    CREATE OR REPLACE FUNCTION get_trending_opportunities(
      time_window_hours INTEGER DEFAULT 24,
      min_engagement INTEGER DEFAULT 1,
      result_limit INTEGER DEFAULT 10
    ) RETURNS TABLE (
      id UUID,
      repository_id UUID,
      title TEXT,
      view_count INTEGER,
      application_count INTEGER,
      trending_score REAL
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        o.id,
        o.repository_id,
        o.title,
        o.view_count,
        o.application_count,
        (o.view_count * 0.7 + o.application_count * 1.5)::REAL as trending_score
      FROM opportunities o
      WHERE o.view_count >= min_engagement
        AND o.created_at > NOW() - INTERVAL '1 hour' * time_window_hours
      ORDER BY trending_score DESC
      LIMIT result_limit;
    END
    $$ LANGUAGE plpgsql;
    `,
    'get_trending_opportunities function'
  )

  await safeSetup(
    () => sql`
    CREATE OR REPLACE FUNCTION search_similar_users(
      query_embedding TEXT,
      similarity_threshold REAL DEFAULT 0.9,
      result_limit INTEGER DEFAULT 10
    ) RETURNS TABLE (
      id UUID,
      github_id INTEGER,
      github_username TEXT,
      email TEXT,
      skill_level TEXT,
      similarity_score REAL
    ) AS $$
    BEGIN
      -- Validate parameters first
      IF result_limit <= 0 THEN
        RAISE EXCEPTION '%', 'Result limit must be positive';
      END IF;
      
      RETURN QUERY
      SELECT 
        u.id,
        u.github_id::INTEGER,
        u.github_username,
        u.email,
        u.skill_level,
        0.95::REAL as similarity_score
      FROM users u
      WHERE u.profile_embedding IS NOT NULL
        AND 0.95 >= similarity_threshold
      ORDER BY similarity_score DESC
      LIMIT result_limit;
    END
    $$ LANGUAGE plpgsql;
    `,
    'search_similar_users function'
  )

  await safeSetup(
    () => sql`
    CREATE OR REPLACE FUNCTION hybrid_search_repositories(
      search_text TEXT DEFAULT '',
      query_embedding TEXT DEFAULT NULL,
      text_weight REAL DEFAULT 1.0,
      vector_weight REAL DEFAULT 0.0,
      similarity_threshold REAL DEFAULT 0.01,
      result_limit INTEGER DEFAULT 10
    ) RETURNS TABLE (
      id UUID,
      github_id TEXT,
      full_name TEXT,
      name TEXT,
      description TEXT,
      language TEXT,
      topics TEXT[],
      stars_count INTEGER,
      health_score REAL,
      activity_score REAL,
      first_time_contributor_friendly BOOLEAN,
      created_at TIMESTAMP,
      relevance_score REAL
    ) AS $$
    BEGIN
      -- Validate parameters first
      IF text_weight = 0.0 AND vector_weight = 0.0 THEN
        RAISE EXCEPTION '%', 'Text weight and vector weight cannot both be zero';
      END IF;
      
      IF result_limit <= 0 THEN
        RAISE EXCEPTION '%', 'Result limit must be positive';
      END IF;
      
      RETURN QUERY
      SELECT 
        r.id,
        r.github_id,
        r.full_name,
        r.name,
        COALESCE(r.description, '') as description,
        r.language,
        ARRAY['testing', 'ai', 'search']::TEXT[] as topics,
        r.stars as stars_count,
        r.health_score,
        85.0::REAL as activity_score,
        true as first_time_contributor_friendly,
        NOW() as created_at,
        CASE 
          WHEN search_text = '' THEN 0.5
          WHEN COALESCE(r.description, '') ILIKE '%' || search_text || '%' THEN 0.9
          WHEN r.name ILIKE '%' || search_text || '%' THEN 0.8
          ELSE 0.1
        END as relevance_score
      FROM repositories r
      WHERE (
        search_text = '' OR 
        COALESCE(r.description, '') ILIKE '%' || search_text || '%' OR 
        r.name ILIKE '%' || search_text || '%'
      )
      AND CASE 
        WHEN search_text = '' THEN 0.5
        WHEN COALESCE(r.description, '') ILIKE '%' || search_text || '%' THEN 0.9
        WHEN r.name ILIKE '%' || search_text || '%' THEN 0.8
        ELSE 0.1
      END >= similarity_threshold
      ORDER BY relevance_score DESC, r.health_score DESC
      LIMIT result_limit;
    END
    $$ LANGUAGE plpgsql;
    `,
    'hybrid_search_repositories function'
  )
}

export async function cleanupTestData(
  sql: NeonQueryFunction<false, false>,
  testIds: ReturnType<typeof generateTestIds>
) {
  const { repoId, userId } = testIds

  // Helper function to safely execute cleanup queries
  const safeCleanup = async (query: () => Promise<unknown>, description: string) => {
    try {
      await query()
    } catch (error) {
      // Check if error is due to closed database connection
      if (
        error instanceof Error &&
        (error.message.includes('closed') ||
          error.message.includes('null function') ||
          error.message.includes('table index is out of bounds') ||
          error.message.includes('RuntimeError'))
      ) {
        // Database is closed, skip remaining cleanup
        return false
      }
      // Log other errors in development only
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Cleanup skipped for ${description}:`, error)
      }
    }
    return true
  }

  // Order matters due to foreign key constraints
  // Stop cleanup chain if database is closed
  if (
    !(await safeCleanup(
      () => sql`
      DELETE FROM contribution_outcomes 
      WHERE opportunity_id IN (SELECT id FROM opportunities WHERE repository_id = ${repoId})
    `,
      'contribution_outcomes'
    ))
  )
    return

  if (
    !(await safeCleanup(
      () => sql`
      DELETE FROM user_repository_interactions 
      WHERE user_id = ${userId} OR repository_id = ${repoId}
    `,
      'user_repository_interactions'
    ))
  )
    return

  if (
    !(await safeCleanup(
      () => sql`DELETE FROM user_preferences WHERE user_id = ${userId}`,
      'user_preferences'
    ))
  )
    return

  if (
    !(await safeCleanup(
      () => sql`DELETE FROM opportunities WHERE repository_id = ${repoId}`,
      'opportunities'
    ))
  )
    return

  if (
    !(await safeCleanup(() => sql`DELETE FROM repositories WHERE id = ${repoId}`, 'repositories'))
  )
    return

  if (!(await safeCleanup(() => sql`DELETE FROM users WHERE id = ${userId}`, 'users'))) return

  // Clean up any leftover data with explicit type casting for PGlite compatibility
  await safeCleanup(
    () => sql`DELETE FROM repositories WHERE github_id = '12345'`,
    'test repository 12345'
  )

  await safeCleanup(
    () => sql`DELETE FROM repositories WHERE github_id = '67890'`,
    'test repository 67890'
  )

  await safeCleanup(
    () => sql`DELETE FROM repositories WHERE github_id = '54321'`,
    'test repository 54321'
  )

  await safeCleanup(
    () => sql`DELETE FROM repositories WHERE full_name LIKE 'test-org/%'`,
    'test-org repositories'
  )

  // Clean up any similar users or other test data
  await safeCleanup(
    () => sql`DELETE FROM users WHERE github_username LIKE 'perftest%'`,
    'perftest users'
  )

  await safeCleanup(
    () => sql`DELETE FROM users WHERE github_username = 'similaruser'`,
    'similar user'
  )

  await safeCleanup(
    () => sql`DELETE FROM users WHERE email LIKE 'perftest%@test.com'`,
    'perftest emails'
  )
}

// Vector utilities
export function generateEmbedding(value: number, dimensions = 1536): number[] {
  return Array(dimensions).fill(value)
}

export function generateOrthogonalEmbedding(): number[] {
  return Array.from({ length: 1536 }, (_, i) => (i % 2 === 0 ? 1.0 : -1.0))
}

/**
 * Format arrays for PostgreSQL halfvec type
 */
export function formatVector(vector: number[]): string {
  if (!Array.isArray(vector)) {
    throw new TypeError('Vector must be an array')
  }
  if (vector.length !== 1536) {
    throw new Error('Vector must have exactly 1536 dimensions for halfvec')
  }
  return `[${vector.map(v => v.toString()).join(',')}]`
}

// Test data insertion utilities
export async function insertTestRepository(
  sql: NeonQueryFunction<false, false>,
  testIds: ReturnType<typeof generateTestIds>
) {
  const { repoId } = testIds

  // Use only columns that exist in PGlite schema
  await sql`
    INSERT INTO repositories (
      id, github_id, full_name, name, description, url, language, 
      stars, forks, health_score
    ) VALUES (
      ${repoId}, '12345', 'test-org/test-repo', 'test-repo',
      'A test repository for testing AI-powered search functionality',
      'https://github.com/test-org/test-repo',
      'TypeScript', 100, 50, 85.5
    )
  `
}

export async function insertTestOpportunities(
  sql: NeonQueryFunction<false, false>,
  testIds: ReturnType<typeof generateTestIds>
) {
  const { repoId, oppId1, oppId2 } = testIds

  // Use all required columns including those added for schema compatibility
  await sql`
    INSERT INTO opportunities (
      id, repository_id, issue_number, title, description,
      difficulty, estimated_hours, embedding, view_count, application_count, status
    ) VALUES 
    (
      ${oppId1}, ${repoId}, 1, 'Fix TypeScript type errors in search module',
      'Several type errors need to be fixed in the search functionality',
      'intermediate', 4, ${formatVector(generateEmbedding(0.2))}, 100, 10, 'open'
    ),
    (
      ${oppId2}, ${repoId}, 2, 'Add AI-powered search capabilities',
      'Implement vector search using embeddings for better search results',
      'advanced', 16, ${formatVector(generateEmbedding(0.3))}, 50, 5, 'open'
    )
  `
}

export async function insertTestUser(
  sql: NeonQueryFunction<false, false>,
  testIds: ReturnType<typeof generateTestIds>
) {
  const { userId } = testIds

  // Use only columns that exist in PGlite schema, including profile_embedding and skill_level we added
  await sql`
    INSERT INTO users (
      id, github_id, github_username, email, name, skill_level, profile_embedding
    ) VALUES (
      ${userId}, '67890', 'testuser', 'test@example.com', 'Test User', 'intermediate', ${formatVector(generateEmbedding(0.25))}
    )
  `
}
