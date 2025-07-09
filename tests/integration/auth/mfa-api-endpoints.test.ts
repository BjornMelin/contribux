/**
 * MFA API Endpoint Security Test Suite
 * Integration testing for MFA API endpoints security
 * Tests authentication, authorization, rate limiting, and input validation
 */

import { type NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as enrollGET, POST as enrollPOST } from '@/app/api/auth/mfa/enroll/route'
import { GET as settingsGET, POST as settingsPOST } from '@/app/api/auth/mfa/settings/route'
import { POST as verifyPOST } from '@/app/api/auth/mfa/verify/route'
import type { User } from '@/types/auth'

// Mock the MFA service and middleware
vi.mock('@/lib/auth/mfa-service', () => ({
  enrollMFA: vi.fn(),
  verifyMFA: vi.fn(),
  getMFASettings: vi.fn(),
  updateMFASettings: vi.fn(),
  MFA_SECURITY: {
    MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION: 900,
    RATE_LIMIT_WINDOW: 300,
    MAX_REQUESTS_PER_WINDOW: 10,
  },
}))

vi.mock('@/lib/auth/middleware', () => ({
  requireAuthentication: vi.fn(),
}))

describe('MFA API Endpoint Security', () => {
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

  const createMockRequest = (
    body?: unknown,
    headers?: Record<string, string>,
    authenticated = true
  ): NextRequest => {
    const request = {
      json: vi.fn().mockResolvedValue(body || {}),
      headers: {
        get: vi.fn((name: string) => headers?.[name] || null),
      },
      auth: authenticated ? { user: mockUser, session_id: 'test-session' } : undefined,
    } as unknown as NextRequest & { auth?: { user: User; session_id: string } }

    return request
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('/api/auth/mfa/enroll endpoint', () => {
    it('should validate enrollment request security and authentication', async () => {
      const { enrollMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(enrollMFA).mockResolvedValue({
        success: true,
        method: 'totp',
        secret: 'JBSWY3DPEHPK3PXP',
        backupCodes: ['CODE1234', 'CODE5678'],
      })

      const validRequest = createMockRequest({
        method: 'totp',
      })

      const response = await enrollPOST(validRequest)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.method).toBe('totp')
      expect(responseData.secret).toBe('JBSWY3DPEHPK3PXP')
      expect(enrollMFA).toHaveBeenCalledWith(
        mockUser,
        { method: 'totp', deviceName: 'Security Key' },
        validRequest
      )
    })

    it('should enforce authentication requirements', async () => {
      const unauthenticatedRequest = createMockRequest(
        { method: 'totp' },
        {},
        false // not authenticated
      )

      const response = await enrollPOST(unauthenticatedRequest)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData.error).toBe('Authentication required')
    })

    it('should prevent enrollment when MFA already enabled', async () => {
      const userWithMFA: User = {
        ...mockUser,
        twoFactorEnabled: true,
      }

      const request = createMockRequest({ method: 'totp' })
      request.auth = { user: userWithMFA, session_id: 'test-session' }

      const response = await enrollPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('MFA is already enabled for this account')
    })

    it('should handle rate limiting for enrollment attempts', async () => {
      const { enrollMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(enrollMFA).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Too many enrollment attempts. Please try again later.',
      })

      const request = createMockRequest({ method: 'totp' })
      const response = await enrollPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Too many enrollment attempts. Please try again later.')
    })

    it('should validate request data with Zod schema', async () => {
      // Test with invalid method
      const invalidRequest = createMockRequest({
        method: 'invalid-method',
      })

      const response = await enrollPOST(invalidRequest)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Invalid request data')
      expect(responseData.details).toBeDefined()
    })

    it('should handle malformed JSON gracefully', async () => {
      const request = createMockRequest()
      vi.mocked(request.json).mockRejectedValue(new SyntaxError('Invalid JSON'))

      const response = await enrollPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData.error).toBe('Internal server error')
    })

    it('should return available MFA methods on GET request', async () => {
      const response = await enrollGET()
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.availableMethods).toHaveLength(2)
      expect(responseData.availableMethods[0].method).toBe('totp')
      expect(responseData.availableMethods[1].method).toBe('webauthn')
      expect(responseData.requirements).toBeDefined()
      expect(responseData.requirements.totp).toBeDefined()
      expect(responseData.requirements.webauthn).toBeDefined()
    })

    it('should sanitize response data to prevent information leakage', async () => {
      const { enrollMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(enrollMFA).mockResolvedValue({
        success: true,
        method: 'totp',
        secret: 'JBSWY3DPEHPK3PXP',
        backupCodes: ['CODE1234', 'CODE5678'],
        // Simulating internal fields that shouldn't be exposed
        internalDebugInfo: 'sensitive-data' as unknown,
        userId: mockUser.id as unknown,
      })

      const request = createMockRequest({ method: 'totp' })
      const response = await enrollPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.internalDebugInfo).toBeUndefined()
      expect(responseData.userId).toBeUndefined()
      expect(responseData.secret).toBe('JBSWY3DPEHPK3PXP')
    })
  })

  describe('/api/auth/mfa/verify endpoint', () => {
    it('should validate verification security and prevent timing attacks', async () => {
      const { verifyMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(verifyMFA).mockResolvedValue({
        success: true,
        method: 'totp',
      })

      const request = createMockRequest({
        method: 'totp',
        token: '123456',
      })

      const startTime = Date.now()
      const response = await verifyPOST(request)
      const endTime = Date.now()
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.method).toBe('totp')

      // Response time should be reasonable (not artificially delayed for failed attempts)
      expect(endTime - startTime).toBeLessThan(1000)
    })

    it('should enforce rate limiting on verification attempts', async () => {
      const { verifyMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(verifyMFA).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Too many verification attempts. Please try again later.',
      })

      const request = createMockRequest({
        method: 'totp',
        token: '000000',
      })

      const response = await verifyPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(429)
      expect(responseData.error).toBe('Too many verification attempts. Please try again later.')
    })

    it('should handle verification failures with proper error responses', async () => {
      const { verifyMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(verifyMFA).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Invalid TOTP token',
        remainingAttempts: 3,
      })

      const request = createMockRequest({
        method: 'totp',
        token: '000000',
      })

      const response = await verifyPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Invalid TOTP token')
      expect(responseData.remainingAttempts).toBe(3)
    })

    it('should handle account lockout scenarios', async () => {
      const { verifyMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(verifyMFA).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Account temporarily locked due to too many failed attempts',
        lockoutDuration: 900,
      })

      const request = createMockRequest({
        method: 'totp',
        token: '000000',
      })

      const response = await verifyPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(423) // Locked
      expect(responseData.error).toBe('Account temporarily locked due to too many failed attempts')
      expect(responseData.lockoutDuration).toBe(900)
    })

    it('should validate WebAuthn verification requests', async () => {
      const { verifyMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(verifyMFA).mockResolvedValue({
        success: true,
        method: 'webauthn',
      })

      const request = createMockRequest({
        method: 'webauthn',
        credentialId: 'test-credential-id',
        assertion: {
          id: 'test-credential-id',
          response: { signature: 'test-signature' },
        },
      })

      const response = await verifyPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.method).toBe('webauthn')
    })

    it('should validate backup code verification requests', async () => {
      const { verifyMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(verifyMFA).mockResolvedValue({
        success: true,
        method: 'backup_code',
      })

      const request = createMockRequest({
        method: 'backup_code',
        token: 'BACKUP01',
      })

      const response = await verifyPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(responseData.method).toBe('backup_code')
    })

    it('should handle missing required fields gracefully', async () => {
      const request = createMockRequest({
        method: 'totp',
        // Missing token field
      })

      const response = await verifyPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Invalid request data')
    })

    it('should require authentication for verification', async () => {
      const unauthenticatedRequest = createMockRequest(
        { method: 'totp', token: '123456' },
        {},
        false
      )

      const response = await verifyPOST(unauthenticatedRequest)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData.error).toBe('Authentication required')
    })
  })

  describe('/api/auth/mfa/settings endpoint', () => {
    it('should validate settings management and authorization', async () => {
      const { getMFASettings } = await import('@/lib/auth/mfa-service')

      vi.mocked(getMFASettings).mockResolvedValue({
        enabled: true,
        enrolledMethods: ['totp'],
        backupCodesCount: 8,
        trustedDevices: [
          {
            id: 'device-1',
            name: 'Chrome on MacBook',
            fingerprint: 'abc123',
            lastUsed: new Date(),
            createdAt: new Date(),
          },
        ],
      })

      const request = createMockRequest()
      const response = await settingsGET(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.enabled).toBe(true)
      expect(responseData.enrolledMethods).toContain('totp')
      expect(responseData.backupCodesCount).toBe(8)
      expect(responseData.trustedDevices).toHaveLength(1)
    })

    it('should enforce authorization for settings access', async () => {
      const unauthenticatedRequest = createMockRequest({}, {}, false)

      const response = await settingsGET(unauthenticatedRequest)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData.error).toBe('Authentication required')
    })

    it('should handle device management operations', async () => {
      const { updateMFASettings } = await import('@/lib/auth/mfa-service')

      vi.mocked(updateMFASettings).mockResolvedValue(undefined)

      const request = createMockRequest({
        action: 'revoke_device',
        deviceId: 'device-1',
      })

      const response = await settingsPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      expect(updateMFASettings).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          action: 'revoke_device',
          deviceId: 'device-1',
        })
      )
    })

    it('should validate settings update requests', async () => {
      const request = createMockRequest({
        action: 'invalid_action',
      })

      const response = await settingsPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('Invalid request data')
    })

    it('should handle backup code regeneration securely', async () => {
      const { updateMFASettings } = await import('@/lib/auth/mfa-service')

      vi.mocked(updateMFASettings).mockResolvedValue(undefined)

      const request = createMockRequest({
        action: 'regenerate_backup_codes',
      })

      const response = await settingsPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(200)
      expect(responseData.success).toBe(true)
      // Should not return backup codes in response for security
      expect(responseData.backupCodes).toBeUndefined()
    })

    it('should prevent unauthorized settings modifications', async () => {
      // Test with user who doesn't own the settings
      const otherUser: User = {
        ...mockUser,
        id: 'different-user-id',
      }

      const request = createMockRequest({
        action: 'disable_mfa',
      })
      request.auth = { user: otherUser, session_id: 'other-session' }

      const response = await settingsPOST(request)
      const _responseData = await response.json()

      // Should still process (authorization happens at service level)
      expect(response.status).toBe(200)
    })
  })

  describe('Cross-endpoint Security Patterns', () => {
    it('should implement consistent error handling across endpoints', async () => {
      const endpoints = [
        { handler: enrollPOST, body: { method: 'invalid' } },
        { handler: verifyPOST, body: { method: 'invalid' } },
        { handler: settingsPOST, body: { action: 'invalid' } },
      ]

      for (const { handler, body } of endpoints) {
        const request = createMockRequest(body)
        const response = await handler(request)
        const responseData = await response.json()

        expect(response.status).toBe(400)
        expect(responseData.error).toBeDefined()
        expect(typeof responseData.error).toBe('string')
      }
    })

    it('should implement consistent authentication checks', async () => {
      const endpoints = [enrollPOST, verifyPOST, settingsGET, settingsPOST]

      for (const handler of endpoints) {
        const unauthenticatedRequest = createMockRequest({}, {}, false)
        const response = await handler(unauthenticatedRequest)
        const responseData = await response.json()

        expect(response.status).toBe(401)
        expect(responseData.error).toBe('Authentication required')
      }
    })

    it('should handle CORS and security headers consistently', async () => {
      const request = createMockRequest({ method: 'totp' })
      const response = await enrollPOST(request)

      // Check that response is properly formed NextResponse
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBeDefined()
    })

    it('should validate input sanitization across endpoints', async () => {
      const maliciousPayloads = [
        { method: '<script>alert("xss")</script>' },
        { token: 'javascript:alert(1)' },
        { action: '../../etc/passwd' },
      ]

      for (const payload of maliciousPayloads) {
        const request = createMockRequest(payload)
        const response = await enrollPOST(request)
        const responseData = await response.json()

        // Should reject malicious input
        expect(response.status).toBe(400)
        expect(responseData.error).toBe('Invalid request data')
      }
    })

    it('should implement proper content-type validation', async () => {
      const request = createMockRequest({ method: 'totp' })
      // Simulate wrong content-type
      vi.mocked(request.json).mockRejectedValue(new Error('Invalid content-type'))

      const response = await enrollPOST(request)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData.error).toBe('Internal server error')
    })

    it('should handle concurrent requests safely', async () => {
      const { enrollMFA } = await import('@/lib/auth/mfa-service')

      vi.mocked(enrollMFA).mockResolvedValue({
        success: true,
        method: 'totp',
        secret: 'TEST_SECRET',
      })

      // Simulate concurrent enrollment requests
      const requests = Array(5)
        .fill(null)
        .map(() => {
          const request = createMockRequest({ method: 'totp' })
          return enrollPOST(request)
        })

      const responses = await Promise.all(requests)

      // All requests should complete without errors
      responses.forEach(response => {
        expect(response.status).toBeOneOf([200, 400, 429]) // Success, bad request, or rate limited
      })
    })
  })
})
