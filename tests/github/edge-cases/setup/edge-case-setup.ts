/**
 * Edge Case Test Configuration and Setup
 *
 * Provides common setup, configuration, and utilities specifically
 * for edge case testing scenarios.
 */

import { afterEach, beforeEach } from 'vitest'
import { GitHubClient } from '@/lib/github'
import type { GitHubClientConfig } from '@/lib/github/client'
import { mswServer } from '../../msw-setup'
import { createTrackedClient, setupGitHubTestIsolation } from '../../test-helpers'

/**
 * Standard configuration for edge case testing
 */
export const EDGE_CASE_CONFIG: Partial<GitHubClientConfig> = {
  auth: { type: 'token', token: 'test_token' },
  retry: { retries: 0 }, // Disable retries for faster edge case tests
  throttle: {
    onRateLimit: () => false, // Don't retry on rate limit
    onSecondaryRateLimit: () => false, // Don't retry on secondary rate limit
  },
  cache: {
    maxAge: 100, // Short cache for testing
    maxSize: 3, // Small cache size to test eviction
  },
}

/**
 * Configuration for authentication edge case testing
 */
export const AUTH_EDGE_CASE_CONFIG: Partial<GitHubClientConfig> = {
  retry: { retries: 0 },
  // No auth config - for testing public endpoints
}

/**
 * Configuration for rate limiting edge case testing
 */
export const RATE_LIMIT_EDGE_CASE_CONFIG: Partial<GitHubClientConfig> = {
  auth: { type: 'token', token: 'test_token' },
  retry: { retries: 0 },
  throttle: {
    onRateLimit: () => false,
    onSecondaryRateLimit: () => false,
  },
  userAgent: 'edge-case-test/1.0.0',
}

/**
 * Configuration for timeout testing
 */
export const TIMEOUT_EDGE_CASE_CONFIG: Partial<GitHubClientConfig> = {
  auth: { type: 'token', token: 'test_token' },
  retry: { retries: 0 },
  request: {
    timeout: 1000, // Short timeout for testing
  },
}

/**
 * Setup enhanced edge case test isolation
 */
export function setupEdgeCaseTestIsolation() {
  // Use base GitHub test isolation
  setupGitHubTestIsolation()

  beforeEach(() => {
    // Additional edge case specific setup

    // Clear any edge case specific state
    if ((global as Record<string, unknown>).__edgeCaseTestState) {
      ;(global as Record<string, unknown>).__edgeCaseTestState = undefined
    }

    // Reset MSW to clean state for edge case testing
    mswServer.resetHandlers()
  })

  afterEach(() => {
    // Clean up any edge case specific handlers
    mswServer.resetHandlers()

    // Clear edge case test state
    if ((global as Record<string, unknown>).__edgeCaseTestState) {
      ;(global as Record<string, unknown>).__edgeCaseTestState = undefined
    }
  })
}

/**
 * Create a client specifically configured for edge case testing
 */
export function createEdgeCaseClient(config?: Partial<GitHubClientConfig>): GitHubClient {
  const mergedConfig = {
    ...EDGE_CASE_CONFIG,
    ...config,
  }

  return createTrackedClient(GitHubClient, mergedConfig)
}

/**
 * Create a client for authentication edge case testing
 */
export function createAuthEdgeCaseClient(config?: Partial<GitHubClientConfig>): GitHubClient {
  const mergedConfig = {
    ...AUTH_EDGE_CASE_CONFIG,
    ...config,
  }

  return createTrackedClient(GitHubClient, mergedConfig)
}

/**
 * Create a client for rate limiting edge case testing
 */
export function createRateLimitEdgeCaseClient(config?: Partial<GitHubClientConfig>): GitHubClient {
  const mergedConfig = {
    ...RATE_LIMIT_EDGE_CASE_CONFIG,
    ...config,
  }

  return createTrackedClient(GitHubClient, mergedConfig)
}

/**
 * Create a client for timeout testing
 */
export function createTimeoutEdgeCaseClient(config?: Partial<GitHubClientConfig>): GitHubClient {
  const mergedConfig = {
    ...TIMEOUT_EDGE_CASE_CONFIG,
    ...config,
  }

  return createTrackedClient(GitHubClient, mergedConfig)
}

