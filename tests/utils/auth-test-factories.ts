/**
 * Auth-specific test factories that match the actual auth types
 * These factories create objects that conform to the auth types schema
 */

import type { AdapterUser } from 'next-auth/adapters'
import { generateUUID } from '@/lib/crypto-utils'
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
} from '@/types/auth'
import type { Email, GitHubUsername, UUID } from '@/types/base'

// Counter for generating unique values
let userCounter = 1
let _sessionCounter = 1

/**
 * Create a valid User object that matches the auth types
 */
export function createTestUser(overrides: Partial<User> = {}): User {
  const id = generateUUID() as UUID
  userCounter++

  const baseUser: User = {
    id,
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
  const id = generateUUID() as UUID
  _sessionCounter++

  return {
    id,
    userId: generateUUID() as UUID,
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
    sub: generateUUID() as UUID,
    email: `test-${userCounter}@example.com` as Email,
    githubUsername: `github-user-${userCounter}` as GitHubUsername,
    authMethod: 'oauth' as AuthMethod,
    sessionId: generateUUID() as UUID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    iss: 'test-issuer',
    aud: ['test-audience'],
    jti: generateUUID() as UUID,
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
    id: generateUUID() as UUID,
    eventType: 'login_success' as AuthEventType,
    eventSeverity: 'info' as EventSeverity,
    userId: generateUUID() as UUID,
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
    id: generateUUID() as UUID,
    userId: generateUUID() as UUID,
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
    id: generateUUID() as UUID,
    userId: generateUUID() as UUID,
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
 * Create a valid NextAuth User object (compatible with signIn callback)
 */
export function createTestNextAuthUser(
  overrides: Partial<{
    id: string
    email: string
    name: string
    emailVerified: Date | null
    image?: string | null
    githubUsername?: string
  }> = {}
): {
  id: string
  email: string
  name?: string | null
  emailVerified: Date | null
  image?: string | null
  githubUsername?: string
} {
  const id = generateUUID()
  userCounter++

  return {
    id,
    email: `test-${userCounter}@example.com`,
    name: `Test User ${userCounter}`,
    emailVerified: null,
    image: null,
    githubUsername: `github-user-${userCounter}`,
    ...overrides,
  }
}

/**
 * Create a valid NextAuth AdapterUser object
 */
export function createTestAdapterUser(overrides: Partial<AdapterUser> = {}): AdapterUser {
  const id = generateUUID()
  userCounter++

  return {
    id,
    email: `test-${userCounter}@example.com`,
    emailVerified: null,
    name: `Test User ${userCounter}`,
    image: null,
    ...overrides,
  }
}

/**
 * Create a valid NextAuth Session object with proper types
 */
export function createTestNextAuthSession(
  overrides: Partial<{
    user: AdapterUser
    sessionToken: string
    userId: string
    expires: string // Note: NextAuth Session uses string, not Date
  }> = {}
): {
  user: AdapterUser
  sessionToken: string
  userId: string
  expires: string
} {
  const userId = generateUUID()
  const sessionId = generateUUID()
  _sessionCounter++

  return {
    user: createTestAdapterUser({ id: userId }),
    sessionToken: sessionId,
    userId,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now as string
    ...overrides,
  }
}

/**
 * Reset all counters for test isolation
 */
export function resetAuthFactoryCounters(): void {
  userCounter = 1
  _sessionCounter = 1
}
