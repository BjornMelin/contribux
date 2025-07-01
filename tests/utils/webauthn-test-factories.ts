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
  return (
    '\\x' +
    Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Factory for creating test user data
 */
export class UserFactory {
  private static idCounter = 0

  static create(overrides: Partial<NewUser> = {}): NewUser {
    UserFactory.idCounter++

    return {
      githubId: generateTestGitHubId(),
      username: generateTestUsername(),
      email: generateTestEmail(),
      name: `Test User ${UserFactory.idCounter}`,
      avatarUrl: `https://github.com/images/test-avatar-${UserFactory.idCounter}.png`,
      profile: {
        bio: `Test user ${UserFactory.idCounter} for WebAuthn testing`,
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

  static createMinimal(
    overrides: Partial<NewUser> = {}
  ): Pick<NewUser, 'githubId' | 'username'> & Partial<NewUser> {
    return {
      githubId: generateTestGitHubId(),
      username: generateTestUsername(),
      ...overrides,
    }
  }
}

/**
 * Factory for creating WebAuthn credential test data
 */
export class WebAuthnCredentialFactory {
  private static idCounter = 0

  static create(
    userId: string,
    overrides: Partial<NewWebAuthnCredential> = {}
  ): NewWebAuthnCredential {
    WebAuthnCredentialFactory.idCounter++

    return {
      userId,
      credentialId: generateCredentialId(),
      publicKey: generatePublicKey(),
      counter: 0,
      deviceName: `Test Device ${WebAuthnCredentialFactory.idCounter}`,
      ...overrides,
    }
  }

  static createMinimal(
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

  static createMultiple(userId: string, count: number): NewWebAuthnCredential[] {
    return Array.from({ length: count }, (_, index) =>
      WebAuthnCredentialFactory.create(userId, {
        deviceName: `Test Device ${index + 1}`,
        counter: index,
      })
    )
  }

  static createWithBytea(
    userId: string,
    overrides: Partial<Omit<NewWebAuthnCredential, 'publicKey'>> & { publicKey?: string } = {}
  ): Omit<NewWebAuthnCredential, 'publicKey'> & { publicKey: string } {
    return {
      ...WebAuthnCredentialFactory.createMinimal(userId, overrides),
      publicKey: generatePublicKeyBytea(),
    }
  }
}

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
 * Mock WebAuthn authentication data for testing
 */
export class WebAuthnMockData {
  /**
   * Generate mock WebAuthn registration data
   */
  static generateRegistrationData() {
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
  static generateAuthenticationData(credentialId: string, counter = 1) {
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
  static generateChallenge(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    return btoa(String.fromCharCode(...randomBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }
}

/**
 * Database transaction helper for WebAuthn tests
 */
export class WebAuthnTestTransaction {
  /**
   * Run a test function within a database transaction that will be rolled back
   * Note: This requires a PostgreSQL connection that supports transactions
   */
  static async withRollback<T>(testFn: (seeder: WebAuthnTestSeeder) => Promise<T>): Promise<T> {
    const seeder = new WebAuthnTestSeeder()

    try {
      const result = await testFn(seeder)
      return result
    } finally {
      await seeder.cleanup()
    }
  }
}

/**
 * Performance testing utilities for WebAuthn operations
 */
export class WebAuthnPerformanceHelper {
  /**
   * Measure query execution time
   */
  static async measureQueryTime<T>(
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
  static async createBulkTestData(
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
  static async benchmark<T>(
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
      const { duration } = await WebAuthnPerformanceHelper.measureQueryTime(operation)
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
}

/**
 * Validation helper for WebAuthn test assertions
 */
export class WebAuthnTestValidator {
  /**
   * Validate UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }

  /**
   * Validate base64url format
   */
  static isValidBase64Url(str: string): boolean {
    const base64urlRegex = /^[A-Za-z0-9_-]+$/
    return base64urlRegex.test(str)
  }

  /**
   * Validate base64 format
   */
  static isValidBase64(str: string): boolean {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    return base64Regex.test(str)
  }

  /**
   * Validate timestamp format
   */
  static isValidTimestamp(timestamp: string | Date): boolean {
    const date = new Date(timestamp)
    return !isNaN(date.getTime())
  }

  /**
   * Validate WebAuthn credential structure
   */
  static validateCredentialStructure(credential: any): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!credential.id || !WebAuthnTestValidator.isValidUUID(credential.id)) {
      errors.push('Invalid or missing credential ID (UUID)')
    }

    if (!credential.user_id || !WebAuthnTestValidator.isValidUUID(credential.user_id)) {
      errors.push('Invalid or missing user ID (UUID)')
    }

    if (!credential.credential_id || typeof credential.credential_id !== 'string') {
      errors.push('Invalid or missing credential_id')
    }

    if (!credential.public_key || typeof credential.public_key !== 'string') {
      errors.push('Invalid or missing public_key')
    }

    if (
      credential.counter === undefined ||
      credential.counter === null ||
      isNaN(Number(credential.counter))
    ) {
      errors.push('Invalid or missing counter')
    }

    if (Number(credential.counter) < 0) {
      errors.push('Counter must be non-negative')
    }

    if (credential.created_at && !WebAuthnTestValidator.isValidTimestamp(credential.created_at)) {
      errors.push('Invalid created_at timestamp')
    }

    if (
      credential.last_used_at &&
      !WebAuthnTestValidator.isValidTimestamp(credential.last_used_at)
    ) {
      errors.push('Invalid last_used_at timestamp')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}

// Export singleton instances for convenience
export const webauthnSeeder = new WebAuthnTestSeeder()
export const webauthnMockData = WebAuthnMockData
export const webauthnPerformance = WebAuthnPerformanceHelper
export const webauthnValidator = WebAuthnTestValidator