/**
 * Common test parameters for edge case scenarios
 */
export const EDGE_CASE_PARAMS = {
  // Repository parameters for testing
  MALFORMED: {
    owner: 'malformed-test',
    repo: 'malformed-repo-unique',
  },
  SERVER_ERROR: {
    owner: 'server-error-test',
    repo: 'server-error-repo-unique',
  },
  VALIDATION_ERROR: {
    owner: 'validation-test',
    repo: 'validation-error-repo-unique',
  },
  RATE_LIMITED: {
    owner: 'test',
    repo: 'rate-limited-unique',
  },
  SECONDARY_RATE_LIMITED: {
    owner: 'test',
    repo: 'secondary-limit-unique',
  },
  BAD_CREDENTIALS: {
    owner: 'test',
    repo: 'bad-credentials-unique',
  },
  NULL_VALUES: {
    owner: 'null-test',
    repo: 'null-values-repo',
  },
  NULL_USER_ISSUE: {
    owner: 'null-user-test',
    repo: 'null-user-repo',
    issueNumber: 1,
  },
  WRONG_TYPES: {
    owner: 'owner',
    repo: 'bad-types',
  },
  MISSING_FIELDS: {
    owner: 'owner',
    repo: 'test-repo',
  },
  LONG_DESCRIPTION: {
    owner: 'owner',
    repo: 'long-desc-repo',
  },
  SINGLE_CHAR: {
    owner: 'a',
    repo: 'b',
  },
  SPECIAL_CHARS: {
    owner: 'owner',
    repo: 'repo-with-dash_and_underscore.dot',
  },
} as const

/**
 * Common search queries for edge case testing
 */
export const EDGE_CASE_QUERIES = {
  EMPTY_RESULTS: 'nonexistentquery12345unique',
  LARGE_PAGE: 'javascriptlargepage',
  SPECIAL_SYNTAX: [
    'language:JavaScript',
    'topic:"web development"',
    'user:octocat stars:>10',
    'org:github fork:true',
  ],
} as const

/**
 * Helper to create edge case test scenarios
 */
export interface EdgeCaseScenario {
  name: string
  description: string
  config?: Partial<GitHubClientConfig>
  expectedOutcome: 'success' | 'error'
  expectedStatus?: number
}

/**
 * Predefined edge case scenarios
 */
export const PREDEFINED_SCENARIOS: Record<string, EdgeCaseScenario> = {
  NETWORK_TIMEOUT: {
    name: 'Network Timeout',
    description: 'Test network timeout handling',
    config: TIMEOUT_EDGE_CASE_CONFIG,
    expectedOutcome: 'error',
  },
  MALFORMED_JSON: {
    name: 'Malformed JSON Response',
    description: 'Test malformed JSON response handling',
    expectedOutcome: 'error',
  },
  SERVER_ERROR: {
    name: 'Server Error',
    description: 'Test 500 server error handling',
    expectedOutcome: 'error',
    expectedStatus: 500,
  },
  VALIDATION_ERROR: {
    name: 'Validation Error',
    description: 'Test 422 validation error handling',
    expectedOutcome: 'error',
    expectedStatus: 422,
  },
  RATE_LIMIT_EXCEEDED: {
    name: 'Rate Limit Exceeded',
    description: 'Test rate limit error handling',
    config: RATE_LIMIT_EDGE_CASE_CONFIG,
    expectedOutcome: 'error',
    expectedStatus: 403,
  },
  BAD_AUTHENTICATION: {
    name: 'Bad Authentication',
    description: 'Test invalid authentication handling',
    expectedOutcome: 'error',
    expectedStatus: 401,
  },
}

/**
 * Test timeout for edge case scenarios (shorter than normal tests)
 */
export const EDGE_CASE_TIMEOUT = 5000 // 5 seconds

/**
 * Test retry attempts for edge case scenarios
 */
export const EDGE_CASE_RETRY_ATTEMPTS = 0 // No retries for faster testing
