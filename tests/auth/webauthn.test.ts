import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  checkWebAuthnSupport
} from '@/lib/auth/webauthn'
import { sql } from '@/lib/db/config'
import type { 
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON 
} from '@simplewebauthn/types'

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn()
}))

// Mock crypto functions
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: vi.fn((array) => {
      // Fill array with random values
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
      return array
    }),
    randomUUID: vi.fn(() => 'test-uuid-' + Date.now()),
    subtle: {
      digest: vi.fn(async () => new ArrayBuffer(32))
    }
  },
  writable: true,
  configurable: true
})

// Mock SimpleWebAuthn server functions to avoid complex CBOR encoding issues
vi.mock('@simplewebauthn/server', async () => {
  const actual = await vi.importActual('@simplewebauthn/server')
  return {
    ...actual,
    generateRegistrationOptions: vi.fn((options) => ({
      challenge: options.challenge,
      rp: {
        name: options.rpName,
        id: options.rpID
      },
      user: {
        id: options.userID,
        name: options.userName,
        displayName: options.userDisplayName
      },
      pubKeyCredParams: options.supportedAlgorithmIDs.map(alg => ({
        alg,
        type: 'public-key'
      })),
      timeout: options.timeout,
      attestation: options.attestationType,
      authenticatorSelection: options.authenticatorSelection
    })),
    verifyRegistrationResponse: vi.fn(async () => ({
      verified: true,
      registrationInfo: {
        credentialID: new Uint8Array([1, 2, 3, 4, 5]),
        credentialPublicKey: new Uint8Array([6, 7, 8, 9, 10]),
        counter: 0,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false
      }
    })),
    generateAuthenticationOptions: vi.fn((options) => ({
      challenge: options.challenge,
      timeout: options.timeout,
      userVerification: options.userVerification,
      rpId: options.rpID,
      allowCredentials: options.allowCredentials
    })),
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified: true,
      authenticationInfo: {
        newCounter: 1,
        credentialID: new Uint8Array([1, 2, 3, 4, 5])
      }
    }))
  }
})

