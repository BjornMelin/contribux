import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { 
  authMiddleware,
  requireAuth,
  requireConsent,
  requireTwoFactor,
  rateLimit,
  checkMaintenanceMode,
  validateCSRF,
  auditRequest
} from '@/lib/auth/middleware'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { checkConsentRequired } from '@/lib/auth/gdpr'
import { logSecurityEvent } from '@/lib/auth/audit'
import type { User } from '@/types/auth'

// Mock dependencies
vi.mock('@/lib/auth/jwt')
vi.mock('@/lib/auth/gdpr')
vi.mock('@/lib/auth/audit')
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn()
}))

// Import sql mock
import { sql } from '@/lib/db/config'

describe('Route Protection Middleware', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authMiddleware', () => {
    it('should allow public routes without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/')
      const response = await authMiddleware(request)
      
      expect(response).toBeUndefined() // Passes through
    })

    it('should allow auth routes without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/auth/login')
      const response = await authMiddleware(request)
      
      expect(response).toBeUndefined() // Passes through
    })

    it('should require authentication for protected routes', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard')
      const response = await authMiddleware(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)
      expect(response?.headers.get('content-type')).toContain('application/json')
    })

    it('should validate access token from Authorization header', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })
      
      const response = await authMiddleware(request)
      
      expect(mockVerifyToken).toHaveBeenCalledWith('valid-token')
      expect(response).toBeUndefined() // Passes through
    })

    it('should validate access token from cookies', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      const request = new NextRequest('http://localhost:3000/api/user')
      request.cookies.set('access_token', 'valid-token')
      
      const response = await authMiddleware(request)
      
      expect(mockVerifyToken).toHaveBeenCalledWith('valid-token')
      expect(response).toBeUndefined() // Passes through
    })

    it('should reject expired tokens', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockRejectedValueOnce(new Error('Token expired'))
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'Authorization': 'Bearer expired-token'
        }
      })
      
      const response = await authMiddleware(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body.error).toBe('Token expired')
    })

    it('should handle rate limiting', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'Authorization': 'Bearer valid-token',
          'x-forwarded-for': '192.168.1.100'
        }
      })
      
      // Simulate multiple requests to trigger rate limit
      for (let i = 0; i < 100; i++) {
        await rateLimit(request)
      }
      
      const response = await authMiddleware(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(429)
      expect(response?.headers.get('x-ratelimit-limit')).toBeDefined()
      expect(response?.headers.get('x-ratelimit-remaining')).toBe('0')
      expect(response?.headers.get('retry-after')).toBeDefined()
    })

    it('should check maintenance mode', async () => {
      // Mock maintenance mode active
      process.env.MAINTENANCE_MODE = 'true'
      
      const request = new NextRequest('http://localhost:3000/api/user')
      const response = await authMiddleware(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(503)
      const body = await response?.json()
      expect(body.error).toBe('Service under maintenance')
      
      // Cleanup
      delete process.env.MAINTENANCE_MODE
    })

    it('should validate CSRF tokens for mutations', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValueOnce({} as any)
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Test' })
      })
      
      const response = await authMiddleware(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(403)
      const body = await response?.json()
      expect(body.error).toBe('Invalid CSRF token')
    })

    it('should allow mutations with valid CSRF token', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Test' })
      })
      request.cookies.set('csrf_token', 'valid-csrf-token')
      
      const response = await authMiddleware(request)
      
      expect(response).toBeUndefined() // Passes through
    })

    it('should audit security events', async () => {
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValueOnce({} as any)
      
      const request = new NextRequest('http://localhost:3000/dashboard')
      await authMiddleware(request)
      
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'authorization_failure',
        event_severity: 'warning',
        success: false
      }))
    })
  })

  describe('requireAuth', () => {
    it('should pass through authenticated requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      // Mock authenticated request
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123'
      }
      
      const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({ ok: true }))
      const wrapped = requireAuth(handler)
      
      const response = await wrapped(request, {} as any)
      
      expect(handler).toHaveBeenCalledWith(request, {})
      expect(response).toBeDefined()
    })

    it('should reject unauthenticated requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      
      const handler = vi.fn()
      const wrapped = requireAuth(handler)
      
      const response = await wrapped(request, {} as any)
      
      expect(handler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
    })

    it('should support custom error messages', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      
      const handler = vi.fn()
      const wrapped = requireAuth(handler, {
        errorMessage: 'Please log in first'
      })
      
      const response = await wrapped(request, {} as any)
      const body = await response.json()
      
      expect(body.error).toBe('Please log in first')
    })
  })

  describe('requireConsent', () => {
    it('should check required consents', async () => {
      const mockCheckConsent = vi.mocked(checkConsentRequired)
      mockCheckConsent.mockResolvedValueOnce(false) // Consent granted
      
      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123'
      }
      
      const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({ ok: true }))
      const wrapped = requireConsent(['terms_of_service', 'privacy_policy'])(handler)
      
      const response = await wrapped(request, {} as any)
      
      expect(mockCheckConsent).toHaveBeenCalledTimes(2)
      expect(handler).toHaveBeenCalled()
    })

    it('should reject when consent is missing', async () => {
      const mockCheckConsent = vi.mocked(checkConsentRequired)
      mockCheckConsent.mockResolvedValueOnce(true) // Consent required
      
      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123'
      }
      
      const handler = vi.fn()
      const wrapped = requireConsent(['marketing_emails'])(handler)
      
      const response = await wrapped(request, {} as any)
      const body = await response.json()
      
      expect(response.status).toBe(403)
      expect(body.error).toBe('Consent required')
      expect(body.required_consents).toContain('marketing_emails')
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('requireTwoFactor', () => {
    it('should pass through for users with 2FA enabled', async () => {
      const request = new NextRequest('http://localhost:3000/api/sensitive')
      ;(request as any).auth = {
        user: { ...mockUser, two_factor_enabled: true },
        session_id: 'session-123'
      }
      
      const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({ ok: true }))
      const wrapped = requireTwoFactor(handler)
      
      const response = await wrapped(request, {} as any)
      
      expect(handler).toHaveBeenCalled()
    })

    it('should reject users without 2FA', async () => {
      const request = new NextRequest('http://localhost:3000/api/sensitive')
      ;(request as any).auth = {
        user: { ...mockUser, two_factor_enabled: false },
        session_id: 'session-123'
      }
      
      const handler = vi.fn()
      const wrapped = requireTwoFactor(handler)
      
      const response = await wrapped(request, {} as any)
      const body = await response.json()
      
      expect(response.status).toBe(403)
      expect(body.error).toBe('Two-factor authentication required')
      expect(body.setup_url).toBeDefined()
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('rateLimit', () => {
    it('should track requests by IP', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1'
        }
      })
      
      const result = await rateLimit(request, {
        limit: 10,
        window: 60 * 1000 // 1 minute
      })
      
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
      expect(result.reset).toBeDefined()
    })

    it('should enforce rate limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.2'
        }
      })
      
      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        await rateLimit(request, { limit: 5, window: 60 * 1000 })
      }
      
      // Next request should be blocked
      const result = await rateLimit(request, { limit: 5, window: 60 * 1000 })
      
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should support custom keys for rate limiting', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123'
      }
      
      const result = await rateLimit(request, {
        limit: 100,
        window: 60 * 1000,
        keyGenerator: (req) => `user:${(req as any).auth?.user?.id}`
      })
      
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(99)
    })
  })

  describe('checkMaintenanceMode', () => {
    it('should allow requests when not in maintenance', async () => {
      const request = new NextRequest('http://localhost:3000/api/user')
      const result = await checkMaintenanceMode(request)
      
      expect(result).toBe(false)
    })

    it('should block requests during maintenance', async () => {
      process.env.MAINTENANCE_MODE = 'true'
      
      const request = new NextRequest('http://localhost:3000/api/user')
      const result = await checkMaintenanceMode(request)
      
      expect(result).toBe(true)
      
      delete process.env.MAINTENANCE_MODE
    })

    it('should allow admin bypass during maintenance', async () => {
      process.env.MAINTENANCE_MODE = 'true'
      process.env.MAINTENANCE_BYPASS_TOKEN = 'secret-token'
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'X-Maintenance-Bypass': 'secret-token'
        }
      })
      
      const result = await checkMaintenanceMode(request)
      
      expect(result).toBe(false)
      
      delete process.env.MAINTENANCE_MODE
      delete process.env.MAINTENANCE_BYPASS_TOKEN
    })
  })

  describe('validateCSRF', () => {
    it('should skip CSRF for safe methods', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'GET'
      })
      
      const result = await validateCSRF(request)
      
      expect(result).toBe(true)
    })

    it('should validate CSRF token from header', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'valid-token'
        }
      })
      request.cookies.set('csrf_token', 'valid-token')
      
      const result = await validateCSRF(request)
      
      expect(result).toBe(true)
    })

    it('should reject mismatched CSRF tokens', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'wrong-token'
        }
      })
      request.cookies.set('csrf_token', 'valid-token')
      
      const result = await validateCSRF(request)
      
      expect(result).toBe(false)
    })

    it('should support double-submit cookie pattern', async () => {
      const request = new NextRequest('http://localhost:3000/api/user', {
        method: 'POST'
      })
      request.cookies.set('csrf_token', 'valid-token')
      request.cookies.set('X-CSRF-Token', 'valid-token')
      
      const result = await validateCSRF(request)
      
      expect(result).toBe(true)
    })
  })

  describe('auditRequest', () => {
    it('should log successful requests', async () => {
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValueOnce({} as any)
      
      const request = new NextRequest('http://localhost:3000/api/user')
      ;(request as any).auth = {
        user: mockUser,
        session_id: 'session-123'
      }
      
      await auditRequest(request, {
        event_type: 'api_access',
        resource: '/api/user',
        success: true
      })
      
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'api_access',
        user_id: mockUser.id,
        success: true,
        event_data: expect.objectContaining({
          resource: '/api/user',
          method: 'GET',
          session_id: 'session-123'
        })
      }))
    })

    it('should log failed requests with error details', async () => {
      const mockLogEvent = vi.mocked(logSecurityEvent)
      mockLogEvent.mockResolvedValueOnce({} as any)
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'x-forwarded-for': '192.168.1.1'
        }
      })
      
      await auditRequest(request, {
        event_type: 'authorization_failure',
        resource: '/api/user',
        success: false,
        error: 'Unauthorized access attempt'
      })
      
      expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'authorization_failure',
        success: false,
        error_message: 'Unauthorized access attempt',
        ip_address: '192.168.1.1'
      }))
    })
  })

  describe('Middleware Composition', () => {
    it('should compose multiple middleware functions', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        github_username: mockUser.github_username,
        auth_method: 'oauth',
        session_id: 'session-123',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 900,
        iss: 'contribux',
        aud: ['contribux-api']
      })
      
      const mockSql = vi.mocked(sql)
      mockSql.mockResolvedValueOnce([mockUser]) // User exists
      
      const mockCheckConsent = vi.mocked(checkConsentRequired)
      mockCheckConsent.mockResolvedValue(false)
      
      const request = new NextRequest('http://localhost:3000/api/protected', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-CSRF-Token': 'valid-csrf',
          'Content-Type': 'application/json'
        }
      })
      request.cookies.set('csrf_token', 'valid-csrf')
      
      // Simulate middleware chain
      const authResponse = await authMiddleware(request)
      expect(authResponse).toBeUndefined() // Passes auth
      
      // Would continue to handler with requireAuth + requireConsent decorators
    })

    it('should handle errors gracefully', async () => {
      const mockVerifyToken = vi.mocked(verifyAccessToken)
      mockVerifyToken.mockRejectedValueOnce(new Error('Database connection failed'))
      
      const request = new NextRequest('http://localhost:3000/api/user', {
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })
      
      const response = await authMiddleware(request)
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(500)
      const body = await response?.json()
      expect(body.error).toBe('Internal server error')
      expect(body.details).toBeUndefined() // Don't leak internal errors
    })
  })
})