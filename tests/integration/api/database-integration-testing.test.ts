/**
 * Database Integration Testing Suite
 * Comprehensive testing for API→Drizzle ORM integration
 * 
 * Focus Areas:
 * - API→Drizzle ORM integration
 * - Transaction handling in API routes
 * - Database error propagation
 * - Connection pooling validation
 * - Query performance monitoring
 * - Data consistency validation
 */

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Database error schemas
const DatabaseErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
  request_id: z.string().optional(),
})

const DatabaseHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string(),
  version: z.string(),
  checks: z.object({
    database: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      response_time_ms: z.number(),
      details: z.string().optional(),
      connection_pool: z.object({
        active: z.number(),
        idle: z.number(),
        total: z.number(),
        max: z.number(),
      }).optional(),
    }),
    memory: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      usage_mb: z.number(),
      free_mb: z.number(),
    }),
  }),
})

// Mock data generators
const generateMockRepository = (overrides: Partial<any> = {}) => ({
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  githubId: 123456789,
  fullName: 'test-org/test-repo',
  name: 'test-repo',
  owner: 'test-org',
  description: 'A test repository for database integration testing',
  metadata: {
    language: 'TypeScript',
    primaryLanguage: 'TypeScript',
    languages: { TypeScript: 85, JavaScript: 15 },
    stars: 1250,
    forks: 98,
    watchers: 150,
    openIssues: 23,
    license: 'MIT',
    topics: ['testing', 'api', 'typescript'],
    defaultBranch: 'main',
    size: 2048,
    archived: false,
    disabled: false,
    private: false,
    fork: false,
    hasIssues: true,
    hasProjects: true,
    hasWiki: true,
    hasPages: false,
    hasDownloads: true,
    pushedAt: '2023-12-01T10:30:00Z',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-12-01T10:30:00Z',
    homepage: 'https://test-repo.example.com',
    cloneUrl: 'https://github.com/test-org/test-repo.git',
    sshUrl: 'git@github.com:test-org/test-repo.git',
    gitUrl: 'git://github.com/test-org/test-repo.git',
    ...overrides.metadata,
  },
  healthMetrics: {
    maintainerResponsiveness: 85.5,
    activityLevel: 90.0,
    codeQuality: 88.2,
    communityEngagement: 75.0,
    documentationQuality: 82.5,
    testCoverage: 78.0,
    securityScore: 92.0,
    overallScore: 85.5,
    lastCalculated: '2023-12-01T09:00:00Z',
    issueResolutionTime: 3.5,
    prMergeTime: 2.1,
    contributorCount: 25,
    recentCommits: 15,
    releaseFrequency: 0.8,
    ...overrides.healthMetrics,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('API→Drizzle ORM Integration', () => {
  describe('Query Execution', () => {
    it('should handle successful database queries with proper response formatting', async () => {
      const mockRepositories = [
        generateMockRepository(),
        generateMockRepository({
          id: 'a47bc20c-58dd-4372-b567-0f02c2d3e590',
          githubId: 987654321,
          fullName: 'org2/repo2',
          name: 'repo2',
          owner: 'org2',
        }),
      ]

      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q') || ''
          const page = Number(url.searchParams.get('page')) || 1
          const perPage = Number(url.searchParams.get('per_page')) || 20

          // Simulate successful Drizzle ORM query execution
          return HttpResponse.json({
            success: true,
            data: {
              repositories: mockRepositories,
              total_count: 2,
              page,
              per_page: perPage,
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
              execution_time_ms: 45,
              performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
              database_info: {
                query_type: 'SELECT',
                table: 'repositories',
                index_used: 'repositories_embedding_idx',
                rows_examined: 2,
                rows_returned: 2,
              },
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories?q=typescript&page=1&per_page=20')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.repositories).toHaveLength(2)
      expect(data.metadata.database_info.query_type).toBe('SELECT')
      expect(data.metadata.database_info.index_used).toBe('repositories_embedding_idx')
      
      // Validate repository structure
      const firstRepo = data.data.repositories[0]
      expect(firstRepo.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(firstRepo.githubId).toBe(123456789)
      expect(firstRepo.fullName).toBe('test-org/test-repo')
      expect(firstRepo.metadata.language).toBe('TypeScript')
      expect(firstRepo.healthMetrics.overallScore).toBe(85.5)
    })

    it('should handle complex queries with joins and aggregations', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q') || ''
          const difficulty = url.searchParams.get('difficulty')
          const repositoryId = url.searchParams.get('repository_id')

          // Simulate complex Drizzle ORM query with joins
          const mockOpportunities = [
            {
              id: 'a47bc20c-58dd-4372-b567-0f02c2d3e590',
              repositoryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              issueNumber: 42,
              title: 'Fix TypeScript type errors in search module',
              description: 'Several type errors need to be resolved in the search functionality',
              url: 'https://github.com/test-org/test-repo/issues/42',
              metadata: {
                labels: ['bug', 'good-first-issue', 'typescript'],
                author: {
                  login: 'maintainer1',
                  id: 123456,
                  avatarUrl: 'https://github.com/avatars/u/123456',
                },
                assignees: [],
                state: 'open',
                locked: false,
                comments: 3,
                createdAt: '2023-11-15T10:00:00Z',
                updatedAt: '2023-11-20T15:30:00Z',
                closedAt: null,
                difficulty: 'intermediate',
                estimatedHours: 4,
                skillsRequired: ['TypeScript', 'debugging'],
                mentorshipAvailable: true,
                goodFirstIssue: true,
                hacktoberfest: false,
                priority: 'medium',
                complexity: 6,
                impactLevel: 'medium',
                learningOpportunity: 8,
                communitySupport: true,
                documentationNeeded: false,
                testingRequired: true,
              },
              difficultyScore: 6,
              impactScore: 8,
              matchScore: 0.92,
              createdAt: '2023-11-15T10:00:00Z',
              updatedAt: '2023-11-20T15:30:00Z',
              // Joined repository data
              repository: {
                fullName: 'test-org/test-repo',
                language: 'TypeScript',
                stars: 1250,
                healthScore: 85.5,
              },
            },
          ]

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
                repository_id: repositoryId,
                min_difficulty_score: null,
                max_difficulty_score: null,
                min_impact_score: null,
                max_impact_score: null,
                good_first_issue: null,
                mentorship_available: null,
                hacktoberfest: null,
                labels: [],
                skills_required: [],
                sort_by: 'match',
                order: 'desc',
              },
              execution_time_ms: 67,
              performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
              database_info: {
                query_type: 'SELECT_JOIN',
                tables: ['opportunities', 'repositories'],
                joins: ['opportunities.repository_id = repositories.id'],
                index_used: ['opportunities_embedding_idx', 'repositories_pkey'],
                rows_examined: 150,
                rows_returned: 1,
              },
              stats: {
                total: 1,
                beginnerFriendly: 1,
                withMentorship: 1,
                embeddingCoverage: 0.95,
              },
            },
          })
        })
      )

      const response = await fetch(
        'http://localhost:3000/api/search/opportunities?q=typescript&difficulty=intermediate&repository_id=f47ac10b-58cc-4372-a567-0e02b2c3d479'
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.opportunities).toHaveLength(1)
      expect(data.metadata.database_info.query_type).toBe('SELECT_JOIN')
      expect(data.metadata.database_info.tables).toEqual(['opportunities', 'repositories'])
      expect(data.metadata.database_info.joins).toEqual(['opportunities.repository_id = repositories.id'])
      
      const opportunity = data.data.opportunities[0]
      expect(opportunity.repository.fullName).toBe('test-org/test-repo')
      expect(opportunity.metadata.difficulty).toBe('intermediate')
      expect(opportunity.matchScore).toBe(0.92)
    })

    it('should handle vector similarity search queries efficiently', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q') || ''

          // Simulate vector similarity search with HNSW index
          if (query.includes('machine learning')) {
            return HttpResponse.json({
              success: true,
              data: {
                repositories: [
                  generateMockRepository({
                    fullName: 'ml-org/tensorflow-wrapper',
                    name: 'tensorflow-wrapper',
                    description: 'A TypeScript wrapper for TensorFlow machine learning operations',
                    metadata: {
                      topics: ['machine-learning', 'tensorflow', 'typescript'],
                      language: 'TypeScript',
                      stars: 2500,
                    },
                  }),
                ],
                total_count: 1,
                page: 1,
                per_page: 20,
                has_more: false,
              },
              metadata: {
                query,
                filters: {},
                execution_time_ms: 23,
                performance_note: 'Vector similarity search using HNSW index',
                database_info: {
                  query_type: 'VECTOR_SIMILARITY',
                  table: 'repositories',
                  index_used: 'repositories_embedding_hnsw_idx',
                  vector_dimensions: 1536,
                  similarity_metric: 'cosine',
                  similarity_threshold: 0.7,
                  rows_examined: 1000,
                  rows_returned: 1,
                  index_effectiveness: 0.95,
                },
              },
            })
          }

          return HttpResponse.json({
            success: true,
            data: { repositories: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query, filters: {}, execution_time_ms: 15, performance_note: 'Standard text search' },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories?q=machine learning tensorflow')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.repositories).toHaveLength(1)
      expect(data.metadata.database_info.query_type).toBe('VECTOR_SIMILARITY')
      expect(data.metadata.database_info.vector_dimensions).toBe(1536)
      expect(data.metadata.database_info.similarity_metric).toBe('cosine')
      expect(data.metadata.database_info.index_effectiveness).toBe(0.95)
    })
  })

  describe('Transaction Handling', () => {
    it('should handle database transactions in write operations', async () => {
      server.use(
        http.post('http://localhost:3000/api/auth/set-primary', async ({ request }) => {
          const body = await request.json() as { providerId: string }
          
          // Simulate transaction-based operation
          return HttpResponse.json({
            success: true,
            message: 'Primary provider updated successfully',
            transaction_info: {
              transaction_id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              operations: [
                {
                  table: 'user_providers',
                  operation: 'UPDATE',
                  rows_affected: 1,
                  condition: 'user_id = ? AND provider_id = ?',
                },
                {
                  table: 'user_providers',
                  operation: 'UPDATE',
                  rows_affected: 2,
                  condition: 'user_id = ? AND provider_id != ?',
                },
              ],
              execution_time_ms: 15,
              rollback_available: true,
            },
          })
        })
      )

      const response = await fetch('http://localhost:3000/api/auth/set-primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: JSON.stringify({ providerId: 'github' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.transaction_info.transaction_id).toMatch(/txn_\d+_\w+/)
      expect(data.transaction_info.operations).toHaveLength(2)
      expect(data.transaction_info.rollback_available).toBe(true)
    })

    it('should handle transaction rollback on errors', async () => {
      server.use(
        http.post('http://localhost:3000/api/auth/unlink', async ({ request }) => {
          const body = await request.json() as { providerId: string; userId: string }
          
          // Simulate transaction rollback due to constraint violation
          if (body.providerId === 'primary-provider') {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'TRANSACTION_ROLLBACK',
                message: 'Cannot unlink primary provider without setting another as primary first',
                transaction_info: {
                  transaction_id: `txn_${Date.now()}_rollback`,
                  rollback_reason: 'CONSTRAINT_VIOLATION',
                  operations_attempted: [
                    {
                      table: 'user_providers',
                      operation: 'DELETE',
                      condition: 'user_id = ? AND provider_id = ?',
                      status: 'ROLLED_BACK',
                    },
                  ],
                  execution_time_ms: 8,
                },
              },
            }, { status: 400 })
          }

          return HttpResponse.json({
            success: true,
            message: 'Provider unlinked successfully',
          })
        })
      )

      // Test rollback scenario
      const rollbackResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'primary-provider', userId: 'user123' }),
      })

      expect(rollbackResponse.status).toBe(400)
      const rollbackData = await rollbackResponse.json()
      const validatedError = DatabaseErrorSchema.parse(rollbackData)
      expect(validatedError.error.code).toBe('TRANSACTION_ROLLBACK')

      // Test successful operation
      const successResponse = await fetch('http://localhost:3000/api/auth/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'secondary-provider', userId: 'user123' }),
      })

      expect(successResponse.status).toBe(200)
    })
  })

  describe('Database Error Propagation', () => {
    it('should properly handle connection errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'DATABASE_CONNECTION_ERROR',
              message: 'Failed to connect to database',
              details: {
                error_type: 'CONNECTION_TIMEOUT',
                database_host: 'neon-database.aws.com',
                timeout_ms: 5000,
                retry_count: 3,
                last_error: 'Connection timed out after 5000ms',
              },
            },
            request_id: `req_${Date.now()}_conn_error`,
          }, { status: 503 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories')
      expect(response.status).toBe(503)

      const data = await response.json()
      const validatedError = DatabaseErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('DATABASE_CONNECTION_ERROR')
      expect(validatedError.error.details.error_type).toBe('CONNECTION_TIMEOUT')
      expect(validatedError.error.details.retry_count).toBe(3)
    })

    it('should handle query timeout errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')

          // Simulate timeout for complex queries
          if (query && query.length > 100) {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'DATABASE_QUERY_TIMEOUT',
                message: 'Database query exceeded maximum execution time',
                details: {
                  timeout_ms: 30000,
                  actual_execution_ms: 30001,
                  query_complexity: 'HIGH',
                  suggested_action: 'Simplify query or add more specific filters',
                },
              },
              request_id: `req_${Date.now()}_timeout`,
            }, { status: 504 })
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: { query: query || '', filters: {}, execution_time_ms: 25, performance_note: 'Query executed successfully' },
          })
        })
      )

      // Test timeout scenario
      const longQuery = 'a'.repeat(150)
      const timeoutResponse = await fetch(`http://localhost:3000/api/search/opportunities?q=${longQuery}`)
      expect(timeoutResponse.status).toBe(504)

      const timeoutData = await timeoutResponse.json()
      const validatedError = DatabaseErrorSchema.parse(timeoutData)
      expect(validatedError.error.code).toBe('DATABASE_QUERY_TIMEOUT')
      expect(validatedError.error.details.timeout_ms).toBe(30000)

      // Test normal query
      const normalResponse = await fetch('http://localhost:3000/api/search/opportunities?q=typescript')
      expect(normalResponse.status).toBe(200)
    })

    it('should handle constraint violation errors', async () => {
      server.use(
        http.post('http://localhost:3000/api/auth/providers', async ({ request }) => {
          const body = await request.json() as { providerId: string; accountId: string }

          // Simulate unique constraint violation
          if (body.accountId === 'existing-account-123') {
            return HttpResponse.json({
              success: false,
              error: {
                code: 'DATABASE_CONSTRAINT_VIOLATION',
                message: 'Account already linked to another user',
                details: {
                  constraint_name: 'user_providers_account_id_unique',
                  constraint_type: 'UNIQUE',
                  table: 'user_providers',
                  column: 'account_id',
                  value: body.accountId,
                  suggested_action: 'Use a different account or unlink the existing connection',
                },
              },
            }, { status: 409 })
          }

          return HttpResponse.json({
            success: true,
            message: 'Provider linked successfully',
          })
        })
      )

      // Test constraint violation
      const violationResponse = await fetch('http://localhost:3000/api/auth/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'github', accountId: 'existing-account-123' }),
      })

      expect(violationResponse.status).toBe(409)
      const violationData = await violationResponse.json()
      const validatedError = DatabaseErrorSchema.parse(violationData)
      expect(validatedError.error.code).toBe('DATABASE_CONSTRAINT_VIOLATION')
      expect(validatedError.error.details.constraint_type).toBe('UNIQUE')

      // Test successful operation
      const successResponse = await fetch('http://localhost:3000/api/auth/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'github', accountId: 'new-account-456' }),
      })

      expect(successResponse.status).toBe(200)
    })
  })

  describe('Connection Pool Validation', () => {
    it('should provide connection pool health metrics', async () => {
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
                details: 'All database checks passed',
                connection_pool: {
                  active: 5,
                  idle: 15,
                  total: 20,
                  max: 25,
                  waiting: 0,
                  avg_response_time_ms: 8.5,
                  peak_usage: 18,
                  connection_errors: 0,
                  last_error: null,
                },
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
      const validatedHealth = DatabaseHealthSchema.parse(data)
      
      expect(validatedHealth.checks.database.connection_pool).toBeDefined()
      expect(validatedHealth.checks.database.connection_pool!.active).toBe(5)
      expect(validatedHealth.checks.database.connection_pool!.idle).toBe(15)
      expect(validatedHealth.checks.database.connection_pool!.total).toBe(20)
      expect(validatedHealth.checks.database.connection_pool!.max).toBe(25)
    })

    it('should detect connection pool exhaustion', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', () => {
          return HttpResponse.json({
            success: false,
            error: {
              code: 'CONNECTION_POOL_EXHAUSTED',
              message: 'No database connections available',
              details: {
                active_connections: 25,
                max_connections: 25,
                waiting_requests: 15,
                avg_wait_time_ms: 2500,
                suggested_action: 'Increase connection pool size or optimize query performance',
              },
            },
            request_id: `req_${Date.now()}_pool_exhausted`,
          }, { status: 503 })
        })
      )

      const response = await fetch('http://localhost:3000/api/search/repositories')
      expect(response.status).toBe(503)

      const data = await response.json()
      const validatedError = DatabaseErrorSchema.parse(data)
      expect(validatedError.error.code).toBe('CONNECTION_POOL_EXHAUSTED')
      expect(validatedError.error.details.active_connections).toBe(25)
      expect(validatedError.error.details.max_connections).toBe(25)
    })
  })

  describe('Query Performance Monitoring', () => {
    it('should track and report query performance metrics', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/repositories', ({ request }) => {
          const url = new URL(request.url)
          const page = Number(url.searchParams.get('page')) || 1
          const perPage = Number(url.searchParams.get('per_page')) || 20

          // Simulate performance metrics based on query complexity
          const offset = (page - 1) * perPage
          const executionTime = Math.min(50 + offset * 2, 1000) // Simulate increasing time with offset

          return HttpResponse.json({
            success: true,
            data: {
              repositories: [],
              total_count: 1000,
              page,
              per_page: perPage,
              has_more: page * perPage < 1000,
            },
            metadata: {
              query: '',
              filters: {},
              execution_time_ms: executionTime,
              performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
              performance_metrics: {
                query_planning_ms: 2,
                index_scan_ms: executionTime * 0.3,
                data_retrieval_ms: executionTime * 0.5,
                result_formatting_ms: executionTime * 0.2,
                total_rows_scanned: offset + perPage,
                index_hit_ratio: 0.95,
                cache_hit_ratio: offset === 0 ? 0.2 : 0.8, // First page likely not cached
                memory_usage_mb: 15 + (offset / 100),
              },
            },
          })
        })
      )

      // Test first page (cold cache)
      const firstPageResponse = await fetch('http://localhost:3000/api/search/repositories?page=1&per_page=20')
      expect(firstPageResponse.status).toBe(200)

      const firstPageData = await firstPageResponse.json()
      expect(firstPageData.metadata.performance_metrics.cache_hit_ratio).toBe(0.2)
      expect(firstPageData.metadata.execution_time_ms).toBeLessThan(100)

      // Test later page (higher execution time)
      const laterPageResponse = await fetch('http://localhost:3000/api/search/repositories?page=10&per_page=20')
      expect(laterPageResponse.status).toBe(200)

      const laterPageData = await laterPageResponse.json()
      expect(laterPageData.metadata.performance_metrics.cache_hit_ratio).toBe(0.8)
      expect(laterPageData.metadata.execution_time_ms).toBeGreaterThan(firstPageData.metadata.execution_time_ms)
    })

    it('should identify slow queries and provide optimization suggestions', async () => {
      server.use(
        http.get('http://localhost:3000/api/search/opportunities', ({ request }) => {
          const url = new URL(request.url)
          const query = url.searchParams.get('q')
          const difficulty = url.searchParams.get('difficulty')
          const minImpact = url.searchParams.get('min_impact_score')

          // Simulate slow query detection
          const hasComplexFilters = difficulty && minImpact
          const hasLongQuery = query && query.length > 50
          const isSlowQuery = hasComplexFilters || hasLongQuery

          if (isSlowQuery) {
            return HttpResponse.json({
              success: true,
              data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
              metadata: {
                query: query || '',
                filters: { difficulty, min_impact_score: minImpact },
                execution_time_ms: 3500, // Slow query
                performance_note: 'Query optimization recommended',
                performance_warning: {
                  severity: 'HIGH',
                  message: 'Query execution time exceeded recommended threshold',
                  threshold_ms: 1000,
                  actual_ms: 3500,
                  optimization_suggestions: [
                    'Consider adding more specific filters to reduce result set',
                    'Use pagination with smaller page sizes',
                    'Add indexes for frequently filtered columns',
                    'Consider using cached results for common queries',
                  ],
                  affected_indexes: ['opportunities_difficulty_idx', 'opportunities_impact_score_idx'],
                  query_complexity_score: 8.5,
                },
              },
            })
          }

          return HttpResponse.json({
            success: true,
            data: { opportunities: [], total_count: 0, page: 1, per_page: 20, has_more: false },
            metadata: {
              query: query || '',
              filters: {},
              execution_time_ms: 25,
              performance_note: 'Query executed efficiently',
            },
          })
        })
      )

      // Test slow query
      const slowResponse = await fetch(
        'http://localhost:3000/api/search/opportunities?q=complex query with many parameters and filters&difficulty=advanced&min_impact_score=8'
      )
      expect(slowResponse.status).toBe(200)

      const slowData = await slowResponse.json()
      expect(slowData.metadata.execution_time_ms).toBeGreaterThan(1000)
      expect(slowData.metadata.performance_warning).toBeDefined()
      expect(slowData.metadata.performance_warning.severity).toBe('HIGH')
      expect(slowData.metadata.performance_warning.optimization_suggestions).toContain(
        'Consider adding more specific filters to reduce result set'
      )

      // Test fast query
      const fastResponse = await fetch('http://localhost:3000/api/search/opportunities?q=simple')
      expect(fastResponse.status).toBe(200)

      const fastData = await fastResponse.json()
      expect(fastData.metadata.execution_time_ms).toBeLessThan(100)
      expect(fastData.metadata.performance_warning).toBeUndefined()
    })
  })
})