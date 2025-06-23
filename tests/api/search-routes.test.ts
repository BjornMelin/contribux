/**
 * API Routes Test Suite - Search Endpoints
 * Tests for search API endpoints with MSW mocking
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Mock Next.js environment
vi.mock('next/headers', () => ({
  headers: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue('application/json'),
  }),
}))

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn().mockImplementation((data, init) => ({
      json: () => Promise.resolve(data),
      status: init?.status || 200,
      headers: new Headers(init?.headers),
    })),
  },
}))

// Mock database client
const mockQuery = vi.fn()
vi.mock('@vercel/postgres', () => ({
  sql: mockQuery,
}))

// API Response Schemas
const SearchOpportunitiesResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    opportunities: z.array(
      z.object({
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
    ),
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

const SearchRepositoriesResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    repositories: z.array(
      z.object({
        id: z.string().uuid(),
        github_id: z.number(),
        full_name: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        language: z.string().nullable(),
        topics: z.array(z.string()),
        stars_count: z.number(),
        health_score: z.number(),
        activity_score: z.number(),
        first_time_contributor_friendly: z.boolean(),
        created_at: z.string(),
        relevance_score: z.number(),
      })
    ),
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
class MockSearchAPI {
  async searchOpportunities(params: {
    query?: string
    page?: number
    per_page?: number
    difficulty?: string
    type?: string
    languages?: string[]
    min_score?: number
  }) {
    const opportunities = [
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
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        repository_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Add AI-powered search capabilities',
        description: 'Implement vector search using embeddings for better search results',
        type: 'feature',
        difficulty: 'advanced',
        priority: 2,
        required_skills: ['AI/ML', 'PostgreSQL', 'vector-search'],
        technologies: ['Python', 'PostgreSQL'],
        good_first_issue: false,
        help_wanted: false,
        estimated_hours: 16,
        created_at: '2023-06-01T10:00:00Z',
        relevance_score: 0.87,
      },
    ]

    // Apply filters
    let filtered = opportunities

    if (params.query) {
      filtered = filtered.filter(
        opp =>
          opp.title.toLowerCase().includes(params.query!.toLowerCase()) ||
          opp.description?.toLowerCase().includes(params.query!.toLowerCase())
      )
    }

    if (params.difficulty) {
      filtered = filtered.filter(opp => opp.difficulty === params.difficulty)
    }

    if (params.type) {
      filtered = filtered.filter(opp => opp.type === params.type)
    }

    if (params.languages && params.languages.length > 0) {
      filtered = filtered.filter(opp =>
        params.languages?.some(lang =>
          opp.technologies.some(tech => tech.toLowerCase().includes(lang.toLowerCase()))
        )
      )
    }

    if (params.min_score) {
      filtered = filtered.filter(opp => opp.relevance_score >= params.min_score!)
    }

    // Pagination
    const page = params.page || 1
    const perPage = params.per_page || 20
    const startIndex = (page - 1) * perPage
    const endIndex = startIndex + perPage
    const paginatedOpportunities = filtered.slice(startIndex, endIndex)

    return {
      success: true,
      data: {
        opportunities: paginatedOpportunities,
        total_count: filtered.length,
        page,
        per_page: perPage,
        has_more: endIndex < filtered.length,
      },
      metadata: {
        query: params.query || '',
        filters: {
          difficulty: params.difficulty,
          type: params.type,
          languages: params.languages,
          min_score: params.min_score,
        },
        execution_time_ms: Math.floor(Math.random() * 100) + 10,
      },
    }
  }

  async searchRepositories(params: {
    query?: string
    page?: number
    per_page?: number
    language?: string
    min_stars?: number
    min_health_score?: number
  }) {
    const repositories = [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        github_id: 12345,
        full_name: 'test-org/search-engine',
        name: 'search-engine',
        description: 'A powerful search engine with AI capabilities',
        language: 'TypeScript',
        topics: ['search', 'ai', 'typescript'],
        stars_count: 1250,
        health_score: 88.5,
        activity_score: 92.0,
        first_time_contributor_friendly: true,
        created_at: '2023-01-01T00:00:00Z',
        relevance_score: 0.92,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        github_id: 67890,
        full_name: 'ai-research/vector-db',
        name: 'vector-db',
        description: 'High-performance vector database for ML applications',
        language: 'Python',
        topics: ['database', 'ml', 'vectors'],
        stars_count: 2100,
        health_score: 95.2,
        activity_score: 89.5,
        first_time_contributor_friendly: false,
        created_at: '2022-08-15T00:00:00Z',
        relevance_score: 0.78,
      },
    ]

    // Apply filters
    let filtered = repositories

    if (params.query) {
      filtered = filtered.filter(
        repo =>
          repo.name.toLowerCase().includes(params.query!.toLowerCase()) ||
          repo.description?.toLowerCase().includes(params.query!.toLowerCase()) ||
          repo.topics.some(topic => topic.toLowerCase().includes(params.query!.toLowerCase()))
      )
    }

    if (params.language) {
      filtered = filtered.filter(
        repo => repo.language?.toLowerCase() === params.language?.toLowerCase()
      )
    }

    if (params.min_stars) {
      filtered = filtered.filter(repo => repo.stars_count >= params.min_stars!)
    }

    if (params.min_health_score) {
      filtered = filtered.filter(repo => repo.health_score >= params.min_health_score!)
    }

    // Pagination
    const page = params.page || 1
    const perPage = params.per_page || 20
    const startIndex = (page - 1) * perPage
    const endIndex = startIndex + perPage
    const paginatedRepositories = filtered.slice(startIndex, endIndex)

    return {
      success: true,
      data: {
        repositories: paginatedRepositories,
        total_count: filtered.length,
        page,
        per_page: perPage,
        has_more: endIndex < filtered.length,
      },
      metadata: {
        query: params.query || '',
        filters: {
          language: params.language,
          min_stars: params.min_stars,
          min_health_score: params.min_health_score,
        },
        execution_time_ms: Math.floor(Math.random() * 150) + 20,
      },
    }
  }
}

// MSW Server setup
const mockAPI = new MockSearchAPI()
const server = setupServer(
  // Search opportunities endpoint
  http.get('/api/search/opportunities', async ({ request }) => {
    const url = new URL(request.url)
    const params: {
      query?: string
      page?: number
      per_page?: number
      difficulty?: string
      type?: string
      languages?: string[]
      min_score?: number
    } = {}
    
    const query = url.searchParams.get('q')
    if (query) params.query = query
    
    const page = url.searchParams.get('page')
    if (page) params.page = Number(page)
    
    const perPage = url.searchParams.get('per_page')
    if (perPage) params.per_page = Number(perPage)
    
    const difficulty = url.searchParams.get('difficulty')
    if (difficulty) params.difficulty = difficulty
    
    const type = url.searchParams.get('type')
    if (type) params.type = type
    
    const languages = url.searchParams.get('languages')
    if (languages) params.languages = languages.split(',')
    
    const minScore = url.searchParams.get('min_score')
    if (minScore) params.min_score = Number(minScore)

    // Simulate validation errors
    if (params.page && params.page < 1) {
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

    if (params.per_page && (params.per_page < 1 || params.per_page > 100)) {
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

    const result = await mockAPI.searchOpportunities(params)
    return HttpResponse.json(result)
  }),

  // Search repositories endpoint
  http.get('/api/search/repositories', async ({ request }) => {
    const url = new URL(request.url)
    const params: {
      query?: string
      page?: number
      per_page?: number
      language?: string
      min_stars?: number
      min_health_score?: number
    } = {}
    
    const query = url.searchParams.get('q')
    if (query) params.query = query
    
    const page = url.searchParams.get('page')
    if (page) params.page = Number(page)
    
    const perPage = url.searchParams.get('per_page')
    if (perPage) params.per_page = Number(perPage)
    
    const language = url.searchParams.get('language')
    if (language) params.language = language
    
    const minStars = url.searchParams.get('min_stars')
    if (minStars) params.min_stars = Number(minStars)
    
    const minHealthScore = url.searchParams.get('min_health_score')
    if (minHealthScore) params.min_health_score = Number(minHealthScore)

    // Simulate rate limiting
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return HttpResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      )
    }

    const result = await mockAPI.searchRepositories(params)
    return HttpResponse.json(result)
  }),

  // Health check endpoint
  http.get('/api/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })
  }),

  // Error simulation endpoint
  http.get('/api/search/error', () => {
    return HttpResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed',
          details: { retryAfter: 30 },
        },
        request_id: 'req_123456789',
      },
      { status: 500 }
    )
  })
)

describe('Search API Routes', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
  })

  afterAll(() => {
    server.close()
  })

  describe('GET /api/search/opportunities', () => {
    it('should search opportunities successfully', async () => {
      const response = await fetch('/api/search/opportunities?q=TypeScript&page=1&per_page=10')
      const data = await response.json()

      expect(response.status).toBe(200)

      // Validate response schema
      const validated = SearchOpportunitiesResponseSchema.parse(data)
      expect(validated.success).toBe(true)
      expect(validated.data.opportunities).toHaveLength(1) // Filtered by TypeScript
      expect(validated.data.opportunities[0]!.title).toContain('TypeScript')
      expect(validated.metadata.query).toBe('TypeScript')
    })

    it('should handle pagination correctly', async () => {
      const response = await fetch('/api/search/opportunities?page=2&per_page=1')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.page).toBe(2)
      expect(data.data.per_page).toBe(1)
      expect(data.data.opportunities).toHaveLength(1)
      expect(data.data.has_more).toBe(false)
    })

    it('should filter by difficulty', async () => {
      const response = await fetch('/api/search/opportunities?difficulty=intermediate')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(1)
      expect(data.data.opportunities[0].difficulty).toBe('intermediate')
    })

    it('should filter by type', async () => {
      const response = await fetch('/api/search/opportunities?type=bug_fix')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(1)
      expect(data.data.opportunities[0].type).toBe('bug_fix')
    })

    it('should filter by languages', async () => {
      const response = await fetch('/api/search/opportunities?languages=TypeScript,Python')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(2)
    })

    it('should filter by minimum relevance score', async () => {
      const response = await fetch('/api/search/opportunities?min_score=0.9')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(1)
      expect(data.data.opportunities[0].relevance_score).toBeGreaterThanOrEqual(0.9)
    })

    it('should return empty results for no matches', async () => {
      const response = await fetch('/api/search/opportunities?q=nonexistent')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(0)
      expect(data.data.total_count).toBe(0)
    })

    it('should validate page parameter', async () => {
      const response = await fetch('/api/search/opportunities?page=0')
      const data = await response.json()

      expect(response.status).toBe(400)
      const validated = ErrorResponseSchema.parse(data)
      expect(validated.success).toBe(false)
      expect(validated.error.code).toBe('INVALID_PARAMETER')
      expect(validated.error.message).toContain('Page must be greater than 0')
    })

    it('should validate per_page parameter', async () => {
      const response = await fetch('/api/search/opportunities?per_page=150')
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('INVALID_PARAMETER')
      expect(data.error.message).toContain('per_page must be between 1 and 100')
    })

    it('should include execution metadata', async () => {
      const response = await fetch('/api/search/opportunities?q=test')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metadata).toBeDefined()
      expect(data.metadata!.execution_time_ms).toBeGreaterThan(0)
      expect(data.metadata!.query).toBe('test')
      expect(data.metadata!.filters).toBeDefined()
    })
  })

  describe('GET /api/search/repositories', () => {
    it('should require authentication', async () => {
      const response = await fetch('/api/search/repositories?q=search')
      const data = await response.json()

      expect(response.status).toBe(401)
      const validated = ErrorResponseSchema.parse(data)
      expect(validated.success).toBe(false)
      expect(validated.error.code).toBe('UNAUTHORIZED')
    })

    it('should search repositories with authentication', async () => {
      const response = await fetch('/api/search/repositories?q=search', {
        headers: {
          authorization: 'Bearer test-token',
        },
      })
      const data = await response.json()

      expect(response.status).toBe(200)

      // Validate response schema
      const validated = SearchRepositoriesResponseSchema.parse(data)
      expect(validated.success).toBe(true)
      expect(validated.data.repositories).toHaveLength(1)
      expect(validated.data.repositories[0]!.name).toContain('search')
    })

    it('should filter by language', async () => {
      const response = await fetch('/api/search/repositories?language=TypeScript', {
        headers: {
          authorization: 'Bearer test-token',
        },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.repositories).toHaveLength(1)
      expect(data.data.repositories[0].language).toBe('TypeScript')
    })

    it('should filter by minimum stars', async () => {
      const response = await fetch('/api/search/repositories?min_stars=2000', {
        headers: {
          authorization: 'Bearer test-token',
        },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.repositories).toHaveLength(1)
      expect(data.data.repositories[0].stars_count).toBeGreaterThanOrEqual(2000)
    })

    it('should filter by minimum health score', async () => {
      const response = await fetch('/api/search/repositories?min_health_score=90', {
        headers: {
          authorization: 'Bearer test-token',
        },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.repositories).toHaveLength(1)
      expect(data.data.repositories[0].health_score).toBeGreaterThanOrEqual(90)
    })

    it('should handle complex queries', async () => {
      const response = await fetch(
        '/api/search/repositories?q=database&language=Python&min_stars=1000&page=1&per_page=5',
        {
          headers: {
            authorization: 'Bearer test-token',
          },
        }
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.page).toBe(1)
      expect(data.data.per_page).toBe(5)
    })
  })

  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      const response = await fetch('/api/search/error')
      const data = await response.json()

      expect(response.status).toBe(500)
      const validated = ErrorResponseSchema.parse(data)
      expect(validated.success).toBe(false)
      expect(validated.error.code).toBe('INTERNAL_ERROR')
      expect(validated.error.details).toBeDefined()
      expect(validated.request_id).toBeDefined()
    })

    it('should include proper error context', async () => {
      const response = await fetch('/api/search/opportunities?page=-1')
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error.code).toBe('INVALID_PARAMETER')
      expect(data.error.message).toBeDefined()
    })
  })

  describe('Performance and Reliability', () => {
    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, () => fetch('/api/search/opportunities?q=test'))

      const responses = await Promise.all(requests)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      const data = await Promise.all(responses.map(r => r.json()))
      data.forEach(d => {
        expect(d.success).toBe(true)
        expect(d.metadata.execution_time_ms).toBeGreaterThan(0)
      })
    })

    it('should include performance metrics', async () => {
      const response = await fetch('/api/search/opportunities?q=TypeScript')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metadata!.execution_time_ms).toBeGreaterThan(0)
      expect(data.metadata!.execution_time_ms).toBeLessThan(1000) // Should be fast
    })

    it('should handle malformed query parameters gracefully', async () => {
      const response = await fetch('/api/search/opportunities?page=invalid&per_page=abc')

      // Should either handle gracefully or return 400
      expect([200, 400]).toContain(response.status)

      const data = await response.json()
      if (response.status === 400) {
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      }
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await fetch('/api/health')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.timestamp).toBeDefined()
      expect(data.version).toBeDefined()
    })
  })
})
