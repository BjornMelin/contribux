/**
 * MSW Search API Handlers
 * Enhanced comprehensive mocking for search endpoints with realistic data and scenarios
 */

import { HttpResponse, http } from 'msw'

// Base URLs
const BASE_URL = 'http://localhost:3000'

// Mock search data with realistic GitHub-style content
export const mockSearchData = {
  opportunities: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      repositoryId: '550e8400-e29b-41d4-a716-446655440000',
      issueNumber: 123,
      title: 'Add TypeScript support to configuration parser',
      description:
        'The configuration parser currently only supports JavaScript. Adding TypeScript support would improve type safety and developer experience.',
      url: 'https://github.com/test-org/config-parser/issues/123',
      metadata: {
        labels: ['good first issue', 'typescript', 'enhancement'],
        author: {
          login: 'maintainer-user',
          id: 98765,
          avatarUrl: 'https://avatars.githubusercontent.com/u/98765',
        },
        assignees: [],
        state: 'open' as const,
        locked: false,
        comments: 3,
        createdAt: '2024-06-01T10:00:00Z',
        updatedAt: '2024-06-15T14:30:00Z',
        difficulty: 'beginner' as const,
        estimatedHours: 4,
        skillsRequired: ['TypeScript', 'Node.js', 'Configuration Management'],
        mentorshipAvailable: true,
        goodFirstIssue: true,
        hacktoberfest: false,
        priority: 'medium' as const,
        complexity: 3,
        impactLevel: 'medium' as const,
        learningOpportunity: 8,
        communitySupport: true,
        documentationNeeded: true,
        testingRequired: true,
      },
      difficultyScore: 3,
      impactScore: 7,
      matchScore: 0.92,
      createdAt: '2024-06-01T10:00:00Z',
      updatedAt: '2024-06-15T14:30:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      repositoryId: '550e8400-e29b-41d4-a716-446655440001',
      issueNumber: 456,
      title: 'Implement dark mode toggle component',
      description:
        'Add a reusable dark mode toggle component with smooth animations and accessibility features.',
      url: 'https://github.com/test-org/ui-components/issues/456',
      metadata: {
        labels: ['ui', 'accessibility', 'react', 'intermediate'],
        author: {
          login: 'ui-designer',
          id: 54321,
          avatarUrl: 'https://avatars.githubusercontent.com/u/54321',
        },
        assignees: [],
        state: 'open' as const,
        locked: false,
        comments: 8,
        createdAt: '2024-05-20T16:45:00Z',
        updatedAt: '2024-06-20T09:15:00Z',
        difficulty: 'intermediate' as const,
        estimatedHours: 8,
        skillsRequired: ['React', 'CSS', 'Accessibility', 'JavaScript'],
        mentorshipAvailable: false,
        goodFirstIssue: false,
        hacktoberfest: true,
        priority: 'high' as const,
        complexity: 6,
        impactLevel: 'high' as const,
        learningOpportunity: 9,
        communitySupport: true,
        documentationNeeded: false,
        testingRequired: true,
      },
      difficultyScore: 6,
      impactScore: 8,
      matchScore: 0.88,
      createdAt: '2024-05-20T16:45:00Z',
      updatedAt: '2024-06-20T09:15:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      repositoryId: '550e8400-e29b-41d4-a716-446655440002',
      issueNumber: 789,
      title: 'Optimize database query performance',
      description:
        'Several database queries are running slowly in production. Need to add indexes and optimize query patterns.',
      url: 'https://github.com/test-org/backend-api/issues/789',
      metadata: {
        labels: ['performance', 'database', 'sql', 'advanced'],
        author: {
          login: 'backend-dev',
          id: 13579,
          avatarUrl: 'https://avatars.githubusercontent.com/u/13579',
        },
        assignees: [
          {
            login: 'senior-dev',
            id: 24680,
          },
        ],
        state: 'open' as const,
        locked: false,
        comments: 15,
        createdAt: '2024-04-15T08:30:00Z',
        updatedAt: '2024-06-25T11:20:00Z',
        difficulty: 'advanced' as const,
        estimatedHours: 16,
        skillsRequired: ['SQL', 'Database Optimization', 'Performance Analysis', 'PostgreSQL'],
        mentorshipAvailable: true,
        goodFirstIssue: false,
        hacktoberfest: false,
        priority: 'high' as const,
        complexity: 9,
        impactLevel: 'high' as const,
        learningOpportunity: 7,
        communitySupport: false,
        documentationNeeded: true,
        testingRequired: true,
      },
      difficultyScore: 9,
      impactScore: 9,
      matchScore: 0.76,
      createdAt: '2024-04-15T08:30:00Z',
      updatedAt: '2024-06-25T11:20:00Z',
    },
  ],

  repositories: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      github_id: 123456789,
      full_name: 'test-org/config-parser',
      name: 'config-parser',
      description: 'A flexible configuration file parser supporting multiple formats',
      language: 'JavaScript',
      topics: ['configuration', 'parser', 'json', 'yaml', 'toml'],
      stars_count: 1250,
      forks_count: 89,
      health_score: 88.5,
      activity_score: 92.0,
      first_time_contributor_friendly: true,
      has_good_first_issues: true,
      has_help_wanted: true,
      created_at: '2023-01-15T00:00:00Z',
      updated_at: '2024-06-20T15:30:00Z',
      relevance_score: 0.95,
      difficulty_assessment: 'beginner-friendly',
      maintenance_status: 'well-maintained',
      community_activity: 'active',
      documentation_quality: 'excellent',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      github_id: 987654321,
      full_name: 'test-org/ui-components',
      name: 'ui-components',
      description: 'Modern React UI component library with TypeScript and accessibility focus',
      language: 'TypeScript',
      topics: ['react', 'ui', 'components', 'typescript', 'accessibility'],
      stars_count: 2840,
      forks_count: 156,
      health_score: 95.2,
      activity_score: 88.7,
      first_time_contributor_friendly: true,
      has_good_first_issues: true,
      has_help_wanted: false,
      created_at: '2022-08-10T00:00:00Z',
      updated_at: '2024-06-25T12:00:00Z',
      relevance_score: 0.89,
      difficulty_assessment: 'intermediate',
      maintenance_status: 'actively-maintained',
      community_activity: 'very-active',
      documentation_quality: 'good',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      github_id: 456789123,
      full_name: 'test-org/backend-api',
      name: 'backend-api',
      description: 'High-performance REST API with GraphQL support and real-time features',
      language: 'Python',
      topics: ['api', 'python', 'graphql', 'fastapi', 'postgresql'],
      stars_count: 892,
      forks_count: 67,
      health_score: 82.1,
      activity_score: 76.3,
      first_time_contributor_friendly: false,
      has_good_first_issues: false,
      has_help_wanted: true,
      created_at: '2023-03-22T00:00:00Z',
      updated_at: '2024-06-18T09:45:00Z',
      relevance_score: 0.72,
      difficulty_assessment: 'advanced',
      maintenance_status: 'moderately-maintained',
      community_activity: 'moderate',
      documentation_quality: 'fair',
    },
  ],

  stats: {
    total: 157,
    beginnerFriendly: 42,
    withMentorship: 23,
    embeddingCoverage: 0.87,
    lastUpdated: '2024-07-01T12:00:00Z',
  },
}

