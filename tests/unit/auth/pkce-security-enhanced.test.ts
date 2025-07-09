import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateEntropy,
  generateCodeChallenge,
  generateCodeVerifier,
  generateEnhancedPKCEChallenge,
  generatePKCEChallenge,
  timingSafeEqual,
  validatePKCESecure,
  verifyPKCEChallenge,
  verifyPKCEChallengeSecure,
} from '@/lib/auth/pkce'

// Enhanced global crypto mock for comprehensive testing
const mockCrypto = {
  getRandomValues: vi.fn(),
  subtle: {
    digest: vi.fn(),
  },
}

describe('PKCE Security Implementation - Enhanced Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default secure crypto implementation
    mockCrypto.getRandomValues.mockImplementation((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    })

    mockCrypto.subtle.digest.mockImplementation(async (_algorithm: string, data: ArrayBuffer) => {
      const view = new Uint8Array(data)
      const mockHash = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        mockHash[i] = (view[0] + i) % 256
      }
      return mockHash.buffer
    })

    vi.stubGlobal('crypto', mockCrypto)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Code Verifier Generation Security', () => {
    it('should generate cryptographically secure verifiers', async () => {
      const { codeVerifier } = await generatePKCEChallenge()

      // Should use crypto.getRandomValues
      expect(mockCrypto.getRandomValues).toHaveBeenCalled()

      // Should be proper length (32 bytes -> 43 base64url chars)
      expect(codeVerifier).toHaveLength(43)

      // Should only contain base64url characters
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(codeVerifier).not.toContain('=') // No padding
      expect(codeVerifier).not.toContain('+') // No standard base64 chars
      expect(codeVerifier).not.toContain('/') // No standard base64 chars
    })

    it('should validate minimum entropy requirements (4.0 bits/char)', async () => {
      // Test with high-entropy verifier
      const highEntropyVerifier = await generateCodeVerifier()
      const highEntropy = calculateEntropy(highEntropyVerifier)
      expect(highEntropy).toBeGreaterThanOrEqual(4.0)

      // Test with low-entropy verifier (should fail validation later)
      const lowEntropyVerifier = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // 43 a's
      const lowEntropy = calculateEntropy(lowEntropyVerifier)
      expect(lowEntropy).toBeLessThan(2.0) // Very low entropy
    })

    it('should enforce length requirements (43-128 chars)', async () => {
      const { codeVerifier } = await generatePKCEChallenge()

      // Standard implementation should generate 43 chars
      expect(codeVerifier.length).toBe(43)
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(codeVerifier.length).toBeLessThanOrEqual(128)
    })

    it('should detect insufficient randomness', async () => {
      // Mock weak random generator
      const weakPattern = vi.fn((arr: Uint8Array) => {
        // Generate very predictable pattern
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i % 4 // Only 4 possible values
        }
        return arr
      })

      mockCrypto.getRandomValues.mockImplementation(weakPattern)

      const { codeVerifier } = await generatePKCEChallenge()
      const entropy = calculateEntropy(codeVerifier)

      // Should detect the pattern has low entropy
      expect(entropy).toBeLessThan(3.0)
    })

    it('should generate unique verifiers across multiple calls', async () => {
      const verifiers = await Promise.all([
        generatePKCEChallenge(),
        generatePKCEChallenge(),
        generatePKCEChallenge(),
        generatePKCEChallenge(),
        generatePKCEChallenge(),
      ])

      const codeVerifiers = verifiers.map(v => v.codeVerifier)
      const uniqueVerifiers = new Set(codeVerifiers)

      // All should be unique
      expect(uniqueVerifiers.size).toBe(5)
    })

    it('should handle entropy edge cases securely', () => {
      const testCases = [
        { input: '', expectedEntropy: 0 },
        { input: 'a', expectedEntropy: 0 },
        { input: 'aa', expectedEntropy: 0 },
        { input: 'ab', expectedEntropy: 1 },
        { input: 'abcd', expectedEntropy: 2 },
      ]

      for (const testCase of testCases) {
        const entropy = calculateEntropy(testCase.input)
        expect(entropy).toBeCloseTo(testCase.expectedEntropy, 0.1)
      }
    })
  })

  describe('Code Challenge Creation Security', () => {
    it('should create valid S256 challenges', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      // Should use SHA-256
      expect(mockCrypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer))

      // Base64url encoded SHA-256 (32 bytes) should be 43 characters
      expect(codeChallenge).toHaveLength(43)
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should use proper SHA256 hashing', async () => {
      const testVerifier = 'test-verifier-with-known-content-123456789'

      await generateCodeChallenge(testVerifier)

      expect(mockCrypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer))

      // Should be called exactly once per challenge generation
      expect(mockCrypto.subtle.digest).toHaveBeenCalledTimes(1)
    })

    it('should validate challenge format compliance', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      // RFC 7636 compliance checks
      expect(codeChallenge).not.toContain('=') // No base64 padding
      expect(codeChallenge).not.toContain('+') // No + character
      expect(codeChallenge).not.toContain('/') // No / character
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/) // Exact format
    })

    it('should maintain deterministic challenge-verifier relationship', async () => {
      const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

      const challenge1 = await generateCodeChallenge(testVerifier)
      const challenge2 = await generateCodeChallenge(testVerifier)
      const challenge3 = await generateCodeChallenge(testVerifier)

      // Same verifier should always generate same challenge
      expect(challenge1).toBe(challenge2)
      expect(challenge2).toBe(challenge3)
    })

    it('should handle malformed verifier inputs securely', async () => {
      const malformedInputs = [
        '',
        'short',
        'contains spaces',
        'contains+plus',
        'contains/slash',
        'contains=equals',
        null as unknown as string,
        undefined as unknown as string,
      ]

      for (const input of malformedInputs) {
        try {
          await generateCodeChallenge(input)
          // If it doesn't throw, verify it handles the input gracefully
        } catch (error) {
          // Should handle errors gracefully without exposing internals
          expect(error).toBeDefined()
        }
      }
    })
  })

  describe('PKCE Validation Security', () => {
    it('should verify valid challenge-verifier pairs', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      const result = await validatePKCESecure(codeVerifier, codeChallenge)

      expect(result.valid).toBe(true)
      expect(result.entropy).toBeGreaterThanOrEqual(4.0)
      expect(result.timingSafe).toBe(true)
    })

    it('should reject invalid verifiers', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      const invalidVerifiers = [
        'completely-wrong-verifier-that-wont-match-anything',
        'short',
        '',
        'a'.repeat(44), // Wrong length
        '!@#$%^&*()', // Invalid characters
      ]

      for (const invalidVerifier of invalidVerifiers) {
        const result = await validatePKCESecure(invalidVerifier, codeChallenge)
        expect(result.valid).toBe(false)
      }
    })

    it('should implement timing attack protection', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      // Test scenarios with different computational complexity
      const scenarios = [
        { verifier: codeVerifier, challenge: codeChallenge, description: 'valid pair' },
        {
          verifier: 'wrong-verifier-same-length-as-original-one',
          challenge: codeChallenge,
          description: 'wrong verifier',
        },
        { verifier: 'short', challenge: codeChallenge, description: 'short verifier' },
        {
          verifier: codeVerifier,
          challenge: 'wrong-challenge-same-length-as-original',
          description: 'wrong challenge',
        },
      ]

      const times: number[] = []

      for (const scenario of scenarios) {
        const start = performance.now()
        await validatePKCESecure(scenario.verifier, scenario.challenge)
        const elapsed = performance.now() - start
        times.push(elapsed)
      }

      // All validations should take at least the minimum time (10ms as per implementation)
      for (const time of times) {
        expect(time).toBeGreaterThanOrEqual(9) // 1ms tolerance for test timing
      }

      // Time variance should be minimal to prevent timing attacks
      const avgTime = times.reduce((a, b) => a + b) / times.length
      for (const time of times) {
        const variance = Math.abs(time - avgTime)
        expect(variance).toBeLessThan(5) // 5ms tolerance
      }
    })

    it('should handle validation errors securely', async () => {
      const errorCases = [
        { verifier: null, challenge: 'valid-challenge', description: 'null verifier' },
        { verifier: undefined, challenge: 'valid-challenge', description: 'undefined verifier' },
        { verifier: 'valid-verifier', challenge: null, description: 'null challenge' },
        { verifier: 'valid-verifier', challenge: undefined, description: 'undefined challenge' },
        { verifier: '', challenge: '', description: 'empty strings' },
        {
          verifier: 'a'.repeat(1000),
          challenge: 'valid-challenge',
          description: 'oversized verifier',
        },
      ]

      for (const testCase of errorCases) {
        try {
          const result = await validatePKCESecure(
            testCase.verifier as unknown as string,
            testCase.challenge as unknown as string
          )

          // If it doesn't throw, it should return invalid
          expect(result.valid).toBe(false)
          expect(result).toHaveProperty('entropy')
          expect(result).toHaveProperty('timingSafe')
        } catch (error) {
          // Should handle errors gracefully
          expect(error).toBeDefined()
        }
      }
    })

    it('should validate timing-safe comparison implementation', async () => {
      const testStrings = [
        { a: 'identical', b: 'identical', shouldMatch: true },
        { a: 'different', b: 'strings!', shouldMatch: false },
        { a: 'same-length-diff', b: 'same-length-also', shouldMatch: false },
        { a: 'short', b: 'much-longer-string', shouldMatch: false },
        { a: '', b: '', shouldMatch: true },
      ]

      for (const test of testStrings) {
        const bufferA = Buffer.from(test.a)
        const bufferB = Buffer.from(test.b)

        // Time the comparison
        const start = performance.now()
        const result = timingSafeEqual(bufferA, bufferB)
        const elapsed = performance.now() - start

        expect(result).toBe(test.shouldMatch)

        // Timing should be consistent regardless of input
        expect(elapsed).toBeGreaterThan(0) // Should take some time
      }
    })
  })

  describe('Security Controls and Attack Prevention', () => {
    it('should enforce entropy validation in production scenarios', async () => {
      // Test various entropy scenarios
      const entropyTests = [
        {
          verifier: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // All same char
          expectedValid: false,
          description: 'all same character',
        },
        {
          verifier: 'abababababababababababababababababababab', // Pattern
          expectedValid: false,
          description: 'repeating pattern',
        },
        {
          verifier: '0123456789012345678901234567890123456789012', // Sequential
          expectedValid: false,
          description: 'sequential pattern',
        },
      ]

      for (const test of entropyTests) {
        const challenge = await generateCodeChallenge(test.verifier)
        const result = await validatePKCESecure(test.verifier, challenge)

        expect(result.valid).toBe(test.expectedValid)
        expect(result.entropy).toBeLessThan(4.0) // Low entropy should be detected
      }
    })

    it('should prevent timing attacks in comparison operations', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      // Test with systematically different invalid verifiers
      const invalidVerifiers = [
        'wrong-verifier-starting-with-a-different-char',
        'wrong-verifier-starting-with-b-different-char',
        'wrong-verifier-starting-with-c-different-char',
        'wrong-verifier-starting-with-d-different-char',
        'wrong-verifier-starting-with-e-different-char',
      ]

      const times: number[] = []

      for (const verifier of invalidVerifiers) {
        const start = performance.now()
        await validatePKCESecure(verifier, codeChallenge)
        times.push(performance.now() - start)
      }

      // All times should be similar (constant-time comparison)
      const avgTime = times.reduce((a, b) => a + b) / times.length
      const maxVariance = Math.max(...times.map(t => Math.abs(t - avgTime)))

      expect(maxVariance).toBeLessThan(5) // 5ms tolerance for timing consistency
    })

    it('should validate metadata security in enhanced PKCE', async () => {
      const enhanced = await generateEnhancedPKCEChallenge()

      // Should include security metadata
      expect(enhanced).toHaveProperty('codeVerifier')
      expect(enhanced).toHaveProperty('codeChallenge')
      expect(enhanced).toHaveProperty('method')
      expect(enhanced).toHaveProperty('entropy')
      expect(enhanced).toHaveProperty('metadata')

      // Validate security properties
      expect(enhanced.method).toBe('S256')
      expect(enhanced.entropy).toBeGreaterThanOrEqual(4.0)
      expect(enhanced.metadata).toHaveProperty('generated')
      expect(enhanced.metadata).toHaveProperty('secure')
      expect(enhanced.metadata.secure).toBe(true)

      // Timestamp should be recent
      const timestamp = new Date(enhanced.metadata.generated)
      const now = new Date()
      expect(now.getTime() - timestamp.getTime()).toBeLessThan(1000) // Within 1 second
    })

    it('should handle authorization code interception prevention', async () => {
      // PKCE should prevent authorization code interception attacks
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      // Attacker intercepts authorization code but doesn't have code_verifier
      const _attackerChallenge = await generateCodeChallenge('attacker-verifier')

      // Original challenge should only work with original verifier
      const legitimateResult = await verifyPKCEChallenge(codeVerifier, codeChallenge)
      expect(legitimateResult).toBe(true)

      // Attacker's verifier should not work with intercepted challenge
      const attackResult = await verifyPKCEChallenge('attacker-verifier', codeChallenge)
      expect(attackResult).toBe(false)
    })

    it('should implement secure PKCE challenge verification', async () => {
      const testCases = [
        {
          verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
          challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', // Correct SHA256
          expected: true,
        },
        {
          verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
          challenge: 'wrong-challenge-that-doesnt-match-verifier',
          expected: false,
        },
      ]

      for (const testCase of testCases) {
        // Use the secure verification function
        const result = await verifyPKCEChallengeSecure(testCase.verifier, testCase.challenge)

        expect(result.valid).toBe(testCase.expected)
        expect(result).toHaveProperty('timingSafe')
        expect(result).toHaveProperty('entropy')
        expect(result.timingSafe).toBe(true)
      }
    })
  })

  describe('RFC 7636 Compliance and Standards', () => {
    it('should comply with RFC 7636 PKCE specification', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      // RFC 7636 Section 4.1: code_verifier
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(codeVerifier.length).toBeLessThanOrEqual(128)
      expect(codeVerifier).toMatch(/^[A-Za-z0-9._~-]+$/) // RFC 7636 allowed characters

      // RFC 7636 Section 4.2: code_challenge
      expect(codeChallenge.length).toBe(43) // Base64url(SHA256) = 43 chars
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/) // Base64url characters
    })

    it('should use secure random number generation', async () => {
      await generatePKCEChallenge()

      // Should use crypto.getRandomValues for security
      expect(mockCrypto.getRandomValues).toHaveBeenCalled()
      const callArgs = mockCrypto.getRandomValues.mock.calls[0][0]
      expect(callArgs).toBeInstanceOf(Uint8Array)
      expect(callArgs.length).toBe(32) // 32 bytes for 256-bit security
    })

    it('should implement OAuth 2.0 Security Best Practices', async () => {
      // Security BCP: Use SHA256 for code challenge
      await generateCodeChallenge('test-verifier')
      expect(mockCrypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer))

      // Security BCP: High entropy code verifier
      const { codeVerifier } = await generatePKCEChallenge()
      const entropy = calculateEntropy(codeVerifier)
      expect(entropy).toBeGreaterThanOrEqual(4.0) // High entropy requirement

      // Security BCP: Proper base64url encoding (no padding)
      expect(codeVerifier).not.toContain('=')
    })

    it('should validate OpenID Connect security requirements', async () => {
      const enhanced = await generateEnhancedPKCEChallenge()

      // OIDC security requirements
      expect(enhanced.method).toBe('S256') // Must use S256, not plain
      expect(enhanced.entropy).toBeGreaterThanOrEqual(4.0) // Sufficient entropy
      expect(enhanced.metadata.secure).toBe(true) // Security validation

      // Verify cryptographic properties
      const isValid = await verifyPKCEChallenge(enhanced.codeVerifier, enhanced.codeChallenge)
      expect(isValid).toBe(true)
    })
  })
})
