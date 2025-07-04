/**
 * Unified MSW Handlers
 * Comprehensive collection of all MSW handlers for complete API mocking
 */

import type { HttpHandler } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { authHandlers } from './auth-handlers'
// Import all handler groups
import { githubHandlers } from './github-handlers'
import { healthHandlers } from './health-handlers'
import { searchHandlers } from './search-handlers'
import { securityHandlers } from './security-handlers'

export { authHandlers, mockAuthData } from './auth-handlers'
// Re-export all handler groups for individual use
export { githubHandlers } from './github-handlers'
export { healthHandlers, mockHealthData } from './health-handlers'
export { mockSearchData, searchHandlers } from './search-handlers'
// Re-export mock data for test utilities
export { mockSecurityData, securityHandlers } from './security-handlers'

/**
 * Complete collection of all MSW handlers
 * Use this for comprehensive API mocking in tests
 */
export const allHandlers: HttpHandler[] = [
  ...githubHandlers,
  ...securityHandlers,
  ...authHandlers,
  ...searchHandlers,
  ...healthHandlers,
]

/**
 * Core application handlers (excluding external APIs)
 * Use this for testing internal API functionality
 */
export const coreHandlers: HttpHandler[] = [
  ...securityHandlers,
  ...authHandlers,
  ...searchHandlers,
  ...healthHandlers,
]

/**
 * External API handlers (GitHub, etc.)
 * Use this for testing external integrations
 */
export const externalHandlers: HttpHandler[] = [...githubHandlers]

/**
 * Authentication-only handlers
 * Use this for testing auth flows without other APIs
 */
export const authOnlyHandlers: HttpHandler[] = [...authHandlers]

/**
 * Security-focused handlers
 * Use this for security testing scenarios
 */
export const securityOnlyHandlers: HttpHandler[] = [...securityHandlers]

/**
 * Search and core functionality handlers
 * Use this for testing search without auth
 */
export const searchOnlyHandlers: HttpHandler[] = [...searchHandlers, ...healthHandlers]

/**
 * Create MSW server with specified handler groups
 */
export function createMSWServer(handlers: HttpHandler[] = allHandlers) {
  return setupServer(...handlers)
}

/**
 * Default MSW server with all handlers
 */
export const mswServer = createMSWServer(allHandlers)

/**
 * Setup MSW with all handlers for comprehensive testing
 * Use this as the default setup for most test files
 */
export function setupComprehensiveMSW() {
  beforeAll(() => {
    mswServer.listen({
      onUnhandledRequest: 'warn',
      onUnhandledError: error => {
        console.warn('MSW unhandled error:', error)
      },
    })
  })

  afterEach(() => {
    mswServer.resetHandlers()
  })

  afterAll(() => {
    mswServer.close()
  })

  return mswServer
}

/**
 * Setup MSW with custom handler selection
 */
