/**
 * NextAuth.js v5 Testing Utilities
 * Comprehensive utilities for authentication state management, mocking, and test setup
 */

import type { User as AuthUser } from '@/types/auth'
import type { Email, UUID } from '@/types/base'
import type { Account, JWT, Profile, Session } from 'next-auth'
import type { NextRequest } from 'next/server'
import { type MockedFunction, vi } from 'vitest'

// =============================================================================
// Mock Data Factories
// =============================================================================

export const createMockUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'test-user-123',
  email: 'test@example.com',
  display_name: 'Test User',
  username: 'testuser',
  github_username: 'testuser',
  email_verified: true,
  two_factor_enabled: false,
  recovery_email: null,
  locked_at: null,
  failed_login_attempts: 0,
  last_login_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

export const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  user: {
    id: 'test-user-123' as UUID,
    name: 'Test User',
    email: 'test@example.com' as Email,
    image: null,
    emailVerified: null,
    connectedProviders: ['github'],
    primaryProvider: 'github',
    githubUsername: 'testuser',
  },
  expires: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
  ...overrides,
})

export const createMockJWT = (overrides: Partial<JWT> = {}): JWT => ({
  sub: 'test-user-123',
  email: 'test@example.com',
  accessToken: 'gho_test_access_token',
  refreshToken: 'ghr_test_refresh_token',
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  provider: 'github',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
  ...overrides,
})

export const createMockGitHubAccount = (overrides: Partial<Account> = {}): Account => ({
  provider: 'github',
  providerAccountId: 'github-123456',
  type: 'oauth',
  access_token: 'gho_test_access_token',
  refresh_token: 'ghr_test_refresh_token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  scope: 'read:user user:email',
  ...overrides,
})

export const createMockGoogleAccount = (overrides: Partial<Account> = {}): Account => ({
  provider: 'google',
  providerAccountId: 'google-123456',
  type: 'oauth',
  access_token: 'ya29.test_access_token',
  refresh_token: '1//test_refresh_token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  scope: 'openid email profile',
  id_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test.token',
  ...overrides,
})

export const createMockGitHubProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: '123456',
  login: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: 'https://avatars.githubusercontent.com/u/123456',
  ...overrides,
})

export const createMockGoogleProfile = (overrides: Partial<Profile> = {}): Profile => ({
  sub: '123456',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://lh3.googleusercontent.com/a/test',
  email_verified: true,
  ...overrides,
})

// =============================================================================
// Authentication State Managers
// =============================================================================

export class AuthenticationStateManager {
  private mockAuth: MockedFunction<any>
  private currentSession: Session | null = null
  private sessionHistory: Array<{ session: Session | null; timestamp: number }> = []

  constructor(mockAuth: MockedFunction<any>) {
    this.mockAuth = mockAuth
  }

  /**
   * Set the current authentication state
   */
  setAuthenticatedUser(session: Session): void {
    this.currentSession = session
    this.sessionHistory.push({ session, timestamp: Date.now() })
    this.mockAuth.mockResolvedValue(session)
  }

  /**
   * Set unauthenticated state
   */
  setUnauthenticated(): void {
    this.currentSession = null
    this.sessionHistory.push({ session: null, timestamp: Date.now() })
    this.mockAuth.mockResolvedValue(null)
  }

  /**
   * Set expired session
   */
  setExpiredSession(session: Session): void {
    const expiredSession = {
      ...session,
      expires: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
    }
    this.currentSession = expiredSession
    this.sessionHistory.push({ session: expiredSession, timestamp: Date.now() })
    this.mockAuth.mockResolvedValue(expiredSession)
  }

  /**
   * Simulate authentication error
   */
  setAuthenticationError(error: Error): void {
    this.currentSession = null
    this.mockAuth.mockRejectedValue(error)
  }

  /**
   * Get current session
   */
  getCurrentSession(): Session | null {
    return this.currentSession
  }

  /**
   * Get session history for testing session transitions
   */
  getSessionHistory(): Array<{ session: Session | null; timestamp: number }> {
    return [...this.sessionHistory]
  }

