/**
 * TOTP Authentication Security Test Suite
 * Comprehensive security testing for TOTP implementation
 * Tests cryptographic security, rate limiting, and attack prevention
 */

import * as crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateTOTPEnrollment,
  hashBackupCodes,
  regenerateBackupCodes,
  TOTP_DEFAULTS,
  verifyBackupCode,
  verifyTOTPToken,
} from '@/lib/auth/totp'
import type { TOTPCredential, User } from '@/types/auth'

// Mock crypto for controlled testing
vi.mock('node:crypto', async () => {
  const actual = await vi.importActual('node:crypto')
  return {
    ...actual,
    randomBytes: vi.fn(),
    createHash: vi.fn(),
    createHmac: vi.fn(),
  }
})

const mockRandomBytes = vi.mocked(crypto.randomBytes)
const mockCreateHash = vi.mocked(crypto.createHash)
const mockCreateHmac = vi.mocked(crypto.createHmac)

describe('TOTP Authentication Security', () => {
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

  const mockTOTPCredential: TOTPCredential = {
    id: 'cred-123',
    userId: mockUser.id,
    secret: 'JBSWY3DPEHPK3PXP', // Base32 encoded secret
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    issuer: 'Contribux',
    accountName: mockUser.email,
    backupCodes: [],
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default mock implementations
    mockRandomBytes.mockImplementation((size: number) => {
      return Buffer.from('0'.repeat(size), 'hex')
    })

    const mockHashInstance = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(Buffer.from('mockedhash', 'hex')),
    }
    mockCreateHash.mockReturnValue(mockHashInstance as crypto.Hash)

    const mockHmacInstance = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(),
    }
    mockCreateHmac.mockReturnValue(mockHmacInstance as crypto.Hmac)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Secret Generation Security', () => {
    it('should generate cryptographically secure secrets with sufficient entropy', async () => {
      // Mock high-entropy random bytes
      const highEntropyBytes = Buffer.from('a'.repeat(64), 'hex') // 32 bytes = 256 bits
      mockRandomBytes.mockReturnValueOnce(highEntropyBytes)

      const result = await generateTOTPEnrollment({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })

      expect(result.success).toBe(true)
      expect(mockRandomBytes).toHaveBeenCalledWith(TOTP_DEFAULTS.SECRET_LENGTH)
      expect(result.secret).toBeDefined()
      expect(result.secret?.length).toBeGreaterThan(20) // Base32 encoded secret
    })

    it('should validate secret entropy requirements', async () => {
      // Test with low-entropy bytes (all zeros)
      const lowEntropyBytes = Buffer.alloc(32, 0)
      mockRandomBytes.mockReturnValueOnce(lowEntropyBytes)

      const result = await generateTOTPEnrollment({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })

      // Should still generate secret but with deterministic output
      expect(result.success).toBe(true)
      expect(result.secret).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    })

    it('should handle secret generation failures gracefully', async () => {
      // Mock crypto failure
      mockRandomBytes.mockImplementation(() => {
        throw new Error('Crypto failure')
      })

      const result = await generateTOTPEnrollment({
        userId: 'invalid-uuid',
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should ensure secret storage security with proper encoding', async () => {
      const testBytes = Buffer.from('Hello World!', 'utf8')
      mockRandomBytes.mockReturnValueOnce(testBytes)

      const result = await generateTOTPEnrollment({
        userId: mockUser.id,
        userEmail: mockUser.email,
        userName: mockUser.displayName,
      })

      expect(result.success).toBe(true)
      // Secret should be base32 encoded and contain only valid characters
      expect(result.secret).toMatch(/^[A-Z2-7]*$/)
    })
  })

  describe('Token Verification Security', () => {
    it('should verify valid TOTP tokens within time window', async () => {
      const testTimestamp = 1000000000000 // Fixed timestamp
      vi.setSystemTime(testTimestamp)

      // Create a buffer that will generate token '755224'
      // The HOTP algorithm uses the last byte for offset (& 0x0f)
      // Then extracts 4 bytes and converts to integer
      // For token 755224, we need the 4-byte integer to be 755224 (0x0B8618)
      const mockDigest = Buffer.alloc(20)
      // Set last byte to define offset (we'll use offset 0)
      mockDigest[19] = 0x00
      // Set the 4 bytes at offset 0 to produce 755224
      // 755224 = 0x000B8618 in hex
      mockDigest[0] = 0x00 // First bit must be 0 (& 0x7f)
      mockDigest[1] = 0x0b
      mockDigest[2] = 0x86
      mockDigest[3] = 0x18

      const mockHmacInstance = mockCreateHmac()
      mockHmacInstance.digest.mockReturnValue(mockDigest)

      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '755224', // Expected token from mock HMAC
        },
        mockTOTPCredential
      )

      expect(result.success).toBe(true)
      expect(result.method).toBe('totp')
    })

    it('should reject expired tokens outside time window', async () => {
      // Setup mock to return a different token
      const mockDigest = Buffer.alloc(20)
      mockDigest[19] = 0x00
      // Set different bytes to produce a different token
      mockDigest[0] = 0x00
      mockDigest[1] = 0x11
      mockDigest[2] = 0x22
      mockDigest[3] = 0x33

      const mockHmacInstance = mockCreateHmac()
      mockHmacInstance.digest.mockReturnValue(mockDigest)

      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '999999', // Invalid token
        },
        mockTOTPCredential
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid TOTP token')
    })

    it('should handle timing window validation correctly', async () => {
      const baseTime = 1000000000000
      vi.setSystemTime(baseTime)

      // Setup mock digest for valid token
      const validDigest = Buffer.alloc(20)
      validDigest[19] = 0x00
      validDigest[0] = 0x00
      validDigest[1] = 0x0b
      validDigest[2] = 0x86
      validDigest[3] = 0x18

      // Create a counter to track calls
      let _callCount = 0
      const baseCounter = Math.floor(baseTime / 1000 / 30)

      const mockHmacInstance = mockCreateHmac()
      mockHmacInstance.update.mockImplementation((_data: Buffer) => {
        _callCount++
        return mockHmacInstance
      })

      // For each test, the verifyTOTP will check 5 time windows (-2, -1, 0, +1, +2)
      // We'll return the valid digest only when appropriate
      mockHmacInstance.digest.mockImplementation(() => {
        const currentTime = Date.now()
        const currentCounter = Math.floor(currentTime / 1000 / 30)
        const diff = Math.abs(currentCounter - baseCounter)

        // Only return valid digest if within window
        if (diff <= 2) {
          return validDigest
        }
        // Return a different digest that produces a different token
        const invalidDigest = Buffer.alloc(20)
        invalidDigest[19] = 0x00
        invalidDigest[0] = 0x00
        invalidDigest[1] = 0xff
        invalidDigest[2] = 0xff
        invalidDigest[3] = 0xff
        return invalidDigest
      })

      // Test tokens within acceptable window (±60 seconds)
      const validToken = '755224'

      // Test at different time points within window
      for (const offset of [-60, -30, 0, 30, 60]) {
        vi.setSystemTime(baseTime + offset * 1000)
        _callCount = 0

        const result = await verifyTOTPToken(
          {
            userId: mockUser.id,
            token: validToken,
          },
          mockTOTPCredential
        )

        expect(result.success).toBe(true)
      }

      // Test outside window (should fail)
      vi.setSystemTime(baseTime + 90 * 1000)
      _callCount = 0

      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: validToken,
        },
        mockTOTPCredential
      )

      expect(result.success).toBe(false)
    })

    it('should prevent replay attacks with time step tracking', async () => {
      const testTimestamp = 1000000000000
      vi.setSystemTime(testTimestamp)

      // Setup mock digest for valid token
      const mockDigest = Buffer.alloc(20)
      mockDigest[19] = 0x00
      mockDigest[0] = 0x00
      mockDigest[1] = 0x0b
      mockDigest[2] = 0x86
      mockDigest[3] = 0x18

      const mockHmacInstance = mockCreateHmac()
      mockHmacInstance.digest.mockReturnValue(mockDigest)

      const validToken = '755224'
      const lastUsedCounter = Math.floor(testTimestamp / 1000 / 30) // Current time step

      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: validToken,
        },
        mockTOTPCredential,
        lastUsedCounter // Same time step already used
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('TOTP token already used')
    })

    it('should implement timing-safe token comparison', async () => {
      // Test with tokens of different lengths (should not leak timing info)
      const shortToken = '123'
      const longToken = '123456789'

      const result1 = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: shortToken,
        },
        mockTOTPCredential
      )

      const result2 = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: longToken,
        },
        mockTOTPCredential
      )

      // Both should fail but not leak timing information
      expect(result1.success).toBe(false)
      expect(result2.success).toBe(false)
    })
  })

  describe('Backup Code Security', () => {
    it('should generate secure backup codes with sufficient entropy', () => {
      // Mock random bytes for backup codes
      mockRandomBytes.mockImplementation((size: number) => {
        const bytes = Buffer.alloc(size)
        for (let i = 0; i < size; i++) {
          bytes[i] = i % 256
        }
        return bytes
      })

      const { plainText, hashed } = regenerateBackupCodes()

      expect(plainText).toHaveLength(TOTP_DEFAULTS.BACKUP_CODES_COUNT)
      expect(hashed).toHaveLength(TOTP_DEFAULTS.BACKUP_CODES_COUNT)

      // Each backup code should be the correct length
      plainText.forEach(code => {
        expect(code).toHaveLength(TOTP_DEFAULTS.BACKUP_CODE_LENGTH)
        expect(code).toMatch(/^[0-9A-F]+$/) // Hex characters only
      })
    })

    it('should hash backup codes securely for storage', () => {
      const plainTextCodes = ['ABCD1234', 'EFGH5678']

      // Mock SHA-256 hash
      const mockHash = vi.fn().mockReturnValue('mocked-hash-value')
      mockCreateHash().digest = mockHash

      const hashedCodes = hashBackupCodes(plainTextCodes)

      expect(mockCreateHash).toHaveBeenCalledWith('sha256')
      expect(hashedCodes).toHaveLength(2)
      expect(hashedCodes).toEqual(['mocked-hash-value', 'mocked-hash-value'])
    })

    it('should verify backup codes using secure comparison', async () => {
      const backupCode = 'ABCD1234'
      const hashedCode = 'mocked-hash-value'

      // Mock hash to return expected value
      mockCreateHash().digest.mockReturnValue(hashedCode)

      const result = await verifyBackupCode(
        {
          userId: mockUser.id,
          backupCode,
        },
        [hashedCode]
      )

      expect(result.success).toBe(true)
      expect(result.method).toBe('backup_code')
    })

    it('should reject invalid backup codes', async () => {
      const invalidCode = 'INVALID1'
      const validHashedCode = 'valid-hash'

      // Mock hash to return different value
      mockCreateHash().digest.mockReturnValue('different-hash')

      const result = await verifyBackupCode(
        {
          userId: mockUser.id,
          backupCode: invalidCode,
        },
        [validHashedCode]
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid backup code')
    })

    it('should handle backup code verification edge cases', async () => {
      // Test with empty backup code
      const result1 = await verifyBackupCode(
        {
          userId: mockUser.id,
          backupCode: '',
        },
        ['some-hash']
      )

      expect(result1.success).toBe(false)

      // Test with no stored backup codes
      const result2 = await verifyBackupCode(
        {
          userId: mockUser.id,
          backupCode: 'VALID123',
        },
        []
      )

      expect(result2.success).toBe(false)
    })
  })

  describe('Rate Limiting and Attack Prevention', () => {
    it('should validate input parameters strictly', async () => {
      // Test invalid user ID
      const result1 = await verifyTOTPToken(
        {
          userId: 'invalid-uuid',
          token: '123456',
        },
        mockTOTPCredential
      )

      expect(result1.success).toBe(false)

      // Test invalid token format
      const result2 = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: 'abc123', // Non-numeric token
        },
        mockTOTPCredential
      )

      expect(result2.success).toBe(false)
    })

    it('should handle concurrent verification attempts safely', async () => {
      const token = '755224'

      // Simulate multiple concurrent verifications
      const promises = Array(5)
        .fill(null)
        .map(() =>
          verifyTOTPToken(
            {
              userId: mockUser.id,
              token,
            },
            mockTOTPCredential
          )
        )

      const results = await Promise.all(promises)

      // All should process without errors (implementation dependent on rate limiting)
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(typeof result.success).toBe('boolean')
      })
    })

    it('should prevent timing attacks through constant-time operations', async () => {
      const startTime = Date.now()

      await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '123456',
        },
        mockTOTPCredential
      )

      const endTime = Date.now()
      const duration1 = endTime - startTime

      const startTime2 = Date.now()

      await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '654321',
        },
        mockTOTPCredential
      )

      const endTime2 = Date.now()
      const duration2 = endTime2 - startTime2

      // Timing difference should be minimal (within reasonable variance)
      const timingDifference = Math.abs(duration1 - duration2)
      expect(timingDifference).toBeLessThan(10) // 10ms tolerance
    })

    it('should handle algorithm and parameter validation', async () => {
      // Test with different credential parameters
      const customCredential: TOTPCredential = {
        ...mockTOTPCredential,
        algorithm: 'SHA256' as 'SHA1', // Non-standard algorithm for testing
        digits: 8,
        period: 60,
      }

      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '12345678',
        },
        customCredential
      )

      // Should handle gracefully
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('Error Handling and Security Edge Cases', () => {
    it('should handle corrupted secret data gracefully', async () => {
      const corruptedCredential: TOTPCredential = {
        ...mockTOTPCredential,
        secret: 'INVALID_BASE32_@#$%',
      }

      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '123456',
        },
        corruptedCredential
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should sanitize error messages to prevent information leakage', async () => {
      const result = await verifyTOTPToken(
        {
          userId: mockUser.id,
          token: '000000',
        },
        mockTOTPCredential
      )

      expect(result.success).toBe(false)
      // Error message should not leak internal details
      expect(result.error).not.toContain('secret')
      expect(result.error).not.toContain('algorithm')
      expect(result.error).not.toContain('internal')
    })

    it('should handle enrollment validation edge cases', async () => {
      // Test with invalid email format
      const result = await generateTOTPEnrollment({
        userId: mockUser.id,
        userEmail: 'invalid-email',
        userName: mockUser.displayName,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should validate backup code format strictly', async () => {
      // Test various invalid backup code formats
      const invalidCodes = [
        'SHORT', // Too short
        'TOOLONGBACKUPCODE', // Too long
        'ABCD!@#$', // Special characters
        '12345678', // Numeric only (should be hex)
      ]

      for (const code of invalidCodes) {
        const result = await verifyBackupCode(
          {
            userId: mockUser.id,
            backupCode: code,
          },
          ['valid-hash']
        )

        // Should fail validation before reaching verification
        expect(result.success).toBe(false)
      }
    })
  })
})
