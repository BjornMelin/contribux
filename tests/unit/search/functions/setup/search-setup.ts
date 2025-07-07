/**
 * Search Function Test Setup and Configuration
 * Centralized setup utilities for search function testing
 */

import type { DatabaseConnection } from '@/lib/test-utils/test-database-manager'
import { TestDatabaseManager } from '@/lib/test-utils/test-database-manager'
import { userPreferencesFixtures } from '../fixtures/search-data'
import {
  cleanupTestData,
  formatVector,
  generateEmbedding,
  generateTestIds,
  insertTestOpportunities,
  insertTestRepository,
  insertTestUser,
  setupSearchFunctions,
} from '../utils/search-test-helpers'

export interface SearchTestContext {
  connection: DatabaseConnection
  testIds: ReturnType<typeof generateTestIds>
}

export async function createSearchTestContext(): Promise<SearchTestContext> {
  const dbManager = TestDatabaseManager.getInstance()
  const connection = await dbManager.getConnection('search-vector-test', {
    // Let TestDatabaseManager choose optimal strategy (respects TEST_DB_STRATEGY env var)
    cleanup: 'rollback',
    verbose: false,
  })
  const testIds = generateTestIds()

  return { connection, testIds }
}

export async function setupSearchTestSuite(context: SearchTestContext): Promise<void> {
  const { connection } = context

  // Setup search functions
  await setupSearchFunctions(connection.sql)
}

export async function setupSearchTestData(context: SearchTestContext): Promise<void> {
  const { connection, testIds } = context

  // Clean up any existing test data
  await cleanupTestData(connection.sql, testIds)

  // Insert fresh test data
  await insertTestRepository(connection.sql, testIds)
  await insertTestOpportunities(connection.sql, testIds)
  await insertTestUser(connection.sql, testIds)
}

export async function setupUserPreferences(
  context: SearchTestContext,
  preferences = userPreferencesFixtures.default
): Promise<void> {
  const { connection, testIds } = context

  await connection.sql`
    INSERT INTO user_preferences (
      user_id, preferred_contribution_types,
      max_estimated_hours, notification_frequency
    ) VALUES (
      ${testIds.userId}, ${preferences.preferred_contribution_types},
      ${preferences.max_estimated_hours}, ${preferences.notification_frequency}
    )
  `
}

export async function teardownSearchTestContext(context: SearchTestContext): Promise<void> {
  const { connection, testIds } = context

  try {
    // Only attempt cleanup if connection is still valid
    if (connection && connection.sql) {
      await cleanupTestData(connection.sql, testIds)
    }
  } catch (error) {
    // Silently ignore cleanup errors - database may already be closed
    if (process.env.NODE_ENV === 'development') {
      console.debug('Test cleanup skipped (expected):', error)
    }
  }

  try {
    // Let TestDatabaseManager handle connection cleanup
    if (connection && connection.cleanup) {
      await connection.cleanup()
    }
  } catch (error) {
    // Silently ignore connection cleanup errors
    if (process.env.NODE_ENV === 'development') {
      console.debug('Connection cleanup skipped (expected):', error)
    }
  }
}

export async function addUserRepositoryInteraction(
  context: SearchTestContext,
  contributed = true
): Promise<void> {
  const { connection, testIds } = context

  await connection.sql`
    INSERT INTO user_repository_interactions (
      user_id, repository_id, contributed,
      last_interaction
    ) VALUES (
      ${testIds.userId}, ${testIds.repoId}, ${contributed}, NOW()
    )
  `
}

export async function addContributionOutcome(
  context: SearchTestContext,
  opportunityId: string,
  hoursToComplete = 5
): Promise<void> {
  const { connection, testIds } = context

  await connection.sql`
    INSERT INTO contribution_outcomes (
      id, opportunity_id, user_id,
      started_at, completed_at, status
    ) VALUES (
      gen_random_uuid(), ${opportunityId}, ${testIds.userId},
      NOW() - INTERVAL '${hoursToComplete} hours', NOW(), 'accepted'
    )
  `
}

export async function updateOpportunityEngagement(
  context: SearchTestContext,
  opportunityId: string,
  viewCount: number,
  applicationCount: number,
  createdHoursAgo = 0
): Promise<void> {
  const { connection } = context

  if (createdHoursAgo > 0) {
    await connection.sql`
      UPDATE opportunities
      SET view_count = ${viewCount}, application_count = ${applicationCount},
          created_at = NOW() - INTERVAL '${createdHoursAgo} hours'
      WHERE id = ${opportunityId}
    `
  } else {
    await connection.sql`
      UPDATE opportunities
      SET view_count = ${viewCount}, application_count = ${applicationCount}
      WHERE id = ${opportunityId}
    `
  }
}

export async function insertLowQualityRepository(context: SearchTestContext): Promise<string> {
  const { connection } = context
  const lowQualityRepoId = generateTestIds().repoId

  await connection.sql`
    INSERT INTO repositories (
      id, github_id, full_name, name, description, url,
      language, stars, forks, health_score
    ) VALUES (
      ${lowQualityRepoId}, '54321', 'test-org/low-quality', 'low-quality',
      'Another AI search repository with lower metrics',
      'https://github.com/test-org/low-quality',
      'JavaScript', 5, 2, 40.0
    )
  `

  return lowQualityRepoId
}

export async function insertSimilarUser(context: SearchTestContext): Promise<string> {
  const { connection } = context
  const similarUserId = generateTestIds().userId

  await connection.sql`
    INSERT INTO users (
      id, github_id, github_username, email, name, skill_level, profile_embedding
    ) VALUES (
      ${similarUserId}, '11111', 'similaruser', 'similar@example.com', 'Similar User', 'intermediate',
      ${formatVector(generateEmbedding(0.26))}
    )
  `

  return similarUserId
}
