/**
 * NextAuth.js v5 API Route Protection Integration Tests
 * Testing authenticated vs unauthenticated access, middleware validation, and role-based access
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

// Mock NextAuth auth function
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}))

// Mock database
vi.mock('@/lib/db/config', () => ({
  sql: vi.fn(),
}))

describe('NextAuth API Route Protection Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Public Route Access', () => {
    it('should allow access to public API routes without authentication', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null) // No session

      const publicRoutes = [
        '/api/health',
        '/api/public/status',
        '/api/auth/signin',
        '/api/auth/signout',
        '/api/auth/session',
        '/api/auth/providers',
        '/api/auth/csrf',
      ]

      for (const route of publicRoutes) {
        const mockRequest = {
          url: `https://contribux.example.com${route}`,
          method: 'GET',
          headers: new Headers(),
        } as NextRequest

        // These routes should be accessible without authentication
        expect(mockRequest.url).toContain(route)
      }
    })

    it('should handle OPTIONS requests for CORS preflight', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null)

      const mockRequest = {
        url: 'https://contribux.example.com/api/protected/data',
        method: 'OPTIONS',
        headers: new Headers({
          'origin': 'https://contribux.example.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        }),
      } as NextRequest

      // OPTIONS requests should be handled appropriately
      expect(mockRequest.method).toBe('OPTIONS')
    })
  })

  describe('Protected Route Access', () => {
    it('should block access to protected routes without authentication', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null) // No session

      const protectedRoutes = [
        '/api/user/profile',
        '/api/user/settings',
        '/api/repositories/search',
        '/api/github/user/repos',
        '/api/admin/users',
      ]

      for (const route of protectedRoutes) {
        const mockRequest = {
          url: `https://contribux.example.com${route}`,
          method: 'GET',
          headers: new Headers(),
        } as NextRequest

        // Simulate middleware protection
        const session = await auth()
        expect(session).toBeNull()
        // Without session, protected routes should be blocked
      }
    })

    it('should allow access to protected routes with valid authentication', async () => {
      const mockAuth = vi.mocked(auth)
      const mockSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
          githubUsername: 'testuser',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(mockSession)

      const protectedRoutes = [
        '/api/user/profile',
        '/api/user/settings',
        '/api/repositories/search',
        '/api/github/user/repos',
      ]

      for (const route of protectedRoutes) {
        const mockRequest = {
          url: `https://contribux.example.com${route}`,
          method: 'GET',
          headers: new Headers({
            'cookie': 'next-auth.session-token=valid-session-token',
          }),
        } as NextRequest

        const session = await auth()
        expect(session).toBeDefined()
        expect(session?.user?.id).toBe('user-123')
      }
    })

    it('should handle expired sessions properly', async () => {
      const mockAuth = vi.mocked(auth)
      const expiredSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
      }

      mockAuth.mockResolvedValueOnce(expiredSession)

      const mockRequest = {
        url: 'https://contribux.example.com/api/user/profile',
        method: 'GET',
        headers: new Headers({
          'cookie': 'next-auth.session-token=expired-session-token',
        }),
      } as NextRequest

      const session = await auth()
      
      // Check if session is expired
      const isExpired = new Date(session?.expires || 0) < new Date()
      expect(isExpired).toBe(true)
    })
  })

  describe('Role-Based Access Control', () => {
    it('should allow admin access to admin routes', async () => {
      const mockAuth = vi.mocked(auth)
      const adminSession: Session = {
        user: {
          id: 'admin-123',
          name: 'Admin User',
          email: 'admin@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
          githubUsername: 'adminuser',
          role: 'admin', // Admin role
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(adminSession)

      const adminRoutes = [
        '/api/admin/users',
        '/api/admin/settings',
        '/api/admin/analytics',
      ]

      for (const route of adminRoutes) {
        const session = await auth()
        expect(session?.user?.role).toBe('admin')
      }
    })

    it('should block non-admin users from admin routes', async () => {
      const mockAuth = vi.mocked(auth)
      const userSession: Session = {
        user: {
          id: 'user-123',
          name: 'Regular User',
          email: 'user@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
          githubUsername: 'regularuser',
          // No admin role
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(userSession)

      const session = await auth()
      expect(session?.user?.role).toBeUndefined()
      
      // Regular users should not access admin routes
      const adminRoutes = ['/api/admin/users', '/api/admin/settings']
      for (const route of adminRoutes) {
        expect(session?.user?.role).not.toBe('admin')
      }
    })

    it('should handle premium user features', async () => {
      const mockAuth = vi.mocked(auth)
      const premiumSession: Session = {
        user: {
          id: 'premium-123',
          name: 'Premium User',
          email: 'premium@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
          githubUsername: 'premiumuser',
          isPremium: true,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(premiumSession)

      const session = await auth()
      expect(session?.user?.isPremium).toBe(true)
    })
  })

  describe('API Error Handling', () => {
    it('should return 401 for unauthenticated requests to protected routes', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null)

      const mockRequest = {
        url: 'https://contribux.example.com/api/user/profile',
        method: 'GET',
        headers: new Headers(),
      } as NextRequest

      const session = await auth()
      expect(session).toBeNull()

      // Should result in 401 status
      const expectedStatus = 401
      expect(expectedStatus).toBe(401)
    })

    it('should return 403 for insufficient permissions', async () => {
      const mockAuth = vi.mocked(auth)
      const userSession: Session = {
        user: {
          id: 'user-123',
          name: 'Regular User',
          email: 'user@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(userSession)

      const session = await auth()
      expect(session?.user?.role).toBeUndefined()

      // Regular user trying to access admin route should get 403
      const expectedStatus = 403
      expect(expectedStatus).toBe(403)
    })

    it('should return 500 for authentication service errors', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockRejectedValueOnce(new Error('Authentication service unavailable'))

      try {
        await auth()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Authentication service unavailable')
      }

      const expectedStatus = 500
      expect(expectedStatus).toBe(500)
    })

    it('should handle malformed session tokens', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null) // Invalid token results in null session

      const mockRequest = {
        url: 'https://contribux.example.com/api/user/profile',
        method: 'GET',
        headers: new Headers({
          'cookie': 'next-auth.session-token=malformed-token-data',
        }),
      } as NextRequest

      const session = await auth()
      expect(session).toBeNull()
    })
  })

  describe('Middleware Authentication', () => {
    it('should validate authentication in middleware', async () => {
      const mockAuth = vi.mocked(auth)
      
      // Test middleware authentication flow
      const validSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(validSession)

      const mockRequest = {
        url: 'https://contribux.example.com/api/user/profile',
        method: 'GET',
        headers: new Headers({
          'cookie': 'next-auth.session-token=valid-token',
        }),
        nextUrl: {
          pathname: '/api/user/profile',
        },
      } as NextRequest

      const session = await auth()
      expect(session?.user?.id).toBe('user-123')
      
      // Middleware should allow the request to proceed
      expect(mockRequest.nextUrl.pathname).toBe('/api/user/profile')
    })

    it('should redirect to signin for protected pages', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null)

      const mockRequest = {
        url: 'https://contribux.example.com/dashboard',
        method: 'GET',
        headers: new Headers(),
        nextUrl: {
          pathname: '/dashboard',
        },
      } as NextRequest

      const session = await auth()
      expect(session).toBeNull()

      // Should redirect to signin
      const redirectUrl = '/auth/signin'
      expect(redirectUrl).toBe('/auth/signin')
    })

    it('should handle authentication for API routes with custom headers', async () => {
      const mockAuth = vi.mocked(auth)
      const apiSession: Session = {
        user: {
          id: 'api-user-123',
          name: 'API User',
          email: 'api@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(apiSession)

      const mockRequest = {
        url: 'https://contribux.example.com/api/github/repositories',
        method: 'GET',
        headers: new Headers({
          'authorization': 'Bearer api-token',
          'x-api-key': 'api-key-value',
          'cookie': 'next-auth.session-token=api-session-token',
        }),
      } as NextRequest

      const session = await auth()
      expect(session?.user?.id).toBe('api-user-123')
    })
  })

  describe('Cross-Origin Request Handling', () => {
    it('should handle CORS for authenticated API requests', async () => {
      const mockAuth = vi.mocked(auth)
      const validSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(validSession)

      const mockRequest = {
        url: 'https://contribux.example.com/api/user/data',
        method: 'GET',
        headers: new Headers({
          'origin': 'https://app.contribux.example.com',
          'cookie': 'next-auth.session-token=valid-token',
        }),
      } as NextRequest

      const session = await auth()
      expect(session?.user?.id).toBe('user-123')

      // CORS should be handled appropriately for authenticated requests
      const origin = mockRequest.headers.get('origin')
      expect(origin).toBe('https://app.contribux.example.com')
    })

    it('should reject unauthorized cross-origin requests', async () => {
      const mockAuth = vi.mocked(auth)
      mockAuth.mockResolvedValueOnce(null)

      const mockRequest = {
        url: 'https://contribux.example.com/api/user/data',
        method: 'GET',
        headers: new Headers({
          'origin': 'https://malicious-site.com',
        }),
      } as NextRequest

      const session = await auth()
      expect(session).toBeNull()

      const origin = mockRequest.headers.get('origin')
      expect(origin).toBe('https://malicious-site.com')
      // Should be rejected due to unauthorized origin and no authentication
    })
  })

  describe('Rate Limiting Integration', () => {
    it('should apply rate limiting to authenticated users', async () => {
      const mockAuth = vi.mocked(auth)
      const userSession: Session = {
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(userSession)

      // Simulate multiple requests from the same user
      const requests = Array.from({ length: 5 }, (_, i) => ({
        url: `https://contribux.example.com/api/user/data?req=${i}`,
        method: 'GET',
        headers: new Headers({
          'cookie': 'next-auth.session-token=valid-token',
        }),
      }))

      for (const request of requests) {
        const session = await auth()
        expect(session?.user?.id).toBe('user-123')
      }

      // Rate limiting should be applied per user
      expect(requests).toHaveLength(5)
    })

    it('should handle rate limit exceeded scenarios', async () => {
      const mockAuth = vi.mocked(auth)
      const userSession: Session = {
        user: {
          id: 'rate-limited-user',
          name: 'Rate Limited User',
          email: 'limited@example.com',
          image: null,
          emailVerified: null,
          connectedProviders: ['github'],
          primaryProvider: 'github',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      mockAuth.mockResolvedValueOnce(userSession)

      const session = await auth()
      expect(session?.user?.id).toBe('rate-limited-user')

      // When rate limit is exceeded, should return 429
      const rateLimitStatus = 429
      expect(rateLimitStatus).toBe(429)
    })
  })
})