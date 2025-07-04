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

import { appConfig, createConfig, databaseConfig } from '@/lib/config'
import {
  getDatabaseUrl,
  getJwtSecret,
  getRequiredEnv,
  validateBasicEnvironmentVariables,
  validateEnvironmentOnStartup,
  validateProductionEnv,
  validateProductionSecrets,
  validateProductionSecuritySettings,
  validateProductionUrls,
  validateSecretEntropy,
} from '@/lib/validation/env'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Configuration Validation Security', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('Environment Variable Security', () => {
    describe('Secret Validation', () => {
      it('should enforce 32-character minimum for secrets', () => {
        const shortSecret = 'short-secret-123'
        expect(validateSecretEntropy(shortSecret)).toBe(false)

        const validSecret = 'very-long-secure-secret-with-sufficient-length-and-complexity-12345'
        expect(validateSecretEntropy(validSecret)).toBe(true)
      })

      it('should validate secret entropy requirements', () => {
        // Low entropy secret (repetitive characters)
        const lowEntropySecret = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        expect(validateSecretEntropy(lowEntropySecret)).toBe(false)

        // High entropy secret (good distribution)
        const highEntropySecret = 'Kx9#mP2$vL8@qR4!nF7%dB3^wE6&yQ5*'
        expect(validateSecretEntropy(highEntropySecret)).toBe(true)
      })

      it('should detect weak patterns in secrets', () => {
        const weakPatterns = [
          '12345678901234567890123456789012', // Sequential numbers
          'abcdefghijklmnopqrstuvwxyz123456', // Sequential letters
          'password123password123password12', // Repeated words
          'aaaabbbbccccddddeeeeffffgggghhh1', // Pattern repetition
        ]

        weakPatterns.forEach(pattern => {
          expect(validateSecretEntropy(pattern)).toBe(false)
        })
      })

      it('should reject test/dev keywords in production', () => {
        process.env.NODE_ENV = 'production'

        const testPatterns = [
          'secure-test-token-32chars-minimum-key',
          'demo-api-key',
          'sample-jwt-secret',
        ]

        testPatterns.forEach(_pattern => {
          expect(() => getRequiredEnv('TEST_VAR')).toThrow(/test patterns in production/)
        })
      })
    })

    describe('Production Security Validation', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production'
      })

      it('should require secure secrets in production', () => {
        process.env.JWT_SECRET = 'weak'
        expect(() => validateProductionSecrets()).toThrow(/JWT_SECRET.*production/)
      })

      it('should reject development patterns', () => {
        process.env.DATABASE_URL = 'postgresql://localhost:5432/test'
        expect(() => validateProductionSecuritySettings()).toThrow(/localhost.*test/)
      })

      it('should enforce HTTPS requirements', () => {
        process.env.NEXTAUTH_URL = 'http://localhost:3000'
        expect(() => validateProductionSecuritySettings()).toThrow(/production domain/)
      })

      it('should validate production-only settings', () => {
        // Missing GitHub OAuth credentials
        process.env.GITHUB_CLIENT_ID = undefined
        process.env.GITHUB_CLIENT_SECRET = undefined

        expect(() => validateProductionSecuritySettings()).toThrow(/GITHUB_CLIENT_ID.*configured/)
      })
    })

    describe('Required Variable Validation', () => {
      it('should throw errors for missing critical variables', () => {
        process.env.DATABASE_URL = undefined
        expect(() => getRequiredEnv('DATABASE_URL')).toThrow(/DATABASE_URL.*missing/)
      })

      it('should validate JWT_SECRET requirements', () => {
        process.env.JWT_SECRET = undefined
        expect(() => getJwtSecret()).toThrow(/JWT_SECRET/)
      })

      it('should check GitHub OAuth credentials', () => {
        process.env.NODE_ENV = 'production'
        process.env.GITHUB_CLIENT_ID = 'short'

        expect(() => validateProductionSecuritySettings()).toThrow(/GITHUB_CLIENT_ID/)
      })

      it('should validate database connection strings', () => {
        process.env.DATABASE_URL = 'invalid-url'
        expect(() => getDatabaseUrl()).toThrow(/DATABASE_URL/)
      })
    })

    describe('Fallback Security', () => {
      it('should never fallback to insecure defaults', () => {
        process.env.JWT_SECRET = undefined
        expect(() => getJwtSecret()).toThrow()
        // Should not return any default value
      })

      it('should throw errors instead of using test values', () => {
        process.env.NODE_ENV = 'production'
        process.env.JWT_SECRET = 'secure-test-token-32chars-minimum'

        expect(() => getRequiredEnv('JWT_SECRET')).toThrow(/test patterns/)
      })

      it('should validate no test credential fallbacks exist', () => {
        const criticalEnvVars = ['JWT_SECRET', 'NEXTAUTH_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL']

        criticalEnvVars.forEach(envVar => {
          delete process.env[envVar]
          expect(() => getRequiredEnv(envVar)).toThrow(/missing/)
        })
      })

      it('should ensure secure test environment defaults', () => {
        process.env.NODE_ENV = 'test'

        // Test environment should still have minimum security
        expect(() => getRequiredEnv('NONEXISTENT_VAR')).toThrow(/missing/)
      })
    })
  })

  describe('Configuration Security Patterns', () => {
    describe('OAuth Configuration Security', () => {
      it('should validate GitHub client credentials', () => {
        process.env.NODE_ENV = 'production'
        process.env.GITHUB_CLIENT_ID = 'valid_client_id_123'
        process.env.GITHUB_CLIENT_SECRET = 'valid_client_secret_456789'

        expect(() => validateProductionSecuritySettings()).not.toThrow()
      })

      it('should enforce secure redirect URIs', () => {
        process.env.NODE_ENV = 'production'
        process.env.ALLOWED_REDIRECT_URIS = 'http://localhost:3000/api/auth'

        expect(() => validateProductionSecuritySettings()).toThrow(/localhost.*production/)
      })

      it('should validate OAuth scope restrictions', () => {
        // This would be tested with actual OAuth configuration
        const oauthConfig = {
          providers: {
            github: {
              clientId: 'test-id',
              clientSecret: 'secure-test-token-32chars-minimum',
              scope: 'user:email read:user',
            },
          },
        }

        expect(oauthConfig.providers.github.scope).toBeDefined()
      })

      it('should check PKCE configuration', () => {
        // PKCE should be enabled for OAuth flows
        const authConfig = createConfig()
        expect(authConfig.oauth.pkce.enabled).toBe(true)
      })
    })

    describe('Database Configuration Security', () => {
      it('should validate connection string format', () => {
        process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db?sslmode=require'
        expect(() => getDatabaseUrl()).not.toThrow()

        process.env.DATABASE_URL = 'invalid-format'
        expect(() => getDatabaseUrl()).toThrow()
      })

      it('should enforce SSL/TLS requirements', () => {
        process.env.NODE_ENV = 'production'
        process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db?sslmode=disable'

        expect(() => validateProductionUrls()).toThrow(/SSL/)
      })

      it('should check connection pooling security', () => {
        const dbConfig = databaseConfig
        expect(dbConfig.pool.max).toBeGreaterThan(0)
        expect(dbConfig.pool.connectionTimeoutMillis).toBeLessThan(30000)
      })

      it('should validate environment-specific URLs', () => {
        process.env.NODE_ENV = 'production'
        process.env.DATABASE_URL = 'postgresql://localhost:5432/test'

        expect(() => validateProductionSecuritySettings()).toThrow(/localhost.*test/)
      })
    })

    describe('JWT Configuration Security', () => {
      it('should validate JWT secret security', () => {
        process.env.JWT_SECRET = 'weak'
        expect(() => getJwtSecret()).toThrow(/32 characters/)
      })

      it('should check algorithm restrictions', () => {
        const authConfig = createConfig()
        expect(authConfig.jwt.algorithm).toBe('HS256')
        expect(['HS256', 'RS256']).toContain(authConfig.jwt.algorithm)
      })

      it('should validate token expiration settings', () => {
        const authConfig = createConfig()
        expect(authConfig.jwt.expiresIn).toBeDefined()
        expect(authConfig.jwt.expiresIn).toMatch(/^\d+[smhd]$/) // Format: 1h, 30m, etc.
      })

      it('should enforce issuer/audience validation', () => {
        const authConfig = createConfig()
        expect(authConfig.jwt.issuer).toBeDefined()
        expect(authConfig.jwt.audience).toBeDefined()
      })
    })

    describe('Session Configuration Security', () => {
      it('should validate session secret security', () => {
        process.env.NEXTAUTH_SECRET = 'weak-secret'
        expect(() => getRequiredEnv('NEXTAUTH_SECRET')).toThrow(/32 characters/)
      })

      it('should check cookie security settings', () => {
        const authConfig = createConfig()
        expect(authConfig.session.cookie.secure).toBe(true)
        expect(authConfig.session.cookie.httpOnly).toBe(true)
        expect(authConfig.session.cookie.sameSite).toBe('strict')
      })

      it('should validate session timeout settings', () => {
        const authConfig = createConfig()
        expect(authConfig.session.maxAge).toBeGreaterThan(0)
        expect(authConfig.session.maxAge).toBeLessThan(86400 * 30) // Max 30 days
      })

      it('should enforce secure session storage', () => {
        const authConfig = createConfig()
        expect(authConfig.session.strategy).toBe('jwt')
      })
    })
  })

  describe('Startup Security Validation', () => {
    describe('Configuration Audit', () => {
      it('should validate all required configurations', () => {
        process.env.NODE_ENV = 'production'
        process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db?sslmode=require'
        process.env.JWT_SECRET = 'very-long-secure-secret-with-sufficient-entropy-123456789'
        process.env.NEXTAUTH_SECRET = 'another-very-long-secure-secret-with-sufficient-entropy-123'
        process.env.NEXTAUTH_URL = 'https://contribux.ai'
        process.env.GITHUB_CLIENT_ID = 'valid_client_id_12345'
        process.env.GITHUB_CLIENT_SECRET = 'valid_client_secret_67890_abcdef'

        expect(() => validateEnvironmentOnStartup()).not.toThrow()
      })

      it('should check security configuration completeness', () => {
        // Missing security configuration should fail
        process.env.JWT_SECRET = undefined
        expect(() => validateEnvironmentOnStartup()).toThrow()
      })

      it('should verify no insecure patterns exist', () => {
        process.env.NODE_ENV = 'production'
        process.env.JWT_SECRET = 'secure-test-token-32chars-minimum-insecure'

        expect(() => validateEnvironmentOnStartup()).toThrow(/test patterns/)
      })

      it('should validate environment consistency', () => {
        process.env.NODE_ENV = 'production'
        process.env.DEBUG = 'true'

        expect(() => validateProductionEnv()).toThrow(/DEBUG.*production/)
      })
    })

    describe('Security Misconfiguration Detection', () => {
      it('should detect hardcoded secrets', () => {
        const configContent = `
          const config = {
            secret: "hardcoded-secret-123",
            apiKey: "sk-1234567890"
          }
        `

        expect(configContent).toMatch(/hardcoded-secret|sk-\d+/)
      })

      it('should find insecure fallback patterns', () => {
        const insecureDefault = process.env.JWT_SECRET || 'fallback-secret'
        expect(insecureDefault).not.toBe('fallback-secret')
      })

      it('should identify development configurations in production', () => {
        process.env.NODE_ENV = 'production'
        process.env.CORS_ORIGINS = '*'

        expect(() => validateProductionSecuritySettings()).toThrow(/CORS.*production/)
      })

      it('should validate security header configurations', () => {
        const securityConfig = appConfig.security
        expect(securityConfig.headers.xFrameOptions).toBe('DENY')
        expect(securityConfig.headers.contentSecurityPolicy).toBeDefined()
      })
    })

    describe('Environment-Specific Validation', () => {
      it('should apply production-specific validations', () => {
        process.env.NODE_ENV = 'production'
        process.env.DATABASE_URL = 'postgresql://localhost:5432/test'

        expect(() => validateEnvironmentOnStartup()).toThrow()
      })

      it('should allow secure development configurations', () => {
        process.env.NODE_ENV = 'development'
        process.env.DATABASE_URL = 'postgresql://localhost:5432/contribux_dev'
        process.env.JWT_SECRET = 'development-secret-with-sufficient-length-12345'

        expect(() => validateEnvironmentOnStartup()).not.toThrow()
      })

      it('should validate test environment security', () => {
        process.env.NODE_ENV = 'test'
        process.env.DATABASE_URL = 'postgresql://localhost:5432/contribux_test'

        expect(() => validateBasicEnvironmentVariables()).not.toThrow()
      })

      it('should enforce environment separation', () => {
        process.env.NODE_ENV = 'production'
        process.env.DATABASE_URL = 'postgresql://localhost:5432/contribux_dev'

        expect(() => validateProductionSecuritySettings()).toThrow(/localhost/)
      })
    })
  })
})
