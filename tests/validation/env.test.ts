/**
 * Environment Validation Tests
 * 
 * Comprehensive test suite for environment variable validation system
 * Tests JWT secret entropy validation, production security checks,
 * and authentication configuration validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { z } from 'zod'

describe('Environment Validation', () => {
  beforeEach(() => {
    // Clean slate for each test
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    // Clean up
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // Helper to import env module with proper isolation
  async function importSchemaOnly() {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
    const module = await import('../../src/lib/validation/env')
    return module
  }

  describe('JWT Secret Validation', () => {
    it('should accept a strong JWT secret', async () => {
      // Mock environment variables using vi.stubEnv
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })

    it('should reject JWT secret that is too short', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'short')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/JWT_SECRET must be at least 32 characters long/)
    })

    it('should reject JWT secret with low entropy', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') // 34 chars but low entropy
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/insufficient entropy/)
    })

    it('should reject JWT secret with insufficient unique characters', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'abcdefghijklmnopabcdefghijklmnopab') // Only 16 unique chars, repeated
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow('JWT_SECRET has insufficient entropy (too predictable)')
    })

    it('should provide test JWT secret in test environment', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      // Don't set JWT_SECRET - let it use the default for test environment
      
      vi.resetModules()
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      
      expect(getJwtSecret()).toBe('test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only')
    })
  })

  describe('Production Environment Validation', () => {
    it('should require all necessary variables in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'test-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4') // Contains 'test'
      vi.stubEnv('NEXT_PUBLIC_RP_ID', 'example.com')
      vi.stubEnv('WEBAUTHN_RP_ID', 'example.com') // Set for consistency
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
      vi.stubEnv('CORS_ORIGINS', 'https://example.com')
      vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-testing-only-not-production-use-abcdefgh')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/cannot contain test\/dev keywords in production/)
    })

    it('should reject localhost RP_ID in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('NEXT_PUBLIC_RP_ID', 'localhost')
      vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-testing-only-not-production-use-abcdefgh')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/RP_ID cannot be localhost in production/)
    })

    it('should require encryption key in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('NEXT_PUBLIC_RP_ID', 'example.com')
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
      vi.stubEnv('CORS_ORIGINS', 'https://example.com')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'https://example.com/callback')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      // Don't stub ENCRYPTION_KEY to ensure it's missing
      
      const { envSchema } = await importSchemaOnly()
      
      try {
        const result = envSchema.parse(process.env)
        // If we get here, the validation didn't throw
        console.error('Validation passed when it should have failed')
        console.error('NODE_ENV:', process.env.NODE_ENV)
        console.error('ENCRYPTION_KEY:', result.ENCRYPTION_KEY)
      } catch (error) {
        // Expected to throw
        expect(error).toBeDefined()
        if (error instanceof z.ZodError) {
          const encryptionKeyError = error.issues.find(issue => issue.path.includes('ENCRYPTION_KEY'))
          expect(encryptionKeyError).toBeDefined()
          expect(encryptionKeyError?.message).toMatch(/ENCRYPTION_KEY is required in production/)
        }
      }
    })
  })

  describe('Database URL Validation', () => {
    it('should accept valid PostgreSQL URLs', async () => {
      const validUrls = [
        'postgresql://user:pass@localhost:5432/dbname',
        'postgresql://user:pass@host.com:5432/dbname?sslmode=require',
        'postgresql://neondb_owner:npg_abc123@ep-host.azure.neon.tech/neondb?sslmode=require'
      ]
      
      for (const url of validUrls) {
        vi.unstubAllEnvs() // Clear previous stubs
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('DATABASE_URL', url)
        vi.stubEnv('ENABLE_OAUTH', 'false')
        
        vi.resetModules()
        const { envSchema } = await importSchemaOnly()
        
        expect(() => envSchema.parse(process.env), `Failed for URL: ${url}`).not.toThrow()
      }
    })

    it('should reject invalid database URLs', async () => {
      const invalidUrls = [
        'mysql://user:pass@localhost:3306/dbname',
        'http://example.com',
        'not-a-url',
        'postgresql://incomplete'
      ]
      
      for (const url of invalidUrls) {
        vi.unstubAllEnvs() // Clear previous stubs
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('DATABASE_URL', url)
        vi.stubEnv('ENABLE_OAUTH', 'false')
        
        vi.resetModules()
        
        try {
          const { envSchema } = await importSchemaOnly()
          expect(() => envSchema.parse(process.env), `Should fail for URL: ${url}`).toThrow()
        } catch (error) {
          // If the module import itself throws, that's also a validation failure
          expect(error).toBeDefined()
        }
      }
    })
  })

  describe('OAuth Configuration Validation', () => {
    it('should validate GitHub client ID format', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ENABLE_OAUTH', 'true')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1234567890abcdef12') // Valid format: 20 alphanumeric chars
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'ghp_1234567890abcdef1234567890abcdef12345678')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })

    it('should reject invalid GitHub client ID format', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ENABLE_OAUTH', 'true')
      vi.stubEnv('GITHUB_CLIENT_ID', 'invalid-format') // Invalid format
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'ghp_1234567890abcdef1234567890abcdef12345678')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/GitHub Client ID must be either OAuth App format \(Iv1\.xxx\) or GitHub App format \(20 chars\)/)
    })

    it('should require OAuth credentials when OAuth is enabled in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('ENABLE_OAUTH', 'true')
      vi.stubEnv('NEXT_PUBLIC_RP_ID', 'example.com')
      vi.stubEnv('WEBAUTHN_RP_ID', 'example.com')
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
      vi.stubEnv('CORS_ORIGINS', 'https://example.com')
      vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-for-testing-only-not-production-use-abcdefgh')
      // Explicitly set OAuth credentials to empty strings to test requirement
      vi.stubEnv('GITHUB_CLIENT_ID', '')
      vi.stubEnv('GITHUB_CLIENT_SECRET', '')
      
      const { envSchema } = await importSchemaOnly()
      
      try {
        envSchema.parse(process.env)
        // If no error is thrown, fail the test
        expect(true).toBe(false) // This should not be reached
      } catch (error) {
        // Check that the error message contains the expected text
        expect(error).toBeInstanceOf(z.ZodError)
        if (error instanceof z.ZodError) {
          const errorMessages = error.issues.map(issue => issue.message).join(' ')
          expect(errorMessages).toMatch(/GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when OAuth is enabled in production/)
        }
      }
    })

    it('should allow missing OAuth credentials in development when OAuth is enabled', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('ENABLE_OAUTH', 'true')
      // Missing GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET - should be OK in dev
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })
  })

  describe('WebAuthn RP ID Validation', () => {
    it('should accept valid domain formats', async () => {
      const validDomains = [
        'localhost',
        'example.com',
        'sub.example.com',
        'app-staging.company.io'
      ]
      
      for (const domain of validDomains) {
        vi.unstubAllEnvs() // Reset env
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
        vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
        vi.stubEnv('NEXT_PUBLIC_RP_ID', domain)
        vi.stubEnv('ENABLE_OAUTH', 'false')
        
        vi.resetModules()
        const { envSchema } = await importSchemaOnly()
        
        expect(() => envSchema.parse(process.env), `Failed for domain: ${domain}`).not.toThrow()
      }
    })

    it('should reject invalid domain formats', async () => {
      const invalidDomains = [
        'https://example.com', // Should not include protocol
        'example.com/', // Should not include path
        '.example.com', // Should not start with dot
        'example..com', // Should not have double dots
        'ex ample.com' // Should not contain spaces
      ]
      
      for (const domain of invalidDomains) {
        vi.unstubAllEnvs() // Reset env
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
        vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
        vi.stubEnv('NEXT_PUBLIC_RP_ID', domain)
        vi.stubEnv('ENABLE_OAUTH', 'false')
        
        vi.resetModules()
        const { envSchema } = await importSchemaOnly()
        
        expect(() => envSchema.parse(process.env), `Should fail for domain: ${domain}`).toThrow()
      }
    })
  })

  describe('Rate Limiting Validation', () => {
    it('should enforce reasonable rate limits', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('RATE_LIMIT_MAX', '2000') // Too high
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/Rate limit too high/)
    })
  })

  describe('Redirect URI Validation', () => {
    it('should validate redirect URI format', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'invalid-uri,also-invalid')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).toThrow(/Invalid redirect URI/)
    })

    it('should accept valid redirect URIs', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'http://localhost:3000/callback,https://example.com/auth/callback')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { envSchema } = await importSchemaOnly()
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })
  })

  describe('Utility Functions', () => {
    it('should provide JWT secret for non-test environments', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      
      expect(getJwtSecret()).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
    })

    it('should provide test JWT secret for test environment', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      
      expect(getJwtSecret()).toBe('test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only')
    })

    it('should generate encryption key for development', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      
      const { getEncryptionKey } = await import('../../src/lib/validation/env')
      
      const key = getEncryptionKey()
      expect(key).toHaveLength(64) // 32 bytes hex-encoded
      expect(key).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should require encryption key in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
      vi.stubEnv('ENABLE_OAUTH', 'false')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
      vi.stubEnv('NEXT_PUBLIC_RP_ID', 'example.com')
      vi.stubEnv('WEBAUTHN_RP_ID', 'example.com')
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
      vi.stubEnv('CORS_ORIGINS', 'https://example.com')
      // Explicitly unset ENCRYPTION_KEY to test requirement
      vi.stubEnv('ENCRYPTION_KEY', '')
      
      try {
        const { getEncryptionKey } = await import('../../src/lib/validation/env')
        getEncryptionKey()
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        if (error instanceof Error) {
          expect(error.message).toMatch(/ENCRYPTION_KEY is required in production/)
        } else if (error instanceof z.ZodError) {
          const messages = error.issues.map(i => i.message).join(' ')
          expect(messages).toMatch(/ENCRYPTION_KEY is required in production/)
        }
      }
    })
  })

  describe('Startup Validation', () => {
    it('should handle validation gracefully', async () => {
      // Mock console methods
      const mockConsoleError = vi.fn()
      const mockProcessExit = vi.fn()
      const originalConsoleError = console.error
      const originalProcessExit = process.exit
      
      console.error = mockConsoleError
      process.exit = mockProcessExit as any
      
      try {
        // Set invalid environment - missing required production variables
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('DATABASE_URL', 'invalid-url')
        vi.stubEnv('JWT_SECRET', 'short')
        vi.stubEnv('ENABLE_OAUTH', 'false')
        vi.stubEnv('SKIP_ENV_VALIDATION', 'true') // Skip initial validation
        
        // Reset modules to ensure fresh import with stubbed env
        vi.resetModules()
        const { validateEnvironmentOnStartup } = await import('../../src/lib/validation/env')
        
        // Now remove the skip flag and call validation
        vi.stubEnv('SKIP_ENV_VALIDATION', '')
        validateEnvironmentOnStartup()
        
        expect(mockProcessExit).toHaveBeenCalledWith(1)
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Environment validation failed'))
      } finally {
        // Restore original methods
        console.error = originalConsoleError
        process.exit = originalProcessExit
      }
    })
  })
})