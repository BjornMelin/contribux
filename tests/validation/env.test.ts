/**
 * Environment Validation Tests
 * 
 * Comprehensive test suite for environment variable validation system
 * Tests JWT secret entropy validation, production security checks,
 * and authentication configuration validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { z } from 'zod'

// Helper to safely set NODE_ENV in test environment
function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('Environment Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Create a clean environment for each test
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('JWT Secret Validation', () => {
    it('should accept a strong JWT secret', async () => {
      // Mock environment variables
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })

    it('should reject JWT secret that is too short', async () => {
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'short'
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/JWT_SECRET must be at least 32 characters long/)
    })

    it('should reject JWT secret with low entropy', async () => {
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // 34 chars but low entropy
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/insufficient entropy/)
    })

    it('should reject JWT secret with insufficient unique characters', async () => {
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'abcdefghijklmnopabcdefghijklmnopab' // Only 16 unique chars, repeated
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/must contain at least 16 unique characters/)
    })

    it('should use test defaults in test environment', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ENABLE_OAUTH = 'false'
      
      const { env } = await import('../../src/lib/validation/env')
      
      expect(env.JWT_SECRET).toBe('test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only')
    })
  })

  describe('Production Environment Validation', () => {
    it('should require all necessary variables in production', async () => {
      setNodeEnv('production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'test-secret-should-fail' // Contains 'test'
      process.env.NEXT_PUBLIC_RP_ID = 'example.com'
      process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
      process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/cannot contain test\/dev keywords in production/)
    })

    it('should reject localhost RP_ID in production', async () => {
      setNodeEnv('production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
      process.env.NEXT_PUBLIC_RP_ID = 'localhost'
      process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/RP_ID cannot be localhost in production/)
    })

    it('should require encryption key in production', async () => {
      setNodeEnv('production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
      process.env.NEXT_PUBLIC_RP_ID = 'example.com'
      process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
      process.env.ENABLE_OAUTH = 'false'
      // Missing ENCRYPTION_KEY
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/ENCRYPTION_KEY is required in production/)
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
        process.env = { ...originalEnv } // Reset env
        setNodeEnv('test')
        process.env.DATABASE_URL = url
        process.env.ENABLE_OAUTH = 'false'
        
        vi.resetModules()
        const { envSchema } = await import('../../src/lib/validation/env')
        
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
        process.env = { ...originalEnv } // Reset env
        setNodeEnv('test')
        process.env.DATABASE_URL = url
        process.env.ENABLE_OAUTH = 'false'
        
        vi.resetModules()
        const { envSchema } = await import('../../src/lib/validation/env')
        
        expect(() => envSchema.parse(process.env), `Should fail for URL: ${url}`).toThrow()
      }
    })
  })

  describe('OAuth Configuration Validation', () => {
    it('should validate GitHub client ID format', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ENABLE_OAUTH = 'true'
      process.env.GITHUB_CLIENT_ID = 'Iv1234567890abcdef12' // Valid format: 20 alphanumeric chars
      process.env.GITHUB_CLIENT_SECRET = 'ghp_1234567890abcdef1234567890abcdef12345678'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })

    it('should reject invalid GitHub client ID format', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ENABLE_OAUTH = 'true'
      process.env.GITHUB_CLIENT_ID = 'invalid-format' // Invalid format
      process.env.GITHUB_CLIENT_SECRET = 'ghp_1234567890abcdef1234567890abcdef12345678'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/GitHub Client ID must be exactly 20 alphanumeric characters/)
    })

    it('should require OAuth credentials when OAuth is enabled in production', async () => {
      setNodeEnv('production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
      process.env.ENABLE_OAUTH = 'true'
      process.env.NEXT_PUBLIC_RP_ID = 'example.com'
      process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
      process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      // Missing GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when OAuth is enabled in production/)
    })

    it('should allow missing OAuth credentials in development when OAuth is enabled', async () => {
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
      process.env.ENABLE_OAUTH = 'true'
      // Missing GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET - should be OK in dev
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
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
        process.env = { ...originalEnv } // Reset env
        setNodeEnv('development')
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
        process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
        process.env.NEXT_PUBLIC_RP_ID = domain
        process.env.ENABLE_OAUTH = 'false'
        
        vi.resetModules()
        const { envSchema } = await import('../../src/lib/validation/env')
        
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
        process.env = { ...originalEnv } // Reset env
        setNodeEnv('development')
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
        process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
        process.env.NEXT_PUBLIC_RP_ID = domain
        process.env.ENABLE_OAUTH = 'false'
        
        vi.resetModules()
        const { envSchema } = await import('../../src/lib/validation/env')
        
        expect(() => envSchema.parse(process.env), `Should fail for domain: ${domain}`).toThrow()
      }
    })
  })

  describe('Rate Limiting Validation', () => {
    it('should enforce reasonable rate limits', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.RATE_LIMIT_MAX = '2000' // Too high
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/Rate limit too high/)
    })
  })

  describe('Redirect URI Validation', () => {
    it('should validate redirect URI format', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ALLOWED_REDIRECT_URIS = 'invalid-uri,also-invalid'
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).toThrow(/Invalid redirect URI/)
    })

    it('should accept valid redirect URIs', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ALLOWED_REDIRECT_URIS = 'http://localhost:3000/callback,https://example.com/auth/callback'
      process.env.ENABLE_OAUTH = 'false'
      
      const { envSchema } = await import('../../src/lib/validation/env')
      
      expect(() => envSchema.parse(process.env)).not.toThrow()
    })
  })

  describe('Utility Functions', () => {
    it('should provide JWT secret for non-test environments', async () => {
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.JWT_SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
      process.env.ENABLE_OAUTH = 'false'
      
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      
      expect(getJwtSecret()).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6')
    })

    it('should provide test JWT secret for test environment', async () => {
      setNodeEnv('test')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ENABLE_OAUTH = 'false'
      
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      
      expect(getJwtSecret()).toBe('test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only')
    })

    it('should generate encryption key for development', async () => {
      setNodeEnv('development')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ENABLE_OAUTH = 'false'
      
      const { getEncryptionKey } = await import('../../src/lib/validation/env')
      
      const key = getEncryptionKey()
      expect(key).toHaveLength(64) // 32 bytes hex-encoded
      expect(key).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should require encryption key in production', async () => {
      setNodeEnv('production')
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
      process.env.ENABLE_OAUTH = 'false'
      
      const { getEncryptionKey } = await import('../../src/lib/validation/env')
      
      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY is required in production/)
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
        // Set invalid environment
        setNodeEnv('production')
        process.env.DATABASE_URL = 'invalid-url'
        process.env.JWT_SECRET = 'short'
        
        const { validateEnvironmentOnStartup } = await import('../../src/lib/validation/env')
        
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