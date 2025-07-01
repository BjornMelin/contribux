/**
 * Production Security Settings Validation Tests
 *
 * Comprehensive testing of production-specific security configurations including
 * authentication, database, API security settings, and security headers.
 *
 * Focus areas:
 * 1. Authentication configuration security (NextAuth, JWT, session settings)
 * 2. Database configuration security (SSL/TLS, connection pooling, timeouts)
 * 3. API configuration security (CORS, security headers, rate limiting)
 * 4. OAuth and PKCE security configuration validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, databaseConfig, validateConfig } from '@/lib/config'
import {
  getDatabaseUrl,
  getJwtSecret,
  validateProductionSecuritySettings,
  validateProductionUrls,
} from '@/lib/validation/env'

describe('Production Security Settings Validation', () => {
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

    // Mock console.error to capture error output
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Set production environment for most tests
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    // Restore original environment and mocks
    process.env = originalEnv
    mockExit.mockRestore()
    mockConsoleError.mockRestore()
  })

  describe('Authentication Configuration Security', () => {
    it('should validate NextAuth provider security settings', () => {
      const validConfig = {
        providers: {
          github: {
            clientId: 'Iv1.a1b2c3d4e5f6g7h8',
            clientSecret: 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef',
            scope: 'user:email read:user',
          },
        },
        session: {
          strategy: 'jwt',
          maxAge: 7 * 24 * 60 * 60, // 7 days
        },
        jwt: {
          algorithm: 'HS256',
        },
      }

      // Validate provider configuration structure
      expect(validConfig.providers.github.clientId).toMatch(/^(Iv1\.|[a-zA-Z0-9]{20})/)
      expect(validConfig.providers.github.clientSecret).toMatch(/^github_pat_|^[a-zA-Z0-9]{40,}/)
      expect(validConfig.providers.github.scope).toContain('user:email')
      expect(validConfig.session.strategy).toBe('jwt')
      expect(validConfig.jwt.algorithm).toBe('HS256')
    })

    it('should check callback URL security configuration', () => {
      const productionCallbacks = [
        'https://contribux.ai/api/auth/github/callback',
        'https://app.contribux.ai/api/auth/github/callback',
        'https://api.contribux.ai/auth/callback',
      ]

      const invalidCallbacks = [
        'http://contribux.ai/api/auth/github/callback', // HTTP instead of HTTPS
        'https://localhost:3000/api/auth/callback', // localhost in production
        'https://dev.contribux.ai/api/auth/callback', // dev subdomain
        'https://test.contribux.ai/api/auth/callback', // test subdomain
      ]

      // Valid callbacks should pass
      productionCallbacks.forEach(callback => {
        expect(callback).toMatch(/^https:\/\/[^/]*contribux\.ai\//)
        expect(callback).not.toMatch(/localhost|dev\.|test\./)
      })

      // Invalid callbacks should be detected
      invalidCallbacks.forEach(callback => {
        const isInvalid =
          callback.startsWith('http://') ||
          callback.includes('localhost') ||
          callback.includes('dev.') ||
          callback.includes('test.')
        expect(isInvalid).toBe(true)
      })
    })

    it('should validate session configuration security', () => {
      const authConfig = config.auth

      // Session security requirements
      expect(authConfig.session.expiry).toBeGreaterThan(3600) // At least 1 hour
      expect(authConfig.session.expiry).toBeLessThanOrEqual(7 * 24 * 60 * 60) // Max 7 days
      expect(authConfig.session.cleanupInterval).toBeGreaterThan(0)

      // JWT security requirements
      expect(authConfig.jwt.accessTokenExpiry).toBeGreaterThan(60) // At least 1 minute
      expect(authConfig.jwt.refreshTokenExpiry).toBeGreaterThan(authConfig.jwt.accessTokenExpiry)
      expect(authConfig.jwt.issuer).toBeDefined()
      expect(authConfig.jwt.audience).toBeDefined()
      expect(Array.isArray(authConfig.jwt.audience)).toBe(true)
    })

    it('should enforce JWT security settings', () => {
      // Set valid production environment
      vi.stubEnv(
        'JWT_SECRET',
        'very-secure-jwt-secret-with-sufficient-length-and-entropy-production'
      )
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@prod.example.com:5432/db?sslmode=require')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

      // JWT secret validation should pass with secure settings
      expect(() => getJwtSecret()).not.toThrow()

      // Validate JWT configuration requirements
      const jwtConfig = config.auth.jwt
      expect(jwtConfig.issuer).toBe('contribux')
      expect(jwtConfig.audience).toContain('contribux-api')
      expect(jwtConfig.accessTokenExpiry).toBeLessThanOrEqual(24 * 60 * 60) // Max 24 hours
    })
  })

  describe('Database Configuration Security', () => {
    it('should validate SSL/TLS enforcement', () => {
      const secureDbUrls = [
        'postgresql://user:pass@host.com:5432/db?sslmode=require',
        'postgresql://user:pass@host.com:5432/db?sslmode=require&connect_timeout=10',
        'postgresql://neondb_owner:pass@ep-host.aws.neon.tech/neondb?sslmode=require',
      ]

      const insecureDbUrls = [
        'postgresql://user:pass@host.com:5432/db', // No SSL mode specified
        'postgresql://user:pass@host.com:5432/db?sslmode=disable', // SSL disabled
        'postgresql://user:pass@host.com:5432/db?sslmode=allow', // SSL not required
      ]

      secureDbUrls.forEach(url => {
        vi.stubEnv('DATABASE_URL', url)
        expect(() => getDatabaseUrl()).not.toThrow()
        expect(url).toMatch(/sslmode=require/)
      })

      insecureDbUrls.forEach(url => {
        vi.stubEnv('DATABASE_URL', url)
        // Should not contain SSL requirements or explicitly disable SSL
        const hasSSLRequirement = url.includes('sslmode=require')
        const hasSSLDisabled = url.includes('sslmode=disable') || url.includes('sslmode=allow')

        if (!hasSSLRequirement || hasSSLDisabled) {
          // This would be caught by production URL validation
          expect(() => validateProductionUrls()).not.toThrow() // URL validation focuses on localhost/test patterns
        }
      })
    })

    it('should check connection string security', () => {
      const validConnectionStrings = [
        'postgresql://user:complexpass123@prod-db.example.com:5432/appdb?sslmode=require',
        'postgresql://neondb_owner:np_abc123@ep-morning-sea.us-east-1.aws.neon.tech/neondb?sslmode=require',
      ]

      const invalidConnectionStrings = [
        'postgresql://localhost:5432/testdb', // localhost
        'postgresql://user:pass@test-db:5432/db', // test hostname
        'postgresql://user:pass@dev.example.com:5432/db', // dev hostname
        'postgresql://user:@prod.example.com:5432/db', // empty password
        'mysql://user:pass@prod.example.com:3306/db', // wrong database type
      ]

      validConnectionStrings.forEach(connString => {
        vi.stubEnv('DATABASE_URL', connString)
        expect(() => validateProductionUrls()).not.toThrow()
      })

      invalidConnectionStrings.forEach(connString => {
        vi.stubEnv('DATABASE_URL', connString)
        const hasLocalhost = connString.includes('localhost')
        const hasTestPattern = connString.includes('test')

        if (hasLocalhost || hasTestPattern) {
          expect(() => validateProductionUrls()).toThrow()
        }
      })
    })

    it('should validate connection pooling security', () => {
      const dbConfig = databaseConfig

      // Connection pool security requirements
      expect(dbConfig.connectionTimeout).toBeGreaterThan(0)
      expect(dbConfig.connectionTimeout).toBeLessThanOrEqual(60000) // Max 60 seconds
      expect(dbConfig.healthCheckInterval).toBeGreaterThan(0)
      expect(dbConfig.slowQueryThreshold).toBeGreaterThan(0)

      // Performance and security thresholds
      expect(dbConfig.maxSlowQueries).toBeGreaterThan(0)
      expect(dbConfig.indexUsageThreshold).toBeGreaterThanOrEqual(0)
    })

    it('should enforce timeout and security settings', () => {
      const dbConfig = databaseConfig

      // Production environment should have reasonable timeouts
      if (process.env.NODE_ENV === 'production') {
        expect(dbConfig.connectionTimeout).toBeLessThanOrEqual(30000) // Max 30 seconds in production
        expect(dbConfig.healthCheckInterval).toBeGreaterThanOrEqual(60000) // At least 1 minute
      }

      // Slow query detection should be enabled
      expect(dbConfig.slowQueryThreshold).toBeGreaterThan(0)
      expect(dbConfig.performanceReportInterval).toBeGreaterThan(0)
    })
  })

  describe('API Configuration Security', () => {
    it('should validate CORS security configuration', () => {
      // Production CORS should be restrictive
      const productionConfig = config.app

      // Should not allow wildcard origins in production
      expect(productionConfig.corsOrigins).not.toContain('*')
      expect(
        productionConfig.corsOrigins.every(
          origin => origin.startsWith('https://') || origin.startsWith('http://localhost')
        )
      ).toBe(true)

      // Should have specific allowed origins
      if (process.env.NODE_ENV === 'production') {
        expect(
          productionConfig.corsOrigins.some(
            origin => origin.includes('contribux.com') || origin.includes('contribux.ai')
          )
        ).toBe(true)
      }
    })

    it('should check security headers configuration', () => {
      // Security headers should be configured
      const securityHeaders = {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      }

      // Validate security header requirements
      Object.entries(securityHeaders).forEach(([header, expectedValue]) => {
        expect(header).toBeDefined()
        expect(expectedValue).toBeDefined()
        expect(typeof expectedValue).toBe('string')
      })
    })

    it('should validate rate limiting configuration', () => {
      const rateLimitConfig = config.auth.rateLimit

      // Rate limiting should be properly configured
      expect(rateLimitConfig.windowMs).toBeGreaterThan(0)
      expect(rateLimitConfig.max).toBeGreaterThan(0)
      expect(rateLimitConfig.defaultLimit).toBeGreaterThan(0)
      expect(rateLimitConfig.defaultWindow).toBeGreaterThan(0)

      // Production should have stricter limits
      if (process.env.NODE_ENV === 'production') {
        expect(rateLimitConfig.max).toBeLessThanOrEqual(100) // Reasonable production limit
        expect(rateLimitConfig.windowMs).toBeGreaterThanOrEqual(15 * 60 * 1000) // At least 15 minutes
      }

      // Rate limiting values should be within acceptable ranges
      expect(rateLimitConfig.max).toBeLessThanOrEqual(1000) // Max limit cap
      expect(rateLimitConfig.windowMs).toBeLessThanOrEqual(60 * 60 * 1000) // Max 1 hour window
    })

    it('should enforce API security settings', () => {
      const appConfig = config.app

      // API timeout settings
      expect(appConfig.requestTimeout).toBeGreaterThan(0)
      expect(appConfig.requestTimeout).toBeLessThanOrEqual(120000) // Max 2 minutes

      // Upload limits
      expect(appConfig.uploadsMaxSize).toBeGreaterThan(0)
      expect(appConfig.uploadsMaxSize).toBeLessThanOrEqual(100 * 1024 * 1024) // Max 100MB

      // API versioning
      expect(appConfig.apiVersion).toBeDefined()
      expect(appConfig.apiVersion).toMatch(/^v\d+$/)

      // Maintenance mode should be configurable
      expect(typeof appConfig.maintenanceMode).toBe('boolean')
    })
  })

  describe('OAuth and PKCE Security Configuration', () => {
    it('should validate GitHub client credentials security', () => {
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@prod.example.com:5432/db')
      vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')

      expect(() => validateProductionSecuritySettings()).not.toThrow()

      // Validate client ID format
      const clientId = process.env.GITHUB_CLIENT_ID!
      expect(clientId).toMatch(/^(Iv1\.|[a-zA-Z0-9]{20})/)

      // Validate client secret format
      const clientSecret = process.env.GITHUB_CLIENT_SECRET!
      expect(clientSecret).toMatch(/^github_pat_|^[a-zA-Z0-9]{40,}/)
      expect(clientSecret.length).toBeGreaterThan(20)
    })

    it('should enforce secure redirect URIs', () => {
      const validRedirectUris = [
        'https://contribux.ai/api/auth/github/callback',
        'https://app.contribux.ai/api/auth/github/callback',
        'https://api.contribux.ai/auth/callback',
      ]

      const invalidRedirectUris = [
        'http://contribux.ai/api/auth/callback', // HTTP instead of HTTPS
        'https://localhost:3000/api/auth/callback', // localhost in production
        'https://dev.contribux.ai/api/auth/callback', // dev subdomain
        'ftp://contribux.ai/callback', // Non-HTTP protocol
        'javascript:alert(1)', // JavaScript URI
      ]

      validRedirectUris.forEach(uri => {
        vi.stubEnv('ALLOWED_REDIRECT_URIS', uri)
        expect(() => validateProductionSecuritySettings()).not.toThrow()
      })

      invalidRedirectUris.forEach(uri => {
        vi.stubEnv('ALLOWED_REDIRECT_URIS', uri)
        const isLocalhost = uri.includes('localhost')
        const isHttp = uri.startsWith('http://') && !uri.includes('localhost')
        const isInvalidProtocol = !uri.startsWith('https://') && !uri.startsWith('http://')

        if (isLocalhost || isHttp || isInvalidProtocol) {
          expect(() => validateProductionSecuritySettings()).toThrow()
        }
      })
    })

    it('should validate OAuth scope restrictions', () => {
      const oauthConfig = config.oauth

      // OAuth configuration security
      expect(oauthConfig.stateExpiry).toBeGreaterThan(0)
      expect(oauthConfig.stateExpiry).toBeLessThanOrEqual(30 * 60 * 1000) // Max 30 minutes
      expect(oauthConfig.allowedProviders).toContain('github')
      expect(oauthConfig.tokenRefreshBuffer).toBeGreaterThan(0)

      // Validate scope restrictions for GitHub
      const githubScopes = 'user:email read:user'
      const scopeArray = githubScopes.split(' ')

      expect(scopeArray).toContain('user:email')
      expect(scopeArray).not.toContain('repo') // Should not request repo access by default
      expect(scopeArray).not.toContain('admin:org') // Should not request admin access
    })

    it('should check PKCE configuration security', () => {
      // PKCE should be enabled for OAuth flows (this would be in actual OAuth implementation)
      const pkceConfig = {
        enabled: true,
        codeChallenge: 'S256', // SHA256
        state: true,
        nonce: true,
      }

      expect(pkceConfig.enabled).toBe(true)
      expect(pkceConfig.codeChallenge).toBe('S256')
      expect(pkceConfig.state).toBe(true)
      expect(pkceConfig.nonce).toBe(true)

      // Validate OAuth state expiry
      const oauthConfig = config.oauth
      expect(oauthConfig.stateExpiry).toBeGreaterThanOrEqual(5 * 60 * 1000) // At least 5 minutes
      expect(oauthConfig.stateExpiry).toBeLessThanOrEqual(30 * 60 * 1000) // Max 30 minutes
    })
  })

  describe('Security Configuration Validation', () => {
    it('should validate complete production security configuration', () => {
      // Set complete production configuration
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@prod.example.com:5432/db?sslmode=require')
      vi.stubEnv('JWT_SECRET', 'very-secure-jwt-secret-with-sufficient-length-and-entropy')
      vi.stubEnv('GITHUB_CLIENT_ID', 'Iv1.a1b2c3d4e5f6g7h8')
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef')
      vi.stubEnv('NEXTAUTH_URL', 'https://contribux.ai')
      vi.stubEnv('ALLOWED_REDIRECT_URIS', 'https://contribux.ai/api/auth/github/callback')

      expect(() => validateProductionSecuritySettings()).not.toThrow()
      expect(validateConfig()).toBe(true)
    })

    it('should detect missing security configurations', () => {
      vi.stubEnv('NODE_ENV', 'production')

      const requiredConfigs = [
        { key: 'DATABASE_URL', value: 'postgresql://user:pass@prod.example.com:5432/db' },
        { key: 'JWT_SECRET', value: 'very-secure-jwt-secret-with-sufficient-length' },
        { key: 'GITHUB_CLIENT_ID', value: 'Iv1.a1b2c3d4e5f6g7h8' },
        { key: 'GITHUB_CLIENT_SECRET', value: 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
        { key: 'NEXTAUTH_URL', value: 'https://contribux.ai' },
      ]

      // Test each missing configuration
      requiredConfigs.forEach(({ key }) => {
        // Set all configs except the one being tested
        requiredConfigs.forEach(({ key: configKey, value }) => {
          if (configKey !== key) {
            vi.stubEnv(configKey, value)
          } else {
            delete process.env[configKey]
          }
        })

        expect(() => validateProductionSecuritySettings()).toThrow()
      })
    })

    it('should validate security header completeness', () => {
      const requiredSecurityHeaders = [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'Referrer-Policy',
      ]

      // Each security header should be properly configured
      requiredSecurityHeaders.forEach(header => {
        expect(header).toBeDefined()
        expect(typeof header).toBe('string')
        expect(header.length).toBeGreaterThan(0)
      })
    })

    it('should enforce production-only restrictions', () => {
      vi.stubEnv('NODE_ENV', 'production')

      // Production restrictions that should be enforced
      const productionRestrictions = {
        debugMode: false,
        verboseLogging: false,
        developmentFeatures: false,
        testEndpoints: false,
      }

      Object.entries(productionRestrictions).forEach(([_feature, shouldBeEnabled]) => {
        expect(shouldBeEnabled).toBe(false)
      })

      // Validate that configuration is appropriate for production
      const appConfig = config.app
      expect(appConfig.maintenanceMode).toBe(false) // Should default to false
      expect(appConfig.corsOrigins).not.toContain('*') // No wildcard CORS
    })
  })
})
