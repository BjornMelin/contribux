/**
 * @vitest-environment node
 */

import {
  type EncryptedData,
  decryptToken,
  encryptToken,
  exportKey,
  generateEncryptionKey,
} from '@/lib/auth/crypto'
import { generateAccessToken, verifyAccessToken } from '@/lib/auth/jwt'
import { validateJwtSecret } from '@/lib/validation/env-simplified'
import type { User } from '@/types/auth'
import type { Email, GitHubUsername } from '@/types/base'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, createTestUserSession } from '../../utils/auth-test-factories'

// Mock database for testing
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock environment validation
vi.mock('../../src/lib/validation/env-simplified', async () => {
  const actual = await vi.importActual('../../src/lib/validation/env-simplified')
  return {
    ...actual,
    getJwtSecret: vi.fn(() => 'test-jwt-secret-with-high-entropy-32chars-minimum-requirement'),
    validateJwtSecret: actual.validateJwtSecret, // Include the actual function
  }
})

// Mock config
vi.mock('../../src/lib/config', () => ({
  authConfig: {
    jwt: {
      accessTokenExpiry: 900, // 15 minutes
      refreshTokenExpiry: 604800, // 7 days
    },
  },
  cryptoConfig: {
    algorithm: 'AES-GCM',
    keyLength: 256,
    ivLength: 12,
    tagLength: 16,
  },
}))

