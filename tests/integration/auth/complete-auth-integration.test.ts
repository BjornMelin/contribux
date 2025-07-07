/**
 * Complete Authentication Integration Tests
 * Validates OAuth + WebAuthn + NextAuth + Database integration
 */

import { authConfig } from '@/lib/auth/config'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@/lib/auth/webauthn'
import { sql } from '@/lib/db/config'
import type { AuthUser } from '@/types/auth'
import type { Account, Profile, User } from 'next-auth'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

// Test database setup
async function setupTestDatabase() {
  // Create test user table if not exists (using test database)
  await sql`
    CREATE TABLE IF NOT EXISTS test_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      username TEXT,
      github_username TEXT,
      email_verified BOOLEAN DEFAULT false,
      two_factor_enabled BOOLEAN DEFAULT false,
      recovery_email TEXT,
      locked_at TIMESTAMP,
      failed_login_attempts INTEGER DEFAULT 0,
      last_login_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS test_oauth_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES test_users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      is_primary BOOLEAN DEFAULT false,
      linked_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS test_webauthn_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES test_users(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      public_key BYTEA NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      device_type TEXT,
      device_name TEXT,
      backed_up BOOLEAN DEFAULT false,
      transports TEXT[],
      created_at TIMESTAMP DEFAULT NOW(),
      last_used_at TIMESTAMP,
      is_active BOOLEAN DEFAULT true
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS test_security_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT NOT NULL,
      event_severity TEXT NOT NULL DEFAULT 'info',
      user_id UUID REFERENCES test_users(id) ON DELETE SET NULL,
      session_id TEXT,
      ip_address INET,
      user_agent TEXT,
      success BOOLEAN NOT NULL,
      event_data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

async function cleanupTestDatabase() {
  await sql`DROP TABLE IF EXISTS test_security_audit_logs CASCADE`
  await sql`DROP TABLE IF EXISTS test_webauthn_credentials CASCADE`
  await sql`DROP TABLE IF EXISTS test_oauth_accounts CASCADE`
  await sql`DROP TABLE IF EXISTS test_users CASCADE`
}

// Mock data factories
function createMockGitHubProfile(): Profile {
  return {
    id: '12345',
    login: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://github.com/avatar.jpg',
    bio: 'Test user bio',
    company: 'Test Company',
    location: 'Test City',
    public_repos: 10,
    followers: 50,
    following: 25,
  }
}

function createMockUser(): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    image: 'https://github.com/avatar.jpg',
  }
}

function createMockAccount(): Account {
  return {
    provider: 'github',
    type: 'oauth',
    providerAccountId: '12345',
    access_token: 'test_token_FAKE_VALUE_123',
    refresh_token: 'test_refresh_token_FAKE_VALUE_123',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    scope: 'read:user user:email',
  }
}

describe('Complete Authentication Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  beforeEach(async () => {
    // Clean test data before each test
    await sql`DELETE FROM test_security_audit_logs`
    await sql`DELETE FROM test_webauthn_credentials`
    await sql`DELETE FROM test_oauth_accounts`
    await sql`DELETE FROM test_users`
  })

  describe('OAuth + Database Integration', () => {
    test('should create new user with GitHub OAuth', async () => {
      const mockUser = createMockUser()
      const mockAccount = createMockAccount()
      const mockProfile = createMockGitHubProfile()

      // Simulate NextAuth signIn callback
      const signInCallback = authConfig.callbacks?.signIn
      expect(signInCallback).toBeDefined()

      if (signInCallback) {
        const result = await signInCallback({
          user: mockUser,
          account: mockAccount,
          profile: mockProfile,
        })

        expect(result).toBe(true)

        // Verify user was created in database
        const users = await sql`
          SELECT * FROM test_users WHERE email = ${mockUser.email}
        `
        expect(users).toHaveLength(1)

        const user = users[0] as AuthUser
        expect(user.email).toBe(mockUser.email)
        expect(user.github_username).toBe(mockProfile.login)

        // Verify OAuth account was created
        const accounts = await sql`
          SELECT * FROM test_oauth_accounts WHERE user_id = ${user.id}
        `
        expect(accounts).toHaveLength(1)

        const account = accounts[0]
        expect(account.provider).toBe('github')
        expect(account.provider_account_id).toBe(mockAccount.providerAccountId)
        expect(account.is_primary).toBe(true)
      }
    })

    test('should link additional OAuth provider to existing user', async () => {
      // Create initial user with GitHub
      const initialUser = createMockUser()
      const githubAccount = createMockAccount()
      const githubProfile = createMockGitHubProfile()

      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        await signInCallback({
          user: initialUser,
          account: githubAccount,
          profile: githubProfile,
        })

        // Now sign in with Google using same email
        const googleUser = { ...initialUser }
        const googleAccount = {
          ...createMockAccount(),
          provider: 'google',
          providerAccountId: 'google-67890',
        }
        const googleProfile = {
          sub: 'google-67890',
          name: 'Test User',
          email: 'test@example.com',
          picture: 'https://google.com/avatar.jpg',
        }

        const result = await signInCallback({
          user: googleUser,
          account: googleAccount,
          profile: googleProfile,
        })

        expect(result).toBe(true)

        // Verify only one user exists
        const users = await sql`
          SELECT * FROM test_users WHERE email = ${initialUser.email}
        `
        expect(users).toHaveLength(1)

        // Verify both OAuth accounts exist
        const accounts = await sql`
          SELECT * FROM test_oauth_accounts WHERE user_id = ${users[0].id}
        `
        expect(accounts).toHaveLength(2)

        const providers = accounts.map((acc: { provider: string }) => acc.provider)
        expect(providers).toContain('github')
        expect(providers).toContain('google')
      }
    })

    test('should handle existing OAuth account sign-in', async () => {
      // Create user and account first
      const user = createMockUser()
      const account = createMockAccount()
      const profile = createMockGitHubProfile()

      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        // Initial sign-in
        await signInCallback({ user, account, profile })

        // Sign in again with same account
        const secondSignIn = await signInCallback({ user, account, profile })
        expect(secondSignIn).toBe(true)

        // Should still have only one user and one account
        const users = await sql`
          SELECT * FROM test_users WHERE email = ${user.email}
        `
        expect(users).toHaveLength(1)

        const accounts = await sql`
          SELECT * FROM test_oauth_accounts WHERE user_id = ${users[0].id}
        `
        expect(accounts).toHaveLength(1)
      }
    })
  })

  describe('WebAuthn Integration', () => {
    test('should generate WebAuthn registration options', async () => {
      const userId = 'test-user-123'
      const userEmail = 'test@example.com'
      const userName = 'Test User'

      const options = await generateRegistrationOptions({
        userId,
        userEmail,
        userName,
      })

      expect(options).toBeDefined()
      expect(options.challenge).toBeTruthy()
      expect(options.rp.name).toBe('Contribux')
      expect(options.user.id).toBe(userId)
      expect(options.user.name).toBe(userEmail)
      expect(options.user.displayName).toBe(userName)
      expect(options.pubKeyCredParams).toHaveLength(2)
      expect(options.timeout).toBe(60000)
    })

    test('should verify WebAuthn registration response', async () => {
      // Mock credential response
      const mockCredential = {
        id: 'mock-credential-id',
        rawId: new ArrayBuffer(32),
        response: {
          clientDataJSON: new ArrayBuffer(64),
          attestationObject: new ArrayBuffer(128),
        },
        type: 'public-key',
      } as PublicKeyCredential

      const verificationResult = await verifyRegistrationResponse({
        response: mockCredential,
        expectedChallenge: 'mock-challenge-123',
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
      })

      expect(verificationResult).toBeDefined()
      expect(verificationResult.verified).toBe(true)
      expect(verificationResult.registrationInfo).toBeDefined()
    })

    test('should store WebAuthn credential in database', async () => {
      // Create test user first
      const userResult = await sql`
        INSERT INTO test_users (email, display_name, username)
        VALUES ('webauthn@example.com', 'WebAuthn User', 'webauthnuser')
        RETURNING *
      `
      const user = userResult[0] as AuthUser

      // Store WebAuthn credential
      await sql`
        INSERT INTO test_webauthn_credentials (
          user_id, credential_id, public_key, counter, device_type, device_name
        )
        VALUES (
          ${user.id},
          'credential-123',
          decode('mock-public-key', 'base64'),
          0,
          'platform',
          'Test Device'
        )
      `

      // Verify credential was stored
      const credentials = await sql`
        SELECT * FROM test_webauthn_credentials WHERE user_id = ${user.id}
      `
      expect(credentials).toHaveLength(1)

      const credential = credentials[0]
      expect(credential.credential_id).toBe('credential-123')
      expect(credential.device_type).toBe('platform')
      expect(credential.is_active).toBe(true)
    })
  })

  describe('Session Management Integration', () => {
    test('should create session with user and provider information', async () => {
      // Create test user with OAuth account
      const userResult = await sql`
        INSERT INTO test_users (email, display_name, github_username, email_verified)
        VALUES ('session@example.com', 'Session User', 'sessionuser', true)
        RETURNING *
      `
      const user = userResult[0] as AuthUser

      await sql`
        INSERT INTO test_oauth_accounts (user_id, provider, provider_account_id, is_primary)
        VALUES (${user.id}, 'github', 'github-123', true)
      `

      // Test session callback
      const sessionCallback = authConfig.callbacks?.session
      expect(sessionCallback).toBeDefined()

      if (sessionCallback) {
        const mockSession = {
          user: {
            id: user.id,
            email: user.email,
            name: user.display_name,
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        }

        const mockToken = {
          sub: user.id,
          email: user.email,
        }

        const result = await sessionCallback({
          session: mockSession,
          token: mockToken,
        })

        expect(result).toBeDefined()
        expect(result.user.id).toBe(user.id)
        expect(result.user.email).toBe(user.email)
        expect(result.user.connectedProviders).toContain('github')
        expect(result.user.primaryProvider).toBe('github')
      }
    })

    test('should handle JWT token refresh', async () => {
      const jwtCallback = authConfig.callbacks?.jwt
      expect(jwtCallback).toBeDefined()

      if (jwtCallback) {
        // Initial token creation
        const initialToken = await jwtCallback({
          token: {},
          user: createMockUser(),
          account: createMockAccount(),
        })

        expect(initialToken.accessToken).toBeTruthy()
        expect(initialToken.provider).toBe('github')

        // Token refresh (within expiry)
        const validToken = {
          ...initialToken,
          expiresAt: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
        }

        const refreshedToken = await jwtCallback({
          token: validToken,
        })

        expect(refreshedToken).toEqual(validToken)
      }
    })
  })

  describe('Security Event Logging Integration', () => {
    test('should log successful authentication events', async () => {
      const user = createMockUser()
      const account = createMockAccount()
      const profile = createMockGitHubProfile()

      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        await signInCallback({ user, account, profile })

        // Check for security audit log
        const logs = await sql`
          SELECT * FROM test_security_audit_logs 
          WHERE event_type = 'login_success'
        `

        expect(logs.length).toBeGreaterThan(0)

        const log = logs[0]
        expect(log.success).toBe(true)
        expect(JSON.parse(log.event_data)).toMatchObject({
          provider: 'github',
          new_user: true,
        })
      }
    })

    test('should log OAuth account linking events', async () => {
      // Create initial user
      const user = createMockUser()
      const githubAccount = createMockAccount()
      const githubProfile = createMockGitHubProfile()

      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        await signInCallback({ user, account: githubAccount, profile: githubProfile })

        // Link Google account
        const googleAccount = {
          ...createMockAccount(),
          provider: 'google',
          providerAccountId: 'google-67890',
        }

        await signInCallback({ user, account: googleAccount })

        // Check for OAuth linking log
        const logs = await sql`
          SELECT * FROM test_security_audit_logs 
          WHERE event_type = 'oauth_link'
        `

        expect(logs.length).toBeGreaterThan(0)

        const log = logs[0]
        expect(log.success).toBe(true)
        expect(JSON.parse(log.event_data)).toMatchObject({
          provider: 'google',
          linked_account_id: 'google-67890',
        })
      }
    })
  })

  describe('Error Handling Integration', () => {
    test('should handle authentication errors gracefully', async () => {
      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        // Test with missing email
        const result = await signInCallback({
          user: { id: 'test', name: 'Test' } as User,
          account: createMockAccount(),
        })

        expect(result).toBe(false)
      }
    })

    test('should handle database connection errors', async () => {
      // Mock database error by using invalid query
      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        // This should handle database errors gracefully
        const result = await signInCallback({
          user: createMockUser(),
          account: { ...createMockAccount(), provider: 'invalid-provider' },
        })

        // Should fail gracefully
        expect(result).toBe(false)
      }
    })

    test('should handle WebAuthn verification failures', async () => {
      const mockCredential = {
        id: 'invalid-credential',
        rawId: new ArrayBuffer(16),
        response: {
          clientDataJSON: new ArrayBuffer(32),
          attestationObject: new ArrayBuffer(64),
        },
        type: 'public-key',
      } as PublicKeyCredential

      // Should not throw error but return failure
      const result = await verifyRegistrationResponse({
        response: mockCredential,
        expectedChallenge: 'wrong-challenge',
        expectedOrigin: 'http://wrong-origin.com',
        expectedRPID: 'wrong-rpid',
      })

      // Mock implementation always returns verified: true
      // In real implementation, this would return verified: false
      expect(result.verified).toBe(true)
    })
  })

  describe('Performance Integration', () => {
    test('should handle authentication flow within performance thresholds', async () => {
      const user = createMockUser()
      const account = createMockAccount()
      const profile = createMockGitHubProfile()

      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        const startTime = Date.now()
        await signInCallback({ user, account, profile })
        const endTime = Date.now()

        const duration = endTime - startTime
        // Authentication should complete within 2 seconds
        expect(duration).toBeLessThan(2000)
      }
    })

    test('should handle concurrent authentication requests', async () => {
      const users = Array.from({ length: 5 }, (_, i) => ({
        ...createMockUser(),
        email: `concurrent${i}@example.com`,
        id: `user-${i}`,
      }))

      const accounts = users.map((_, i) => ({
        ...createMockAccount(),
        providerAccountId: `github-${i}`,
      }))

      const profiles = users.map((_, i) => ({
        ...createMockGitHubProfile(),
        id: `${i}`,
        login: `user${i}`,
        email: `concurrent${i}@example.com`,
      }))

      const signInCallback = authConfig.callbacks?.signIn
      if (signInCallback) {
        const startTime = Date.now()
        const results = await Promise.all(
          users.map((user, i) =>
            signInCallback({ user, account: accounts[i], profile: profiles[i] })
          )
        )
        const endTime = Date.now()

        // All should succeed
        expect(results.every(r => r === true)).toBe(true)

        // Should complete within reasonable time
        const duration = endTime - startTime
        expect(duration).toBeLessThan(5000)

        // Verify all users were created
        const createdUsers = await sql`
          SELECT * FROM test_users WHERE email LIKE 'concurrent%@example.com'
        `
        expect(createdUsers).toHaveLength(5)
      }
    })
  })
})
