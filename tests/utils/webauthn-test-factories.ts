/**
 * WebAuthn Test Factories and Utilities
 *
 * Provides factory functions and utilities for creating test data
 * for WebAuthn credential testing including:
 * - Test data factories
 * - Mock credential generators
 * - Database seeding utilities
 * - Cleanup helpers
 */

import type { NewUser, NewWebAuthnCredential } from '@/lib/db/schema'
import { sql } from '../unit/database/db-client'

/**
 * Generate a random GitHub ID for testing
 */
export function generateTestGitHubId(): number {
  return Math.floor(Math.random() * 900000000) + 100000000 // 9-digit number
}

/**
 * Generate a random username for testing
 */
export function generateTestUsername(prefix = 'test_user'): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`
}

/**
 * Generate a random email for testing
 */
export function generateTestEmail(username?: string): string {
  const user = username || generateTestUsername()
  return `${user}@webauthn-test.example`
}

/**
 * Generate a valid base64url-encoded credential ID
 */
export function generateCredentialId(prefix = 'test_cred'): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  const base64url = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  return `${prefix}_${base64url.slice(0, 20)}_${Date.now()}`
}

/**
 * Generate a valid base64-encoded public key
 */
export function generatePublicKey(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(64))
  return btoa(String.fromCharCode(...randomBytes))
}

/**
 * Generate BYTEA-formatted public key for database insertion
 */
export function generatePublicKeyBytea(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  return `\\x${Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Factory functions for creating test user data
 */

// Counter for generating unique test users
let userIdCounter = 0

export function createUser(overrides: Partial<NewUser> = {}): NewUser {
  userIdCounter++

  return {
    githubId: generateTestGitHubId(),
    username: generateTestUsername(),
    email: generateTestEmail(),
    name: `Test User ${userIdCounter}`,
    avatarUrl: `https://github.com/images/test-avatar-${userIdCounter}.png`,
    profile: {
      bio: `Test user ${userIdCounter} for WebAuthn testing`,
      location: 'Test City',
      company: 'Test Company',
      publicRepos: 10,
      followers: 5,
      following: 3,
    },
    preferences: {
      theme: 'light' as const,
      emailNotifications: true,
      pushNotifications: false,
      difficultyPreference: 'intermediate' as const,
    },
    ...overrides,
  }
}

export function createMinimalUser(
  overrides: Partial<NewUser> = {}
): Pick<NewUser, 'githubId' | 'username'> & Partial<NewUser> {
  return {
    githubId: generateTestGitHubId(),
    username: generateTestUsername(),
    ...overrides,
  }
}

// Legacy exports for backward compatibility
export const UserFactory = {
  create: createUser,
  createMinimal: createMinimalUser,
} as const

/**
 * Factory functions for creating WebAuthn credential test data
 */

// Counter for generating unique test credentials
let credentialIdCounter = 0

export function createWebAuthnCredential(
  userId: string,
  overrides: Partial<NewWebAuthnCredential> = {}
): NewWebAuthnCredential {
  credentialIdCounter++

  return {
    userId,
    credentialId: generateCredentialId(),
    publicKey: generatePublicKey(),
    counter: 0,
    deviceName: `Test Device ${credentialIdCounter}`,
    ...overrides,
  }
}

export function createMinimalWebAuthnCredential(
  userId: string,
  overrides: Partial<NewWebAuthnCredential> = {}
): NewWebAuthnCredential {
  return {
    userId,
    credentialId: generateCredentialId(),
    publicKey: generatePublicKey(),
    counter: 0,
    ...overrides,
  }
}

export function createMultipleWebAuthnCredentials(
  userId: string,
  count: number
): NewWebAuthnCredential[] {
  return Array.from({ length: count }, (_, index) =>
    createWebAuthnCredential(userId, {
      deviceName: `Test Device ${index + 1}`,
      counter: index,
    })
  )
}

export function createWebAuthnCredentialWithBytea(
  userId: string,
  overrides: Partial<Omit<NewWebAuthnCredential, 'publicKey'>> & { publicKey?: string } = {}
): Omit<NewWebAuthnCredential, 'publicKey'> & { publicKey: string } {
  return {
    ...createMinimalWebAuthnCredential(userId, overrides),
    publicKey: generatePublicKeyBytea(),
  }
}

// Legacy exports for backward compatibility
export const WebAuthnCredentialFactory = {
  create: createWebAuthnCredential,
  createMinimal: createMinimalWebAuthnCredential,
  createMultiple: createMultipleWebAuthnCredentials,
  createWithBytea: createWebAuthnCredentialWithBytea,
} as const

/**
 * Test data seeder for WebAuthn scenarios
 */
export class WebAuthnTestSeeder {
  private createdUsers: string[] = []
  private createdCredentials: string[] = []

  /**
   * Create a test user in the database
   */
  async createUser(
    userData?: Partial<NewUser>
  ): Promise<{ id: string; githubId: number; username: string }> {
    const user = UserFactory.create(userData)

    const result = await sql`
      INSERT INTO users (github_id, username, email, name, avatar_url, profile, preferences)
      VALUES (
        ${user.githubId}, 
        ${user.username}, 
        ${user.email}, 
        ${user.name}, 
        ${user.avatarUrl}, 
        ${JSON.stringify(user.profile)}, 
        ${JSON.stringify(user.preferences)}
      )
      RETURNING id, github_id, username
    `

    const createdUser = result[0]
    this.createdUsers.push(createdUser.id)

    return {
      id: createdUser.id,
      githubId: createdUser.github_id,
      username: createdUser.username,
    }
  }

  /**
   * Create a minimal test user in the database
   */
  async createMinimalUser(
    userData?: Partial<NewUser>
  ): Promise<{ id: string; githubId: number; username: string }> {
    const user = UserFactory.createMinimal(userData)

    const result = await sql`
      INSERT INTO users (github_id, username)
      VALUES (${user.githubId}, ${user.username})
      RETURNING id, github_id, username
    `

    const createdUser = result[0]
    this.createdUsers.push(createdUser.id)

    return {
      id: createdUser.id,
      githubId: createdUser.github_id,
      username: createdUser.username,
    }
  }

  /**
   * Create a WebAuthn credential in the database
   */
  async createCredential(
    userId: string,
    credentialData?: Partial<NewWebAuthnCredential>
  ): Promise<{ id: string; credentialId: string; userId: string }> {
    const credential = WebAuthnCredentialFactory.create(userId, credentialData)

    const result = await sql`
      INSERT INTO webauthn_credentials (
        user_id, 
        credential_id, 
        public_key, 
        counter, 
        device_name
      )
      VALUES (
        ${credential.userId}, 
        ${credential.credentialId}, 
        ${credential.publicKey}, 
        ${credential.counter}, 
        ${credential.deviceName}
      )
      RETURNING id, credential_id, user_id
    `

    const createdCredential = result[0]
    this.createdCredentials.push(createdCredential.id)

    return {
      id: createdCredential.id,
      credentialId: createdCredential.credential_id,
      userId: createdCredential.user_id,
    }
  }

  /**
   * Create a WebAuthn credential with BYTEA public key for database testing
   */
  async createCredentialWithBytea(
    userId: string,
    credentialData?: Partial<Omit<NewWebAuthnCredential, 'publicKey'>>
  ): Promise<{ id: string; credentialId: string; userId: string }> {
    const credential = WebAuthnCredentialFactory.createWithBytea(userId, credentialData)

    const result = await sql`
      INSERT INTO webauthn_credentials (
        user_id, 
        credential_id, 
        public_key, 
        counter, 
        device_name
      )
      VALUES (
        ${credential.userId}, 
        ${credential.credentialId}, 
        ${credential.publicKey}, 
        ${credential.counter}, 
        ${credential.deviceName}
      )
      RETURNING id, credential_id, user_id
    `

    const createdCredential = result[0]
    this.createdCredentials.push(createdCredential.id)

    return {
      id: createdCredential.id,
      credentialId: createdCredential.credential_id,
      userId: createdCredential.user_id,
    }
  }

  /**
   * Create multiple WebAuthn credentials for a user
   */
  async createMultipleCredentials(
    userId: string,
    count: number,
    baseCredentialData?: Partial<NewWebAuthnCredential>
  ): Promise<Array<{ id: string; credentialId: string; userId: string }>> {
    const credentials = WebAuthnCredentialFactory.createMultiple(userId, count)
    const results = []

    for (let i = 0; i < credentials.length; i++) {
      const credential = { ...credentials[i], ...baseCredentialData }
      const result = await this.createCredential(userId, credential)
      results.push(result)
    }

    return results
  }

  /**
   * Create a complete test scenario: user with credentials
   */
  async createUserWithCredentials(
    credentialCount = 1,
    userData?: Partial<NewUser>,
    credentialData?: Partial<NewWebAuthnCredential>
  ): Promise<{
    user: { id: string; githubId: number; username: string }
    credentials: Array<{ id: string; credentialId: string; userId: string }>
  }> {
    const user = await this.createUser(userData)
    const credentials = await this.createMultipleCredentials(
      user.id,
      credentialCount,
      credentialData
    )

    return { user, credentials }
  }

  /**
   * Clean up all created test data
   */
  async cleanup(): Promise<void> {
    // Delete users (which will cascade delete credentials)
    if (this.createdUsers.length > 0) {
      await sql`
        DELETE FROM users 
        WHERE id = ANY(${this.createdUsers})
      `
    }

    // Clear tracking arrays
    this.createdUsers = []
    this.createdCredentials = []
  }

  /**
   * Get all created user IDs
   */
  getCreatedUserIds(): string[] {
    return [...this.createdUsers]
  }

  /**
   * Get all created credential IDs
   */
  getCreatedCredentialIds(): string[] {
    return [...this.createdCredentials]
  }
}

/**
 * Mock WebAuthn authentication data utility functions
 */

/**
 * Generate mock WebAuthn registration data
 */
export function generateWebAuthnRegistrationData() {
  return {
    credentialId: generateCredentialId(),
    publicKey: generatePublicKey(),
    counter: 0,
    attestationObject: btoa('mock_attestation_object'),
    clientDataJSON: btoa(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: 'mock_challenge',
        origin: 'https://localhost:3000',
      })
    ),
  }
}

