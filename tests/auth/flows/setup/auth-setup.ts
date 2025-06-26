/**
 * Authentication Test Setup
 *
 * Provides setup and teardown utilities for authentication flow tests including:
 * - Client initialization and cleanup
 * - Mock server setup and teardown
 * - Environment validation
 * - Test isolation helpers
 */

import nock from 'nock'
import { afterEach, beforeEach } from 'vitest'
import { GitHubClient } from '../../../../src/lib/github/client'
import type { IntegrationTestContext } from '../../../integration/infrastructure/test-config'

/**
 * Authentication test setup configuration
 */
export interface AuthTestSetup {
  enableMocks: boolean
  enableMetrics: boolean
  enableRetry: boolean
  timeoutMs: number
}

/**
 * Default authentication test configuration
 */
export const defaultAuthSetup: AuthTestSetup = {
  enableMocks: true,
  enableMetrics: true,
  enableRetry: false, // Disabled for faster error testing
  timeoutMs: 10000,
}

/**
 * Creates a GitHub client for testing with proper configuration
 */
export function createTestClient(
  authConfig: any,
  setup: Partial<AuthTestSetup> = {}
): GitHubClient {
  const config = { ...defaultAuthSetup, ...setup }
  
  return new GitHubClient({
    auth: authConfig,
    includeRateLimit: true,
    retry: {
      enabled: config.enableRetry,
      retries: config.enableRetry ? 3 : 0,
      doNotRetry: [403, 404], // Don't retry on these, but retry on 401
    },
  })
}

/**
 * Sets up authentication test environment
 */
export function setupAuthTests(
  context: IntegrationTestContext,
  setup: Partial<AuthTestSetup> = {}
): void {
  const config = { ...defaultAuthSetup, ...setup }
  
  beforeEach(() => {
    if (config.enableMocks) {
      nock.cleanAll()
    }
  })

  afterEach(() => {
    if (config.enableMocks) {
      nock.cleanAll()
    }
  })
}

/**
 * Validates required environment variables for authentication tests
 */
export function validateAuthEnvironment(context: IntegrationTestContext): {
  hasPersonalToken: boolean
  hasGitHubApp: boolean
  hasInstallation: boolean
} {
  return {
    hasPersonalToken: !!context.env.GITHUB_TEST_TOKEN,
    hasGitHubApp: !!(context.env.GITHUB_APP_ID && context.env.GITHUB_APP_PRIVATE_KEY),
    hasInstallation: !!context.env.GITHUB_APP_INSTALLATION_ID,
  }
}

/**
 * Skips test if required environment variables are missing
 */
export function skipIfMissingAuth(
  context: IntegrationTestContext,
  requirements: {
    personalToken?: boolean
    githubApp?: boolean
    installation?: boolean
  }
): boolean {
  const env = validateAuthEnvironment(context)
  
  if (requirements.personalToken && !env.hasPersonalToken) {
    console.log('Skipping test - GITHUB_TEST_TOKEN not available')
    return true
  }
  
  if (requirements.githubApp && !env.hasGitHubApp) {
    console.log('Skipping test - GitHub App credentials not available')
    return true
  }
  
  if (requirements.installation && !env.hasInstallation) {
    console.log('Skipping test - GitHub App installation ID not available')
    return true
  }
  
  return false
}

/**
 * Clean up client resources properly
 */
export async function cleanupClient(client: GitHubClient | null): Promise<void> {
  if (client) {
    try {
      await client.destroy()
    } catch (error) {
      console.warn('Error during client cleanup:', error)
    }
  }
}

/**
 * Enhanced test isolation helper
 */
export function withTestIsolation(testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    // Clear any existing nock interceptors
    nock.cleanAll()
    
    try {
      await testFn()
    } finally {
      // Ensure cleanup even if test throws
      nock.cleanAll()
    }
  }
}

/**
 * Measures test execution time
 */
export async function measureTestExecution<T>(
  testFn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now()
  const result = await testFn()
  const duration = Date.now() - startTime
  
  return { result, duration }
}

/**
 * Creates a timeout wrapper for tests
 */
export function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 10000
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
}