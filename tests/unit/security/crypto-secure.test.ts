import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateSecureId,
  generateSecureRandomString,
  getSecureRandomBytes,
  getSecureRandomFloat,
  getSecureRandomInt,
  getSecureRandomWithFallback,
  SecureRandomPool,
  secureRequestId,
  secureSessionId,
  secureTokenId,
  secureWorkerId,
} from '@/lib/security/crypto-secure'

// Test interfaces for global object mocking
interface MockCrypto {
  getRandomValues: (array: Uint8Array) => Uint8Array
}

type MockNodeRequire = (module: string) => {
  randomBytes: (length: number) => Buffer
}

describe('Cryptographically Secure Random', () => {
  describe('getSecureRandomBytes', () => {
    it('should generate correct number of bytes', () => {
      const lengths = [1, 8, 16, 32, 64, 128]

      lengths.forEach(length => {
        const bytes = getSecureRandomBytes(length)
        expect(bytes).toBeInstanceOf(Uint8Array)
        expect(bytes.length).toBe(length)
      })
    })

    it('should generate different values each time', () => {
      const results = Array.from({ length: 100 }, () => getSecureRandomBytes(16))

      // Check that all results are unique
      const uniqueResults = new Set(results.map(r => r.toString()))
      expect(uniqueResults.size).toBe(100)
    })

    it('should have sufficient entropy', () => {
      const bytes = getSecureRandomBytes(10000)
      const byteCounts = new Map<number, number>()

      // Count occurrences of each byte value
      for (const byte of bytes) {
        byteCounts.set(byte, (byteCounts.get(byte) || 0) + 1)
      }

      // Should have good distribution across all byte values
      expect(byteCounts.size).toBeGreaterThan(250) // At least 250/256 values present

      // Chi-square test for uniformity
      const expected = bytes.length / 256
      let chiSquare = 0

      for (let i = 0; i < 256; i++) {
        const observed = byteCounts.get(i) || 0
        chiSquare += (observed - expected) ** 2 / expected
      }

      // Chi-square should be within reasonable bounds for uniform distribution
      // For 255 degrees of freedom, 95% confidence interval is roughly [210, 300]
      expect(chiSquare).toBeGreaterThan(200)
      expect(chiSquare).toBeLessThan(310)
    })
  })

  describe('generateSecureRandomString', () => {
    it('should generate string of correct length', () => {
      const lengths = [8, 16, 32, 64, 128]

      lengths.forEach(length => {
        const str = generateSecureRandomString(length)
        expect(str).toHaveLength(length)
      })
    })

    it('should only contain alphabet characters', () => {
      const alphabets = [
        { chars: '0123456789', regex: /^[0-9]+$/ },
        { chars: 'abcdef', regex: /^[a-f]+$/ },
        { chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', regex: /^[A-Z]+$/ },
        { chars: '!@#$%^&*', regex: /^[!@#$%^&*]+$/ },
      ]

      alphabets.forEach(({ chars, regex }) => {
        const str = generateSecureRandomString(100, chars)
        expect(str).toMatch(regex)
      })
    })

    it('should have uniform distribution', () => {
      const alphabet = '0123456789'
      const sampleSize = 100000
      const results = Array.from({ length: sampleSize }, () =>
        generateSecureRandomString(1, alphabet)
      )

      const counts = new Map<string, number>()
      results.forEach(r => counts.set(r, (counts.get(r) || 0) + 1))

      // Each digit should appear roughly 10% of the time
      const expected = sampleSize / alphabet.length
      const tolerance = expected * 0.05 // 5% tolerance

      alphabet.split('').forEach(char => {
        const count = counts.get(char) || 0
        expect(count).toBeGreaterThan(expected - tolerance)
        expect(count).toBeLessThan(expected + tolerance)
      })
    })

    it('should handle empty length', () => {
      const str = generateSecureRandomString(0)
      expect(str).toBe('')
    })
  })

  describe('generateSecureId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 10000 }, () => generateSecureId()))
      expect(ids.size).toBe(10000)
    })

    it('should include prefix when provided', () => {
      const prefixes = ['req', 'user', 'session', 'token']

      prefixes.forEach(prefix => {
        const id = generateSecureId(prefix)
        expect(id).toMatch(new RegExp(`^${prefix}_`))
      })
    })

    it('should include timestamp for ordering', () => {
      const ids = Array.from({ length: 100 }, () => {
        const id = generateSecureId('test')
        return {
          id,
          timestamp: Number.parseInt(id.split('_')[1], 36),
        }
      })

      // Timestamps should be non-decreasing
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i].timestamp).toBeGreaterThanOrEqual(ids[i - 1].timestamp)
      }
    })

    it('should have correct format', () => {
      const id = generateSecureId('test')
      const parts = id.split('_')

      expect(parts).toHaveLength(3)
      expect(parts[0]).toBe('test')
      expect(parts[1]).toMatch(/^[0-9a-z]+$/) // base36 timestamp
      expect(parts[2]).toMatch(/^[A-Za-z0-9]{9}$/) // random part
    })
  })

  describe('getSecureRandomFloat', () => {
    it('should return value between 0 and 1', () => {
      const samples = Array.from({ length: 10000 }, () => getSecureRandomFloat())

      samples.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      })
    })

    it('should have uniform distribution', () => {
      const samples = Array.from({ length: 100000 }, () => getSecureRandomFloat())
      const buckets = new Array(10).fill(0)

      samples.forEach(value => {
        const bucket = Math.floor(value * 10)
        buckets[bucket]++
      })

      // Each bucket should have roughly 10% of samples
      const expected = samples.length / 10
      const tolerance = expected * 0.05 // 5% tolerance

      buckets.forEach(count => {
        expect(count).toBeGreaterThan(expected - tolerance)
        expect(count).toBeLessThan(expected + tolerance)
      })
    })

    it('should generate different values', () => {
      const values = new Set(Array.from({ length: 1000 }, () => getSecureRandomFloat()))
      // Should have many unique values
      expect(values.size).toBeGreaterThan(990)
    })
  })

  describe('getSecureRandomInt', () => {
    it('should generate integers within range', () => {
      const ranges = [
        { min: 0, max: 10 },
        { min: -10, max: 10 },
        { min: 100, max: 200 },
        { min: 0, max: 256 },
        { min: 0, max: 1000 },
      ]

      ranges.forEach(({ min, max }) => {
        const samples = Array.from({ length: 1000 }, () => getSecureRandomInt(min, max))

        samples.forEach(value => {
          expect(value).toBeGreaterThanOrEqual(min)
          expect(value).toBeLessThan(max)
          expect(Number.isInteger(value)).toBe(true)
        })
      })
    })

    it('should have uniform distribution for small ranges', () => {
      const min = 0
      const max = 10
      const samples = Array.from({ length: 100000 }, () => getSecureRandomInt(min, max))

      const counts = new Map<number, number>()
      samples.forEach(value => counts.set(value, (counts.get(value) || 0) + 1))

      // Each value should appear roughly 10% of the time
      const expected = samples.length / (max - min)
      const tolerance = expected * 0.05 // 5% tolerance

      for (let i = min; i < max; i++) {
        const count = counts.get(i) || 0
        expect(count).toBeGreaterThan(expected - tolerance)
        expect(count).toBeLessThan(expected + tolerance)
      }
    })

    it('should handle edge cases', () => {
      // Single value range
      expect(getSecureRandomInt(5, 6)).toBe(5)

      // Large range
      const largeValue = getSecureRandomInt(0, 1000000)
      expect(largeValue).toBeGreaterThanOrEqual(0)
      expect(largeValue).toBeLessThan(1000000)
    })

    it('should throw on invalid input', () => {
      expect(() => getSecureRandomInt(5, 5)).toThrow('Max must be greater than min')
      expect(() => getSecureRandomInt(10, 5)).toThrow('Max must be greater than min')
      expect(() => getSecureRandomInt(1.5, 10)).toThrow('Arguments must be integers')
      expect(() => getSecureRandomInt(0, 10.5)).toThrow('Arguments must be integers')
    })
  })

  describe('getSecureRandomWithFallback', () => {
    let originalCrypto: Crypto | undefined
    let originalRequire: NodeRequire | undefined

    beforeEach(() => {
      originalCrypto = globalThis.crypto
      originalRequire = globalThis.require
    })

    afterEach(() => {
      globalThis.crypto = originalCrypto as Crypto | undefined
      globalThis.require = originalRequire as NodeRequire | undefined
    })

    it('should use crypto.getRandomValues when available', async () => {
      const mockGetRandomValues = vi.fn((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = i % 256
        }
        return array
      })

      globalThis.crypto = {
        getRandomValues: mockGetRandomValues,
      } as MockCrypto

      const bytes = await getSecureRandomWithFallback(16)

      expect(mockGetRandomValues).toHaveBeenCalled()
      expect(bytes).toHaveLength(16)
    })

    it('should fall back to crypto.randomBytes when getRandomValues fails', async () => {
      globalThis.crypto = {
        getRandomValues: vi.fn(() => {
          throw new Error('Not available')
        }),
      } as MockCrypto

      const mockRandomBytes = vi.fn((length: number) => Buffer.alloc(length, 42))
      globalThis.require = vi.fn(() => ({
        randomBytes: mockRandomBytes,
      })) as MockNodeRequire

      const bytes = await getSecureRandomWithFallback(16)

      expect(mockRandomBytes).toHaveBeenCalledWith(16)
      expect(bytes).toHaveLength(16)
      expect(Array.from(bytes).every(b => b === 42)).toBe(true)
    })

    it('should throw when no secure random is available', async () => {
      globalThis.crypto = undefined as Crypto | undefined
      globalThis.require = undefined as NodeRequire | undefined

      await expect(getSecureRandomWithFallback(16)).rejects.toThrow(
        'No cryptographically secure random number generator available'
      )
    })
  })

  describe('SecureRandomPool', () => {
    it('should generate bytes from pool', () => {
      const pool = new SecureRandomPool(256)

      const bytes1 = pool.getBytes(16)
      const bytes2 = pool.getBytes(16)

      expect(bytes1).toHaveLength(16)
      expect(bytes2).toHaveLength(16)
      expect(bytes1).not.toEqual(bytes2)
    })

    it('should refill pool when exhausted', () => {
      const pool = new SecureRandomPool(32)

      // Exhaust the pool
      const bytes1 = pool.getBytes(20)
      const bytes2 = pool.getBytes(20) // This should trigger refill

      expect(bytes1).toHaveLength(20)
      expect(bytes2).toHaveLength(20)
    })

    it('should handle large requests directly', () => {
      const pool = new SecureRandomPool(256)

      const largeBytes = pool.getBytes(512) // Larger than pool
      expect(largeBytes).toHaveLength(512)
    })

    it('should clear pool securely', () => {
      const pool = new SecureRandomPool(256)

      pool.getBytes(16) // Initialize pool
      pool.clear()

      // After clearing, new bytes should be generated
      const newBytes = pool.getBytes(16)
      expect(newBytes).toHaveLength(16)
    })

    it('should validate pool size', () => {
      expect(() => new SecureRandomPool(8)).toThrow('Pool size must be between')
      expect(() => new SecureRandomPool(100000)).toThrow('Pool size must be between')
    })
  })

  describe('Convenience generators', () => {
    it('should generate properly formatted IDs', () => {
      const requestId = secureRequestId()
      const workerId = secureWorkerId()
      const sessionId = secureSessionId()
      const tokenId = secureTokenId()

      expect(requestId).toMatch(/^req_[0-9a-z]+_[A-Za-z0-9]{9}$/)
      expect(workerId).toMatch(/^worker_[0-9a-z]+_[A-Za-z0-9]{9}$/)
      expect(sessionId).toMatch(/^session_[0-9a-z]+_[A-Za-z0-9]{9}$/)
      expect(tokenId).toMatch(/^token_[0-9a-z]+_[A-Za-z0-9]{9}$/)
    })
  })

  describe('Edge Runtime compatibility', () => {
    it('should work in Edge Runtime environment', () => {
      // Mock Edge Runtime environment
      const originalCrypto = globalThis.crypto
      globalThis.crypto = {
        getRandomValues: vi.fn((arr: Uint8Array) => {
          // Simulate crypto.getRandomValues behavior
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256)
          }
          return arr
        }),
      } as MockCrypto

      const bytes = getSecureRandomBytes(16)
      const str = generateSecureRandomString(32)
      const id = generateSecureId('test')
      const float = getSecureRandomFloat()
      const int = getSecureRandomInt(0, 100)

      expect(globalThis.crypto.getRandomValues).toHaveBeenCalled()
      expect(bytes.length).toBe(16)
      expect(str.length).toBe(32)
      expect(id).toMatch(/^test_/)
      expect(float).toBeGreaterThanOrEqual(0)
      expect(float).toBeLessThan(1)
      expect(int).toBeGreaterThanOrEqual(0)
      expect(int).toBeLessThan(100)

      globalThis.crypto = originalCrypto
    })
  })
})
