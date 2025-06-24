/**
 * Isolated Environment Validation Tests
 *
 * Testing the environment validation schema directly without module-level side effects.
 * This approach tests the core validation logic without being affected by module 
 * import-time evaluation of the env constant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

describe('Environment Validation - Schema Tests', () => {
  let envSchema: z.ZodEffects<any, any, any>

  beforeEach(async () => {
    // Clean slate for each test
    vi.resetModules()
    vi.unstubAllEnvs()
    
    // Set a safe base environment to avoid side effects
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
    
    // Import fresh schema
    const module = await import('../../src/lib/validation/env')
    envSchema = module.envSchema
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // Helper to set up a complete valid environment
  function setupTestEnv(overrides: Record<string, string> = {}) {
    const baseEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      JWT_SECRET: '9Kf7Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7Xw',
      ENABLE_OAUTH: 'false',
      NEXT_PUBLIC_RP_ID: 'localhost',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'http://localhost:3000',
      ALLOWED_REDIRECT_URIS: 'http://localhost:3000/api/auth/github/callback',
      RATE_LIMIT_MAX: '100',
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

    // Create a mock environment for testing
    return baseEnv
  }

  describe('JWT Secret Validation', () => {
    it('should accept a strong JWT secret in development', () => {
      const testEnv = setupTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: '9Kf7Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7Xw',
      })

      expect(() => envSchema.parse(testEnv)).not.toThrow()
    })

    it('should reject JWT secret that is too short in development', () => {
      // Set NODE_ENV in process.env since JWT validation reads from there
      vi.stubEnv('NODE_ENV', 'development')
      
      const testEnv = setupTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'tooshort',
      })

      expect(() => envSchema.parse(testEnv)).toThrow()
    })

    it('should reject JWT secret with low entropy in development', () => {
      vi.stubEnv('NODE_ENV', 'development')
      
      const testEnv = setupTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })

      expect(() => envSchema.parse(testEnv)).toThrow()
    })

    it('should reject JWT secret with insufficient unique characters in development', () => {
      vi.stubEnv('NODE_ENV', 'development')
      
      const testEnv = setupTestEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'abcdefghijkabcdefghijkabcdefghijk', // Only 11 unique chars
      })

      expect(() => envSchema.parse(testEnv)).toThrow()
    })

    it('should provide test JWT secret in test environment', () => {
      const testEnv = setupTestEnv({
        NODE_ENV: 'test',
        // Let JWT_SECRET use default transformation for test environment
      })
      delete testEnv.JWT_SECRET // Let it use the test default

      const result = envSchema.parse(testEnv)
      expect(result.JWT_SECRET).toBe(
        'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only'
      )
    })
  })

  describe('Production Environment Validation', () => {
    it('should reject test keywords in JWT secret in production', () => {
      const testEnv = setupTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'test-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/api/auth/github/callback',
        ENCRYPTION_KEY: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ENABLE_OAUTH: 'false',
      })

      expect(() => envSchema.parse(testEnv)).toThrow(/test\/dev keywords/)
    })

    it('should reject localhost RP_ID in production', () => {
      const testEnv = setupTestEnv({
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

      expect(() => envSchema.parse(testEnv)).toThrow(/localhost in production/)
    })

    it('should require encryption key in production', () => {
      const testEnv = setupTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/callback',
        ENABLE_OAUTH: 'false',
        ENCRYPTION_KEY: '', // Empty to test requirement
      })

      expect(() => envSchema.parse(testEnv)).toThrow(/ENCRYPTION_KEY is required/)
    })
  })

  describe('Database URL Validation', () => {
    it('should accept valid PostgreSQL URLs', () => {
      const validUrls = [
        'postgresql://user:pass@localhost:5432/dbname',
        'postgresql://user:pass@host.com:5432/dbname?sslmode=require',
        'postgresql://neondb_owner:npg_abc123@ep-host.azure.neon.tech/neondb?sslmode=require',
      ]

      for (const url of validUrls) {
        const testEnv = setupTestEnv({
          DATABASE_URL: url,
        })

        expect(() => envSchema.parse(testEnv), `Failed for URL: ${url}`).not.toThrow()
      }
    })

    it('should reject invalid database URLs', () => {
      const invalidUrls = [
        'mysql://user:pass@localhost:3306/dbname',
        'http://example.com',
        'not-a-url',
        'postgresql://incomplete',
      ]

      for (const url of invalidUrls) {
        const testEnv = setupTestEnv({
          DATABASE_URL: url,
        })

        expect(() => envSchema.parse(testEnv), `Should fail for URL: ${url}`).toThrow()
      }
    })
  })

  describe('OAuth Configuration Validation', () => {
    it('should validate GitHub client ID format', () => {
      const testEnv = setupTestEnv({
        ENABLE_OAUTH: 'true',
        GITHUB_CLIENT_ID: 'Iv1.test1234567890ab',
        GITHUB_CLIENT_SECRET: 'test-oauth-client-secret-for-testing-only-with-sufficient-length',
      })

      expect(() => envSchema.parse(testEnv)).not.toThrow()
    })

    it('should reject invalid GitHub client ID format', () => {
      const testEnv = setupTestEnv({
        ENABLE_OAUTH: 'true',
        GITHUB_CLIENT_ID: 'invalid-format',
        GITHUB_CLIENT_SECRET: 'test-oauth-client-secret-for-testing-only-with-sufficient-length',
      })

      expect(() => envSchema.parse(testEnv)).toThrow(/OAuth App format/)
    })

    it('should require OAuth credentials when OAuth is enabled in production', () => {
      const testEnv = setupTestEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@prod.server.com:5432/prod',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        ENABLE_OAUTH: 'true',
        NEXT_PUBLIC_RP_ID: 'example.com',
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        CORS_ORIGINS: 'https://example.com',
        ALLOWED_REDIRECT_URIS: 'https://example.com/api/auth/github/callback',
        ENCRYPTION_KEY: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        GITHUB_CLIENT_ID: '',
        GITHUB_CLIENT_SECRET: '',
      })

      expect(() => envSchema.parse(testEnv)).toThrow(/OAuth is enabled in production/)
    })

    it('should allow missing OAuth credentials in development when OAuth is enabled', () => {
      const testEnv = setupTestEnv({
        NODE_ENV: 'development',
        ENABLE_OAUTH: 'true',
        JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
      })
      // Remove OAuth credentials to test optional behavior in development
      delete testEnv.GITHUB_CLIENT_ID
      delete testEnv.GITHUB_CLIENT_SECRET

      expect(() => envSchema.parse(testEnv)).not.toThrow()
    })
  })

  describe('WebAuthn RP ID Validation', () => {
    it('should accept valid domain formats', () => {
      const validDomains = ['localhost', 'example.com', 'sub.example.com', 'app-staging.company.io']

      for (const domain of validDomains) {
        const testEnv = setupTestEnv({
          NODE_ENV: 'development',
          JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
          NEXT_PUBLIC_RP_ID: domain,
        })

        expect(() => envSchema.parse(testEnv), `Failed for domain: ${domain}`).not.toThrow()
      }
    })

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'https://example.com',
        'example.com/',
        '.example.com',
        'example..com',
        'ex ample.com',
      ]

      for (const domain of invalidDomains) {
        const testEnv = setupTestEnv({
          NODE_ENV: 'development',
          JWT_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
          NEXT_PUBLIC_RP_ID: domain,
        })

        expect(() => envSchema.parse(testEnv), `Should fail for domain: ${domain}`).toThrow()
      }
    })
  })

  describe('Rate Limiting Validation', () => {
    it('should enforce reasonable rate limits', () => {
      const testEnv = setupTestEnv({
        RATE_LIMIT_MAX: '2000', // Too high
      })

      expect(() => envSchema.parse(testEnv)).toThrow(/Rate limit too high/)
    })
  })

  describe('Redirect URI Validation', () => {
    it('should validate redirect URI format', () => {
      const testEnv = setupTestEnv({
        ALLOWED_REDIRECT_URIS: 'invalid-uri,also-invalid',
      })

      expect(() => envSchema.parse(testEnv)).toThrow(/Invalid redirect URI/)
    })

    it('should accept valid redirect URIs', () => {
      const testEnv = setupTestEnv({
        ALLOWED_REDIRECT_URIS: 'http://localhost:3000/callback,https://example.com/auth/callback',
      })

      expect(() => envSchema.parse(testEnv)).not.toThrow()
    })
  })

  describe('Utility Functions', () => {
    it('should provide JWT secret for non-test environments', async () => {
      // Use the stable test environment with SKIP_ENV_VALIDATION
      vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('JWT_SECRET', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')

      const { getJwtSecret } = await import('../../src/lib/validation/env')
      expect(getJwtSecret()).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
    })

    it('should provide test JWT secret when NODE_ENV=test', async () => {
      // In test environment, the function should always return the test default
      // regardless of whether JWT_SECRET is set or not
      vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
      vi.stubEnv('NODE_ENV', 'test')
      
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      const result = getJwtSecret()
      
      // When NODE_ENV is test, always return test default (this is the designed behavior)
      expect(result).toBe(
        'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only'
      )
    })

    it('should generate encryption key for development', async () => {
      vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const { getEncryptionKey } = await import('../../src/lib/validation/env')
      const key = getEncryptionKey()
      expect(key).toHaveLength(64) // 32 bytes hex-encoded
      expect(key).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should require encryption key in production', async () => {
      vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('ENCRYPTION_KEY', '') // Empty to test requirement

      const { getEncryptionKey } = await import('../../src/lib/validation/env')
      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY is required/)
    })

    it('should validate startup validation function exists', async () => {
      vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
      
      const { validateEnvironmentOnStartup } = await import('../../src/lib/validation/env')
      expect(typeof validateEnvironmentOnStartup).toBe('function')
    })
  })
})