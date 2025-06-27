/**
 * Environment Startup Validation Security Tests
 *
 * These tests verify that the application startup process correctly validates
 * all security requirements and fails securely in production scenarios.
 *
 * Focus: Zero-trust validation during application initialization
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Environment Startup Validation Security', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockExit: ReturnType<typeof vi.spyOn> & { lastCallCode?: number | string | null | undefined }
  let mockConsoleError: ReturnType<typeof vi.spyOn>
  let mockConsoleLog: ReturnType<typeof vi.spyOn>

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

    // Mock console methods to capture output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      // Suppress console.error during tests
    })
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {
      // Suppress console.log during tests
    })

    // Clear environment to start fresh
    process.env.SKIP_ENV_VALIDATION = undefined

    // Clear all security-related environment variables
    Object.keys(process.env).forEach(key => {
      if (
        key.startsWith('DATABASE_') ||
        key.startsWith('JWT_') ||
        key.startsWith('ENCRYPTION_') ||
        key.startsWith('GITHUB_') ||
        key.startsWith('GOOGLE_') ||
        key.startsWith('NEXT_') ||
        key.startsWith('CORS_') ||
        key === 'NODE_ENV'
      ) {
        delete process.env[key]
      }
    })
  })

  afterEach(() => {
    process.env = originalEnv
    mockExit.mockRestore()
    mockConsoleError.mockRestore()
    mockConsoleLog.mockRestore()
  })

  describe('Production Startup Scenarios', () => {
    it('should succeed with complete secure production environment', async () => {
      // Set complete, secure production environment
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL =
        'postgresql://neondb_owner:secure_pass@ep-morning-sea-a5b6c7d8.us-east-1.aws.neon.tech/neondb?sslmode=require'
      process.env.JWT_SECRET = 'Kf9Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7XwRt' // Strong, unique secret
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321' // Strong hex key
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai,https://app.contribux.ai'
      process.env.ALLOWED_REDIRECT_URIS =
        'https://contribux.ai/api/auth/github/callback,https://app.contribux.ai/api/auth/github/callback'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
      expect(mockExit).not.toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ Environment validation completed for production environment')
      )
    })

    it('should fail when production has incomplete OAuth configuration', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      // Missing GITHUB_CLIENT_SECRET
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Environment validation failed')
      )
    })

    it('should validate complete environment with Google OAuth', async () => {
      // Test with complete Google OAuth configuration
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      process.env.GOOGLE_CLIENT_ID =
        '123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com'
      process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-abcdefghijklmnopqrstuvwxyz123456'
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(
          'OAuth configuration validation passed for providers: GitHub, Google'
        )
      )
    })

    it('should fail with incomplete Google OAuth configuration', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      process.env.GOOGLE_CLIENT_ID =
        '123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com'
      // Missing GOOGLE_CLIENT_SECRET
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })

  describe('Development Environment Validation', () => {
    it('should succeed with minimal development environment', async () => {
      // Set minimal development environment
      process.env.NODE_ENV = 'development'
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/contribux_dev'
      process.env.JWT_SECRET = 'development-jwt-secret-with-sufficient-length-and-entropy-for-dev'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ Development environment validation passed')
      )
    })

    it('should still require secure JWT secret in development', async () => {
      process.env.NODE_ENV = 'development'
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/contribux_dev'
      process.env.JWT_SECRET = 'weak' // Too weak
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('should require encryption key in development', async () => {
      process.env.NODE_ENV = 'development'
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/contribux_dev'
      process.env.JWT_SECRET = 'development-jwt-secret-with-sufficient-length-and-entropy-for-dev'
      // Missing ENCRYPTION_KEY

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY.*required.*development/)
    })
  })

  describe('Test Environment Validation', () => {
    it('should succeed with test environment setup', async () => {
      process.env.NODE_ENV = 'test'
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/contribux_test'
      process.env.JWT_SECRET = '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
      process.env.ENCRYPTION_KEY =
        'test567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      expect(() => validateEnvironmentOnStartup()).not.toThrow()
    })

    it('should still require encryption key in test environment', async () => {
      process.env.NODE_ENV = 'test'
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/contribux_test'
      process.env.JWT_SECRET = '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
      // Missing ENCRYPTION_KEY

      const { getEncryptionKey } = await import('@/lib/validation/env')

      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY.*required.*test/)
    })
  })

  describe('Security Configuration Validation', () => {
    it('should validate complete security configuration', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai'

      const { validateSecurityConfig } = await import('@/lib/validation/env')

      expect(() => validateSecurityConfig()).not.toThrow()
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ JWT_SECRET validation passed')
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✓ OAuth configuration validation passed')
      )
    })

    it('should warn about OAuth issues in development but not fail', async () => {
      process.env.NODE_ENV = 'development'
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/contribux_dev'
      process.env.JWT_SECRET = 'development-jwt-secret-with-sufficient-length-and-entropy-for-dev'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.ENABLE_OAUTH = 'true'
      // Missing OAuth credentials

      const { validateSecurityConfig } = await import('@/lib/validation/env')

      expect(() => validateSecurityConfig()).not.toThrow()
      // Should warn but not fail in development
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('OAuth configuration issues:')
      )
    })
  })

  describe('Rate Limiting and CORS Validation', () => {
    it('should validate rate limiting configuration', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai'
      process.env.RATE_LIMIT_MAX = '2000' // Too high

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringMatching(/rate limit too high/i))
    })

    it('should validate redirect URI format', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
      process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
      process.env.ENCRYPTION_KEY =
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      process.env.GITHUB_CLIENT_ID = 'Iv1.a1b2c3d4e5f6g7h8'
      process.env.GITHUB_CLIENT_SECRET =
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
      process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
      process.env.CORS_ORIGINS = 'https://contribux.ai'
      process.env.ALLOWED_REDIRECT_URIS = 'invalid-uri,https://valid.com/callback'

      const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

      validateEnvironmentOnStartup()
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringMatching(/invalid redirect uri/i))
    })
  })

  describe('Database URL Validation', () => {
    it('should accept valid PostgreSQL URLs', async () => {
      const validUrls = [
        'postgresql://user:pass@localhost:5432/dbname',
        'postgresql://neondb_owner:npg_abc123@ep-host.azure.neon.tech/neondb?sslmode=require',
        'postgresql://user:pass@host.com:5432/dbname?sslmode=prefer&connect_timeout=10',
      ]

      for (const url of validUrls) {
        vi.stubEnv('NODE_ENV', 'test')
        process.env.DATABASE_URL = url
        process.env.JWT_SECRET =
          '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
        process.env.ENCRYPTION_KEY =
          'test567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'

        const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

        expect(() => validateEnvironmentOnStartup()).not.toThrow()
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
        vi.stubEnv('NODE_ENV', 'test')
        process.env.DATABASE_URL = url
        process.env.JWT_SECRET =
          '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab'
        process.env.ENCRYPTION_KEY =
          'test567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'

        const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

        validateEnvironmentOnStartup()
        expect(mockExit).toHaveBeenCalledWith(1)
      }
    })
  })

  describe('GitHub Client ID Format Validation', () => {
    it('should accept valid GitHub client ID formats', async () => {
      const validIds = [
        'Iv1.a1b2c3d4e5f6g7h8', // OAuth App format
        'abcdefghijklmnopqrst', // GitHub App format (20 chars)
      ]

      for (const clientId of validIds) {
        vi.stubEnv('NODE_ENV', 'production')
        process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
        process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
        process.env.ENCRYPTION_KEY =
          'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
        process.env.GITHUB_CLIENT_ID = clientId
        process.env.GITHUB_CLIENT_SECRET =
          'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
        process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
        process.env.CORS_ORIGINS = 'https://contribux.ai'

        const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

        expect(() => validateEnvironmentOnStartup()).not.toThrow()
      }
    })

    it('should reject invalid GitHub client ID formats', async () => {
      const invalidIds = ['invalid-format', 'Iv1.short', 'toolongforgithubappformat1234567890']

      for (const clientId of invalidIds) {
        vi.stubEnv('NODE_ENV', 'production')
        process.env.DATABASE_URL = 'postgresql://user:pass@host.com:5432/db'
        process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
        process.env.ENCRYPTION_KEY =
          'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
        process.env.GITHUB_CLIENT_ID = clientId
        process.env.GITHUB_CLIENT_SECRET =
          'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123'
        process.env.NEXT_PUBLIC_APP_URL = 'https://contribux.ai'
        process.env.CORS_ORIGINS = 'https://contribux.ai'

        const { validateEnvironmentOnStartup } = await import('@/lib/validation/env')

        validateEnvironmentOnStartup()
        expect(mockExit).toHaveBeenCalledWith(1)
      }
    })
  })

  describe('Zero-Trust Environment Validation', () => {
    it('should enforce zero-trust principles across all environments', async () => {
      const environments = ['development', 'test', 'production']

      for (const env of environments) {
        // Test missing encryption key in each environment
        process.env.NODE_ENV = env
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
        process.env.JWT_SECRET = 'secure-jwt-secret-with-sufficient-length-and-entropy-32chars'
        process.env.ENCRYPTION_KEY = undefined

        const { getEncryptionKey } = await import('@/lib/validation/env')

        expect(() => getEncryptionKey()).toThrow(new RegExp(`ENCRYPTION_KEY.*required.*${env}`))
      }
    })

    it('should never allow empty or whitespace-only values', async () => {
      const emptyValues = ['', '   ', '\t\t', '\n\n']

      for (const emptyValue of emptyValues) {
        vi.stubEnv('NODE_ENV', 'production')
        process.env.JWT_SECRET = emptyValue

        const { getJwtSecret } = await import('@/lib/validation/env')

        expect(() => getJwtSecret()).toThrow(/required.*cannot be empty/)
      }
    })

    it('should provide security guidance in all error messages', async () => {
      const testCases = [
        {
          scenario: 'missing encryption key',
          setup: () => {
            process.env.ENCRYPTION_KEY = undefined
          },
          fn: 'getEncryptionKey',
          expectedGuidance: ['openssl rand -hex 32', '64-character hexadecimal', '256 bits'],
        },
        {
          scenario: 'invalid JWT secret',
          setup: () => {
            process.env.JWT_SECRET = 'weak'
          },
          fn: 'getJwtSecret',
          expectedGuidance: ['32 characters', 'entropy'],
        },
      ]

      for (const testCase of testCases) {
        testCase.setup()

        const module = await import('@/lib/validation/env')
        const fn = module[testCase.fn as keyof typeof module] as () => string

        try {
          fn()
          expect.fail(`Should have thrown an error for ${testCase.scenario}`)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)

          for (const guidance of testCase.expectedGuidance) {
            expect(errorMessage).toContain(guidance)
          }
        }
      }
    })
  })
})