// Helper to check authentication
const isAuthenticated = (request: Request): boolean => {
  const authHeader = request.headers.get('authorization')
  const sessionCookie = request.headers.get('cookie')

  return !!(
    authHeader?.includes('Bearer ') ||
    sessionCookie?.includes('next-auth.session-token') ||
    sessionCookie?.includes('authjs.session-token')
  )
}

// Helper to filter opportunities based on query parameters
const filterOpportunities = (
  opportunities: typeof mockSearchData.opportunities,
  searchParams: URLSearchParams
) => {
  let filtered = [...opportunities]

  const query = searchParams.get('q')
  if (query) {
    const queryLower = query.toLowerCase()
    filtered = filtered.filter(
      opp =>
        opp.title.toLowerCase().includes(queryLower) ||
        opp.description?.toLowerCase().includes(queryLower) ||
        opp.metadata?.labels?.some(label => label.toLowerCase().includes(queryLower)) ||
        opp.metadata?.skillsRequired?.some(skill => skill.toLowerCase().includes(queryLower))
    )
  }

  const difficulty = searchParams.get('difficulty')
  if (difficulty) {
    filtered = filtered.filter(opp => opp.metadata?.difficulty === difficulty)
  }

  const goodFirstIssue = searchParams.get('good_first_issue')
  if (goodFirstIssue === 'true') {
    filtered = filtered.filter(opp => opp.metadata?.goodFirstIssue === true)
  }

  const mentorship = searchParams.get('mentorship_available')
  if (mentorship === 'true') {
    filtered = filtered.filter(opp => opp.metadata?.mentorshipAvailable === true)
  }

  const hacktoberfest = searchParams.get('hacktoberfest')
  if (hacktoberfest === 'true') {
    filtered = filtered.filter(opp => opp.metadata?.hacktoberfest === true)
  }

  const labels = searchParams.get('labels')
  if (labels) {
    const labelList = labels.split(',')
    filtered = filtered.filter(opp =>
      labelList.some(label => opp.metadata?.labels?.includes(label))
    )
  }

  const skills = searchParams.get('skills_required')
  if (skills) {
    const skillList = skills.split(',')
    filtered = filtered.filter(opp =>
      skillList.some(skill => opp.metadata?.skillsRequired?.includes(skill))
    )
  }

  const minDifficulty = searchParams.get('min_difficulty_score')
  if (minDifficulty) {
    filtered = filtered.filter(opp => opp.difficultyScore >= Number(minDifficulty))
  }

  const maxDifficulty = searchParams.get('max_difficulty_score')
  if (maxDifficulty) {
    filtered = filtered.filter(opp => opp.difficultyScore <= Number(maxDifficulty))
  }

  const minImpact = searchParams.get('min_impact_score')
  if (minImpact) {
    filtered = filtered.filter(opp => opp.impactScore >= Number(minImpact))
  }

  const maxImpact = searchParams.get('max_impact_score')
  if (maxImpact) {
    filtered = filtered.filter(opp => opp.impactScore <= Number(maxImpact))
  }

  return filtered
}

