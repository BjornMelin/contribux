/**
 * Test Utilities Index
 * Central export for all test helper utilities with proper TypeScript support
 */

// Database utilities
export * from '../database/db-client'
export * from './auth-test-factories'
// GitHub mock functions
export * from './github-mocks'
// MSW mocking utilities
export * from './msw-factories'
// Re-export MSW setup and handlers for convenience
export {
  createErrorHandler,
  createGraphQLHandler,
  createRateLimitHandler,
  createRepositoryHandler,
  createRepositoryIssuesHandler,
  createUserHandler,
  createUserRepositoriesHandler,
  githubHandlers,
  mockGitHubAPI,
  server as mswServer,
  setupMSW,
} from './msw-setup'
// Test assertions
export * from './test-assertions'
// Test data factories
export * from './test-factories'
export * from './vector-test-utils'

/**
 * Setup for database tests
 */
export async function setupDatabaseTests() {
  const { TEST_DATABASE_URL, executeSql } = await import('../database/db-client')

  if (!TEST_DATABASE_URL) {
    throw new Error('Database URL not configured for tests')
  }

  // Test connection
  try {
    await executeSql('SELECT 1 as test')
  } catch (error) {
    throw new Error(`Database connection failed: ${(error as Error).message}`)
  }

  return { executeSql, TEST_DATABASE_URL }
}

/**
 * Setup for vector tests
 */
export async function setupVectorTests() {
  const { VectorTestUtils } = await import('./vector-test-utils')
  const { TEST_DATABASE_URL } = await import('../database/db-client')

  if (!TEST_DATABASE_URL) {
    throw new Error('Database URL not configured for vector tests')
  }

  const vectorUtils = new VectorTestUtils(TEST_DATABASE_URL)
  await vectorUtils.connect()

  return vectorUtils
}

/**
 * Setup for API mocking tests
 */
export function setupApiTests() {
  const { setupMSW } = require('./msw-setup')
  setupMSW()

  return {
    setupMSW,
    // Import handler functions directly
    ...require('./msw-setup'),
    CommonHandlerSets: require('./msw-factories').CommonHandlerSets,
  }
}

/**
 * Setup for comprehensive integration tests
 */
export async function setupIntegrationTests() {
  const [database, api] = await Promise.all([
    setupDatabaseTests(),
    Promise.resolve(setupApiTests()),
  ])

  return { database, api }
}

/**
 * Reset all factory counters for test isolation
 */
export function resetTestCounters() {
  const { resetFactoryCounters } = require('./test-factories')
  const { resetMockFactoryCounters } = require('./msw-factories')

  resetFactoryCounters()
  resetMockFactoryCounters()
}

/**
 * Cleanup database resources
 */
export async function cleanupDatabaseResources(vectorUtils?: { disconnect?: () => Promise<void> }) {
  if (vectorUtils && typeof vectorUtils.disconnect === 'function') {
    await vectorUtils.disconnect()
  }
}

/**
 * Complete test cleanup
 */
export async function cleanupAllTestResources(resources?: {
  vectorUtils?: { disconnect?: () => Promise<void> }
}) {
  resetTestCounters()

  if (resources?.vectorUtils) {
    await cleanupDatabaseResources(resources.vectorUtils)
  }
}

/**
 * Assert that GitHub API response has expected structure
 */
export function assertValidGitHubResponse(
  response: unknown,
  schema: { parse: (data: unknown) => void }
) {
  try {
    schema.parse(response)
  } catch (error) {
    throw new Error(`Invalid GitHub API response: ${(error as Error).message}`)
  }
}

/**
 * Measure execution time of a function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; executionTime: number }> {
  const start = performance.now()
  const result = await fn()
  const end = performance.now()
  const executionTime = end - start

  if (label) {
    console.log(`${label}: ${executionTime.toFixed(2)}ms`)
  }

  return { result, executionTime }
}

/**
 * Benchmark multiple executions
 */
export async function benchmarkFunction<T>(
  fn: () => Promise<T>,
  iterations = 10,
  label?: string
): Promise<{
  results: T[]
  executionTimes: number[]
  average: number
  min: number
  max: number
}> {
  const results: T[] = []
  const executionTimes: number[] = []

  for (let i = 0; i < iterations; i++) {
    const { result, executionTime } = await measureExecutionTime(fn)
    results.push(result)
    executionTimes.push(executionTime)
  }

  const average = executionTimes.reduce((sum, time) => sum + time, 0) / iterations
  const min = Math.min(...executionTimes)
  const max = Math.max(...executionTimes)

  if (label) {
    console.log(`${label} Benchmark (${iterations} iterations):`)
    console.log(`  Average: ${average.toFixed(2)}ms`)
    console.log(`  Min: ${min.toFixed(2)}ms`)
    console.log(`  Max: ${max.toFixed(2)}ms`)
  }

  return { results, executionTimes, average, min, max }
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.JENKINS_URL ||
    process.env.BUILDKITE ||
    process.env.CIRCLECI
  )
}

/**
 * Check if database tests should be skipped
 */
export function shouldSkipDatabaseTests(): boolean {
  return !process.env.DATABASE_URL && !process.env.DATABASE_URL_TEST
}

/**
 * Check if using local PostgreSQL
 */
export function isLocalDatabase(): boolean {
  const { isLocalPostgres } = require('../database/db-client')
  return isLocalPostgres()
}

/**
 * Get test timeout based on environment
 */
export function getTestTimeout(): number {
  if (isCI()) {
    return 30000 // 30 seconds for CI
  }
  if (isLocalDatabase()) {
    return 10000 // 10 seconds for local
  }
  return 15000 // 15 seconds for remote
}
