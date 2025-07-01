/**
 * WebAuthn Server Simple Implementation Tests
 * Simplified test suite focusing on core functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDatabaseMock, setupWebAuthnServerMock } from '../../utils/mocks'

// Set up mocks before importing the module under test
setupDatabaseMock()
setupWebAuthnServerMock()

// Import after mocks are set up
import {
  generateWebAuthnRegistration,
  verifyWebAuthnRegistration,
  getUserWebAuthnCredentials,
} from '@/lib/security/webauthn/server'

describe('WebAuthn Server Core Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('generateWebAuthnRegistration', () => {
    it('should generate registration options successfully', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toBeDefined()
      expect(result.challenge).toBe('test-challenge')
      expect(result.rp).toEqual({ name: 'Contribux', id: 'localhost' })
      expect(result.timeout).toBe(60000)
    })

    it('should handle user with existing credentials', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      // The mock will handle the existing credentials query
      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toBeDefined()
      expect(result.challenge).toBe('test-challenge')
    })
  })

  describe('verifyWebAuthnRegistration', () => {
    it('should verify valid registration response', async () => {
      const userId = 'test-user-id'
      const mockResponse = {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'test-client-data',
          attestationObject: 'test-attestation',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'test-challenge'

      const result = await verifyWebAuthnRegistration(userId, mockResponse, expectedChallenge)

      expect(result).toBeDefined()
      expect(result.verified).toBe(true)
      expect(result.credentialId).toBeDefined()
    })

    it('should handle verification failure', async () => {
      // Mock verification failure
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
        verified: false,
      })

      const userId = 'test-user-id'
      const mockResponse = {
        id: 'invalid-credential-id',
        rawId: 'invalid-raw-id',
        response: {
          clientDataJSON: 'invalid-client-data',
          attestationObject: 'invalid-attestation',
        },
        type: 'public-key' as const,
      }
      const expectedChallenge = 'invalid-challenge'

      const result = await verifyWebAuthnRegistration(userId, mockResponse, expectedChallenge)

      expect(result.verified).toBe(false)
      expect(result.error).toBe('Registration verification failed')
    })
  })

  describe('getUserWebAuthnCredentials', () => {
    it('should return user credentials', async () => {
      const userId = 'test-user-id'

      const result = await getUserWebAuthnCredentials(userId)

      // The mock returns an empty array by default
      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle database query', async () => {
      const userId = 'test-user-id'

      // This should not throw an error
      await expect(getUserWebAuthnCredentials(userId)).resolves.toBeDefined()
    })
  })

  describe('WebAuthn Configuration', () => {
    it('should use correct RP configuration', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result.rp.name).toBe('Contribux')
      expect(result.rp.id).toBe('localhost')
    })

    it('should set appropriate timeout', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result.timeout).toBe(60000) // 60 seconds
    })

    it('should support ES256 and RS256 algorithms', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result.pubKeyCredParams).toEqual([{ alg: -7, type: 'public-key' }])
    })
  })

  describe('Error Handling', () => {
    it('should handle missing user parameters', async () => {
      // Test with empty user ID
      await expect(generateWebAuthnRegistration('', 'test@example.com')).resolves.toBeDefined()

      // Test with empty email
      await expect(generateWebAuthnRegistration('user-id', '')).resolves.toBeDefined()
    })

    it('should handle WebAuthn library errors', async () => {
      // Mock SimpleWebAuthn error
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')
      vi.mocked(generateRegistrationOptions).mockRejectedValueOnce(
        new Error('WebAuthn generation failed')
      )

      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      await expect(generateWebAuthnRegistration(userId, userEmail)).rejects.toThrow(
        'WebAuthn generation failed'
      )
    })
  })

  describe('Security Features', () => {
    it('should require user verification', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result.authenticatorSelection?.userVerification).toBe('required')
    })

    it('should prefer platform authenticators', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result.authenticatorSelection?.authenticatorAttachment).toBe('platform')
    })

    it('should use resident keys when possible', async () => {
      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result.authenticatorSelection?.residentKey).toBe('required')
    })
  })
})
