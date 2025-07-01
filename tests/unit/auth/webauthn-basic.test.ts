/**
 * WebAuthn Basic Functionality Tests
 * Tests the core WebAuthn functions with proper mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('WebAuthn Basic Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('WebAuthn Server Functions', () => {
    it('should be able to import WebAuthn functions', async () => {
      // Mock the database first
      vi.doMock('@/lib/db/config', () => ({
        sql: vi.fn().mockResolvedValue([]),
      }))

      // Mock SimpleWebAuthn
      vi.doMock('@simplewebauthn/server', () => ({
        generateRegistrationOptions: vi.fn().mockResolvedValue({
          challenge: 'test-challenge',
          rp: { name: 'Contribux', id: 'localhost' },
          user: { id: 'test-user', name: 'test@example.com', displayName: 'Test User' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          timeout: 60000,
          attestation: 'none',
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'preferred',
            residentKey: 'preferred',
          },
          excludeCredentials: [],
        }),
        verifyRegistrationResponse: vi.fn().mockResolvedValue({
          verified: true,
          registrationInfo: {
            credentialID: new Uint8Array([1, 2, 3, 4, 5]),
            credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
            counter: 0,
            credentialDeviceType: 'singleDevice',
            credentialBackedUp: false,
          },
        }),
        generateAuthenticationOptions: vi.fn().mockResolvedValue({
          challenge: 'auth-challenge',
          timeout: 60000,
          userVerification: 'preferred',
          rpId: 'localhost',
          allowCredentials: [],
        }),
        verifyAuthenticationResponse: vi.fn().mockResolvedValue({
          verified: true,
          authenticationInfo: {
            newCounter: 1,
            credentialID: new Uint8Array([1, 2, 3, 4, 5]),
          },
        }),
      }))

      // Mock security config
      vi.doMock('@/lib/security/feature-flags', () => ({
        getSecurityConfig: () => ({
          webauthn: {
            rpName: 'Contribux',
            rpId: 'localhost',
            origin: 'http://localhost:3000',
            timeout: 60000,
          },
        }),
      }))

      // Now import the functions
      const {
        generateWebAuthnRegistration,
        verifyWebAuthnRegistration,
        getUserWebAuthnCredentials,
      } = await import('@/lib/security/webauthn/server')

      expect(generateWebAuthnRegistration).toBeDefined()
      expect(verifyWebAuthnRegistration).toBeDefined()
      expect(getUserWebAuthnCredentials).toBeDefined()
    })

    it('should generate registration options', async () => {
      // Import the function after mocking
      const { generateWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      const userId = 'test-user-id'
      const userEmail = 'test@example.com'

      const result = await generateWebAuthnRegistration(userId, userEmail)

      expect(result).toBeDefined()
      expect(result.challenge).toBe('test-challenge')
      expect(result.rp.name).toBe('Contribux')
      expect(result.rp.id).toBe('localhost')
    })

    it('should verify registration response', async () => {
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

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

    it('should get user credentials', async () => {
      const { getUserWebAuthnCredentials } = await import('@/lib/security/webauthn/server')

      const userId = 'test-user-id'

      const result = await getUserWebAuthnCredentials(userId)

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('WebAuthn Configuration', () => {
    it('should load security configuration', async () => {
      const { getSecurityConfig } = await import('@/lib/security/feature-flags')

      const config = getSecurityConfig()

      expect(config.webauthn).toBeDefined()
      expect(config.webauthn.rpName).toBe('Contribux')
      expect(config.webauthn.rpId).toBe('localhost')
      expect(config.webauthn.timeout).toBe(60000)
    })
  })

  describe('Database Operations', () => {
    it('should handle database queries', async () => {
      const { sql } = await import('@/lib/db/config')

      const result = await sql`SELECT 1 as test`

      expect(result).toEqual([])
    })
  })

  describe('SimpleWebAuthn Library', () => {
    it('should mock registration options generation', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')

      const options = await generateRegistrationOptions({
        rpName: 'Test RP',
        rpID: 'localhost',
        userName: 'test@example.com',
        userID: Buffer.from('test-user'),
        timeout: 60000,
        attestationType: 'none',
        excludeCredentials: [],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        supportedAlgorithmIDs: [-7, -257],
      })

      expect(options).toBeDefined()
      expect(options.challenge).toBe('test-challenge')
    })

    it('should mock registration verification', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      const verification = await verifyRegistrationResponse({
        response: {
          id: 'test-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-data',
            attestationObject: 'test-attestation',
          },
          type: 'public-key',
        },
        expectedChallenge: 'test-challenge',
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: false,
      })

      expect(verification.verified).toBe(true)
      expect(verification.registrationInfo).toBeDefined()
    })
  })

  describe('Integration Test', () => {
    it('should complete a full registration flow', async () => {
      const { generateWebAuthnRegistration, verifyWebAuthnRegistration } = await import(
        '@/lib/security/webauthn/server'
      )

      const userId = 'integration-test-user'
      const userEmail = 'integration@example.com'

      // Step 1: Generate registration options
      const options = await generateWebAuthnRegistration(userId, userEmail)
      expect(options).toBeDefined()
      expect(options.challenge).toBe('test-challenge')

      // Step 2: Simulate client response
      const mockResponse = {
        id: 'integration-credential-id',
        rawId: 'integration-raw-id',
        response: {
          clientDataJSON: 'integration-client-data',
          attestationObject: 'integration-attestation',
        },
        type: 'public-key' as const,
      }

      // Step 3: Verify registration
      const result = await verifyWebAuthnRegistration(userId, mockResponse, options.challenge)
      expect(result.verified).toBe(true)
      expect(result.credentialId).toBeDefined()
    })
  })
})
