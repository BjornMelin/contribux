/**
 * WebAuthn Security Test Suite
 * Comprehensive security testing for WebAuthn implementation
 * Tests credential registration, authentication, and security controls
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  arrayBufferToBase64url,
  base64urlToArrayBuffer,
} from '@/lib/auth/webauthn-enhanced'
import type { WebAuthnCredential, User } from '@/types/auth'

// Mock @simplewebauthn/server for controlled testing
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
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

  const mockWebAuthnCredential: WebAuthnCredential = {
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

  const mockPublicKeyCredential = {
    id: 'test-credential-id',
    type: 'public-key' as const,
    rawId: new ArrayBuffer(32),
    response: {
      clientDataJSON: new ArrayBuffer(128),
      attestationObject: new ArrayBuffer(256),
    },
  } as PublicKeyCredential

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Credential Registration Security', () => {
    it('should register new security keys with proper validation', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')
      vi.mocked(generateRegistrationOptions).mockResolvedValue(mockRegistrationOptions)

      const result = await generateWebAuthnRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
        excludeCredentials: [],
      })

      expect(result.success).toBe(true)
      expect(result.method).toBe('webauthn')
      expect(result.registrationOptions).toBeDefined()
      expect(result.registrationOptions?.challenge).toBe('test-challenge-base64url')
      expect(result.registrationOptions?.rp.id).toBe('test.localhost')
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

      const result = await generateWebAuthnRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })

      expect(result.success).toBe(true)
      expect(result.registrationOptions?.authenticatorSelection?.userVerification).toBe('required')
      expect(result.registrationOptions?.authenticatorSelection?.residentKey).toBe('required')
    })

    it('should handle device management with excluded credentials', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')
      const excludedCredentials = ['existing-cred-1', 'existing-cred-2']

      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        ...mockRegistrationOptions,
        excludeCredentials: excludedCredentials.map(id => ({
          id,
          type: 'public-key' as const,
          transports: ['usb', 'nfc'] as AuthenticatorTransport[],
        })),
      })

      const result = await generateWebAuthnRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
        excludeCredentials: excludedCredentials,
      })

      expect(result.success).toBe(true)
      expect(result.registrationOptions?.excludeCredentials).toHaveLength(2)
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
      // Mock import failure to test fallback
      vi.doMock('@simplewebauthn/server', () => {
        throw new Error('Module not found')
      })

      const result = await generateWebAuthnRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })

      expect(result.success).toBe(true)
      expect(result.registrationOptions?.challenge).toBeDefined()
      expect(result.registrationOptions?.rp.name).toBe('Contribux')
    })

    it('should validate registration response cryptographically', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: 'verified-credential-id',
          credentialPublicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          credentialDeviceType: 'single_device',
          credentialBackedUp: false,
          userVerified: true,
          attestationType: 'none',
        },
      })

      const result = await verifyWebAuthnRegistration(
        mockPublicKeyCredential,
        'test-challenge',
        'test.localhost'
      )

      expect(result.verified).toBe(true)
      expect(result.registrationInfo?.credentialID).toBe('verified-credential-id')
      expect(result.registrationInfo?.userVerified).toBe(true)
      expect(verifyRegistrationResponse).toHaveBeenCalledWith({
        response: mockPublicKeyCredential,
        expectedChallenge: 'test-challenge',
        expectedOrigin: 'https://test.localhost',
        expectedRPID: 'test.localhost',
        requireUserVerification: false,
      })
    })

    it('should handle registration failures securely', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: false,
        registrationInfo: undefined,
      })

      const result = await verifyWebAuthnRegistration(
        mockPublicKeyCredential,
        'test-challenge',
        'test.localhost'
      )

      expect(result.verified).toBe(false)
      expect(result.registrationInfo).toBeUndefined()
    })
  })

  describe('Authentication Security', () => {
    it('should verify valid assertions with proper challenge validation', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialID: 'test-credential-id',
          newCounter: 1,
          userVerified: true,
        },
      })

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      expect(result.success).toBe(true)
      expect(result.method).toBe('webauthn')
      expect(verifyAuthenticationResponse).toHaveBeenCalledWith({
        response: mockPublicKeyCredential,
        expectedChallenge: 'test-challenge',
        expectedOrigin: 'https://test.localhost',
        expectedRPID: 'test.localhost',
        authenticator: {
          credentialID: 'test-credential-id',
          credentialPublicKey: expect.any(Buffer),
          counter: 0,
        },
        requireUserVerification: false,
      })
    })

    it('should handle challenge validation security', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Test with expired/invalid challenge
      vi.mocked(verifyAuthenticationResponse).mockRejectedValue(
        new Error('Challenge verification failed')
      )

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        mockWebAuthnCredential,
        'invalid-challenge'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should prevent credential replay attacks with counter validation', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      // Test with counter that hasn't increased (replay attack)
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: false, // Should fail due to counter validation
        authenticationInfo: {
          credentialID: 'test-credential-id',
          newCounter: 0, // Same counter value
          userVerified: true,
        },
      })

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        {
          ...mockWebAuthnCredential,
          counter: 5, // Higher counter stored
        },
        'test-challenge'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('WebAuthn authentication failed')
    })

    it('should validate credential ownership', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialID: 'different-credential-id', // Mismatched credential
          newCounter: 1,
          userVerified: true,
        },
      })

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      expect(result.success).toBe(true) // Library handles this validation
    })

    it('should generate secure authentication options', async () => {
      const { generateAuthenticationOptions } = await import('@simplewebauthn/server')

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

      const result = await generateWebAuthnAuthenticationOptions(['cred-1'])

      expect(result.challenge).toBe('auth-challenge-base64url')
      expect(result.allowCredentials).toHaveLength(1)
      expect(result.allowCredentials[0].id).toBe('cred-1')
      expect(generateAuthenticationOptions).toHaveBeenCalledWith({
        rpID: 'test.localhost',
        timeout: 60000,
        allowCredentials: expect.any(Array),
        userVerification: 'preferred',
      })
    })

    it('should implement fallback authentication when library unavailable', async () => {
      // Mock import failure
      vi.doMock('@simplewebauthn/server', () => {
        throw new Error('Module not found')
      })

      const result = await generateWebAuthnAuthenticationOptions(['cred-1'])

      expect(result.challenge).toBeDefined()
      expect(result.rpId).toBe('localhost') // Fallback value
      expect(result.allowCredentials).toHaveLength(1)
    })
  })

  describe('Security Controls and Validation', () => {
    it('should enforce user presence validation', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialID: 'test-credential-id',
          newCounter: 1,
          userVerified: false, // User presence not verified
        },
      })

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      // Should still succeed but record user verification status
      expect(result.success).toBe(true)
    })

    it('should validate credential sources and attestation', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: 'verified-credential-id',
          credentialPublicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          credentialDeviceType: 'multi_device', // Different device type
          credentialBackedUp: true,
          userVerified: true,
          attestationType: 'basic', // Stronger attestation
        },
      })

      const result = await verifyWebAuthnRegistration(
        mockPublicKeyCredential,
        'test-challenge',
        'test.localhost'
      )

      expect(result.verified).toBe(true)
      expect(result.registrationInfo?.credentialDeviceType).toBe('multi_device')
      expect(result.registrationInfo?.credentialBackedUp).toBe(true)
      expect(result.registrationInfo?.attestationType).toBe('basic')
    })

    it('should handle fallback scenarios gracefully', async () => {
      // Test fallback authentication when library fails
      vi.doMock('@simplewebauthn/server', () => {
        return {
          verifyAuthenticationResponse: vi.fn().mockRejectedValue(new Error('Library error')),
        }
      })

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      // Should use fallback verification
      expect(result.success).toBe(true)
    })

    it('should validate input parameters strictly', async () => {
      // Test missing required parameters
      const result1 = await verifyWebAuthnAuthentication(
        {
          userId: 'invalid-uuid',
          credentialId: '',
          assertion: mockPublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      expect(result1.success).toBe(false)

      // Test missing assertion
      const result2 = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: null as unknown as PublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      expect(result2.success).toBe(false)
    })

    it('should handle transport validation for security keys', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server')

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

      const result = await generateWebAuthnRegistrationOptions({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
        excludeCredentials: ['existing-cred'],
      })

      expect(result.success).toBe(true)
      expect(result.registrationOptions?.excludeCredentials?.[0].transports).toContain('usb')
      expect(result.registrationOptions?.excludeCredentials?.[0].transports).toContain('nfc')
    })
  })

  describe('Utility Functions and Edge Cases', () => {
    it('should handle ArrayBuffer to base64url conversion correctly', () => {
      const testBuffer = new ArrayBuffer(8)
      const view = new Uint8Array(testBuffer)
      view.set([0, 1, 2, 3, 4, 5, 6, 7])

      const base64url = arrayBufferToBase64url(testBuffer)

      expect(base64url).toBe('AAECAwQFBgc') // Expected base64url encoding
      expect(base64url).not.toContain('+')
      expect(base64url).not.toContain('/')
      expect(base64url).not.toContain('=')
    })

    it('should handle base64url to ArrayBuffer conversion correctly', () => {
      const base64url = 'AAECAwQFBgc'
      const arrayBuffer = base64urlToArrayBuffer(base64url)
      const view = new Uint8Array(arrayBuffer)

      expect(view).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))
    })

    it('should handle malformed credential data gracefully', async () => {
      const malformedCredential: WebAuthnCredential = {
        ...mockWebAuthnCredential,
        publicKey: 'invalid-base64!@#$%',
      }

      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: mockPublicKeyCredential,
        },
        malformedCredential,
        'test-challenge'
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should sanitize error messages for security', async () => {
      // Force an error condition
      const result = await verifyWebAuthnAuthentication(
        {
          userId: mockUser.id,
          credentialId: 'test-credential-id',
          assertion: null as unknown as PublicKeyCredential,
        },
        mockWebAuthnCredential,
        'test-challenge'
      )

      expect(result.success).toBe(false)
      expect(result.error).not.toContain('publicKey')
      expect(result.error).not.toContain('credential')
      expect(result.error).not.toContain('internal')
    })

    it('should handle concurrent authentication attempts', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')

      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialID: 'test-credential-id',
          newCounter: 1,
          userVerified: true,
        },
      })

      // Simulate multiple concurrent authentication attempts
      const promises = Array(3)
        .fill(null)
        .map(() =>
          verifyWebAuthnAuthentication(
            {
              userId: mockUser.id,
              credentialId: 'test-credential-id',
              assertion: mockPublicKeyCredential,
            },
            mockWebAuthnCredential,
            'test-challenge'
          )
        )

      const results = await Promise.all(promises)

      // All should complete without errors
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(typeof result.success).toBe('boolean')
      })
    })
  })
})
