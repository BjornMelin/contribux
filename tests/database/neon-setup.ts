/**
 * Neon-based test setup for database tests
 *
 * This replaces Docker-based test infrastructure with Neon branching,
 * providing faster, more reliable test isolation without local dependencies.
 */

import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { NeonBranchManager } from '../../src/lib/test-utils/neon-branch-manager'

// Load test environment variables
config({ path: '.env.test' })

// Validate required environment variables
const requiredEnvVars = ['NEON_API_KEY', 'NEON_PROJECT_ID', 'DATABASE_URL']
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} is required for Neon-based tests. Check .env.test file.`)
  }
}

// Global branch manager instance
let branchManager: NeonBranchManager
let testBranchId: string | null = null
let testConnectionString: string | null = null

/**
 * Setup Neon branch for the entire test suite
 */
beforeAll(async () => {
  console.log('🚀 Setting up Neon test branch...')

  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    throw new Error('NEON_API_KEY and NEON_PROJECT_ID must be set for tests')
  }

  branchManager = new NeonBranchManager({
    apiKey: process.env.NEON_API_KEY,
    projectId: process.env.NEON_PROJECT_ID,
  })

  // Create a branch for this test suite
  const suiteName = process.env.VITEST_SUITE_NAME || 'database-tests'
  const timestamp = Date.now()
  const branchName = `test-suite-${suiteName}-${timestamp}`.toLowerCase().slice(0, 63)

  try {
    const branch = await branchManager.createBranch({ name: branchName })
    testBranchId = branch.id
    testConnectionString = branch.connectionString

    console.log(`✅ Created test branch: ${branchName} (${testBranchId})`)

    // Set the connection string for all tests
    process.env.DATABASE_URL_TEST = testConnectionString

    // Run initial schema setup if needed
    await setupTestSchema(testConnectionString)
  } catch (error) {
    console.error('❌ Failed to create test branch:', error)
    throw error
  }
})

/**
 * Cleanup Neon branch after all tests complete
 */
afterAll(async () => {
  if (testBranchId && branchManager) {
    console.log('🧹 Cleaning up test branch...')
    try {
      await branchManager.deleteBranch(testBranchId)
      console.log(`✅ Deleted test branch: ${testBranchId}`)
    } catch (error) {
      console.error('❌ Failed to delete test branch:', error)
    }
  }
})

/**
 * Reset test data before each test
 */
beforeEach(async () => {
  if (testConnectionString) {
    // Clear test data between tests for isolation
    await cleanupTestData(testConnectionString)
  }
})

/**
 * Setup initial schema on the test branch
 */
async function setupTestSchema(connectionString: string): Promise<void> {
  const sql = neon(connectionString)

  try {
    // Enable required extensions
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
    await sql`CREATE EXTENSION IF NOT EXISTS "vector"`

    // The branch already has the schema from the parent branch,
    // so we don't need to recreate tables unless testing migrations
    console.log('✅ Test schema ready')
  } catch (error) {
    console.error('Failed to setup test schema:', error)
    throw error
  }
}

/**
 * Cleanup test data between tests
 */
async function cleanupTestData(connectionString: string): Promise<void> {
  const sql = neon(connectionString)

  try {
    // Truncate tables in the correct order to respect foreign keys
    await sql`
      TRUNCATE TABLE 
        contribution_outcomes,
        opportunity_matches,
        opportunity_analyses,
        opportunities,
        user_repository_interactions,
        user_preferences,
        user_skills,
        user_interests,
        notifications,
        repository_metrics,
        repositories,
        security_logs,
        users
      CASCADE
    `
  } catch (error) {
    // If tables don't exist yet, that's okay
    if (error instanceof Error && error.message?.includes('does not exist')) {
      return
    }
    console.error('Failed to cleanup test data:', error)
    throw error
  }
}

/**
 * Get the test database connection string
 */
export function getTestConnectionString(): string {
  if (!testConnectionString) {
    throw new Error('Test branch not initialized. Ensure beforeAll has run.')
  }
  return testConnectionString
}

/**
 * Get the test branch ID
 */
export function getTestBranchId(): string | null {
  return testBranchId
}

/**
 * Create a Neon SQL client for the test branch
 */
export function getTestSqlClient() {
  const connectionString = getTestConnectionString()
  return neon(connectionString)
}

/**
 * Helper to run tests with a temporary sub-branch
 */
export async function withTestSubBranch<T>(
  testName: string,
  fn: (connectionString: string) => Promise<T>
): Promise<T> {
  if (!testBranchId) {
    throw new Error('Parent test branch not initialized')
  }

  const subBranchName = `sub-${testName}-${Date.now()}`.toLowerCase().slice(0, 63)
  const subBranch = await branchManager.createBranch({
    name: subBranchName,
    parent_id: testBranchId,
  })

  try {
    return await fn(subBranch.connectionString)
  } finally {
    await branchManager.deleteBranch(subBranch.id)
  }
}

// Export the TEST_DATABASE_URL for backward compatibility
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL

console.log('Neon test setup loaded. Branch isolation enabled.')
