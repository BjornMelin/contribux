/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testApiHandler } from 'next-test-api-route-handler'
import * as authHandlers from '@/app/api/auth/[...nextauth]/route'
import * as sessionHandler from '@/app/api/auth/session/route'
import * as refreshHandler from '@/app/api/auth/refresh/route'
import * as logoutHandler from '@/app/api/auth/logout/route'
import { prisma } from '@/lib/db'
import jwt from 'jsonwebtoken'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    account: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    verificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn()
    }
  }
}))

describe('Authentication API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXTAUTH_SECRET = 'test-secret'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.GITHUB_CLIENT_ID = 'test-github-client'
    process.env.GITHUB_CLIENT_SECRET = 'test-github-secret'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('POST /api/auth/signin', () => {
    it('should handle credential signin', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password'
      }
      
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser)
      
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'password123'
            })
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.user).toMatchObject({
            id: mockUser.id,
            email: mockUser.email
          })
          expect(data.accessToken).toBeDefined()
        }
      })
    })

    it('should reject invalid credentials', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)
      
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'wrong@example.com',
              password: 'wrongpass'
            })
          })
          
          expect(response.status).toBe(401)
          const data = await response.json()
          expect(data.error).toBe('Invalid credentials')
        }
      })
    })

    it('should handle OAuth signin initiation', async () => {
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              provider: 'github'
            })
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.url).toContain('github.com/login/oauth/authorize')
          expect(data.url).toContain('client_id=test-github-client')
        }
      })
    })

    it('should enforce rate limiting on signin attempts', async () => {
      const requests = Array(6).fill(null).map(() => 
        fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'wrong' })
        })
      )
      
      const responses = await Promise.all(requests)
      const statuses = responses.map(r => r.status)
      
      expect(statuses.filter(s => s === 429).length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/auth/session', () => {
    it('should return active session', async () => {
      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        expires: new Date(Date.now() + 3600000),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        }
      }
      
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(mockSession)
      
      await testApiHandler({
        handler: sessionHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET',
            headers: {
              Cookie: 'session-token=valid-token'
            }
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.user).toMatchObject({
            id: mockSession.user.id,
            email: mockSession.user.email
          })
          expect(data.expires).toBeDefined()
        }
      })
    })

    it('should handle expired session', async () => {
      const expiredSession = {
        id: 'session-123',
        expires: new Date(Date.now() - 1000)
      }
      
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(expiredSession)
      
      await testApiHandler({
        handler: sessionHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET',
            headers: {
              Cookie: 'session-token=expired-token'
            }
          })
          
          expect(response.status).toBe(401)
          const data = await response.json()
          expect(data.error).toBe('Session expired')
        }
      })
    })

    it('should handle missing session', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null)
      
      await testApiHandler({
        handler: sessionHandler.GET,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(401)
          const data = await response.json()
          expect(data.error).toBe('Not authenticated')
        }
      })
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('should refresh valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      }
      
      const validRefreshToken = jwt.sign(
        { sub: mockUser.id, type: 'refresh' },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: '7d' }
      )
      
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser)
      
      await testApiHandler({
        handler: refreshHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              refreshToken: validRefreshToken
            })
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.accessToken).toBeDefined()
          expect(data.refreshToken).toBeDefined()
          expect(data.expiresIn).toBe(3600)
        }
      })
    })

    it('should reject invalid refresh token', async () => {
      await testApiHandler({
        handler: refreshHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              refreshToken: 'invalid-token'
            })
          })
          
          expect(response.status).toBe(401)
          const data = await response.json()
          expect(data.error).toBe('Invalid refresh token')
        }
      })
    })

    it('should reject expired refresh token', async () => {
      const expiredToken = jwt.sign(
        { sub: 'user-123', type: 'refresh' },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: '-1s' }
      )
      
      await testApiHandler({
        handler: refreshHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              refreshToken: expiredToken
            })
          })
          
          expect(response.status).toBe(401)
          const data = await response.json()
          expect(data.error).toBe('Refresh token expired')
        }
      })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should clear session on logout', async () => {
      const mockSession = {
        id: 'session-123',
        userId: 'user-123'
      }
      
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(mockSession)
      vi.mocked(prisma.session.delete).mockResolvedValueOnce(mockSession)
      
      await testApiHandler({
        handler: logoutHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              Cookie: 'session-token=valid-token'
            }
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.success).toBe(true)
          
          // Verify session was deleted
          expect(prisma.session.delete).toHaveBeenCalledWith({
            where: { id: 'session-123' }
          })
          
          // Check cookie clearing
          const setCookie = response.headers.get('set-cookie')
          expect(setCookie).toContain('session-token=; Max-Age=0')
        }
      })
    })

    it('should handle logout without session', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null)
      
      await testApiHandler({
        handler: logoutHandler.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST'
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.success).toBe(true)
        }
      })
    })
  })

  describe('OAuth Callback Handling', () => {
    it('should handle GitHub OAuth callback', async () => {
      const mockGitHubUser = {
        id: 123456,
        email: 'github@example.com',
        name: 'GitHub User',
        avatar_url: 'https://github.com/avatar.jpg'
      }
      
      // Mock GitHub token exchange
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'github-access-token',
            token_type: 'bearer'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGitHubUser
        })
      
      await testApiHandler({
        handler: authHandlers.GET,
        url: '/api/auth/callback/github?code=auth-code&state=valid-state',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET',
            headers: {
              Cookie: 'oauth-state=valid-state'
            }
          })
          
          expect(response.status).toBe(302)
          expect(response.headers.get('location')).toBe('/dashboard')
          
          // Verify user creation/update
          expect(prisma.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              email: mockGitHubUser.email,
              name: mockGitHubUser.name
            })
          })
        }
      })
    })

    it('should handle OAuth errors', async () => {
      await testApiHandler({
        handler: authHandlers.GET,
        url: '/api/auth/callback/github?error=access_denied',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET'
          })
          
          expect(response.status).toBe(302)
          expect(response.headers.get('location')).toBe('/auth/error?error=access_denied')
        }
      })
    })
  })

  describe('Email Verification', () => {
    it('should send verification email', async () => {
      const mockToken = {
        token: 'verify-token-123',
        expires: new Date(Date.now() + 3600000)
      }
      
      vi.mocked(prisma.verificationToken.create).mockResolvedValueOnce(mockToken)
      
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'sendVerificationEmail',
              email: 'newuser@example.com'
            })
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.sent).toBe(true)
          
          // Verify token creation
          expect(prisma.verificationToken.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              identifier: 'newuser@example.com'
            })
          })
        }
      })
    })

    it('should verify email token', async () => {
      const mockToken = {
        token: 'verify-token-123',
        identifier: 'test@example.com',
        expires: new Date(Date.now() + 3600000)
      }
      
      vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(mockToken)
      
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'verifyEmail',
              token: 'verify-token-123'
            })
          })
          
          expect(response.status).toBe(200)
          const data = await response.json()
          expect(data.verified).toBe(true)
          
          // Verify token deletion after use
          expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
            where: { token: 'verify-token-123' }
          })
        }
      })
    })
  })

  describe('Account Security', () => {
    it('should detect suspicious login attempts', async () => {
      const suspiciousHeaders = {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
        'user-agent': 'curl/7.64.1'
      }
      
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              ...suspiciousHeaders,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'password123'
            })
          })
          
          expect(response.status).toBe(403)
          const data = await response.json()
          expect(data.error).toContain('Suspicious activity detected')
        }
      })
    })

    it('should enforce password complexity', async () => {
      await testApiHandler({
        handler: authHandlers.POST,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'register',
              email: 'newuser@example.com',
              password: '123' // Too weak
            })
          })
          
          expect(response.status).toBe(400)
          const data = await response.json()
          expect(data.error).toContain('Password does not meet requirements')
        }
      })
    })
  })
})