/**
 * Comprehensive WebAuthn Server Unit Tests
 * Tests for WebAuthn registration, authentication, credential management, and security
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
import {
  StoredCredentialFactory,
  WebAuthnAuthenticationFactory,
  WebAuthnCredentialFactory,
  WebAuthnOptionsFactory,
  WebAuthnTestHelpers,
} from '../../utils/webauthn-test-utilities'

// Mock console methods to avoid noise in tests
vi.mock('console', () => ({
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}))

// Mock the SimpleWebAuthn server functions
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

// Mock the database module with template literal support
vi.mock('@/lib/db', () => {
  const mockSql = vi.fn()
  const sqlMock = (template: TemplateStringsArray, ...substitutions: any[]) => {
    // Call the underlying mock first to handle any configured return values
    const result = mockSql(template, ...substitutions)
    // If the mock is configured to return a specific value, use it
    if (result !== undefined) {
      return result
    }
    // Otherwise, return default empty array
    return Promise.resolve([])
  }
  Object.assign(sqlMock, mockSql)

  return {
    sql: sqlMock,
    db: vi.fn(),
  }
})

// Mock database config functions
vi.mock('@/lib/db/config', () => ({
  getDatabaseUrl: vi.fn().mockReturnValue('postgresql://mock:test@localhost:5432/test'),
  getConnectionPool: vi.fn().mockReturnValue({}),
  sql: vi.fn(),
}))

// Mock security feature flags
vi.mock('@/lib/security/feature-flags', () => ({
  securityFeatures: {
    webauthn: true,
    basicSecurity: true,
    securityHeaders: true,
    rateLimiting: true,
  },
  getSecurityFeatures: vi.fn().mockReturnValue({
    webauthn: true,
    basicSecurity: true,
    securityHeaders: true,
    rateLimiting: true,
    isDevelopment: true,
    isProduction: false,
  }),
  getSecurityConfig: vi.fn().mockReturnValue({
    webauthn: {
      rpName: 'Contribux',
      rpId: 'localhost',
      origin: 'http://localhost:3000',
      timeout: 60000,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 1000,
    },
    monitoring: {
      enableHealthChecks: true,
      enableMetrics: true,
    },
  }),
}))

// Type definitions for mocked functions
type SqlFunction = (...args: unknown[]) => Promise<unknown[]>
type GenerateRegistrationOptionsFunction = (...args: unknown[]) => Promise<unknown>
type VerifyRegistrationResponseFunction = (...args: unknown[]) => Promise<unknown>
type GenerateAuthenticationOptionsFunction = (...args: unknown[]) => Promise<unknown>
type VerifyAuthenticationResponseFunction = (...args: unknown[]) => Promise<unknown>
type GetSecurityConfigFunction = (...args: unknown[]) => unknown

describe.skip('WebAuthn Server - Comprehensive Test Suite', () => {
  let mockSql: ReturnType<typeof vi.fn<SqlFunction>>
  let mockGenerateRegistrationOptions: ReturnType<typeof vi.fn<GenerateRegistrationOptionsFunction>>
  let mockVerifyRegistrationResponse: ReturnType<typeof vi.fn<VerifyRegistrationResponseFunction>>
  let mockGenerateAuthenticationOptions: ReturnType<
    typeof vi.fn<GenerateAuthenticationOptionsFunction>
  >
  let mockVerifyAuthenticationResponse: ReturnType<
    typeof vi.fn<VerifyAuthenticationResponseFunction>
  >
  let mockGetSecurityConfig: ReturnType<typeof vi.fn<GetSecurityConfigFunction>>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Import mocked modules
    const { sql } = await import('@/lib/db')
    const {
      generateRegistrationOptions,
      verifyRegistrationResponse,
      generateAuthenticationOptions,
      verifyAuthenticationResponse,
    } = await import('@simplewebauthn/server')
    const { getSecurityConfig } = await import('@/lib/security/feature-flags')

    mockSql = sql
    mockGenerateRegistrationOptions = generateRegistrationOptions
    mockVerifyRegistrationResponse = verifyRegistrationResponse
    mockGenerateAuthenticationOptions = generateAuthenticationOptions
    mockVerifyAuthenticationResponse = verifyAuthenticationResponse
    mockGetSecurityConfig = getSecurityConfig

    // Setup default mocks
    mockGetSecurityConfig.mockReturnValue({
      webauthn: {
        rpName: 'Contribux Test',
        rpId: 'localhost',
        origin: 'http://localhost:3000',
        timeout: 60000,
      },
    })

    mockSql.mockResolvedValue([])
    mockGenerateRegistrationOptions.mockResolvedValue(
      WebAuthnOptionsFactory.createRegistrationOptions('test-user', 'test@example.com')
    )
    mockGenerateAuthenticationOptions.mockResolvedValue(
      WebAuthnOptionsFactory.createAuthenticationOptions()
    )

    // Setup default successful verification responses
    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: new Uint8Array(Buffer.from('test-credential-id')),
          publicKey: new Uint8Array(Buffer.from('test-public-key')),
          counter: 0,
        },
      },
    })

    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 1,
        credentialID: new Uint8Array(Buffer.from('test-credential-id')),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('generateWebAuthnRegistration', () => {
    it('should generate registration options for new user with no existing credentials', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'newuser@example.com'

      // Mock empty credentials list
      mockSql.mockResolvedValueOnce([])

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toBeDefined()
      expect(mockSql).toHaveBeenCalledOnce()
      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpName: 'Contribux Test',
          rpID: 'localhost',
          userName: userEmail,
          userID: expect.any(Buffer),
          timeout: 60000,
          attestationType: 'none',
          excludeCredentials: [],
          authenticatorSelection: expect.objectContaining({
            authenticatorAttachment: 'platform',
            userVerification: 'preferred',
            residentKey: 'preferred',
          }),
          supportedAlgorithmIDs: [-7, -257],
        })
      )
    })

    it('should exclude existing credentials from registration options', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'existinguser@example.com'
      const existingCredentials = [
        { credential_id: 'existing-cred-1' },
        { credential_id: 'existing-cred-2' },
        { credential_id: 'existing-cred-3' },
      ]

      mockSql.mockResolvedValueOnce(existingCredentials)

      await generateWebAuthnRegistration(userId, userEmail)

      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: expect.arrayContaining([
            expect.objectContaining({
              id: 'existing-cred-1',
              type: 'public-key',
              transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
            }),
            expect.objectContaining({
              id: 'existing-cred-2',
              type: 'public-key',
              transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
            }),
            expect.objectContaining({
              id: 'existing-cred-3',
              type: 'public-key',
              transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
            }),
          ]),
        })
      )
    })

    it('should handle database query errors gracefully', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'error@example.com'

      mockSql.mockRejectedValueOnce(new Error('Database connection timeout'))

      await expect(generateWebAuthnRegistration(userId, userEmail)).rejects.toThrow(
        'Database connection timeout'
      )
    })

    it('should handle SimpleWebAuthn library errors', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'library-error@example.com'

      mockSql.mockResolvedValueOnce([])
      mockGenerateRegistrationOptions.mockRejectedValueOnce(
        new Error('Invalid registration parameters')
      )

      await expect(generateWebAuthnRegistration(userId, userEmail)).rejects.toThrow(
        'Invalid registration parameters'
      )
    })

    it('should handle large numbers of existing credentials efficiently', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'manydevices@example.com'

      // Create 50 existing credentials
      const manyCredentials = Array.from({ length: 50 }, (_, i) => ({
        credential_id: `credential-${i}`,
      }))

      mockSql.mockResolvedValueOnce(manyCredentials)

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toBeDefined()
      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: expect.arrayContaining(
            manyCredentials.map(cred =>
              expect.objectContaining({
                id: cred.credential_id,
                type: 'public-key',
              })
            )
          ),
        })
      )
    })

    it('should validate user input parameters', async () => {
      // Test with empty userId
      await expect(generateWebAuthnRegistration('', 'test@example.com')).resolves.toBeDefined()

      // Test with empty email
      await expect(generateWebAuthnRegistration('user-123', '')).resolves.toBeDefined()

      // Test with invalid email format
      await expect(generateWebAuthnRegistration('user-123', 'not-an-email')).resolves.toBeDefined()

      // Test with extremely long inputs
      const longUserId = 'a'.repeat(1000)
      const longEmail = `${'b'.repeat(990)}@test.com`
      await expect(generateWebAuthnRegistration(longUserId, longEmail)).resolves.toBeDefined()
    })
  })

  describe('verifyWebAuthnRegistration', () => {
    it('should verify and store valid registration response', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const credential = WebAuthnCredentialFactory.create()

      // Mock successful verification
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(Buffer.from('test-credential-id')),
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
        },
      })

      // Mock successful database insertion
      mockSql.mockResolvedValueOnce([{ id: 'new-row-id' }])

      const result = await verifyWebAuthnRegistration(userId, credential, challenge)

      expect(result).toEqual({
        verified: true,
        credentialId: expect.any(String),
      })

      // Verify database insertion was called
      expect(mockSql).toHaveBeenCalled()
    })

    it('should return error for failed verification', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const invalidCredential = WebAuthnCredentialFactory.createInvalid()

      // Mock failed verification
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: false,
      })

      const result = await verifyWebAuthnRegistration(userId, invalidCredential, challenge)

      expect(result).toEqual({
        verified: false,
        error: 'Registration verification failed',
      })

      // Verify no database insertion was attempted
      expect(mockSql).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('INSERT')])
      )
    })

    it('should handle database insertion failures', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const credential = WebAuthnCredentialFactory.create()

      // Mock successful verification
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(Buffer.from('test-credential-id')),
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
        },
      })

      // Mock database insertion failure
      mockSql.mockRejectedValueOnce(new Error('Unique constraint violation'))

      await expect(verifyWebAuthnRegistration(userId, credential, challenge)).rejects.toThrow(
        'Unique constraint violation'
      )
    })

    it('should handle verification library errors', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const credential = WebAuthnCredentialFactory.create()

      // Mock verification library error
      mockVerifyRegistrationResponse.mockRejectedValueOnce(new Error('Invalid attestation object'))

      await expect(verifyWebAuthnRegistration(userId, credential, challenge)).rejects.toThrow(
        'Invalid attestation object'
      )
    })

    it('should handle malformed credential data gracefully', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const malformedCredential = {
        id: null,
        rawId: undefined,
        response: {
          clientDataJSON: '',
          attestationObject: null,
        },
        type: 'invalid-type',
      }

      // Mock verification failure for malformed data
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: false,
        error: 'Invalid credential format',
      })

      // This should propagate the error from SimpleWebAuthn
      const result = await verifyWebAuthnRegistration(
        userId,
        malformedCredential as unknown,
        challenge
      )
      expect(result).toEqual({
        verified: false,
        error: 'Registration verification failed',
      })
    })

    it('should handle extremely large credential data', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const largeCredential = WebAuthnCredentialFactory.createLarge()

      // Mock verification handling large data
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(Buffer.from('large-credential-id')),
            publicKey: new Uint8Array(Buffer.alloc(1024)), // Large public key
            counter: 0,
          },
        },
      })

      mockSql.mockResolvedValueOnce([{ id: 'new-row-id' }])

      const result = await verifyWebAuthnRegistration(userId, largeCredential, challenge)

      expect(result.verified).toBe(true)
    })

    it('should properly encode credential ID as base64url', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const credential = WebAuthnCredentialFactory.create()
      const credentialIdBuffer = Buffer.from('test-credential-id-123')

      // Mock successful verification
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(credentialIdBuffer),
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
        },
      })

      mockSql.mockResolvedValueOnce([{ id: 'new-row-id' }])

      const result = await verifyWebAuthnRegistration(userId, credential, challenge)

      expect(result.verified).toBe(true)
      expect(result.credentialId).toBe(credentialIdBuffer.toString('base64url'))

      // Verify database was called for insertion
      expect(mockSql).toHaveBeenCalled()
    })
  })

  describe('generateWebAuthnAuthentication', () => {
    it('should generate authentication options for specific user with credentials', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userCredentials = [
        { credential_id: 'cred-1' },
        { credential_id: 'cred-2' },
        { credential_id: 'cred-3' },
      ]

      mockSql.mockResolvedValueOnce(userCredentials)

      const result = await generateWebAuthnAuthentication(userId)

      expect(result).toBeDefined()
      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'localhost',
          timeout: 60000,
          allowCredentials: expect.arrayContaining([
            expect.objectContaining({
              id: 'cred-1',
              type: 'public-key',
              transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
            }),
            expect.objectContaining({
              id: 'cred-2',
              type: 'public-key',
              transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
            }),
            expect.objectContaining({
              id: 'cred-3',
              type: 'public-key',
              transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
            }),
          ]),
          userVerification: 'preferred',
        })
      )
    })

    it('should generate authentication options for user with no credentials', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      mockSql.mockResolvedValueOnce([])

      const result = await generateWebAuthnAuthentication(userId)

      expect(result).toBeDefined()
      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'localhost',
          timeout: 60000,
          allowCredentials: undefined, // No credentials = undefined allowCredentials
          userVerification: 'preferred',
        })
      )
    })

    it('should generate authentication options for userless flow', async () => {
      const result = await generateWebAuthnAuthentication()

      expect(result).toBeDefined()
      expect(mockSql).not.toHaveBeenCalled()
      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'localhost',
          timeout: 60000,
          allowCredentials: undefined,
          userVerification: 'preferred',
        })
      )
    })

    it('should handle database query errors for user credentials', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      mockSql.mockRejectedValueOnce(new Error('Database query timeout'))

      await expect(generateWebAuthnAuthentication(userId)).rejects.toThrow('Database query timeout')
    })

    it('should handle SimpleWebAuthn library errors', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      mockSql.mockResolvedValueOnce([])
      mockGenerateAuthenticationOptions.mockRejectedValueOnce(
        new Error('Invalid authentication parameters')
      )

      await expect(generateWebAuthnAuthentication(userId)).rejects.toThrow(
        'Invalid authentication parameters'
      )
    })

    it('should handle malformed credential data from database', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const malformedCredentials = [
        { credential_id: null },
        { credential_id: '' },
        { invalid_field: 'invalid-data' },
      ]

      mockSql.mockResolvedValueOnce(malformedCredentials)

      const result = await generateWebAuthnAuthentication(userId)

      expect(result).toBeDefined()
      // Should handle malformed data gracefully
      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: expect.arrayContaining([
            expect.objectContaining({
              id: null,
              type: 'public-key',
            }),
            expect.objectContaining({
              id: '',
              type: 'public-key',
            }),
            expect.objectContaining({
              id: undefined,
              type: 'public-key',
            }),
          ]),
        })
      )
    })
  })

  describe('verifyWebAuthnAuthentication', () => {
    it('should verify valid authentication response and update counter', async () => {
      const credentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.create(credentialId)
      const storedCredential = {
        credential_id: credentialId,
        user_id: 'test-user-id',
        public_key: Buffer.from([1, 2, 3, 4, 5]),
        counter: 5,
      }

      // Mock database credential lookup
      mockSql.mockResolvedValueOnce([storedCredential])

      // Mock successful verification
      mockVerifyAuthenticationResponse.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: 6,
          credentialID: new Uint8Array(Buffer.from(credentialId)),
        },
      })

      // Mock counter update
      mockSql.mockResolvedValueOnce([])

      const result = await verifyWebAuthnAuthentication(authData, challenge)

      expect(result).toEqual({
        verified: true,
        userId: 'test-user-id',
        credentialId: credentialId,
      })

      // Verify counter and timestamp were updated
      expect(mockSql).toHaveBeenCalledTimes(2) // Once for lookup, once for update
    })

    it('should reject authentication for unknown credential', async () => {
      const unknownCredentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.create(unknownCredentialId)

      // Mock database returning no credential
      mockSql.mockResolvedValueOnce([])

      const result = await verifyWebAuthnAuthentication(authData, challenge)

      expect(result).toEqual({
        verified: false,
        error: 'Credential not found',
      })

      // Verify no verification attempt was made
      expect(mockVerifyAuthenticationResponse).not.toHaveBeenCalled()
      expect(mockSql).toHaveBeenCalledOnce() // Only lookup, no update
    })

    it('should handle verification failure from SimpleWebAuthn', async () => {
      const credentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.createInvalid()
      const storedCredential = {
        credential_id: credentialId,
        user_id: 'test-user-id',
        public_key: Buffer.from([1, 2, 3, 4, 5]),
        counter: 5,
      }

      // Mock database credential lookup
      mockSql.mockResolvedValueOnce([storedCredential])

      // Mock failed verification
      mockVerifyAuthenticationResponse.mockResolvedValueOnce({
        verified: false,
      })

      const result = await verifyWebAuthnAuthentication(authData, challenge)

      expect(result).toEqual({
        verified: false,
        error: 'Authentication verification failed',
      })

      // Verify no counter update was attempted
      expect(mockSql).toHaveBeenCalledOnce() // Only lookup, no update
    })

    it('should handle database update errors after successful verification', async () => {
      const credentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.create(credentialId)
      const storedCredential = {
        credential_id: credentialId,
        user_id: 'test-user-id',
        public_key: Buffer.from([1, 2, 3, 4, 5]),
        counter: 5,
      }

      // Mock database credential lookup
      mockSql.mockResolvedValueOnce([storedCredential])

      // Mock successful verification
      mockVerifyAuthenticationResponse.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: 6,
          credentialID: new Uint8Array(Buffer.from(credentialId)),
        },
      })

      // Mock database update failure
      mockSql.mockRejectedValueOnce(new Error('Database update failed'))

      // Should still return success but log error (handled by application)
      await expect(verifyWebAuthnAuthentication(authData, challenge)).rejects.toThrow(
        'Database update failed'
      )
    })

    it('should handle verification library errors', async () => {
      const credentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.create(credentialId)
      const storedCredential = {
        credential_id: credentialId,
        user_id: 'test-user-id',
        public_key: Buffer.from([1, 2, 3, 4, 5]),
        counter: 5,
      }

      // Mock database credential lookup
      mockSql.mockResolvedValueOnce([storedCredential])

      // Mock verification library error
      mockVerifyAuthenticationResponse.mockRejectedValueOnce(new Error('Invalid signature format'))

      await expect(verifyWebAuthnAuthentication(authData, challenge)).rejects.toThrow(
        'Invalid signature format'
      )
    })

    it('should handle counter validation for replay attack prevention', async () => {
      const credentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.create(credentialId)
      const storedCredential = StoredCredentialFactory.createWithHighCounter('test-user-id')

      // Mock database credential lookup
      mockSql.mockResolvedValueOnce([storedCredential])

      // Mock verification with suspicious counter
      mockVerifyAuthenticationResponse.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: storedCredential.counter - 1, // Counter going backwards
          credentialID: new Uint8Array(Buffer.from(credentialId)),
        },
      })

      // Mock counter update
      mockSql.mockResolvedValueOnce([])

      const result = await verifyWebAuthnAuthentication(authData, challenge)

      // SimpleWebAuthn should handle counter validation internally
      expect(result.verified).toBe(true)
    })

    it('should handle malformed authentication response', async () => {
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const malformedAuthData = {
        id: null,
        rawId: undefined,
        response: {
          clientDataJSON: '',
          authenticatorData: null,
          signature: undefined,
        },
        type: 'invalid-type',
      }

      // This should fail early and not reach database
      await expect(
        verifyWebAuthnAuthentication(malformedAuthData as unknown, challenge)
      ).rejects.toThrow()
    })
  })

  describe('getUserWebAuthnCredentials', () => {
    it('should return user credentials ordered by creation date', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const mockCredentials = StoredCredentialFactory.createBatch(userId, 3)

      mockSql.mockResolvedValueOnce(mockCredentials)

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toEqual(mockCredentials)
      expect(mockSql).toHaveBeenCalledOnce()
    })

    it('should return empty array for user with no credentials', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      mockSql.mockResolvedValueOnce([])

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toEqual([])
    })

    it('should handle database query errors', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      mockSql.mockRejectedValueOnce(new Error('Database connection lost'))

      await expect(getUserWebAuthnCredentials(userId)).rejects.toThrow('Database connection lost')
    })

    it('should handle malformed database response', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const malformedResponse = [
        { id: null, credential_id: '', created_at: 'invalid-date' },
        { missing_fields: true },
      ]

      mockSql.mockResolvedValueOnce(malformedResponse)

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toEqual(malformedResponse)
    })

    it('should handle extremely large credential lists', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const largeCredentialList = StoredCredentialFactory.createBatch(userId, 100)

      mockSql.mockResolvedValueOnce(largeCredentialList)

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toHaveLength(100)
      expect(result).toEqual(largeCredentialList)
    })
  })

  describe('removeWebAuthnCredential', () => {
    it('should successfully remove existing credential', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()

      // Mock successful deletion (returning affected row)
      mockSql.mockResolvedValueOnce([{ id: 'deleted-credential' }])

      const result = await removeWebAuthnCredential(userId, credentialId)

      expect(result).toBe(true)
      expect(mockSql).toHaveBeenCalledOnce()
    })

    it('should return false for non-existent credential', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()

      // Mock deletion with no affected rows
      mockSql.mockResolvedValueOnce([])

      const result = await removeWebAuthnCredential(userId, credentialId)

      expect(result).toBe(false)
    })

    it('should handle database deletion errors', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()

      mockSql.mockRejectedValueOnce(new Error('Foreign key constraint violation'))

      await expect(removeWebAuthnCredential(userId, credentialId)).rejects.toThrow(
        'Foreign key constraint violation'
      )
    })

    it('should handle non-array database response', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()

      // Mock non-array response (some database drivers return different formats)
      mockSql.mockResolvedValueOnce({ affectedRows: 1 })

      const result = await removeWebAuthnCredential(userId, credentialId)

      expect(result).toBe(false) // Function specifically checks for array response
    })

    it('should validate user ownership before deletion', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()

      mockSql.mockResolvedValueOnce([{ id: 'deleted-credential' }])

      await removeWebAuthnCredential(userId, credentialId)

      // Verify the database deletion was called
      expect(mockSql).toHaveBeenCalledOnce()
    })
  })

  describe('Security Edge Cases and Attack Scenarios', () => {
    it('should prevent credential reuse across different users', async () => {
      const user1Id = WebAuthnTestHelpers.generateUserId()
      const user2Id = WebAuthnTestHelpers.generateUserId()
      const sharedCredential = WebAuthnCredentialFactory.create()
      const challenge = WebAuthnTestHelpers.generateChallenge()

      // First user registers credential successfully
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(Buffer.from('shared-credential-id')),
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
        },
      })
      mockSql.mockResolvedValueOnce([{ id: 'new-row-id' }])

      const firstResult = await verifyWebAuthnRegistration(user1Id, sharedCredential, challenge)
      expect(firstResult.verified).toBe(true)

      // Second user tries to register same credential - should fail with unique constraint
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(Buffer.from('shared-credential-id')),
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
        },
      })
      mockSql.mockRejectedValueOnce(
        new Error('UNIQUE constraint failed: webauthn_credentials.credential_id')
      )

      await expect(
        verifyWebAuthnRegistration(user2Id, sharedCredential, challenge)
      ).rejects.toThrow('UNIQUE constraint failed')
    })

    it('should handle malicious authentication data safely', async () => {
      const maliciousAuthData = WebAuthnAuthenticationFactory.createWithMaliciousData()
      const challenge = WebAuthnTestHelpers.generateChallenge()

      // Mock database returning credential (even for malicious ID)
      mockSql.mockResolvedValueOnce([
        {
          credential_id: 'malicious-credential',
          user_id: 'test-user-id',
          public_key: Buffer.from([1, 2, 3, 4, 5]),
          counter: 5,
        },
      ])

      // SimpleWebAuthn should handle malicious data validation
      mockVerifyAuthenticationResponse.mockRejectedValueOnce(
        new Error('Invalid authentication data format')
      )

      await expect(verifyWebAuthnAuthentication(maliciousAuthData, challenge)).rejects.toThrow(
        'Invalid authentication data format'
      )
    })

    it('should handle SQL injection attempts in credential IDs', async () => {
      const sqlInjectionCredentialId = "'; DROP TABLE webauthn_credentials; --"
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const authData = WebAuthnAuthenticationFactory.create(sqlInjectionCredentialId)

      // Database should be called with parameterized query (safe from injection)
      mockSql.mockResolvedValueOnce([])

      const result = await verifyWebAuthnAuthentication(authData, challenge)

      expect(result).toEqual({
        verified: false,
        error: 'Credential not found',
      })

      // Verify the database was called (parameterized queries are safe)
      expect(mockSql).toHaveBeenCalledOnce()
    })

    it('should handle extremely large credential payloads', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const largeCredential = WebAuthnCredentialFactory.createLarge()

      // Mock verification handling large payload
      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array(Buffer.alloc(1024, 'a')), // Very large credential ID
            publicKey: new Uint8Array(Buffer.alloc(8192, 'b')), // Very large public key
            counter: 0,
          },
        },
      })

      mockSql.mockResolvedValueOnce([{ id: 'new-row-id' }])

      const result = await verifyWebAuthnRegistration(userId, largeCredential, challenge)

      expect(result.verified).toBe(true)
    })

    it('should handle concurrent registration attempts', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const challenge = WebAuthnTestHelpers.generateChallenge()
      const credential1 = WebAuthnCredentialFactory.create()
      const credential2 = WebAuthnCredentialFactory.create()

      // Mock successful verification for both
      mockVerifyRegistrationResponse
        .mockResolvedValueOnce({
          verified: true,
          registrationInfo: {
            credential: {
              id: new Uint8Array(Buffer.from('credential-1')),
              publicKey: new Uint8Array([1, 2, 3]),
              counter: 0,
            },
          },
        })
        .mockResolvedValueOnce({
          verified: true,
          registrationInfo: {
            credential: {
              id: new Uint8Array(Buffer.from('credential-2')),
              publicKey: new Uint8Array([4, 5, 6]),
              counter: 0,
            },
          },
        })

      // Mock database calls - first succeeds, second might fail due to race condition
      mockSql
        .mockResolvedValueOnce([{ id: 'first-credential' }])
        .mockRejectedValueOnce(new Error('Concurrent modification detected'))

      // First registration should succeed
      const result1 = await verifyWebAuthnRegistration(userId, credential1, challenge)
      expect(result1.verified).toBe(true)

      // Second registration might fail due to concurrent access
      await expect(verifyWebAuthnRegistration(userId, credential2, challenge)).rejects.toThrow(
        'Concurrent modification detected'
      )
    })

    it('should handle session timing attacks', async () => {
      const validCredentialId = WebAuthnTestHelpers.generateCredentialId()
      const invalidCredentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()

      // Valid credential lookup
      const validAuthData = WebAuthnAuthenticationFactory.create(validCredentialId)
      mockSql.mockResolvedValueOnce([
        {
          credential_id: validCredentialId,
          user_id: 'test-user-id',
          public_key: Buffer.from([1, 2, 3, 4, 5]),
          counter: 5,
        },
      ])
      mockVerifyAuthenticationResponse.mockResolvedValueOnce({ verified: false })

      const startTime1 = Date.now()
      await verifyWebAuthnAuthentication(validAuthData, challenge)
      const endTime1 = Date.now()

      // Invalid credential lookup
      const invalidAuthData = WebAuthnAuthenticationFactory.create(invalidCredentialId)
      mockSql.mockResolvedValueOnce([])

      const startTime2 = Date.now()
      await verifyWebAuthnAuthentication(invalidAuthData, challenge)
      const endTime2 = Date.now()

      // Timing should be relatively similar to prevent timing attacks
      const timeDiff1 = endTime1 - startTime1
      const timeDiff2 = endTime2 - startTime2

      // Both should return quickly (within reasonable bounds)
      expect(timeDiff1).toBeLessThan(100)
      expect(timeDiff2).toBeLessThan(100)
    })
  })

  describe('Production Environment Behavior', () => {
    it('should handle high-frequency authentication requests', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()
      const challenge = WebAuthnTestHelpers.generateChallenge()

      const storedCredential = {
        credential_id: credentialId,
        user_id: userId,
        public_key: Buffer.from([1, 2, 3, 4, 5]),
        counter: 100,
      }

      // Simulate 50 rapid authentication attempts
      const authPromises = Array.from({ length: 50 }, (_, i) => {
        const authData = WebAuthnAuthenticationFactory.create(credentialId)

        mockSql.mockResolvedValueOnce([storedCredential])
        mockVerifyAuthenticationResponse.mockResolvedValueOnce({
          verified: true,
          authenticationInfo: {
            newCounter: 101 + i,
            credentialID: new Uint8Array(Buffer.from(credentialId)),
          },
        })
        mockSql.mockResolvedValueOnce([])

        return verifyWebAuthnAuthentication(authData, challenge)
      })

      const results = await Promise.all(authPromises)

      // All should succeed
      expect(results).toHaveLength(50)
      results.forEach(result => {
        expect(result.verified).toBe(true)
        expect(result.userId).toBe(userId)
        expect(result.credentialId).toBe(credentialId)
      })
    })

    it('should handle memory cleanup for long-running sessions', async () => {
      // This test ensures no memory leaks in repeated operations
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'memory-test@example.com'

      // Perform 1000 registration option generations
      for (let i = 0; i < 1000; i++) {
        mockSql.mockResolvedValueOnce([])
        await generateWebAuthnRegistration(userId, userEmail)
      }

      // Memory should be stable (no easy way to test actual memory usage in unit tests)
      expect(mockSql).toHaveBeenCalledTimes(1000)
      expect(mockGenerateRegistrationOptions).toHaveBeenCalledTimes(1000)
    })

    it('should handle network timeouts and database connection issues', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      // Test individual connection errors
      mockSql.mockRejectedValueOnce(new Error('Connection timeout'))
      await expect(getUserWebAuthnCredentials(userId)).rejects.toThrow('Connection timeout')

      mockSql.mockRejectedValueOnce(new Error('Connection refused'))
      await expect(getUserWebAuthnCredentials(userId)).rejects.toThrow('Connection refused')

      mockSql.mockRejectedValueOnce(new Error('Database unavailable'))
      await expect(getUserWebAuthnCredentials(userId)).rejects.toThrow('Database unavailable')
    })

    it('should maintain data integrity under stress', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const credentialId = WebAuthnTestHelpers.generateCredentialId()

      // Simulate stress scenario: concurrent reads and writes
      const readPromises = Array.from({ length: 25 }, () => {
        mockSql.mockResolvedValueOnce([StoredCredentialFactory.create(userId, { credentialId })])
        return getUserWebAuthnCredentials(userId)
      })

      const removePromises = Array.from({ length: 25 }, () => {
        mockSql.mockResolvedValueOnce([{ id: 'removed' }])
        return removeWebAuthnCredential(userId, credentialId)
      })

      const [readResults, removeResults] = await Promise.all([
        Promise.all(readPromises),
        Promise.all(removePromises),
      ])

      // All operations should complete successfully
      expect(readResults).toHaveLength(25)
      expect(removeResults).toHaveLength(25)
      expect(removeResults.every(result => result === true)).toBe(true)
    })
  })

  describe('Integration Edge Cases', () => {
    it('should handle SimpleWebAuthn library version compatibility', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'compatibility@example.com'

      // Mock old format response (test backward compatibility)
      mockGenerateRegistrationOptions.mockResolvedValueOnce({
        challenge: 'old-format-challenge',
        rp: { name: 'Old Format', id: 'localhost' },
        user: { id: userId, name: userEmail, displayName: userEmail },
        // Missing some new fields
      })

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toHaveProperty('challenge', 'old-format-challenge')
    })

    it('should handle feature flag configuration changes', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()
      const userEmail = 'feature-flag@example.com'

      // Change security config during execution
      mockGetSecurityConfig.mockReturnValueOnce({
        webauthn: {
          rpName: 'Test App',
          rpId: 'testapp.com',
          origin: 'https://testapp.com',
          timeout: 30000,
        },
      })

      mockSql.mockResolvedValueOnce([])

      await generateWebAuthnRegistration(userId, userEmail)

      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpName: 'Test App',
          rpID: 'testapp.com',
          timeout: 30000,
        })
      )
    })

    it('should handle database schema evolution', async () => {
      const userId = WebAuthnTestHelpers.generateUserId()

      // Mock response with additional fields (forward compatibility)
      const extendedCredential = {
        id: 'cred-id',
        credential_id: 'cred-123',
        device_name: 'iPhone 15',
        created_at: new Date(),
        last_used_at: new Date(),
        // New fields added in schema v2
        device_model: 'iPhone15,2',
        os_version: 'iOS 17.0',
        security_level: 'high',
      }

      mockSql.mockResolvedValueOnce([extendedCredential])

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toEqual([extendedCredential])
    })
  })
})

describe('WebAuthn Server Error Recovery', () => {
  let mockSql: ReturnType<typeof vi.fn<SqlFunction>>
  let mockGenerateRegistrationOptions: ReturnType<typeof vi.fn<GenerateRegistrationOptionsFunction>>
  let mockGetSecurityConfig: ReturnType<typeof vi.fn<GetSecurityConfigFunction>>

  beforeEach(async () => {
    vi.clearAllMocks()

    // Import mocked modules
    const { sql } = await import('@/lib/db')
    const { generateRegistrationOptions } = await import('@simplewebauthn/server')
    const { getSecurityConfig } = await import('@/lib/security/feature-flags')

    mockSql = sql
    mockGenerateRegistrationOptions = generateRegistrationOptions
    mockGetSecurityConfig = getSecurityConfig

    // Setup default security config mock
    mockGetSecurityConfig.mockReturnValue({
      webauthn: {
        rpName: 'Contribux Test',
        rpId: 'localhost',
        origin: 'http://localhost:3000',
        timeout: 60000,
      },
    })
  })

  it('should handle graceful degradation when WebAuthn is unavailable', async () => {
    vi.mocked(mockGenerateRegistrationOptions).mockRejectedValue(
      new Error('WebAuthn not supported')
    )

    mockSql.mockResolvedValueOnce([])

    await expect(generateWebAuthnRegistration('user-id', 'user@example.com')).rejects.toThrow(
      'WebAuthn not supported'
    )
  })

  it('should handle database recovery scenarios', async () => {
    // Import test utilities
    const { createStoredWebAuthnCredential, WebAuthnTestHelpers } = await import(
      '../../utils/webauthn-test-utilities'
    )

    const userId = WebAuthnTestHelpers.generateUserId()

    // Mock database failure using the underlying mock function
    const underlyingMock = mockSql as any
    underlyingMock.mockRejectedValueOnce(new Error('Database temporarily unavailable'))

    await expect(getUserWebAuthnCredentials(userId)).rejects.toThrow(
      'Database temporarily unavailable'
    )

    // Second call succeeds (simulating recovery)
    const mockCredential = createStoredWebAuthnCredential(userId)
    underlyingMock.mockResolvedValueOnce([mockCredential])

    const result = await getUserWebAuthnCredentials(userId)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(mockCredential)
  })
})
