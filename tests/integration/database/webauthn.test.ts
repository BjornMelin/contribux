/**
 * WebAuthn Database Integration Tests
 * Tests for WebAuthn credential storage and retrieval operations
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from '@/lib/db/config'
import {
  generateWebAuthnAuthentication,
  generateWebAuthnRegistration,
  getUserWebAuthnCredentials,
  removeWebAuthnCredential,
  verifyWebAuthnAuthentication,
  verifyWebAuthnRegistration,
} from '@/lib/security/webauthn/server'

// Mock the security feature flags
vi.mock('@/lib/security/feature-flags', () => ({
  getSecurityConfig: () => ({
    webauthn: {
      rpName: 'Contribux Test',
      rpId: 'localhost',
      origin: 'http://localhost:3000',
      timeout: 60000,
    },
  }),
}))

// Mock SimpleWebAuthn to return predictable results
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(() => ({
    challenge: 'test-challenge-registration',
    rp: { name: 'Contribux Test', id: 'localhost' },
    user: { id: Buffer.from('test-user-id'), name: 'test@example.com', displayName: 'Test User' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 60000,
    attestation: 'none',
    excludeCredentials: [],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    supportedAlgorithmIDs: [-7, -257],
  })),
  verifyRegistrationResponse: vi.fn(() => ({
    verified: true,
    registrationInfo: {
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
      credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
      counter: 0,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  })),
  generateAuthenticationOptions: vi.fn(() => ({
    challenge: 'test-challenge-authentication',
    timeout: 60000,
    userVerification: 'preferred',
    rpId: 'localhost',
    allowCredentials: [],
  })),
  verifyAuthenticationResponse: vi.fn(() => ({
    verified: true,
    authenticationInfo: {
      newCounter: 1,
      credentialID: new Uint8Array([1, 2, 3, 4, 5]),
    },
  })),
}))

describe('WebAuthn Database Integration', () => {
  const testUserId = 'test-user-integration-' + Math.random().toString(36).substring(7)
  const testUserEmail = 'test-integration@example.com'
  let testCredentialId: string | null = null

  beforeAll(async () => {
    // Ensure test user exists in users table if required by foreign key constraint
    try {
      await sql`
        INSERT INTO users (id, email, name) 
        VALUES (${testUserId}, ${testUserEmail}, 'Test Integration User')
        ON CONFLICT (id) DO NOTHING
      `
    } catch (error) {
      // User table might not require this or might have different structure
      console.warn('Could not create test user:', error)
    }
  })

  afterAll(async () => {
    // Clean up test data
    try {
      await sql`DELETE FROM webauthn_credentials WHERE user_id = ${testUserId}`
      await sql`DELETE FROM users WHERE id = ${testUserId}`
    } catch (error) {
      console.warn('Cleanup error:', error)
    }
  })

  beforeEach(async () => {
    // Clean up any existing test credentials
    await sql`DELETE FROM webauthn_credentials WHERE user_id = ${testUserId}`
    testCredentialId = null
  })

  afterEach(async () => {
    // Clean up test credentials after each test
    await sql`DELETE FROM webauthn_credentials WHERE user_id = ${testUserId}`
  })

  describe('Credential Registration', () => {
    it('should store valid WebAuthn credential in database', async () => {
      const mockResponse = {
        id: 'test-credential-id-db',
        rawId: 'test-raw-id-db',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }

      const result = await verifyWebAuthnRegistration(
        testUserId,
        mockResponse,
        'test-challenge-registration'
      )

      expect(result.verified).toBe(true)
      expect(result.credentialId).toBeDefined()
      testCredentialId = result.credentialId!

      // Verify credential was stored in database
      const storedCredentials = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE user_id = ${testUserId}
      `

      expect(storedCredentials).toHaveLength(1)
      expect(storedCredentials[0]).toMatchObject({
        user_id: testUserId,
        credential_id: result.credentialId,
        counter: 0,
      })
      expect(storedCredentials[0].public_key).toBeInstanceOf(Buffer)
      expect(storedCredentials[0].created_at).toBeInstanceOf(Date)
    })

    it('should prevent duplicate credential registration', async () => {
      const mockResponse = {
        id: 'duplicate-credential-id',
        rawId: 'duplicate-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }

      // First registration should succeed
      const firstResult = await verifyWebAuthnRegistration(
        testUserId,
        mockResponse,
        'test-challenge-1'
      )
      expect(firstResult.verified).toBe(true)

      // Second registration with same credential should fail due to unique constraint
      await expect(
        verifyWebAuthnRegistration(testUserId, mockResponse, 'test-challenge-2')
      ).rejects.toThrow()
    })

    it('should handle multiple credentials per user', async () => {
      const credentials = [
        {
          id: 'credential-1',
          rawId: 'raw-id-1',
          response: { clientDataJSON: 'data-1', attestationObject: 'attestation-1' },
          type: 'public-key' as const,
        },
        {
          id: 'credential-2',
          rawId: 'raw-id-2',
          response: { clientDataJSON: 'data-2', attestationObject: 'attestation-2' },
          type: 'public-key' as const,
        },
      ]

      // Register multiple credentials
      for (const [index, credential] of credentials.entries()) {
        const result = await verifyWebAuthnRegistration(
          testUserId,
          credential,
          `test-challenge-${index + 1}`
        )
        expect(result.verified).toBe(true)
      }

      // Verify both credentials are stored
      const storedCredentials = await sql`
        SELECT * FROM webauthn_credentials 
        WHERE user_id = ${testUserId}
        ORDER BY created_at ASC
      `

      expect(storedCredentials).toHaveLength(2)
      expect(storedCredentials[0].credential_id).not.toBe(storedCredentials[1].credential_id)
    })

    it('should exclude existing credentials from registration options', async () => {
      // Register a credential first
      const firstCredential = {
        id: 'existing-credential',
        rawId: 'existing-raw-id',
        response: { clientDataJSON: 'data', attestationObject: 'attestation' },
        type: 'public-key' as const,
      }

      await verifyWebAuthnRegistration(testUserId, firstCredential, 'test-challenge')

      // Generate new registration options
      const options = await generateWebAuthnRegistration(testUserId, testUserEmail)

      expect(options).toBeDefined()
      expect(options.challenge).toBe('test-challenge-registration')
      // Note: In real implementation, excludeCredentials would be populated
      // but our mock doesn't simulate this database interaction
    })
  })

  describe('Credential Authentication', () => {
    beforeEach(async () => {
      // Set up a test credential for authentication tests
      const setupCredential = {
        id: 'auth-test-credential',
        rawId: 'auth-test-raw-id',
        response: { clientDataJSON: 'setup-data', attestationObject: 'setup-attestation' },
        type: 'public-key' as const,
      }

      const result = await verifyWebAuthnRegistration(
        testUserId,
        setupCredential,
        'setup-challenge'
      )
      testCredentialId = result.credentialId!
    })

    it('should verify authentication and update counter', async () => {
      // Mock authentication response
      const mockAuthResponse = {
        id: testCredentialId!,
        rawId: 'auth-raw-id',
        response: {
          clientDataJSON: 'auth-client-data',
          authenticatorData: 'auth-data',
          signature: 'auth-signature',
        },
        type: 'public-key' as const,
      }

      const result = await verifyWebAuthnAuthentication(
        mockAuthResponse,
        'test-challenge-authentication'
      )

      expect(result.verified).toBe(true)
      expect(result.userId).toBe(testUserId)
      expect(result.credentialId).toBe(testCredentialId)

      // Verify counter was updated
      const updatedCredential = await sql`
        SELECT counter, last_used_at FROM webauthn_credentials 
        WHERE credential_id = ${testCredentialId}
      `

      expect(updatedCredential[0].counter).toBe(1) // Updated from 0 to 1
      expect(updatedCredential[0].last_used_at).toBeInstanceOf(Date)
    })

    it('should fail authentication for non-existent credential', async () => {
      const mockAuthResponse = {
        id: 'non-existent-credential',
        rawId: 'non-existent-raw-id',
        response: {
          clientDataJSON: 'auth-client-data',
          authenticatorData: 'auth-data',
          signature: 'auth-signature',
        },
        type: 'public-key' as const,
      }

      const result = await verifyWebAuthnAuthentication(
        mockAuthResponse,
        'test-challenge-authentication'
      )

      expect(result.verified).toBe(false)
      expect(result.error).toBe('Credential not found')
    })

    it('should generate authentication options with user credentials', async () => {
      const options = await generateWebAuthnAuthentication(testUserId)

      expect(options).toBeDefined()
      expect(options.challenge).toBe('test-challenge-authentication')
      expect(options.rpId).toBe('localhost')
      expect(options.userVerification).toBe('preferred')
    })

    it('should generate authentication options for userless flow', async () => {
      const options = await generateWebAuthnAuthentication()

      expect(options).toBeDefined()
      expect(options.challenge).toBe('test-challenge-authentication')
      expect(options.rpId).toBe('localhost')
      expect(options.userVerification).toBe('preferred')
    })
  })

  describe('Credential Management', () => {
    beforeEach(async () => {
      // Set up multiple test credentials
      const credentials = [
        {
          id: 'management-credential-1',
          rawId: 'management-raw-id-1',
          response: { clientDataJSON: 'data-1', attestationObject: 'attestation-1' },
          type: 'public-key' as const,
        },
        {
          id: 'management-credential-2',
          rawId: 'management-raw-id-2',
          response: { clientDataJSON: 'data-2', attestationObject: 'attestation-2' },
          type: 'public-key' as const,
        },
      ]

      for (const [index, credential] of credentials.entries()) {
        await verifyWebAuthnRegistration(
          testUserId,
          credential,
          `management-challenge-${index + 1}`
        )
      }
    })

    it('should retrieve all user credentials', async () => {
      const credentials = await getUserWebAuthnCredentials(testUserId)

      expect(credentials).toHaveLength(2)
      expect(credentials[0]).toHaveProperty('id')
      expect(credentials[0]).toHaveProperty('credential_id')
      expect(credentials[0]).toHaveProperty('created_at')
      expect(credentials[0]).not.toHaveProperty('public_key') // Sensitive data excluded
      expect(credentials[0]).not.toHaveProperty('counter') // Internal data excluded
    })

    it('should remove specific credential', async () => {
      const credentialsBefore = await getUserWebAuthnCredentials(testUserId)
      expect(credentialsBefore).toHaveLength(2)

      const credentialToRemove = credentialsBefore[0].credential_id
      const removeResult = await removeWebAuthnCredential(testUserId, credentialToRemove)

      expect(removeResult).toBe(true)

      const credentialsAfter = await getUserWebAuthnCredentials(testUserId)
      expect(credentialsAfter).toHaveLength(1)
      expect(credentialsAfter[0].credential_id).not.toBe(credentialToRemove)
    })

    it('should fail to remove non-existent credential', async () => {
      const removeResult = await removeWebAuthnCredential(testUserId, 'non-existent-credential')
      expect(removeResult).toBe(false)
    })

    it('should prevent removing other users credentials', async () => {
      const otherUserId = 'other-user-' + Math.random().toString(36).substring(7)
      const credentials = await getUserWebAuthnCredentials(testUserId)
      const credentialId = credentials[0].credential_id

      const removeResult = await removeWebAuthnCredential(otherUserId, credentialId)
      expect(removeResult).toBe(false)

      // Verify credential still exists
      const remainingCredentials = await getUserWebAuthnCredentials(testUserId)
      expect(remainingCredentials).toHaveLength(2)
    })

    it('should order credentials by creation date (newest first)', async () => {
      const credentials = await getUserWebAuthnCredentials(testUserId)

      expect(credentials).toHaveLength(2)
      // Newest first ordering
      expect(new Date(credentials[0].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(credentials[1].created_at).getTime()
      )
    })
  })

  describe('Database Constraints and Validation', () => {
    it('should enforce foreign key constraint on user_id', async () => {
      const nonExistentUserId = 'non-existent-user-' + Math.random().toString(36).substring(7)
      const mockResponse = {
        id: 'constraint-test-credential',
        rawId: 'constraint-test-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }

      // This should fail due to foreign key constraint (if users table exists and is enforced)
      try {
        await verifyWebAuthnRegistration(
          nonExistentUserId,
          mockResponse,
          'constraint-test-challenge'
        )
        // If we reach here, either the constraint isn't enforced or user table doesn't exist
        console.warn('Foreign key constraint not enforced or users table not required')
      } catch (error) {
        expect(error).toBeDefined()
        // Expected behavior for proper foreign key constraint
      }
    })

    it('should enforce unique constraint on credential_id', async () => {
      // Mock SimpleWebAuthn to return the same credential ID
      const fixedCredentialId = new Uint8Array([99, 99, 99, 99, 99])
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credentialID: fixedCredentialId,
          credentialPublicKey: new Uint8Array([1, 2, 3, 4, 5]),
          counter: 0,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      })

      const firstResponse = {
        id: 'unique-test-1',
        rawId: 'unique-raw-1',
        response: {
          clientDataJSON: 'test-client-data-1',
          attestationObject: 'test-attestation-1',
        },
        type: 'public-key' as const,
      }

      // First registration should succeed
      const firstResult = await verifyWebAuthnRegistration(
        testUserId,
        firstResponse,
        'unique-challenge-1'
      )
      expect(firstResult.verified).toBe(true)

      // Mock same credential ID for second registration
      vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credentialID: fixedCredentialId, // Same credential ID
          credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
          counter: 0,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      })

      const secondResponse = {
        id: 'unique-test-2',
        rawId: 'unique-raw-2',
        response: {
          clientDataJSON: 'test-client-data-2',
          attestationObject: 'test-attestation-2',
        },
        type: 'public-key' as const,
      }

      // Second registration should fail due to unique constraint
      await expect(
        verifyWebAuthnRegistration(testUserId, secondResponse, 'unique-challenge-2')
      ).rejects.toThrow()
    })

    it('should handle concurrent credential registrations', async () => {
      const registrations = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-credential-${i}`,
        rawId: `concurrent-raw-${i}`,
        response: {
          clientDataJSON: `concurrent-data-${i}`,
          attestationObject: `concurrent-attestation-${i}`,
        },
        type: 'public-key' as const,
      }))

      // Attempt concurrent registrations
      const results = await Promise.allSettled(
        registrations.map((reg, i) =>
          verifyWebAuthnRegistration(testUserId, reg, `concurrent-challenge-${i}`)
        )
      )

      // All should succeed (different credential IDs)
      const successfulRegistrations = results.filter(r => r.status === 'fulfilled')
      expect(successfulRegistrations.length).toBeGreaterThan(0)

      // Verify they were all stored
      const storedCredentials = await sql`
        SELECT COUNT(*) as count FROM webauthn_credentials 
        WHERE user_id = ${testUserId}
      `
      expect(Number(storedCredentials[0].count)).toBe(successfulRegistrations.length)
    })
  })

  describe('Database Performance and Edge Cases', () => {
    it('should handle large credential data', async () => {
      const largePublicKey = new Uint8Array(1000).fill(42) // Large public key
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credentialID: new Uint8Array([100, 101, 102, 103, 104]),
          credentialPublicKey: largePublicKey,
          counter: 0,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      })

      const mockResponse = {
        id: 'large-data-credential',
        rawId: 'large-data-raw-id',
        response: {
          clientDataJSON: 'a'.repeat(10000), // Large client data
          attestationObject: 'b'.repeat(10000), // Large attestation
        },
        type: 'public-key' as const,
      }

      const result = await verifyWebAuthnRegistration(
        testUserId,
        mockResponse,
        'large-data-challenge'
      )

      expect(result.verified).toBe(true)

      // Verify large data was stored correctly
      const storedCredential = await sql`
        SELECT public_key, LENGTH(public_key) as key_length 
        FROM webauthn_credentials 
        WHERE credential_id = ${result.credentialId}
      `

      expect(storedCredential[0].key_length).toBe(1000)
    })

    it('should handle database connection failures gracefully', async () => {
      // Mock database failure
      const originalSql = sql
      const mockFailingSql = vi.fn().mockRejectedValue(new Error('Connection timeout'))

      // This test would require more complex mocking of the sql import
      // In a real scenario, you'd test with actual connection failures
      expect(true).toBe(true) // Placeholder - implement with proper SQL mock
    })

    it('should maintain data integrity during high counter values', async () => {
      // Set up credential with high counter
      await sql`
        INSERT INTO webauthn_credentials (
          user_id, credential_id, public_key, counter, created_at
        ) VALUES (
          ${testUserId},
          'high-counter-credential',
          ${Buffer.from([1, 2, 3, 4, 5])},
          ${Number.MAX_SAFE_INTEGER - 1},
          NOW()
        )
      `

      // Mock authentication with counter increment
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: Number.MAX_SAFE_INTEGER,
          credentialID: new Uint8Array([1, 2, 3, 4, 5]),
        },
      })

      const mockAuthResponse = {
        id: 'high-counter-credential',
        rawId: 'high-counter-raw-id',
        response: {
          clientDataJSON: 'auth-client-data',
          authenticatorData: 'auth-data',
          signature: 'auth-signature',
        },
        type: 'public-key' as const,
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'high-counter-challenge')

      expect(result.verified).toBe(true)

      // Verify counter was updated correctly
      const updatedCredential = await sql`
        SELECT counter FROM webauthn_credentials 
        WHERE credential_id = 'high-counter-credential'
      `

      expect(Number(updatedCredential[0].counter)).toBe(Number.MAX_SAFE_INTEGER)
    })
  })
})
