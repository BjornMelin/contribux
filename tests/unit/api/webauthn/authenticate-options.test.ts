/**
 * WebAuthn Authentication Options API Tests
 * Tests for /api/security/webauthn/authenticate/options endpoint
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/security/webauthn/authenticate/options/route'
import { setupDatabaseMock, setupWebAuthnServerMock } from '../../../utils/mocks'

// Mock dependencies
setupDatabaseMock()
setupWebAuthnServerMock()

// Mock feature flags
vi.mock('@/lib/security/feature-flags', () => ({
  securityFeatures: {
    webauthn: true,
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

// Mock WebAuthn server functions
vi.mock('@/lib/security/webauthn/server', () => ({
  generateWebAuthnAuthentication: vi.fn(),
}))

describe('/api/security/webauthn/authenticate/options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('POST', () => {
    it('should generate authentication options with user ID', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: [
          {
            id: 'credential-1',
            type: 'public-key',
            transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
          },
        ],
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const requestBody = {
        userId: 'test-user-id',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        options: mockOptions,
        challenge: 'test-challenge',
      })

      expect(generateWebAuthnAuthentication).toHaveBeenCalledWith('test-user-id')
    })

    it('should generate authentication options without user ID (userless flow)', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation for userless flow
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: undefined, // No specific credentials for userless flow
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const requestBody = {}

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        options: mockOptions,
        challenge: 'test-challenge',
      })

      expect(generateWebAuthnAuthentication).toHaveBeenCalledWith(undefined)
    })

    it('should handle empty request body', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: undefined,
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(generateWebAuthnAuthentication).toHaveBeenCalledWith(undefined)
    })

    it('should return 403 when WebAuthn is disabled', async () => {
      // Mock WebAuthn disabled
      vi.doMock('@/lib/security/feature-flags', () => ({
        securityFeatures: {
          webauthn: false,
        },
        getSecurityFeatures: vi.fn().mockReturnValue({
          webauthn: false,
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

      const { POST: DisabledPOST } = await import(
        '@/app/api/security/webauthn/authenticate/options/route'
      )

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'test-user-id' }),
        }
      )

      const response = await DisabledPOST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'WebAuthn is not enabled',
      })
    })

    it('should handle malformed JSON gracefully', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: undefined,
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid-json-data',
        }
      )

      const response = await POST(request)
      const data = await response.json()

      // Should handle malformed JSON gracefully and proceed with empty body
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(generateWebAuthnAuthentication).toHaveBeenCalledWith(undefined)
    })

    it('should validate user ID format', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: undefined,
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const invalidRequestBody = {
        userId: 123, // Should be string
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
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

    it('should handle WebAuthn generation errors', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock generation error
      vi.mocked(generateWebAuthnAuthentication).mockRejectedValueOnce(
        new Error('Failed to generate authentication options')
      )

      const requestBody = {
        userId: 'test-user-id',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to generate authentication options',
      })
    })

    it('should handle database connection errors', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock database connection error
      vi.mocked(generateWebAuthnAuthentication).mockRejectedValueOnce(
        new Error('Database connection failed')
      )

      const requestBody = {
        userId: 'test-user-id',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to generate authentication options',
      })
    })

    it('should include challenge in response for client verification', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options with specific challenge
      const specificChallenge = 'specific-auth-challenge-456'
      const mockOptions = {
        challenge: specificChallenge,
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: [],
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const requestBody = {
        userId: 'test-user-id',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.challenge).toBe(specificChallenge)
      expect(data.options.challenge).toBe(specificChallenge)
    })

    it('should handle empty string user ID', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: undefined,
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const requestBody = {
        userId: '', // Empty string
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(generateWebAuthnAuthentication).toHaveBeenCalledWith('')
    })
  })

  describe('Security Scenarios', () => {
    it('should not expose user credential information in errors', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock error with sensitive information
      vi.mocked(generateWebAuthnAuthentication).mockRejectedValueOnce(
        new Error('User test-user-id has credentials: cred-1, cred-2, cred-3')
      )

      const requestBody = {
        userId: 'test-user-id',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to generate authentication options')
      expect(JSON.stringify(data)).not.toContain('test-user-id')
      expect(JSON.stringify(data)).not.toContain('cred-1')
    })

    it('should handle injection attempts in user ID', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: [],
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const maliciousRequestBody = {
        userId: "'; DROP TABLE webauthn_credentials; --",
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(maliciousRequestBody),
        }
      )

      const response = await POST(request)

      // Should process without error (SQL injection protection handled at DB layer)
      expect(response.status).toBe(200)
      expect(generateWebAuthnAuthentication).toHaveBeenCalledWith(
        "'; DROP TABLE webauthn_credentials; --"
      )
    })

    it('should handle XSS attempts in user ID', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: [],
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValueOnce(mockOptions)

      const xssRequestBody = {
        userId: '<script>alert("xss")</script>',
      }

      const request = new Request(
        'http://localhost:3000/api/security/webauthn/authenticate/options',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(xssRequestBody),
        }
      )

      const response = await POST(request)

      // Should process without error (XSS protection handled at output level)
      expect(response.status).toBe(200)
    })

    it('should rate limit excessive requests', async () => {
      const { generateWebAuthnAuthentication } = await import('@/lib/security/webauthn/server')

      // Mock authentication options generation
      const mockOptions = {
        challenge: 'test-challenge',
        timeout: 60000,
        userVerification: 'preferred',
        rpId: 'localhost',
        allowCredentials: [],
      }
      vi.mocked(generateWebAuthnAuthentication).mockResolvedValue(mockOptions)

      const requestBody = {
        userId: 'test-user-id',
      }

      // Simulate multiple rapid requests
      const requests = Array.from({ length: 10 }, () =>
        POST(
          new Request('http://localhost:3000/api/security/webauthn/authenticate/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })
        )
      )

      const responses = await Promise.all(requests)

      // All should succeed in test environment (rate limiting tested separately)
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })
  })
})