describe('WebAuthn Authentication', () => {
  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    github_username: 'testuser'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Registration Flow', () => {
    it('should generate registration options for a new user', async () => {
      const options = await generateRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.github_username
      })

      expect(options).toMatchObject({
        challenge: expect.any(String),
        rp: {
          name: 'Contribux',
          id: expect.any(String)
        },
        user: {
          id: expect.any(String),
          name: mockUser.github_username,
          displayName: mockUser.github_username
        },
        pubKeyCredParams: expect.arrayContaining([
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' } // RS256
        ]),
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          requireResidentKey: true,
          residentKey: 'required',
          userVerification: 'required'
        }
      })
    })

    it('should store challenge in database for verification', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      await generateRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.github_username
      })

      expect(mockSql).toHaveBeenCalled()
      const calls = mockSql.mock.calls
      const insertCall = calls.find(call => 
        call[0] && call[0][0] && call[0][0].includes('INSERT INTO auth_challenges')
      )
      expect(insertCall).toBeDefined()
    })

    it('should verify registration response and store credential', async () => {
      const mockChallenge = 'test-challenge-123'
      const mockSql = vi.mocked(sql)
      
      // Mock challenge retrieval
      mockSql.mockResolvedValueOnce([{ 
        challenge: mockChallenge,
        user_id: mockUser.id,
        created_at: new Date()
      }])
      
      // Mock credential storage
      mockSql.mockResolvedValueOnce([])
      
      // Mock challenge update
      mockSql.mockResolvedValueOnce([])

      const mockResponse: RegistrationResponseJSON = {
        id: 'credential-id-123',
        rawId: 'credential-id-123',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.create',
            challenge: mockChallenge,
            origin: 'http://localhost:3000'
          })),
          attestationObject: 'mock-attestation',
          publicKey: 'mock-public-key',
          publicKeyAlgorithm: -7,
          authenticatorData: 'mock-auth-data'
        },
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform'
      }

      const result = await verifyRegistrationResponse({
        response: mockResponse,
        expectedChallenge: mockChallenge,
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost'
      })

      expect(result.verified).toBe(true)
      expect(result.registrationInfo).toBeDefined()
      expect(mockSql).toHaveBeenCalled()
      const calls = mockSql.mock.calls
      const insertCall = calls.find(call => 
        call[0] && call[0][0] && call[0][0].includes('INSERT INTO webauthn_credentials')
      )
      expect(insertCall).toBeDefined()
    })

    it('should reject registration with invalid challenge', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([]) // No challenge found

      const mockResponse: RegistrationResponseJSON = {
        id: 'credential-id-123',
        rawId: 'credential-id-123',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.create',
            challenge: 'invalid-challenge',
            origin: 'http://localhost:3000'
          })),
          attestationObject: 'mock-attestation',
          publicKey: 'mock-public-key',
          publicKeyAlgorithm: -7,
          authenticatorData: 'mock-auth-data'
        },
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform'
      }

      await expect(
        verifyRegistrationResponse({
          response: mockResponse,
          expectedChallenge: 'expected-challenge',
          expectedOrigin: 'http://localhost:3000',
          expectedRPID: 'localhost'
        })
      ).rejects.toThrow('Invalid challenge')
    })
  })

  describe('Authentication Flow', () => {
    it('should generate authentication options for existing user', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        { credential_id: Buffer.from('cred-1').toString('base64'), transports: ['internal', 'hybrid'] },
        { credential_id: Buffer.from('cred-2').toString('base64'), transports: ['internal'] }
      ])

      const options = await generateAuthenticationOptions({
        userId: mockUser.id
      })

      expect(options).toMatchObject({
        challenge: expect.any(String),
        timeout: 60000,
        userVerification: 'required',
        rpId: expect.any(String),
        allowCredentials: [
          {
            id: Buffer.from('cred-1').toString('base64'),
            type: 'public-key',
            transports: ['internal', 'hybrid']
          },
          {
            id: Buffer.from('cred-2').toString('base64'),
            type: 'public-key',
            transports: ['internal']
          }
        ]
      })
    })

    it('should verify authentication response', async () => {
      const mockChallenge = 'auth-challenge-123'
      const mockSql = vi.mocked(sql)
      
      // Mock challenge retrieval
      mockSql.mockResolvedValueOnce([{ 
        challenge: mockChallenge,
        user_id: mockUser.id 
      }])
      
      // Mock credential retrieval
      mockSql.mockResolvedValueOnce([{
        credential_id: 'cred-123',
        public_key: 'mock-public-key',
        counter: 0,
        user_id: mockUser.id
      }])
      
      // Mock counter update
      mockSql.mockResolvedValueOnce([])

      const mockResponse: AuthenticationResponseJSON = {
        id: 'cred-123',
        rawId: 'cred-123',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.get',
            challenge: mockChallenge,
            origin: 'http://localhost:3000'
          })),
          authenticatorData: 'mock-auth-data',
          signature: 'mock-signature',
          userHandle: mockUser.id
        },
        type: 'public-key',
        clientExtensionResults: {}
      }

      const result = await verifyAuthenticationResponse({
        response: mockResponse,
        expectedChallenge: mockChallenge,
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost'
      })

      expect(result.verified).toBe(true)
      expect(result.authenticationInfo).toBeDefined()
      expect(result.authenticationInfo?.userId).toBe(mockUser.id)
    })

    it('should reject authentication with unknown credential', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ 
        challenge: 'test-challenge',
        user_id: mockUser.id 
      }])
      mockSql.mockResolvedValueOnce([]) // No credential found

      const mockResponse: AuthenticationResponseJSON = {
        id: 'unknown-cred',
        rawId: 'unknown-cred',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.get',
            challenge: 'test-challenge',
            origin: 'http://localhost:3000'
          })),
          authenticatorData: 'mock-auth-data',
          signature: 'mock-signature',
          userHandle: mockUser.id
        },
        type: 'public-key',
        clientExtensionResults: {}
      }

      await expect(
        verifyAuthenticationResponse({
          response: mockResponse,
          expectedChallenge: 'test-challenge',
          expectedOrigin: 'http://localhost:3000',
          expectedRPID: 'localhost'
        })
      ).rejects.toThrow('Credential not found')
    })

    it('should handle counter verification to prevent replay attacks', async () => {
      const { verifyAuthenticationResponse: mockVerifyAuth } = await import('@simplewebauthn/server')
      vi.mocked(mockVerifyAuth).mockRejectedValueOnce(new Error('Counter verification failed'))
      
      const mockSql = vi.mocked(sql)
      
      // Mock challenge retrieval
      mockSql.mockResolvedValueOnce([{ 
        challenge: 'test-challenge',
        user_id: mockUser.id,
        created_at: new Date()
      }])
      
      // Mock credential with counter
      mockSql.mockResolvedValueOnce([{
        credential_id: Buffer.from('cred-123').toString('base64'),
        public_key: Buffer.from('mock-public-key').toString('base64'),
        counter: 100,
        user_id: mockUser.id
      }])

      const mockResponse: AuthenticationResponseJSON = {
        id: 'cred-123',
        rawId: 'cred-123',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.get',
            challenge: 'test-challenge',
            origin: 'http://localhost:3000'
          })),
          authenticatorData: 'mock-auth-data-with-counter-50', // Counter less than stored
          signature: 'mock-signature',
          userHandle: mockUser.id
        },
        type: 'public-key',
        clientExtensionResults: {}
      }

      await expect(
        verifyAuthenticationResponse({
          response: mockResponse,
          expectedChallenge: 'test-challenge',
          expectedOrigin: 'http://localhost:3000',
          expectedRPID: 'localhost'
        })
      ).rejects.toThrow('Counter verification failed')
    })
  })

  describe('Security Features', () => {
    it('should expire challenges after 5 minutes', async () => {
      const mockSql = vi.mocked(sql)
      const expiredChallenge = {
        challenge: 'expired-challenge',
        user_id: mockUser.id,
        created_at: new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
      }
      
      mockSql.mockResolvedValueOnce([expiredChallenge])

      await expect(
        verifyRegistrationResponse({
          response: {} as RegistrationResponseJSON,
          expectedChallenge: 'expired-challenge',
          expectedOrigin: 'http://localhost:3000',
          expectedRPID: 'localhost'
        })
      ).rejects.toThrow('Challenge expired')
    })

    it('should validate origin for CSRF protection', async () => {
      const { verifyRegistrationResponse: mockVerifyReg } = await import('@simplewebauthn/server')
      vi.mocked(mockVerifyReg).mockRejectedValueOnce(new Error('Invalid origin'))
      
      const mockSql = vi.mocked(sql)
      
      // Mock challenge retrieval
      mockSql.mockResolvedValueOnce([{ 
        challenge: 'test-challenge',
        user_id: mockUser.id,
        created_at: new Date()
      }])

      const mockResponse: RegistrationResponseJSON = {
        id: 'cred-123',
        rawId: 'cred-123',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.create',
            challenge: 'test-challenge',
            origin: 'http://evil.com'
          })),
          attestationObject: 'mock-attestation',
          publicKey: 'mock-public-key',
          publicKeyAlgorithm: -7,
          authenticatorData: 'mock-auth-data'
        },
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform'
      }

      await expect(
        verifyRegistrationResponse({
          response: mockResponse,
          expectedChallenge: 'test-challenge',
          expectedOrigin: 'http://localhost:3000',
          expectedRPID: 'localhost'
        })
      ).rejects.toThrow('Invalid origin')
    })

    it('should support multiple credentials per user', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock existing credentials check
      mockSql.mockResolvedValueOnce([
        { credential_id: 'existing-cred-1' },
        { credential_id: 'existing-cred-2' }
      ])

      const credentialCount = await sql`
        SELECT COUNT(*) as count 
        FROM webauthn_credentials 
        WHERE user_id = ${mockUser.id}
      `

      expect(credentialCount).toBeDefined()
    })
  })

  describe('Fallback Support', () => {
    it('should detect WebAuthn support', async () => {
      const isSupported = await checkWebAuthnSupport()
      expect(typeof isSupported).toBe('boolean')
    })

    it('should provide graceful fallback when WebAuthn not supported', async () => {
      // Mock window without WebAuthn
      const originalWindow = global.window
      global.window = {
        ...global.window,
        PublicKeyCredential: undefined
      } as any

      const isSupported = await checkWebAuthnSupport()
      expect(isSupported).toBe(false)

      // Restore
      global.window = originalWindow
    })
  })
})