describe('Cryptographic Security Validation', () => {
  let mockUser: User
  let mockSession: ReturnType<typeof createTestUserSession>

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = createTestUser({
      email: 'test@example.com' as Email,
      githubUsername: 'testuser' as GitHubUsername,
    })
    mockSession = createTestUserSession({
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
  })

  describe('JWT Security Validation', () => {
    describe('Algorithm Security', () => {
      it('should use HMAC SHA-256 for JWT signing', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')

        // Decode header to verify algorithm
        const headerB64 = token.split('.')[0]
        const header = JSON.parse(Buffer.from(headerB64 ?? '', 'base64url').toString())

        expect(header.alg).toBe('HS256')
        expect(header.typ).toBe('JWT')
      })

      it('should reject tokens with wrong algorithm', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')
        const [_header, payload, signature] = token.split('.')

        // Create malicious header with weak algorithm
        const maliciousHeader = Buffer.from(
          JSON.stringify({
            alg: 'none',
            typ: 'JWT',
          })
        ).toString('base64url')

        const maliciousToken = `${maliciousHeader}.${payload}.${signature}`

        await expect(verifyAccessToken(maliciousToken)).rejects.toThrow('Invalid token')
      })
    })

    describe('Signature Validation', () => {
      it('should detect signature tampering', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')
        const [header, payload] = token.split('.')

        // Create tampered signature
        const tamperedToken = `${header}.${payload}.tampered-signature-123`

        await expect(verifyAccessToken(tamperedToken)).rejects.toThrow('Invalid token')
      })

      it('should detect payload tampering', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')
        const [header, , signature] = token.split('.')

        // Create tampered payload
        const tamperedPayload = Buffer.from(
          JSON.stringify({
            sub: 'attacker-id',
            email: 'attacker@evil.com',
            exp: Math.floor(Date.now() / 1000) + 3600,
          })
        ).toString('base64url')

        const tamperedToken = `${header}.${tamperedPayload}.${signature}`

        await expect(verifyAccessToken(tamperedToken)).rejects.toThrow('Invalid token')
      })
    })

    describe('Claims Validation', () => {
      it('should include all required claims', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')
        const payload = await verifyAccessToken(token)

        // Verify required claims
        expect(payload.sub).toBe(mockUser.id)
        expect(payload.email).toBe(mockUser.email)
        expect(payload.iss).toBe('contribux')
        expect(payload.aud).toEqual(['contribux-api'])
        expect(payload.iat).toBeDefined()
        expect(payload.exp).toBeDefined()
        expect(payload.jti).toBeDefined()

        // Verify timing
        expect(payload.exp).toBeGreaterThan(payload.iat)
        expect(payload.exp - payload.iat).toBe(900) // 15 minutes
      })

      it('should generate unique JTI for replay protection', async () => {
        const tokens = await Promise.all([
          generateAccessToken(mockUser, mockSession, 'oauth'),
          generateAccessToken(mockUser, mockSession, 'oauth'),
          generateAccessToken(mockUser, mockSession, 'oauth'),
        ])

        const payloads = await Promise.all(tokens.map(verifyAccessToken))
        const jtis = payloads.map(p => p.jti)

        // All JTIs should be unique
        expect(new Set(jtis).size).toBe(3)

        // JTIs should be well-formed UUIDs
        for (const jti of jtis) {
          expect(jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        }
      })
    })

    describe('Expiration Security', () => {
      it('should enforce reasonable token expiration', async () => {
        const beforeGeneration = Math.floor(Date.now() / 1000)
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')
        const payload = await verifyAccessToken(token)

        // Access token should expire in exactly 15 minutes
        expect(payload.exp - payload.iat).toBe(900)

        // Should be close to current time + 15 minutes
        const expectedExpiry = beforeGeneration + 900
        expect(payload.exp).toBeGreaterThanOrEqual(expectedExpiry - 5)
        expect(payload.exp).toBeLessThanOrEqual(expectedExpiry + 5)
      })

      it('should prevent excessive token lifetimes', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')
        const payload = await verifyAccessToken(token)

        // Token should not live longer than 30 days (maximum allowed)
        const maxLifetime = 30 * 24 * 60 * 60 // 30 days in seconds
        expect(payload.exp - payload.iat).toBeLessThanOrEqual(maxLifetime)
      })
    })
  })

  describe('AES-256-GCM Encryption Security', () => {
    describe('Key Generation', () => {
      it('should generate 256-bit AES keys', async () => {
        const key = await generateEncryptionKey()

        expect(key.type).toBe('secret')
        expect(key.algorithm.name).toBe('AES-GCM')
        expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
        expect(key.usages).toContain('encrypt')
        expect(key.usages).toContain('decrypt')
      })

      it('should generate cryptographically random keys', async () => {
        const keys = await Promise.all([
          generateEncryptionKey(),
          generateEncryptionKey(),
          generateEncryptionKey(),
        ])

        const exportedKeys = await Promise.all(keys.map(exportKey))
        const keyData = exportedKeys.map(k => k.key)

        // All keys should be different
        expect(new Set(keyData).size).toBe(3)

        // Keys should be proper base64
        for (const data of keyData) {
          expect(data).toMatch(/^[A-Za-z0-9+/=]+$/)

          // 256-bit key = 32 bytes = 44 base64 chars (with padding)
          const decoded = Buffer.from(data, 'base64')
          expect(decoded.length).toBe(32)
        }
      })
    })

    describe('Encryption Operations', () => {
      it('should use AES-256-GCM for authenticated encryption', async () => {
        const key = await generateEncryptionKey()
        const token = 'gho_sensitive_oauth_token_12345'

        const encrypted = await encryptToken(token, key)

        expect(encrypted.algorithm).toBe('AES-GCM')
        expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/)
        expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/=]+$/)
        expect(encrypted.tag).toMatch(/^[A-Za-z0-9+/=]+$/)
        expect(encrypted.keyId).toBeDefined()
      })

      it('should generate unique IVs for each encryption', async () => {
        const key = await generateEncryptionKey()
        const token = 'test-token-for-iv-uniqueness'

        const encryptions = await Promise.all([
          encryptToken(token, key),
          encryptToken(token, key),
          encryptToken(token, key),
          encryptToken(token, key),
          encryptToken(token, key),
        ])

        const ivs = encryptions.map(e => e.iv)

        // All IVs should be unique
        expect(new Set(ivs).size).toBe(5)

        // IVs should be 12 bytes (96 bits) for AES-GCM
        for (const iv of ivs) {
          const decoded = Buffer.from(iv, 'base64')
          expect(decoded.length).toBe(12)
        }
      })

      it('should provide authenticated encryption with integrity protection', async () => {
        const key = await generateEncryptionKey()
        const token = 'sensitive-data-requiring-integrity'

        const encrypted = await encryptToken(token, key)

        // Tamper with ciphertext
        const tamperedCiphertext = {
          ...encrypted,
          ciphertext: `${encrypted.ciphertext.slice(0, -4)}XXXX`,
        }

        await expect(decryptToken(tamperedCiphertext, key)).rejects.toThrow('Decryption failed')

        // Tamper with authentication tag
        const tamperedTag = {
          ...encrypted,
          tag: `${encrypted.tag.slice(0, -4)}YYYY`,
        }

        await expect(decryptToken(tamperedTag, key)).rejects.toThrow('Decryption failed')
      })
    })

    describe('Additional Authenticated Data (AAD)', () => {
      it('should bind encryption to additional context', async () => {
        const key = await generateEncryptionKey()
        const token = 'oauth_token_with_context'
        const additionalData = {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          provider: 'github',
          timestamp: Date.now(),
        }

        const encrypted = await encryptToken(token, key, additionalData)
        const decrypted = await decryptToken(encrypted, key, additionalData)

        expect(decrypted).toBe(token)
      })

      it('should fail with wrong additional authenticated data', async () => {
        const key = await generateEncryptionKey()
        const token = 'context_sensitive_token'
        const originalAAD = { userId: 'user-123', provider: 'github' }
        const wrongAAD = { userId: 'user-456', provider: 'github' }

        const encrypted = await encryptToken(token, key, originalAAD)

        await expect(decryptToken(encrypted, key, wrongAAD)).rejects.toThrow('Decryption failed')
      })
    })
  })

  describe('Secret Quality Validation', () => {
    describe('JWT Secret Requirements', () => {
      it('should enforce minimum 32-character length', () => {
        const shortSecret = 'short-secret-12345'
        expect(shortSecret.length).toBeLessThan(32)

        expect(() => validateJwtSecret(shortSecret)).toThrow(
          'JWT_SECRET must be at least 32 characters long'
        )
      })

      it('should reject weak secrets', () => {
        const weakSecret = 'test_secret_with_weak_patterns_12345678' // Contains 'test' pattern
        expect(weakSecret.length).toBeGreaterThan(32)

        expect(() => validateJwtSecret(weakSecret)).toThrow(
          'JWT_SECRET appears to be a weak or test value'
        )
      })

      it('should reject secrets with low character diversity', () => {
        const lowDiversitySecret = 'aaaaaabbbbbcccccdddddeeeeeffffffffgggg' // Low diversity - only 7 unique chars
        expect(lowDiversitySecret.length).toBeGreaterThan(32)

        // This will fail the unique character check (simplified validation checks < 8 unique chars)
        expect(() => validateJwtSecret(lowDiversitySecret)).toThrow(
          'JWT_SECRET appears to be a weak or test value'
        )
      })

      it('should reject secrets with common weak patterns', () => {
        const secretWithPassword = 'password_based_secret_with_enough_length_32plus' // Contains 'password'
        expect(secretWithPassword.length).toBeGreaterThan(32)

        expect(() => validateJwtSecret(secretWithPassword)).toThrow(
          'JWT_SECRET appears to be a weak or test value'
        )
      })

      it('should require minimum unique characters', () => {
        const limitedCharsetSecret = 'ababababababababababababababababab' // 34 chars, only 2 unique
        expect(limitedCharsetSecret.length).toBeGreaterThan(32)

        const uniqueChars = new Set(limitedCharsetSecret).size
        expect(uniqueChars).toBeLessThan(8) // This will fail the simplified validation unique char requirement

        expect(() => validateJwtSecret(limitedCharsetSecret)).toThrow(
          'JWT_SECRET appears to be a weak or test value'
        )
      })

      it('should accept high-quality secrets', () => {
        const goodSecrets = [
          'Kx9#mP2$vL8@nR5&wQ1!zF3%bC7*dG4^eH6+iJ',
          'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
          'ComplexRandom2024WithMixedCasing123!@#',
          // Note: removed secrets with 'test' or 'secret' patterns as they would be rejected by simplified validation
        ]

        for (const secret of goodSecrets) {
          expect(secret.length).toBeGreaterThanOrEqual(32)
          expect(() => validateJwtSecret(secret)).not.toThrow()

          // Verify unique characters (simplified validation requirement)
          const uniqueChars = new Set(secret).size
          expect(uniqueChars).toBeGreaterThanOrEqual(8) // Must have at least 8 unique chars for simplified validation
        }
      })
    })

    describe('Encryption Key Requirements', () => {
      it('should enforce 256-bit encryption keys', async () => {
        const key = await generateEncryptionKey()
        const exported = await exportKey(key)

        expect(exported.keyLength).toBe(256)
        expect(exported.algorithm).toBe('AES-GCM')

        // 256 bits = 32 bytes
        const keyBytes = Buffer.from(exported.key, 'base64')
        expect(keyBytes.length).toBe(32)
      })

      it('should generate cryptographically random keys', async () => {
        const keys = await Promise.all(Array.from({ length: 10 }, () => generateEncryptionKey()))
        const exportedKeys = await Promise.all(keys.map(exportKey))

        const keyHashes = exportedKeys.map(k => {
          const bytes = Buffer.from(k.key, 'base64')
          return bytes.toString('hex')
        })

        // All keys should be unique
        expect(new Set(keyHashes).size).toBe(10)

        // Keys should have good distribution (no obvious patterns)
        for (const keyHex of keyHashes) {
          // Check for basic randomness - no repeated 4-byte sequences
          const chunks = keyHex.match(/.{8}/g) || []
          const uniqueChunks = new Set(chunks)
          expect(uniqueChunks.size).toBeGreaterThan(chunks.length * 0.7) // At least 70% unique chunks
        }
      })
    })
  })

  describe('Performance and Security Benchmarks', () => {
    describe('JWT Operations Performance', () => {
      it('should generate JWT tokens efficiently', async () => {
        const startTime = performance.now()

        const tokens = await Promise.all(
          Array.from({ length: 100 }, () => generateAccessToken(mockUser, mockSession, 'oauth'))
        )

        const endTime = performance.now()
        const totalTime = endTime - startTime
        const avgTime = totalTime / 100

        expect(tokens).toHaveLength(100)
        expect(avgTime).toBeLessThan(10) // < 10ms per token

        // Verify all tokens are valid
        const verifications = await Promise.all(tokens.map(verifyAccessToken))
        expect(verifications).toHaveLength(100)
      })

      it('should verify JWT tokens efficiently', async () => {
        const tokens = await Promise.all(
          Array.from({ length: 50 }, () => generateAccessToken(mockUser, mockSession, 'oauth'))
        )

        const startTime = performance.now()

        const payloads = await Promise.all(tokens.map(verifyAccessToken))

        const endTime = performance.now()
        const totalTime = endTime - startTime
        const avgTime = totalTime / 50

        expect(payloads).toHaveLength(50)
        expect(avgTime).toBeLessThan(5) // < 5ms per verification
      })
    })

    describe('Encryption Performance', () => {
      it('should encrypt OAuth tokens efficiently', async () => {
        const key = await generateEncryptionKey()
        const tokens = Array.from(
          { length: 50 },
          (_, i) => `gho_oauth_token_${i}_${'x'.repeat(30)}`
        )

        const startTime = performance.now()

        const encrypted = await Promise.all(
          tokens.map(token =>
            encryptToken(token, key, {
              userId: '123e4567-e89b-12d3-a456-426614174000',
              provider: 'github',
            })
          )
        )

        const endTime = performance.now()
        const totalTime = endTime - startTime
        const avgTime = totalTime / 50

        expect(encrypted).toHaveLength(50)
        expect(avgTime).toBeLessThan(20) // < 20ms per encryption
      })

      it('should decrypt OAuth tokens efficiently', async () => {
        const key = await generateEncryptionKey()
        const tokens = Array.from({ length: 50 }, (_, i) => `token_${i}`)
        const aad = { userId: '123', provider: 'github' }

        const encrypted = await Promise.all(tokens.map(token => encryptToken(token, key, aad)))

        const startTime = performance.now()

        const decrypted = await Promise.all(encrypted.map(enc => decryptToken(enc, key, aad)))

        const endTime = performance.now()
        const totalTime = endTime - startTime
        const avgTime = totalTime / 50

        expect(decrypted).toEqual(tokens)
        expect(avgTime).toBeLessThan(15) // < 15ms per decryption
      })
    })

    describe('Key Generation Performance', () => {
      it('should generate encryption keys efficiently', async () => {
        const startTime = performance.now()

        const keys = await Promise.all(Array.from({ length: 10 }, () => generateEncryptionKey()))

        const endTime = performance.now()
        const totalTime = endTime - startTime
        const avgTime = totalTime / 10

        expect(keys).toHaveLength(10)
        expect(avgTime).toBeLessThan(50) // < 50ms per key generation

        // Verify all keys are valid
        for (const key of keys) {
          expect(key.type).toBe('secret')
          expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
        }
      })
    })
  })

  describe('Security Edge Cases', () => {
    describe('Error Handling Security', () => {
      it('should handle invalid inputs securely', async () => {
        // Invalid JWT tokens
        const invalidTokens = [
          '',
          'invalid',
          'not.a.jwt',
          'header.payload', // Missing signature
          '.payload.signature', // Missing header
          'header..signature', // Missing payload
        ]

        for (const invalidToken of invalidTokens) {
          await expect(verifyAccessToken(invalidToken)).rejects.toThrow()
        }
      })

      it('should handle encryption errors securely', async () => {
        const key = await generateEncryptionKey()

        // Invalid inputs should throw appropriate errors
        await expect(encryptToken('', key)).rejects.toThrow()

        const invalidEncrypted: EncryptedData = {
          ciphertext: 'invalid-base64!@#',
          iv: 'invalid',
          tag: 'invalid',
          algorithm: 'AES-GCM',
          keyId: 'test',
        }

        await expect(decryptToken(invalidEncrypted, key)).rejects.toThrow()
      })
    })

    describe('Timing Attack Resistance', () => {
      it('should have consistent timing for different error types', async () => {
        const validToken = await generateAccessToken(mockUser, mockSession, 'oauth')
        const invalidTokens = [
          'completely.invalid.token',
          `${validToken.slice(0, -5)}XXXXX`, // Tampered signature
          validToken.replace(/[A-Za-z]/g, 'X'), // Completely different but same structure
        ]

        // Measure timing for each verification attempt
        const timings: number[] = []

        for (const token of invalidTokens) {
          const start = performance.now()

          try {
            await verifyAccessToken(token)
          } catch {
            // Expected to fail
          }

          const end = performance.now()
          timings.push(end - start)
        }

        // Timing should be relatively consistent (within 50% variance)
        const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length

        for (const timing of timings) {
          expect(timing).toBeGreaterThan(avgTiming * 0.5)
          expect(timing).toBeLessThan(avgTiming * 1.5)
        }
      })
    })

    describe('Memory Safety', () => {
      it('should handle large token operations without memory issues', async () => {
        const key = await generateEncryptionKey()
        const largeToken = 'x'.repeat(100000) // 100KB token

        const encrypted = await encryptToken(largeToken, key)
        const decrypted = await decryptToken(encrypted, key)

        expect(decrypted).toBe(largeToken)
        expect(encrypted.ciphertext.length).toBeGreaterThan(0)
      })

      it('should handle concurrent operations safely', async () => {
        const key = await generateEncryptionKey()
        const tokens = Array.from({ length: 100 }, (_, i) => `concurrent_token_${i}`)

        // Encrypt all tokens concurrently
        const encrypted = await Promise.all(tokens.map(token => encryptToken(token, key)))

        // Decrypt all tokens concurrently
        const decrypted = await Promise.all(encrypted.map(enc => decryptToken(enc, key)))

        expect(decrypted).toEqual(tokens)

        // Verify all IVs are unique
        const ivs = encrypted.map(e => e.iv)
        expect(new Set(ivs).size).toBe(100)
      })
    })
  })

  describe('Standards Compliance', () => {
    describe('JWT Standards (RFC 7519)', () => {
      it('should follow JWT structure standards', async () => {
        const token = await generateAccessToken(mockUser, mockSession, 'oauth')

        // JWT should have exactly 3 parts separated by dots
        const parts = token.split('.')
        expect(parts).toHaveLength(3)

        // Each part should be valid base64url
        for (const part of parts) {
          expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
        }

        // Header should be valid JSON
        const header = JSON.parse(Buffer.from(parts[0] ?? '', 'base64url').toString())
        expect(header.alg).toBe('HS256')
        expect(header.typ).toBe('JWT')

        // Payload should be valid JSON with required claims
        const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString())
        expect(payload.iss).toBe('contribux')
        expect(payload.aud).toEqual(['contribux-api'])
        expect(payload.sub).toBeDefined()
        expect(payload.exp).toBeDefined()
        expect(payload.iat).toBeDefined()
      })
    })

    describe('AES-GCM Standards', () => {
      it('should follow AES-GCM encryption standards', async () => {
        const key = await generateEncryptionKey()
        const token = 'test-token-for-standards-compliance'

        const encrypted = await encryptToken(token, key)

        // IV should be 96 bits (12 bytes) for AES-GCM
        const ivBytes = Buffer.from(encrypted.iv, 'base64')
        expect(ivBytes.length).toBe(12)

        // Authentication tag should be 128 bits (16 bytes)
        const tagBytes = Buffer.from(encrypted.tag, 'base64')
        expect(tagBytes.length).toBe(16)

        // Algorithm should be properly specified
        expect(encrypted.algorithm).toBe('AES-GCM')
      })
    })
  })
})
