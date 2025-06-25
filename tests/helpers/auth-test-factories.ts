/**
 * Auth-specific test factories that match the actual auth types
 * These factories create objects that conform to the auth types schema
 */

import type {
  AccessTokenPayload,
  AuthEventType,
  AuthMethod,
  ConsentType,
  EventSeverity,
  OAuthAccount,
  OAuthProvider,
  SecurityAuditLog,
  User,
  UserConsent,
  UserDataExport,
  UserSession,
} from '../../src/types/auth'
import type { Email, GitHubUsername, UUID } from '../../src/types/base'

// Counter for generating unique values
let userCounter = 1
let sessionCounter = 1

/**
 * Create a valid User object that matches the auth types
 */
export function createTestUser(overrides: Partial<User> = {}): User {
  const id = `user-${userCounter.toString().padStart(3, '0')}-${Date.now()}`
  userCounter++

  const baseUser: User = {
    id: id as UUID,
    email: `test-${userCounter}@example.com` as Email,
    displayName: `Test User ${userCounter}`,
    username: `testuser${userCounter}`,
    githubUsername: `github-user-${userCounter}` as GitHubUsername,
    emailVerified: true,
    twoFactorEnabled: false,
    failedLoginAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return {
    ...baseUser,
    ...overrides,
  }
}

/**
 * Create a valid UserSession object
 */
export function createTestUserSession(overrides: Partial<UserSession> = {}): UserSession {
  const id = `session-${sessionCounter.toString().padStart(3, '0')}-${Date.now()}`
  sessionCounter++

  return {
    id: id as UUID,
    userId: `user-${userCounter}` as UUID,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    authMethod: 'oauth' as AuthMethod,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Test Agent)',
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Create a valid AccessTokenPayload object
 */
export function createTestAccessTokenPayload(
  overrides: Partial<AccessTokenPayload> = {}
): AccessTokenPayload {
  return {
    sub: `user-${userCounter}` as UUID,
    email: `test-${userCounter}@example.com` as Email,
    githubUsername: `github-user-${userCounter}` as GitHubUsername,
    authMethod: 'oauth' as AuthMethod,
    sessionId: `session-${sessionCounter}` as UUID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    iss: 'test-issuer',
    aud: ['test-audience'],
    jti: `jwt-${Date.now()}` as UUID,
    ...overrides,
  }
}

/**
 * Create a valid SecurityAuditLog object
 */
export function createTestSecurityAuditLog(
  overrides: Partial<SecurityAuditLog> = {}
): SecurityAuditLog {
  const baseLog: SecurityAuditLog = {
    id: `audit-${Date.now()}` as UUID,
    eventType: 'login_success' as AuthEventType,
    eventSeverity: 'info' as EventSeverity,
    userId: `user-${userCounter}` as UUID,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Test Agent)',
    eventData: {},
    success: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return {
    ...baseLog,
    ...overrides,
  }
}

/**
 * Create a valid UserConsent object
 */
export function createTestUserConsent(overrides: Partial<UserConsent> = {}): UserConsent {
  return {
    id: `consent-${Date.now()}` as UUID,
    userId: `user-${userCounter}` as UUID,
    consentType: 'terms' as ConsentType,
    granted: true,
    version: '1.0',
    timestamp: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Test Agent)',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Create a valid OAuthAccount object
 */
export function createTestOAuthAccount(overrides: Partial<OAuthAccount> = {}): OAuthAccount {
  return {
    id: `oauth-${Date.now()}` as UUID,
    userId: `user-${userCounter}` as UUID,
    provider: 'github' as OAuthProvider,
    providerAccountId: `provider-${Date.now()}`,
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    tokenType: 'Bearer',
    scope: 'read:user',
    isPrimary: true,
    linkedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Create a valid UserDataExport object
 */
export function createTestUserDataExport(overrides: Partial<UserDataExport> = {}): UserDataExport {
  return {
    user: createTestUser(),
    oauthAccounts: [createTestOAuthAccount()],
    sessions: [createTestUserSession()],
    consents: [createTestUserConsent()],
    auditLogs: [createTestSecurityAuditLog()],
    preferences: {},
    notifications: [],
    contributions: [],
    interactions: [],
    exportedAt: new Date(),
    exportVersion: '1.0',
    ...overrides,
  }
}

/**
 * Reset all counters for test isolation
 */
export function resetAuthFactoryCounters(): void {
  userCounter = 1
  sessionCounter = 1
}
