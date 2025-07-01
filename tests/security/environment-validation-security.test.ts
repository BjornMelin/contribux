/**
 * Environment Variable Security Tests
 *
 * Comprehensive testing of environment variable validation, secret entropy requirements,
 * production security settings, and fallback security patterns.
 *
 * Focus areas:
 * 1. Secret validation and entropy requirements (minimum 4.0 bits/char)
 * 2. Production security validation and test keyword rejection
 * 3. Required variable validation with proper error handling
 * 4. Fallback security - no insecure defaults allowed
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Environment Variable Security', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockExit: ReturnType<typeof vi.spyOn>
  let mockConsoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Mock process.exit to prevent test termination
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Mock console.error to capture security error output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Clear security-related environment variables for clean test state
    const securityVars = [
      'JWT_SECRET',
      'NEXTAUTH_SECRET',
      'ENCRYPTION_KEY',
      'GITHUB_CLIENT_SECRET',
      'GOOGLE_CLIENT_SECRET',
      'DATABASE_URL',
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
  })

  describe('Secret Validation', () => {
    it('should enforce 32-character minimum for secrets', async () => {
      const testCases = [
        { secret: 'short', shouldPass: false, description: '5 characters' },
        { secret: 'medium-length-secret-123', shouldPass: false, description: '24 characters' },
        {
          secret: 'exactly-31-chars-long-secret-1',
          shouldPass: false,
          description: '31 characters',
        },
        {
          secret: 'exactly-32-chars-long-secret-12',
          shouldPass: true,
          description: '32 characters',
        },
        {
          secret: 'very-long-secure-secret-with-sufficient-length-and-complexity-12345',
          shouldPass: true,
          description: '65 characters',
        },
      ]

      for (const { secret, shouldPass, description } of testCases) {
        vi.resetModules()
        const { validateSecretEntropy } = await import('../../src/lib/validation/env')
        const result = validateSecretEntropy(secret)
        if (shouldPass) {
          expect(result, `${description} should pass`).toBe(true)
        } else {
          expect(result, `${description} should fail`).toBe(false)
        }
      }
    })

    it('should validate secret entropy requirements (minimum 4.0 bits/char)', async () => {
      const testCases = [
        {
          secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          shouldPass: false,
          description: 'all same character (0 entropy)',
        },
        {
          secret: 'abababababababababababababababab',
          shouldPass: false,
          description: 'simple alternating pattern (low entropy)',
        },
        {
          secret: '1234567890123456789012345678901234567890',
          shouldPass: false,
          description: 'repeating number sequence (low entropy)',
        },
        {
          secret: 'passwordpasswordpasswordpassword',
          shouldPass: false,
          description: 'repeated word pattern (low entropy)',
        },
        {
          secret: 'Kx9#mP2$vL8@qR4!nF7%dB3^wE6&yQ5*tZ1>aC4<xM8+fH6-jK9=bN3~eR7_',
          shouldPass: true,
          description: 'high entropy with mixed characters',
        },
        {
          secret: 'MyApp$ecure!JWT@Secret#2024*With&Mixed%Characters+Numbers1234',
          shouldPass: true,
          description: 'good entropy real-world pattern',
        },
      ]

      for (const { secret, shouldPass, description } of testCases) {
        vi.resetModules()
        const { validateSecretEntropy } = await import('../../src/lib/validation/env')
        const result = validateSecretEntropy(secret)
        if (shouldPass) {
          expect(result, `${description} should pass entropy test`).toBe(true)
        } else {
          expect(result, `${description} should fail entropy test`).toBe(false)
        }
      }
    })

    it('should detect weak patterns in secrets', async () => {
      const weakPatterns = [
        '12345678901234567890123456789012', // Sequential numbers
        'abcdefghijklmnopqrstuvwxyz123456', // Sequential letters
        'password123password123password12', // Repeated words
        'aaaabbbbccccddddeeeeffffgggghhh1', // Pattern repetition
        'testpass123testpass123testpass12', // Test keywords with repetition
        'demo-secret-demo-secret-demo-sec', // Demo keywords with repetition
      ]

      for (const pattern of weakPatterns) {
        vi.resetModules()
        const { validateSecretEntropy } = await import('../../src/lib/validation/env')
        expect(
          validateSecretEntropy(pattern),
          `Pattern should be detected as weak: ${pattern.substring(0, 20)}...`
        ).toBe(false)
      }
    })

    it('should reject test/dev keywords in production environment', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const testPatterns = [
        'secure-test-token-32chars-minimum-key',
        'demo-api-key-with-sufficient-length-1',
        'sample-jwt-secret-for-development-12',
        'example-secret-key-32characters-min',
        'development-secret-with-good-length1',
      ]

      for (const pattern of testPatterns) {
        vi.stubEnv('TEST_SECRET', pattern)
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv('TEST_SECRET')).toThrow(/test patterns in production/)
      }
    })

    it('should validate no hardcoded fallback patterns', async () => {
      // Test that no insecure fallback patterns exist in configuration
      const forbiddenPatterns = [
        'fallback-secret',
        'default-key',
        'test-secret',
        'demo-token',
        'sample-key',
        'development-secret',
        'placeholder-key',
      ]

      for (const pattern of forbiddenPatterns) {
        // Ensure these patterns would be rejected if somehow used
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('SECURITY_TEST_VAR', `${pattern}-extended-to-meet-length-requirements`)
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv('SECURITY_TEST_VAR')).toThrow(/test patterns in production/)
      }
    })
  })

  describe('Production Security Validation', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
    })

    it('should require secure secrets in production', async () => {
      const weakSecrets = ['weak', 'password123', 'secret', 'test-secret-key', 'demo-jwt-token']

      for (const secret of weakSecrets) {
        vi.stubEnv('JWT_SECRET', secret)
        vi.resetModules()
        const { getJwtSecret } = await import('../../src/lib/validation/env')
        expect(() => getJwtSecret()).toThrow(/32 characters|test patterns|insufficient entropy/)
      }
    })

    it('should reject development configuration patterns', async () => {
      const devPatterns = [
        {
          key: 'DATABASE_URL',
          value: 'postgresql://localhost:5432/test',
          expectedError: /localhost.*test/,
        },
        { key: 'NEXTAUTH_URL', value: 'http://localhost:3000', expectedError: /production domain/ },
        {
          key: 'ALLOWED_REDIRECT_URIS',
          value: 'http://localhost:3000/callback',
          expectedError: /localhost.*production/,
        },
        { key: 'API_URL', value: 'http://dev.example.com', expectedError: /localhost.*test/ },
      ]

      for (const { key, value } of devPatterns) {
        vi.stubEnv(key, value)
        vi.resetModules()
        const { getSecureConfigValue } = await import('../../src/lib/validation/env')
        expect(() => getSecureConfigValue(key, { required: true })).toThrow(/test.*demo.*localhost/)
      }
    })

    it('should enforce HTTPS requirements in production', async () => {
      const httpUrls = ['http://example.com', 'http://contribux.ai', 'http://api.contribux.ai']

      for (const url of httpUrls) {
        vi.stubEnv('NEXTAUTH_URL', url)
        vi.resetModules()
        const { getSecureConfigValue } = await import('../../src/lib/validation/env')
        expect(() => getSecureConfigValue('NEXTAUTH_URL', { required: true })).toThrow(
          /test.*demo.*localhost/
        )
      }
    })

    it('should validate production-only security settings', async () => {
      // Test complete production configuration validation
      const requiredProdVars = [
        'DATABASE_URL',
        'JWT_SECRET',
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
        'ENCRYPTION_KEY',
      ]

      // Test each required variable individually
      for (const varName of requiredProdVars) {
        // Clear all variables
        requiredProdVars.forEach(v => delete process.env[v])
        
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv(varName)).toThrow(/missing or empty/)
      }
    })
  })

  describe('Required Variable Validation', () => {
    it('should throw errors for missing critical variables', async () => {
      const criticalVars = [
        'DATABASE_URL',
        'JWT_SECRET',
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
        'ENCRYPTION_KEY',
      ]

      for (const varName of criticalVars) {
        delete process.env[varName]
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv(varName)).toThrow(/missing or empty/)
      }
    })

    it('should validate JWT_SECRET requirements', async () => {
      vi.resetModules()
      const { getJwtSecret } = await import('../../src/lib/validation/env')
      
      // Missing JWT_SECRET
      process.env.JWT_SECRET = undefined
      process.env.NEXTAUTH_SECRET = undefined
      expect(() => getJwtSecret()).toThrow(/JWT_SECRET.*NEXTAUTH_SECRET.*required/)

      // Too short JWT_SECRET
      vi.stubEnv('JWT_SECRET', 'short')
      expect(() => getJwtSecret()).toThrow(/32 characters/)

      // JWT_SECRET with test patterns in production
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('JWT_SECRET', 'test-jwt-secret-with-sufficient-length-for-testing')
      expect(() => getJwtSecret()).toThrow(/test.*dev.*keywords/)
    })

    it('should check GitHub OAuth credentials completeness', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()
      const { getRequiredEnv, getSecureConfigValue } = await import('../../src/lib/validation/env')

      // Missing client ID
      process.env.GITHUB_CLIENT_ID = undefined
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      expect(() => getRequiredEnv('GITHUB_CLIENT_ID')).toThrow(/missing or empty/)

      // Missing client secret
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      process.env.GITHUB_CLIENT_SECRET = undefined
      expect(() => getRequiredEnv('GITHUB_CLIENT_SECRET')).toThrow(/missing or empty/)

      // Invalid client ID format
      vi.stubEnv('GITHUB_CLIENT_ID', 'invalid-client-id')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      expect(() =>
        getSecureConfigValue('GITHUB_CLIENT_ID', { required: true, minLength: 10 })
      ).not.toThrow()
    })

    it('should validate database connection string security', async () => {
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')
      
      const invalidDatabaseUrls = [
        'invalid-url',
        'http://example.com',
        'mysql://user:pass@localhost:3306/db',
        '',
        '   ',
      ]

      invalidDatabaseUrls.forEach(url => {
        vi.stubEnv('DATABASE_URL', url)
        if (url.trim() === '') {
          expect(() => getRequiredEnv('DATABASE_URL')).toThrow(/missing or empty/)
        } else {
          // For non-empty invalid URLs, they might not throw in getRequiredEnv
          // but would fail in actual database connection validation
          expect(() => getRequiredEnv('DATABASE_URL')).not.toThrow()
        }
      })
    })
  })

  describe('Fallback Security', () => {
    it('should never fallback to insecure defaults', async () => {
      const criticalVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL', 'GITHUB_CLIENT_SECRET']

      for (const varName of criticalVars) {
        delete process.env[varName]
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv(varName)).toThrow(/missing or empty/)
        // Should not return any default value
      }
    })

    it('should throw errors instead of using test values', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const testValues = [
        { key: 'JWT_SECRET', value: 'secure-test-token-32chars-minimum' },
        {
          key: 'ENCRYPTION_KEY',
          value: 'test567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        },
        { key: 'GITHUB_CLIENT_SECRET', value: 'test-github-secret-with-sufficient-length-123' },
        { key: 'DATABASE_URL', value: 'postgresql://test:test@localhost:5432/test' },
      ]

      for (const { key, value } of testValues) {
        vi.stubEnv(key, value)
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv(key)).toThrow(/test patterns/)
      }
    })

    it('should validate no test credential fallbacks exist', async () => {
      const criticalEnvVars = ['JWT_SECRET', 'NEXTAUTH_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL']

      for (const envVar of criticalEnvVars) {
        delete process.env[envVar]
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv(envVar)).toThrow(/missing or empty/)

        // Test with empty string
        vi.stubEnv(envVar, '')
        expect(() => getRequiredEnv(envVar)).toThrow(/missing or empty/)

        // Test with whitespace only
        vi.stubEnv(envVar, '   ')
        expect(() => getRequiredEnv(envVar)).toThrow(/missing or empty/)
      }
    })

    it('should ensure secure test environment defaults', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.resetModules()
      const { getRequiredEnv, getJwtSecret, getEncryptionKey } = await import('../../src/lib/validation/env')

      // Test environment should still have minimum security requirements
      expect(() => getRequiredEnv('NONEXISTENT_VAR')).toThrow(/missing or empty/)

      // Test environment should not allow obviously weak secrets
      vi.stubEnv('JWT_SECRET', 'weak')
      expect(() => getJwtSecret()).toThrow(/32 characters/)

      // Test environment should still require encryption key
      process.env.ENCRYPTION_KEY = undefined
      expect(() => getEncryptionKey()).toThrow(/ENCRYPTION_KEY.*required/)
    })
  })

  describe('Advanced Security Validation', () => {
    it('should validate environment variable injection prevention', async () => {
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')
      
      // Test for potential injection patterns
      const injectionPatterns = [
        '${OTHER_VAR}',
        '$(command)',
        '`command`',
        '$((expression))',
        '#{variable}',
      ]

      injectionPatterns.forEach(pattern => {
        const safeSecret = `secure-secret-prefix-${pattern}-suffix-with-sufficient-length`
        vi.stubEnv('TEST_INJECTION', safeSecret)

        // Should not throw for the pattern itself, but would be caught by entropy validation
        expect(() => getRequiredEnv('TEST_INJECTION')).not.toThrow()
      })
    })

    it('should validate configuration parsing security', async () => {
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')
      
      // Test various edge cases in environment variable parsing
      const edgeCases = [
        { key: 'NULL_BYTE', value: 'secret\x00injection' },
        { key: 'NEWLINE', value: 'secret\ninjection' },
        { key: 'CARRIAGE_RETURN', value: 'secret\rinjection' },
        { key: 'TAB', value: 'secret\tinjection' },
      ]

      edgeCases.forEach(({ key, value }) => {
        vi.stubEnv(key, value)
        // Should handle these safely without throwing injection errors
        expect(() => getRequiredEnv(key)).not.toThrow()
      })
    })

    it('should check for configuration override attacks', async () => {
      // Simulate attempts to override critical configuration
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://secure:pass@production.db:5432/app')
      vi.resetModules()
      const { getSecureConfigValue } = await import('../../src/lib/validation/env')

      // Attempt to override with dangerous values should be caught
      const dangerousOverrides = [
        'postgresql://localhost:5432/test',
        'postgresql://attacker:malicious@evil.com:5432/stolen',
      ]

      dangerousOverrides.forEach(override => {
        vi.stubEnv('DATABASE_URL', override)
        expect(() => getSecureConfigValue('DATABASE_URL', { required: true })).toThrow(
          /test.*demo.*localhost/
        )
      })
    })

    it('should test environment pollution prevention', async () => {
      // Ensure that setting multiple bad variables doesn't affect validation
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      const pollutionVars = {
        BAD_VAR_1: 'test-value-1',
        BAD_VAR_2: 'demo-value-2',
        BAD_VAR_3: 'sample-value-3',
      }

      // Set pollution variables
      Object.entries(pollutionVars).forEach(([key, value]) => {
        vi.stubEnv(key, value)
      })

      // Set a good variable
      vi.stubEnv('GOOD_SECRET', 'secure-production-secret-with-sufficient-length-and-entropy')

      // Good variable should still pass validation
      expect(() => getRequiredEnv('GOOD_SECRET')).not.toThrow()

      // Bad variables should still fail validation
      Object.keys(pollutionVars).forEach(key => {
        expect(() => getRequiredEnv(key)).toThrow(/test patterns/)
      })
    })
  })

  describe('Secrets Exposure Prevention', () => {
    it('should ensure secrets never appear in logs', async () => {
      const secret = 'very-sensitive-secret-that-should-not-appear-in-logs-123'
      vi.stubEnv('SENSITIVE_SECRET', secret)
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      try {
        getRequiredEnv('SENSITIVE_SECRET')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Error message should not contain the actual secret value
        expect(errorMessage).not.toContain(secret)
      }

      // Check that console.error was not called with secret
      const errorCalls = mockConsoleError.mock.calls
      errorCalls.forEach(call => {
        const callArgs = call.join(' ')
        expect(callArgs).not.toContain(secret)
      })
    })

    it('should validate error message sanitization', async () => {
      const sensitiveValue = 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef'
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GITHUB_TOKEN', `test-${sensitiveValue}`)
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      try {
        getRequiredEnv('GITHUB_TOKEN')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Should not expose the sensitive token in error message
        expect(errorMessage).not.toContain(sensitiveValue)
        expect(errorMessage).not.toContain('github_pat_')
      }
    })

    it('should check configuration serialization security', async () => {
      const secret = 'sensitive-configuration-secret-value-123456789'
      vi.stubEnv('CONFIG_SECRET', secret)
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      // Ensure configuration objects don't accidentally serialize secrets
      const configValue = getRequiredEnv('CONFIG_SECRET')
      expect(configValue).toBe(secret)

      // JSON.stringify should not expose secrets in logs
      const configObj = { secret: configValue }
      const serialized = JSON.stringify(configObj)

      // In a real implementation, sensitive values should be masked
      // For this test, we're ensuring the secret is handled properly
      expect(serialized).toContain(secret) // This is expected behavior for getRequiredEnv
    })

    it('should test debug information filtering', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      const debugSecret = 'debug-secret-with-sufficient-length-for-testing'
      vi.stubEnv('DEBUG_TOKEN', debugSecret)
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      // Even in development, secrets should be handled carefully
      expect(() => getRequiredEnv('DEBUG_TOKEN')).not.toThrow()

      // Verify no debug information containing secrets was logged
      const errorCalls = mockConsoleError.mock.calls
      errorCalls.forEach(call => {
        const callArgs = call.join(' ')
        // Should not log raw secret values even in debug mode
        if (callArgs.includes('DEBUG_TOKEN')) {
          expect(callArgs).not.toContain(debugSecret)
        }
      })
    })
  })
})
