import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  generateOAuthUrl,
  validateOAuthCallback,
  exchangeCodeForTokens,
  refreshOAuthTokens,
  unlinkOAuthAccount
} from '@/lib/auth/oauth'
import { sql } from '@/lib/db/config'
import { generatePKCEChallenge } from '@/lib/auth/pkce'
import type { OAuthTokens, OAuthCallbackParams } from '@/types/auth'

// Mock env validation for this test file
vi.mock("@/lib/validation/env", () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    JWT_SECRET: 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
    GITHUB_CLIENT_ID: 'test1234567890123456',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret-with-sufficient-length-for-testing',
  },
  isProduction: () => false,
  isDevelopment: () => false,
  isTest: () => true,
  getJwtSecret: () => 'test-jwt-secret-with-sufficient-length-and-entropy-for-testing-purposes-only',
  getEncryptionKey: () => 'test-encryption-key-32-bytes-long',
}));

// Mock PKCE generation
vi.mock('@/lib/auth/pkce', () => ({
  generatePKCEChallenge: vi.fn(() => ({
    codeVerifier: 'test-verifier-123',
    codeChallenge: 'test-challenge-123'
  }))
}))

// Mock crypto functions
vi.mock('@/lib/auth/crypto', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/crypto')>('@/lib/auth/crypto')
  return {
    ...actual,
    encryptOAuthToken: vi.fn(async (token: string) => 
      JSON.stringify({
        iv: Buffer.from('test-iv').toString('base64'),
        ciphertext: Buffer.from('encrypted-' + token).toString('base64'),
        tag: Buffer.from('test-tag').toString('base64'),
        keyId: 'key-123'
      })
    ),
    decryptOAuthToken: vi.fn(async (encrypted: string) => {
      // Return mock refresh token
      return 'ghr_refreshtoken123'
    })
  }
})

// Note: Database and fetch mocks are defined in tests/setup.ts

