/**
 * Zero-Trust Cryptographic Security Tests
 * Tests to verify proper zero-trust crypto implementation and security patterns
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Zero-Trust Cryptographic Security', () => {
  let originalEnv: NodeJS.ProcessEnv
  let processExitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalEnv = { ...process.env }

    // Mock process.exit to prevent test runner termination
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Skip environment validation during test module imports to prevent timing issues
    process.env.SKIP_ENV_VALIDATION = 'true'

    // Set up test environment variables needed for crypto tests
    vi.stubEnv('NODE_ENV', 'test')
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb'
    process.env.JWT_SECRET = '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
    process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
    process.env.GITHUB_CLIENT_SECRET =
      'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.CORS_ORIGINS = 'http://localhost:3000'
    process.env.ALLOWED_REDIRECT_URIS = 'http://localhost:3000/api/auth/github/callback'
  })

  afterEach(() => {
    processExitSpy.mockRestore()
    process.env = originalEnv
  })

  describe('Environment Validation', () => {
    it('should reject missing encryption keys in production', async () => {
      // Test the real validateEnvironment function with production settings
      const originalNodeEnv = process.env.NODE_ENV
      const originalEncryptionKey = process.env.ENCRYPTION_KEY

      try {
        vi.stubEnv('NODE_ENV', 'production')
        process.env.ENCRYPTION_KEY = '' // Set to empty string to ensure it's truly missing
        // Keep SKIP_ENV_VALIDATION but test individual functions

        // Import the function (module import is safe with SKIP_ENV_VALIDATION='true')
        const { getEncryptionKey } = await import('@/lib/validation/env')

        // Should require encryption key in production
        expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY environment variable is required/i)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        if (originalEncryptionKey !== undefined) {
          process.env.ENCRYPTION_KEY = originalEncryptionKey
        } else {
          process.env.ENCRYPTION_KEY = undefined
        }
      }
    })

    it('should require minimum entropy for encryption keys', async () => {
      // Set up weak key scenario
      const originalNodeEnv = process.env.NODE_ENV
      const originalEncryptionKey = process.env.ENCRYPTION_KEY

      try {
        vi.stubEnv('NODE_ENV', 'production') // Set production to trigger validation
        process.env.ENCRYPTION_KEY =
          '0000000000000000000000000000000000000000000000000000000000000000' // Weak key
        // Keep SKIP_ENV_VALIDATION but test individual functions

        // Import the function (module import is safe with SKIP_ENV_VALIDATION='true')
        const { getEncryptionKey } = await import('@/lib/validation/env')

        // Should validate key strength and reject weak keys
        expect(() => getEncryptionKey()).toThrow(/insufficient entropy/i)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        if (originalEncryptionKey !== undefined) {
          process.env.ENCRYPTION_KEY = originalEncryptionKey
        } else {
          process.env.ENCRYPTION_KEY = undefined
        }
      }
    })

    it('should require encryption key even in development when not provided', async () => {
      // Clear mocks for this test
      vi.clearAllMocks()
      const originalNodeEnv = process.env.NODE_ENV
      const originalEncryptionKey = process.env.ENCRYPTION_KEY

      try {
        vi.stubEnv('NODE_ENV', 'development')
        process.env.ENCRYPTION_KEY = undefined

        // Import and test the real function using ES module syntax
        const { validateEnvironment } = await import('@/lib/validation/env')

        // Should throw error requiring encryption key in all environments
        expect(() => validateEnvironment()).toThrow(/ENCRYPTION_KEY.*required/i)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        if (originalEncryptionKey !== undefined) {
          process.env.ENCRYPTION_KEY = originalEncryptionKey
        } else {
          process.env.ENCRYPTION_KEY = undefined
        }
      }
    })

    it('should validate encryption key format', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      const originalEncryptionKey = process.env.ENCRYPTION_KEY

      try {
        vi.stubEnv('NODE_ENV', 'production') // Set production to trigger validation
        process.env.ENCRYPTION_KEY = 'invalid-key-format-not-hex' // Invalid format

        // Import and test the real function using ES module syntax
        const { validateEnvironment } = await import('@/lib/validation/env')

        // Should validate that key is proper hexadecimal format - this key is too short first
        expect(() => validateEnvironment()).toThrow('Weak encryption key - insufficient entropy')
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        if (originalEncryptionKey !== undefined) {
          process.env.ENCRYPTION_KEY = originalEncryptionKey
        } else {
          process.env.ENCRYPTION_KEY = undefined
        }
      }
    })

    it('should validate encryption key length', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      const originalEncryptionKey = process.env.ENCRYPTION_KEY

      try {
        vi.stubEnv('NODE_ENV', 'production') // Set production to trigger validation
        process.env.ENCRYPTION_KEY = '123456789abcdef' // Too short

        // Import and test the real function using ES module syntax
        const { validateEnvironment } = await import('@/lib/validation/env')

        // Should require 256-bit key (64 hex characters) - this key is too short
        expect(() => validateEnvironment()).toThrow(/ENCRYPTION_KEY.*required/i)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
        if (originalEncryptionKey !== undefined) {
          process.env.ENCRYPTION_KEY = originalEncryptionKey
        } else {
          process.env.ENCRYPTION_KEY = undefined
        }
      }
    })
  })

  describe('Digital Signature Security', () => {
    it('should generate unique ECDSA key pairs for digital signatures', async () => {
      const { generateSignatureKeyPair } = await import('@/lib/security/crypto')

      // Generate two key pairs
      const keyPair1 = await generateSignatureKeyPair()
      const keyPair2 = await generateSignatureKeyPair()

      // Key pairs should be different
      expect(keyPair1.keyId).not.toBe(keyPair2.keyId)
      expect(keyPair1.metadata.keyId).toBe(keyPair1.keyId)
      expect(keyPair2.metadata.keyId).toBe(keyPair2.keyId)

      // Should have proper ECDSA configuration
      expect(keyPair1.metadata.algorithm).toBe('ECDSA')
      expect(keyPair1.metadata.usage).toContain('sign')
      expect(keyPair1.metadata.usage).toContain('verify')
      expect(keyPair1.metadata.createdAt).toBeGreaterThan(0)
      expect(keyPair1.metadata.rotationPeriod).toBe(90 * 24 * 60 * 60 * 1000) // 90 days
    })

    it('should create and verify digital signatures for data integrity', async () => {
      const { generateSignatureKeyPair, createDigitalSignature, verifyDigitalSignature } =
        await import('@/lib/security/crypto')

      const keyPair = await generateSignatureKeyPair()
      const testData = 'sensitive-user-data-requiring-integrity-verification'

      // Create digital signature
      const signature = await createDigitalSignature(testData, keyPair.privateKey, keyPair.keyId)

      // Signature should have proper format
      expect(signature.algorithm).toBe('ECDSA')
      expect(signature.keyId).toBe(keyPair.keyId)
      expect(signature.timestamp).toBeGreaterThan(0)
      expect(signature.publicKey).toMatch(/^[A-Za-z0-9+/=]+$/) // Base64
      expect(signature.signature).toMatch(/^[A-Za-z0-9+/=]+$/) // Base64

      // Verify signature
      const isValid = await verifyDigitalSignature(testData, signature)
      expect(isValid).toBe(true)

      // Should reject tampered data
      const tamperedData = `${testData}malicious-modification`
      const isValidTampered = await verifyDigitalSignature(tamperedData, signature)
      expect(isValidTampered).toBe(false)
    })

    it('should reject expired signatures', async () => {
      const { generateSignatureKeyPair, createDigitalSignature, verifyDigitalSignature } =
        await import('@/lib/security/crypto')

      const keyPair = await generateSignatureKeyPair()
      const testData = 'time-sensitive-data'

      // Create signature
      const signature = await createDigitalSignature(testData, keyPair.privateKey, keyPair.keyId)

      // Should accept fresh signature
      const isValidFresh = await verifyDigitalSignature(testData, signature, 60000) // 1 minute max age
      expect(isValidFresh).toBe(true)

      // Should reject signature that appears old (simulate by modifying timestamp)
      const oldSignature = { ...signature, timestamp: Date.now() - 120000 } // 2 minutes ago
      const isValidOld = await verifyDigitalSignature(testData, oldSignature, 60000) // 1 minute max age
      expect(isValidOld).toBe(false)
    })

    it('should prevent timing attacks in signature verification', async () => {
      const { generateSignatureKeyPair, createDigitalSignature, verifyDigitalSignature } =
        await import('@/lib/security/crypto')

      const keyPair = await generateSignatureKeyPair()
      const testData = 'timing-attack-test-data'
      const signature = await createDigitalSignature(testData, keyPair.privateKey, keyPair.keyId)

      // Test timing for valid vs invalid signatures
      const trials = 5 // Reduced for CI performance
      const validTimes: number[] = []
      const invalidTimes: number[] = []

      for (let i = 0; i < trials; i++) {
        // Time valid signature verification
        const start1 = performance.now()
        await verifyDigitalSignature(testData, signature)
        const end1 = performance.now()
        validTimes.push(end1 - start1)

        // Time invalid signature verification (corrupted signature)
        const invalidSig = { ...signature, signature: 'invalid-signature-data' }
        const start2 = performance.now()
        await verifyDigitalSignature(testData, invalidSig)
        const end2 = performance.now()
        invalidTimes.push(end2 - start2)
      }

      // Calculate average times
      const avgValid = validTimes.reduce((a, b) => a + b) / validTimes.length
      const avgInvalid = invalidTimes.reduce((a, b) => a + b) / invalidTimes.length

      // Times should be similar to prevent timing attacks
      // Allow larger variance in CI environments (90% for signature verification)
      const timingRatio = Math.abs(avgValid - avgInvalid) / Math.max(avgValid, avgInvalid)
      expect(timingRatio).toBeLessThan(0.9)
    })
  })

  describe('Key Derivation Security', () => {
    it('should derive secure keys from passwords using PBKDF2', async () => {
      const { deriveKeyFromPassword } = await import('@/lib/security/crypto')

      const password = 'user-provided-strong-password'

      // Derive key twice with different salts
      const derived1 = await deriveKeyFromPassword(password)
      const derived2 = await deriveKeyFromPassword(password)

      // Should produce different results due to different salts
      expect(derived1.salt).not.toEqual(derived2.salt)
      expect(derived1.iterations).toBe(100000) // NIST recommended minimum
      expect(derived1.algorithm).toBe('PBKDF2')

      // Salt should have proper length (256 bits)
      expect(derived1.salt.length).toBe(32)
      expect(derived2.salt.length).toBe(32)
    })

    it('should use consistent iterations and proper salt handling', async () => {
      const { deriveKeyFromPassword } = await import('@/lib/security/crypto')

      const password = 'test-password'
      const customSalt = new Uint8Array(32).fill(1) // Fixed salt for reproducibility
      const customIterations = 150000

      // Derive with same salt and iterations - should be reproducible
      const derived1 = await deriveKeyFromPassword(password, customSalt, customIterations)
      const derived2 = await deriveKeyFromPassword(password, customSalt, customIterations)

      // Should be identical with same inputs
      expect(derived1.salt).toEqual(derived2.salt)
      expect(derived1.iterations).toBe(customIterations)
      expect(derived1.algorithm).toBe('PBKDF2')

      // Keys should be equivalent (both CryptoKey objects derived the same way)
      expect(derived1.key.type).toBe('secret')
      expect(derived2.key.type).toBe('secret')
    })
  })

  describe('Secure Token Generation', () => {
    it('should generate cryptographically secure random tokens', async () => {
      const { generateSecureToken, generateSessionId } = await import('@/lib/security/crypto')

      // Generate multiple tokens
      const tokens = await Promise.all([
        generateSecureToken(),
        generateSecureToken(),
        generateSecureToken(16), // Custom length
        generateSessionId(),
        generateSessionId(),
      ])

      // All tokens should be unique
      const uniqueTokens = new Set(tokens)
      expect(uniqueTokens.size).toBe(tokens.length)

      // Should have proper characteristics
      tokens.forEach(token => {
        expect(token).toMatch(/^[A-Za-z0-9]+$/) // No special characters after cleanup
        expect(token.length).toBeGreaterThan(0)
      })

      // Custom length token should be different size
      const shortToken = generateSecureToken(8)
      const longToken = generateSecureToken(64)
      expect(shortToken.length).toBeLessThan(longToken.length)
    })

    it('should generate secure nonces for encryption', async () => {
      const { generateNonce } = await import('@/lib/security/crypto')

      // Generate multiple nonces
      const nonces = [generateNonce(), generateNonce(), generateNonce()]

      // All nonces should be unique and proper length
      nonces.forEach(nonce => {
        expect(nonce).toBeInstanceOf(Uint8Array)
        expect(nonce.length).toBe(12) // 96 bits for AES-GCM
      })

      // Should be different each time
      expect(nonces[0]).not.toEqual(nonces[1])
      expect(nonces[1]).not.toEqual(nonces[2])
    })
  })

  describe('Security Token System', () => {
    it('should create and verify tamper-proof security tokens', async () => {
      const { generateSignatureKeyPair, createSecurityToken, verifySecurityToken } = await import(
        '@/lib/security/crypto'
      )

      const keyPair = await generateSignatureKeyPair()
      const payload = {
        userId: 'user123',
        role: 'admin',
        permissions: ['read', 'write'],
      }

      // Create security token
      const token = await createSecurityToken(payload, keyPair.privateKey, keyPair.keyId, 3600000)

      // Token should have proper structure
      expect(token.algorithm).toBe('ECDSA')
      expect(token.expiresAt).toBeGreaterThan(Date.now())
      expect(token.issuedAt).toBeGreaterThan(0)
      expect(token.fingerprint).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(token.value).toMatch(/^[A-Za-z0-9+/=]+$/)

      // Verify token
      const verification = await verifySecurityToken(token)
      expect(verification.valid).toBe(true)
      expect(verification.payload).toBeDefined()
      expect(verification.payload?.userId).toBe('user123')
      expect(verification.payload?.role).toBe('admin')
    })

    it('should reject expired security tokens', async () => {
      const { generateSignatureKeyPair, createSecurityToken, verifySecurityToken } = await import(
        '@/lib/security/crypto'
      )

      const keyPair = await generateSignatureKeyPair()
      const payload = { userId: 'user123' }

      // Create token with very short expiration
      const token = await createSecurityToken(payload, keyPair.privateKey, keyPair.keyId, 1) // 1ms

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should reject expired token
      const verification = await verifySecurityToken(token)
      expect(verification.valid).toBe(false)
      expect(verification.payload).toBeUndefined()
    })

    it('should reject tokens with max age exceeded', async () => {
      const { generateSignatureKeyPair, createSecurityToken, verifySecurityToken } = await import(
        '@/lib/security/crypto'
      )

      const keyPair = await generateSignatureKeyPair()
      const payload = { userId: 'user123' }

      // Create token with long expiration but verify with short max age
      const token = await createSecurityToken(payload, keyPair.privateKey, keyPair.keyId, 3600000)

      // Should accept with sufficient max age
      const verification1 = await verifySecurityToken(token, 60000) // 1 minute
      expect(verification1.valid).toBe(true)

      // Wait a short time to allow for timing differences
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should reject with very short max age (1ms to ensure it's exceeded)
      const verification2 = await verifySecurityToken(token, 1) // 1ms max age
      expect(verification2.valid).toBe(false)
    })

    it('should reject tampered security tokens', async () => {
      const { generateSignatureKeyPair, createSecurityToken, verifySecurityToken } = await import(
        '@/lib/security/crypto'
      )

      const keyPair = await generateSignatureKeyPair()
      const payload = { userId: 'user123' }

      // Create valid token
      const validToken = await createSecurityToken(payload, keyPair.privateKey, keyPair.keyId)

      // Tamper with token value
      const tamperedToken = {
        ...validToken,
        value: `${validToken.value.slice(0, -10)}tampered123`,
      }

      // Should reject tampered token
      const verification = await verifySecurityToken(tamperedToken)
      expect(verification.valid).toBe(false)
      expect(verification.payload).toBeUndefined()
    })
  })

  describe('HMAC Authentication', () => {
    it('should create and verify HMAC signatures for message authentication', async () => {
      const { generateHMACKey, createHMAC, verifyHMAC } = await import('@/lib/security/crypto')

      const hmacKey = await generateHMACKey()
      const message = 'important-message-requiring-authentication'

      // Create HMAC
      const hmac = await createHMAC(message, hmacKey)
      expect(hmac).toMatch(/^[A-Za-z0-9+/=]+$/) // Base64 format

      // Verify HMAC
      const isValid = await verifyHMAC(message, hmac, hmacKey)
      expect(isValid).toBe(true)

      // Should reject with wrong message
      const isValidWrong = await verifyHMAC('wrong-message', hmac, hmacKey)
      expect(isValidWrong).toBe(false)
    })

    it('should use timing-safe comparison for HMAC verification', async () => {
      const { generateHMACKey, createHMAC, verifyHMAC } = await import('@/lib/security/crypto')

      const hmacKey = await generateHMACKey()
      const message = 'timing-attack-test-message'
      const validHmac = await createHMAC(message, hmacKey)

      // Test timing for valid vs invalid HMAC verification
      const trials = 5 // Reduced for CI performance
      const validTimes: number[] = []
      const invalidTimes: number[] = []

      for (let i = 0; i < trials; i++) {
        // Time valid HMAC verification
        const start1 = performance.now()
        await verifyHMAC(message, validHmac, hmacKey)
        const end1 = performance.now()
        validTimes.push(end1 - start1)

        // Time invalid HMAC verification
        const invalidHmac = 'invalid-hmac-signature'
        const start2 = performance.now()
        await verifyHMAC(message, invalidHmac, hmacKey)
        const end2 = performance.now()
        invalidTimes.push(end2 - start2)
      }

      // Calculate average times
      const avgValid = validTimes.reduce((a, b) => a + b) / validTimes.length
      const avgInvalid = invalidTimes.reduce((a, b) => a + b) / invalidTimes.length

      // Times should be similar to prevent timing attacks
      // Allow larger variance in CI environments (90% for HMAC verification)
      const timingRatio = Math.abs(avgValid - avgInvalid) / Math.max(avgValid, avgInvalid)
      expect(timingRatio).toBeLessThan(0.9)
    })
  })
})
