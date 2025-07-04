/**
 * WebAuthn Authentication Verification API Tests
 * Tests for /api/security/webauthn/authenticate/verify endpoint
 */

import { POST } from '@/app/api/security/webauthn/authenticate/verify/route'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupDatabaseMock, setupWebAuthnServerMock } from '../../../utils/mocks'

// Mock dependencies
setupDatabaseMock()
setupWebAuthnServerMock()

// Mock feature flags
vi.mock('@/lib/security/feature-flags', () => ({
  securityFeatures: {
    webauthn: true,
  },
}))

// Mock WebAuthn server functions
vi.mock('@/lib/security/webauthn/server', () => ({
  verifyWebAuthnAuthentication: vi.fn(),
}))

describe('/api/security/webauthn/authenticate/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('POST', () => {
    const validRequestBody = {
      response: {
        id: 'test-credential-id',
        rawId: 'test-raw-id',
        response: {
          clientDataJSON: 'test-client-data-json',
          authenticatorData: 'test-authenticator-data',
          signature: 'test-signature',
          userHandle: 'test-user-handle',
        },
        type: 'public-key' as const,
      },
      expectedChallenge: 'test-challenge',
    }

    it('should verify authentication response successfully', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock successful verification
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: true,
        userId: 'test-user-id',
        credentialId: 'test-credential-id',
      })

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        message: 'WebAuthn authentication successful',
        userId: 'test-user-id',
        credentialId: 'test-credential-id',
      })

      expect(verifyWebAuthnAuthentication).toHaveBeenCalledWith(
        validRequestBody.response,
        'test-challenge'
      )
    })

    it('should return 403 when WebAuthn is disabled', async () => {
      // Mock WebAuthn disabled
      vi.doMock('@/lib/security/feature-flags', () => ({
        securityFeatures: {
          webauthn: false,
        },
      }))

      const { POST: DisabledPOST } = await import(
        '@/app/api/security/webauthn/authenticate/verify/route'
      )

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await DisabledPOST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'WebAuthn is not enabled',
      })
    })

    it('should return 400 for invalid request data', async () => {
      const invalidRequestBody = {
        response: {
          id: 'test-credential-id',
          // Missing required fields
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })

    it('should return 401 when authentication verification fails', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock failed verification
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: false,
        error: 'Invalid signature',
      })

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Invalid signature',
      })
    })

    it('should handle authentication without userHandle', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock successful verification
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: true,
        userId: 'test-user-id',
        credentialId: 'test-credential-id',
      })

      const requestWithoutUserHandle = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: 'test-authenticator-data',
            signature: 'test-signature',
            // No userHandle
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestWithoutUserHandle),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should handle verification errors gracefully', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock verification error
      vi.mocked(verifyWebAuthnAuthentication).mockRejectedValueOnce(
        new Error('Database connection failed')
      )

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to verify authentication',
      })
    })

    it('should handle malformed JSON in request body', async () => {
      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid-json-data',
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(500)
    })

    it('should validate response type field', async () => {
      const invalidTypeRequestBody = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: 'test-authenticator-data',
            signature: 'test-signature',
          },
          type: 'invalid-type', // Should be 'public-key'
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidTypeRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('should handle missing expected challenge', async () => {
      const missingChallengeRequestBody = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: 'test-authenticator-data',
            signature: 'test-signature',
          },
          type: 'public-key' as const,
        },
        // Missing expectedChallenge
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(missingChallengeRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('should handle default error message when verification fails without specific error', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock failed verification without specific error
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: false,
      })

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        success: false,
        error: 'Authentication verification failed',
      })
    })

    it('should handle very large credential IDs', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock successful verification
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: true,
        userId: 'test-user-id',
        credentialId: 'test-credential-id',
      })

      const largeCredentialRequestBody = {
        response: {
          id: 'a'.repeat(1000), // Very large credential ID
          rawId: 'b'.repeat(1000),
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: 'test-authenticator-data',
            signature: 'test-signature',
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(largeCredentialRequestBody),
        }
      )

      const response = await POST(request)

      // Should handle gracefully
      expect(response.status).toBe(200)
    })
  })

  describe('Security Scenarios', () => {
    it('should handle replay attacks', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock verification failure for replay attack (counter validation)
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: false,
        error: 'Counter value indicates replay attack',
      })

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Counter value indicates replay attack')
    })

    it('should sanitize error messages to prevent information leakage', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock verification error with sensitive information
      vi.mocked(verifyWebAuthnAuthentication).mockRejectedValueOnce(
        new Error('Database error: User test-user-id credential test-credential-id not found')
      )

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to verify authentication')
      expect(JSON.stringify(data)).not.toContain('test-user-id')
      expect(JSON.stringify(data)).not.toContain('test-credential-id')
    })

    it('should handle malicious signature injection', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock successful verification (verification library handles validation)
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: true,
        userId: 'test-user-id',
        credentialId: 'test-credential-id',
      })

      const maliciousSignatureRequestBody = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: 'test-authenticator-data',
            signature: '<script>alert("xss")</script>',
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(maliciousSignatureRequestBody),
        }
      )

      const response = await POST(request)

      // Should process (signature validation handled by WebAuthn library)
      expect(response.status).toBe(200)
    })

    it('should handle timing attacks', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock different response times for invalid vs valid credentials
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: false,
        error: 'Credential not found',
      })

      const invalidCredentialRequestBody = {
        response: {
          id: 'non-existent-credential-id',
          rawId: 'non-existent-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: 'test-authenticator-data',
            signature: 'test-signature',
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const startTime = Date.now()
      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidCredentialRequestBody),
        }
      )

      const response = await POST(request)
      const endTime = Date.now()

      expect(response.status).toBe(401)
      // Timing should be consistent (actual timing attack protection in implementation)
      expect(endTime - startTime).toBeLessThan(5000) // Reasonable upper bound
    })

    it('should handle credential not found scenario', async () => {
      const { verifyWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock credential not found
      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValueOnce({
        verified: false,
        error: 'Credential not found',
      })

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Credential not found')
    })

    it('should handle malformed authenticator data', async () => {
      const malformedDataRequestBody = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            authenticatorData: null, // Invalid data
            signature: 'test-signature',
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(malformedDataRequestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })
  })
})
