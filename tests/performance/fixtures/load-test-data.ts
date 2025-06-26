/**
 * Test data and fixtures for load testing scenarios
 * Provides realistic data for GitHub API simulation
 */

import type { TokenInfo } from '../../../src/lib/github'

// Test configuration constants
export const LOAD_TEST_CONFIG = {
  DEFAULT_CONCURRENCY: 5,
  REDUCED_CONCURRENCY: 3,
  HIGH_CONCURRENCY: 10,
  MAX_CONCURRENCY: 40,
  INCREMENT_SIZE: 10,
  DEFAULT_TIMEOUT: 10000,
  EXTENDED_TIMEOUT: 20000,
  LONG_TIMEOUT: 30000,
  NETWORK_DELAY: 25,
  SHORT_DELAY: 5,
  STANDARD_DELAY: 25,
} as const

// Token configurations for testing
export const createTestTokens = (count: number): TokenInfo[] => {
  return Array.from({ length: count }, (_, i) => ({
    token: `ghp_test_token_${i}`,
    type: 'personal' as const,
    scopes: ['repo', 'user'],
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  }))
}

// Mock user data for testing
export const createMockUser = (id: number) => ({
  login: `user_${id}`,
  id,
  avatar_url: `https://github.com/images/user_${id}.png`,
  html_url: `https://github.com/user_${id}`,
  type: 'User',
  site_admin: false,
})

// Mock GraphQL viewer data
export const createMockViewer = (id: number) => ({
  viewer: {
    login: `user_${id}`,
    id: `gid_${id}`,
  },
  rateLimit: {
    limit: 5000,
    remaining: 5000 - id,
    resetAt: new Date(Date.now() + 3600000).toISOString(),
    cost: 1,
    nodeCount: 1,
  },
})

// Mock webhook payloads for testing
export const createWebhookPayloads = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    action: 'opened',
    number: i + 1,
    pull_request: {
      id: i + 1,
      title: `Test PR ${i + 1}`,
      user: { login: `user_${i + 1}` },
    },
  }))
}

// Rate limit scenarios
export const RATE_LIMIT_SCENARIOS = {
  NORMAL: {
    limit: 5000,
    remaining: 4900,
    reset: Math.floor((Date.now() + 3600000) / 1000),
  },
  APPROACHING_LIMIT: {
    limit: 5000,
    remaining: 100,
    reset: Math.floor((Date.now() + 3600000) / 1000),
  },
  EXCEEDED: {
    limit: 5000,
    remaining: 0,
    reset: Math.floor((Date.now() + 1000) / 1000), // 1 second
  },
} as const

// Error scenarios for testing
export const ERROR_SCENARIOS = {
  UNAUTHORIZED: {
    status: 401,
    message: 'Bad credentials',
  },
  RATE_LIMITED: {
    status: 429,
    message: 'Rate limit exceeded',
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': Math.floor((Date.now() + 1000) / 1000).toString(),
      'retry-after': '1',
    },
  },
  SERVER_ERROR: {
    status: 500,
    message: 'Internal server error',
  },
} as const

// GraphQL queries for testing
export const GRAPHQL_QUERIES = {
  VIEWER: `
    query {
      viewer {
        login
        id
      }
    }
  `,
  VIEWER_WITH_REPOS: `
    query {
      viewer {
        login
        id
        repositories(first: 10) {
          nodes {
            name
            description
          }
        }
      }
    }
  `,
} as const

// Performance thresholds for validation
export const PERFORMANCE_THRESHOLDS = {
  SUCCESS_RATE_MIN: 80,
  SUCCESS_RATE_OPTIMAL: 95,
  AVG_LATENCY_MAX: 500,
  AVG_LATENCY_OPTIMAL: 200,
  P95_LATENCY_MAX: 1000,
  P99_LATENCY_MAX: 2000,
  REQUESTS_PER_SECOND_MIN: 2,
  PERFORMANCE_VARIANCE_MAX: 200,
  CONCURRENT_IMPROVEMENT_MIN: 30, // 30% improvement over sequential
} as const

// Load testing scenarios
export const LOAD_SCENARIOS = {
  LIGHT: {
    concurrency: 5,
    requests: 10,
    duration: 5000,
  },
  MODERATE: {
    concurrency: 10,
    requests: 50,
    duration: 10000,
  },
  HEAVY: {
    concurrency: 20,
    requests: 100,
    duration: 20000,
  },
  STRESS: {
    concurrency: 40,
    requests: 200,
    duration: 30000,
  },
} as const

// Batch processing configurations
export const BATCH_CONFIG = {
  DEFAULT_SIZE: 10,
  SMALL_SIZE: 5,
  LARGE_SIZE: 20,
  DEFAULT_COUNT: 3,
  EXTENDED_COUNT: 5,
  BATCH_DELAY: 50,
} as const