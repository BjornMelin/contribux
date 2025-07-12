import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateOAuthUrl,
  validateOAuthCallback,
  validateOAuthStateSecure,
  validateRedirectUriSecure,
} from '@/lib/auth/oauth'

// Mock env validation for this test file
vi.mock('@/lib/validation/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    JWT_SECRET: '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab',
    GITHUB_CLIENT_ID: 'test1234567890123456',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret-with-sufficient-length-for-testing',
    HNSW_EF_SEARCH: '100',
    HNSW_EF_CONSTRUCTION: '200',
    HNSW_M_CONNECTIONS: '16',
    ALLOWED_REDIRECT_URIS:
      'http://localhost:3000/auth/callback,https://localhost:3000/auth/callback',
  },
  isProduction: () => false,
  isDevelopment: () => false,
  isTest: () => true,
  getJwtSecret: () => '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab',
  getEncryptionKey: () => 'test-encryption-key-32-bytes-long',
}))

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock OAuth config
vi.mock('@/lib/config/oauth', () => ({
  oauthConfig: {
    stateExpiry: 600000, // 10 minutes
    redirectUriValidation: {
      allowedProtocols: ['http', 'https'],
      allowedDomains: ['localhost', '127.0.0.1', 'contribux.app'],
      allowedPorts: [3000, 3001, 8080],
      enforceHttpsInProduction: true,
    },
    security: {
      sessionBinding: {
        enabled: true,
        bindToUserAgent: true,
        bindToIP: false,
      },
      timingAttackProtection: {
        minResponseTime: 10,
        maxJitter: 5,
      },
      attackDetection: {
        enabled: true,
      },
    },
  },
}))

// Mock PKCE generation
vi.mock('@/lib/auth/pkce', () => ({
  generateEnhancedPKCEChallenge: vi.fn(() => ({
    codeVerifier: 'test-verifier-123',
    codeChallenge: 'test-challenge-123',
    entropy: 4.5,
  })),
  validatePKCESecure: vi.fn(() => ({
    valid: true,
    entropy: 4.5,
    timingSafe: true,
  })),
}))

// Mock audit logging
vi.mock('@/lib/auth/audit', () => ({
  logSecurityEvent: vi.fn(),
}))

// Mock crypto functions
vi.mock('@/lib/auth/crypto', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/crypto')>('@/lib/auth/crypto')
  return {
    ...actual,
    encryptOAuthToken: vi.fn(async (token: string) =>
      JSON.stringify({
        iv: Buffer.from('test-iv').toString('base64'),
        ciphertext: Buffer.from(`encrypted-${token}`).toString('base64'),
        tag: Buffer.from('test-tag').toString('base64'),
        keyId: 'key-123',
      })
    ),
    decryptOAuthToken: vi.fn(async (_encrypted: string) => {
      return 'ghr_refreshtoken123'
    }),
  }
})

// Import the sql mock to ensure it's available
import { sql as mockSql } from '@/lib/db/config'