export function setupCustomMSW(handlers: HttpHandler[]) {
  const server = createMSWServer(handlers)

  beforeAll(() => {
    server.listen({
      onUnhandledRequest: 'warn',
      onUnhandledError: error => {
        console.warn('MSW unhandled error:', error)
      },
    })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  return server
}

/**
 * Setup MSW for authentication testing only
 */
export function setupAuthMSW() {
  return setupCustomMSW(authOnlyHandlers)
}

/**
 * Setup MSW for security testing only
 */
export function setupSecurityMSW() {
  return setupCustomMSW(securityOnlyHandlers)
}

/**
 * Setup MSW for search functionality testing
 */
export function setupSearchMSW() {
  return setupCustomMSW(searchOnlyHandlers)
}

/**
 * Setup MSW for external API testing only
 */
export function setupExternalMSW() {
  return setupCustomMSW(externalHandlers)
}

/**
 * Setup MSW for core application testing (no external APIs)
 */
export function setupCoreMSW() {
  return setupCustomMSW(coreHandlers)
}

/**
 * Test scenario helpers
 */
export const testScenarios = {
  // Security scenarios
  security: {
    healthy: '?scenario=healthy',
    warning: '?scenario=warning',
    critical: '?scenario=critical',
    error: '?scenario=error',
    slow: '?scenario=slow',
  },

  // Authentication scenarios
  auth: {
    validSession: 'next-auth.session-token=mock-session-token-123',
    expiredSession: 'next-auth.session-token=mock-expired-session-token',
    noSession: '',
    mfaEnabled: '?mfa=enabled',
    mfaDisabled: '?mfa=disabled',
  },

  // Search scenarios
  search: {
    empty: '?scenario=empty',
    error: '?scenario=error',
    timeout: '?scenario=timeout',
    slow: '?scenario=slow',
    performance: '?performance-test=slow',
  },

  // Health check scenarios
  health: {
    healthy: '?scenario=healthy',
    degraded: '?scenario=degraded',
    unhealthy: '?scenario=unhealthy',
    timeout: '?scenario=timeout',
    slow: '?scenario=slow',
    withMetrics: '?include-metrics=true',
  },

  // WebAuthn scenarios
  webauthn: {
    disabled: '?scenario=disabled',
    error: '?scenario=error',
    failure: '?scenario=failure',
    invalidChallenge: '?scenario=invalid-challenge',
    noCredentials: '?scenario=no-credentials',
  },
}

/**
 * Request builders for testing
 */
export const requestBuilders = {
  withAuth: (token = 'valid-token') => ({
    headers: { Authorization: `Bearer ${token}` },
  }),

  withSession: (sessionToken = 'mock-session-token-123') => ({
    headers: { Cookie: `next-auth.session-token=${sessionToken}` },
  }),

  withCsrf: (csrfToken = 'mock-csrf-token-abcdef123456') => ({
    headers: { 'X-CSRF-Token': csrfToken },
  }),

  withJson: (data: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  authenticated: (sessionToken = 'mock-session-token-123') => ({
    headers: {
      Cookie: `next-auth.session-token=${sessionToken}`,
      'Content-Type': 'application/json',
    },
  }),
}

/**
 * Response validators for testing
 */
export const responseValidators = {
  isSuccessful: (response: Response) => response.ok,

  isUnauthorized: (response: Response) => response.status === 401,

  isForbidden: (response: Response) => response.status === 403,

  isNotFound: (response: Response) => response.status === 404,

  isServerError: (response: Response) => response.status >= 500,

  hasSecurityHeaders: (response: Response) => {
    const headers = response.headers
    return !!(
      headers.get('X-Content-Type-Options') &&
      headers.get('X-Frame-Options') &&
      headers.get('X-XSS-Protection')
    )
  },

  isRateLimited: (response: Response) => response.status === 429,

  hasRateLimitHeaders: (response: Response) => {
    const headers = response.headers
    return !!(
      headers.get('X-RateLimit-Limit') &&
      headers.get('X-RateLimit-Remaining') &&
      headers.get('X-RateLimit-Reset')
    )
  },
}

/**
 * Mock data factories for dynamic test data generation
 */
export const mockFactories = {
  createUser: (overrides = {}) => ({
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test User',
    email: 'test@example.com',
    image: 'https://avatars.githubusercontent.com/u/12345',
    ...overrides,
  }),

  createRepository: (overrides = {}) => {
    const defaults = {
      id: `repo-${Math.random().toString(36).substr(2, 9)}`,
      name: 'test-repo',
      description: 'A test repository',
      language: 'TypeScript',
      stars_count: Math.floor(Math.random() * 1000),
    }

    const merged = { ...defaults, ...overrides }

    return {
      ...merged,
      full_name: `test-org/${merged.name}`,
    }
  },

  createOpportunity: (overrides = {}) => ({
    id: `opp-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Test Opportunity',
    description: 'A test contribution opportunity',
    difficulty: 'beginner' as const,
    difficultyScore: Math.floor(Math.random() * 10) + 1,
    impactScore: Math.floor(Math.random() * 10) + 1,
    matchScore: Math.random(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  createSecurityHealth: (status: 'healthy' | 'warning' | 'critical' = 'healthy') => ({
    timestamp: new Date().toISOString(),
    status,
    services: {
      database: status === 'critical' ? 'error' : 'connected',
      webauthn: status === 'warning' ? 'unavailable' : 'available',
      rateLimit: status === 'critical' ? 'inactive' : 'active',
      securityHeaders: status === 'critical' ? 'disabled' : 'enabled',
    },
    features: {
      webauthnEnabled: status !== 'critical',
      rateLimitingEnabled: status !== 'critical',
      advancedMonitoringEnabled: status === 'healthy',
      securityDashboardEnabled: status === 'healthy',
    },
    configuration: {
      environment: 'test',
      webauthnRpId: 'localhost',
      securityLevel:
        status === 'healthy' ? 'enterprise' : status === 'warning' ? 'enhanced' : 'basic',
    },
  }),
}

/**
 * Utility functions for common test patterns
 */
export const testUtils = {
  // Wait for async operations in tests
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Create a fetch request with MSW
  createRequest: (url: string, options: RequestInit = {}) => {
    return new Request(url, {
      method: 'GET',
      ...options,
    })
  },

  // Extract data from MSW response
  extractData: async (response: Response) => {
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  },

  // Verify response structure
  verifyResponse: (response: unknown, expectedShape: Record<string, unknown>) => {
    if (typeof response !== 'object' || response === null) {
      return false
    }

    const responseObj = response as Record<string, unknown>

    return Object.keys(expectedShape).every(key => {
      return key in responseObj
    })
  },

  // Generate test IDs
  generateId: (prefix = 'test') => `${prefix}-${Math.random().toString(36).substr(2, 9)}`,
}

// Default export for convenience
export default {
  setupComprehensiveMSW,
  setupCustomMSW,
  setupAuthMSW,
  setupSecurityMSW,
  setupSearchMSW,
  setupExternalMSW,
  setupCoreMSW,
  allHandlers,
  coreHandlers,
  externalHandlers,
  testScenarios,
  requestBuilders,
  responseValidators,
  mockFactories,
  testUtils,
  mswServer,
}
