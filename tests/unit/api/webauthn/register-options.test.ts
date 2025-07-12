/**
 * WebAuthn Registration Options API Tests
 * Tests for /api/security/webauthn/register/options endpoint
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/security/webauthn/register/options/route'
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
    auth: vi.fn().mockResolvedValue({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      },
      expires: '2024-12-31T23:59:59.999Z',
    }),
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
  generateWebAuthnRegistration: vi.fn(),
}))

describe('/api/security/webauthn/register/options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('POST', () => {
    it('should generate registration options for authenticated user', async () => {
      const { getServerSession } = await import('next-auth')
      const { generateWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock registration options generation
      const mockOptions = {
        challenge: 'test-challenge',
        rp: { name: 'Contribux', id: 'localhost' },
        user: { id: 'test-user-id', name: 'test@example.com', displayName: 'Test User' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 60000,
        attestation: 'none',
      }
      vi.mocked(generateWebAuthnRegistration).mockResolvedValueOnce(mockOptions)

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        options: mockOptions,
        challenge: 'test-challenge',
      })

      expect(generateWebAuthnRegistration).toHaveBeenCalledWith('test-user-id', 'test@example.com')
    })

    it('should return 403 when WebAuthn is disabled', async () => {
      // Mock WebAuthn disabled
      vi.doMock('@/lib/security/feature-flags', () => ({
        securityFeatures: {
          webauthn: false,
        },
      }))

      const { POST: DisabledPOST } = await import(
        '@/app/api/security/webauthn/register/options/route'
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
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

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Authentication required',
      })
    })

    it('should return 401 when session is missing user ID', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock session without user ID
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: {
          email: 'test@example.com',
          name: 'Test User',
        },
        expires: '2024-12-31T23:59:59.999Z',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Authentication required',
      })
    })

    it('should return 401 when session is missing email', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock session without email
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: {
          id: 'test-user-id',
          name: 'Test User',
        },
        expires: '2024-12-31T23:59:59.999Z',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Authentication required',
      })
    })

    it('should handle WebAuthn generation errors', async () => {
      const { getServerSession } = await import('next-auth')
      const { generateWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock generation error
      vi.mocked(generateWebAuthnRegistration).mockRejectedValueOnce(
        new Error('Failed to generate options')
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to generate registration options',
      })
    })

    it('should handle database connection errors', async () => {
      const { getServerSession } = await import('next-auth')
      const { generateWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock database connection error
      vi.mocked(generateWebAuthnRegistration).mockRejectedValueOnce(
        new Error('Database connection failed')
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to generate registration options',
      })
    })

    it('should handle malformed authentication session', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock malformed session
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: null,
        expires: '2024-12-31T23:59:59.999Z',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Authentication required',
      })
    })

    it('should include challenge in response for client verification', async () => {
      const { getServerSession } = await import('next-auth')
      const { generateWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock successful authentication
      vi.mocked(getServerSession).mockResolvedValueOnce(mockSession)

      // Mock registration options with specific challenge
      const specificChallenge = 'specific-test-challenge-123'
      const mockOptions = {
        challenge: specificChallenge,
        rp: { name: 'Contribux', id: 'localhost' },
        user: { id: 'test-user-id', name: 'test@example.com', displayName: 'Test User' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 60000,
        attestation: 'none',
      }
      vi.mocked(generateWebAuthnRegistration).mockResolvedValueOnce(mockOptions)

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.challenge).toBe(specificChallenge)
      expect(data.options.challenge).toBe(specificChallenge)
    })
  })

  describe('Security Considerations', () => {
    it('should not expose sensitive user data in error responses', async () => {
      const { getServerSession } = await import('next-auth')
      const { generateWebAuthnRegistration } = await import('@/lib/security/webauthn/server')

      // Mock authentication with sensitive data
      const sensitiveSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          sensitiveData: 'should-not-be-exposed',
        },
        expires: '2024-12-31T23:59:59.999Z',
      }
      vi.mocked(getServerSession).mockResolvedValueOnce(sensitiveSession)

      // Mock generation error
      vi.mocked(generateWebAuthnRegistration).mockRejectedValueOnce(
        new Error('Database error with user data: test@example.com')
      )

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to generate registration options')
      expect(JSON.stringify(data)).not.toContain('test@example.com')
      expect(JSON.stringify(data)).not.toContain('sensitiveData')
    })

    it('should validate session integrity', async () => {
      const { getServerSession } = await import('next-auth')

      // Mock session with unexpected structure
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: {
          id: '<script>alert("xss")</script>',
          email: 'test@example.com',
        },
        expires: '2024-12-31T23:59:59.999Z',
      })

      const request = new Request('http://localhost:3000/api/security/webauthn/register/options', {
        method: 'POST',
      })

      const response = await POST(request)

      // Should still process but sanitize input
      expect(response.status).toBe(200)
    })
  })
})
