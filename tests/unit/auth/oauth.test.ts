import { generateOAuthUrl, validateOAuthCallback } from '@/lib/auth/oauth'
import { sql } from '@/lib/db/config'
import { describe, expect, it, vi } from 'vitest'

// Mock env validation for this test file
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    JWT_SECRET: '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab',
    GITHUB_CLIENT_ID: 'test1234567890123456',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret-with-sufficient-length-for-testing',
  },
  isProduction: () => false,
  isDevelopment: () => false,
  isTest: () => true,
  getJwtSecret: () => '8f6be3e6a8bc63ab47bd41db4d11ccdcdff3eb07f04aab983956719007f0e025ab',
  getEncryptionKey: () => 'test-encryption-key-32-bytes-long',
}))

// Mock PKCE generation
vi.mock('../../src/lib/auth/pkce', () => ({
  generatePKCEChallenge: vi.fn(() => ({
    codeVerifier: 'test-verifier-123',
    codeChallenge: 'test-challenge-123',
  })),
}))

// Mock crypto functions
vi.mock('../../src/lib/auth/crypto', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/lib/auth/crypto')>('@/lib/auth/crypto')
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
      // Return mock refresh token
      return 'ghr_refreshtoken123'
    }),
  }
})

// Note: Database and fetch mocks are defined in tests/setup.ts

// Import the sql mock to ensure it's available
import { sql as mockSql } from '@/lib/db/config'

vi.mocked(mockSql)

