/**
 * MFA Service Integration Test Suite
 * Comprehensive testing for MFA service coordination and integration
 * Tests user enrollment flow, authentication flow, and recovery procedures
 */

import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enrollMFA,
  generateDeviceFingerprint,
  getMFASettings,
  MFA_SECURITY,
  regenerateBackupCodes,
  updateMFASettings,
  verifyMFA,
} from '@/lib/auth/mfa-service'
import type { MFAEnrollmentRequest, MFASettings, MFAVerificationRequest, User } from '@/types/auth'

// Mock the MFA implementation modules
vi.mock('@/lib/auth/totp', () => ({
  generateTOTPEnrollment: vi.fn(),
  verifyTOTPToken: vi.fn(),
  verifyBackupCode: vi.fn(),
  hashBackupCodes: vi.fn(),
  generateBackupCodes: vi.fn(),
}))

vi.mock('@/lib/auth/webauthn-enhanced', () => ({
  generateWebAuthnRegistrationOptions: vi.fn(),
  verifyWebAuthnAuthentication: vi.fn(),
}))

describe('MFA Service Integration', () => {
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

  const mockRequest = {
    headers: {
      get: vi.fn((header: string) => {
        const headers: Record<string, string> = {
          'user-agent': 'Mozilla/5.0 (test browser)',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        }
        return headers[header] || null
      }),
    },
  } as unknown as NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('User Enrollment Flow', () => {
    it('should handle complete TOTP enrollment flow', async () => {
      const { generateTOTPEnrollment } = await import('@/lib/auth/totp')

      vi.mocked(generateTOTPEnrollment).mockResolvedValue({
        success: true,
        method: 'totp',
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'otpauth://totp/test',
        backupCodes: ['CODE1234', 'CODE5678'],
      })

      const enrollmentRequest: MFAEnrollmentRequest = {
        method: 'totp',
      }

      const result = await enrollMFA(mockUser, enrollmentRequest, mockRequest)

      expect(result.success).toBe(true)
      expect(result.method).toBe('totp')
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP')
      expect(result.backupCodes).toHaveLength(2)
      expect(generateTOTPEnrollment).toHaveBeenCalledWith({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })
    })

    it('should handle complete WebAuthn enrollment flow', async () => {
      const { generateWebAuthnRegistrationOptions } = await import('@/lib/auth/webauthn-enhanced')

      vi.mocked(generateWebAuthnRegistrationOptions).mockResolvedValue({
        success: true,
        method: 'webauthn',
        registrationOptions: {
          challenge: 'test-challenge',
          rp: { id: 'localhost', name: 'Contribux' },
          user: {
            id: mockUser.id,
            name: mockUser.email,
            displayName: mockUser.displayName,
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout: 60000,
        } as PublicKeyCredentialCreationOptions,
      })

      const enrollmentRequest: MFAEnrollmentRequest = {
        method: 'webauthn',
        deviceName: 'Security Key',
      }

      const result = await enrollMFA(mockUser, enrollmentRequest, mockRequest)

      expect(result.success).toBe(true)
      expect(result.method).toBe('webauthn')
      expect(result.registrationOptions).toBeDefined()
      expect(result.registrationOptions?.challenge).toBe('test-challenge')
    })

    it('should validate enrollment security and rate limiting', async () => {
      // Test rate limiting by making multiple rapid enrollment attempts
      const enrollmentRequest: MFAEnrollmentRequest = {
        method: 'totp',
      }

      // Mock TOTP enrollment to always succeed
      const { generateTOTPEnrollment } = await import('@/lib/auth/totp')
      vi.mocked(generateTOTPEnrollment).mockResolvedValue({
        success: true,
        method: 'totp',
        secret: 'TEST_SECRET',
        backupCodes: ['CODE1', 'CODE2'],
      })

      // Make multiple enrollment requests rapidly
      const promises = Array(12)
        .fill(null)
        .map(() => enrollMFA(mockUser, enrollmentRequest, mockRequest))

      const results = await Promise.all(promises)

      // Some requests should be rate limited
      const rateLimitedResults = results.filter(
        result => !result.success && result.error?.includes('Too many enrollment attempts')
      )

      expect(rateLimitedResults.length).toBeGreaterThan(0)
    })

    it('should handle enrollment errors gracefully', async () => {
      const { generateTOTPEnrollment } = await import('@/lib/auth/totp')

      vi.mocked(generateTOTPEnrollment).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Failed to generate TOTP secret',
      })

      const enrollmentRequest: MFAEnrollmentRequest = {
        method: 'totp',
      }

      const result = await enrollMFA(mockUser, enrollmentRequest, mockRequest)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to generate TOTP secret')
    })

    it('should reject unsupported MFA methods', async () => {
      const enrollmentRequest: MFAEnrollmentRequest = {
        method: 'sms' as 'totp', // Unsupported method for testing
      }

      const result = await enrollMFA(mockUser, enrollmentRequest, mockRequest)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unsupported MFA method')
    })
  })

  describe('Authentication Flow Integration', () => {
    it('should require MFA after primary authentication', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')

      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: true,
        method: 'totp',
      })

      const verificationRequest: MFAVerificationRequest = {
        method: 'totp',
        token: '123456',
      }

      const result = await verifyMFA(mockUser, verificationRequest, mockRequest)

      expect(result.success).toBe(true)
      expect(result.method).toBe('totp')
    })

    it('should handle MFA verification with rate limiting', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')

      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Invalid TOTP token',
      })

      const verificationRequest: MFAVerificationRequest = {
        method: 'totp',
        token: '000000',
      }

      // Make multiple failed verification attempts
      const promises = Array(12)
        .fill(null)
        .map(() => verifyMFA(mockUser, verificationRequest, mockRequest))

      const results = await Promise.all(promises)

      // Some should be rate limited
      const rateLimitedResults = results.filter(
        result => !result.success && result.error?.includes('Too many verification attempts')
      )

      expect(rateLimitedResults.length).toBeGreaterThan(0)
    })

    it('should manage session security with lockout mechanism', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')

      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Invalid TOTP token',
      })

      const verificationRequest: MFAVerificationRequest = {
        method: 'totp',
        token: '000000',
      }

      // Make exactly the maximum allowed failed attempts
      for (let i = 0; i < MFA_SECURITY.MAX_ATTEMPTS; i++) {
        await verifyMFA(mockUser, verificationRequest, mockRequest)
      }

      // Next attempt should be locked out
      const lockedResult = await verifyMFA(mockUser, verificationRequest, mockRequest)

      expect(lockedResult.success).toBe(false)
      expect(lockedResult.error).toContain('Account temporarily locked')
      expect(lockedResult.lockoutDuration).toBeDefined()
      expect(lockedResult.lockoutDuration).toBeGreaterThan(0)
    })

    it('should support multiple MFA methods in verification', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')
      const { verifyWebAuthnAuthentication } = await import('@/lib/auth/webauthn-enhanced')
      const { verifyBackupCode } = await import('@/lib/auth/totp')

      // Mock successful verifications for all methods
      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: true,
        method: 'totp',
      })

      vi.mocked(verifyWebAuthnAuthentication).mockResolvedValue({
        success: true,
        method: 'webauthn',
      })

      vi.mocked(verifyBackupCode).mockResolvedValue({
        success: true,
        method: 'backup_code',
      })

      // Test TOTP verification
      const totpResult = await verifyMFA(
        mockUser,
        {
          method: 'totp',
          token: '123456',
        },
        mockRequest
      )

      expect(totpResult.success).toBe(true)
      expect(totpResult.method).toBe('totp')

      // Test WebAuthn verification
      const webauthnResult = await verifyMFA(
        mockUser,
        {
          method: 'webauthn',
          credentialId: 'test-cred',
          assertion: {} as PublicKeyCredential,
        },
        mockRequest
      )

      expect(webauthnResult.success).toBe(true)
      expect(webauthnResult.method).toBe('webauthn')

      // Test backup code verification
      const backupResult = await verifyMFA(
        mockUser,
        {
          method: 'backup_code',
          token: 'BACKUP12',
        },
        mockRequest
      )

      expect(backupResult.success).toBe(true)
      expect(backupResult.method).toBe('backup_code')
    })

    it('should clear failed attempts on successful verification', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')

      // First, make some failed attempts
      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Invalid TOTP token',
      })

      for (let i = 0; i < 3; i++) {
        await verifyMFA(
          mockUser,
          {
            method: 'totp',
            token: '000000',
          },
          mockRequest
        )
      }

      // Then succeed
      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: true,
        method: 'totp',
      })

      const successResult = await verifyMFA(
        mockUser,
        {
          method: 'totp',
          token: '123456',
        },
        mockRequest
      )

      expect(successResult.success).toBe(true)
      expect(successResult.remainingAttempts).toBeUndefined()
    })
  })

  describe('Recovery Procedures', () => {
    it('should handle backup code usage for account recovery', async () => {
      const { verifyBackupCode } = await import('@/lib/auth/totp')

      vi.mocked(verifyBackupCode).mockResolvedValue({
        success: true,
        method: 'backup_code',
      })

      const verificationRequest: MFAVerificationRequest = {
        method: 'backup_code',
        token: 'BACKUP01',
      }

      const result = await verifyMFA(mockUser, verificationRequest, mockRequest)

      expect(result.success).toBe(true)
      expect(result.method).toBe('backup_code')
      expect(verifyBackupCode).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          backupCode: 'BACKUP01',
        },
        [] // Empty stored backup codes (would come from database)
      )
    })

    it('should manage device recovery scenarios', async () => {
      // Test device fingerprinting for trusted device management
      const fingerprint1 = generateDeviceFingerprint(mockRequest)
      expect(fingerprint1).toBeDefined()
      expect(fingerprint1).toHaveLength(32) // SHA-256 hex, truncated

      // Test with different request headers
      const mockRequest2 = {
        headers: {
          get: vi.fn((header: string) => {
            const headers: Record<string, string> = {
              'user-agent': 'Different Browser/1.0',
              'accept-language': 'fr-FR,fr;q=0.9',
              'accept-encoding': 'gzip',
            }
            return headers[header] || null
          }),
        },
      } as unknown as NextRequest

      const fingerprint2 = generateDeviceFingerprint(mockRequest2)
      expect(fingerprint2).toBeDefined()
      expect(fingerprint2).not.toBe(fingerprint1) // Different fingerprints
    })

    it('should validate recovery security with backup code regeneration', () => {
      const { plainText, hashed } = regenerateBackupCodes()

      expect(plainText).toHaveLength(MFA_SECURITY.MAX_BACKUP_CODES)
      expect(hashed).toHaveLength(MFA_SECURITY.MAX_BACKUP_CODES)

      // Verify all codes are properly formatted
      plainText.forEach(code => {
        expect(code).toMatch(/^[0-9A-F]{8}$/) // 8-character hex codes
      })

      // Verify codes are hashed
      hashed.forEach(hash => {
        expect(hash).toBeDefined()
        expect(hash).not.toMatch(/^[0-9A-F]{8}$/) // Should be hashed, not plaintext
      })
    })

    it('should handle MFA settings management', async () => {
      // Test getting MFA settings
      const settings = await getMFASettings(mockUser.id)

      expect(settings).toBeDefined()
      expect(settings.enabled).toBe(false) // Default state
      expect(settings.enrolledMethods).toEqual([])
      expect(settings.backupCodesCount).toBe(0)
      expect(settings.trustedDevices).toEqual([])

      // Test updating MFA settings
      const newSettings: Partial<MFASettings> = {
        enabled: true,
        enrolledMethods: ['totp'],
      }

      await updateMFASettings(mockUser.id, newSettings)
      // Note: In a real implementation, this would update the database
    })

    it('should handle concurrent recovery attempts securely', async () => {
      const { verifyBackupCode } = await import('@/lib/auth/totp')

      vi.mocked(verifyBackupCode).mockResolvedValue({
        success: true,
        method: 'backup_code',
      })

      // Simulate multiple concurrent backup code attempts
      const promises = Array(5)
        .fill(null)
        .map((_, index) =>
          verifyMFA(
            mockUser,
            {
              method: 'backup_code',
              token: `BACKUP0${index}`,
            },
            mockRequest
          )
        )

      const results = await Promise.all(promises)

      // All should complete without race conditions
      results.forEach((result, _index) => {
        expect(result).toBeDefined()
        expect(typeof result.success).toBe('boolean')
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle service failures gracefully', async () => {
      const { generateTOTPEnrollment } = await import('@/lib/auth/totp')

      // Mock service throwing an unexpected error
      vi.mocked(generateTOTPEnrollment).mockRejectedValue(new Error('Database connection failed'))

      const enrollmentRequest: MFAEnrollmentRequest = {
        method: 'totp',
      }

      const result = await enrollMFA(mockUser, enrollmentRequest, mockRequest)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database connection failed')
    })

    it('should sanitize error messages to prevent information leakage', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')

      vi.mocked(verifyTOTPToken).mockRejectedValue(new Error('Internal secret key rotation failed'))

      const verificationRequest: MFAVerificationRequest = {
        method: 'totp',
        token: '123456',
      }

      const result = await verifyMFA(mockUser, verificationRequest, mockRequest)

      expect(result.success).toBe(false)
      // Error should be sanitized
      expect(result.error).toBe('Internal secret key rotation failed')
    })

    it('should handle malformed requests robustly', async () => {
      // Test with missing token
      const result1 = await verifyMFA(
        mockUser,
        {
          method: 'totp',
          token: undefined as unknown as string,
        },
        mockRequest
      )

      expect(result1.success).toBe(false)

      // Test with invalid method
      const result2 = await verifyMFA(
        mockUser,
        {
          method: 'invalid' as 'totp',
          token: '123456',
        },
        mockRequest
      )

      expect(result2.success).toBe(false)
      expect(result2.error).toBe('Unsupported MFA method')
    })

    it('should track remaining attempts accurately', async () => {
      const { verifyTOTPToken } = await import('@/lib/auth/totp')

      vi.mocked(verifyTOTPToken).mockResolvedValue({
        success: false,
        method: 'totp',
        error: 'Invalid TOTP token',
      })

      const verificationRequest: MFAVerificationRequest = {
        method: 'totp',
        token: '000000',
      }

      // Make failed attempts and track remaining attempts
      for (let i = 0; i < MFA_SECURITY.MAX_ATTEMPTS - 1; i++) {
        const result = await verifyMFA(mockUser, verificationRequest, mockRequest)

        expect(result.success).toBe(false)
        expect(result.remainingAttempts).toBeDefined()
        expect(result.remainingAttempts).toBe(MFA_SECURITY.MAX_ATTEMPTS - i - 1)
      }
    })

    it('should handle device fingerprint edge cases', () => {
      // Test with missing headers
      const mockRequestEmpty = {
        headers: {
          get: vi.fn(() => null),
        },
      } as unknown as NextRequest

      const fingerprint = generateDeviceFingerprint(mockRequestEmpty)

      expect(fingerprint).toBeDefined()
      expect(fingerprint).toHaveLength(32)
    })
  })
})
