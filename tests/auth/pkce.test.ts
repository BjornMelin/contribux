import { describe, expect, it, vi } from 'vitest'
import { generatePKCEChallenge } from '../../src/lib/auth/pkce'

// Mock crypto.getRandomValues
vi.stubGlobal('crypto', {
  getRandomValues: vi.fn(arr => {
    // Fill with predictable values for testing
    if (arr instanceof Uint8Array) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i % 256
      }
    }
    return arr
  }),
  subtle: {
    digest: vi.fn(async (_algorithm, _data) => {
      // Return a mock hash
      const mockHash = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        mockHash[i] = (i * 2) % 256
      }
      return mockHash.buffer
    }),
  },
})

describe('PKCE (Proof Key for Code Exchange)', () => {
  it('should generate code verifier with correct length', async () => {
    const { codeVerifier } = await generatePKCEChallenge()

    // Base64url encoded 32 bytes should be 43 characters (no padding)
    expect(codeVerifier).toHaveLength(43)
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/) // Base64url characters only
  })

  it('should generate code challenge using SHA-256', async () => {
    const { codeChallenge } = await generatePKCEChallenge()

    // Base64url encoded SHA-256 hash (32 bytes) should be 43 characters
    expect(codeChallenge).toHaveLength(43)
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/) // Base64url characters only
  })

  it('should return both verifier and challenge', async () => {
    const result = await generatePKCEChallenge()

    expect(result).toHaveProperty('codeVerifier')
    expect(result).toHaveProperty('codeChallenge')
    expect(typeof result.codeVerifier).toBe('string')
    expect(typeof result.codeChallenge).toBe('string')
  })

  it('should generate different values on each call', async () => {
    // Reset mock to generate different values
    let callCount = 0
    const mockGetRandomValues = vi.fn(arr => {
      if (arr instanceof Uint8Array) {
        // Use callCount to ensure different values on each call
        for (let i = 0; i < arr.length; i++) {
          arr[i] = (i + callCount * 100) % 256
        }
        callCount++
      }
      return arr
    })

    const mockDigest = vi.fn(async (_algorithm, data) => {
      // Generate different hash based on input
      const view = new Uint8Array(data)
      const mockHash = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        mockHash[i] = ((view[0] ?? 0) + i * 2) % 256
      }
      return mockHash.buffer
    })

    vi.stubGlobal('crypto', {
      getRandomValues: mockGetRandomValues,
      subtle: {
        digest: mockDigest,
      },
    })

    const result1 = await generatePKCEChallenge()
    const result2 = await generatePKCEChallenge()

    // Should be called twice
    expect(mockGetRandomValues).toHaveBeenCalledTimes(2)

    // Values should be different
    expect(result1?.codeVerifier).not.toBe(result2?.codeVerifier)
    expect(result1?.codeChallenge).not.toBe(result2?.codeChallenge)
  })

  it('should use crypto.subtle.digest for challenge generation', async () => {
    // Create a fresh mock for this test
    const mockDigest = vi.fn(async (_algorithm, _data) => {
      const mockHash = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        mockHash[i] = (i * 2) % 256
      }
      return mockHash.buffer
    })

    // Override crypto for this test
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn(arr => {
        if (arr instanceof Uint8Array) {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = i % 256
          }
        }
        return arr
      }),
      subtle: {
        digest: mockDigest,
      },
    })

    await generatePKCEChallenge()

    // Should be called with SHA-256 algorithm and some data
    expect(mockDigest).toHaveBeenCalledWith('SHA-256', expect.anything())
    expect(mockDigest).toHaveBeenCalledTimes(1)
  })

  it('should handle base64url encoding correctly', async () => {
    const { codeVerifier, codeChallenge } = await generatePKCEChallenge()

    // Should not contain standard base64 padding
    expect(codeVerifier).not.toContain('=')
    expect(codeChallenge).not.toContain('=')

    // Should not contain standard base64 characters that are replaced in base64url
    expect(codeVerifier).not.toContain('+')
    expect(codeVerifier).not.toContain('/')
    expect(codeChallenge).not.toContain('+')
    expect(codeChallenge).not.toContain('/')
  })

  it('should generate cryptographically secure values', async () => {
    // Ensure crypto.getRandomValues is being used
    const mockGetRandomValues = vi.spyOn(crypto, 'getRandomValues')

    await generatePKCEChallenge()

    expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(mockGetRandomValues).toHaveBeenCalledWith(
      expect.objectContaining({
        length: 32, // Should use 32 bytes for code verifier
      })
    )
  })
})
