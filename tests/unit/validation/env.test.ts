/**
 * Environment Validation Tests
 *
 * Comprehensive test suite for environment variable validation system
 * Tests JWT secret entropy validation, production security checks,
 * and authentication configuration validation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Environment Validation', () => {
  beforeEach(async () => {
    // Clean slate for each test
    vi.resetModules()
    vi.unstubAllEnvs()

    // Clear any cached environment data
    try {
      const { clearEnvCache } = await import('@/lib/validation/env')
      clearEnvCache()
    } catch {
      // Ignore import errors during cleanup
    }
  })

  afterEach(async () => {
    // Clean up
    vi.unstubAllEnvs()
    vi.resetModules()

    // Clear any cached environment data
    try {
      const { clearEnvCache } = await import('@/lib/validation/env')
      clearEnvCache()
    } catch {
      // Ignore import errors during cleanup
    }
  })

  // Helper to create a clean env schema for testing
  async function createTestSchema() {
    vi.resetModules()
    const { envSchema, clearEnvCache } = await import('@/lib/validation/env')
    clearEnvCache() // Clear any cached environment data
    return envSchema
  }

  // Helper to set up a complete valid environment
  function setupValidTestEnv(overrides: Record<string, string> = {}) {
    const baseEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      // Test fixture - fake JWT secret for testing validation
      JWT_SECRET: 'fake_test_jwt_secret_with_good_entropy_for_testing_only_9Kf7Hq3Zx8Wm2Tn6Vy4Bu1',
      ENABLE_OAUTH: 'false',
      NEXT_PUBLIC_RP_ID: 'localhost',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'http://localhost:3000',
      ALLOWED_REDIRECT_URIS: 'http://localhost:3000/api/auth/github/callback',
      RATE_LIMIT_MAX: '100',
      // Include all required default values
      DB_PROJECT_ID: 'test-project',
      DB_MAIN_BRANCH: 'test-main',
      DB_DEV_BRANCH: 'test-dev',
      DB_TEST_BRANCH: 'test-test',
      DB_POOL_MIN: '2',
      DB_POOL_MAX: '20',
      DB_POOL_IDLE_TIMEOUT: '10000',
      HNSW_EF_SEARCH: '200',
      VECTOR_SIMILARITY_THRESHOLD: '0.7',
      HYBRID_SEARCH_TEXT_WEIGHT: '0.3',
      HYBRID_SEARCH_VECTOR_WEIGHT: '0.7',
      PORT: '3000',
      NEXT_PUBLIC_APP_NAME: 'Contribux',
      WEBAUTHN_RP_NAME: 'Contribux',
      WEBAUTHN_TIMEOUT: '60000',
      WEBAUTHN_CHALLENGE_EXPIRY: '300000',
      WEBAUTHN_SUPPORTED_ALGORITHMS: '-7,-257',
      RATE_LIMIT_WINDOW: '900',
      LOG_LEVEL: 'error',
      ENABLE_AUDIT_LOGS: 'false',
      ENABLE_WEBAUTHN: 'true',
      MAINTENANCE_MODE: 'false',
      ...overrides,
    }

    // Set all environment variables
    for (const [key, value] of Object.entries(baseEnv)) {
      vi.stubEnv(key, value)
    }

    return baseEnv
  }

  describe('JWT Secret Validation', () => {
    it('should accept a strong JWT secret in development', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        // Test fixture - fake JWT secret for testing validation
        JWT_SECRET:
          'fake_test_jwt_secret_with_good_entropy_for_testing_only_9Kf7Hq3Zx8Wm2Tn6Vy4Bu1',
        ENABLE_OAUTH: 'false', // Disable OAuth to avoid production checks
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })

    it('should reject JWT secret that is too short in development', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'tooshort',
        ENABLE_OAUTH: 'false',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow()
    })

    it('should reject JWT secret with low entropy in development', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ENABLE_OAUTH: 'false',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow()
    })

    it('should reject JWT secret with insufficient unique characters in development', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'abcdefghijkabcdefghijkabcdefghijk', // Only 11 unique chars
        ENABLE_OAUTH: 'false',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow()
    })

    it('should provide test JWT secret in test environment', async () => {
      setupValidTestEnv({
        NODE_ENV: 'test',
        // Don't set JWT_SECRET - let it use the default for test environment
      })
      vi.stubEnv('JWT_SECRET', '') // Ensure it's empty to trigger default

      vi.resetModules()
      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(getJwtSecret()).toBe(
        '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
      )
    })
  })

  describe('Production Environment Validation', () => {
    it('should reject test keywords in JWT secret in production', async () => {
      setupValidTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'test-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/api/auth/github/callback',
        ENCRYPTION_KEY: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ENABLE_OAUTH: 'false', // Disable OAuth to avoid OAuth validation errors
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/test\/dev keywords/)
    })

    it('should reject localhost RP_ID in production', async () => {
      setupValidTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        NEXT_PUBLIC_RP_ID: 'localhost',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/api/auth/github/callback',
        ENCRYPTION_KEY: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ENABLE_OAUTH: 'false',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/localhost in production/)
    })

    it('should require encryption key in production', async () => {
      setupValidTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/callback',
        ENABLE_OAUTH: 'false',
        // Don't set ENCRYPTION_KEY to test requirement
      })
      vi.stubEnv('ENCRYPTION_KEY', '') // Explicitly set to empty

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/ENCRYPTION_KEY is required/)
    })
  })

  describe('Database URL Validation', () => {
    it('should accept valid PostgreSQL URLs', async () => {
      const validUrls = [
        'postgresql://user:pass@localhost:5432/dbname',
        'postgresql://user:pass@host.com:5432/dbname?sslmode=require',
        'postgresql://neondb_owner:npg_abc123@ep-host.azure.neon.tech/neondb?sslmode=require',
      ]

      for (const url of validUrls) {
        setupValidTestEnv({
          DATABASE_URL: url,
        })

        const envSchema = await createTestSchema()
        expect(() => envSchema.parse(process.env), `Failed for URL: ${url}`).not.toThrow()
      }
    })

    it('should reject invalid database URLs', async () => {
      const invalidUrls = [
        'mysql://user:pass@localhost:3306/dbname',
        'http://example.com',
        'not-a-url',
        'postgresql://incomplete',
      ]

      for (const url of invalidUrls) {
        setupValidTestEnv({
          DATABASE_URL: url,
        })

        const envSchema = await createTestSchema()
        expect(() => envSchema.parse(process.env), `Should fail for URL: ${url}`).toThrow()
      }
    })
  })

  describe('OAuth Configuration Validation', () => {
    it('should validate GitHub client ID format', async () => {
      setupValidTestEnv({
        ENABLE_OAUTH: 'true',
        GITHUB_CLIENT_ID: 'Iv1.test1234567890ab',
        GITHUB_CLIENT_SECRET: 'test-oauth-client-secret-for-testing-only-with-sufficient-length',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })

    it('should reject invalid GitHub client ID format', async () => {
      setupValidTestEnv({
        ENABLE_OAUTH: 'true',
        GITHUB_CLIENT_ID: 'invalid-format',
        GITHUB_CLIENT_SECRET: 'test-oauth-client-secret-for-testing-only-with-sufficient-length',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/OAuth App format/)
    })

    it('should require OAuth credentials when OAuth is enabled in production', async () => {
      setupValidTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        ENABLE_OAUTH: 'true',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/api/auth/github/callback',
        ENCRYPTION_KEY: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      })
      // Explicitly set empty OAuth credentials to test validation
      vi.stubEnv('GITHUB_CLIENT_ID', '')
      vi.stubEnv('GITHUB_CLIENT_SECRET', '')

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/OAuth is enabled in production/)
    })

    it('should allow missing OAuth credentials in development when OAuth is enabled', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        ENABLE_OAUTH: 'true',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        // Missing GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET - should be OK in dev
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })
  })

  describe('WebAuthn RP ID Validation', () => {
    it('should accept valid domain formats', async () => {
      const validDomains = ['localhost', 'example.com', 'sub.example.com', 'app-staging.company.io']

      for (const domain of validDomains) {
        setupValidTestEnv({
          NODE_ENV: 'development',
          JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
          NEXT_PUBLIC_RP_ID: domain,
        })

        const envSchema = await createTestSchema()
        expect(() => envSchema.parse(process.env), `Failed for domain: ${domain}`).not.toThrow()
      }
    })

    it('should reject invalid domain formats', async () => {
      const invalidDomains = [
        'https://example.com',
        'example.com/',
        '.example.com',
        'example..com',
        'ex ample.com',
      ]

      for (const domain of invalidDomains) {
        setupValidTestEnv({
          NODE_ENV: 'development',
          JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
          NEXT_PUBLIC_RP_ID: domain,
        })

        const envSchema = await createTestSchema()
        expect(() => envSchema.parse(process.env), `Should fail for domain: ${domain}`).toThrow()
      }
    })
  })

  describe('Rate Limiting Validation', () => {
    it('should enforce reasonable rate limits', async () => {
      setupValidTestEnv({
        RATE_LIMIT_MAX: '2000', // Too high
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/Rate limit too high/)
    })
  })

  describe('Redirect URI Validation', () => {
    it('should validate redirect URI format', async () => {
      setupValidTestEnv({
        ALLOWED_REDIRECT_URIS: 'invalid-uri,also-invalid',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).toThrow(/Invalid redirect URI/)
    })

    it('should accept valid redirect URIs', async () => {
      setupValidTestEnv({
        ALLOWED_REDIRECT_URIS: 'http://localhost:3000/callback,https://example.com/auth/callback',
      })

      const envSchema = await createTestSchema()
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })
  })

  describe('Utility Functions', () => {
    it('should provide JWT secret for non-test environments', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
      })

      vi.resetModules()
      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(getJwtSecret()).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
    })

    it('should provide test JWT secret for test environment', async () => {
      setupValidTestEnv({
        NODE_ENV: 'test',
      })

      vi.resetModules()
      const { getJwtSecret } = await import('@/lib/validation/env')

      expect(getJwtSecret()).toBe(
        '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
      )
    })

    it('should generate encryption key for development', async () => {
      setupValidTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
      })

      vi.resetModules()
      const { getEncryptionKey } = await import('@/lib/validation/env')

      const key = getEncryptionKey()
      expect(key).toHaveLength(64) // 32 bytes hex-encoded
      expect(key).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should require encryption key in production', async () => {
      setupValidTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/api/auth/github/callback',
        ENCRYPTION_KEY: '', // Empty to test requirement
      })

      vi.resetModules()
      await expect(async () => {
        const { getEncryptionKey } = await import('@/lib/validation/env')
        getEncryptionKey()
      }).rejects.toThrow(/ENCRYPTION_KEY is required/)
    })
  })

  describe('Startup Validation', () => {
    it('should handle validation gracefully', async () => {
      // Mock console methods
      const mockConsoleError = vi.fn()
      const mockProcessExit = vi.fn()
      const originalConsoleError = console.error
      const originalProcessExit = process.exit
      const originalNodeEnv = process.env.NODE_ENV

      console.error = mockConsoleError
      process.exit = mockProcessExit as unknown as typeof process.exit

      try {
        // Set invalid environment with production mode
        // Temporarily override NODE_ENV in process.env to simulate production
        process.env.NODE_ENV = 'production'
        process.env.SKIP_ENV_VALIDATION = 'false'
        process.env.DATABASE_URL = 'invalid-url'
        process.env.JWT_SECRET = 'short'

        vi.resetModules()
        const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

        validateEnvironmentOnStartup()

        expect(mockProcessExit).toHaveBeenCalledWith(1)
        expect(mockConsoleError).toHaveBeenCalledWith(
          expect.stringContaining('Environment validation failed')
        )
      } finally {
        // Restore original methods and environment
        console.error = originalConsoleError
        process.exit = originalProcessExit
        process.env.NODE_ENV = originalNodeEnv
      }
    })
  })
})
