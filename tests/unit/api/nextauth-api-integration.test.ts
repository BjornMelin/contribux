/**
 * NextAuth API Routes Integration Test
 * Tests NextAuth API endpoints using MSW with proper authentication flow simulation
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

// Enable MSW mode
beforeAll(() => {
  global.__enableMSW?.()
})

afterAll(() => {
  global.__disableMSW?.()
})

const BASE_URL = 'http://localhost:3000'

// NextAuth API route handlers mock
const server = setupServer(
  // NextAuth session endpoint
  http.get(`${BASE_URL}/api/auth/session`, ({ request }) => {
    const _url = new URL(request.url)
    const cookies = request.headers.get('cookie') || ''

    // Simulate authenticated session
    if (cookies.includes('next-auth.session-token')) {
      return HttpResponse.json({
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          image: 'https://avatars.githubusercontent.com/u/123456',
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
    }

    // No session
    return HttpResponse.json({})
  }),

  // NextAuth providers endpoint
  http.get(`${BASE_URL}/api/auth/providers`, () => {
    return HttpResponse.json({
      github: {
        id: 'github',
        name: 'GitHub',
        type: 'oauth',
        signinUrl: 'http://localhost:3000/api/auth/signin/github',
        callbackUrl: 'http://localhost:3000/api/auth/callback/github',
      },
      google: {
        id: 'google',
        name: 'Google',
        type: 'oauth',
        signinUrl: 'http://localhost:3000/api/auth/signin/google',
        callbackUrl: 'http://localhost:3000/api/auth/callback/google',
      },
    })
  }),

  // NextAuth signin page
  http.get(`${BASE_URL}/api/auth/signin`, () => {
    return HttpResponse.html(`
      <html>
        <body>
          <h1>Sign In</h1>
          <form action="/api/auth/signin/github" method="post">
            <button type="submit">Sign in with GitHub</button>
          </form>
          <form action="/api/auth/signin/google" method="post">
            <button type="submit">Sign in with Google</button>
          </form>
        </body>
      </html>
    `)
  }),

  // NextAuth signin POST (initiate OAuth flow)
  http.post(`${BASE_URL}/api/auth/signin/:provider`, ({ params }) => {
    const { provider } = params

    if (provider === 'github') {
      return HttpResponse.redirect(
        'https://github.com/login/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/api/auth/callback/github'
      )
    }

    if (provider === 'google') {
      return HttpResponse.redirect(
        'https://accounts.google.com/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/api/auth/callback/google'
      )
    }

    return HttpResponse.json({ error: 'Provider not supported' }, { status: 400 })
  }),

  // NextAuth callback handler
  http.get(`${BASE_URL}/api/auth/callback/:provider`, ({ request }) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')

    if (!code) {
      return HttpResponse.redirect('http://localhost:3000/auth/error?error=missing_code')
    }

    // Simulate successful OAuth callback with proper headers
    return new Response(null, {
      status: 302,
      headers: {
        Location: 'http://localhost:3000/dashboard',
        'Set-Cookie': 'next-auth.session-token=test-session-token; Path=/; HttpOnly; SameSite=Lax',
      },
    })
  }),

  // NextAuth signout
  http.post(`${BASE_URL}/api/auth/signout`, () => {
    return new Response(JSON.stringify({ url: 'http://localhost:3000' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'next-auth.session-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      },
    })
  }),

  // NextAuth CSRF token
  http.get(`${BASE_URL}/api/auth/csrf`, () => {
    return HttpResponse.json({
      csrfToken: 'test-csrf-token-123',
    })
  })
)

describe('NextAuth API Routes Integration Tests', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  describe('Session Management', () => {
    it('should return empty session when not authenticated', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/session`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toEqual({})
    })

    it('should return user session when authenticated', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/session`, {
        headers: {
          cookie: 'next-auth.session-token=test-session-token',
        },
      })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toMatchObject({
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          image: expect.any(String),
        },
        expires: expect.any(String),
      })

      // Validate expires is a valid ISO date in the future
      const expiresDate = new Date(data.expires)
      expect(expiresDate.getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('Provider Configuration', () => {
    it('should return available authentication providers', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/providers`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toMatchObject({
        github: {
          id: 'github',
          name: 'GitHub',
          type: 'oauth',
          signinUrl: expect.stringContaining('/api/auth/signin/github'),
          callbackUrl: expect.stringContaining('/api/auth/callback/github'),
        },
        google: {
          id: 'google',
          name: 'Google',
          type: 'oauth',
          signinUrl: expect.stringContaining('/api/auth/signin/google'),
          callbackUrl: expect.stringContaining('/api/auth/callback/google'),
        },
      })
    })
  })

  describe('Authentication Flow', () => {
    it('should serve signin page', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')

      const html = await response.text()
      expect(html).toContain('Sign In')
      expect(html).toContain('Sign in with GitHub')
      expect(html).toContain('Sign in with Google')
    })

    it('should initiate GitHub OAuth flow', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin/github`, {
        method: 'POST',
        redirect: 'manual', // Don't follow redirects
      })

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBe(
        'https://github.com/login/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/api/auth/callback/github'
      )
    })

    it('should initiate Google OAuth flow', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin/google`, {
        method: 'POST',
        redirect: 'manual',
      })

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBe(
        'https://accounts.google.com/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/api/auth/callback/google'
      )
    })

    it('should handle unknown provider', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin/unknown`, {
        method: 'POST',
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Provider not supported')
    })
  })

  describe('OAuth Callbacks', () => {
    it('should handle successful GitHub callback', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/callback/github?code=test-auth-code`, {
        redirect: 'manual',
      })

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
      expect(response.headers.get('set-cookie')).toContain('next-auth.session-token')
    })

    it('should handle successful Google callback', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/callback/google?code=test-auth-code`, {
        redirect: 'manual',
      })

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
      expect(response.headers.get('set-cookie')).toContain('next-auth.session-token')
    })

    it('should handle callback without authorization code', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/callback/github`, {
        redirect: 'manual',
      })

      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toContain('/auth/error?error=missing_code')
    })
  })

  describe('Sign Out', () => {
    it('should handle signout request', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signout`, {
        method: 'POST',
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.url).toBe('http://localhost:3000')

      // Should clear session cookie
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    })
  })

  describe('CSRF Protection', () => {
    it('should provide CSRF token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/csrf`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toMatchObject({
        csrfToken: expect.any(String),
      })
      expect(data.csrfToken).toHaveLength(19) // Expected length for test token
    })
  })

  describe('Error Handling', () => {
    it('should handle concurrent authentication requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${BASE_URL}/api/auth/session`, {
          headers: {
            cookie: 'next-auth.session-token=test-session-token',
          },
        })
      )

      const responses = await Promise.all(requests)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      const data = await Promise.all(responses.map(r => r.json()))
      data.forEach(session => {
        expect(session.user?.id).toBe('test-user-id')
      })
    })

    it('should include proper content-type headers', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/session`)
      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })
})
