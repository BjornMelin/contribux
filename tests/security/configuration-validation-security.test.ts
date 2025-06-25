/**
 * Comprehensive Configuration Validation Security Tests
 *
 * These tests verify that the application fails securely when required encryption keys are missing,
 * validates zero-trust security requirements, and ensures no fallback keys can be used.
 *
 * Focus areas:
 * 1. Application startup fails securely when required encryption keys are missing
 * 2. No hardcoded fallback keys can be used in any environment
 * 3. Environment validation blocks startup with invalid/weak keys
 * 4. All key management functions throw errors instead of providing fallbacks
 * 5. Test coverage for the security fixes implemented in env.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Configuration Validation Security', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockExit: ReturnType<typeof vi.spyOn> & { lastCallCode?: number | string | null | undefined }
  let mockConsoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalEnv = { ...process.env }

    // Mock process.exit to prevent actual exit during tests
    // Security functions call process.exit(1) instead of throwing errors
    mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null | undefined) => {
        // Store the exit code for verification
        ;(
          mockExit as typeof mockExit & { lastCallCode?: number | string | null | undefined }
        ).lastCallCode = code
        // Don't throw - just return to allow test to continue
        return undefined as never
      })

    // Mock console.error to capture error output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set base test environment variables to prevent import-time validation failures
    vi.stubEnv('NODE_ENV', 'test')
    process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb'
    process.env.JWT_SECRET = '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
    process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
    process.env.GITHUB_CLIENT_SECRET =
      'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'
    process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.com'
    process.env.CORS_ORIGINS = 'https://contribux.com'

    // Set environment validation to controlled mode for these tests
    process.env.SKIP_ENV_VALIDATION = 'false' // Enable validation but with mocked exit
  })

  afterEach(() => {
    process.env = originalEnv
    mockExit.mockRestore()
    mockConsoleError.mockRestore()
  })

  describe('Application Startup Security', () => {
    it('should fail securely when ENCRYPTION_KEY is missing in production', async () => {
      // Set production environment with missing encryption key
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'
      // ENCRYPTION_KEY intentionally missing

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      // Security validation calls process.exit instead of throwing
      validateEnvironmentOnStartup()

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Environment validation failed')
      )
    })

    it('should fail securely when JWT_SECRET is missing', async () => {
      // Set environment with missing JWT secret
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'
      // JWT_SECRET intentionally missing

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should fail securely when DATABASE_URL is missing', async () => {
      // Set environment with missing database URL
      vi.stubEnv('NODE_ENV', 'production')
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'
      // DATABASE_URL intentionally missing

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should fail securely when GitHub OAuth credentials are incomplete in production', async () => {
      // Set environment with incomplete GitHub OAuth
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      // GITHUB_CLIENT_SECRET intentionally missing

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should block startup with weak encryption keys', async () => {
      // Set environment with weak encryption key
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        '0000000000000000000000000000000000000000000000000000000000000000' // Weak key
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(/weak|entropy|insufficient/i)
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should block startup with invalid encryption key format', async () => {
      // Set environment with invalid encryption key format
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY = 'invalid-key-format-not-hex' // Invalid format
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringMatching(/invalid.*format|hex/i))
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should block startup with short encryption key', async () => {
      // Set environment with short encryption key
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY = '123456789abcdef' // Too short
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringMatching(/length|256.*bit/i))
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should block startup with test keywords in production secrets', async () => {
      // Set environment with test keywords in production
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = 'test-jwt-secret-with-sufficient-length-and-entropy-32chars' // Contains 'test'
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringMatching(/test.*keyword.*production/i)
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should block startup with localhost URLs in production', async () => {
      // Set environment with localhost URLs in production
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@production.db.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'secure-github-client-secret-with-sufficient-length-for-production-purposes-to-meet-40-char-requirement'
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000' // Localhost in production
      process.env.CORS_ORIGINS = 'https://contribux.com'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringMatching(/localhost.*production/i))
      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('Key Management Function Security', () => {
    it('should throw error when getEncryptionKey() is called with missing key', async () => {
      // Clear encryption key
      delete process.env.ENCRYPTION_KEY
      vi.stubEnv('NODE_ENV', 'production')

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY.*required/i)
      expect(() => getEncryptionKey()).toThrow(/openssl rand -hex 32/)
    })

    it('should throw error when getJwtSecret() is called with missing secret', async () => {
      // Clear JWT secret
      delete process.env.JWT_SECRET

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(/JWT_SECRET.*required.*cannot be empty/i)
    })

    it('should throw error when getJwtSecret() is called with invalid secret', async () => {
      // Set invalid JWT secret
      process.env.JWT_SECRET = 'too_short'

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(/JWT_SECRET validation failed/i)
    })

    it('should throw error when getEncryptionKey() is called with invalid format', async () => {
      // Set invalid encryption key format
      process.env.ENCRYPTION_KEY = 'invalid-format-not-hex'

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/64 hexadecimal characters/i)
      expect(() => getEncryptionKey()).toThrow(/openssl rand -hex 32/)
    })

    it('should throw error when getEncryptionKey() is called with weak key', async () => {
      // Set weak encryption key
      process.env.ENCRYPTION_KEY =
        '0000000000000000000000000000000000000000000000000000000000000000'

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/insufficient entropy.*predictable/i)
      expect(() => getEncryptionKey()).toThrow(/openssl rand -hex 32/)
    })

    it('should validate encryption key in all environments', async () => {
      // Test each environment type
      const environments = ['development', 'test', 'production']

      for (const env of environments) {
        vi.stubEnv('NODE_ENV', env)
        delete process.env.ENCRYPTION_KEY

        const { getEncryptionKey } = await import('@/lib/validation/env')

        expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY.*required.*${env}/i)
      }
    })
  })

  describe('Hardcoded Fallback Prevention', () => {
    it('should never provide hardcoded fallback encryption keys', async () => {
      // Test multiple scenarios where fallbacks might be tempting
      const testScenarios = [
        { env: 'development', description: 'development environment' },
        { env: 'test', description: 'test environment' },
        { env: 'production', description: 'production environment' },
      ]

      for (const scenario of testScenarios) {
        vi.stubEnv('NODE_ENV', scenario.env)
        delete process.env.ENCRYPTION_KEY

        const { getEncryptionKey } = await import('@/lib/validation/env')

        // Should always throw, never provide fallback
        expect(() => getEncryptionKey()).toThrow()

        // Verify no common fallback patterns are used
        try {
          getEncryptionKey()
          throw new Error('Should have thrown an error')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          // Ensure error message doesn't contain actual key values
          expect(errorMessage).not.toMatch(/^[0-9a-fA-F]{64}$/)
          expect(errorMessage).not.toContain('0123456789abcdef')
          expect(errorMessage).not.toContain('fallback')
          expect(errorMessage).not.toContain('default')
        }
      }
    })

    it('should never provide hardcoded fallback JWT secrets', async () => {
      // Test multiple scenarios
      const testScenarios = [
        { env: 'development', description: 'development environment' },
        { env: 'test', description: 'test environment' },
        { env: 'production', description: 'production environment' },
      ]

      for (const scenario of testScenarios) {
        vi.stubEnv('NODE_ENV', scenario.env)
        delete process.env.JWT_SECRET

        const { getJwtSecret } = await import('@/lib/validation/env')

        // Should always throw, never provide fallback
        expect(() => getJwtSecret()).toThrow()

        // Verify no common fallback patterns are used
        try {
          getJwtSecret()
          throw new Error('Should have thrown an error')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          // Ensure error message doesn't contain actual secret values
          expect(errorMessage).not.toContain('default-secret')
          expect(errorMessage).not.toContain('fallback')
          expect(errorMessage).not.toContain('your-secret-here')
        }
      }
    })

    it('should prevent test defaults in production mode', async () => {
      // Set production with potential test values
      vi.stubEnv('NODE_ENV', 'production')

      // Test various test-like values
      const testValues = [
        'test-encryption-key-1234567890abcdef1234567890abcdef1234567890ab',
        'dev-secret-key-for-testing-1234567890abcdef1234567890abcdef12345',
        'development-key-1234567890abcdef1234567890abcdef1234567890abcdef',
      ]

      for (const testValue of testValues) {
        process.env.ENCRYPTION_KEY = testValue

        const { getEncryptionKey } = await import('@/lib/validation/env')

        expect(() => getEncryptionKey()).toThrow(/test.*keyword.*production/i)
      }
    })
  })

  describe('Environment Validation Edge Cases', () => {
    it('should reject empty string environment variables', async () => {
      // Set empty strings (not undefined)
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = '' // Empty string
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should reject whitespace-only environment variables', async () => {
      // Set whitespace-only values
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
      process.env.JWT_SECRET = '   ' // Whitespace only
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should validate JWT secrets with insufficient unique characters', async () => {
      // Set JWT secret with low unique character ratio
      process.env.JWT_SECRET = 'abcdefghijklmnopqrstuvwxyzabcdefgh' // Only 26 unique chars in 34 char string

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(/insufficient entropy/)
    })

    it('should validate JWT secrets with low entropy per character', async () => {
      // Set JWT secret with repetitive patterns
      process.env.JWT_SECRET = 'abcabcabcabcabcabcabcabcabcabcabcabc' // Repetitive pattern

      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(() => getJwtSecret()).toThrow(/insufficient entropy/)
    })
  })

  describe('Production Environment Validation', () => {
    it('should enforce all required production environment variables', async () => {
      // Set minimal production environment
      vi.stubEnv('NODE_ENV', 'production')

      const { validateProductionEnv } = await import('@/lib/validation/env')

      // Should fail with all required vars missing
      expect(() => validateProductionEnv()).toThrow(
        /Missing required production environment variables/
      )
    })

    it('should succeed with complete production environment', async () => {
      // Set complete production environment
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'test-github-client-secret-with-sufficient-length-for-testing-purposes-to-meet-40-char-requirement'

      const { validateProductionEnv } = await import('@/lib/validation/env')

      // Should not throw with complete environment
      expect(() => validateProductionEnv()).not.toThrow()
    })
  })

  describe('Zero-Trust Security Validation', () => {
    it('should require encryption key validation in all environments', async () => {
      const environments = ['development', 'test', 'production']

      for (const env of environments) {
        vi.stubEnv('NODE_ENV', env)
        process.env.ENCRYPTION_KEY = 'invalid-key'

        const { validateEnvironment } = await import('@/lib/validation/env')

        expect(() => validateEnvironment()).toThrow(/invalid.*format.*hex/i)
      }
    })

    it('should enforce entropy requirements for all keys', async () => {
      // Test weak encryption key
      vi.stubEnv('NODE_ENV', 'production')
      process.env.ENCRYPTION_KEY =
        '1111111111111111111111111111111111111111111111111111111111111111'

      const { validateEnvironment } = await import('@/lib/validation/env')

      expect(() => validateEnvironment()).toThrow(/weak.*insufficient entropy/i)
    })

    it('should provide security guidance in error messages', async () => {
      // Test missing encryption key
      delete process.env.ENCRYPTION_KEY
      vi.stubEnv('NODE_ENV', 'production')

      const { getEncryptionKey } = await import('@/lib/validation/env')

      try {
        getEncryptionKey()
        expect.fail('Should have thrown an error')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // Should provide helpful guidance
        expect(errorMessage).toContain('openssl rand -hex 32')
        expect(errorMessage).toContain('64-character hexadecimal')
        expect(errorMessage).toContain('256 bits')
      }
    })
  })
})