describe('OAuth Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('OAuth URL Generation', () => {
    it('should include all required security parameters', async () => {
      // Mock database INSERT for state storage
      vi.mocked(mockSql).mockResolvedValueOnce([])

      const result = await generateOAuthUrl({
        provider: 'github',
        redirectUri: 'http://localhost:3000/auth/callback',
        scopes: ['read:user', 'user:email'],
        userId: '123e4567-e89b-12d3-a456-426614174000',
      })

      expect(result.url).toContain('client_id=')
      expect(result.url).toContain('redirect_uri=')
      expect(result.url).toContain('scope=')
      expect(result.url).toContain('state=')
      expect(result.url).toContain('code_challenge=')
      expect(result.url).toContain('code_challenge_method=S256')
      expect(result.url).toContain('response_type=code')

      expect(result.state).toBeTruthy()
      expect(result.codeVerifier).toBe('test-verifier-123')
    })

    it('should validate URL construction', async () => {
      // Mock database INSERT for state storage but expect it to fail for invalid URI
      vi.mocked(mockSql).mockResolvedValueOnce([])

      await expect(
        generateOAuthUrl({
          provider: 'github',
          redirectUri: 'http://malicious-site.com/auth/callback',
          scopes: ['read:user'],
        })
      ).rejects.toThrow('Invalid or suspicious redirect URI')
    })

    it('should enforce HTTPS in production', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      // Use a non-localhost domain to test production HTTPS enforcement
      await expect(
        generateOAuthUrl({
          provider: 'github',
          redirectUri: 'http://contribux.app/auth/callback',
          scopes: ['read:user'],
        })
      ).rejects.toThrow('Invalid or suspicious redirect URI')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Redirect URI Validation', () => {
    it('should enforce allowlist validation', async () => {
      const allowedUris = [
        'http://localhost:3000/auth/callback',
        'https://app.contribux.com/auth/callback',
      ]

      // Valid URI should pass
      const validResult = await validateRedirectUriSecure(
        'http://localhost:3000/auth/callback',
        allowedUris
      )
      expect(validResult.valid).toBe(true)

      // Invalid URI should fail
      const invalidResult = await validateRedirectUriSecure(
        'http://malicious-site.com/callback',
        allowedUris
      )
      expect(invalidResult.valid).toBe(false)
    })

    it('should validate protocol requirements', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const httpResult = await validateRedirectUriSecure('http://contribux.app/callback')
      expect(httpResult.valid).toBe(false)
      expect(httpResult.securityChecks.protocolValid).toBe(false)

      const httpsResult = await validateRedirectUriSecure('https://contribux.app/callback')
      expect(httpsResult.valid).toBe(true)
      expect(httpsResult.securityChecks.protocolValid).toBe(true)

      process.env.NODE_ENV = originalEnv
    })

    it('should check domain restrictions', async () => {
      const testCases = [
        { uri: 'https://localhost:3000/callback', expected: true },
        { uri: 'https://malicious.com/callback', expected: false },
        { uri: 'https://contribux.app/callback', expected: true },
      ]

      for (const testCase of testCases) {
        const result = await validateRedirectUriSecure(testCase.uri)
        expect(result.valid).toBe(testCase.expected)
      }
    })

    it('should prevent redirect chain attacks', async () => {
      const suspiciousUri = 'https://localhost:3000/callback?redirect=https://malicious.com'
      const result = await validateRedirectUriSecure(suspiciousUri)

      expect(result.valid).toBe(false)
      expect(result.securityChecks.noRedirectChain).toBe(false)
    })

    it('should validate path security', async () => {
      // Test a path that exceeds the maximum length limit
      const longPathUri = `https://localhost:3000/${'a'.repeat(1001)}`
      const result = await validateRedirectUriSecure(longPathUri)

      expect(result.valid).toBe(false)
      expect(result.securityChecks.pathValid).toBe(false)
    })

    it('should handle malformed URIs securely', async () => {
      const malformedUri = 'not-a-valid-uri'
      const result = await validateRedirectUriSecure(malformedUri)

      expect(result.valid).toBe(false)
      expect(result.securityChecks.protocolValid).toBe(false)
    })
  })

  describe('Callback Validation', () => {
    it('should validate all callback parameters', async () => {
      // Mock state retrieval
      vi.mocked(mockSql).mockResolvedValueOnce([
        {
          state: 'valid-state',
          code_verifier: 'test-verifier',
          provider: 'github',
          redirect_uri: 'http://localhost:3000/auth/callback',
          user_id: 'test-user',
          created_at: new Date(),
          security_metadata: JSON.stringify({ entropy: 4.5, security_version: '2.0' }),
        },
      ])

      // Mock state deletion
      vi.mocked(mockSql).mockResolvedValueOnce([])

      const result = await validateOAuthCallback({
        code: 'auth-code-123',
        state: 'valid-state',
      })

      expect(result.valid).toBe(true)
      expect(result.code).toBe('auth-code-123')
      expect(result.codeVerifier).toBe('test-verifier')
      expect(result.provider).toBe('github')
    })

    it('should verify state and PKCE together', async () => {
      // Mock state retrieval with PKCE data
      vi.mocked(mockSql).mockResolvedValueOnce([
        {
          state: 'valid-state',
          code_verifier: 'test-verifier-123',
          provider: 'github',
          redirect_uri: 'http://localhost:3000/auth/callback',
          user_id: 'test-user',
          created_at: new Date(),
          security_metadata: JSON.stringify({ entropy: 4.5, security_version: '2.0' }),
        },
      ])

      // Mock state deletion
      vi.mocked(mockSql).mockResolvedValueOnce([])

      const result = await validateOAuthCallback({
        code: 'auth-code-123',
        state: 'valid-state',
      })

      expect(result.valid).toBe(true)
      expect(result.securityChecks?.stateValid).toBe(true)
      expect(result.securityChecks?.timeValid).toBe(true)
      expect(result.securityChecks?.securityMetadataValid).toBe(true)
    })

    it('should handle validation failures securely', async () => {
      // Mock empty state result (state not found)
      vi.mocked(mockSql).mockResolvedValueOnce([])

      await expect(
        validateOAuthCallback({
          code: 'auth-code-123',
          state: 'invalid-state',
        })
      ).rejects.toThrow('Invalid or expired OAuth state')
    })

    it('should detect OAuth attack patterns', async () => {
      await expect(
        validateOAuthCallback({
          state: 'test-state',
          error: 'access_denied',
          error_description: 'User denied access',
        })
      ).rejects.toThrow('OAuth error: access_denied - User denied access')
    })
  })

  describe('State Parameter Security', () => {
    it('should bind state to session context', async () => {
      // Mock database response for state validation
      vi.mocked(mockSql).mockResolvedValueOnce([
        {
          state: 'test-state',
          session_id: 'test-session-123',
          client_fingerprint: null,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 600000),
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ])

      const result = await validateOAuthStateSecure(
        'test-state',
        'test-session-123',
        'test-fingerprint'
      )

      expect(result.valid).toBe(true)
      expect(result.securityChecks.stateExists).toBe(true)
      expect(result.securityChecks.sessionMatch).toBe(true)
    })

    it('should validate state expiration', async () => {
      const expiredState = {
        state: 'expired-state',
        session_id: 'test-session',
        client_fingerprint: null,
        created_at: new Date(Date.now() - 700000), // 11+ minutes ago
        expires_at: new Date(Date.now() - 100000), // Expired
        security_flags: null,
      }

      vi.mocked(mockSql).mockResolvedValueOnce([expiredState])

      const result = await validateOAuthStateSecure(
        'expired-state',
        'test-session',
        'test-fingerprint'
      )

      expect(result.valid).toBe(false)
      expect(result.securityChecks.notExpired).toBe(false)
    })

    it('should implement timing attack protection for state validation', async () => {
      const scenarios = [
        { hasState: true, expectedTime: 10 },
        { hasState: false, expectedTime: 10 },
      ]

      for (const scenario of scenarios) {
        if (scenario.hasState) {
          vi.mocked(mockSql).mockResolvedValueOnce([
            {
              state: 'test-state',
              session_id: 'test-session',
              client_fingerprint: null,
              created_at: new Date(),
              expires_at: new Date(Date.now() + 600000),
              security_flags: null,
            },
          ])
        } else {
          vi.mocked(mockSql).mockResolvedValueOnce([])
        }

        const startTime = Date.now()
        try {
          await validateOAuthStateSecure('test-state', 'test-session')
        } catch {
          // Expected for invalid state
        }
        const elapsedTime = Date.now() - startTime

        // Should take at least the minimum response time
        expect(elapsedTime).toBeGreaterThan(scenario.expectedTime - 5)
      }
    })
  })
})
