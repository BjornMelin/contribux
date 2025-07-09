import { describe, expect, it, vi } from 'vitest'
import {
  calculateEntropy,
  generateCodeChallenge,
  generateEnhancedPKCEChallenge,
  generatePKCEChallenge,
  validatePKCESecure,
  verifyPKCEChallenge,
} from '@/lib/auth/pkce'

// Mock crypto.getRandomValues with truly random values for unique generation
vi.stubGlobal('crypto', {
  getRandomValues: vi.fn((arr: Uint8Array) => {
    if (arr instanceof Uint8Array) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256) // Use Math.random for true uniqueness
      }
    }
    return arr
  }),
  subtle: {
    digest: vi.fn(async (_algorithm: string, data: ArrayBuffer | Uint8Array) => {
      // Convert Uint8Array to ArrayBuffer if needed
      const buffer =
        data instanceof Uint8Array
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : data

      // Return a mock hash based on input data
      const inputView = new Uint8Array(buffer)
      const mockHash = new Uint8Array(32)

      // Create a hash that varies based on the input content
      let seed = 0
      for (let i = 0; i < Math.min(inputView.length, 8); i++) {
        seed += inputView[i] * (i + 1)
      }

      for (let i = 0; i < 32; i++) {
        mockHash[i] = (seed + i * 7) % 256
      }
      return mockHash.buffer
    }),
  },
})

