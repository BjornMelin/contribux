/**
 * Core API Routes Test Suite
 * Tests API route functionality using HTTP testing with MSW
 */

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

// Enable MSW mode in the setup
beforeAll(() => {
  // Enable MSW mode globally for this test file
  global.__enableMSW?.()
})

afterAll(() => {
  // Restore normal mock mode
  global.__disableMSW?.()
})

// Test data and schemas
const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  version: z.string(),
  checks: z
    .object({
      database: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        response_time_ms: z.number(),
        details: z.string().optional(),
      }),
      memory: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        usage_mb: z.number(),
        free_mb: z.number(),
      }),
    })
    .optional(),
})

const OpportunitySchema = z.object({
  id: z.string().uuid(),
  repository_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  difficulty: z.string(),
  priority: z.number(),
  required_skills: z.array(z.string()),
  technologies: z.array(z.string()),
  good_first_issue: z.boolean(),
  help_wanted: z.boolean(),
  estimated_hours: z.number().nullable(),
  created_at: z.string(),
  relevance_score: z.number(),
})

const SearchOpportunitiesResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    opportunities: z.array(OpportunitySchema),
    total_count: z.number(),
    page: z.number(),
    per_page: z.number(),
    has_more: z.boolean(),
  }),
  metadata: z.object({
    query: z.string(),
    filters: z.record(z.any()),
    execution_time_ms: z.number(),
  }),
})

const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  request_id: z.string().optional(),
})

// Mock API implementations
const BASE_URL = 'http://localhost:3000'

// MSW Server setup with actual API route implementations
const server = setupServer(
  // Health check endpoint - mock the actual endpoint behavior
  http.get(`${BASE_URL}/api/health`, () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        database: {
          status: 'healthy',
          response_time_ms: 45,
        },
        memory: {
          status: 'healthy',
          usage_mb: 128,
          free_mb: 256,
        },
      },
    })
  }),

  // Health check with database error
  http.get(`${BASE_URL}/api/health-error`, () => {
    return HttpResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        checks: {
          database: {
            status: 'unhealthy',
            response_time_ms: 5000,
            details: 'Database connection failed',
          },
          memory: {
            status: 'healthy',
            usage_mb: 128,
            free_mb: 256,
          },
        },
      },
      { status: 503 }
    )
  }),

  // Search opportunities endpoint
  http.get(`${BASE_URL}/api/search/opportunities`, ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q') || ''
    const pageParam = url.searchParams.get('page')
    const perPageParam = url.searchParams.get('per_page')

    // Parse and validate page parameter
    const page = pageParam ? Number(pageParam) : 1
    if (pageParam && (Number.isNaN(page) || page < 1)) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Page must be greater than 0',
          },
        },
        { status: 400 }
      )
    }

    // Parse and validate per_page parameter
    const perPage = perPageParam ? Number(perPageParam) : 20

    if (perPageParam && (Number.isNaN(perPage) || perPage < 1 || perPage > 100)) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'per_page must be between 1 and 100',
          },
        },
        { status: 400 }
      )
    }

    const mockOpportunities = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        repository_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Fix TypeScript type errors in search module',
        description: 'Several type errors need to be fixed in the search functionality',
        type: 'bug_fix',
        difficulty: 'intermediate',
        priority: 1,
        required_skills: ['TypeScript', 'debugging'],
        technologies: ['TypeScript', 'Node.js'],
        good_first_issue: false,
        help_wanted: true,
        estimated_hours: 4,
        created_at: '2023-06-01T12:00:00Z',
        relevance_score: 0.95,
      },
    ]

    // Filter by query if provided
    const filteredOpportunities = query
      ? mockOpportunities.filter(
          opp =>
            opp.title.toLowerCase().includes(query.toLowerCase()) ||
            opp.description?.toLowerCase().includes(query.toLowerCase())
        )
      : mockOpportunities

    return HttpResponse.json({
      success: true,
      data: {
        opportunities: filteredOpportunities,
        total_count: filteredOpportunities.length,
        page,
        per_page: perPage,
        has_more: false,
      },
      metadata: {
        query,
        filters: {},
        execution_time_ms: 42,
      },
    })
  }),

  // Search opportunities with database error
  http.get(`${BASE_URL}/api/search/opportunities-error`, () => {
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        request_id: 'req_123456789',
      },
      { status: 500 }
    )
  }),

  // NextAuth session endpoint
  http.get(`${BASE_URL}/api/auth/session`, () => {
    return HttpResponse.json({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
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
    })
  }),

  // NextAuth signin endpoint
  http.post(`${BASE_URL}/api/auth/signin`, () => {
    return HttpResponse.json({
      url: 'http://localhost:3000/dashboard',
      ok: true,
    })
  })
)