// Helper to filter repositories
const filterRepositories = (
  repositories: typeof mockSearchData.repositories,
  searchParams: URLSearchParams
) => {
  let filtered = [...repositories]

  const query = searchParams.get('q')
  if (query) {
    const queryLower = query.toLowerCase()
    filtered = filtered.filter(
      repo =>
        repo.name.toLowerCase().includes(queryLower) ||
        repo.description?.toLowerCase().includes(queryLower) ||
        repo.language?.toLowerCase().includes(queryLower) ||
        repo.topics?.some(topic => topic.toLowerCase().includes(queryLower))
    )
  }

  const language = searchParams.get('language')
  if (language) {
    filtered = filtered.filter(repo => repo.language?.toLowerCase() === language.toLowerCase())
  }

  const firstTimeContributor = searchParams.get('first_time_contributor_friendly')
  if (firstTimeContributor === 'true') {
    filtered = filtered.filter(repo => repo.first_time_contributor_friendly === true)
  }

  const goodFirstIssues = searchParams.get('has_good_first_issues')
  if (goodFirstIssues === 'true') {
    filtered = filtered.filter(repo => repo.has_good_first_issues === true)
  }

  return filtered
}

// Helper to paginate results
const paginateResults = <T>(items: T[], page: number, perPage: number) => {
  const offset = (page - 1) * perPage
  const paginatedItems = items.slice(offset, offset + perPage)

  return {
    items: paginatedItems,
    pagination: {
      page,
      per_page: perPage,
      total: items.length,
      has_more: offset + paginatedItems.length < items.length,
    },
  }
}

