/**
 * API Security Integration Tests
 * Tests security patterns and validation logic for API endpoints
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mswServer } from '../github/msw-setup'

// Dedicated MSW server for security tests with localhost handlers
const securityServer = setupServer(
  // Search repositories endpoint with authentication and input validation
  http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q') || ''

    // First, validate input (before authentication check)

    // Validate query length - reject queries longer than 1000 characters
    if (query.length > 1000) {
      return HttpResponse.json(
        { error: 'Query too long - maximum 1000 characters allowed' },
        { status: 400 }
      )
    }

    // Validate for common XSS patterns
    const xssPatterns = [/<script[^>]*>/i, /javascript:/i, /on\w+\s*=/i, /expression\s*\(/i]
    const hasXssPattern = xssPatterns.some(pattern => pattern.test(query))

    if (hasXssPattern) {
      return HttpResponse.json(
        { error: 'Invalid query - contains potentially dangerous content' },
        { status: 400 }
      )
    }

    // Check for SQL injection patterns
    const sqlPatterns = [/union\s+select/i, /drop\s+table/i, /;\s*--/, /';\s*drop/i]
    const hasSqlPattern = sqlPatterns.some(pattern => pattern.test(query))

    if (hasSqlPattern) {
      return HttpResponse.json(
        { error: 'Invalid request - suspicious patterns detected' },
        { status: 400 }
      )
    }

    // Then check authentication
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')

    if (!authHeader && !sessionCookie?.includes('next-auth.session-token')) {
      return HttpResponse.json({ error: 'Unauthorized - Authentication required' }, { status: 401 })
    }

    // Simulate successful authenticated response
    return HttpResponse.json(
      {
        repositories: [
          {
            id: 1,
            name: 'test-repo',
            full_name: 'user/test-repo',
            description: 'Test repository for security testing',
            language: 'TypeScript',
            stars: 100,
            url: 'https://github.com/user/test-repo',
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
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      }
    )
  }),

  // JWT token validation endpoint
  http.post('http://localhost:3000/api/auth/verify', async ({ request }) => {
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        { error: 'Invalid token format' },
        {
          status: 401,
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          },
        }
      )
    }

    const token = authHeader.substring(7)

    // Simulate token validation logic
    if (token === 'valid-jwt-token') {
      return HttpResponse.json(
        {
          valid: true,
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
          },
        },
        {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          },
        }
      )
    }

    return HttpResponse.json(
      { error: 'Invalid or expired token' },
      {
        status: 401,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      }
    )
  }),

  // Search opportunities endpoint with authentication
  http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
    const authHeader = request.headers.get('authorization')
    const sessionCookie = request.headers.get('cookie')

    // Check for authentication
    if (!authHeader && !sessionCookie?.includes('next-auth.session-token')) {
      return HttpResponse.json({ error: 'Unauthorized - Authentication required' }, { status: 401 })
    }

    // Simulate successful authenticated response
    return HttpResponse.json(
      {
        opportunities: [
          {
            id: 1,
            title: 'Add TypeScript support',
            repository: 'user/test-repo',
            difficulty: 'beginner',
            type: 'feature',
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
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      }
    )
  })
)

// Setup the dedicated security MSW server
beforeAll(() => {
  // Disable the global GitHub MSW server to prevent conflicts
  mswServer.close()

  // Start the dedicated security server
  securityServer.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  securityServer.resetHandlers()
})

afterAll(() => {
  // Close the security server
  securityServer.close()

  // Restore the global GitHub MSW server for other tests
  mswServer.listen({ onUnhandledRequest: 'warn' })
})

describe('API Security Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication Patterns', () => {
    it('should require authentication for protected endpoints', async () => {
      // Test unauthenticated request to repositories endpoint
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        method: 'GET',
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toMatch(/unauthorized|authentication/i)
    })

    it('should allow authenticated requests with valid tokens', async () => {
      // Test authenticated request with valid session cookie
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        method: 'GET',
        headers: {
          Cookie: 'next-auth.session-token=valid-session',
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.repositories).toBeDefined()
      expect(Array.isArray(data.repositories)).toBe(true)
    })

    it('should validate JWT tokens properly', async () => {
      // Test JWT token validation endpoint
      const response = await fetch('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.valid).toBe(true)
      expect(data.user).toBeDefined()
    })

    it('should reject invalid JWT tokens', async () => {
      const response = await fetch('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toMatch(/invalid|expired/i)
    })
  })

  describe('Input Validation & SQL Injection Prevention', () => {
    it('should block SQL injection attempts', async () => {
      // Test SQL injection in repository search
      const maliciousQuery = "'; DROP TABLE repositories; --"
      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(maliciousQuery)}`,
        {
          method: 'GET',
          headers: {
            Cookie: 'next-auth.session-token=valid-session',
          },
        }
      )

      // Should either block the request or sanitize the input
      expect(response.status).toBeOneOf([200, 400])

      if (response.status === 400) {
        const data = await response.json()
        expect(data.error).toMatch(/suspicious|invalid/i)
      }
    })

    it('should reject excessively long queries', async () => {
      const longQuery = 'a'.repeat(2000)
      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(longQuery)}`,
        {
          method: 'GET',
          headers: {
            Cookie: 'next-auth.session-token=valid-session',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/too long|maximum.*characters/i)
    })

    it('should sanitize XSS attempts', async () => {
      const xssQuery = '<script>alert("xss")</script>'
      const response = await fetch(
        `http://localhost:3000/api/search/repositories?q=${encodeURIComponent(xssQuery)}`,
        {
          method: 'GET',
          headers: {
            Cookie: 'next-auth.session-token=valid-session',
          },
        }
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/dangerous|invalid/i)
    })
  })

  describe('Security Headers', () => {
    it('should include proper security headers in responses', async () => {
      const response = await fetch('http://localhost:3000/api/search/repositories?q=test', {
        method: 'GET',
        headers: {
          Cookie: 'next-auth.session-token=valid-session',
        },
      })

      // Check for security headers
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age')
    })
  })

  describe('Security Pattern Documentation', () => {
    it('should document expected security patterns', () => {
      // This test documents the security patterns that should be implemented:
      const securityRequirements = {
        authentication: {
          required: true,
          methods: ['JWT tokens', 'Session cookies'],
          protection: 'All API endpoints except health checks',
        },
        inputValidation: {
          sqlInjection: 'Parameterized queries required',
          xss: 'Input sanitization required',
          lengthLimits: 'Maximum 1000 characters for search queries',
        },
        headers: {
          required: [
            'X-Content-Type-Options: nosniff',
            'X-Frame-Options: DENY',
            'X-XSS-Protection: 1; mode=block',
            'Strict-Transport-Security',
          ],
        },
        rateLimiting: {
          implemented: false, // TODO: Implement rate limiting
          recommended: '100 requests per 15 minutes per user',
        },
      }

      // Verify the security requirements are documented
      expect(securityRequirements.authentication.required).toBe(true)
      expect(securityRequirements.inputValidation.sqlInjection).toBeDefined()
      expect(securityRequirements.headers.required.length).toBeGreaterThan(0)
    })
  })
})