describe('OAuth Authentication', () => {
  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    github_username: 'testuser'
  }

  const mockConfig = {
    clientId: 'test1234567890123456', // Using mocked value from env validation mock
    clientSecret: 'test-github-client-secret-with-sufficient-length-for-testing', // Using mocked value
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/auth/github/callback'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('OAuth URL Generation', () => {
    it('should generate OAuth URL with PKCE parameters', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([]) // Store state

      const result = await generateOAuthUrl({
        provider: 'github',
        redirectUri: mockConfig.redirectUri,
        scopes: ['user:email', 'read:user']
      })

      expect(result).toMatchObject({
        url: expect.stringContaining('https://github.com/login/oauth/authorize'),
        state: expect.any(String),
        codeVerifier: 'test-verifier-123'
      })

      // Verify URL contains required parameters
      const url = new URL(result.url)
      expect(url.searchParams.get('client_id')).toBe(mockConfig.clientId)
      expect(url.searchParams.get('redirect_uri')).toBe(mockConfig.redirectUri)
      expect(url.searchParams.get('scope')).toBe('user:email read:user')
      expect(url.searchParams.get('state')).toBe(result.state)
      expect(url.searchParams.get('code_challenge')).toBe('test-challenge-123')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })

    it('should store OAuth state in database', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      await generateOAuthUrl({
        provider: 'github',
        redirectUri: mockConfig.redirectUri,
        scopes: ['user:email']
      })

      expect(mockSql).toHaveBeenCalled()
      const calls = mockSql.mock.calls
      const stateCall = calls.find(call => 
        call[0] && call[0][0] && call[0][0].includes('INSERT INTO oauth_states')
      )
      expect(stateCall).toBeDefined()
    })

    it('should include optional parameters when provided', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])

      const result = await generateOAuthUrl({
        provider: 'github',
        redirectUri: mockConfig.redirectUri,
        scopes: ['user:email'],
        userId: mockUser.id,
        allowSignup: false
      })

      const url = new URL(result.url)
      expect(url.searchParams.get('allow_signup')).toBe('false')
    })
  })

  describe('OAuth Callback Validation', () => {
    it('should validate callback with correct state and code', async () => {
      const mockSql = vi.mocked(sql)
      const mockState = {
        state: 'test-state-123',
        code_verifier: 'test-verifier-123',
        provider: 'github',
        redirect_uri: mockConfig.redirectUri,
        created_at: new Date()
      }

      // Mock state retrieval
      mockSql.mockResolvedValueOnce([mockState])
      // Mock state deletion
      mockSql.mockResolvedValueOnce([])

      const params: OAuthCallbackParams = {
        code: 'auth-code-123',
        state: 'test-state-123'
      }

      const result = await validateOAuthCallback(params)

      expect(result).toMatchObject({
        valid: true,
        code: 'auth-code-123',
        codeVerifier: 'test-verifier-123',
        provider: 'github'
      })
    })

    it('should reject callback with invalid state', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([]) // No state found

      const params: OAuthCallbackParams = {
        code: 'auth-code-123',
        state: 'invalid-state'
      }

      await expect(
        validateOAuthCallback(params)
      ).rejects.toThrow('Invalid OAuth state')
    })

    it('should reject callback with expired state', async () => {
      const mockSql = vi.mocked(sql)
      const expiredState = {
        state: 'test-state-123',
        code_verifier: 'test-verifier-123',
        provider: 'github',
        redirect_uri: mockConfig.redirectUri,
        created_at: new Date(Date.now() - 11 * 60 * 1000) // 11 minutes ago
      }

      mockSql.mockResolvedValueOnce([expiredState])

      const params: OAuthCallbackParams = {
        code: 'auth-code-123',
        state: 'test-state-123'
      }

      await expect(
        validateOAuthCallback(params)
      ).rejects.toThrow('OAuth state expired')
    })

    it('should reject callback with error parameter', async () => {
      const params: OAuthCallbackParams = {
        error: 'access_denied',
        error_description: 'User denied access',
        state: 'test-state-123'
      }

      await expect(
        validateOAuthCallback(params)
      ).rejects.toThrow('OAuth error: access_denied - User denied access')
    })
  })

  describe('Token Exchange', () => {
    it('should exchange authorization code for tokens', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockTokenResponse = {
        access_token: 'gho_accesstoken123',
        token_type: 'bearer',
        scope: 'user:email read:user',
        refresh_token: 'ghr_refreshtoken123'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      } as Response)

      const tokens = await exchangeCodeForTokens({
        code: 'auth-code-123',
        codeVerifier: 'test-verifier-123',
        redirectUri: mockConfig.redirectUri
      })

      expect(tokens).toMatchObject({
        accessToken: 'gho_accesstoken123',
        tokenType: 'bearer',
        scope: 'user:email read:user',
        refreshToken: 'ghr_refreshtoken123'
      })

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: mockConfig.clientId,
            client_secret: mockConfig.clientSecret,
            code: 'auth-code-123',
            redirect_uri: mockConfig.redirectUri,
            code_verifier: 'test-verifier-123'
          })
        })
      )
    })

    it('should handle token exchange errors', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.'
        })
      } as Response)

      await expect(
        exchangeCodeForTokens({
          code: 'invalid-code',
          codeVerifier: 'test-verifier-123',
          redirectUri: mockConfig.redirectUri
        })
      ).rejects.toThrow('Token exchange failed: bad_verification_code')
    })

    it('should fetch user profile and store OAuth account', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockSql = vi.mocked(sql)
      
      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_accesstoken123',
          token_type: 'bearer',
          scope: 'user:email read:user',
          refresh_token: 'ghr_refreshtoken123'
        })
      } as Response)

      // Mock user profile fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          login: 'testuser',
          email: 'test@example.com',
          name: 'Test User'
        })
      } as Response)

      // Mock user lookup/creation
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      // Mock encryption key lookup
      mockSql.mockResolvedValueOnce([{
        id: 'key-123',
        key_data: JSON.stringify({
          k: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3RrZXk=',
          kty: 'oct',
          alg: 'A256GCM',
          key_ops: ['encrypt', 'decrypt']
        }),
        is_active: true
      }]) // Active encryption key exists
      
      // Mock OAuth account token encryption storage
      mockSql.mockResolvedValueOnce([])
      
      // Mock OAuth account creation
      mockSql.mockResolvedValueOnce([])

      const result = await exchangeCodeForTokens({
        code: 'auth-code-123',
        codeVerifier: 'test-verifier-123',
        redirectUri: mockConfig.redirectUri,
        fetchUserProfile: true
      })

      expect(result).toMatchObject({
        accessToken: 'gho_accesstoken123',
        user: expect.objectContaining({
          id: mockUser.id,
          email: 'test@example.com',
          github_username: 'testuser'
        })
      })

      // Verify user profile was fetched
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer gho_accesstoken123',
            'Accept': 'application/vnd.github.v3+json'
          }
        })
      )
    })
  })

  describe('Token Refresh', () => {
    it('should refresh access token using refresh token', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockSql = vi.mocked(sql)
      
      // Mock OAuth account retrieval
      mockSql.mockResolvedValueOnce([{
        id: 'oauth-account-id',
        user_id: mockUser.id,
        provider: 'github',
        refresh_token: JSON.stringify({
          iv: Buffer.from('test-iv').toString('base64'),
          ciphertext: Buffer.from('encrypted-tokens').toString('base64'),
          tag: Buffer.from('test-tag').toString('base64'),
          keyId: 'key-123'
        })
      }])
      
      // Mock encryption key lookup
      mockSql.mockResolvedValueOnce([{
        id: 'key-123',
        key_data: JSON.stringify({
          k: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3RrZXk=',
          kty: 'oct',
          alg: 'A256GCM',
          key_ops: ['encrypt', 'decrypt']
        }),
        is_active: true
      }])

      // Mock token refresh response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_newaccesstoken456',
          token_type: 'bearer',
          expires_in: 28800,
          refresh_token: 'ghr_newrefreshtoken456',
          refresh_token_expires_in: 15897600,
          scope: 'user:email read:user'
        })
      } as Response)

      // Mock encryption key lookup for new token
      mockSql.mockResolvedValueOnce([{
        id: 'key-123',
        key_data: JSON.stringify({
          k: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3RrZXk=',
          kty: 'oct',
          alg: 'A256GCM',
          key_ops: ['encrypt', 'decrypt']
        }),
        is_active: true
      }])
      
      // Mock token update
      mockSql.mockResolvedValueOnce([])

      const tokens = await refreshOAuthTokens({
        userId: mockUser.id,
        provider: 'github'
      })

      expect(tokens).toMatchObject({
        accessToken: 'gho_newaccesstoken456',
        refreshToken: 'ghr_newrefreshtoken456',
        expiresAt: expect.any(Date)
      })

      // Verify refresh token was used
      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('grant_type=refresh_token')
        })
      )
    })

    it('should handle refresh token errors', async () => {
      const mockFetch = vi.mocked(fetch)
      const mockSql = vi.mocked(sql)
      
      mockSql.mockResolvedValueOnce([{
        id: 'oauth-account-id',
        user_id: mockUser.id,
        provider: 'github',
        refresh_token: JSON.stringify({
          iv: Buffer.from('test-iv').toString('base64'),
          ciphertext: Buffer.from('encrypted-tokens').toString('base64'),
          tag: Buffer.from('test-tag').toString('base64'),
          keyId: 'key-123'
        })
      }])
      
      // Mock encryption key lookup
      mockSql.mockResolvedValueOnce([{
        id: 'key-123',
        key_data: JSON.stringify({
          k: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3RrZXk=',
          kty: 'oct',
          alg: 'A256GCM',
          key_ops: ['encrypt', 'decrypt']
        }),
        is_active: true
      }])

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'The provided authorization grant is invalid, expired, or revoked'
        })
      } as Response)

      await expect(
        refreshOAuthTokens({
          userId: mockUser.id,
          provider: 'github'
        })
      ).rejects.toThrow('Token refresh failed: invalid_grant')
    })
  })

  describe('OAuth Account Management', () => {
    it('should unlink OAuth account', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock account exists check
      mockSql.mockResolvedValueOnce([{
        id: 'oauth-account-id',
        user_id: mockUser.id,
        provider: 'github'
      }])
      
      // Mock WebAuthn credentials count (user has WebAuthn)
      mockSql.mockResolvedValueOnce([{ count: '1' }])
      
      // Mock other OAuth accounts count
      mockSql.mockResolvedValueOnce([{ count: '0' }])
      
      // Mock account deletion
      mockSql.mockResolvedValueOnce([])
      
      // Mock audit log
      mockSql.mockResolvedValueOnce([])

      await unlinkOAuthAccount({
        userId: mockUser.id,
        provider: 'github'
      })

      // Verify deletion was called
      const calls = mockSql.mock.calls
      const deleteCall = calls.find(call => 
        call[0] && call[0][0] && call[0][0].includes('DELETE FROM oauth_accounts')
      )
      expect(deleteCall).toBeDefined()
    })

    it('should prevent unlinking last auth method', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock account exists
      mockSql.mockResolvedValueOnce([{
        id: 'oauth-account-id',
        user_id: mockUser.id,
        provider: 'github'
      }])
      
      // Mock no WebAuthn credentials
      mockSql.mockResolvedValueOnce([{ count: '0' }])
      
      // Mock no other OAuth accounts
      mockSql.mockResolvedValueOnce([{ count: '0' }])

      await expect(
        unlinkOAuthAccount({
          userId: mockUser.id,
          provider: 'github'
        })
      ).rejects.toThrow('Cannot unlink last authentication method')
    })
  })

  describe('Security Features', () => {
    it('should validate redirect URI against whitelist', async () => {
      await expect(
        generateOAuthUrl({
          provider: 'github',
          redirectUri: 'http://evil.com/callback',
          scopes: ['user:email']
        })
      ).rejects.toThrow('Invalid redirect URI')
    })

    it('should encrypt tokens before storage', async () => {
      const mockSql = vi.mocked(sql)
      const mockFetch = vi.mocked(fetch)
      
      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_plaintext_token',
          refresh_token: 'ghr_plaintext_refresh'
        })
      } as Response)

      // Mock user profile
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          login: 'testuser',
          email: 'test@example.com'
        })
      } as Response)

      // Mock encryption key lookup
      mockSql.mockResolvedValueOnce([{
        id: 'key-123',
        key_data: JSON.stringify({
          k: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3RrZXk=',
          kty: 'oct',
          alg: 'A256GCM',
          key_ops: ['encrypt', 'decrypt']
        }),
        is_active: true
      }])
      
      // Mock OAuth account token encryption storage
      mockSql.mockResolvedValueOnce([])
      
      // Mock user lookup
      mockSql.mockResolvedValueOnce([mockUser])
      
      // Capture OAuth account creation
      mockSql.mockResolvedValueOnce([])

      await exchangeCodeForTokens({
        code: 'auth-code-123',
        codeVerifier: 'test-verifier-123',
        redirectUri: mockConfig.redirectUri,
        fetchUserProfile: true
      })

      // Verify tokens were encrypted before storage
      const calls = mockSql.mock.calls
      const insertCall = calls.find(call => 
        call[0] && call[0][0] && call[0][0].includes('INSERT INTO oauth_accounts')
      )
      
      expect(insertCall).toBeDefined()
      // The actual tokens in the call should be encrypted (not plain text)
      expect(insertCall).not.toContain('gho_plaintext_token')
      expect(insertCall).not.toContain('ghr_plaintext_refresh')
    })

    it('should log OAuth events in audit log', async () => {
      const mockSql = vi.mocked(sql)
      const mockFetch = vi.mocked(fetch)
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh'
        })
      } as Response)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          login: 'testuser',
          email: 'test@example.com'
        })
      } as Response)

      // Mock encryption key lookup
      mockSql.mockResolvedValueOnce([{
        id: 'key-123',
        key_data: JSON.stringify({
          k: 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3RrZXk=',
          kty: 'oct',
          alg: 'A256GCM',
          key_ops: ['encrypt', 'decrypt']
        }),
        is_active: true
      }])
      
      // Mock OAuth account token encryption storage
      mockSql.mockResolvedValueOnce([])
      
      mockSql.mockResolvedValueOnce([mockUser])
      mockSql.mockResolvedValueOnce([]) // OAuth account creation
      mockSql.mockResolvedValueOnce([]) // Audit log

      await exchangeCodeForTokens({
        code: 'auth-code-123',
        codeVerifier: 'test-verifier-123',
        redirectUri: mockConfig.redirectUri,
        fetchUserProfile: true,
        securityContext: {
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0...'
        }
      })

      // Verify audit log was created
      const calls = mockSql.mock.calls
      const auditCall = calls.find(call => 
        call[0] && call[0][0] && call[0][0].includes('security_audit_logs')
      )
      expect(auditCall).toBeDefined()
    })
  })
})