// Search opportunities handlers
export const searchOpportunitiesHandlers = [
  // GET /api/search/opportunities
  http.get(`${BASE_URL}/api/search/opportunities`, ({ request }) => {
    const startTime = Date.now()

    // Check authentication
    if (!isAuthenticated(request)) {
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

    const url = new URL(request.url)
    const searchParams = url.searchParams

    // Handle performance testing scenarios first
    const performanceTest = searchParams.get('performance-test')
    if (performanceTest) {
      // Simulate different performance scenarios
      const delay = performanceTest === 'slow' ? 2000 : performanceTest === 'medium' ? 500 : 0

      return new Promise(resolve => {
        setTimeout(() => {
          const endTime = Date.now()
          resolve(
            HttpResponse.json({
              success: true,
              data: {
                opportunities: mockSearchData.opportunities,
                total_count: mockSearchData.opportunities.length,
                page: 1,
                per_page: 20,
                has_more: false,
              },
              metadata: {
                query: searchParams.get('q') || '',
                filters: {},
                execution_time_ms: endTime - startTime,
                performance_metrics: {
                  database_query_time: Math.floor(delay * 0.7),
                  embedding_search_time: Math.floor(delay * 0.2),
                  serialization_time: Math.floor(delay * 0.1),
                },
              },
            })
          )
        }, delay)
      })
    }

    // Handle special test scenarios
    const scenario = searchParams.get('scenario')
    switch (scenario) {
      case 'empty':
        return HttpResponse.json({
          success: true,
          data: {
            opportunities: [],
            total_count: 0,
            page: 1,
            per_page: 20,
            has_more: false,
          },
          metadata: {
            query: searchParams.get('q') || '',
            filters: {},
            execution_time_ms: Date.now() - startTime,
            stats: { ...mockSearchData.stats, total: 0 },
          },
        })

      case 'error':
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'SEARCH_ERROR',
              message: 'Search service temporarily unavailable',
            },
          },
          { status: 503 }
        )

      case 'timeout':
        return new Promise(() => {
          // Never resolve to simulate timeout
        })

      case 'slow':
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(
              HttpResponse.json({
                success: true,
                data: {
                  opportunities: mockSearchData.opportunities,
                  total_count: mockSearchData.opportunities.length,
                  page: 1,
                  per_page: 20,
                  has_more: false,
                },
                metadata: {
                  query: searchParams.get('q') || '',
                  filters: {},
                  execution_time_ms: 3000, // Simulate slow response
                  stats: mockSearchData.stats,
                },
              })
            )
          }, 3000)
        })
    }

    // Parse pagination parameters
    const page = Number(searchParams.get('page')) || 1
    const perPage = Math.min(Number(searchParams.get('per_page')) || 20, 100)

    // Apply filters
    const filteredOpportunities = filterOpportunities(mockSearchData.opportunities, searchParams)

    // Apply pagination
    const { items: paginatedOpportunities, pagination } = paginateResults(
      filteredOpportunities,
      page,
      perPage
    )

    // Build response
    const response = {
      success: true,
      data: {
        opportunities: paginatedOpportunities,
        total_count: pagination.total,
        page: pagination.page,
        per_page: pagination.per_page,
        has_more: pagination.has_more,
      },
      metadata: {
        query: searchParams.get('q') || '',
        filters: Object.fromEntries(searchParams.entries()),
        execution_time_ms: Date.now() - startTime,
        performance_note: 'Query optimized with Drizzle ORM and HNSW indexes',
        stats: mockSearchData.stats,
      },
    }

    return HttpResponse.json(response)
  }),
]

