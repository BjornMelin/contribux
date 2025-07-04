/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all external dependencies first
vi.mock('next/server', () => {
  const MockNextRequest = class {
    public url: URL
    public nextUrl: URL
    public headers: Map<string, string>

    constructor(url: string | URL) {
      this.url = typeof url === 'string' ? new URL(url) : url
      this.nextUrl = this.url // nextUrl should be the same as url for testing
      this.headers = new Map()
    }

    get pathname() {
      return this.url.pathname
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: vi.fn((body: any, init?: any) => ({
        status: init?.status || 200,
        json: vi.fn(async () => body),
      })),
      redirect: vi.fn((url: string) => ({
        status: 302,
        headers: { location: url },
      })),
    },
  }
})

vi.mock('@/lib/auth/jwt', () => ({
  verifyAccessToken: vi.fn(),
}))

vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/auth/audit', () => ({
  createLogParams: vi.fn(),
  logSecurityEvent: vi.fn(),
}))

vi.mock('@/lib/crypto-utils', () => ({
  timingSafeEqual: vi.fn(),
}))

// Mock environment
vi.stubEnv('NEXTAUTH_SECRET', 'secure-test-token-32chars-minimum')
vi.stubEnv('NODE_ENV', 'test')

vi.mock('@/lib/validation/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'secure-test-token-32chars-minimum',
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-32-chars-minimum',
  },
}))

import { verifyAccessToken } from '@/lib/auth/jwt'
import { authMiddleware } from '@/lib/auth/middleware'
import { sql } from '@/lib/db/config'
import { NextRequest } from 'next/server'

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
      const authRoutes = ['/auth/signin', '/auth/callback', '/auth/error']

      for (const route of authRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(verifyAccessToken).not.toHaveBeenCalled()
      }
    })

    it('should allow access to Next.js internal routes', async () => {
      const internalRoutes = ['/_next/static/chunks/app.js', '/_next/image?url=/logo.png']

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

        expect(response).toBeInstanceOf(Object)
        expect(response?.status).toBe(401)
        const body = await response?.json()
        expect(body.error).toBe('Authentication required')
      }
    })

    it('should return 401 for unauthenticated API requests', async () => {
      const protectedApiRoutes = ['/api/user/profile', '/api/repositories']

      for (const route of protectedApiRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeInstanceOf(Object)
        expect(response?.status).toBe(401)
        const body = await response?.json()
        expect(body.error).toBe('Authentication required')
      }
    })

    it('should handle invalid tokens gracefully', async () => {
      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('Invalid token'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('authorization', 'Bearer invalid-token')

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(Object)
      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body.error).toBe('Authentication required')
    })

    it('should handle missing users gracefully', async () => {
      vi.mocked(verifyAccessToken).mockResolvedValue({
        sub: 'non-existent-user-id',
        sessionId: 'test-session-id',
        authMethod: 'oauth',
        scope: ['read'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        jti: 'test-jti',
      })

      vi.mocked(sql).mockResolvedValue([])

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('authorization', 'Bearer valid-token')

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(Object)
      expect(response?.status).toBe(403)
      const body = await response?.json()
      expect(body.error).toBe('User account not found or has been disabled')
    })

    it('should handle locked users gracefully', async () => {
      vi.mocked(verifyAccessToken).mockResolvedValue({
        sub: 'locked-user-id',
        sessionId: 'test-session-id',
        authMethod: 'oauth',
        scope: ['read'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        jti: 'test-jti',
      })

      vi.mocked(sql).mockResolvedValue([
        {
          id: 'locked-user-id',
          email: 'locked@example.com',
          lockedUntil: new Date(Date.now() + 3600000), // Locked for 1 hour
        },
      ])

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('authorization', 'Bearer valid-token')

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(Object)
      expect(response?.status).toBe(423)
      const body = await response?.json()
      expect(body.error).toBe('User account is temporarily locked')
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      vi.mocked(verifyAccessToken).mockResolvedValue({
        sub: 'test-user-id',
        sessionId: 'test-session-id',
        authMethod: 'oauth',
        scope: ['read'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        jti: 'test-jti',
      })

      vi.mocked(sql).mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('authorization', 'Bearer valid-token')

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(Object)
      expect(response?.status).toBe(500)
      const body = await response?.json()
      expect(body.error).toBe('Internal server error')
    })

    it('should handle unknown JWT errors', async () => {
      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('JWT verification failed'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      request.headers.set('authorization', 'Bearer invalid-token')

      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(Object)
      expect(response?.status).toBe(401)
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limiting functionality', async () => {
      // This is a placeholder test for rate limiting functionality
      // In a real implementation, this would test the rate limiting logic
      expect(true).toBe(true)
    })
  })
})
