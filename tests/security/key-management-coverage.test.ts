/**
 * Comprehensive Test Coverage for Key Management Functions
 *
 * Tests all key management and security validation functions to ensure 100% coverage
 * on critical security code paths without environment validation side effects.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Key Management Security - Complete Coverage Analysis', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    vi.resetModules()

    // Mock process.exit to prevent test termination
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Set up complete test environment to avoid validation failures
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/testdb')
    // Use JWT secret with true random-like pattern to pass Shannon entropy calculation
    // Each character different to maximize entropy (Shannon entropy needs ~3.5+ bits per char)
    vi.stubEnv(
      'JWT_SECRET',
      'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6A7B8C9D0E1F2G3H4I5J6K7L8M9N0'
    )
    vi.stubEnv('ENCRYPTION_KEY', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
    vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.test1234567890ab')
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret-with-sufficient-length-for-testing')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000')
    vi.stubEnv('ALLOWED_REDIRECT_URIS', 'http://localhost:3000/callback')
    vi.stubEnv('ENABLE_OAUTH', 'false')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = originalEnv
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe('Shannon Entropy Calculation - Complete Coverage', () => {
    it('should calculate zero entropy for identical characters', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const result = calculateShannonEntropy('aaaaaaa')
      expect(result).toBe(0)
    })

    it('should calculate maximum entropy for uniform distribution', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const result = calculateShannonEntropy('abcdefgh')
      expect(result).toBeCloseTo(3, 1) // log2(8) = 3
    })

    it('should handle empty string', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const result = calculateShannonEntropy('')
      expect(result).toBe(0)
    })

    it('should handle single character', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      const result = calculateShannonEntropy('a')
      expect(result).toBe(0)
    })

    it('should calculate entropy for mixed character distributions', async () => {
      const { calculateShannonEntropy } = await import('@/lib/validation/env')

      // Test string with some repeated characters
      const result = calculateShannonEntropy('aabbccdd')
      expect(result).toBeCloseTo(2, 1) // log2(4) = 2
    })
  })

  describe('JWT Secret Validation - All Error Paths', () => {
    it('should reject secrets shorter than 32 characters', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      expect(() => validateJwtSecret('tooshort')).toThrow(/at least 32 characters/)
      expect(() => validateJwtSecret('31characters12345678901234567')).toThrow(
        /at least 32 characters/
      )
      expect(() => validateJwtSecret('')).toThrow(/at least 32 characters/)
    })

    it('should reject secrets with insufficient entropy per character', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // 32+ chars but low entropy (all same character)
      const lowEntropySecret = 'a'.repeat(32)
      expect(() => validateJwtSecret(lowEntropySecret)).toThrow(/insufficient entropy/)
    })

    it('should reject secrets with insufficient unique characters', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // Only 11 unique characters (< 12 required)
      const secret = `abcdefghijk${'a'.repeat(25)}` // 36 chars total, 11 unique
      expect(() => validateJwtSecret(secret)).toThrow(/insufficient entropy/)
    })

    it('should reject secrets with low unique character ratio', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      // 20 unique chars but low ratio (20/100 = 0.2 < 0.3)
      const secret = `abcdefghijklmnopqrst${'a'.repeat(80)}` // 100 chars, 20 unique, ratio 0.2
      expect(() => validateJwtSecret(secret)).toThrow(/insufficient entropy/)
    })

    it('should accept secrets meeting all criteria', async () => {
      const { validateJwtSecret } = await import('@/lib/validation/env')

      const strongSecret =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-='
      expect(() => validateJwtSecret(strongSecret)).not.toThrow()
      expect(validateJwtSecret(strongSecret)).toBe(true)
    })
  })

  describe('Environment-Specific Validation Functions - Complete Coverage', () => {
    it('should skip development validation when not in development', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const { validateDevelopmentEnv } = await import('@/lib/validation/env')

      // Should not throw or do anything when not in development
      expect(() => validateDevelopmentEnv()).not.toThrow()
    })

    it('should run development validation when in development', async () => {
      vi.stubEnv('NODE_ENV', 'development')

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { validateDevelopmentEnv } = await import('@/lib/validation/env')
      validateDevelopmentEnv()

      expect(consoleSpy).toHaveBeenCalledWith('✓ Development environment validation passed')
      consoleSpy.mockRestore()
    })

    it('should skip production validation when not in production', async () => {
      vi.stubEnv('NODE_ENV', 'development')

      const { validateProductionEnv } = await import('@/lib/validation/env')

      // Should not throw or do anything when not in production
      expect(() => validateProductionEnv()).not.toThrow()
    })

    it('should validate required variables in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.test1234567890ab')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret-with-sufficient-length-for-testing')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      )

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { validateProductionEnv } = await import('@/lib/validation/env')
      validateProductionEnv()

      expect(consoleSpy).toHaveBeenCalledWith('✓ Production environment validation passed')
      consoleSpy.mockRestore()
    })

    it('should throw when required production variables are missing', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      // Don't set required variables

      const { validateProductionEnv } = await import('@/lib/validation/env')

      expect(() => validateProductionEnv()).toThrow(
        /Missing required production environment variables/
      )
    })
  })

  describe('Security Configuration Validation - All Branches', () => {
    it('should validate JWT secret in non-test environments - success path', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
      vi.stubEnv('ENABLE_OAUTH', 'false')

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { validateSecurityConfig } = await import('@/lib/validation/env')
      validateSecurityConfig()

      expect(consoleSpy).toHaveBeenCalledWith('✓ JWT_SECRET validation passed')
      consoleSpy.mockRestore()
    })

    it('should handle JWT secret validation failure in development', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('JWT_SECRET', 'weak')
      vi.stubEnv('ENABLE_OAUTH', 'false')

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { validateSecurityConfig } = await import('@/lib/validation/env')
      validateSecurityConfig() // Should not throw in development

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '✗ JWT_SECRET validation failed:',
        'JWT_SECRET must be at least 32 characters long (256 bits)'
      )
      consoleErrorSpy.mockRestore()
    })

    it('should throw JWT secret validation failure in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('JWT_SECRET', 'weak')
      vi.stubEnv('ENABLE_OAUTH', 'false')

      const { validateSecurityConfig } = await import('@/lib/validation/env')

      expect(() => validateSecurityConfig()).toThrow(/JWT_SECRET must be at least 32 characters/)
    })

    it('should skip JWT secret validation in test environment', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('JWT_SECRET', 'weak') // Would normally fail
      vi.stubEnv('ENABLE_OAUTH', 'false')

      const { validateSecurityConfig } = await import('@/lib/validation/env')

      // Should not throw or validate JWT secret in test
      expect(() => validateSecurityConfig()).not.toThrow()
    })

    it('should warn about missing GitHub OAuth in non-production when enabled', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
      vi.stubEnv('ENABLE_OAUTH', 'true')
      // Don't set OAuth credentials

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { validateSecurityConfig } = await import('@/lib/validation/env')
      validateSecurityConfig()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠ OAuth configuration issues: GitHub OAuth credentials missing')
      )
      consoleWarnSpy.mockRestore()
    })

    it('should throw for missing OAuth in production when enabled', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
      vi.stubEnv('ENABLE_OAUTH', 'true')
      // Don't set OAuth credentials

      const { validateSecurityConfig } = await import('@/lib/validation/env')

      expect(() => validateSecurityConfig()).toThrow(
        /OAuth configuration issues: GitHub OAuth credentials missing/
      )
    })

    it('should validate incomplete Google OAuth configuration', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
      vi.stubEnv('ENABLE_OAUTH', 'true')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.test1234567890ab')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret-with-sufficient-length')
      vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-id')
      // Missing GOOGLE_CLIENT_SECRET

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { validateSecurityConfig } = await import('@/lib/validation/env')
      validateSecurityConfig()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Incomplete Google OAuth configuration')
      )
      consoleWarnSpy.mockRestore()
    })

    it('should succeed with complete OAuth configuration', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
      vi.stubEnv('ENABLE_OAUTH', 'true')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.test1234567890ab')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret-with-sufficient-length')
      vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-id')
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-google-secret')

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { validateSecurityConfig } = await import('@/lib/validation/env')
      validateSecurityConfig()

      expect(consoleSpy).toHaveBeenCalledWith(
        '✓ OAuth configuration validation passed for providers: GitHub, Google'
      )
      consoleSpy.mockRestore()
    })
  })

  describe('Encryption Key Validation - All Error Cases', () => {
    it('should require encryption key in production when missing', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      delete process.env.ENCRYPTION_KEY

      const { validateEnvironment } = await import('@/lib/validation/env')

      expect(() => validateEnvironment()).toThrow(/ENCRYPTION_KEY is required in production/)
    })

    it('should validate encryption key format - non-hex characters', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'invalid-key-with-non-hex-characters-and-sufficient-length-for-testing'
      )

      const { validateEnvironment } = await import('@/lib/validation/env')

      expect(() => validateEnvironment()).toThrow(
        /Invalid encryption key format - must be 64 hex characters/
      )
    })

    it('should validate encryption key length - too short', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('ENCRYPTION_KEY', '123456789abcdef') // Too short

      const { validateEnvironment } = await import('@/lib/validation/env')

      expect(() => validateEnvironment()).toThrow(
        /Invalid encryption key length - must be 256 bits/
      )
    })

    it('should validate encryption key entropy - weak key', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        '0000000000000000000000000000000000000000000000000000000000000000'
      )

      const { validateEnvironment } = await import('@/lib/validation/env')

      expect(() => validateEnvironment()).toThrow(/Weak encryption key - insufficient entropy/)
    })

    it('should accept valid encryption key', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      )

      const { validateEnvironment } = await import('@/lib/validation/env')

      const result = validateEnvironment()
      expect(result.encryptionKey).toBe(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      )
    })

    it('should allow missing encryption key in non-production', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      delete process.env.ENCRYPTION_KEY

      const { validateEnvironment } = await import('@/lib/validation/env')

      // Should not throw in development when key is missing
      expect(() => validateEnvironment()).not.toThrow()
    })
  })

  describe('Utility Functions - All Code Paths', () => {
    it('should handle empty JWT_SECRET environment variable', async () => {
      vi.stubEnv('JWT_SECRET', '')

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(
        /JWT_SECRET environment variable is required and cannot be empty/
      )
    })

    it('should handle missing JWT_SECRET environment variable', async () => {
      delete process.env.JWT_SECRET

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(
        /JWT_SECRET environment variable is required and cannot be empty/
      )
    })

    it('should validate JWT secret before returning', async () => {
      vi.stubEnv('JWT_SECRET', 'invalid-weak-secret')

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(/JWT_SECRET validation failed/)
    })

    it('should return valid JWT secret', async () => {
      vi.stubEnv(
        'JWT_SECRET',
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )

      const { getJwtSecret } = await import('@/lib/validation/env')

      const result = getJwtSecret()
      expect(result).toBe(
        'strong-jwt-secret-for-testing-purposes-with-sufficient-entropy-and-length'
      )
    })

    it('should handle empty ENCRYPTION_KEY environment variable', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('ENCRYPTION_KEY', '')

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY environment variable is required/)
    })

    it('should handle missing ENCRYPTION_KEY environment variable', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      delete process.env.ENCRYPTION_KEY

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY environment variable is required/)
    })

    it('should validate encryption key format in getEncryptionKey', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('ENCRYPTION_KEY', 'invalid-format')

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(
        /ENCRYPTION_KEY must be exactly 64 hexadecimal characters/
      )
    })

    it('should validate encryption key entropy in getEncryptionKey', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        '0000000000000000000000000000000000000000000000000000000000000000'
      )

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY has insufficient entropy/)
    })

    it('should return valid encryption key', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      )

      const { getEncryptionKey } = await import('@/lib/validation/env')

      const result = getEncryptionKey()
      expect(result).toBe('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
    })
  })

  describe('Environment Check Utilities - All Branches', () => {
    it('should identify production environment', async () => {
      // Reset modules and set up fresh environment for this test
      vi.resetModules()

      // Create a complete mock environment that will pass validation
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://prod:pass@prod.server.com:5432/prod')
      vi.stubEnv(
        'JWT_SECRET',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?'
      )
      vi.stubEnv(
        'ENCRYPTION_KEY',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.test1234567890ab')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-secret-with-sufficient-length-for-testing')
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
      vi.stubEnv('CORS_ORIGINS', 'https://example.com')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'https://example.com/callback')

      const { isProduction, isDevelopment, isTest } = await import('@/lib/validation/env')

      expect(isProduction()).toBe(true)
      expect(isDevelopment()).toBe(false)
      expect(isTest()).toBe(false)
    })

    it('should identify development environment', async () => {
      // Reset modules and set up fresh environment for this test
      vi.resetModules()

      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://dev:pass@localhost:5432/dev')
      vi.stubEnv(
        'JWT_SECRET',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?'
      )
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
      vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'http://localhost:3000/callback')

      const { isProduction, isDevelopment, isTest } = await import('@/lib/validation/env')

      expect(isProduction()).toBe(false)
      expect(isDevelopment()).toBe(true)
      expect(isTest()).toBe(false)
    })

    it('should identify test environment', async () => {
      // Reset modules and set up fresh environment for this test
      vi.resetModules()

      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/testdb')
      vi.stubEnv(
        'JWT_SECRET',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?'
      )
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
      vi.stubEnv('CORS_ORIGINS', 'http://localhost:3000')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'http://localhost:3000/callback')

      const { isProduction, isDevelopment, isTest } = await import('@/lib/validation/env')

      expect(isProduction()).toBe(false)
      expect(isDevelopment()).toBe(false)
      expect(isTest()).toBe(true)
    })
  })
})
