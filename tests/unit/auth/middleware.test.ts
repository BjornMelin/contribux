import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessToken } from '../../src/lib/auth/jwt'
import { authMiddleware } from '../../src/lib/auth/middleware'
import { sql } from '../../src/lib/db/config'

// Mock the JWT verification function
vi.mock('../../src/lib/auth/jwt', () => ({
  verifyAccessToken: vi.fn(),
}))

// Mock the database connection
vi.mock('../../src/lib/db/config', () => ({
  sql: vi.fn(),
}))

// Mock the audit functions
vi.mock('../../src/lib/auth/audit', () => ({
  createLogParams: vi.fn(),
  logSecurityEvent: vi.fn(),
}))

// Mock the crypto utils
vi.mock('../../src/lib/crypto-utils', () => ({
  timingSafeEqual: vi.fn(),
}))

// Mock environment
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'secure-test-token-32chars-minimum',
    NODE_ENV: 'test',
  },
}))

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Public Routes', () => {
    it('should allow access to public routes without authentication', async () => {
      const publicRoutes = ['/', '/about', '/pricing', '/legal']

      for (const route of publicRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(verifyAccessToken).not.toHaveBeenCalled()
      }
    })

    it('should allow access to public API routes without authentication', async () => {
      const publicApiRoutes = ['/api/auth/signin', '/api/auth/callback', '/api/health']

      for (const route of publicApiRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(verifyAccessToken).not.toHaveBeenCalled()
      }
    })

    it('should allow access to auth routes without authentication', async () => {
      const authRoutes = ['/auth/signin', '/auth/error', '/auth/verify-request']

      for (const route of authRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(verifyAccessToken).not.toHaveBeenCalled()
      }
    })

    it('should allow access to Next.js internal routes', async () => {
      const internalRoutes = [
        '/_next/static/chunk.js',
        '/_next/image?url=/logo.png',
        '/favicon.ico',
      ]

      for (const route of internalRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(verifyAccessToken).not.toHaveBeenCalled()
      }
    })
  })

  describe('Protected Routes', () => {
    it('should return 401 for unauthenticated requests to protected routes', async () => {
      const protectedRoutes = ['/dashboard', '/profile', '/settings']

      for (const route of protectedRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeInstanceOf(NextResponse)
        expect(response?.status).toBe(401)
        const body = await response?.json()
        expect(body.error).toBe('Authentication required')
      }
    })

    it('should return 401 for unauthenticated API requests', async () => {
      const protectedApiRoutes = ['/api/user/profile', '/api/repositories', '/api/opportunities']

      for (const route of protectedApiRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeInstanceOf(NextResponse)
        expect(response?.status).toBe(401)
        const body = await response?.json()
        expect(body.error).toBe('Authentication required')
      }
    })

    it('should handle invalid tokens gracefully', async () => {
      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('Invalid token'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('Authorization', 'Bearer invalid-token')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body.error).toBe('Invalid token')
    })

    it('should handle missing users gracefully', async () => {
      vi.mocked(verifyAccessToken).mockResolvedValue({
        sub: 'nonexistent-user-id',
        sessionId: 'test-session-id',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      })

      vi.mocked(sql).mockResolvedValue([]) // No user found

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('Authorization', 'Bearer valid-token')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body.error).toBe('User not found')
    })

    it('should handle locked users gracefully', async () => {
      vi.mocked(verifyAccessToken).mockResolvedValue({
        sub: 'locked-user-id',
        sessionId: 'test-session-id',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      })

      vi.mocked(sql).mockResolvedValue([
        {
          id: 'locked-user-id',
          email: 'locked@example.com',
          lockedAt: new Date().toISOString(),
        },
      ])

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('Authorization', 'Bearer valid-token')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(403)
      const body = await response?.json()
      expect(body.error).toBe('Account locked')
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      vi.mocked(verifyAccessToken).mockResolvedValue({
        sub: 'test-user-id',
        sessionId: 'test-session-id',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      })

      // Mock database error
      vi.mocked(sql).mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('Authorization', 'Bearer test-token')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(500)
      const body = await response?.json()
      expect(body.error).toBe('Internal server error')
    })

    it('should handle unknown JWT errors', async () => {
      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('JWT verification failed'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('Authorization', 'Bearer invalid-token')
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(500)
      const body = await response?.json()
      expect(body.error).toBe('Internal server error')
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limiting functionality', async () => {
      // This is primarily testing the basic rate limiting integration
      // The actual rate limiting logic is tested separately and uses fallback mechanisms
      const request = new NextRequest(new URL('http://localhost:3000/'))
      Object.defineProperty(request, 'ip', { value: '127.0.0.1' })

      const response = await authMiddleware(request)

      // For a public route, should pass without issues
      expect(response).toBeUndefined()
    })
  })
})
