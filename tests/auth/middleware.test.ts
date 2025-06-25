import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authMiddleware } from '../../src/lib/auth/middleware'
import { env } from '../../src/lib/validation/env'

// Mock next-auth/jwt
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}))

// Mock environment
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'test-secret',
    NODE_ENV: 'test',
  },
}))

describe('Simplified Auth Middleware', () => {
  let mockRequest: NextRequest

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock request
    mockRequest = new NextRequest(new URL('http://localhost:3000'))
    Object.defineProperty(mockRequest, 'ip', {
      value: '127.0.0.1',
      writable: true,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Public Routes', () => {
    it('should allow access to public routes without authentication', async () => {
      const publicRoutes = ['/', '/about', '/contact']

      for (const route of publicRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(getToken).not.toHaveBeenCalled()
      }
    })

    it('should allow access to public API routes without authentication', async () => {
      const publicApiRoutes = ['/api/auth/signin', '/api/auth/github/callback', '/api/health']

      for (const route of publicApiRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(getToken).not.toHaveBeenCalled()
      }
    })

    it('should allow access to auth routes without authentication', async () => {
      const authRoutes = ['/auth/signin', '/auth/error', '/auth/verify-request']

      for (const route of authRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(getToken).not.toHaveBeenCalled()
      }
    })
  })

  describe('Protected Routes', () => {
    it('should redirect to signin for unauthenticated requests to protected routes', async () => {
      vi.mocked(getToken).mockResolvedValue(null)

      const protectedRoutes = ['/dashboard', '/profile', '/settings', '/api/user/profile']

      for (const route of protectedRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeInstanceOf(NextResponse)
        expect(response?.status).toBe(302)
        expect(response?.headers.get('Location')).toBe('/auth/signin')
      }
    })

    it('should allow access to protected routes for authenticated users', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'test-user-id',
        email: 'test@example.com',
        githubUsername: 'testuser',
      })

      const protectedRoutes = ['/dashboard', '/profile', '/settings']

      for (const route of protectedRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(getToken).toHaveBeenCalledWith({
          req: request,
          secret: env.NEXTAUTH_SECRET,
        })
      }
    })

    it('should return 401 for unauthenticated API requests', async () => {
      vi.mocked(getToken).mockResolvedValue(null)

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
  })

  describe('Rate Limiting', () => {
    it('should apply rate limiting to all requests', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'test-user-id',
        email: 'test@example.com',
      })

      // Make multiple requests to trigger rate limit
      const requests = Array(101)
        .fill(null)
        .map(() => new NextRequest(new URL('http://localhost:3000/dashboard')))

      // First 100 requests should pass
      for (let i = 0; i < 100; i++) {
        const request = requests[i]
        if (request) {
          Object.defineProperty(request, 'ip', { value: '127.0.0.1' })
          const response = await authMiddleware(request)
          expect(response).toBeUndefined()
        }
      }

      // 101st request should be rate limited
      const lastRequest = requests[100]
      if (lastRequest) {
        Object.defineProperty(lastRequest, 'ip', { value: '127.0.0.1' })
        const response = await authMiddleware(lastRequest)
        expect(response).toBeInstanceOf(NextResponse)
        expect(response?.status).toBe(429)
      }
    })

    it('should use IP address for rate limit identification', async () => {
      const request1 = new NextRequest(new URL('http://localhost:3000/dashboard'))
      Object.defineProperty(request1, 'ip', { value: '192.168.1.1' })

      const request2 = new NextRequest(new URL('http://localhost:3000/dashboard'))
      Object.defineProperty(request2, 'ip', { value: '192.168.1.2' })

      vi.mocked(getToken).mockResolvedValue({ sub: 'test-user' })

      // Different IPs should have separate rate limits
      const response1 = await authMiddleware(request1)
      const response2 = await authMiddleware(request2)

      expect(response1).toBeUndefined()
      expect(response2).toBeUndefined()
    })

    it('should use x-forwarded-for header when IP is not available', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      Object.defineProperty(request, 'ip', { value: null })
      request.headers.set('x-forwarded-for', '10.0.0.1')

      vi.mocked(getToken).mockResolvedValue({ sub: 'test-user' })

      const response = await authMiddleware(request)
      expect(response).toBeUndefined()
    })
  })

  describe('Special Routes', () => {
    it('should handle Next.js internal routes', async () => {
      const internalRoutes = [
        '/_next/static/chunk.js',
        '/_next/image?url=/logo.png',
        '/favicon.ico',
      ]

      for (const route of internalRoutes) {
        const request = new NextRequest(new URL(`http://localhost:3000${route}`))
        const response = await authMiddleware(request)

        expect(response).toBeUndefined()
        expect(getToken).not.toHaveBeenCalled()
      }
    })

    it('should handle API routes correctly', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'test-user-id',
        email: 'test@example.com',
      })

      const request = new NextRequest(new URL('http://localhost:3000/api/protected'))
      const response = await authMiddleware(request)

      expect(response).toBeUndefined()
      expect(getToken).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle token validation errors gracefully', async () => {
      vi.mocked(getToken).mockRejectedValue(new Error('Invalid token'))

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(302)
      expect(response?.headers.get('Location')).toBe('/auth/signin')
    })

    it('should handle missing environment variables', async () => {
      const originalEnv = env.NEXTAUTH_SECRET
      env.NEXTAUTH_SECRET = undefined

      const request = new NextRequest(new URL('http://localhost:3000/dashboard'))
      const response = await authMiddleware(request)

      expect(response).toBeInstanceOf(NextResponse)

      // Restore env
      env.NEXTAUTH_SECRET = originalEnv
    })
  })
})
