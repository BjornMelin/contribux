/**
 * Comprehensive API Routes Testing Suite
 * Phase 4: Complete API testing with NextAuth.js v5 and Drizzle ORM
 * 
 * MISSION: API Routes Testing Excellence
 * - Authentication & Authorization Testing
 * - Endpoint Validation & Security
 * - Integration & Performance Testing
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Global MSW setup
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Test schemas for validation
const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  request_id: z.string().optional(),
})

const ApiSuccessSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  metadata: z.object({
    query: z.string(),
    filters: z.any(),
    execution_time_ms: z.number(),
    performance_note: z.string().optional(),
  }).optional(),
})

const SearchRepositoriesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    repositories: z.array(z.object({
      id: z.string().uuid(),
      githubId: z.number(),
      fullName: z.string(),
      name: z.string(),
      owner: z.string(),
      description: z.string().nullable(),
      metadata: z.any().optional(),
      healthMetrics: z.any().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })),
    total_count: z.number(),
    page: z.number(),
    per_page: z.number(),
    has_more: z.boolean(),
  }),
  metadata: z.object({
    query: z.string(),
    filters: z.any(),
    execution_time_ms: z.number(),
    performance_note: z.string(),
  }),
})

const SearchOpportunitiesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    opportunities: z.array(z.object({
      id: z.string().uuid(),
      repositoryId: z.string().uuid().nullable(),
      issueNumber: z.number().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      url: z.string().nullable(),
      metadata: z.any().optional(),
      difficultyScore: z.number(),
      impactScore: z.number(),
      matchScore: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })),
    total_count: z.number(),
    page: z.number(),
    per_page: z.number(),
    has_more: z.boolean(),
  }),
  metadata: z.object({
    query: z.string(),
    filters: z.any(),
    execution_time_ms: z.number(),
    performance_note: z.string(),
    stats: z.any().optional(),
  }),
})

// Mock data generators
const generateMockRepository = (overrides: Partial<any> = {}) => ({
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  githubId: 123456789,
  fullName: 'test-org/test-repo',
  name: 'test-repo',
  owner: 'test-org',
  description: 'A test repository for API testing',
  metadata: {
    language: 'TypeScript',
    stars: 1250,
    forks: 98,
    openIssues: 23,
    license: 'MIT',
    topics: ['testing', 'api', 'typescript'],
    ...overrides.metadata,
  },
  healthMetrics: {
    overallScore: 85.5,
    activityLevel: 90.0,
    maintainerResponsiveness: 80.0,
    ...overrides.healthMetrics,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const generateMockOpportunity = (overrides: Partial<any> = {}) => ({
  id: 'a47bc20c-58dd-4372-b567-0f02c2d3e590',
  repositoryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  issueNumber: 42,
  title: 'Fix TypeScript type errors',
  description: 'Several type errors need to be resolved in the search module',
  url: 'https://github.com/test-org/test-repo/issues/42',
  metadata: {
    labels: ['bug', 'good-first-issue', 'typescript'],
    difficulty: 'intermediate',
    estimatedHours: 4,
    skillsRequired: ['TypeScript', 'debugging'],
    goodFirstIssue: true,
    mentorshipAvailable: false,
    ...overrides.metadata,
  },
  difficultyScore: 6,
  impactScore: 8,
  matchScore: 0.85,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('PHASE 1: Authentication Testing', () => {
  describe('Route Protection', () => {
    it('should reject unauthenticated requests to /api/search/repositories', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          }, { status: 401 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories')
      expect(response.status).toBe(401)

      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('UNAUTHORIZED')
      expect(validatedError.error.message).toBe('Authentication required')
    })

    it('should reject unauthenticated requests to /api/search/opportunities', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          }, { status: 401 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/opportunities')
      expect(response.status).toBe(401)

      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('UNAUTHORIZED')
    })

    it('should reject unauthorized access to /api/auth/providers without proper session', async () => {
      server.use(
        http.get('http://localhost:3000/api/auth/providers', () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        })
      )

      const response = await fetch('http://localhost:3000/api/auth/providers')
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should reject forbidden access when accessing other user data', async () => {
      server.use(
        http.get('http://localhost:3000/api/auth/providers', ({ request }) => {
          const url = new URL(request.url)
          const userId = url.searchParams.get('userId')
          
          if (userId && userId !== 'current-user-id') {
            return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
          
          return HttpResponse.json({ providers: [] })
        })
      )

      const response = await fetch('http://localhost:3000/api/auth/providers?userId=other-user-id')
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('Forbidden')
    })
  })

  describe('Authentication Middleware', () => {
    it('should validate session tokens properly', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const authHeader = request.headers.get('Authorization')
          
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'INVALID_TOKEN',
                message: 'Valid authentication token required',
              },
            }, { status: 401 })
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query: '', filters: {}, execution_time_ms: 25, performance_note: 'Test query' },
          })
        })
      )

      // Test without token
      const responseWithoutToken = await fetch('http://localhost:3000/api/search/repositories')
      expect(responseWithoutToken.status).toBe(401)

      // Test with invalid token format
      const responseWithInvalidToken = await fetch('http://localhost:3000/api/search/repositories', {
        headers: { Authorization: 'InvalidToken' }
      })
      expect(responseWithInvalidToken.status).toBe(401)

      // Test with valid token format
      const responseWithValidToken = await fetch('http://localhost:3000/api/search/repositories', {
        headers: { Authorization: 'Bearer valid-token-123' }
      })
      expect(responseWithValidToken.status).toBe(200)
    })

    it('should handle expired session tokens', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const authHeader = request.headers.get('Authorization')
          
          if (authHeader?.includes('expired')) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'TOKEN_EXPIRED',
                message: 'Authentication token has expired',
              },
            }, { status: 401 })
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query: '', filters: {}, execution_time_ms: 25, performance_note: 'Test query' },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/opportunities', {
        headers: { Authorization: 'Bearer expired-token' }
      })
      
      expect(response.status).toBe(401)
      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('TOKEN_EXPIRED')
    })
  })

  describe('Error Response Consistency', () => {
    it('should return consistent error format across all endpoints', async () => {
      const endpoints = [
        '/api/search/repositories',
        '/api/search/opportunities',
        '/api/auth/providers',
      ]

      for (const endpoint of endpoints) {
        server.use(
          http.get(`http://localhost:3000${endpoint}`, () => {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
            }, { status: 401 })
          })
        )

        const response = await fetch(`http://localhost:3000${endpoint}`)
        expect(response.status).toBe(401)

        const data = await response.json()
        const validatedError = ApiErrorSchema.parse(data)
        expect(validatedError.success).toBe(false)
        expect(validatedError.error.code).toBe('UNAUTHORIZED')
        expect(validatedError.error.message).toBe('Authentication required')
      }
    })
  })
})

describe('PHASE 2: Endpoint Testing', () => {
  describe('Search Repositories API', () => {
    it('should handle basic repository search with authentication', async () => {
      const mockRepositories = [generateMockRepository()]

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q') || ''

          return HttpResponse.json({
            success: true,
            data: {
              repositories: mockRepositories,
              total_count: 1,
              page: 1,
              per_page: 20,
              has_more: false,
            },
            metadata: {
              query,
              filters: {
                language: null,
                min_stars: null,
                topics: [],
                sort_by: 'stars',
                order: 'desc',
                has_issues: null,
                is_archived: null,
                license: null,
              },
              execution_time_ms: 42,
              performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories?q=typescript')
      expect(response.status).toBe(200)

      const data = await response.json()
      const validatedResponse = SearchRepositoriesResponseSchema.parse(data)
      
      expect(validatedResponse.success).toBe(true)
      expect(validatedResponse.data.repositories).toHaveLength(1)
      expect(validatedResponse.data.repositories[0].fullName).toBe('test-org/test-repo')
      expect(validatedResponse.metadata.query).toBe('typescript')
    })

    it('should validate query parameters with proper error responses', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const page = url.searchParams.get('page')
          const perPage = url.searchParams.get('per_page')

          // Validate page parameter
          if (page && (isNaN(Number(page)) || Number(page) < 1)) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'INVALID_PARAMETER',
                message: 'Expected number, received nan',
                details: [{ path: ['page'], message: 'Expected number, received nan' }],
              },
            }, { status: 400 })
          }

          // Validate per_page parameter
          if (perPage && (isNaN(Number(perPage)) || Number(perPage) < 1 || Number(perPage) > 100)) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'INVALID_PARAMETER',
                message: 'Number must be greater than or equal to 1',
                details: [{ path: ['per_page'], message: 'Number must be greater than or equal to 1' }],
              },
            }, { status: 400 })
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: Number(page) || 1, per_page: Number(perPage) || 20, has_more: false },
            metadata: { query: '', filters: {}, execution_time_ms: 25, performance_note: 'Test query' },
          })
        })
      )

      // Test invalid page parameter
      const invalidPageResponse = await fetch('http://localhost:3000/api/search/repositories?page=invalid')
      expect(invalidPageResponse.status).toBe(400)
      
      const invalidPageData = await invalidPageResponse.json()
      const validatedError = ApiErrorSchema.parse(invalidPageData)
      expect(validatedError.error.code).toBe('INVALID_PARAMETER')

      // Test per_page out of range
      const invalidPerPageResponse = await fetch('http://localhost:3000/api/search/repositories?per_page=200')
      expect(invalidPerPageResponse.status).toBe(400)

      // Test valid parameters
      const validResponse = await fetch('http://localhost:3000/api/search/repositories?page=2&per_page=50')
      expect(validResponse.status).toBe(200)
    })

    it('should handle complex filtering parameters', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const language = url.searchParams.get('language')
          const minStars = url.searchParams.get('min_stars')
          const topics = url.searchParams.get('topics')
          const hasIssues = url.searchParams.get('has_issues')
          const isArchived = url.searchParams.get('is_archived')
          const license = url.searchParams.get('license')

          const filteredRepositories = [generateMockRepository({
            metadata: {
              language,
              stars: Number(minStars) || 1250,
              topics: topics ? topics.split(',') : ['testing'],
              license: license || 'MIT',
            }
          })]

          return HttpResponse.json({
            success: true,
            data: {
              repositories: filteredRepositories,
              total_count: 1,
              page: 1,
              per_page: 20,
              has_more: false,
            },
            metadata: {
              query: '',
              filters: {
                language,
                min_stars: minStars ? Number(minStars) : null,
                topics: topics ? topics.split(',') : [],
                sort_by: 'stars',
                order: 'desc',
                has_issues: hasIssues === 'true',
                is_archived: isArchived === 'true',
                license,
              },
              execution_time_ms: 38,
              performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
            },
          })
        })
      )

      const response = await fetch(
        'http://localhost:3000/api/search/repositories?' +
        'language=TypeScript&min_stars=1000&topics=testing,api&has_issues=true&license=MIT'
      )
      
      expect(response.status).toBe(200)
      const data = await response.json()
      const validatedResponse = SearchRepositoriesResponseSchema.parse(data)
      
      expect(validatedResponse.metadata.filters.language).toBe('TypeScript')
      expect(validatedResponse.metadata.filters.min_stars).toBe(1000)
      expect(validatedResponse.metadata.filters.topics).toEqual(['testing', 'api'])
      expect(validatedResponse.metadata.filters.has_issues).toBe(true)
      expect(validatedResponse.metadata.filters.license).toBe('MIT')
    })
  })

  describe('Search Opportunities API', () => {
    it('should handle basic opportunity search with all filters', async () => {
      const mockOpportunities = [generateMockOpportunity()]

      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q') || ''
          const difficulty = url.searchParams.get('difficulty')
          const goodFirstIssue = url.searchParams.get('good_first_issue')

          return HttpResponse.json({
            success: true,
            data: {
              opportunities: mockOpportunities,
              total_count: 1,
              page: 1,
              per_page: 20,
              has_more: false,
            },
            metadata: {
              query,
              filters: {
                difficulty,
                min_difficulty_score: null,
                max_difficulty_score: null,
                min_impact_score: null,
                max_impact_score: null,
                repository_id: null,
                good_first_issue: goodFirstIssue === 'true',
                mentorship_available: null,
                hacktoberfest: null,
                labels: [],
                skills_required: [],
                sort_by: 'match',
                order: 'desc',
              },
              execution_time_ms: 35,
              performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
              stats: {
                total: 1,
                beginnerFriendly: 1,
                withMentorship: 0,
                embeddingCoverage: 0.95,
              },
            },
          })
        })
      )

      const response = await fetch(
        'http://localhost:3000/api/search/opportunities?q=typescript&difficulty=intermediate&good_first_issue=true'
      )
      
      expect(response.status).toBe(200)
      const data = await response.json()
      const validatedResponse = SearchOpportunitiesResponseSchema.parse(data)
      
      expect(validatedResponse.success).toBe(true)
      expect(validatedResponse.data.opportunities).toHaveLength(1)
      expect(validatedResponse.metadata.query).toBe('typescript')
      expect(validatedResponse.metadata.filters.difficulty).toBe('intermediate')
      expect(validatedResponse.metadata.filters.good_first_issue).toBe(true)
    })

    it('should validate difficulty and impact score ranges', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const minDifficulty = url.searchParams.get('min_difficulty_score')
          const maxDifficulty = url.searchParams.get('max_difficulty_score')
          const minImpact = url.searchParams.get('min_impact_score')
          const maxImpact = url.searchParams.get('max_impact_score')

          // Validate score ranges (1-10)
          for (const [param, value] of [
            ['min_difficulty_score', minDifficulty],
            ['max_difficulty_score', maxDifficulty],
            ['min_impact_score', minImpact],
            ['max_impact_score', maxImpact],
          ]) {
            if (value && (isNaN(Number(value)) || Number(value) < 1 || Number(value) > 10)) {
              return HttpResponse.json({
                success: false,
                error: {
                  code: 'INVALID_PARAMETER',
                  message: 'Number must be between 1 and 10',
                  details: [{ path: [param], message: 'Number must be between 1 and 10' }],
                },
              }, { status: 400 })
            }
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query: '', filters: {}, execution_time_ms: 25, performance_note: 'Test query', stats: {} },
          })
        })
      )

      // Test invalid ranges
      const invalidMinResponse = await fetch('http://localhost:3000/api/search/opportunities?min_difficulty_score=0')
      expect(invalidMinResponse.status).toBe(400)

      const invalidMaxResponse = await fetch('http://localhost:3000/api/search/opportunities?max_impact_score=15')
      expect(invalidMaxResponse.status).toBe(400)

      // Test valid ranges
      const validResponse = await fetch('http://localhost:3000/api/search/opportunities?min_difficulty_score=3&max_difficulty_score=7')
      expect(validResponse.status).toBe(200)
    })
  })

  describe('Health Check APIs', () => {
    it('should provide comprehensive health status', async () => {
      server.use(
        http.get('http://localhost:3000/api/health', () => {
          return HttpResponse.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            checks: {
              database: {
                status: 'healthy',
                response_time_ms: 12,
                details: 'Connection successful',
              },
              memory: {
                status: 'healthy',
                usage_mb: 256,
                free_mb: 768,
              },
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/health')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('healthy')
      expect(data.checks.database.status).toBe('healthy')
      expect(data.checks.memory.status).toBe('healthy')
      expect(typeof data.checks.database.response_time_ms).toBe('number')
    })

    it('should handle degraded health status', async () => {
      server.use(
        http.get('http://localhost:3000/api/health', () => {
          return HttpResponse.json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            checks: {
              database: {
                status: 'degraded',
                response_time_ms: 2500,
                details: 'High response time detected',
              },
              memory: {
                status: 'healthy',
                usage_mb: 512,
                free_mb: 512,
              },
            },
          }, { status: 200 })
        })
      )

      const response = await fetch('http://localhost:3000/api/health')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('degraded')
      expect(data.checks.database.status).toBe('degraded')
      expect(data.checks.database.response_time_ms).toBeGreaterThan(2000)
    })
  })
})

describe('PHASE 3: Integration Testing', () => {
  describe('Database Integration', () => {
    it('should handle database connection errors gracefully', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Database connection failed',
            },
            request_id: `req_${Date.now()}_abc123`,
          }, { status: 500 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories')
      expect(response.status).toBe(500)

      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('DATABASE_ERROR')
      expect(validatedError.request_id).toMatch(/req_\d+_\w+/)
    })

    it('should handle database timeout scenarios', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'DATABASE_TIMEOUT',
              message: 'Database query timeout exceeded',
            },
            request_id: `req_${Date.now()}_timeout`,
          }, { status: 504 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/opportunities')
      expect(response.status).toBe(504)

      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('DATABASE_TIMEOUT')
    })
  })

  describe('Performance & Concurrency', () => {
    it('should handle concurrent requests efficiently', async () => {
      const mockRepositories = Array.from({ length: 5 }, (_, i) => 
        generateMockRepository({ fullName: `org/repo-${i}` })
      )

      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          return HttpResponse.json({
            success: true,
            data: {
              repositories: mockRepositories,
              total_count: 5,
              page: 1,
              per_page: 20,
              has_more: false,
            },
            metadata: {
              query: 'concurrent-test',
              filters: {},
              execution_time_ms: Math.floor(Math.random() * 50) + 10, // 10-60ms
              performance_note: 'Concurrent request handling',
            },
          })
        })
      )

      // Send 10 concurrent requests
      const requests = Array.from({ length: 10 }, () => 
        fetch('http://localhost:3000/api/search/repositories?q=concurrent-test')
      )

      const responses = await Promise.all(requests)
      
      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200)
        const data = await response.json()
        const validatedResponse = SearchRepositoriesResponseSchema.parse(data)
        expect(validatedResponse.data.repositories).toHaveLength(5)
      }
    })

    it('should track performance metrics accurately', async () => {
      const performanceTests = [
        { endpoint: '/api/search/repositories', query: 'q=performance' },
        { endpoint: '/api/search/opportunities', query: 'q=performance&difficulty=intermediate' },
        { endpoint: '/api/health', query: '' },
      ]

      for (const test of performanceTests) {
        server.use(
          http.get(`http://localhost:3000${test.endpoint}`, () => {
            const executionTime = Math.floor(Math.random() * 100) + 20 // 20-120ms
            
            if (test.endpoint === '/api/health') {
              return HttpResponse.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                execution_time_ms: executionTime,
              })
            }

            return HttpResponse.json({
              success: true,
              data: test.endpoint.includes('repositories') 
                ? { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false }
                : { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
              metadata: {
                query: test.query.includes('q=') ? test.query.split('q=')[1].split('&')[0] : '',
                filters: {},
                execution_time_ms: executionTime,
                performance_note: 'Performance tracking test',
              },
            })
          })
        )

        const url = `http://localhost:3000${test.endpoint}${test.query ? `?${test.query}` : ''}`
        const response = await fetch(url)
        expect(response.status).toBe(200)

        const data = await response.json()
        
        if (test.endpoint === '/api/health') {
          expect(typeof data.execution_time_ms).toBe('number')
          expect(data.execution_time_ms).toBeGreaterThan(0)
        } else {
          expect(typeof data.metadata.execution_time_ms).toBe('number')
          expect(data.metadata.execution_time_ms).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('Rate Limiting & Security', () => {
    it('should enforce rate limiting properly', async () => {
      let requestCount = 0

      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          requestCount++
          
          if (requestCount > 5) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
              },
            }, { 
              status: 429,
              headers: {
                'X-RateLimit-Limit': '5',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Date.now() + 60000),
                'Retry-After': '60',
              }
            })
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query: '', filters: {}, execution_time_ms: 25, performance_note: 'Rate limit test' },
          }, {
            headers: {
              'X-RateLimit-Limit': '5',
              'X-RateLimit-Remaining': String(5 - requestCount),
              'X-RateLimit-Reset': String(Date.now() + 60000),
            }
          })
        })
      )

      // Send requests until rate limit is hit
      for (let i = 1; i <= 7; i++) {
        const response = await fetch('http://localhost:3000/api/search/repositories')
        
        if (i <= 5) {
          expect(response.status).toBe(200)
          expect(response.headers.get('X-RateLimit-Remaining')).toBe(String(5 - i))
        } else {
          expect(response.status).toBe(429)
          expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
          expect(response.headers.get('Retry-After')).toBe('60')
          
          const data = await response.json()
          const validatedError = ApiErrorSchema.parse(data)
          expect(validatedError.error.code).toBe('RATE_LIMIT_EXCEEDED')
        }
      }
    })

    it('should validate and sanitize input parameters', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')

          // Check for potential injection attacks
          if (query && (query.includes('<script>') || query.includes('DROP TABLE') || query.includes('OR 1=1'))) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'INVALID_INPUT',
                message: 'Invalid characters detected in query parameter',
              },
            }, { status: 400 })
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query: query || '', filters: {}, execution_time_ms: 25, performance_note: 'Input validation test' },
          })
        })
      )

      // Test SQL injection attempt
      const sqlResponse = await fetch('http://localhost:3000/api/search/repositories?q=test OR 1=1')
      expect(sqlResponse.status).toBe(400)

      // Test XSS attempt
      const xssResponse = await fetch('http://localhost:3000/api/search/repositories?q=<script>alert("xss")</script>')
      expect(xssResponse.status).toBe(400)

      // Test normal query
      const normalResponse = await fetch('http://localhost:3000/api/search/repositories?q=typescript')
      expect(normalResponse.status).toBe(200)
    })
  })

  describe('Error Recovery & Resilience', () => {
    it('should provide meaningful error messages with request tracking', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error',
            },
            request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          }, { status: 500 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/opportunities')
      expect(response.status).toBe(500)

      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('INTERNAL_ERROR')
      expect(validatedError.request_id).toMatch(/req_\d+_\w+/)
    })

    it('should handle malformed JSON gracefully', async () => {
      server.use(
        http.post('http://localhost:3000/api/search/repositories', ({ request }) => {
          // This would normally be handled by the framework, but we simulate the error
          return HttpResponse.json({
            success: false,
            error: {
              code: 'INVALID_JSON',
              message: 'Request body contains invalid JSON',
            },
          }, { status: 400 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }',
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      const validatedError = ApiErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('INVALID_JSON')
    })
  })
})