// Search repositories handlers
export const searchRepositoriesHandlers = [
  // GET /api/search/repositories
  http.get(`${BASE_URL}/api/search/repositories`, ({ request }) => {
    const startTime = Date.now()

    // Check authentication
    if (!isAuthenticated(request)) {
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

    const url = new URL(request.url)
    const searchParams = url.searchParams

    // Handle special test scenarios
    const scenario = searchParams.get('scenario')
    switch (scenario) {
      case 'empty':
        return HttpResponse.json({
          success: true,
          data: {
            repositories: [],
            total_count: 0,
            page: 1,
            per_page: 20,
            has_more: false,
          },
          metadata: {
            query: searchParams.get('q') || '',
            filters: {},
            execution_time_ms: Date.now() - startTime,
          },
        })

      case 'error':
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'REPOSITORY_SEARCH_ERROR',
              message: 'Repository search failed',
            },
          },
          { status: 500 }
        )
    }

    // Parse pagination parameters
    const page = Number(searchParams.get('page')) || 1
    const perPage = Math.min(Number(searchParams.get('per_page')) || 20, 100)

    // Apply filters
    const filteredRepositories = filterRepositories(mockSearchData.repositories, searchParams)

    // Apply pagination
    const { items: paginatedRepositories, pagination } = paginateResults(
      filteredRepositories,
      page,
      perPage
    )

    // Build response
    const response = {
      success: true,
      data: {
        repositories: paginatedRepositories,
        total_count: pagination.total,
        page: pagination.page,
        per_page: pagination.per_page,
        has_more: pagination.has_more,
      },
      metadata: {
        query: searchParams.get('q') || '',
        filters: Object.fromEntries(searchParams.entries()),
        execution_time_ms: Date.now() - startTime,
      },
    }

    return HttpResponse.json(response)
  }),
]

// Search error simulation handlers
export const searchErrorHandlers = [
  // GET /api/search/error - Error simulation endpoint
  http.get(`${BASE_URL}/api/search/error`, ({ request }) => {
    const url = new URL(request.url)
    const errorType = url.searchParams.get('type') || 'generic'

    switch (errorType) {
      case 'validation':
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PARAMETER',
              message: 'Query parameter is too long',
              details: [
                {
                  field: 'q',
                  message: 'Query must be less than 1000 characters',
                  value: 'very-long-query...',
                },
              ],
            },
          },
          { status: 400 }
        )

      case 'rate-limit':
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests',
            },
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': '100',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
            },
          }
        )

      case 'database':
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Database connection failed',
            },
            request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          },
          { status: 500 }
        )

      case 'timeout':
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'TIMEOUT',
              message: 'Request timed out',
            },
          },
          { status: 504 }
        )

      default:
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error',
            },
          },
          { status: 500 }
        )
    }
  }),
]

// Performance and monitoring handlers
export const searchPerformanceHandlers = [
  // GET /api/search/opportunities (with performance monitoring)
  http.get(`${BASE_URL}/api/search/opportunities`, ({ request }) => {
    const url = new URL(request.url)
    const performanceTest = url.searchParams.get('performance-test')

    if (performanceTest) {
      const startTime = Date.now()

      // Simulate different performance scenarios
      const delay = performanceTest === 'slow' ? 2000 : performanceTest === 'medium' ? 500 : 0

      return new Promise(resolve => {
        setTimeout(() => {
          const endTime = Date.now()
          resolve(
            HttpResponse.json({
              success: true,
              data: {
                opportunities: mockSearchData.opportunities,
                total_count: mockSearchData.opportunities.length,
                page: 1,
                per_page: 20,
                has_more: false,
              },
              metadata: {
                query: url.searchParams.get('q') || '',
                filters: {},
                execution_time_ms: endTime - startTime,
                performance_metrics: {
                  database_query_time: Math.floor(delay * 0.7),
                  embedding_search_time: Math.floor(delay * 0.2),
                  serialization_time: Math.floor(delay * 0.1),
                },
              },
            })
          )
        }, delay)
      })
    }

    // Let other handlers process the request
    return HttpResponse.passthrough()
  }),
]

// Combine all search handlers
export const searchHandlers = [
  ...searchOpportunitiesHandlers,
  ...searchRepositoriesHandlers,
  ...searchErrorHandlers,
  ...searchPerformanceHandlers,
]

// Export individual handler groups for targeted testing
export default searchHandlers
