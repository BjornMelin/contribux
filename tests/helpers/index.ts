/**
 * Test Utilities Index
 * Central export for all test helper utilities with proper TypeScript support
 */

// Database utilities
export * from '../database/db-client'
// Re-export MSW setup from github directory for convenience
export { mockGitHubAPI, mswServer, setupMSW } from '../github/msw-setup'
// MSW mocking utilities
export * from './msw-factories'
// Test data factories
export * from './test-factories'
export * from './vector-test-utils'

/**
 * Complete test setup utilities for different testing scenarios
 */
export class TestSetup {
  /**
   * Setup for database tests
   */
  static async database() {
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
  static async vector() {
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
  static api() {
    const { setupMSW } = require('../github/msw-setup')
    setupMSW()

    return {
      setupMSW,
      // Import other utilities as needed
      MSWHandlerFactory: require('./msw-factories').MSWHandlerFactory,
      CommonHandlerSets: require('./msw-factories').CommonHandlerSets,
    }
  }

  /**
   * Setup for comprehensive integration tests
   */
  static async integration() {
    const [database, api] = await Promise.all([
      TestSetup.database(),
      Promise.resolve(TestSetup.api()),
    ])

    return { database, api }
  }
}

/**
 * Test cleanup utilities
 */
export class TestCleanup {
  /**
   * Reset all factory counters for test isolation
   */
  static resetCounters() {
    const { resetFactoryCounters } = require('./test-factories')
    const { resetMockFactoryCounters } = require('./msw-factories')

    resetFactoryCounters()
    resetMockFactoryCounters()
  }

  /**
   * Cleanup database resources
   */
  static async database(vectorUtils?: any) {
    if (vectorUtils && typeof vectorUtils.disconnect === 'function') {
      await vectorUtils.disconnect()
    }
  }

  /**
   * Complete test cleanup
   */
  static async all(resources?: { vectorUtils?: any }) {
    TestCleanup.resetCounters()

    if (resources?.vectorUtils) {
      await TestCleanup.database(resources.vectorUtils)
    }
  }
}

/**
 * Common test assertions for contribux-specific scenarios
 */
export class TestAssertions {
  /**
   * Assert that a vector embedding is valid
   */
  static isValidEmbedding(embedding: any): asserts embedding is number[] {
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array')
    }
    if (embedding.length !== 1536) {
      throw new Error(`Embedding must have 1536 dimensions, got ${embedding.length}`)
    }
    if (!embedding.every(v => typeof v === 'number' && !Number.isNaN(v))) {
      throw new Error('Embedding must contain only valid numbers')
    }
  }

  /**
   * Assert that similarity scores are in valid range
   */
  static isValidSimilarityScore(score: any): asserts score is number {
    if (typeof score !== 'number') {
      throw new Error('Similarity score must be a number')
    }
    if (score < -1 || score > 1) {
      throw new Error(`Similarity score must be between -1 and 1, got ${score}`)
    }
    if (Number.isNaN(score)) {
      throw new Error('Similarity score cannot be NaN')
    }
  }

  /**
   * Assert that vector search results are properly ordered
   */
  static isProperlyOrdered(results: Array<{ similarity: number }>) {
    for (let i = 1; i < results.length; i++) {
      if (results[i].similarity > results[i - 1].similarity) {
        throw new Error(`Results not properly ordered at position ${i}`)
      }
    }
  }

  /**
   * Assert that database query results have expected structure
   */
  static hasValidQueryStructure(
    result: any,
    expectedFields: string[]
  ): asserts result is Array<Record<string, any>> {
    if (!Array.isArray(result)) {
      throw new Error('Query result must be an array')
    }

    if (result.length > 0) {
      const firstRow = result[0]
      for (const field of expectedFields) {
        if (!(field in firstRow)) {
          throw new Error(`Missing expected field: ${field}`)
        }
      }
    }
  }

  /**
   * Assert that GitHub API response has expected structure
   */
  static isValidGitHubResponse(response: any, schema: any) {
    try {
      schema.parse(response)
    } catch (error) {
      throw new Error(`Invalid GitHub API response: ${(error as Error).message}`)
    }
  }
}

/**
 * Performance testing utilities
 */
export class TestPerformance {
  /**
   * Measure execution time of a function
   */
  static async measureExecutionTime<T>(
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
  static async benchmark<T>(
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
      const { result, executionTime } = await TestPerformance.measureExecutionTime(fn)
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
}

/**
 * Environment utilities for tests
 */
export class TestEnvironment {
  /**
   * Check if running in CI environment
   */
  static isCI(): boolean {
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
  static shouldSkipDatabaseTests(): boolean {
    return !process.env.DATABASE_URL && !process.env.DATABASE_URL_TEST
  }

  /**
   * Check if using local PostgreSQL
   */
  static isLocalDatabase(): boolean {
    const { isLocalPostgres } = require('../database/db-client')
    return isLocalPostgres()
  }

  /**
   * Get test timeout based on environment
   */
  static getTestTimeout(): number {
    if (TestEnvironment.isCI()) {
      return 30000 // 30 seconds for CI
    }
    if (TestEnvironment.isLocalDatabase()) {
      return 10000 // 10 seconds for local
    }
    return 15000 // 15 seconds for remote
  }
}