describe('OAuth Authentication', () => {
  describe('State Parameter Security', () => {
    it('should generate cryptographically secure state', async () => {
      const state = await generateSecureOAuthState('test-user-123')

      // State should have timestamp.random.hash format
      const parts = state.split('.')
      expect(parts).toHaveLength(3)

      // Timestamp should be recent
      const timestamp = Number(parts[0])
      expect(timestamp).toBeGreaterThan(Date.now() - 1000)
      expect(timestamp).toBeLessThanOrEqual(Date.now())

      // Random part should be 32 characters
      expect(parts[1]).toHaveLength(64) // 32 bytes = 64 hex chars

      // Hash should be 32 characters (truncated SHA-256)
      expect(parts[2]).toHaveLength(32)
    })

    it('should bind state to session context', async () => {
      const sessionId = 'test-session-123'
      const clientFingerprint = 'test-fingerprint'

      // Mock database response for state validation
      mockSql.mockResolvedValueOnce([
        {
          state: 'test-state',
          session_id: sessionId,
          client_fingerprint: clientFingerprint,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ])

      const result = await validateOAuthStateSecure('test-state', sessionId, clientFingerprint)

      expect(result.valid).toBe(true)
      expect(result.securityChecks.sessionMatch).toBe(true)
      expect(result.securityChecks.fingerprintMatch).toBe(true)
    })

    it('should validate state expiration', async () => {
      const expiredState = {
        state: 'expired-state',
        session_id: 'test-session',
        client_fingerprint: 'test-fingerprint',
        created_at: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
        expires_at: new Date(Date.now() - 10 * 60 * 1000), // Expired 10 minutes ago
        security_flags: JSON.stringify({ version: '2.0' }),
      }

      mockSql.mockResolvedValueOnce([expiredState])

      const result = await validateOAuthStateSecure(
        'expired-state',
        'test-session',
        'test-fingerprint'
      )

      expect(result.valid).toBe(false)
      expect(result.securityChecks.stateExists).toBe(true)
      expect(result.securityChecks.notExpired).toBe(false)
    })

    it('should prevent state replay attacks', async () => {
      const state = await generateSecureOAuthState()

      // First validation should work
      mockSql.mockResolvedValueOnce([
        {
          state,
          session_id: 'test-session',
          client_fingerprint: 'test-fingerprint',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ])

      const firstResult = await validateOAuthStateSecure(state, 'test-session', 'test-fingerprint')
      expect(firstResult.valid).toBe(true)

      // Second attempt with same state should fail (simulate state cleanup)
      mockSql.mockResolvedValueOnce([])

      const secondResult = await validateOAuthStateSecure(state, 'test-session', 'test-fingerprint')
      expect(secondResult.valid).toBe(false)
      expect(secondResult.securityChecks.stateExists).toBe(false)
    })

    it('should implement timing attack protection for state validation', async () => {
      // Test timing consistency for different scenarios
      const scenarios = [
        { hasState: true, expired: false },
        { hasState: true, expired: true },
        { hasState: false, expired: false },
      ]

      const times: number[] = []

      for (const scenario of scenarios) {
        if (scenario.hasState) {
          mockSql.mockResolvedValueOnce([
            {
              state: 'test-state',
              session_id: 'test-session',
              client_fingerprint: 'test-fingerprint',
              created_at: new Date(),
              expires_at: scenario.expired
                ? new Date(Date.now() - 1000)
                : new Date(Date.now() + 10 * 60 * 1000),
              security_flags: JSON.stringify({ version: '2.0' }),
            },
          ])
        } else {
          mockSql.mockResolvedValueOnce([])
        }

        const start = performance.now()
        await validateOAuthStateSecure('test-state', 'test-session', 'test-fingerprint')
        times.push(performance.now() - start)
      }

      // All times should be similar (timing attack protection)
      const avgTime = times.reduce((a, b) => a + b) / times.length
      for (const time of times) {
        expect(Math.abs(time - avgTime)).toBeLessThan(50) // 50ms tolerance
      }
    })
  })

  describe('Redirect URI Validation', () => {
    it('should enforce allowlist validation', async () => {
      const allowedUris = [
        'https://app.contribux.com/auth/callback',
        'https://staging.contribux.com/auth/callback',
      ]

      // Valid URI should pass
      const validResult = await validateRedirectUriSecure(
        'https://app.contribux.com/auth/callback',
        allowedUris
      )
      expect(validResult.valid).toBe(true)

      // Invalid URI should fail
      const invalidResult = await validateRedirectUriSecure(
        'https://malicious.com/auth/callback',
        allowedUris
      )
      expect(invalidResult.valid).toBe(false)
    })

    it('should validate protocol requirements', async () => {
      // HTTPS should be required in production
      process.env.NODE_ENV = 'production'

      const httpResult = await validateRedirectUriSecure('http://app.contribux.com/auth/callback')
      expect(httpResult.valid).toBe(false)
      expect(httpResult.securityChecks.protocolValid).toBe(false)

      const httpsResult = await validateRedirectUriSecure('https://app.contribux.com/auth/callback')
      expect(httpsResult.securityChecks.protocolValid).toBe(true)

      // Reset environment
      process.env.NODE_ENV = 'test'
    })

    it('should check domain restrictions', async () => {
      const testCases = [
        {
          uri: 'https://app.contribux.com/callback',
          shouldPass: true,
          description: 'exact domain match',
        },
        {
          uri: 'https://staging.app.contribux.com/callback',
          shouldPass: true,
          description: 'subdomain match',
        },
        {
          uri: 'https://evil.com/callback',
          shouldPass: false,
          description: 'different domain',
        },
        {
          uri: 'https://contribux.com.evil.com/callback',
          shouldPass: false,
          description: 'domain suffix attack',
        },
      ]

      for (const testCase of testCases) {
        const result = await validateRedirectUriSecure(testCase.uri)
        expect(result.securityChecks.domainValid).toBe(testCase.shouldPass)
      }
    })

    it('should prevent redirect chain attacks', async () => {
      const redirectChainUris = [
        'https://app.contribux.com/callback?redirect=https://evil.com',
        'https://app.contribux.com/callback?next=https://malicious.com',
        'https://app.contribux.com/callback?return_to=https://attacker.com',
      ]

      for (const uri of redirectChainUris) {
        const result = await validateRedirectUriSecure(uri)
        expect(result.securityChecks.noRedirectChain).toBe(false)
        expect(result.valid).toBe(false)
      }
    })

    it('should validate path security', async () => {
      const pathTestCases = [
        {
          uri: 'https://app.contribux.com/../../../etc/passwd',
          shouldPass: false,
          description: 'path traversal attack',
        },
        {
          uri: 'https://app.contribux.com//double/slash',
          shouldPass: false,
          description: 'double slash in path',
        },
        {
          uri: `https://app.contribux.com/${'a'.repeat(1001)}`,
          shouldPass: false,
          description: 'excessively long path',
        },
        {
          uri: 'https://app.contribux.com/auth/callback',
          shouldPass: true,
          description: 'normal path',
        },
      ]

      for (const testCase of pathTestCases) {
        const result = await validateRedirectUriSecure(testCase.uri)
        expect(result.securityChecks.pathValid).toBe(testCase.shouldPass)
      }
    })

    it('should handle malformed URIs securely', async () => {
      const malformedUris = [
        'not-a-uri',
        'ftp://invalid-protocol.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '',
      ]

      for (const uri of malformedUris) {
        const result = await validateRedirectUriSecure(uri)
        expect(result.valid).toBe(false)

        // Should not throw errors - handle gracefully
        expect(result.securityChecks).toBeDefined()
      }
    })
  })

  describe('OAuth URL Generation', () => {
    it('should include all required security parameters', async () => {
      const mockPKCE = {
        codeVerifier: 'test-verifier',
        codeChallenge: 'test-challenge',
      }

      vi.mocked(generateEnhancedPKCEChallenge).mockResolvedValueOnce({
        ...mockPKCE,
        method: 'S256',
        entropy: 5.2,
        metadata: { generated: new Date(), secure: true },
      })

      const result = await generateOAuthUrl({
        provider: 'github',
        redirectUri: 'https://app.contribux.com/auth/callback',
        scopes: ['user:email', 'public_repo'],
        state: 'test-state',
      })

      const url = new URL(result.url)

      // Check required OAuth parameters
      expect(url.searchParams.get('client_id')).toBe(getGithubClientId())
      expect(url.searchParams.get('redirect_uri')).toBe('https://app.contribux.com/auth/callback')
      expect(url.searchParams.get('scope')).toBe('user:email public_repo')
      expect(url.searchParams.get('state')).toBe('test-state')
      expect(url.searchParams.get('response_type')).toBe('code')

      // Check PKCE parameters
      expect(url.searchParams.get('code_challenge')).toBe('test-challenge')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')

      // Verify result metadata
      expect(result).toHaveProperty('state')
      expect(result).toHaveProperty('codeVerifier')
      expect(result).toHaveProperty('pkceMetadata')
    })

    it('should validate URL construction', async () => {
      const result = await generateOAuthUrl({
        provider: 'github',
        redirectUri: 'https://app.contribux.com/auth/callback',
        scopes: ['user:email'],
        state: 'test-state',
      })

      // Should be valid URL
      expect(() => new URL(result.url)).not.toThrow()

      // Should use HTTPS
      expect(result.url.startsWith('https://')).toBe(true)

      // Should be GitHub OAuth endpoint
      expect(result.url.includes('github.com/login/oauth/authorize')).toBe(true)
    })

    it('should enforce HTTPS in production', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        await expect(
          generateOAuthUrl({
            provider: 'github',
            redirectUri: 'http://insecure.com/callback', // HTTP in production
            scopes: ['user:email'],
            state: 'test-state',
          })
        ).rejects.toThrow()
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })
  })

  describe('Callback Validation', () => {
    it('should validate all callback parameters', async () => {
      const validCallback = {
        code: 'oauth-code-123',
        state: 'valid-state-456',
        sessionId: 'session-789',
      }

      // Mock successful state validation
      mockSql.mockResolvedValueOnce([
        {
          state: validCallback.state,
          session_id: validCallback.sessionId,
          client_fingerprint: 'test-fingerprint',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ])

      const result = await validateOAuthCallback(validCallback)

      expect(result.valid).toBe(true)
      expect(result.securityChecks).toHaveProperty('stateValid')
      expect(result.securityChecks).toHaveProperty('codePresent')
      expect(result.securityChecks.stateValid).toBe(true)
      expect(result.securityChecks.codePresent).toBe(true)
    })

    it('should verify state and PKCE together', async () => {
      const callbackData = {
        code: 'oauth-code-123',
        state: 'valid-state-456',
        sessionId: 'session-789',
        codeVerifier: 'test-verifier',
      }

      // Mock state validation
      mockSql.mockResolvedValueOnce([
        {
          state: callbackData.state,
          session_id: callbackData.sessionId,
          client_fingerprint: 'test-fingerprint',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          security_flags: JSON.stringify({
            version: '2.0',
            pkceChallenge: 'test-challenge',
          }),
        },
      ])

      // Mock PKCE validation
      vi.mocked(validatePKCE).mockResolvedValueOnce({
        valid: true,
        challenge: 'test-challenge',
      })

      const result = await validateOAuthCallback(callbackData)

      expect(result.valid).toBe(true)
      expect(result.securityChecks.stateValid).toBe(true)
      expect(result.securityChecks.pkceValid).toBe(true)
    })

    it('should handle validation failures securely', async () => {
      const failureCases = [
        { code: '', state: 'valid-state', description: 'missing code' },
        { code: 'valid-code', state: '', description: 'missing state' },
        { code: 'valid-code', state: 'invalid-state', description: 'invalid state' },
      ]

      for (const testCase of failureCases) {
        // Mock appropriate responses for each case
        if (testCase.state === 'invalid-state') {
          mockSql.mockResolvedValueOnce([]) // No state found
        } else {
          mockSql.mockResolvedValueOnce([
            {
              state: testCase.state,
              session_id: 'test-session',
              client_fingerprint: 'test-fingerprint',
              created_at: new Date(),
              expires_at: new Date(Date.now() + 10 * 60 * 1000),
              security_flags: JSON.stringify({ version: '2.0' }),
            },
          ])
        }

        const result = await validateOAuthCallback({
          code: testCase.code,
          state: testCase.state,
          sessionId: 'test-session',
        })

        expect(result.valid).toBe(false)
        // Should provide detailed security check results
        expect(result.securityChecks).toBeDefined()
      }
    })

    it('should detect OAuth attack patterns', async () => {
      const suspiciousCallback = {
        code: 'oauth-code-123',
        state: 'valid-state',
        sessionId: 'different-session', // Session mismatch
        clientFingerprint: 'different-fingerprint', // Fingerprint mismatch
      }

      mockSql.mockResolvedValueOnce([
        {
          state: suspiciousCallback.state,
          session_id: 'original-session', // Different from provided
          client_fingerprint: 'original-fingerprint',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ])

      const attackDetection = await detectOAuthAttack(suspiciousCallback)

      expect(attackDetection.detected).toBe(true)
      expect(attackDetection.attackTypes).toContain('session_mismatch')
      expect(attackDetection.attackTypes).toContain('fingerprint_mismatch')
      expect(attackDetection.riskLevel).toBe('high')
    })
  })
})

// OAuth Flow Security Tests - Enhanced Security Testing
describe('OAuth Flow Security', () => {
  describe('State Parameter Security', () => {
    it('should generate cryptographically secure state', async () => {
      const state = await generateSecureOAuthState('test-user-123')

      // State should have timestamp.random.hash format
      const parts = state.split('.')
      expect(parts).toHaveLength(3)

      // Timestamp should be recent
      const timestamp = Number(parts[0])
      expect(timestamp).toBeGreaterThan(Date.now() - 1000)

      // Random part should be secure
      expect(parts[1]).toHaveLength(64) // 32 bytes = 64 hex chars

      // Hash should be truncated SHA-256
      expect(parts[2]).toHaveLength(32)
    })

    it('should bind state to session context', async () => {
      const sessionId = 'test-session-123'
      const clientFingerprint = 'test-fingerprint'

      const result = await validateOAuthStateSecure('test-state', sessionId, clientFingerprint)

      expect(result.securityChecks).toHaveProperty('sessionMatch')
      expect(result.securityChecks).toHaveProperty('fingerprintMatch')
    })
  })
})

describe('OAuth Flow Security', () => {
  describe('State Parameter Security', () => {
    it('should generate cryptographically secure state', async () => {
      const state = await generateSecureOAuthState('test-user-123')

      // State should have timestamp.random.hash format
      const parts = state.split('.')
      expect(parts).toHaveLength(3)

      // Timestamp should be recent
      const timestamp = Number(parts[0])
      expect(timestamp).toBeGreaterThan(Date.now() - 1000)
      expect(timestamp).toBeLessThanOrEqual(Date.now())

      // Random part should be 32 bytes (64 hex chars)
      expect(parts[1]).toHaveLength(64)

      // Hash should be 32 characters (truncated SHA-256)
      expect(parts[2]).toHaveLength(32)
    })

    it('should bind state to session context', async () => {
      const sessionId = 'test-session-123'
      const clientFingerprint = 'test-fingerprint'

      // Mock database response for state validation
      const mockDb = vi.mocked(sql)
      mockDb.mockResolvedValueOnce([
        {
          state: 'test-state',
          session_id: sessionId,
          client_fingerprint: clientFingerprint,
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ] as any)

      const result = await validateOAuthStateSecure('test-state', sessionId, clientFingerprint)

      expect(result.valid).toBe(true)
      expect(result.securityChecks.sessionMatch).toBe(true)
      expect(result.securityChecks.fingerprintMatch).toBe(true)
    })

    it('should validate state expiration', async () => {
      const expiredState = {
        state: 'expired-state',
        session_id: 'test-session',
        client_fingerprint: 'test-fingerprint',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        expires_at: new Date(Date.now() - 10 * 60 * 1000),
        security_flags: JSON.stringify({ version: '2.0' }),
      }

      const mockDb = vi.mocked(sql)
      mockDb.mockResolvedValueOnce([expiredState] as any)

      const result = await validateOAuthStateSecure(
        'expired-state',
        'test-session',
        'test-fingerprint'
      )

      expect(result.valid).toBe(false)
      expect(result.securityChecks.stateExists).toBe(true)
      expect(result.securityChecks.notExpired).toBe(false)
    })

    it('should prevent state replay attacks', async () => {
      const state = await generateSecureOAuthState()
      const mockDb = vi.mocked(sql)

      // First validation should work
      mockDb.mockResolvedValueOnce([
        {
          state,
          session_id: 'test-session',
          client_fingerprint: 'test-fingerprint',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
          security_flags: JSON.stringify({ version: '2.0' }),
        },
      ] as any)

      const firstResult = await validateOAuthStateSecure(state, 'test-session', 'test-fingerprint')
      expect(firstResult.valid).toBe(true)

      // Second attempt should fail (state no longer exists)
      mockDb.mockResolvedValueOnce([] as any)

      const secondResult = await validateOAuthStateSecure(state, 'test-session', 'test-fingerprint')
      expect(secondResult.valid).toBe(false)
      expect(secondResult.securityChecks.stateExists).toBe(false)
    })
  })

  describe('Redirect URI Validation', () => {
    it('should enforce allowlist validation', async () => {
      const allowedUris = [
        'https://app.contribux.com/auth/callback',
        'https://staging.contribux.com/auth/callback',
      ]

      // Valid URI should pass
      const validResult = await validateRedirectUriSecure(
        'https://app.contribux.com/auth/callback',
        allowedUris
      )
      expect(validResult.valid).toBe(true)

      // Invalid URI should fail
      const invalidResult = await validateRedirectUriSecure(
        'https://malicious.com/auth/callback',
        allowedUris
      )
      expect(invalidResult.valid).toBe(false)
    })

    it('should validate protocol requirements', async () => {
      // HTTPS should be required in production
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      try {
        const httpResult = await validateRedirectUriSecure('http://app.contribux.com/auth/callback')
        expect(httpResult.valid).toBe(false)
        expect(httpResult.securityChecks.protocolValid).toBe(false)

        const httpsResult = await validateRedirectUriSecure(
          'https://app.contribux.com/auth/callback'
        )
        expect(httpsResult.securityChecks.protocolValid).toBe(true)
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('should prevent redirect chain attacks', async () => {
      const redirectChainUris = [
        'https://app.contribux.com/callback?redirect=https://evil.com',
        'https://app.contribux.com/callback?next=https://malicious.com',
        'https://app.contribux.com/callback?return_to=https://attacker.com',
      ]

      for (const uri of redirectChainUris) {
        const result = await validateRedirectUriSecure(uri)
        expect(result.securityChecks.noRedirectChain).toBe(false)
        expect(result.valid).toBe(false)
      }
    })
  })
})
