/**
 * Integration Test Utilities
 * Node.js environment helpers without DOM dependencies
 */

import type { UUID } from '@/types/base'
import { vi } from 'vitest'

/**
 * Setup function for integration tests
 * Call this in beforeEach to ensure clean state
 */
export function setupIntegrationTest() {
  // Clear all mocks
  vi.clearAllMocks()

  // Reset any global state
  if (typeof globalThis !== 'undefined') {
    // Clean any test-specific globals
    ;(globalThis as { __test_state?: unknown }).__test_state = undefined
  }
}

/**
 * Data generators for integration tests
 */
export const integrationDataGenerator = {
  generateUUID(): UUID {
    return crypto.randomUUID() as UUID
  },

  generateEmail(prefix = 'test'): string {
    return `${prefix}-${Date.now()}@example.com`
  },

  generateUsername(prefix = 'user'): string {
    return `${prefix}${Date.now()}`
  },

  generateSessionToken(): string {
    return `session_${crypto.randomUUID()}`
  },

  generateAccessToken(): string {
    return `gho_${crypto.randomUUID().replace(/-/g, '')}`
  },
}

/**
 * Mock factory helpers for integration tests
 */
interface MockUser {
  id: string
  email: string
  display_name: string
  username: string
  github_username: string
  email_verified: boolean
  two_factor_enabled: boolean
  recovery_email: string | null
  locked_at: Date | null
  failed_login_attempts: number
  last_login_at: Date
  created_at: Date
  updated_at: Date
}

export const integrationMockFactory = {
  createMockUser(overrides: Partial<MockUser> = {}) {
    return {
      id: integrationDataGenerator.generateUUID(),
      email: integrationDataGenerator.generateEmail(),
      display_name: 'Test User',
      username: integrationDataGenerator.generateUsername(),
      github_username: integrationDataGenerator.generateUsername('gh'),
      email_verified: true,
      two_factor_enabled: false,
      recovery_email: null,
      locked_at: null,
      failed_login_attempts: 0,
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    }
  },

  createMockOAuthAccount(
    provider: 'github' | 'google',
    overrides: Partial<Record<string, unknown>> = {}
  ) {
    const baseAccount = {
      provider,
      type: 'oauth',
      token_type: 'bearer',
      ...overrides,
    }

    if (provider === 'github') {
      return {
        ...baseAccount,
        providerAccountId: `github-${Date.now()}`,
        access_token: integrationDataGenerator.generateAccessToken(),
        refresh_token: `ghr_${crypto.randomUUID().replace(/-/g, '')}`,
        scope: 'read:user user:email',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        ...overrides,
      }
    }
    return {
      ...baseAccount,
      providerAccountId: `google-${Date.now()}`,
      access_token: `ya29.${crypto.randomUUID().replace(/-/g, '')}`,
      refresh_token: `1//${crypto.randomUUID().replace(/-/g, '')}`,
      scope: 'openid email profile',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      id_token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa('{"sub":"test"}')}.signature`,
      ...overrides,
    }
  },
}

/**
 * Security test helpers
 */
export const securityTestHelpers = {
  generateSecurityHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'test-agent/1.0',
    }
  },

  generateCsrfToken(): string {
    return crypto.randomUUID()
  },

  generateRateLimitKey(userId?: string): string {
    return userId ? `rate_limit:user:${userId}` : 'rate_limit:ip:127.0.0.1'
  },
}

/**
 * Export all utilities
 */
export * from './test-assertions'
export * from './test-factories'
