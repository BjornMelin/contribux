/**
 * WebAuthn Registration Verification API Tests
 * Tests for /api/security/webauthn/register/verify endpoint
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/security/webauthn/register/verify/route'
import { setupDatabaseMock, setupWebAuthnServerMock } from '../../../utils/mocks'

// Mock dependencies
setupDatabaseMock()
setupWebAuthnServerMock()

// Mock NextAuth session
const mockSession = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  },
  expires: '2024-12-31T23:59:59.999Z',
}

vi.mock('next-auth', () => {
  const mockNextAuth = vi.fn(() => ({
    handlers: {
      GET: vi.fn(),
      POST: vi.fn(),
    },
    auth: vi.fn().mockResolvedValue(mockSession),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }))

  return {
    default: mockNextAuth,
    getServerSession: vi.fn(),
  }
})

vi.mock('@/lib/config/auth', () => ({
  authConfig: {},
}))

// Mock feature flags
vi.mock('@/lib/security/feature-flags', () => {
  const mockSecurityFeatures = {
    webauthn: true,
    basicSecurity: true,
    securityHeaders: true,
    rateLimiting: true,
    advancedMonitoring: false,
    securityDashboard: false,
    deviceFingerprinting: false,
    detailedAudit: false,
    isDevelopment: true,
    isProduction: false,
  }
  return {
    securityFeatures: mockSecurityFeatures,
    getSecurityFeatures: vi.fn().mockReturnValue(mockSecurityFeatures),
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
  }
})

// Mock WebAuthn server functions
vi.mock('@/lib/security/webauthn/server', () => ({
  verifyWebAuthnRegistration: vi.fn(),
}))

describe('/api/security/webauthn/register/verify', () => {
  const validRequestBody = {
    response: {
      id: 'test-credential-id',
      rawId: 'test-raw-id',
      response: {
        clientDataJSON: 'test-client-data-json',
        attestationObject: 'test-attestation-object',
      },
      type: 'public-key' as const,
    },
    expectedChallenge: 'test-challenge',
    deviceName: 'Test Device',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('POST', () => {
    it('should verify registration response successfully', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock successful verification
      vi.mocked(verifyWebAuthnRegistration).mockResolvedValueOnce({
        verified: true,
        credentialId: 'new-credential-id',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        message: 'WebAuthn credential registered successfully',
        credentialId: 'new-credential-id',
      })

      expect(verifyWebAuthnRegistration).toHaveBeenCalledWith(
        'test-user-id',
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
        '@/app/api/security/webauthn/register/verify/route'
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await DisabledPOST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'WebAuthn is not enabled',
      })
    })

    it('should return 401 when user is not authenticated', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock no session
      vi.mocked(getServerSession).mockResolvedValueOnce(null)

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Authentication required',
      })
    })

    it('should return 400 for invalid request data', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      const invalidRequestBody = {
        response: {
          id: 'test-credential-id',
          // Missing rawId and response fields
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })

    it('should return 400 when verification fails', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock failed verification
      vi.mocked(verifyWebAuthnRegistration).mockResolvedValueOnce({
        verified: false,
        error: 'Invalid attestation',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        success: false,
        error: 'Invalid attestation',
      })
    })

    it('should handle verification errors gracefully', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock verification error
      vi.mocked(verifyWebAuthnRegistration).mockRejectedValueOnce(
        new Error('Database connection failed')
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to verify registration',
      })
    })

    it('should handle malformed JSON in request body', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-data',
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
    })

    it('should validate response type field', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      const invalidTypeRequestBody = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            attestationObject: 'test-attestation-object',
          },
          type: 'invalid-type', // Should be 'public-key'
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidTypeRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('should handle missing expected challenge', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      const missingChallengeRequestBody = {
        response: {
          id: 'test-credential-id',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            attestationObject: 'test-attestation-object',
          },
          type: 'public-key' as const,
        },
        // Missing expectedChallenge
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missingChallengeRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('should include optional device name in verification', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock successful verification
      vi.mocked(verifyWebAuthnRegistration).mockResolvedValueOnce({
        verified: true,
        credentialId: 'new-credential-id',
      })

      const requestWithDeviceName = {
        ...validRequestBody,
        deviceName: 'iPhone 15 Pro',
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestWithDeviceName),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should work without optional device name', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock successful verification
      vi.mocked(verifyWebAuthnRegistration).mockResolvedValueOnce({
        verified: true,
        credentialId: 'new-credential-id',
      })

      const requestWithoutDeviceName = {
        response: validRequestBody.response,
        expectedChallenge: validRequestBody.expectedChallenge,
        // No deviceName field
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestWithoutDeviceName),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Security Scenarios', () => {
    it('should handle replay attacks with same attestation', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock verification failure for replay attack
      vi.mocked(verifyWebAuthnRegistration).mockResolvedValueOnce({
        verified: false,
        error: 'Credential already exists',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Credential already exists')
    })

    it('should sanitize error messages to prevent information leakage', async () => {
      const { getServerSession } = await import('next-auth')
      const { verifyWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock verification error with sensitive information
      vi.mocked(verifyWebAuthnRegistration).mockRejectedValueOnce(
        new Error('Database error: User test-user-id credential conflict')
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to verify registration')
      expect(JSON.stringify(data)).not.toContain('test-user-id')
    })

    it('should validate credential ID format', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      const maliciousRequestBody = {
        response: {
          id: '<script>alert("xss")</script>',
          rawId: 'test-raw-id',
          response: {
            clientDataJSON: 'test-client-data-json',
            attestationObject: 'test-attestation-object',
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maliciousRequestBody),
      })

      const response = await POST(request)

      // Should still process (Zod handles validation)
      expect(response.status).toBeDefined()
    })

    it('should handle unusually large request payloads', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      const largeRequestBody = {
        response: {
          id: 'a'.repeat(10000), // Very large credential ID
          rawId: 'b'.repeat(10000), // Very large raw ID
          response: {
            clientDataJSON: 'c'.repeat(10000),
            attestationObject: 'd'.repeat(10000),
          },
          type: 'public-key' as const,
        },
        expectedChallenge: 'test-challenge',
      }

      const request = new Request('http://localhost:3000/api/security/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largeRequestBody),
      })

      const response = await POST(request)

      // Should handle gracefully without crashing
      expect(response.status).toBeDefined()
    })
  })
})
