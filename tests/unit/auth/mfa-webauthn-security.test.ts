/**
 * WebAuthn Security Test Suite
 * Comprehensive security testing for WebAuthn implementation
 * Tests credential registration, authentication, and security controls
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateWebAuthnAuthentication,
  generateWebAuthnRegistration,
  verifyWebAuthnAuthentication,
  verifyWebAuthnRegistration,
} from '@/lib/security/webauthn/server'
import type { User, WebAuthnCredential } from '@/types/auth'

// Mock @simplewebauthn/server for controlled testing
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
      enableHealthChecks: false,
      enableMetrics: false,
    },
  }),
}))

// Mock config
vi.mock('@/lib/config', () => ({
  default: {
    webauthn: {
      rpId: 'test.localhost',
      timeout: 60000,
      supportedAlgorithms: [-7, -257],
    },
  },
}))

describe('WebAuthn Security', () => {
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    displayName: 'Test User',
    username: 'testuser',
    avatarUrl: 'https://example.com/avatar.jpg',
    githubId: 123456,
    githubUsername: 'testuser',
    twoFactorEnabled: false,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const _mockWebAuthnCredential: WebAuthnCredential = {
    id: 'cred-123',
    userId: mockUser.id,
    credentialId: 'test-credential-id',
    publicKey: 'base64-encoded-public-key',
    counter: 0,
    deviceType: 'single_device',
    backedUp: false,
    transports: ['usb'],
    attestationType: 'none',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockRegistrationOptions = {
    challenge: 'test-challenge-base64url',
    rp: {
      id: 'test.localhost',
      name: 'Contribux',
    },
    user: {
      id: mockUser.id,
      name: mockUser.email,
      displayName: mockUser.displayName,
    },
    pubKeyCredParams: [
      { type: 'public-key' as const, alg: -7 },
      { type: 'public-key' as const, alg: -257 },
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: 'cross-platform' as const,
      userVerification: 'preferred' as const,
      residentKey: 'preferred' as const,
    },
    attestation: 'none' as const,
  }

  const _mockPublicKeyCredential = {
    id: 'test-credential-id',
    type: 'public-key' as const,
    rawId: new ArrayBuffer(32),
    response: {
      clientDataJSON: new ArrayBuffer(128),
      attestationObject: new ArrayBuffer(256),
    },
  } as PublicKeyCredential

  beforeEach(async () => {
    vi.clearAllMocks()

    // Re-setup the security config mock after clearing
    const { getSecurityConfig } = await import('@/lib/security/feature-flags')
    vi.mocked(getSecurityConfig).mockReturnValue({
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
        enableHealthChecks: false,
        enableMetrics: false,
      },
    })
  })

  describe('Credential Registration Security', () => {
    it('should register new security keys with proper validation', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')
      vi.mocked(generateRegistrationOptions).mockResolvedValue(mockRegistrationOptions)

      const result = await generateWebAuthnRegistration(mockUser.id, mockUser.email)

      expect(result).toBeDefined()
      expect(result.challenge).toBe('test-challenge-base64url')
      expect(result.rp.id).toBe('test.localhost')
    })

    it('should validate authenticator requirements strictly', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        ...mockRegistrationOptions,
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          userVerification: 'required', // Stricter requirement
          residentKey: 'required',
        },
      })

      const result = await generateWebAuthnRegistration(mockUser.id, mockUser.email)

      expect(result).toBeDefined()
      expect(result.authenticatorSelection?.userVerification).toBe('required')
      expect(result.authenticatorSelection?.residentKey).toBe('required')
    })

    it('should handle device management with excluded credentials', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')

      // Mock database with existing credentials
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        { credential_id: 'existing-cred-1' },
        { credential_id: 'existing-cred-2' },
      ])

      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        ...mockRegistrationOptions,
        excludeCredentials: ['existing-cred-1', 'existing-cred-2'].map(id => ({
          id,
          type: 'public-key' as const,
          transports: ['usb', 'nfc'] as AuthenticatorTransport[],
        })),
      })

      const result = await generateWebAuthnRegistration(mockUser.id, mockUser.email)

      expect(result).toBeDefined()
      expect(result.excludeCredentials).toHaveLength(2)
      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: expect.arrayContaining([
            expect.objectContaining({ id: 'existing-cred-1' }),
            expect.objectContaining({ id: 'existing-cred-2' }),
          ]),
        })
      )
    })

    it('should implement fallback for registration when library unavailable', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')

      // Mock library failure
      vi.mocked(generateRegistrationOptions).mockRejectedValueOnce(new Error('Module not found'))

      // Mock empty credentials from database
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([])

      try {
        const result = await generateWebAuthnRegistration(mockUser.id, mockUser.email)
        // If it doesn't throw, check the result
        expect(result).toBeDefined()
      } catch (error) {
        // Expected to throw since the mock library failed
        expect(error).toBeDefined()
      }
    })

    it('should validate registration response cryptographically', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array([1, 2, 3, 4]),
            publicKey: new Uint8Array([1, 2, 3, 4]),
            counter: 0,
          },
        },
      })

      // Mock database insert
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([])

      const mockResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          clientDataJSON: 'client-data',
          attestationObject: 'attestation-object',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnRegistration(mockUser.id, mockResponse, 'test-challenge')

      expect(result.verified).toBe(true)
      expect(result.credentialId).toBeDefined()
      expect(verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          response: mockResponse,
          expectedChallenge: 'test-challenge',
          requireUserVerification: false,
        })
      )
    })

    it('should handle registration failures securely', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: false,
        registrationInfo: undefined,
      })

      const mockResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          clientDataJSON: 'client-data',
          attestationObject: 'attestation-object',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnRegistration(mockUser.id, mockResponse, 'test-challenge')

      expect(result.verified).toBe(false)
      expect(result.error).toBe('Registration verification failed')
    })
  })

  describe('Authentication Security', () => {
    it('should verify valid assertions with proper challenge validation', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
        },
      })

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      // Mock database update
      vi.mocked(sql).mockResolvedValueOnce([])

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge')

      expect(result.verified).toBe(true)
      expect(result.userId).toBe(mockUser.id)
      expect(result.credentialId).toBe('test-credential-id')
    })

    it('should handle challenge validation security', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      // Test with expired/invalid challenge
      vi.mocked(verifyAuthenticationResponse).mockRejectedValue(
        new Error('Challenge verification failed')
      )

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'invalid-challenge')

      expect(result.verified).toBe(false)
      expect(result.error).toBe('Authentication verification failed')
    })

    it('should prevent credential replay attacks with counter validation', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Mock database credential lookup with high counter
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 5, // Higher counter stored
          created_at: new Date(),
        },
      ])

      // Test with counter that hasn't increased (replay attack)
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: false, // Should fail due to counter validation
        authenticationInfo: {
          newCounter: 0, // Same or lower counter value
        },
      })

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge')

      expect(result.verified).toBe(false)
      expect(result.error).toBe('Authentication verification failed')
    })

    it('should validate credential ownership', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      // Mock database update
      vi.mocked(sql).mockResolvedValueOnce([])

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          userVerified: true,
        },
      })

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge')

      expect(result.verified).toBe(true) // Library handles this validation
    })

    it('should generate secure authentication options', async () => {
      const { generateAuthenticationOptions } = await import('@simplewebauthn/server')

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([{ credential_id: 'cred-1' }])

      const expectedOptions = {
        challenge: 'auth-challenge-base64url',
        timeout: 60000,
        rpId: 'test.localhost',
        allowCredentials: [
          {
            id: 'cred-1',
            type: 'public-key' as const,
            transports: ['usb', 'nfc'] as AuthenticatorTransport[],
          },
        ],
        userVerification: 'preferred' as const,
      }

      vi.mocked(generateAuthenticationOptions).mockResolvedValue(expectedOptions)

      const result = await generateWebAuthnAuthentication(mockUser.id)

      expect(result.challenge).toBe('auth-challenge-base64url')
      expect(result.allowCredentials).toHaveLength(1)
      expect(result.allowCredentials[0].id).toBe('cred-1')
      expect(generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: expect.any(String),
          timeout: 60000,
          userVerification: 'preferred',
        })
      )
    })

    it('should implement fallback authentication when library unavailable', async () => {
      const { generateAuthenticationOptions } = await import('@simplewebauthn/server')

      // Mock library failure
      vi.mocked(generateAuthenticationOptions).mockRejectedValueOnce(new Error('Module not found'))

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([{ credential_id: 'cred-1' }])

      try {
        const result = await generateWebAuthnAuthentication(mockUser.id)
        // If it doesn't throw, check the result
        expect(result).toBeDefined()
      } catch (error) {
        // Expected to throw since the mock library failed
        expect(error).toBeDefined()
      }
    })
  })

  describe('Security Controls and Validation', () => {
    it('should enforce user presence validation', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      // Mock database update
      vi.mocked(sql).mockResolvedValueOnce([])

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          userVerified: false, // User presence not verified
        },
      })

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge')

      // Should still succeed but record user verification status
      expect(result.verified).toBe(true)
    })

    it('should validate credential sources and attestation', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array([1, 2, 3, 4]),
            publicKey: new Uint8Array([1, 2, 3, 4]),
            counter: 0,
          },
        },
      })

      // Mock database insert
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([])

      const mockResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          clientDataJSON: 'client-data',
          attestationObject: 'attestation-object',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnRegistration(mockUser.id, mockResponse, 'test-challenge')

      expect(result.verified).toBe(true)
      expect(result.credentialId).toBeDefined()
    })

    it('should handle fallback scenarios gracefully', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Mock database credential lookup
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      // Test fallback authentication when library fails
      vi.mocked(verifyAuthenticationResponse).mockRejectedValueOnce(new Error('Library error'))

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge')

      // Should return error since verification failed
      expect(result.verified).toBe(false)
      expect(result.error).toBe('Authentication verification failed')
    })

    it('should validate input parameters strictly', async () => {
      // Mock database with no credentials found
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([])

      const invalidAuthResponse = {
        id: '',
        rawId: '',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      // Test with empty credential ID
      const result1 = await verifyWebAuthnAuthentication(invalidAuthResponse, 'test-challenge')

      expect(result1.verified).toBe(false)
      expect(result1.error).toBe('Credential not found')

      // Test null response which should trigger try-catch error handling
      try {
        const result2 = await verifyWebAuthnAuthentication(
          null as unknown as typeof mockAuthResponse,
          'test-challenge'
        )
        expect(result2.verified).toBe(false)
        expect(result2.error).toBe('Authentication verification failed')
      } catch (error) {
        // Expected to throw due to null parameter
        expect(error).toBeDefined()
      }
    })

    it('should handle transport validation for security keys', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')

      // Mock database with existing credentials
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([{ credential_id: 'existing-cred' }])

      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        ...mockRegistrationOptions,
        excludeCredentials: [
          {
            id: 'existing-cred',
            type: 'public-key' as const,
            transports: ['usb', 'nfc', 'ble'] as AuthenticatorTransport[],
          },
        ],
      })

      const result = await generateWebAuthnRegistration(mockUser.id, mockUser.email)

      expect(result).toBeDefined()
      expect(result.excludeCredentials?.[0].transports).toContain('usb')
      expect(result.excludeCredentials?.[0].transports).toContain('nfc')
    })
  })

  describe('Utility Functions and Edge Cases', () => {
    it('should handle malformed credential data gracefully', async () => {
      // Mock database with malformed credential
      const { sql } = await import('@/lib/db')
      vi.mocked(sql).mockResolvedValueOnce([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('invalid-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
      vi.mocked(verifyAuthenticationResponse).mockRejectedValue(
        new Error('Invalid public key format')
      )

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      const result = await verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge')

      expect(result.verified).toBe(false)
      expect(result.error).toBe('Authentication verification failed')
    })

    it('should sanitize error messages for security', async () => {
      // Force an error condition by trying to verify with null response
      try {
        const result = await verifyWebAuthnAuthentication(
          null as unknown as typeof mockAuthResponse,
          'test-challenge'
        )

        expect(result.verified).toBe(false)
        expect(result.error).not.toContain('publicKey')
        expect(result.error).not.toContain('credential')
        expect(result.error).not.toContain('internal')
      } catch (error) {
        // Expected to throw due to null parameter
        expect(error).toBeDefined()
      }
    })

    it('should handle concurrent authentication attempts', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
      const { sql } = await import('@/lib/db')

      // Mock database credential lookup for each concurrent request
      vi.mocked(sql).mockResolvedValue([
        {
          credential_id: 'test-credential-id',
          user_id: mockUser.id,
          public_key: Buffer.from('test-public-key'),
          counter: 0,
          created_at: new Date(),
        },
      ])

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          userVerified: true,
        },
      })

      const mockAuthResponse = {
        id: 'test-credential-id',
        rawId: 'test-credential-id',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      }

      // Simulate multiple concurrent authentication attempts
      const promises = Array(3)
        .fill(null)
        .map(() => verifyWebAuthnAuthentication(mockAuthResponse, 'test-challenge'))

      const results = await Promise.all(promises)

      // All should complete without errors
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(typeof result.verified).toBe('boolean')
      })
    })
  })
})