  /**
   * Clear session history
   */
  clearHistory(): void {
    this.sessionHistory = []
  }

  /**
   * Simulate multi-tab session synchronization
   */
  simulateMultiTabSession(sessions: Session[]): void {
    let callCount = 0
    this.mockAuth.mockImplementation(() => {
      const session = sessions[callCount % sessions.length]
      callCount++
      return Promise.resolve(session)
    })
  }

  /**
   * Simulate session refresh
   */
  simulateSessionRefresh(originalSession: Session, refreshedSession: Session): void {
    let callCount = 0
    this.mockAuth.mockImplementation(() => {
      if (callCount === 0) {
        callCount++
        return Promise.resolve(originalSession)
      }
      return Promise.resolve(refreshedSession)
    })
  }
}

// =============================================================================
// OAuth Flow Simulators
// =============================================================================

export class OAuthFlowSimulator {
  /**
   * Simulate GitHub OAuth flow
   */
  static simulateGitHubOAuth() {
    const state = OAuthFlowSimulator.generateStateParameter()
    const code = OAuthFlowSimulator.generateAuthorizationCode()

    return {
      // Step 1: Authorization URL
      getAuthorizationUrl: () => ({
        url: `https://github.com/login/oauth/authorize?client_id=test_client_id&scope=read:user%20user:email&state=${state}&redirect_uri=http://localhost:3000/api/auth/callback/github`,
        state,
      }),

      // Step 2: Authorization callback
      getCallbackParams: () => ({
        code,
        state,
      }),

      // Step 3: Token exchange
      mockTokenExchange: () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'gho_test_access_token',
            refresh_token: 'ghr_test_refresh_token',
            expires_in: 3600,
            token_type: 'bearer',
            scope: 'read:user user:email',
          }),
        })
      },

      // Step 4: User profile fetch
      mockProfileFetch: () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 123456,
            login: 'testuser',
            email: 'test@example.com',
            name: 'Test User',
            avatar_url: 'https://avatars.githubusercontent.com/u/123456',
          }),
        })
      },
    }
  }

  /**
   * Simulate Google OAuth flow
   */
  static simulateGoogleOAuth() {
    const state = OAuthFlowSimulator.generateStateParameter()
    const code = OAuthFlowSimulator.generateAuthorizationCode()

    return {
      // Step 1: Authorization URL
      getAuthorizationUrl: () => ({
        url: `https://accounts.google.com/oauth2/authorize?client_id=test_client_id&scope=openid%20email%20profile&state=${state}&redirect_uri=http://localhost:3000/api/auth/callback/google&response_type=code`,
        state,
      }),

      // Step 2: Authorization callback
      getCallbackParams: () => ({
        code,
        state,
      }),

      // Step 3: Token exchange
      mockTokenExchange: () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'ya29.test_access_token',
            refresh_token: '1//test_refresh_token',
            expires_in: 3600,
            token_type: 'bearer',
            scope: 'openid email profile',
            id_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test.token',
          }),
        })
      },

      // Step 4: User profile fetch
      mockProfileFetch: () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: '123456',
            email: 'test@example.com',
            name: 'Test User',
            picture: 'https://lh3.googleusercontent.com/a/test',
            email_verified: true,
          }),
        })
      },
    }
  }

  /**
   * Simulate OAuth errors
   */
  static simulateOAuthError(errorType: 'access_denied' | 'invalid_request' | 'server_error') {
    const errorDescriptions = {
      access_denied: 'User denied access',
      invalid_request: 'Invalid OAuth request',
      server_error: 'OAuth provider server error',
    }

    return {
      error: errorType,
      error_description: errorDescriptions[errorType],
      state: OAuthFlowSimulator.generateStateParameter(),
    }
  }

  private static generateStateParameter(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  private static generateAuthorizationCode(): string {
    return Array.from({ length: 40 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
  }
}

// =============================================================================
// Database Mock Helpers
// =============================================================================

export class DatabaseMockHelper {
  private mockSql: MockedFunction<any>

  constructor(mockSql: MockedFunction<any>) {
    this.mockSql = mockSql
  }

  /**
   * Mock user creation scenario
   */
  mockUserCreation(user: AuthUser, _account: Account): void {
    this.mockSql
      .mockResolvedValueOnce([]) // No existing OAuth account
      .mockResolvedValueOnce([]) // No existing user by email
      .mockResolvedValueOnce([user]) // New user created
      .mockResolvedValueOnce([]) // OAuth account created
      .mockResolvedValueOnce([]) // Security event logged
  }

  /**
   * Mock user retrieval
   */
  mockUserRetrieval(user: AuthUser): void {
    this.mockSql.mockResolvedValueOnce([user])
  }

  /**
   * Mock account linking scenario
   */
  mockAccountLinking(existingUser: AuthUser, _newAccount: Account): void {
    this.mockSql
      .mockResolvedValueOnce([]) // No existing OAuth account for new provider
      .mockResolvedValueOnce([existingUser]) // Existing user by email
      .mockResolvedValueOnce([]) // No existing provider link for user
      .mockResolvedValueOnce([]) // New provider account linked
      .mockResolvedValueOnce([]) // User profile updated
      .mockResolvedValueOnce([]) // Security event logged
  }

  /**
   * Mock token refresh scenario
   */
  mockTokenRefresh(): void {
    this.mockSql.mockResolvedValueOnce([]) // Token update successful
  }

  /**
   * Mock database error
   */
  mockDatabaseError(error: Error): void {
    this.mockSql.mockRejectedValueOnce(error)
  }

  /**
   * Mock concurrent database operations
   */
  mockConcurrentOperations(results: any[]): void {
    results.forEach(result => {
      if (result instanceof Error) {
        this.mockSql.mockRejectedValueOnce(result)
      } else {
        this.mockSql.mockResolvedValueOnce(result)
      }
    })
  }

  /**
   * Clear all mocks
   */
  clearMocks(): void {
    this.mockSql.mockClear()
  }
}

// =============================================================================
// Request Mock Utilities
// =============================================================================

export const createMockRequest = (overrides: Partial<NextRequest> = {}): NextRequest =>
  ({
    url: 'https://contribux.example.com/test',
    method: 'GET',
    headers: new Headers(),
    nextUrl: {
      pathname: '/test',
      search: '',
      searchParams: new URLSearchParams(),
      href: 'https://contribux.example.com/test',
    },
    ...overrides,
  }) as NextRequest

export const createAuthenticatedRequest = (session: Session): NextRequest => {
  const sessionToken = `next-auth.session-token=mock-session-token-${session.user.id}`

  return createMockRequest({
    headers: new Headers({
      cookie: sessionToken,
      authorization: `Bearer ${sessionToken}`,
    }),
  })
}

export const createCORSRequest = (origin: string): NextRequest => {
  return createMockRequest({
    method: 'OPTIONS',
    headers: new Headers({
      origin: origin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    }),
  })
}

// =============================================================================
// Security Test Utilities
// =============================================================================

export class SecurityTestHelper {
  /**
   * Generate CSRF token
   */
  static generateCSRFToken(): string {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  /**
   * Validate CSRF token format
   */
  static isValidCSRFToken(token: string): boolean {
    return /^[a-f0-9]{32}$/i.test(token)
  }

  /**
   * Generate malicious input samples
   */
  static getMaliciousInputSamples() {
    return {
      xssAttempts: [
        '<script>alert("xss")</script>',
        '"><script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
      ],
      sqlInjectionAttempts: [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "1' UNION SELECT * FROM users --",
        "admin'--",
      ],
      pathTraversalAttempts: [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ],
      oversizedInputs: ['x'.repeat(10000), 'x'.repeat(100000), 'x'.repeat(1000000)],
    }
  }

  /**
   * Simulate session hijacking attempt
   */
  static simulateSessionHijacking(validSession: Session) {
    return {
      originalSession: validSession,
      hijackedSession: {
        ...validSession,
        user: {
          ...validSession.user,
          id: 'hijacker-123' as UUID,
          email: 'hijacker@malicious.com' as Email,
        },
      },
      differentUserAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      differentIPAddress: '192.168.1.100',
    }
  }

  /**
   * Test rate limiting scenarios
   */
  static generateRateLimitingScenarios(userSession: Session) {
    return {
      normalUsage: Array.from({ length: 10 }, (_, i) => ({
        request: createAuthenticatedRequest(userSession),
        timestamp: Date.now() + i * 1000, // 1 second intervals
      })),
      burstTraffic: Array.from({ length: 100 }, (_, i) => ({
        request: createAuthenticatedRequest(userSession),
        timestamp: Date.now() + i * 10, // 10ms intervals
      })),
      sustainedHighVolume: Array.from({ length: 1000 }, (_, i) => ({
        request: createAuthenticatedRequest(userSession),
        timestamp: Date.now() + i * 100, // 100ms intervals
      })),
    }
  }
}

// =============================================================================
// Performance Test Utilities
// =============================================================================

export class PerformanceTestHelper {
  /**
   * Measure authentication operation performance
   */
  static async measureAuthOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ result: T; duration: number; operationName: string }> {
    const startTime = performance.now()
    const result = await operation()
    const endTime = performance.now()
    const duration = endTime - startTime

    return {
      result,
      duration,
      operationName,
    }
  }

  /**
   * Generate concurrent authentication load
   */
  static async simulateConcurrentAuth(
    authOperation: () => Promise<any>,
    concurrentUsers: number
  ): Promise<{
    results: any[]
    totalDuration: number
    averageDuration: number
    successRate: number
  }> {
    const startTime = performance.now()

    const promises = Array.from({ length: concurrentUsers }, async (_, i) => {
      try {
        const result = await authOperation()
        return { success: true, result, userIndex: i }
      } catch (error) {
        return { success: false, error, userIndex: i }
      }
    })

    const results = await Promise.all(promises)
    const endTime = performance.now()

    const successfulResults = results.filter(r => r.success)

    return {
      results,
      totalDuration: endTime - startTime,
      averageDuration: (endTime - startTime) / concurrentUsers,
      successRate: successfulResults.length / concurrentUsers,
    }
  }

  /**
   * Memory usage tracker for authentication operations
   */
  static trackMemoryUsage() {
    const measurements: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = []

    return {
      startTracking: () => {
        const interval = setInterval(() => {
          measurements.push({
            timestamp: Date.now(),
            usage: process.memoryUsage(),
          })
        }, 100) // Every 100ms

        return interval
      },

      stopTracking: (interval: NodeJS.Timeout) => {
        clearInterval(interval)
        return measurements
      },

      getMeasurements: () => measurements,
    }
  }
}

// =============================================================================
// Export All Utilities
// =============================================================================

export {
  // Main classes
  AuthenticationStateManager,
  OAuthFlowSimulator,
  DatabaseMockHelper,
  SecurityTestHelper,
  PerformanceTestHelper,
}

// =============================================================================
// Common Test Setup Helper
// =============================================================================

export const setupAuthTestEnvironment = () => {
  // Mock environment variables
  vi.mock('@/lib/validation/env', () => ({
    env: {
      NEXTAUTH_SECRET:
        'secure-test-token-32chars-minimum-key-that-is-32-characters-long-for-security',
      NEXTAUTH_URL: 'https://contribux.example.com',
      GITHUB_CLIENT_ID: 'test-github-client-id',
      GITHUB_CLIENT_SECRET: 'test-github-client-secret',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
      NODE_ENV: 'test',
    },
  }))

  // Mock database
  const mockSql = vi.fn()
  vi.mock('@/lib/db/config', () => ({
    sql: mockSql,
  }))

  // Mock NextAuth
  const mockAuth = vi.fn()
  vi.mock('@/lib/auth', () => ({
    auth: mockAuth,
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  }))

  return {
    mockSql,
    mockAuth,
    authStateManager: new AuthenticationStateManager(mockAuth),
    dbMockHelper: new DatabaseMockHelper(mockSql),
  }
}
