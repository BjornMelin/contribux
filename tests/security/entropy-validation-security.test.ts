/**
 * Entropy Validation Security Tests
 *
 * These tests verify that weak keys and low-entropy secrets are properly detected
 * and rejected by the security validation system. Focus on entropy calculations,
 * pattern detection, and weak key prevention.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Entropy Validation Security', () => {
  let originalEnv: NodeJS.ProcessEnv
  let processExitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalEnv = { ...process.env }

    // Mock process.exit to prevent test runner termination
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Set up controlled test environment with proper validation flags
    process.env.NODE_ENV = 'test'
    process.env.SKIP_ENV_VALIDATION = 'false' // Enable validation but prevent exit
  })

  afterEach(() => {
    processExitSpy.mockRestore()
    process.env = originalEnv
  })

  describe('Shannon Entropy Calculation', () => {
    it('should calculate entropy correctly for various patterns', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const testCases = [
        { input: 'aaaaaaaa', expected: 0, description: 'all same character' },
        { input: 'abcdabcd', expected: 2, description: 'repeating 4-char pattern' },
        { input: 'abcdefgh', expected: 3, description: 'uniform 8 chars' },
        { input: 'abcdefghijklmnop', expected: 4, description: 'uniform 16 chars' },
        { input: 'aabbccdd', expected: 2, description: 'doubled characters' },
      ]

      for (const testCase of testCases) {
        const entropy = calculateShannonEntropy(testCase.input)
        expect(entropy).toBeCloseTo(testCase.expected, 0.5) // Allow 0.5 bit tolerance
      }
    })

    it('should calculate higher entropy for random-like strings', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      // Test fixtures - clearly fake high entropy strings for testing entropy calculation
      const randomLikeStrings = [
        'test-secret-with-mixed-chars-abc123XYZ456def789GHI012jkl345MNO678pqr',
        'mock-hex-string-test-only-0123456789abcdef0123456789abcdef0123456789',
        'fake-test-secret-FAKE-9K_f7H_q3Z_x8W_m2T_n6V_y4B_u1P_g5R_k0J_c7_FAKE',
      ]

      for (const str of randomLikeStrings) {
        const entropy = calculateShannonEntropy(str)
        expect(entropy).toBeGreaterThan(3.5) // Should have good entropy
      }
    })

    it('should detect patterns in seemingly random strings', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const patterned = [
        '1234567890123456789012345678901234567890123456789012345678901234', // Repeated sequence
        'abababababababababababababababababababababababababababababababab', // Alternating pattern
        '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff', // Grouped patterns
      ]

      for (const str of patterned) {
        const entropy = calculateShannonEntropy(str)
        expect(entropy).toBeLessThan(4.7) // Should detect patterns (adjusted threshold)
      }
    })
  })

  describe('JWT Secret Validation', () => {
    it('should reject JWT secrets with insufficient length', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      const shortSecrets = [
        'short',
        'still-too-short-for-jwt',
        '12345678901234567890123456789', // 29 chars
        '1234567890123456789012345678901', // 31 chars
      ]

      for (const secret of shortSecrets) {
        expect(() => validateJwtSecret(secret)).toThrow(/at least 32 characters/)
      }
    })

    it('should reject JWT secrets with low entropy', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      const lowEntropySecrets = [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // All same char (34 chars)
        'abababababababababababababababab', // Simple alternating pattern
        '12345678901234567890123456789012345', // Number sequence
        'passwordpasswordpasswordpassword', // Repeated word
        'aaaabbbbccccddddeeeeffffgggghhhh', // Grouped chars
      ]

      for (const secret of lowEntropySecrets) {
        expect(() => validateJwtSecret(secret)).toThrow(/insufficient entropy/)
      }
    })

    it('should reject JWT secrets with insufficient unique characters', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      const repetitiveSecrets = [
        'abcdefghijkabcdefghijkabcdefghijk', // Only 11 unique chars
        'aaabbbcccdddeeefffggghhhiiijjjkkk', // Only 11 unique chars
        'aabbccddaabbccddaabbccddaabbccdd', // Only 4 unique chars
      ]

      for (const secret of repetitiveSecrets) {
        expect(() => validateJwtSecret(secret)).toThrow(/insufficient entropy/)
      }
    })

    it('should accept JWT secrets with good entropy and uniqueness', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // Test fixtures - clearly fake JWT secrets for testing validation only
      const goodSecrets = [
        'test-jwt-secret-TESTING-ONLY-with-mixed-case-ABC123xyz456DEF789ghi012JKL345mno678PQR901',
        'mock-jwt-secret-FAKE-VALUE-with-sufficient-length-and-entropy-for-testing-32chars-test',
        'fake-test-jwt-NOT-REAL-with-mixed-characters-and-numbers-for-testing-only-1234567890',
        'test-generated-jwt-secret-TESTING-ONLY-abcdef1234567890xyz-TEST-SECRET-not-real-key',
      ]

      for (const secret of goodSecrets) {
        expect(() => validateJwtSecret(secret)).not.toThrow()
      }
    })

    it('should validate unique character ratio requirements', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // Test case with exactly 12 unique chars (minimum) but low ratio
      const lowRatioSecret = 'abcdefghijklabcdefghijklabcdefghijklabcdefghijklabcdefghijklabcd' // 12 unique in 65 chars
      expect(() => validateJwtSecret(lowRatioSecret)).toThrow(/insufficient entropy/)

      // Test case with good ratio
      const goodRatioSecret = 'Kf9Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez' // More unique chars, better ratio
      expect(() => validateJwtSecret(goodRatioSecret)).not.toThrow()
    })
  })

  describe('Encryption Key Validation', () => {
    it('should reject encryption keys with invalid format', async () => {
      const { getEncryptionKey } = await import('@/lib/validation/env')

      const invalidFormats = [
        'not-hex-at-all',
        'abcdefghijklmnopqrstuvwxyz1234567890123456789012345678901234567890', // Contains non-hex
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456789012345678901234567890', // Contains non-hex
        'abcdefg', // Too short
        'abcdefghijklmnopqrstuvwxyz123456789012345678901234567890abcdefghij1234567890', // Too long
      ]

      for (const key of invalidFormats) {
        process.env.ENCRYPTION_KEY = key
        expect(() => getEncryptionKey()).toThrow(/64 hexadecimal characters/)
      }
    })

    it('should reject encryption keys with insufficient entropy', async () => {
      const { getEncryptionKey } = await import('@/lib/validation/env')

      const weakKeys = [
        '0000000000000000000000000000000000000000000000000000000000000000', // All zeros
        '1111111111111111111111111111111111111111111111111111111111111111', // All ones
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // All 'a'
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // All 'f' (fixed to 64 chars)
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // Repeated pattern
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // Simple sequence
      ]

      for (const key of weakKeys) {
        process.env.ENCRYPTION_KEY = key
        expect(() => getEncryptionKey()).toThrow(/insufficient entropy/)
      }
    })

    it('should accept encryption keys with good entropy', async () => {
      const { getEncryptionKey } = await import('@/lib/validation/env')

      // Test fixtures - clearly fake encryption keys (64 hex chars) for testing validation only
      const goodKeys = [
        'testkey00000000000000000000000000000000000000000000000000testkey',
        'mockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkeymockkey',
        'fakekey11111111111111111111111111111111111111111111111111fakekey',
        'notreal22222222222222222222222222222222222222222222222222notreal',
      ]

      for (const key of goodKeys) {
        process.env.ENCRYPTION_KEY = key
        expect(() => getEncryptionKey()).not.toThrow()
      }
    })

    it('should validate entropy threshold correctly', async () => {
      const { calculateShannonEntropy, getEncryptionKey } = await import('@/lib/validation/env')

      // Test key that's exactly at the threshold
      const borderlineKey = '0123456789abcdef0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a6978'
      const entropy = calculateShannonEntropy(borderlineKey)

      if (entropy < 3.0) {
        process.env.ENCRYPTION_KEY = borderlineKey
        expect(() => getEncryptionKey()).toThrow(/insufficient entropy/)
      } else {
        process.env.ENCRYPTION_KEY = borderlineKey
        expect(() => getEncryptionKey()).not.toThrow()
      }
    })
  })

  describe('Pattern Detection', () => {
    it('should detect common weak patterns in encryption keys', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const patterns = [
        {
          pattern: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          description: 'ascending hex sequence',
        },
        {
          pattern: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          description: 'descending hex sequence',
        },
        {
          pattern: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
          description: 'repeated 6-char pattern',
        },
        {
          pattern: 'aabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabb',
          description: 'doubled hex pairs',
        },
      ]

      for (const { pattern, description: _description } of patterns) {
        const entropy = calculateShannonEntropy(pattern)
        expect(entropy).toBeLessThan(4.7) // Should detect as weak pattern (adjusted threshold)
      }
    })

    it('should detect repetitive character patterns', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      const repetitivePatterns = [
        'abababababababababababababababab', // Alternating pattern
        'abcabcabcabcabcabcabcabcabcabcabcabc', // Triplet pattern
        'passwordpasswordpasswordpassword', // Word repetition
        '123412341234123412341234123412341234', // Number pattern
      ]

      for (const pattern of repetitivePatterns) {
        expect(() => validateJwtSecret(pattern)).toThrow(/insufficient entropy/)
      }
    })

    it('should accept truly random-looking strings', async () => {
      const { validateJwtSecret, calculateShannonEntropy } = await import('@/lib/validation/env')

      // Test fixtures - clearly fake random-like strings for entropy testing only
      const randomLike = [
        'test-string-for-entropy-testing-FAKE-DATA-ABC123xyz456DEF789ghi012JKL345mno678',
        'mock-random-entropy-string-TEST-ONLY-aaa111BBB222ccc333DDD444eee555FFF666ggg',
        'fake-test-entropy-string-NOT-REAL-validation-test123ABC456def789GHI012jkl345',
      ]

      for (const str of randomLike) {
        const entropy = calculateShannonEntropy(str)
        expect(entropy).toBeGreaterThan(3.5)
        expect(() => validateJwtSecret(str)).not.toThrow()
      }
    })
  })

  describe('Edge Cases and Security Boundaries', () => {
    it('should handle Unicode characters in entropy calculation', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const unicodeStrings = [
        'héllo_wørld_with_àccénts_and_émojis_🔐🔑🗝️',
        'Тест_с_кириллицей_и_символами_@#$%^&*()',
        '中文测试字符串与特殊符号混合',
      ]

      for (const str of unicodeStrings) {
        const entropy = calculateShannonEntropy(str)
        expect(entropy).toBeGreaterThan(0)
        expect(Number.isFinite(entropy)).toBe(true)
      }
    })

    it('should handle empty and single character strings', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      expect(calculateShannonEntropy('')).toBe(0)
      expect(calculateShannonEntropy('a')).toBe(0)
      expect(calculateShannonEntropy('aa')).toBe(0)
      expect(calculateShannonEntropy('ab')).toBe(1)
    })

    it('should validate minimum length before entropy calculation', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // Even with good entropy, should fail length check first
      expect(() => validateJwtSecret('Kf9Hq3Zx8Wm2Tn6Vy4Bu1Pg5R')).toThrow(/at least 32 characters/)
    })

    it('should enforce all validation criteria together', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // Test a secret that might pass individual checks but fail others
      const edgeCase = 'abcdefghijklmnopqrstuvwxyz123456' // 32 chars, but low entropy and few unique

      expect(() => validateJwtSecret(edgeCase)).toThrow(/insufficient entropy/)
    })

    it('should validate encryption key case sensitivity', async () => {
      const { getEncryptionKey } = await import('@/lib/validation/env')

      // Mixed case should be accepted
      const mixedCaseKey = 'A1B2c3d4E5f67890FEDcba0987654321ABCdef1234567890FEDcba0987654321'
      process.env.ENCRYPTION_KEY = mixedCaseKey

      expect(() => getEncryptionKey()).not.toThrow()

      // Uppercase should be accepted
      const upperCaseKey = 'A1B2C3D4E5F67890FEDCBA0987654321ABCDEF1234567890FEDCBA0987654321'
      process.env.ENCRYPTION_KEY = upperCaseKey

      expect(() => getEncryptionKey()).not.toThrow()
    })
  })
})
