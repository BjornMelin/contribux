/**
 * Authentication Test Helpers
 *
 * Shared utilities for authentication flow testing including:
 * - Token validation helpers
 * - Authentication state management
 * - Rate limit header validation
 * - Performance measurement utilities
 */

import type { GitHubClient } from '../../../../src/lib/github/client'
import type { IntegrationTestContext } from '../../../integration/infrastructure/test-config'

export interface TokenInfo {
  token: string
  type: 'personal' | 'app' | 'oauth'
  scopes?: string[]
  expiresAt?: Date
}

export interface AuthMetrics {
  authenticationType: string
  duration: number
  statusCode: number
  rateLimitRemaining?: number
  rateLimitLimit?: number
}

/**
 * Validates authentication response and extracts metrics
 */
export async function validateAuthResponse(
  client: GitHubClient,
  context: IntegrationTestContext,
  authType: string
): Promise<AuthMetrics> {
  const startTime = Date.now()

  try {
    const user = await client.rest.users.getAuthenticated()
    const duration = Date.now() - startTime

    // Validate basic response structure
    expect(user.data).toBeDefined()
    expect(user.data.login).toBeTruthy()
    expect(user.data.type).toBeDefined()

    // Extract rate limit information
    const rateLimitRemaining = user.headers['x-ratelimit-remaining']
      ? Number.parseInt(user.headers['x-ratelimit-remaining'])
      : undefined
    const rateLimitLimit = user.headers['x-ratelimit-limit']
      ? Number.parseInt(user.headers['x-ratelimit-limit'])
      : undefined

    const metrics: AuthMetrics = {
      authenticationType: authType,
      duration,
      statusCode: 200,
      rateLimitRemaining,
      rateLimitLimit,
    }

    // Record metrics if collector available
    if (context.metricsCollector) {
      context.metricsCollector.recordApiCall(`auth.${authType}.success`, duration, 200)
      if (rateLimitRemaining && rateLimitLimit) {
        context.metricsCollector.recordRateLimit('core', rateLimitRemaining, rateLimitLimit)
      }
    }

    return metrics
  } catch (error) {
    const duration = Date.now() - startTime

    // Record failure metrics
    if (context.metricsCollector) {
      context.metricsCollector.recordApiCall(`auth.${authType}.failure`, duration, 401)
    }

    throw error
  }
}

/**
 * Validates rate limit headers in response
 */
export function validateRateLimitHeaders(headers: Record<string, string>): void {
  const requiredHeaders = [
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-ratelimit-resource',
  ]

  for (const header of requiredHeaders) {
    expect(headers[header]).toBeDefined()
  }

  // Validate numeric values
  const limit = Number.parseInt(headers['x-ratelimit-limit'])
  const remaining = Number.parseInt(headers['x-ratelimit-remaining'])
  const reset = Number.parseInt(headers['x-ratelimit-reset'])

  expect(limit).toBeGreaterThan(0)
  expect(remaining).toBeGreaterThanOrEqual(0)
  expect(remaining).toBeLessThanOrEqual(limit)
  expect(reset).toBeGreaterThan(Math.floor(Date.now() / 1000))
}

/**
 * Creates a test token with specified properties
 */
export function createTestToken(options: Partial<TokenInfo> = {}): TokenInfo {
  return {
    token: options.token || 'ghp_test_token_123456789',
    type: options.type || 'personal',
    scopes: options.scopes || ['repo', 'user'],
    expiresAt: options.expiresAt || new Date(Date.now() + 3600000), // 1 hour from now
  }
}

/**
 * Validates token format based on type
 */
export function validateTokenFormat(token: string, type: 'personal' | 'app' | 'oauth'): boolean {
  switch (type) {
    case 'personal':
      return /^ghp_[A-Za-z0-9_]{36}$/.test(token)
    case 'app':
      return /^ghs_[A-Za-z0-9_]{36}$/.test(token)
    case 'oauth':
      return /^gho_[A-Za-z0-9_]{36}$/.test(token)
    default:
      return false
  }
}

/**
 * Measures authentication performance
 */
export async function measureAuthPerformance<T>(
  name: string,
  operation: () => Promise<T>,
  context: IntegrationTestContext
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now()
  const result = await operation()
  const duration = Date.now() - startTime

  // Record performance metrics
  if (context.metricsCollector) {
    context.metricsCollector.recordApiCall(name, duration, 200)
  }

  return { result, duration }
}

/**
 * Validates authentication scopes
 */
export function validateAuthScopes(
  headers: Record<string, string>,
  requiredScopes: string[]
): void {
  const scopes = headers['x-oauth-scopes']
  if (!scopes) {
    console.warn('No OAuth scopes header found')
    return
  }

  const availableScopes = scopes.split(',').map(s => s.trim())

  for (const requiredScope of requiredScopes) {
    expect(availableScopes).toContain(requiredScope)
  }
}
