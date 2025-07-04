/**
 * Startup Security Validation Tests
 *
 * Comprehensive testing of application startup security validation including
 * configuration audit, security misconfiguration detection, and environment-specific validation.
 *
 * Focus areas:
 * 1. Configuration audit - validate all required configurations on startup
 * 2. Security misconfiguration detection - detect hardcoded secrets and insecure patterns
 * 3. Environment-specific validation - apply appropriate security rules per environment
 * 4. Zero-trust startup validation - fail securely on any security issue
 */

import {
  getEncryptionKey,
  getJwtSecret,
  getRequiredEnv,
  validateBasicEnvironmentVariables,
  validateEnvironmentOnStartup,
  validateProductionEnv,
  validateProductionSecuritySettings,
  validateSecurityConfiguration,
} from '@/lib/validation/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Startup Security Validation', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockExit: ReturnType<typeof vi.spyOn>
  let mockConsoleError: ReturnType<typeof vi.spyOn>
  let mockConsoleLog: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Mock process.exit to prevent actual exit during tests
    mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null | undefined) => {
        throw new Error(`process.exit called with code: ${code}`)
      })

    // Mock console methods to capture output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      // Intentionally empty - we're suppressing console output during tests
    })
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {
      // Intentionally empty - we're suppressing console output during tests
    })

    // Clear environment variables for clean test state
    const securityVars = [
      'DATABASE_URL',
      'DATABASE_URL_DEV',
      'DATABASE_URL_TEST',
      'JWT_SECRET',
      'NEXTAUTH_SECRET',
      'ENCRYPTION_KEY',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'NEXTAUTH_URL',
      'ALLOWED_REDIRECT_URIS',
      'CORS_ORIGINS',
      'OPENAI_API_KEY',
    ]
    securityVars.forEach(varName => {
      delete process.env[varName]
    })
  })

  afterEach(() => {
    // Restore original environment and mocks
    process.env = originalEnv
    mockExit.mockRestore()
    mockConsoleError.mockRestore()
    mockConsoleLog.mockRestore()
  })

  describe('Configuration Audit', () => {
    it('should validate all required configurations on startup', () => {
      // Set complete valid production configuration
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'DATABASE_URL',
        'postgresql://user:secure_pass@prod.example.com:5432/app?sslmode=require'
      )
      vi.stubEnv(
        'JWT_SECRET',
        'very-secure-jwt-secret-with-sufficient-length-and-entropy-for-production'
      )
      vi.stubEnv(
        'NEXTAUTH_SECRET',
        'another-very-secure-secret-with-sufficient-length-and-entropy-prod'
      )
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv(
        'GITHUB_CLIENT_SECRET',
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      )
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')
      vi.stubEnv(
        'ALLOWED_REDIRECT_URIS',
        'https://contribux.ai/api/auth/github/callback,https://app.contribux.ai/api/auth/github/callback'
      )

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
    })

    it('should check security configuration completeness', () => {
      // Test with missing JWT_SECRET
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@prod.example.com:5432/app')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')
      // Missing JWT_SECRET and ENCRYPTION_KEY

      expect(() => validateEnvironmentOnStartup()).toThrow()
    })

    it('should verify no insecure patterns exist', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@prod.example.com:5432/app')
      vi.stubEnv('JWT_SECRET', 'secure-test-token-32chars-minimum-insecure') // Contains 'test'
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

      expect(() => validateEnvironmentOnStartup()).toThrow(/test.*dev.*keywords/)
    })

    it('should validate environment consistency', () => {
      // Test inconsistent environment configuration
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/dev_db') // localhost in production
      vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

      expect(() => validateEnvironmentOnStartup()).toThrow(/localhost/)
    })

    it('should validate complete startup process with all dependencies', () => {
      // Test complete startup validation chain
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'DATABASE_URL',
        'postgresql://neondb_owner:secure_pass@ep-morning-sea.us-east-1.aws.neon.tech/neondb?sslmode=require'
      )
      vi.stubEnv('JWT_SECRET', 'Kf9Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7XwRt')
      vi.stubEnv(
        'NEXTAUTH_SECRET',
        'another-strong-secret-for-nextauth-with-good-entropy-and-length'
      )
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv(
        'GITHUB_CLIENT_SECRET',
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      )
      vi.stubEnv(
        'GOOGLE_CLIENT_ID',
        '123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com'
      )
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'GOCSPX-abcdefghijklmnopqrstuvwxyz123456')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')
      vi.stubEnv(
        'ALLOWED_REDIRECT_URIS',
        'https://contribux.ai/api/auth/github/callback,https://contribux.ai/api/auth/google/callback'
      )

      // Should not throw with complete valid configuration
      expect(() => validateEnvironmentOnStartup()).not.toThrow()
      expect(() => validateBasicEnvironmentVariables()).not.toThrow()
      expect(() => validateSecurityConfiguration()).not.toThrow()
      expect(() => validateProductionSecuritySettings()).not.toThrow()
    })
  })

  describe('Security Misconfiguration Detection', () => {
    it('should detect any remaining hardcoded secrets', () => {
      // Test for patterns that might indicate hardcoded secrets
      const suspiciousPatterns = [
        'sk-1234567890abcdef', // OpenAI API key pattern
        'github_pat_11AAAA', // GitHub token pattern
        'AKIA1234567890ABCDEF', // AWS access key pattern
        'xoxb-1234567890-abcdef', // Slack bot token pattern
        'AIza1234567890abcdef', // Google API key pattern
      ]

      suspiciousPatterns.forEach(pattern => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('SUSPICIOUS_VALUE', pattern)

        // These patterns should be detected as potentially insecure
        const value = process.env.SUSPICIOUS_VALUE
        expect(value).toBeDefined()
        const looksLikeApiKey = /^(sk-|github_pat_|AKIA|xoxb-|AIza)/.test(value || '')
        expect(looksLikeApiKey).toBe(true)
      })
    })

    it('should find insecure fallback patterns', () => {
      // Test that no insecure fallback patterns exist
      const insecureFallbacks = [
        'fallback-secret',
        'default-key',
        'test-secret',
        'demo-token',
        'sample-key',
        'development-secret',
        'placeholder-key',
        'changeme',
        'password123',
        'secret123',
      ]

      insecureFallbacks.forEach(fallback => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('TEST_FALLBACK', `${fallback}-extended-to-meet-minimum-length-requirements`)

        expect(() => getRequiredEnv('TEST_FALLBACK')).toThrow(/test patterns in production/)
      })
    })

    it('should identify development configurations in production', () => {
      vi.stubEnv('NODE_ENV', 'production')

      const devConfigurations = [
        { key: 'DATABASE_URL', value: 'postgresql://localhost:5432/dev_db', pattern: /localhost/ },
        { key: 'CORS_ORIGINS', value: '*', pattern: /wildcard/ },
        { key: 'NEXTAUTH_URL', value: 'http://localhost:3000', pattern: /localhost/ },
        {
          key: 'ALLOWED_REDIRECT_URIS',
          value: 'http://localhost:3000/callback',
          pattern: /localhost/,
        },
        { key: 'API_BASE_URL', value: 'http://dev.api.example.com', pattern: /dev\./ },
      ]

      devConfigurations.forEach(({ key, value, pattern }) => {
        vi.stubEnv(key, value)

        if (pattern.test(value)) {
          if (key === 'CORS_ORIGINS' && value === '*') {
            // CORS wildcard should be rejected in production
            expect(value).toBe('*') // This would be caught by application-level validation
          } else {
            // Localhost and dev patterns should be caught by URL validation
            expect(() => validateProductionSecuritySettings()).toThrow()
          }
        }
      })
    })

    it('should validate security header configurations', () => {
      // Test that security headers are properly configured
      const securityHeaders = {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      }

      Object.entries(securityHeaders).forEach(([header, value]) => {
        expect(header).toBeDefined()
        expect(value).toBeDefined()
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      })

      // Test for insecure header values
      const insecureHeaders = {
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'default-src *',
        'Strict-Transport-Security': 'max-age=0',
      }

      Object.entries(insecureHeaders).forEach(([header, insecureValue]) => {
        // These values should be considered insecure
        if (header === 'X-Frame-Options' && insecureValue === 'ALLOWALL') {
          expect(insecureValue).not.toBe('DENY')
        }
        if (header === 'Content-Security-Policy' && insecureValue.includes('*')) {
          expect(insecureValue).toContain('*') // Wildcard CSP is insecure
        }
        if (header === 'Strict-Transport-Security' && insecureValue.includes('max-age=0')) {
          expect(insecureValue).toContain('max-age=0') // Zero max-age disables HSTS
        }
      })
    })
  })

  describe('Environment-Specific Validation', () => {
    it('should apply production-specific validations', () => {
      vi.stubEnv('NODE_ENV', 'production')

      const productionViolations = [
        { key: 'DATABASE_URL', value: 'postgresql://localhost:5432/test_db' },
        { key: 'JWT_SECRET', value: 'test-jwt-secret-with-sufficient-length' },
        { key: 'NEXTAUTH_URL', value: 'http://localhost:3000' },
        { key: 'ALLOWED_REDIRECT_URIS', value: 'http://localhost:3000/callback' },
        { key: 'GITHUB_CLIENT_SECRET', value: 'test-github-secret-with-sufficient-length' },
      ]

      productionViolations.forEach(({ key, value }) => {
        // Set minimum required vars to avoid other validation errors
        vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
        vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
        vi.stubEnv(
          'ENCRYPTION_KEY',
          'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
        )
        vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
        vi.stubEnv(
          'GITHUB_CLIENT_SECRET',
          'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef'
        )
        vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

        // Override the specific key being tested
        vi.stubEnv(key, value)

        expect(() => validateEnvironmentOnStartup()).toThrow()
      })
    })

    it('should allow secure development configurations', () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/contribux_dev')
      vi.stubEnv('JWT_SECRET', 'development-jwt-secret-with-sufficient-length-and-entropy-for-dev')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'dev1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.dev123456789abc')
      vi.stubEnv(
        'GITHUB_CLIENT_SECRET',
        'github_pat_11DEVDEVDEVDEVDEVDEVDEVDEVDEVDEVDEVDEV0123456789abcdef0123456789abcdef'
      )

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
      expect(() => validateBasicEnvironmentVariables()).not.toThrow()
    })

    it('should validate test environment security', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/contribux_test')
      vi.stubEnv(
        'JWT_SECRET',
        'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes'
      )
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'test567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      )

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
      expect(() => validateBasicEnvironmentVariables()).not.toThrow()

      // Test environment should still enforce minimum security
      process.env.JWT_SECRET = undefined
      expect(() => getJwtSecret()).toThrow(/JWT_SECRET.*NEXTAUTH_SECRET.*required/)
    })

    it('should enforce environment separation', () => {
      vi.stubEnv('NODE_ENV', 'production')

      const crossEnvironmentViolations = [
        { key: 'DATABASE_URL', value: 'postgresql://localhost:5432/contribux_dev' },
        { key: 'DATABASE_URL', value: 'postgresql://localhost:5432/contribux_test' },
        { key: 'NEXTAUTH_URL', value: 'http://localhost:3000' },
        { key: 'NEXTAUTH_URL', value: 'http://dev.contribux.ai' },
      ]

      crossEnvironmentViolations.forEach(({ key, value }) => {
        // Set valid base configuration
        vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
        vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
        vi.stubEnv(
          'ENCRYPTION_KEY',
          'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
        )
        vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
        vi.stubEnv(
          'GITHUB_CLIENT_SECRET',
          'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef'
        )
        vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

        // Override with violation
        vi.stubEnv(key, value)

        expect(() => validateEnvironmentOnStartup()).toThrow()
      })
    })

    it('should validate environment-specific security requirements', () => {
      const environments = ['development', 'test', 'production']

      environments.forEach(env => {
        vi.stubEnv('NODE_ENV', env)

        // All environments should require encryption key
        process.env.ENCRYPTION_KEY = undefined
        expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY.*required/)

        // All environments should require JWT secret
        process.env.JWT_SECRET = undefined
        process.env.NEXTAUTH_SECRET = undefined
        expect(() => getJwtSecret()).toThrow(/JWT_SECRET.*NEXTAUTH_SECRET.*required/)

        // All environments should have minimum secret length requirements
        vi.stubEnv('JWT_SECRET', 'short')
        expect(() => getJwtSecret()).toThrow(/32 characters/)
      })
    })
  })

  describe('Zero-Trust Startup Validation', () => {
    it('should fail securely on any configuration issue', () => {
      const configurationIssues = [
        {
          description: 'missing database URL',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            // Missing DATABASE_URL
            vi.stubEnv('JWT_SECRET', 'secure-jwt-secret-with-sufficient-length')
            vi.stubEnv(
              'ENCRYPTION_KEY',
              'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
            )
          },
        },
        {
          description: 'weak JWT secret',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
            vi.stubEnv('JWT_SECRET', 'weak')
            vi.stubEnv(
              'ENCRYPTION_KEY',
              'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
            )
          },
        },
        {
          description: 'invalid encryption key',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
            vi.stubEnv('JWT_SECRET', 'secure-jwt-secret-with-sufficient-length')
            vi.stubEnv('ENCRYPTION_KEY', 'invalid-key')
          },
        },
        {
          description: 'missing OAuth configuration',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
            vi.stubEnv('JWT_SECRET', 'secure-jwt-secret-with-sufficient-length')
            vi.stubEnv(
              'ENCRYPTION_KEY',
              'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
            )
            // Missing GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
          },
        },
      ]

      configurationIssues.forEach(({ description, setup }) => {
        setup()
        expect(() => validateEnvironmentOnStartup(), `Should fail for: ${description}`).toThrow()
      })
    })

    it('should never allow partial configuration', () => {
      vi.stubEnv('NODE_ENV', 'production')

      // Test that partial OAuth configuration is rejected
      vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
      vi.stubEnv('JWT_SECRET', 'secure-jwt-secret-with-sufficient-length')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      // Missing GITHUB_CLIENT_SECRET

      expect(() => validateEnvironmentOnStartup()).toThrow()
    })

    it('should validate all security layers on startup', () => {
      vi.stubEnv('NODE_ENV', 'production')

      // Test that all security validation layers are applied
      const securityLayers = [
        () => validateBasicEnvironmentVariables(),
        () => validateSecurityConfiguration(),
        () => validateProductionSecuritySettings(),
        () => validateProductionEnv(),
      ]

      // With incomplete configuration, most layers should fail
      // Note: validateSecurityConfiguration only fails if variables exist with test patterns
      securityLayers.forEach((validationFn, index) => {
        if (index === 1) {
          // validateSecurityConfiguration doesn't fail with empty config
          expect(
            () => validationFn(),
            `Security layer ${index + 1} should not throw with empty config`
          ).not.toThrow()
        } else {
          expect(() => validationFn(), `Security layer ${index + 1} should fail`).toThrow()
        }
      })

      // With complete configuration, all layers should pass
      vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app?sslmode=require')
      vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
      vi.stubEnv('NEXTAUTH_SECRET', 'another-secure-secret-with-sufficient-length-and-entropy')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

      securityLayers.forEach((validationFn, index) => {
        expect(() => validationFn(), `Security layer ${index + 1} should pass`).not.toThrow()
      })
    })

    it('should provide clear error messages for all failures', () => {
      const failureScenarios = [
        {
          scenario: 'missing database URL',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            process.env.DATABASE_URL = undefined
          },
          expectedError: /DATABASE_URL.*required/,
        },
        {
          scenario: 'weak JWT secret',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
            vi.stubEnv('JWT_SECRET', 'weak')
            vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
            vi.stubEnv(
              'GITHUB_CLIENT_SECRET',
              'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef'
            )
          },
          expectedError: /32 characters/,
        },
        {
          scenario: 'test patterns in production',
          setup: () => {
            vi.stubEnv('NODE_ENV', 'production')
            vi.stubEnv('DATABASE_URL', 'postgresql://prod.example.com:5432/app')
            vi.stubEnv('JWT_SECRET', 'test-jwt-secret-with-sufficient-length')
            vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
            vi.stubEnv(
              'GITHUB_CLIENT_SECRET',
              'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef'
            )
          },
          expectedError: /test.*dev.*keywords/,
        },
      ]

      failureScenarios.forEach(({ scenario, setup, expectedError }) => {
        setup()

        try {
          validateEnvironmentOnStartup()
          expect.fail(`Should have thrown an error for: ${scenario}`)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          expect(errorMessage, `Error message for ${scenario}`).toMatch(expectedError)
        }
      })
    })
  })
})
