import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { getServerSession, requireAuth, withAuth } from '@/lib/auth/helpers'

// Mock NextAuth
vi.mock('@/lib/auth', () => ({
  auth: {
    auth: vi.fn(),
  },
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('NextAuth Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getServerSession', () => {
    it('should return session when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
          name: 'Test User',
          image: null,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      vi.mocked(auth.auth).mockResolvedValue(mockSession)

      const session = await getServerSession()

      expect(session).toEqual(mockSession)
      expect(auth.auth).toHaveBeenCalled()
    })

    it('should return null when not authenticated', async () => {
      vi.mocked(auth.auth).mockResolvedValue(null)

      const session = await getServerSession()

      expect(session).toBeNull()
      expect(auth.auth).toHaveBeenCalled()
    })

    it('should handle auth errors gracefully', async () => {
      vi.mocked(auth.auth).mockRejectedValue(new Error('Auth error'))

      const session = await getServerSession()

      expect(session).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('should return session when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
          name: 'Test User',
          image: null,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      vi.mocked(auth.auth).mockResolvedValue(mockSession)

      const session = await requireAuth()

      expect(session).toEqual(mockSession)
      expect(redirect).not.toHaveBeenCalled()
    })

    it('should redirect to signin when not authenticated', async () => {
      vi.mocked(auth.auth).mockResolvedValue(null)

      await requireAuth()

      expect(redirect).toHaveBeenCalledWith('/auth/signin')
    })

    it('should redirect with custom return URL', async () => {
      vi.mocked(auth.auth).mockResolvedValue(null)

      await requireAuth('/dashboard')

      expect(redirect).toHaveBeenCalledWith('/auth/signin?callbackUrl=%2Fdashboard')
    })

    it('should handle auth errors and redirect', async () => {
      vi.mocked(auth.auth).mockRejectedValue(new Error('Auth error'))

      await requireAuth()

      expect(redirect).toHaveBeenCalledWith('/auth/signin')
    })
  })

  describe('withAuth', () => {
    it('should call handler with session when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
          name: 'Test User',
          image: null,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      vi.mocked(auth.auth).mockResolvedValue(mockSession)

      const handler = vi.fn().mockResolvedValue(NextResponse.json({ message: 'Success' }))

      const wrappedHandler = withAuth(handler)
      const mockRequest = new Request('http://localhost:3000/api/test')
      const context = { params: {} }

      const response = await wrappedHandler(mockRequest, context)

      expect(handler).toHaveBeenCalledWith(mockRequest, context, mockSession)
      expect(response).toBeInstanceOf(NextResponse)
      const data = await response.json()
      expect(data).toEqual({ message: 'Success' })
    })

    it('should return 401 when not authenticated', async () => {
      vi.mocked(auth.auth).mockResolvedValue(null)

      const handler = vi.fn()
      const wrappedHandler = withAuth(handler)
      const mockRequest = new Request('http://localhost:3000/api/test')
      const context = { params: {} }

      const response = await wrappedHandler(mockRequest, context)

      expect(handler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toEqual({ error: 'Authentication required' })
    })

    it('should handle handler errors', async () => {
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
          name: 'Test User',
          image: null,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      vi.mocked(auth.auth).mockResolvedValue(mockSession)

      const handler = vi.fn().mockRejectedValue(new Error('Handler error'))
      const wrappedHandler = withAuth(handler)
      const mockRequest = new Request('http://localhost:3000/api/test')
      const context = { params: {} }

      await expect(wrappedHandler(mockRequest, context)).rejects.toThrow('Handler error')
    })

    it('should handle auth errors and return 401', async () => {
      vi.mocked(auth.auth).mockRejectedValue(new Error('Auth error'))

      const handler = vi.fn()
      const wrappedHandler = withAuth(handler)
      const mockRequest = new Request('http://localhost:3000/api/test')
      const context = { params: {} }

      const response = await wrappedHandler(mockRequest, context)

      expect(handler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toEqual({ error: 'Authentication required' })
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing user data in session', async () => {
      const mockSession = {
        expires: new Date(Date.now() + 86400000).toISOString(),
      }

      vi.mocked(auth.auth).mockResolvedValue(mockSession as any)

      const session = await getServerSession()

      expect(session).toEqual(mockSession)
    })

    it('should handle expired sessions', async () => {
      const mockSession = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          githubUsername: 'testuser',
          name: 'Test User',
          image: null,
        },
        expires: new Date(Date.now() - 86400000).toISOString(), // Expired
      }

      vi.mocked(auth.auth).mockResolvedValue(mockSession)

      const session = await getServerSession()

      // NextAuth should handle expired sessions internally
      // We just return what NextAuth gives us
      expect(session).toEqual(mockSession)
    })
  })
})