/**
 * Generate mock WebAuthn authentication data
 */
export function generateWebAuthnAuthenticationData(credentialId: string, counter = 1) {
  return {
    credentialId,
    signature: btoa('mock_signature_data'),
    authenticatorData: btoa('mock_authenticator_data'),
    clientDataJSON: btoa(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: 'mock_auth_challenge',
        origin: 'https://localhost:3000',
      })
    ),
    counter,
  }
}

/**
 * Generate mock challenge for WebAuthn operations
 */
export function generateWebAuthnChallenge(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Legacy exports for backward compatibility
export const WebAuthnMockData = {
  generateRegistrationData: generateWebAuthnRegistrationData,
  generateAuthenticationData: generateWebAuthnAuthenticationData,
  generateChallenge: generateWebAuthnChallenge,
} as const

/**
 * Database transaction helper utility for WebAuthn tests
 */

/**
 * Run a test function within a database transaction that will be rolled back
 * Note: This requires a PostgreSQL connection that supports transactions
 */
export async function withWebAuthnTestRollback<T>(
  testFn: (seeder: WebAuthnTestSeeder) => Promise<T>
): Promise<T> {
  const seeder = new WebAuthnTestSeeder()

  try {
    const result = await testFn(seeder)
    return result
  } finally {
    await seeder.cleanup()
  }
}

// Legacy wrapper for backward compatibility
export const WebAuthnTestTransaction = {
  withRollback: withWebAuthnTestRollback,
} as const

/**
 * Performance testing utilities for WebAuthn operations
 */

/**
 * Measure query execution time
 */
export async function measureQueryTime<T>(
  queryFn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const startTime = process.hrtime.bigint()
  const result = await queryFn()
  const endTime = process.hrtime.bigint()

  const duration = Number(endTime - startTime) / 1_000_000 // Convert to milliseconds

  return { result, duration }
}

/**
 * Create bulk test data for performance testing
 */
export async function createBulkTestData(
  seeder: WebAuthnTestSeeder,
  userCount: number,
  credentialsPerUser: number
): Promise<{
  users: Array<{ id: string; githubId: number; username: string }>
  totalCredentials: number
}> {
  const users = []
  let totalCredentials = 0

  for (let i = 0; i < userCount; i++) {
    const user = await seeder.createMinimalUser()
    const credentials = await seeder.createMultipleCredentials(user.id, credentialsPerUser)

    users.push(user)
    totalCredentials += credentials.length
  }

  return { users, totalCredentials }
}

/**
 * Run performance benchmark for a specific operation
 */
export async function benchmark<T>(
  name: string,
  operation: () => Promise<T>,
  iterations = 10
): Promise<{
  name: string
  averageDuration: number
  minDuration: number
  maxDuration: number
  totalDuration: number
  iterations: number
}> {
  const durations: number[] = []

  for (let i = 0; i < iterations; i++) {
    const { duration } = await measureQueryTime(operation)
    durations.push(duration)
  }

  const totalDuration = durations.reduce((sum, d) => sum + d, 0)
  const averageDuration = totalDuration / iterations
  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)

  return {
    name,
    averageDuration,
    minDuration,
    maxDuration,
    totalDuration,
    iterations,
  }
}

