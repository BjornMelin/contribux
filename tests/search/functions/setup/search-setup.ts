/**
 * Search Function Test Setup and Configuration
 * Centralized setup utilities for search function testing
 */

import type { Pool } from 'pg'
import { createTestPool, getTestDatabaseUrl } from '../../../test-utils'
import { userPreferencesFixtures } from '../fixtures/search-data'
import {
  cleanupTestData,
  generateTestIds,
  insertTestOpportunities,
  insertTestRepository,
  insertTestUser,
  setupSearchFunctions,
} from '../utils/search-test-helpers'

export interface SearchTestContext {
  pool: Pool
  testIds: ReturnType<typeof generateTestIds>
}

export async function createSearchTestContext(): Promise<SearchTestContext> {
  const connectionString = getTestDatabaseUrl()
  if (!connectionString) {
    throw new Error('Test database URL not configured')
  }

  const pool = createTestPool()
  const testIds = generateTestIds()

  return { pool, testIds }
}

export async function setupSearchTestSuite(context: SearchTestContext): Promise<void> {
  const { pool } = context

  // Setup search functions
  await setupSearchFunctions(pool)
}

export async function setupSearchTestData(context: SearchTestContext): Promise<void> {
  const { pool, testIds } = context

  // Clean up any existing test data
  await cleanupTestData(pool, testIds)

  // Insert fresh test data
  await insertTestRepository(pool, testIds)
  await insertTestOpportunities(pool, testIds)
  await insertTestUser(pool, testIds)
}

export async function setupUserPreferences(
  context: SearchTestContext,
  preferences = userPreferencesFixtures.default
): Promise<void> {
  const { pool, testIds } = context

  await pool.query(
    `
    INSERT INTO user_preferences (
      user_id, preferred_contribution_types,
      max_estimated_hours, notification_frequency
    ) VALUES (
      $1, $2::contribution_type[],
      $3, $4
    )
  `,
    [
      testIds.userId,
      preferences.preferred_contribution_types,
      preferences.max_estimated_hours,
      preferences.notification_frequency,
    ]
  )
}

export async function teardownSearchTestContext(context: SearchTestContext): Promise<void> {
  const { pool, testIds } = context

  try {
    await cleanupTestData(pool, testIds)
  } catch (error) {
    console.warn('Cleanup error (non-fatal):', error)
  }

  await pool.end()
}

export async function addUserRepositoryInteraction(
  context: SearchTestContext,
  contributed = true
): Promise<void> {
  const { pool, testIds } = context

  await pool.query(
    `
    INSERT INTO user_repository_interactions (
      user_id, repository_id, contributed,
      last_interaction
    ) VALUES (
      $1, $2, $3, NOW()
    )
  `,
    [testIds.userId, testIds.repoId, contributed]
  )
}

export async function addContributionOutcome(
  context: SearchTestContext,
  opportunityId: string,
  hoursToComplete = 5
): Promise<void> {
  const { pool, testIds } = context

  await pool.query(
    `
    INSERT INTO contribution_outcomes (
      id, opportunity_id, user_id,
      started_at, completed_at, status
    ) VALUES (
      gen_random_uuid(), $1, $2,
      NOW() - INTERVAL '${hoursToComplete} hours', NOW(), 'accepted'
    )
  `,
    [opportunityId, testIds.userId]
  )
}

export async function updateOpportunityEngagement(
  context: SearchTestContext,
  opportunityId: string,
  viewCount: number,
  applicationCount: number,
  createdHoursAgo = 0
): Promise<void> {
  const { pool } = context

  let query = `
    UPDATE opportunities
    SET view_count = $2, application_count = $3
  `
  const params = [opportunityId, viewCount, applicationCount]

  if (createdHoursAgo > 0) {
    query += `, created_at = NOW() - INTERVAL '${createdHoursAgo} hours'`
  }

  query += ' WHERE id = $1'

  await pool.query(query, params)
}

export async function insertLowQualityRepository(context: SearchTestContext): Promise<string> {
  const { pool } = context
  const lowQualityRepoId = generateTestIds().repoId

  await pool.query(
    `
    INSERT INTO repositories (
      id, github_id, full_name, name, description, url, clone_url,
      owner_login, owner_type, language, topics, stars_count, health_score,
      activity_score, community_score, status, description_embedding
    ) VALUES (
      $1, 54321, 'test-org/low-quality', 'low-quality',
      'Another AI search repository with lower metrics',
      'https://github.com/test-org/low-quality',
      'https://github.com/test-org/low-quality.git',
      'test-org', 'Organization', 'JavaScript', ARRAY['ai', 'search'],
      5, 40.0, 30.0, 35.0, 'active',
      array_fill(0.1::real, ARRAY[1536])::halfvec(1536)
    )
  `,
    [lowQualityRepoId]
  )

  return lowQualityRepoId
}

export async function insertSimilarUser(context: SearchTestContext): Promise<string> {
  const { pool } = context
  const similarUserId = generateTestIds().userId

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

  return similarUserId
}
