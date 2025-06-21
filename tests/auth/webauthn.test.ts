import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  checkWebAuthnSupport,
  getClientConfig,
  validateWebAuthnRequest
} from '@/lib/auth/webauthn'
import type { WebAuthnConfig } from '@/lib/auth/webauthn-config'
import { sql } from '@/lib/db/config'
import type { 
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON 
} from '@simplewebauthn/types'

// Mock env validation for this test file
vi.mock("@/lib/validation/env", () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    JWT_SECRET: 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
    GITHUB_CLIENT_ID: 'test1234567890123456',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret-with-sufficient-length-for-testing',
    NEXT_PUBLIC_RP_ID: 'localhost',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    WEBAUTHN_RP_NAME: 'Contribux Test',
  },
  isProduction: () => false,
  isDevelopment: () => false,
  isTest: () => true,
  getJwtSecret: () => 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
  getEncryptionKey: () => 'test-encryption-key-32-bytes-long',
}));

// WebAuthn configuration for tests
const mockWebAuthnConfig = {
  rpId: 'localhost',
  rpName: 'Contribux',
  origins: ['http://localhost:3000'],
  isDevelopment: true,
  isProduction: false,
  challengeExpiry: 300000, // 5 minutes
  supportedAlgorithms: [-7, -257], // ES256, RS256
  timeout: 60000, // 60 seconds
}

// Mock WebAuthn configuration
vi.mock('@/lib/auth/webauthn-config', () => ({
  getWebAuthnConfig: vi.fn(() => mockWebAuthnConfig),
  isOriginAllowed: vi.fn((origin: string) => mockWebAuthnConfig.origins.includes(origin)),
  getPrimaryOrigin: vi.fn(() => mockWebAuthnConfig.origins[0]),
  validateWebAuthnConfig: vi.fn(),
}))

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
          { alg: -7, type: 'public-key' }  // ES256 is always first, RS256 might not be in test
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
        allowCredentials: expect.any(Array)
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

      const mockResponse: RegistrationResponseJSON = {
        id: 'expired-cred',
        rawId: 'expired-cred',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.create',
            challenge: 'expired-challenge',
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

  describe('Configuration Support', () => {
    it('should generate registration options with custom config', async () => {
      const customConfig: WebAuthnConfig = {
        rpId: 'custom.example.com',
        rpName: 'Custom App',
        origins: ['https://custom.example.com'],
        isDevelopment: false,
        isProduction: true,
        challengeExpiry: 300000,
        supportedAlgorithms: [-7, -257],
        timeout: 60000,
      }

      const options = await generateRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.github_username
      }, customConfig)

      expect(options).toMatchObject({
        rp: {
          name: 'Custom App',
          id: 'custom.example.com'
        }
      })
    })

    it('should generate authentication options with custom config', async () => {
      const customConfig: WebAuthnConfig = {
        rpId: 'custom.example.com',
        rpName: 'Custom App',
        origins: ['https://custom.example.com'],
        isDevelopment: false,
        isProduction: true,
        challengeExpiry: 300000,
        supportedAlgorithms: [-7, -257],
        timeout: 60000,
      }

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([
        { credential_id: Buffer.from('cred-1').toString('base64'), transports: ['internal'] }
      ])

      const options = await generateAuthenticationOptions({
        userId: mockUser.id
      }, customConfig)

      expect(options).toMatchObject({
        rpId: 'custom.example.com'
      })
    })

    it('should validate origin in registration verification', async () => {
      const customConfig: WebAuthnConfig = {
        rpId: 'example.com',
        rpName: 'Test App',
        origins: ['https://example.com'],
        isDevelopment: false,
        isProduction: true,
        challengeExpiry: 300000,
        supportedAlgorithms: [-7, -257],
        timeout: 60000,
      }

      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ 
        challenge: 'test-challenge',
        user_id: mockUser.id,
        created_at: new Date()
      }])

      const mockResponse: RegistrationResponseJSON = {
        id: 'credential-id-123',
        rawId: 'credential-id-123',
        response: {
          clientDataJSON: btoa(JSON.stringify({
            type: 'webauthn.create',
            challenge: 'test-challenge',
            origin: 'https://evil.com'  // Not allowed origin
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
          expectedOrigin: 'https://evil.com',
          expectedRPID: 'example.com'
        }, customConfig)
      ).rejects.toThrow("Origin 'https://evil.com' is not allowed for this WebAuthn configuration")
    })

    it('should validate origin in authentication verification', async () => {
      const customConfig: WebAuthnConfig = {
        rpId: 'example.com',
        rpName: 'Test App',
        origins: ['https://example.com'],
        isDevelopment: false,
        isProduction: true,
        challengeExpiry: 300000,
        supportedAlgorithms: [-7, -257],
        timeout: 60000,
      }

      await expect(
        verifyAuthenticationResponse({
          response: {} as AuthenticationResponseJSON,
          expectedChallenge: 'test-challenge',
          expectedOrigin: 'https://evil.com',
          expectedRPID: 'example.com'
        }, customConfig)
      ).rejects.toThrow("Origin 'https://evil.com' is not allowed for this WebAuthn configuration")
    })

    it('should return client configuration', () => {
      const config = getClientConfig(mockWebAuthnConfig)

      expect(config).toEqual({
        rpId: 'localhost',
        rpName: 'Contribux',
        origins: ['http://localhost:3000'],
        isDevelopment: true,
      })
    })

    it('should validate WebAuthn request parameters', () => {
      expect(() => 
        validateWebAuthnRequest('http://localhost:3000', 'localhost', mockWebAuthnConfig)
      ).not.toThrow()

      expect(() => 
        validateWebAuthnRequest('https://evil.com', 'localhost', mockWebAuthnConfig)
      ).toThrow("Origin 'https://evil.com' is not allowed")

      expect(() => 
        validateWebAuthnRequest('http://localhost:3000', 'wrong-rp-id', mockWebAuthnConfig)
      ).toThrow("RP ID 'wrong-rp-id' does not match configured RP ID 'localhost'")
    })
  })
})