/**
 * Validation helper for WebAuthn test assertions
 */

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Validate base64url format
 */
export function isValidBase64Url(str: string): boolean {
  const base64urlRegex = /^[A-Za-z0-9_-]+$/
  return base64urlRegex.test(str)
}

/**
 * Validate base64 format
 */
export function isValidBase64(str: string): boolean {
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  return base64Regex.test(str)
}

/**
 * Validate timestamp format
 */
export function isValidTimestamp(timestamp: string | Date): boolean {
  const date = new Date(timestamp)
  return !Number.isNaN(date.getTime())
}

/**
 * Validate WebAuthn credential structure
 */
export function validateCredentialStructure(credential: unknown): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Type guard to ensure credential is an object
  if (!credential || typeof credential !== 'object') {
    errors.push('Credential must be an object')
    return { isValid: false, errors }
  }

  const cred = credential as Record<string, unknown>

  if (!cred.id || !isValidUUID(cred.id as string)) {
    errors.push('Invalid or missing credential ID (UUID)')
  }

  if (!cred.user_id || !isValidUUID(cred.user_id as string)) {
    errors.push('Invalid or missing user ID (UUID)')
  }

  if (!cred.credential_id || typeof cred.credential_id !== 'string') {
    errors.push('Invalid or missing credential_id')
  }

  if (!cred.public_key || typeof cred.public_key !== 'string') {
    errors.push('Invalid or missing public_key')
  }

  if (cred.counter === undefined || cred.counter === null || Number.isNaN(Number(cred.counter))) {
    errors.push('Invalid or missing counter')
  }

  if (Number(cred.counter) < 0) {
    errors.push('Counter must be non-negative')
  }

  if (cred.created_at && !isValidTimestamp(cred.created_at as string | Date)) {
    errors.push('Invalid created_at timestamp')
  }

  if (cred.last_used_at && !isValidTimestamp(cred.last_used_at as string | Date)) {
    errors.push('Invalid last_used_at timestamp')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// Export singleton instances for convenience
export const webauthnSeeder = new WebAuthnTestSeeder()
export const webauthnMockData = WebAuthnMockData