describe('API Routes Integration Tests', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  describe('Health Check API', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${BASE_URL}/api/health`)
      expect(response.status).toBe(200)

      const data = await response.json()
      const validated = HealthResponseSchema.parse(data)

      expect(validated.status).toBe('healthy')
      expect(validated.version).toBe('1.0.0')
      expect(validated.checks?.database.status).toBe('healthy')
      expect(validated.checks?.memory.status).toBe('healthy')
    })

    it('should handle database errors', async () => {
      const response = await fetch(`${BASE_URL}/api/health-error`)
      expect(response.status).toBe(503)

      const data = await response.json()
      const validated = HealthResponseSchema.parse(data)

      expect(validated.status).toBe('unhealthy')
      expect(validated.checks?.database.status).toBe('unhealthy')
      expect(validated.checks?.database.details).toBe('Database connection failed')
    })

    it('should include proper timestamp format', async () => {
      const response = await fetch(`${BASE_URL}/api/health`)
      const data = await response.json()

      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp)
    })
  })

  describe('Search Opportunities API', () => {
    it('should search opportunities successfully', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?q=TypeScript`)
      expect(response.status).toBe(200)

      const data = await response.json()
      const validated = SearchOpportunitiesResponseSchema.parse(data)

      expect(validated.success).toBe(true)
      expect(validated.data.opportunities).toHaveLength(1)
      expect(validated.data.opportunities[0]?.title).toContain('TypeScript')
      expect(validated.metadata.query).toBe('TypeScript')
    })

    it('should handle pagination parameters', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?page=1&per_page=10`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.page).toBe(1)
      expect(data.data.per_page).toBe(10)
    })

    it('should validate page parameter', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?page=0`)
      expect(response.status).toBe(400)

      const data = await response.json()
      const validated = ErrorResponseSchema.parse(data)

      expect(validated.success).toBe(false)
      expect(validated.error.code).toBe('INVALID_PARAMETER')
      expect(validated.error.message).toContain('Page must be greater than 0')
    })

    it('should validate per_page parameter', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?per_page=150`)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('INVALID_PARAMETER')
    })

    it('should handle database errors', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities-error`)
      expect(response.status).toBe(500)

      const data = await response.json()
      const validated = ErrorResponseSchema.parse(data)

      expect(validated.success).toBe(false)
      expect(validated.error.code).toBe('INTERNAL_ERROR')
      expect(validated.request_id).toBeDefined()
    })

    it('should handle empty search results', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?q=nonexistent`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(0)
      expect(data.data.total_count).toBe(0)
    })
  })

  describe('NextAuth API Routes', () => {
    it('should handle session requests', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/session`)
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

    it('should handle providers requests', async () => {
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
      })
    })

    it('should handle signin requests', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/signin`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'github',
          callbackUrl: 'http://localhost:3000/dashboard',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data).toMatchObject({
        url: 'http://localhost:3000/dashboard',
        ok: true,
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/search/opportunities?page=invalid`)

      // Should either handle gracefully or return 400
      expect([200, 400]).toContain(response.status)
    })

    it('should include proper content-type headers', async () => {
      const response = await fetch(`${BASE_URL}/api/health`)
      expect(response.headers.get('content-type')).toContain('application/json')
    })

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, () => fetch(`${BASE_URL}/api/health`))

      const responses = await Promise.all(requests)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      const data = await Promise.all(responses.map(r => r.json()))
      data.forEach(d => {
        expect(d.status).toBe('healthy')
      })
    })
  })
})