describe('PKCE (Proof Key for Code Exchange)', () => {
  describe('Code Verifier Generation', () => {
    it('should generate cryptographically secure verifiers', async () => {
      const { codeVerifier } = await generatePKCEChallenge()

      // Base64url encoded 32 bytes should be 43 characters (no padding)
      expect(codeVerifier).toHaveLength(43)
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/) // Base64url characters only

      // Verify cryptographic source
      expect(crypto.getRandomValues).toHaveBeenCalled()
    })

    it('should validate minimum entropy requirements (4.0 bits/char)', async () => {
      const { codeVerifier } = await generatePKCEChallenge()

      // Calculate entropy of generated verifier
      const entropy = calculateEntropy(codeVerifier)
      expect(entropy).toBeGreaterThanOrEqual(4.0)
    })

    it('should enforce length requirements (43-128 chars)', async () => {
      const { codeVerifier } = await generatePKCEChallenge()

      expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(codeVerifier.length).toBeLessThanOrEqual(128)

      // Verify specific length for standard implementation
      expect(codeVerifier).toHaveLength(43)
    })

    it('should detect insufficient randomness', async () => {
      // Mock weak random generator
      const weakMockRandom = vi.fn((arr: Uint8Array) => {
        // Generate predictable low-entropy data
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i % 4 // Very low entropy pattern
        }
        return arr
      })

      vi.stubGlobal('crypto', {
        getRandomValues: weakMockRandom,
        subtle: crypto.subtle,
      })

      const { codeVerifier } = await generatePKCEChallenge()
      const entropy = calculateEntropy(codeVerifier)

      // Should detect low entropy
      expect(entropy).toBeLessThan(4.0)
    })

    it('should generate unique verifiers on multiple calls', async () => {
      const results = await Promise.all([
        generatePKCEChallenge(),
        generatePKCEChallenge(),
        generatePKCEChallenge(),
      ])

      const verifiers = results.map(r => r.codeVerifier)
      const uniqueVerifiers = new Set(verifiers)

      expect(uniqueVerifiers.size).toBe(3)
    })
  })

  describe('Code Challenge Creation', () => {
    it('should create valid S256 challenges', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      // Base64url encoded SHA-256 hash (32 bytes) should be 43 characters
      expect(codeChallenge).toHaveLength(43)
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should use proper SHA256 hashing', async () => {
      const mockDigest = vi.spyOn(crypto.subtle, 'digest')

      await generatePKCEChallenge()

      expect(mockDigest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer))
    })

    it('should validate challenge format', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      // Should not contain standard base64 padding or invalid characters
      expect(codeChallenge).not.toContain('=')
      expect(codeChallenge).not.toContain('+')
      expect(codeChallenge).not.toContain('/')
    })

    it('should maintain deterministic challenge-verifier relationship', async () => {
      const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

      const challenge1 = await generateCodeChallenge(testVerifier)
      const challenge2 = await generateCodeChallenge(testVerifier)

      expect(challenge1).toBe(challenge2)
    })
  })

  describe('PKCE Validation', () => {
    it('should verify valid challenge-verifier pairs', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      const result = await validatePKCESecure(codeVerifier, codeChallenge)

      expect(result.valid).toBe(true)
      expect(result.entropy).toBeGreaterThanOrEqual(4.0)
      expect(result.timingSafe).toBe(true)
    })

    it('should reject invalid verifiers', async () => {
      const { codeChallenge } = await generatePKCEChallenge()
      const invalidVerifier = 'invalid-verifier-that-wont-match'

      const result = await validatePKCESecure(invalidVerifier, codeChallenge)

      expect(result.valid).toBe(false)
    })

    it('should implement timing attack protection', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      // Measure validation time for valid case
      const start1 = performance.now()
      await validatePKCESecure(codeVerifier, codeChallenge)
      const time1 = performance.now() - start1

      // Measure validation time for invalid case
      const start2 = performance.now()
      await validatePKCESecure('invalid-verifier', codeChallenge)
      const time2 = performance.now() - start2

      // Both should take at least minimum time (10ms per implementation)
      expect(time1).toBeGreaterThanOrEqual(10)
      expect(time2).toBeGreaterThanOrEqual(10)

      // Time difference should be minimal to prevent timing attacks
      const timeDiff = Math.abs(time1 - time2)
      expect(timeDiff).toBeLessThan(5) // 5ms tolerance
    })

    it('should handle validation errors securely', async () => {
      // Type for intentionally malformed test inputs
      type MalformedPKCEInput = string | null

      // Test with malformed inputs
      const testCases: { verifier: MalformedPKCEInput; challenge: MalformedPKCEInput }[] = [
        { verifier: '', challenge: 'valid-challenge' },
        { verifier: 'valid-verifier', challenge: '' },
        { verifier: null, challenge: 'valid-challenge' },
        { verifier: 'short', challenge: 'challenge' },
      ]

      for (const testCase of testCases) {
        try {
          const result = await validatePKCESecure(
            testCase.verifier as string,
            testCase.challenge as string
          )
          expect(result.valid).toBe(false)
        } catch (error) {
          // Should handle errors gracefully without exposing internals
          expect(error).toBeDefined()
        }
      }
    })
  })

  describe('Security Controls', () => {
    it('should enforce entropy validation', async () => {
      // Test with low-entropy input
      const lowEntropyVerifier = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // 43 chars, all same
      const challenge = await generateCodeChallenge(lowEntropyVerifier)

      const result = await validatePKCESecure(lowEntropyVerifier, challenge)

      // Should detect low entropy and fail validation
      expect(result.entropy).toBeLessThan(1.0) // Very low entropy
      expect(result.valid).toBe(false)
    })

    it('should prevent timing attacks in comparison', async () => {
      const { codeChallenge } = await generatePKCEChallenge()

      // Test timing consistency across different invalid inputs
      const invalidInputs = [
        'a'.repeat(43),
        'b'.repeat(43),
        'completely-different-invalid-verifier-here',
      ]

      const times: number[] = []

      for (const input of invalidInputs) {
        const start = performance.now()
        await validatePKCESecure(input, codeChallenge)
        times.push(performance.now() - start)
      }

      // All times should be similar (within reasonable variance)
      const avgTime = times.reduce((a, b) => a + b) / times.length
      for (const time of times) {
        expect(Math.abs(time - avgTime)).toBeLessThan(5) // 5ms tolerance
      }
    })

    it('should validate metadata security', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      const result = await validatePKCESecure(codeVerifier, codeChallenge)

      // Should include security metadata
      expect(result).toHaveProperty('valid')
      expect(result).toHaveProperty('entropy')
      expect(result).toHaveProperty('timingSafe')
      expect(typeof result.entropy).toBe('number')
      expect(typeof result.timingSafe).toBe('boolean')
    })

    it('should handle enhanced PKCE challenge generation', async () => {
      const enhanced = await generateEnhancedPKCEChallenge()

      expect(enhanced).toHaveProperty('codeVerifier')
      expect(enhanced).toHaveProperty('codeChallenge')
      expect(enhanced).toHaveProperty('method')
      expect(enhanced).toHaveProperty('entropy')
      expect(enhanced).toHaveProperty('metadata')

      expect(enhanced.method).toBe('S256')
      expect(enhanced.entropy).toBeGreaterThanOrEqual(4.0)
      expect(enhanced.metadata).toHaveProperty('generated')
      expect(enhanced.metadata).toHaveProperty('secure')
    })
  })

  describe('Cryptographic Standards Compliance', () => {
    it('should comply with RFC 7636 PKCE specification', async () => {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

      // RFC 7636 Section 4.1: code_verifier
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(codeVerifier.length).toBeLessThanOrEqual(128)
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_.-~]+$/)

      // RFC 7636 Section 4.2: code_challenge
      expect(codeChallenge.length).toBe(43) // Base64url(SHA256) = 43 chars
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should use secure random number generation', async () => {
      const getRandomValuesSpy = vi.spyOn(crypto, 'getRandomValues')

      await generatePKCEChallenge()

      expect(getRandomValuesSpy).toHaveBeenCalled()
      const callArgs = getRandomValuesSpy.mock.calls[0][0]
      expect(callArgs).toBeInstanceOf(Uint8Array)
      expect(callArgs.length).toBe(32) // 32 bytes for secure verifier
    })

    it('should implement secure challenge verification', async () => {
      const verifier = 'test-verifier-with-sufficient-entropy-12345'
      const challenge = await generateCodeChallenge(verifier)

      const isValid = await verifyPKCEChallenge(verifier, challenge)
      expect(isValid).toBe(true)

      const isInvalid = await verifyPKCEChallenge('wrong-verifier', challenge)
      expect(isInvalid).toBe(false)
    })
  })
})
