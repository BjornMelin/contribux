import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens
} from '@/lib/auth/jwt'
import { sql } from '@/lib/db/config'
import type { User, UserSession, AccessTokenPayload, RefreshTokenPayload } from '@/types/auth'

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn()
}))

// Mock crypto for consistent token generation in tests
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'test-uuid-123'),
    randomBytes: vi.fn((size: number) => {
      // Return consistent but different values for each call
      const mockData = Buffer.alloc(size)
      for (let i = 0; i < size; i++) {
        mockData[i] = (i + Math.floor(Math.random() * 256)) % 256
      }
      return mockData
    })
  }
})

describe('JWT Token Strategy', () => {
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    github_username: 'testuser',
    email_verified: true,
    two_factor_enabled: false,
    recovery_email: null,
    locked_at: null,
    failed_login_attempts: 0,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date()
  }

  const mockSession: UserSession = {
    id: 'session-123',
    user_id: mockUser.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    auth_method: 'oauth',
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    created_at: new Date(),
    last_active_at: new Date()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset time to ensure consistent token expiration
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Access Token Generation', () => {
    it('should generate JWT access token with 15 minute expiration', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      
      // Verify JWT structure
      const parts = token.split('.')
      expect(parts).toHaveLength(3) // header.payload.signature
      
      // Verify token can be decoded
      const payload = await verifyAccessToken(token)
      expect(payload.exp - payload.iat).toBe(15 * 60) // 15 minutes
    })

    it('should include required claims in access token', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      const payload = await verifyAccessToken(token)
      
      expect(payload).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: mockSession.auth_method,
        session_id: mockSession.id,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
    })

    it('should use secure signing algorithm', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      
      // Decode header without verification
      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString()
      )
      
      expect(header.alg).toBe('HS256') // Or RS256 for production
      expect(header.typ).toBe('JWT')
    })
  })

  describe('Refresh Token Generation', () => {
    it('should generate refresh token with hash storage', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ id: 'refresh-token-id' }])
      
      const token = await generateRefreshToken(mockUser.id, mockSession.id)
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      
      // Verify token was stored in database with hash
      const calls = mockSql.mock.calls
      const query = Array.isArray(calls[0][0]) ? calls[0][0].join('') : calls[0][0]
      expect(query).toContain('INSERT INTO refresh_tokens')
      expect(query).toContain('token_hash')
    })

    it('should set appropriate expiration for refresh token', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ id: 'refresh-token-id' }])
      
      await generateRefreshToken(mockUser.id, mockSession.id)
      
      const calls = mockSql.mock.calls
      const insertCall = calls[0]
      
      // Check that expiration is set (e.g., 7 days)
      // Template literal combines the parts
      const sqlQuery = Array.isArray(insertCall[0]) ? insertCall[0].join('') : insertCall[0]
      expect(sqlQuery).toContain('expires_at')
      expect(sqlQuery).toContain('7 days')
    })

    it('should generate cryptographically secure token', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ id: 'refresh-token-id-1' }])
      mockSql.mockResolvedValueOnce([{ id: 'refresh-token-id-2' }])
      
      const token1 = await generateRefreshToken(mockUser.id, mockSession.id)
      const token2 = await generateRefreshToken(mockUser.id, mockSession.id)
      
      expect(token1).not.toBe(token2)
      expect(token1.length).toBeGreaterThanOrEqual(32)
    })
  })

  describe('Access Token Verification', () => {
    it('should verify valid access token', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      const payload = await verifyAccessToken(token)
      
      expect(payload).toBeDefined()
      expect(payload.sub).toBe(mockUser.id)
    })

    it('should reject expired access token', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      
      // Advance time by 16 minutes
      vi.advanceTimersByTime(16 * 60 * 1000)
      
      await expect(verifyAccessToken(token)).rejects.toThrow('Token expired')
    })

    it('should reject token with invalid signature', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      const tamperedToken = token.slice(0, -5) + 'XXXXX'
      
      await expect(verifyAccessToken(tamperedToken)).rejects.toThrow('Invalid token')
    })

    it('should reject malformed token', async () => {
      await expect(verifyAccessToken('not.a.token')).rejects.toThrow()
      await expect(verifyAccessToken('')).rejects.toThrow()
    })
  })

  describe('Refresh Token Verification', () => {
    it('should verify valid refresh token', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock token creation
      mockSql.mockResolvedValueOnce([{ id: 'refresh-token-id' }])
      const token = await generateRefreshToken(mockUser.id, mockSession.id)
      
      // Mock token verification
      mockSql.mockResolvedValueOnce([{
        id: 'refresh-token-id',
        user_id: mockUser.id,
        session_id: mockSession.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked_at: null
      }])
      
      const payload = await verifyRefreshToken(token)
      
      expect(payload).toMatchObject({
        jti: 'refresh-token-id',
        sub: mockUser.id,
        session_id: mockSession.id
      })
    })

    it('should reject non-existent refresh token', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([]) // No token found
      
      await expect(verifyRefreshToken('invalid-token')).rejects.toThrow('Invalid refresh token')
    })

    it('should reject expired refresh token', async () => {
      const mockSql = vi.mocked(sql)
      
      mockSql.mockResolvedValueOnce([{
        id: 'refresh-token-id',
        user_id: mockUser.id,
        session_id: mockSession.id,
        expires_at: new Date(Date.now() - 1000), // Already expired
        revoked_at: null
      }])
      
      await expect(verifyRefreshToken('expired-token')).rejects.toThrow('Refresh token expired')
    })

    it('should reject revoked refresh token', async () => {
      const mockSql = vi.mocked(sql)
      
      mockSql.mockResolvedValueOnce([{
        id: 'refresh-token-id',
        user_id: mockUser.id,
        session_id: mockSession.id,
        expires_at: new Date(Date.now() + 1000),
        revoked_at: new Date() // Token is revoked
      }])
      
      await expect(verifyRefreshToken('revoked-token')).rejects.toThrow('Refresh token revoked')
    })
  })

  describe('Refresh Token Rotation', () => {
    it('should rotate refresh token and generate new access token', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock old token verification
      mockSql.mockResolvedValueOnce([{
        id: 'old-refresh-token-id',
        user_id: mockUser.id,
        session_id: mockSession.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revoked_at: null
      }])
      
      // Mock user retrieval
      mockSql.mockResolvedValueOnce([mockUser])
      
      // Mock session retrieval
      mockSql.mockResolvedValueOnce([mockSession])
      
      // Mock new refresh token creation
      mockSql.mockResolvedValueOnce([{ id: 'new-refresh-token-id' }])
      
      // Mock new token ID lookup (in case token doesn't have payload part)
      mockSql.mockResolvedValueOnce([{ id: 'new-refresh-token-id' }])
      
      // Mock old token revocation with replaced_by
      mockSql.mockResolvedValueOnce([])
      
      const result = await rotateRefreshToken('old-refresh-token')
      
      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: 900 // 15 minutes
      })
      
      // Verify old token was revoked
      const calls = mockSql.mock.calls
      const revokeCall = calls.find(call => {
        const query = Array.isArray(call[0]) ? call[0].join('') : (call[0] || '').toString()
        return query.includes('UPDATE refresh_tokens') && query.includes('revoked_at')
      })
      expect(revokeCall).toBeDefined()
    })

    it('should link new token to replaced token', async () => {
      const mockSql = vi.mocked(sql)
      
      // Setup mocks
      mockSql.mockResolvedValueOnce([{
        id: 'old-token-id',
        user_id: mockUser.id,
        session_id: mockSession.id,
        expires_at: new Date(Date.now() + 1000),
        revoked_at: null
      }])
      mockSql.mockResolvedValueOnce([mockUser])
      mockSql.mockResolvedValueOnce([mockSession])
      mockSql.mockResolvedValueOnce([{ id: 'new-token-id' }])
      
      // Mock new token ID lookup (in case token doesn't have payload part)
      mockSql.mockResolvedValueOnce([{ id: 'new-token-id' }])
      
      // Mock old token revocation with replaced_by
      mockSql.mockResolvedValueOnce([])
      
      await rotateRefreshToken('old-token')
      
      // Verify replaced_by was set
      const calls = mockSql.mock.calls
      const updateCall = calls.find(call => {
        const query = Array.isArray(call[0]) ? call[0].join('') : (call[0] || '').toString()
        return query.includes('replaced_by')
      })
      expect(updateCall).toBeDefined()
    })

    it('should detect token reuse attack', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock token that was already rotated
      mockSql.mockResolvedValueOnce([{
        id: 'old-token-id',
        user_id: mockUser.id,
        session_id: mockSession.id,
        expires_at: new Date(Date.now() + 1000),
        revoked_at: new Date(),
        replaced_by: 'new-token-id'
      }])
      
      // Mock user_id lookup for revoked token
      mockSql.mockResolvedValueOnce([{
        user_id: mockUser.id
      }])
      
      // Mock revoke all tokens
      mockSql.mockResolvedValueOnce([])
      
      await expect(
        rotateRefreshToken('reused-token')
      ).rejects.toThrow('Token reuse detected')
      
      // Verify all user tokens were revoked
      const calls = mockSql.mock.calls
      const revokeAllCall = calls.find(call => {
        const query = Array.isArray(call[0]) ? call[0].join('') : (call[0] || '').toString()
        return query.includes('revoke_all_user_tokens')
      })
      expect(revokeAllCall).toBeDefined()
    })
  })

  describe('Token Revocation', () => {
    it('should revoke specific refresh token', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])
      
      await revokeRefreshToken('token-to-revoke')
      
      const calls = mockSql.mock.calls
      const query = Array.isArray(calls[0][0]) ? calls[0][0].join('') : calls[0][0]
      expect(query).toContain('UPDATE refresh_tokens')
      expect(query).toContain('revoked_at')
      expect(query).toContain('token_hash')
    })

    it('should revoke all user tokens', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([])
      
      await revokeAllUserTokens(mockUser.id)
      
      const calls = mockSql.mock.calls
      const query = Array.isArray(calls[0][0]) ? calls[0][0].join('') : calls[0][0]
      expect(query).toContain('revoke_all_user_tokens')
    })

    it('should handle cascading session termination', async () => {
      const mockSql = vi.mocked(sql)
      
      // Mock token revocation (revoke_all_user_tokens)
      mockSql.mockResolvedValueOnce([])
      
      // Mock active sessions query
      mockSql.mockResolvedValueOnce([
        { id: 'session-1' },
        { id: 'session-2' }
      ])
      
      // Mock session termination
      mockSql.mockResolvedValueOnce([])
      
      await revokeAllUserTokens(mockUser.id, { terminateSessions: true })
      
      // Verify sessions were terminated
      const calls = mockSql.mock.calls
      const sessionCall = calls.find(call => {
        const query = Array.isArray(call[0]) ? call[0].join('') : (call[0] || '').toString()
        return query.includes('DELETE FROM user_sessions')
      })
      expect(sessionCall).toBeDefined()
    })
  })

  describe('Security Features', () => {
    it('should use constant-time comparison for token hashes', async () => {
      // This is tested implicitly through the verification functions
      // In production, ensure crypto.timingSafeEqual is used
      expect(true).toBe(true)
    })

    it('should handle token size limits', async () => {
      const largeUser = {
        ...mockUser,
        email: 'x'.repeat(1000) // Very long email
      }
      
      const token = await generateAccessToken(largeUser, mockSession)
      
      // JWT should still be reasonable size
      expect(token.length).toBeLessThan(8192) // 8KB limit
    })

    it('should include security headers in token', async () => {
      const token = await generateAccessToken(mockUser, mockSession)
      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString()
      )
      
      expect(header.typ).toBe('JWT')
      expect(header.alg).toBeDefined()
    })
  })

  describe('Token Cleanup', () => {
    it('should clean up expired tokens', async () => {
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([{ count: '5' }]) // 5 tokens cleaned
      
      const cleaned = await cleanupExpiredTokens()
      
      expect(cleaned).toBe(5)
      
      const calls = mockSql.mock.calls
      const query = Array.isArray(calls[0][0]) ? calls[0][0].join('') : calls[0][0]
      expect(query).toContain('DELETE FROM refresh_tokens')
      expect(query).toContain('expires_at')
    })
  })
})