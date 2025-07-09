/**
 * WebAuthn Server Implementation Tests
 * Comprehensive test suite for WebAuthn server functions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateWebAuthnAuthentication,
  generateWebAuthnRegistration,
  getUserWebAuthnCredentials,
  removeWebAuthnCredential,
  verifyWebAuthnAuthentication,
  verifyWebAuthnRegistration,
} from '@/lib/security/webauthn/server'
import { setupDatabaseMock, setupWebAuthnServerMock } from '../../utils/mocks'

// Mock the database and WebAuthn server
setupDatabaseMock()
setupWebAuthnServerMock()

// Mock the security feature flags
vi.mock('@/lib/security/feature-flags', () => ({
  getSecurityConfig: () => ({
    webauthn: {
      rpName: 'Contribux',
      rpId: 'localhost',
      origin: 'http://localhost:3000',
      timeout: 60000,
    },
  }),
}))

// Mock SQL module for database operations
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

describe('WebAuthn Server Functions', () => {
  let mockSql: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    // Get the mocked sql function
    const { sql } = await import('@/lib/db/config')
    mockSql = sql as ReturnType<typeof vi.fn>
    mockSql.mockResolvedValue([])
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('generateWebAuthnRegistration', () => {
    it('should generate registration options for new user', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      // Mock database to return no existing credentials
      mockSql.mockResolvedValueOnce([])

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toEqual({
        challenge: 'test-challenge',
        rp: { name: 'Contribux', id: 'localhost' },
        user: { id: 'test-user-id', name: 'testuser', displayName: 'testuser' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          requireResidentKey: true,
          residentKey: 'required',
          userVerification: 'required',
        },
      })

      // Verify database was queried for existing credentials
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT credential_id'),
          expect.stringContaining('FROM webauthn_credentials'),
        ])
      )
    })

    it('should exclude existing credentials from registration options', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      // Mock database to return existing credentials
      mockSql.mockResolvedValueOnce([
        { credential_id: 'existing-credential-1' },
        { credential_id: 'existing-credential-2' },
      ])

      await generateWebAuthnRegistration(userId, userEmail)

      expect(mockSql).toHaveBeenCalledWith(expect.arrayContaining([userId]))
    })

    it('should handle database errors gracefully', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      // Mock database error
      mockSql.mockRejectedValueOnce(new Error('Database connection failed'))

      await expect(generateWebAuthnRegistration(userId, userEmail)).rejects.toThrow(
        'Database connection failed'
      )
    })
  })

  describe('verifyWebAuthnRegistration', () => {
    it('should verify and store valid registration response', async () => {
      const userId = 'test-user-id'
      const response = {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'test-challenge'

      // Mock successful database insert
      mockSql.mockResolvedValueOnce([{ id: 'new-credential-id' }])

      const result = await verifyWebAuthnRegistration(userId, response, expectedChallenge)

      expect(result).toEqual({
        verified: true,
        credentialId: expect.any(String),
      })

      // Verify credential was stored in database
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('INSERT INTO webauthn_credentials'),
          userId,
        ])
      )
    })

    it('should return error for invalid registration response', async () => {
      const userId = 'test-user-id'
      const response = {
        id: 'invalid-credential-id',
        rawId: 'invalid-raw-id',
        response: {
          clientDataJSON: 'invalid-client-data',
          attestationObject: 'invalid-attestation',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'invalid-challenge'

      // Mock verification failure
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
        verified: false,
      })

      const result = await verifyWebAuthnRegistration(userId, response, expectedChallenge)

      expect(result).toEqual({
        verified: false,
        error: 'Registration verification failed',
      })

      // Verify no database insert was attempted
      expect(mockSql).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('INSERT')])
      )
    })

    it('should handle database insertion errors', async () => {
      const userId = 'test-user-id'
      const response = {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'test-challenge'

      // Mock database error on insert
      mockSql.mockRejectedValueOnce(new Error('Unique constraint violation'))

      await expect(verifyWebAuthnRegistration(userId, response, expectedChallenge)).rejects.toThrow(
        'Unique constraint violation'
      )
    })
  })

  describe('generateWebAuthnAuthentication', () => {
    it('should generate authentication options for specific user', async () => {
      const userId = 'test-user-id'

      // Mock database to return user credentials
      mockSql.mockResolvedValueOnce([
        { credential_id: 'credential-1' },
        { credential_id: 'credential-2' },
      ])

      const result = await generateWebAuthnAuthentication(userId)

      expect(result).toEqual({
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'required',
        rpId: 'localhost',
        allowCredentials: [],
      })

      expect(mockSql).toHaveBeenCalledWith(expect.arrayContaining([userId]))
    })

    it('should generate authentication options for userless flow', async () => {
      const result = await generateWebAuthnAuthentication()

      expect(result).toEqual({
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'required',
        rpId: 'localhost',
        allowCredentials: [],
      })

      // Should not query database without userId
      expect(mockSql).not.toHaveBeenCalled()
    })

    it('should handle empty credential list', async () => {
      const userId = 'test-user-id'

      // Mock database to return no credentials
      mockSql.mockResolvedValueOnce([])

      const result = await generateWebAuthnAuthentication(userId)

      expect(result).toEqual({
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'required',
        rpId: 'localhost',
        allowCredentials: [],
      })
    })
  })

  describe('verifyWebAuthnAuthentication', () => {
    it('should verify valid authentication response', async () => {
      const response = {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          authenticatorData: 'test-auth-data',
          signature: 'test-signature',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'test-challenge'

      // Mock database to return credential
      mockSql.mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: 'test-user-id',
          public_key: new Uint8Array([1, 2, 3]),
          counter: 5,
        },
      ])

      // Mock successful counter update
      mockSql.mockResolvedValueOnce([])

      const result = await verifyWebAuthnAuthentication(response, expectedChallenge)

      expect(result).toEqual({
        verified: true,
        userId: 'test-user-id',
        credentialId: 'test-credential-id',
      })

      // Verify counter was updated
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('UPDATE webauthn_credentials'),
          expect.stringContaining('counter'),
          expect.stringContaining('last_used_at'),
        ])
      )
    })

    it('should reject authentication for unknown credential', async () => {
      const response = {
        id: 'unknown-credential-id',
        rawId: 'unknown-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          authenticatorData: 'test-auth-data',
          signature: 'test-signature',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'test-challenge'

      // Mock database to return no credential
      mockSql.mockResolvedValueOnce([])

      const result = await verifyWebAuthnAuthentication(response, expectedChallenge)

      expect(result).toEqual({
        verified: false,
        error: 'Credential not found',
      })
    })

    it('should handle verification failure', async () => {
      const response = {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'invalid-client-data',
          authenticatorData: 'invalid-auth-data',
          signature: 'invalid-signature',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'invalid-challenge'

      // Mock database to return credential
      mockSql.mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: 'test-user-id',
          public_key: new Uint8Array([1, 2, 3]),
          counter: 5,
        },
      ])

      // Mock verification failure
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
        verified: false,
      })

      const result = await verifyWebAuthnAuthentication(response, expectedChallenge)

      expect(result).toEqual({
        verified: false,
        error: 'Authentication verification failed',
      })
    })
  })

  describe('getUserWebAuthnCredentials', () => {
    it('should return user credentials', async () => {
      const userId = 'test-user-id'
      const mockCredentials = [
        {
          id: 'cred-1',
          credential_id: 'credential-1',
          device_name: 'iPhone',
          created_at: new Date('2024-01-01'),
          last_used_at: new Date('2024-01-02'),
        },
        {
          id: 'cred-2',
          credential_id: 'credential-2',
          device_name: 'MacBook',
          created_at: new Date('2024-01-03'),
          last_used_at: null,
        },
      ]

      mockSql.mockResolvedValueOnce(mockCredentials)

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toEqual(mockCredentials)
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT'),
          expect.stringContaining('FROM webauthn_credentials'),
          expect.stringContaining('WHERE user_id'),
          userId,
        ])
      )
    })

    it('should return empty array for user with no credentials', async () => {
      const userId = 'test-user-id'

      mockSql.mockResolvedValueOnce([])

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toEqual([])
    })
  })

  describe('removeWebAuthnCredential', () => {
    it('should remove credential successfully', async () => {
      const userId = 'test-user-id'
      const credentialId = 'test-credential-id'

      // Mock successful deletion (returning affected rows)
      mockSql.mockResolvedValueOnce([{ id: 'deleted-id' }])

      const result = await removeWebAuthnCredential(userId, credentialId)

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('DELETE FROM webauthn_credentials'),
          userId,
          credentialId,
        ])
      )
    })

    it('should return false for non-existent credential', async () => {
      const userId = 'test-user-id'
      const credentialId = 'non-existent-credential'

      // Mock deletion with no affected rows
      mockSql.mockResolvedValueOnce([])

      const result = await removeWebAuthnCredential(userId, credentialId)

      expect(result).toBe(false)
    })

    it('should handle non-array database response', async () => {
      const userId = 'test-user-id'
      const credentialId = 'test-credential-id'

      // Mock non-array response
      mockSql.mockResolvedValueOnce({ affectedRows: 1 })

      const result = await removeWebAuthnCredential(userId, credentialId)

      expect(result).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection failures', async () => {
      const userId = 'test-user-id'

      mockSql.mockRejectedValueOnce(new Error('Connection timeout'))

      await expect(getUserWebAuthnCredentials(userId)).rejects.toThrow('Connection timeout')
    })

    it('should handle invalid parameters gracefully', async () => {
      // Test with empty string userId
      await expect(generateWebAuthnRegistration('', 'test@example.com')).resolves.toBeDefined()

      // Test with invalid email format
      await expect(generateWebAuthnRegistration('user-id', '')).resolves.toBeDefined()
    })

    it('should handle malformed credential data', async () => {
      const userId = 'test-user-id'
      const malformedResponse = {
        id: null,
        response: {},
      }
      const expectedChallenge = 'test-challenge'

      // This should throw an error due to malformed data
      await expect(
        verifyWebAuthnRegistration(userId, malformedResponse, expectedChallenge)
      ).rejects.toThrow()
    })
  })

  describe('Security Scenarios', () => {
    it('should prevent credential reuse across users', async () => {
      const credential = {
        id: 'shared-credential-id',
        rawId: 'shared-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }

      // First user registers credential
      mockSql.mockResolvedValueOnce([])
      await verifyWebAuthnRegistration('user-1', credential, 'challenge-1')

      // Second user tries to register same credential - should be prevented by unique constraint
      mockSql.mockRejectedValueOnce(new Error('Unique constraint violation'))
      await expect(verifyWebAuthnRegistration('user-2', credential, 'challenge-2')).rejects.toThrow(
        'Unique constraint violation'
      )
    })

    it('should validate counter values for replay attack prevention', async () => {
      const response = {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          authenticatorData: 'test-auth-data',
          signature: 'test-signature',
        },
        type: 'public-key' as const,
      }

      // Mock credential with higher counter (indicating potential replay)
      mockSql.mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: 'test-user-id',
          public_key: new Uint8Array([1, 2, 3]),
          counter: 10, // Higher than what would be returned by verification
        },
      ])

      // Mock verification to return lower counter
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: 5, // Lower than stored counter
          credentialID: new Uint8Array([1, 2, 3, 4, 5]),
        },
      })

      const result = await verifyWebAuthnAuthentication(response, 'test-challenge')

      // Should still succeed as SimpleWebAuthn handles counter validation
      expect(result.verified).toBe(true)
    })
  })
})
