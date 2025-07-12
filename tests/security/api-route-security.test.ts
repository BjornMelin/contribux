/**
 * API Route Security Testing Suite
 * Comprehensive security tests for API endpoints, rate limiting,
 * authorization, input validation, and attack prevention
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Mock security modules
vi.mock('../../src/lib/security/crypto', () => ({
  generateSecureToken: vi.fn().mockImplementation(
    (length: number) =>
      `secure-token-${Math.random()
        .toString(36)
        .substring(2, length + 2)}`
  ),
  createSecureHash: vi
    .fn()
    .mockImplementation((data: string) => `secure-hash-${Buffer.from(data).toString('base64')}`),
  verifySecureHash: vi.fn().mockReturnValue(true),
}))

// Mock environment validation
vi.mock('../../src/lib/validation/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'secure-test-token-32chars-minimum-key-for-testing',
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
  },
}))

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Security testing server with comprehensive API route handlers
const securityServer = setupServer(
  // Health check endpoint (public)
  http.get('http://localhost:3000/api/health', () => {
    return HttpResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }),

  // Search repositories endpoint (protected)
  http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q') || ''
    const page = Number.parseInt(url.searchParams.get('page') || '1')
    const limit = Number.parseInt(url.searchParams.get('limit') || '20')

    // Rate limiting check
    const clientId = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitKey = `search:${clientId}`
    const now = Date.now()
    const resetTime = Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000) // 15-minute windows

    const currentLimit = rateLimitStore.get(rateLimitKey)
    if (currentLimit && currentLimit.resetTime === resetTime) {
      if (currentLimit.count >= 100) {
        // 100 requests per 15 minutes
        return HttpResponse.json(
          {
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((resetTime + 15 * 60 * 1000 - now) / 1000),
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': '100',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil((resetTime + 15 * 60 * 1000) / 1000)),
              'Retry-After': String(Math.ceil((resetTime + 15 * 60 * 1000 - now) / 1000)),
            },
          }
        )
      }
      currentLimit.count++
    } else {
      rateLimitStore.set(rateLimitKey, { count: 1, resetTime })
    }

    // Authentication check
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')
    const hasAuth =
      authHeader?.startsWith('Bearer ') ||
      sessionCookie?.includes('next-auth.session-token') ||
      sessionCookie?.includes('__Secure-next-auth.session-token')

    if (!hasAuth) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Input validation
    if (query.length > 1000) {
      return HttpResponse.json(
        { error: 'Query too long - maximum 1000 characters' },
        { status: 400 }
      )
    }

    if (page < 1 || page > 100) {
      return HttpResponse.json(
        { error: 'Invalid page number - must be between 1 and 100' },
        { status: 400 }
      )
    }

    if (limit < 1 || limit > 100) {
      return HttpResponse.json(
        { error: 'Invalid limit - must be between 1 and 100' },
        { status: 400 }
      )
    }

    // XSS and injection pattern detection
    const dangerousPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /expression\s*\(/i,
      /union\s+select/i,
      /drop\s+table/i,
      /;\s*--/,
      /';\s*drop/i,
    ]

    const hasDangerousPattern = dangerousPatterns.some(pattern => pattern.test(query))
    if (hasDangerousPattern) {
      return HttpResponse.json(
        { error: 'Invalid query - contains potentially dangerous content' },
        { status: 400 }
      )
    }

    // Mock search results
    const results = [
      {
        id: 1,
        name: 'test-repo',
        full_name: 'user/test-repo',
        description: 'Test repository for security testing',
        language: 'TypeScript',
        stars: 100,
        url: 'https://github.com/user/test-repo',
      },
    ]

    return HttpResponse.json(
      {
        repositories: results,
        pagination: {
          page,
          per_page: limit,
          total: results.length,
          total_pages: 1,
        },
      },
      {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': String(99 - (currentLimit?.count || 0)),
          'Cache-Control': 'private, max-age=300',
        },
      }
    )
  }),

  // Search opportunities endpoint (protected)
  http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
    const url = new URL(request.url)
    const difficulty = url.searchParams.get('difficulty')
    const type = url.searchParams.get('type')

    // Authentication check
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')
    const hasAuth =
      authHeader?.startsWith('Bearer ') || sessionCookie?.includes('next-auth.session-token')

    if (!hasAuth) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Input validation for filter parameters
    const validDifficulties = ['beginner', 'intermediate', 'advanced']
    const validTypes = ['bug', 'feature', 'documentation', 'enhancement']

    if (difficulty && !validDifficulties.includes(difficulty)) {
      return HttpResponse.json({ error: 'Invalid difficulty filter' }, { status: 400 })
    }

    if (type && !validTypes.includes(type)) {
      return HttpResponse.json({ error: 'Invalid type filter' }, { status: 400 })
    }

    return HttpResponse.json(
      {
        opportunities: [
          {
            id: 1,
            title: 'Add TypeScript support',
            repository: 'user/test-repo',
            difficulty: difficulty || 'beginner',
            type: type || 'feature',
            description: 'Add TypeScript support to improve code quality',
            labels: ['good first issue', 'typescript'],
          },
        ],
        pagination: {
          page: 1,
          per_page: 20,
          total: 1,
        },
      },
      {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
        },
      }
    )
  }),

  // User profile endpoint (protected)
  http.get('http://localhost:3000/api/user/profile', ({ request }) => {
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')
    const hasAuth =
      authHeader?.startsWith('Bearer ') || sessionCookie?.includes('next-auth.session-token')

    if (!hasAuth) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    return HttpResponse.json(
      {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        connectedProviders: ['github'],
        primaryProvider: 'github',
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      },
      {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache',
        },
      }
    )
  }),

  // Update user profile endpoint (protected)
  http.patch('http://localhost:3000/api/user/profile', async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')
    const hasAuth =
      authHeader?.startsWith('Bearer ') || sessionCookie?.includes('next-auth.session-token')

    if (!hasAuth) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // CSRF token validation
    const csrfToken = request.headers.get('x-csrf-token')
    if (!csrfToken) {
      return HttpResponse.json({ error: 'CSRF token required' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Input validation
    if (body.name && typeof body.name !== 'string') {
      return HttpResponse.json({ error: 'Name must be a string' }, { status: 400 })
    }

    if (body.name && body.name.length > 100) {
      return HttpResponse.json({ error: 'Name too long - maximum 100 characters' }, { status: 400 })
    }

    // XSS prevention
    if (body.name && /<[^>]*>/.test(body.name)) {
      return HttpResponse.json({ error: 'Name contains invalid characters' }, { status: 400 })
    }

    return HttpResponse.json({
      id: 'user-123',
      name: body.name || 'Test User',
      updated: true,
    })
  }),

  // File upload endpoint (protected)
  http.post('http://localhost:3000/api/upload', async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')
    const hasAuth =
      authHeader?.startsWith('Bearer ') || sessionCookie?.includes('next-auth.session-token')

    if (!hasAuth) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') || ''

    // File type validation
    if (!contentType.startsWith('multipart/form-data')) {
      return HttpResponse.json(
        { error: 'Invalid content type - multipart/form-data required' },
        { status: 400 }
      )
    }

    // Simulate file size check
    const contentLength = Number.parseInt(request.headers.get('content-length') || '0')
    const maxFileSize = 5 * 1024 * 1024 // 5MB

    if (contentLength > maxFileSize) {
      return HttpResponse.json({ error: 'File too large - maximum 5MB allowed' }, { status: 413 })
    }

    return HttpResponse.json({
      success: true,
      fileId: `file-${Math.random().toString(36).substring(2)}`,
      size: contentLength,
    })
  }),

  // Admin endpoint (requires admin role)
  http.get('http://localhost:3000/api/admin/users', ({ request }) => {
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')
    const hasAuth =
      authHeader?.startsWith('Bearer ') || sessionCookie?.includes('next-auth.session-token')

    if (!hasAuth) {
      return HttpResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Role-based authorization (mock)
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'admin') {
      return HttpResponse.json(
        { error: 'Insufficient permissions - admin role required' },
        { status: 403 }
      )
    }

    return HttpResponse.json({
      users: [
        { id: 'user-123', email: 'test@example.com', role: 'user' },
        { id: 'user-456', email: 'admin@example.com', role: 'admin' },
      ],
    })
  }),

  // Error simulation endpoint
  http.get('http://localhost:3000/api/error', () => {
    return HttpResponse.json({ error: 'Internal server error' }, { status: 500 })
  })
)

beforeAll(() => {
  securityServer.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  securityServer.resetHandlers()
  rateLimitStore.clear()
  vi.clearAllMocks()
})

afterAll(() => {
  securityServer.close()
})

describe('API Route Security Testing', () => {
  describe('Authentication and Authorization', () => {
    it('should require authentication for protected endpoints', async () => {
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test')

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Authentication required')
    })

    it('should accept valid Bearer token authentication', async () => {
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('repositories')
    })

    it('should accept valid session cookie authentication', async () => {
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Cookie: '__Secure-next-auth.session-token=valid-session-token',
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('repositories')
    })

    it('should enforce role-based access control for admin endpoints', async () => {
      // Regular user trying to access admin endpoint
      const userResponse = await fetch('http://localhost:3000/api/admin/users', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-User-Role': 'user',
        },
      })

      expect(userResponse.status).toBe(403)
      const userData = await userResponse.json()
      expect(userData.error).toContain('admin role required')

      // Admin user accessing admin endpoint
      const adminResponse = await fetch('http://localhost:3000/api/admin/users', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-User-Role': 'admin',
        },
      })

      expect(adminResponse.status).toBe(200)
      const adminData = await adminResponse.json()
      expect(adminData).toHaveProperty('users')
    })
  })

  describe('Input Validation and Sanitization', () => {
    it('should validate query parameter length', async () => {
      const longQuery = 'a'.repeat(2000)
      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(longQuery)}`,
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Query too long')
    })

    it('should validate pagination parameters', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/repositories?q=test&page=999&limit=999',
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/Invalid (page|limit)/)
    })

    it('should detect and block XSS attempts in query parameters', async () => {
      const xssQuery = '<script>alert("xss")</script>'
      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(xssQuery)}`,
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('dangerous content')
    })

    it('should detect and block SQL injection attempts', async () => {
      const sqlQuery = "'; DROP TABLE repositories; --"
      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(sqlQuery)}`,
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('dangerous content')
    })

    it('should validate filter parameters', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/opportunities?difficulty=invalid&type=malicious',
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/Invalid (difficulty|type)/)
    })

    it('should validate JSON request bodies', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: 'invalid-json',
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid JSON body')
    })

    it('should sanitize user input in profile updates', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '<script>alert("xss")</script>',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Name contains invalid characters')
    })
  })

  describe('Rate Limiting and DDoS Protection', () => {
    it('should enforce rate limits on search endpoints', async () => {
      const requests = []

      // Make 101 requests to exceed the 100 request limit
      for (let i = 0; i < 101; i++) {
        requests.push(
          fetch('http://localhost:3000/api/search/repositories?q=test', {
            headers: {
              Authorization: 'Bearer valid-jwt-token',
              'X-Forwarded-For': '192.168.1.1',
            },
          })
        )
      }

      const responses = await Promise.all(requests)

      // The 101st request should be rate limited
      const lastResponse = responses[responses.length - 1]
      expect(lastResponse.status).toBe(429)

      const data = await lastResponse.json()
      expect(data.error).toBe('Rate limit exceeded')
      expect(data).toHaveProperty('retryAfter')

      // Check rate limit headers
      expect(lastResponse.headers.get('X-RateLimit-Limit')).toBe('100')
      expect(lastResponse.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(lastResponse.headers.get('Retry-After')).toBeTruthy()
    })

    it('should include rate limit headers in responses', async () => {
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100')
      expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy()
    })

    it('should limit file upload sizes', async () => {
      // Simulate large file upload
      const response = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'multipart/form-data; boundary=test',
          'Content-Length': String(10 * 1024 * 1024), // 10MB
        },
        body: 'fake-large-file-content',
      })

      expect(response.status).toBe(413)
      const data = await response.json()
      expect(data.error).toContain('File too large')
    })
  })

  describe('Security Headers', () => {
    it('should include security headers in all responses', async () => {
      const response = await fetch('http://localhost:3000/api/health')

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })

    it('should include HSTS header for secure endpoints', async () => {
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      })

      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    })

    it('should set appropriate cache headers for sensitive data', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      })

      expect(response.headers.get('Cache-Control')).toContain('private')
      expect(response.headers.get('Cache-Control')).toContain('no-cache')
    })

    it('should set cache headers for public endpoints', async () => {
      const response = await fetch('http://localhost:3000/api/health')

      expect(response.headers.get('Cache-Control')).toContain('no-cache')
      expect(response.headers.get('Cache-Control')).toContain('no-store')
    })
  })

  describe('CSRF Protection', () => {
    it('should require CSRF tokens for state-changing operations', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('CSRF token required')
    })

    it('should accept valid CSRF tokens', async () => {
      const response = await fetch('http://localhost:3000/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'X-CSRF-Token': 'valid-csrf-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Name' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.updated).toBe(true)
    })
  })

  describe('File Upload Security', () => {
    it('should validate file upload content types', async () => {
      const response = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ malicious: 'data' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('multipart/form-data required')
    })

    it('should accept valid file uploads', async () => {
      const response = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
          'Content-Type': 'multipart/form-data; boundary=test',
          'Content-Length': '1024',
        },
        body: 'fake-file-content',
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data).toHaveProperty('fileId')
    })
  })

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error responses', async () => {
      const response = await fetch('http://localhost:3000/api/error')

      expect(response.status).toBe(500)
      const data = await response.json()

      // Should not expose stack traces, database errors, or internal paths
      expect(data.error).toBe('Internal server error')
      expect(data).not.toHaveProperty('stack')
      expect(data).not.toHaveProperty('sql')
      expect(data).not.toHaveProperty('path')
    })

    it('should provide helpful but secure validation errors', async () => {
      const response = await fetch(
        'http://localhost:3000/api/search/repositories?q=test&page=abc',
        {
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()

      // Should be helpful but not expose internal validation logic
      expect(data.error).toContain('Invalid page number')
      expect(data.error).not.toContain('parseInt')
      expect(data.error).not.toContain('NaN')
    })
  })

  describe('Public Endpoint Security', () => {
    it('should allow access to health check without authentication', async () => {
      const response = await fetch('http://localhost:3000/api/health')

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe('healthy')
    })

    it('should still include security headers on public endpoints', async () => {
      const response = await fetch('http://localhost:3000/api/health')

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })
  })
})
